/**
 * Browser-side population displacement metric.
 *
 * Two methods are provided; choose based on plan size:
 *
 *   area_weighted  — polygon intersection via Turf.js. Accurate; O(n²) with
 *                    bbox prefiltering. Use for Congress (≤14 districts) or
 *                    any plan where accuracy matters most.
 *
 *   centroid       — Plan A centroid located within Plan B. Fast; treats each
 *                    district as wholly changed or unchanged. Suitable for
 *                    House/Senate when a quick first-pass is acceptable.
 *
 * Server-side (accurate, geopandas): fdp/fdp/analysis/displacement.py
 * CDM schema: fdp/config/schema/displacement.yml
 */

import * as turf from '@turf/turf';
import type { DisplacementMetrics, DistrictDisplacement } from '../types/cdm';

const _DISTRICT_PROPS = ['DISTRICT', 'district', 'DISTRICTID', 'District', 'NAME', 'name'];
const _POP_PROPS      = ['TOTPOP', 'pop', 'POP', 'POPULATION', 'total_pop'];

function districtId(feature: GeoJSON.Feature, fallback: number): string {
  const p = feature.properties ?? {};
  for (const k of _DISTRICT_PROPS) {
    if (p[k] != null) return String(p[k]);
  }
  return String(fallback);
}

function population(feature: GeoJSON.Feature, popProp?: string): number {
  const p = feature.properties ?? {};
  if (popProp) return Number(p[popProp] ?? 0);
  for (const k of _POP_PROPS) {
    if (p[k] != null) return Number(p[k]);
  }
  return 0;
}

function bboxOverlap(a: number[], b: number[]): boolean {
  // [minX, minY, maxX, maxY]
  return a[0] <= b[2] && a[2] >= b[0] && a[1] <= b[3] && a[3] >= b[1];
}

// ---------------------------------------------------------------------------
// Area-weighted method (accurate)
// ---------------------------------------------------------------------------

export function computeDisplacementAreaWeighted(
  planA: GeoJSON.FeatureCollection,
  planB: GeoJSON.FeatureCollection,
  planAId = 'plan_a',
  planBId = 'plan_b',
): { summary: DisplacementMetrics; districts: DistrictDisplacement[] } {
  const districts: DistrictDisplacement[] = [];
  let totalPop = 0;
  let totalDisplaced = 0;

  // Pre-compute Plan B bboxes and areas
  const bboxB = planB.features.map(f => turf.bbox(f));

  for (let i = 0; i < planA.features.length; i++) {
    const featA = planA.features[i];
    if (!featA.geometry) continue;

    const idA = districtId(featA, i + 1);
    const popA = population(featA);
    totalPop += popA;

    let areaA = 0;
    try { areaA = turf.area(featA as turf.Feature<turf.Polygon | turf.MultiPolygon>); }
    catch { continue; }
    if (areaA === 0) continue;

    const bboxA = turf.bbox(featA);
    const overlaps: { idB: string; area: number }[] = [];

    for (let j = 0; j < planB.features.length; j++) {
      if (!bboxOverlap(bboxA, bboxB[j])) continue;
      const featB = planB.features[j];
      if (!featB.geometry) continue;
      try {
        const inter = turf.intersect(
          turf.featureCollection([
            featA as turf.Feature<turf.Polygon | turf.MultiPolygon>,
            featB as turf.Feature<turf.Polygon | turf.MultiPolygon>,
          ])
        );
        if (inter) {
          const area = turf.area(inter);
          if (area > 0) overlaps.push({ idB: districtId(featB, j + 1), area });
        }
      } catch { continue; }
    }

    if (overlaps.length === 0) continue;

    overlaps.sort((a, b) => b.area - a.area);
    const dominantArea = overlaps[0].area;
    const displacedArea = Math.max(0, areaA - dominantArea);
    const displacedPop  = popA > 0 ? Math.round(popA * displacedArea / areaA) : 0;
    totalDisplaced += displacedPop;

    districts.push({
      districtIdA: idA,
      districtIdB: overlaps[0].idB,
      popA,
      displacedFromA: displacedPop,
      displacedPct: popA > 0 ? displacedPop / popA : 0,
    });
  }

  return _buildSummary(planAId, planBId, totalPop, totalDisplaced, planA, districts, 'area_weighted');
}

// ---------------------------------------------------------------------------
// Centroid method (fast)
// ---------------------------------------------------------------------------

