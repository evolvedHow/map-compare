import * as turf from '@turf/turf';
import type { DistrictMetrics } from '../types';

export interface DistrictCompactness {
  districtId: string;
  polsbyPopper: number;   // 0–1, higher = more compact
  convexHullRatio: number; // 0–1, higher = less irregular
}

export interface SeatVotePoint {
  voteShare: number; // 0–100 Dem vote share
  seatShare: number; // 0–100 Dem seat share
}

// ── Per-district scores ──────────────────────────────────────────────────────

export function polsbyPopper(feature: GeoJSON.Feature): number {
  try {
    const area = turf.area(feature) / 1e6; // m² → km²
    const line = turf.polygonToLine(
      feature as turf.Feature<turf.Polygon | turf.MultiPolygon>
    );
    const perimeter = turf.length(
      line as turf.Feature<turf.LineString | turf.MultiLineString>,
      { units: 'kilometers' }
    );
    if (perimeter <= 0) return 0;
    return (4 * Math.PI * area) / (perimeter * perimeter);
  } catch {
    return 0;
  }
}

export function convexHullRatio(feature: GeoJSON.Feature): number {
  try {
    const fc = turf.featureCollection([
      feature as turf.Feature<turf.Polygon | turf.MultiPolygon>
    ]);
    const hull = turf.convex(fc);
    if (!hull) return 1;
    const featureArea = turf.area(feature);
    const hullArea = turf.area(hull);
    return hullArea > 0 ? featureArea / hullArea : 0;
  } catch {
    return 0;
  }
}

// ── Plan-level aggregation ───────────────────────────────────────────────────

export function computeCompactness(fc: GeoJSON.FeatureCollection): Map<string, DistrictCompactness> {
  const result = new Map<string, DistrictCompactness>();
  fc.features.forEach((feat, i) => {
    const p = feat.properties ?? {};
    const id = String(
      p.district ?? p.DISTRICT ?? p.DISTRICTID ?? p.NAME ?? p.name ?? i + 1
    );
    result.set(id, {
      districtId: id,
      polsbyPopper: polsbyPopper(feat),
      convexHullRatio: convexHullRatio(feat)
    });
  });
  return result;
}

export function avgScore(
  compactness: Map<string, DistrictCompactness>,
  key: 'polsbyPopper' | 'convexHullRatio'
): number {
  const vals = [...compactness.values()]
    .map(c => c[key])
    .filter(v => v > 0);
  return vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length : 0;
}

// ── County splits (async — fetches county.geojson) ──────────────────────────

let _countyCache: GeoJSON.FeatureCollection | null = null;

export async function countySplitsCount(
  districts: GeoJSON.FeatureCollection,
  countyUrl: string
): Promise<number> {
  if (!_countyCache) {
    const resp = await fetch(countyUrl);
    _countyCache = await resp.json() as GeoJSON.FeatureCollection;
  }
  const counties = _countyCache;

  // Pre-compute district bboxes for fast prefiltering
  const distBboxes = districts.features.map(d => turf.bbox(d));

  let splitCount = 0;
  for (const county of counties.features) {
    const countyBbox = turf.bbox(county);
    let hitsInCounty = 0;
    for (let di = 0; di < districts.features.length; di++) {
      const db = distBboxes[di];
      // Bounding box rejection
      if (countyBbox[0] > db[2] || countyBbox[2] < db[0] ||
          countyBbox[1] > db[3] || countyBbox[3] < db[1]) continue;
      try {
        if (turf.booleanIntersects(
          county as turf.Feature,
          districts.features[di] as turf.Feature
        )) {
          hitsInCounty++;
          if (hitsInCounty > 1) { splitCount++; break; }
        }
      } catch { continue; }
    }
  }
  return splitCount;
}

// ── Partisan analysis ────────────────────────────────────────────────────────

export function seatVotesCurve(metrics: DistrictMetrics[]): SeatVotePoint[] {
  if (metrics.length === 0) return [];
  const n = metrics.length;
  const leans = metrics.map(m => m.partisanLean); // 0–100
  const avgLean = leans.reduce((s, l) => s + l, 0) / n;

  const points: SeatVotePoint[] = [];
  for (let shift = -25; shift <= 25; shift += 0.5) {
    const voteShare = avgLean + shift;
    if (voteShare < 25 || voteShare > 75) continue;
    const demSeats = leans.filter(l => l + shift > 50).length;
    points.push({ voteShare, seatShare: (demSeats / n) * 100 });
  }
  return points;
}

// At 50% uniform vote share, how many seats does each party win?
// Positive = Dem advantage (in percentage points above 50%)
export function partisanBias(metrics: DistrictMetrics[]): number {
  if (metrics.length === 0) return 0;
  const n = metrics.length;
  const leans = metrics.map(m => m.partisanLean);
  const avgLean = leans.reduce((s, l) => s + l, 0) / n;
  const shift = 50 - avgLean;
  const demSeats = leans.filter(l => l + shift > 50).length;
  return (demSeats / n) * 100 - 50;
}