export function computeDisplacementCentroid(
  planA: GeoJSON.FeatureCollection,
  planB: GeoJSON.FeatureCollection,
  planAId = 'plan_a',
  planBId = 'plan_b',
): { summary: DisplacementMetrics; districts: DistrictDisplacement[] } {
  const districts: DistrictDisplacement[] = [];
  let totalPop = 0;
  let totalDisplaced = 0;

  for (let i = 0; i < planA.features.length; i++) {
    const featA = planA.features[i];
    if (!featA.geometry) continue;

    const idA   = districtId(featA, i + 1);
    const popA  = population(featA);
    totalPop += popA;

    let centroid: turf.Feature<turf.Point>;
    try { centroid = turf.centroid(featA); }
    catch { continue; }

    // Find which Plan B district contains this centroid
    let containingB: string | null = null;
    for (let j = 0; j < planB.features.length; j++) {
      const featB = planB.features[j];
      if (!featB.geometry) continue;
      try {
        if (turf.booleanPointInPolygon(centroid, featB as turf.Feature<turf.Polygon | turf.MultiPolygon>)) {
          containingB = districtId(featB, j + 1);
          break;
        }
      } catch { continue; }
    }

    // Displaced = centroid fell outside same-numbered B district
    const sameDistrict = containingB === idA;
    const displacedPop = sameDistrict ? 0 : popA;
    totalDisplaced += displacedPop;

    districts.push({
      districtIdA: idA,
      districtIdB: containingB ?? 'unknown',
      popA,
      displacedFromA: displacedPop,
      displacedPct: sameDistrict ? 0 : 1,
    });
  }

  return _buildSummary(planAId, planBId, totalPop, totalDisplaced, planA, districts, 'centroid');
}

// ---------------------------------------------------------------------------
// Auto-select method and shared summary builder
// ---------------------------------------------------------------------------

/**
 * Compute displacement, automatically choosing the method based on plan size.
 * ≤20 districts → area_weighted; >20 → centroid (with option to override).
 */
export function computeDisplacement(
  planA: GeoJSON.FeatureCollection,
  planB: GeoJSON.FeatureCollection,
  planAId = 'plan_a',
  planBId = 'plan_b',
  forceMethod?: 'area_weighted' | 'centroid',
): { summary: DisplacementMetrics; districts: DistrictDisplacement[] } {
  const method = forceMethod ?? (planA.features.length <= 20 ? 'area_weighted' : 'centroid');
  return method === 'area_weighted'
    ? computeDisplacementAreaWeighted(planA, planB, planAId, planBId)
    : computeDisplacementCentroid(planA, planB, planAId, planBId);
}

function _buildSummary(
  planAId: string,
  planBId: string,
  totalPop: number,
  totalDisplaced: number,
  planA: GeoJSON.FeatureCollection,
  districts: DistrictDisplacement[],
  method: 'area_weighted' | 'centroid',
): { summary: DisplacementMetrics; districts: DistrictDisplacement[] } {
  // Minimum required: over-ideal population in Plan A must be redistributed
  const idealPop = planA.features.length > 0 ? totalPop / planA.features.length : 0;
  let minRequired = 0;
  for (const f of planA.features) {
    const pop = population(f);
    if (pop > idealPop) minRequired += (pop - idealPop);
  }
  minRequired = Math.round(minRequired);

  const excess = Math.max(0, totalDisplaced - minRequired);

  const summary: DisplacementMetrics = {
    planAId,
    planBId,
    totalPop,
    displacedPop: totalDisplaced,
    displacedPct: totalPop > 0 ? totalDisplaced / totalPop : 0,
    minRequiredDisplacedPop: minRequired,
    minRequiredDisplacedPct: totalPop > 0 ? minRequired / totalPop : 0,
    excessDisplacedPop: excess,
    excessDisplacedPct: totalPop > 0 ? excess / totalPop : 0,
    districtCount: planA.features.length,
    method,
  };

  return { summary, districts };
}

// ---------------------------------------------------------------------------
// Format helpers
// ---------------------------------------------------------------------------

export function fmtPop(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(2) + 'M';
  if (n >= 1_000)     return (n / 1_000).toFixed(0) + 'K';
  return n.toLocaleString();
}

export function fmtPct(pct: number, decimals = 1): string {
  return (pct * 100).toFixed(decimals) + '%';
}
