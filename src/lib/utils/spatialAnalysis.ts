import * as turf from '@turf/turf';
import type { CrosswalkRow, DistrictMetrics } from '../types';

export function spatialJoin(
  districts: GeoJSON.FeatureCollection,
  rows: CrosswalkRow[]
): Map<string, DistrictMetrics> {
  const result = new Map<string, DistrictMetrics>();

  // Initialize all districts with zero metrics
  districts.features.forEach((feature, i) => {
    const id = districtId(feature, i);
    result.set(id, zeroMetrics(id));
  });

  // Assign each crosswalk row to whichever district contains its centroid
  for (const row of rows) {
    if (!isFinite(row.lat) || !isFinite(row.lon)) continue;
    const pt = turf.point([row.lon, row.lat]);

    for (let i = 0; i < districts.features.length; i++) {
      const feature = districts.features[i];
      if (!feature.geometry) continue;

      let inside = false;
      try {
        inside = turf.booleanPointInPolygon(
          pt,
          feature as turf.Feature<turf.Polygon | turf.MultiPolygon>
        );
      } catch {
        continue;
      }

      if (inside) {
        const id = districtId(feature, i);
        const m = result.get(id)!;
        m.totalPop += row.total_pop || 0;
        m.vap += row.vap || 0;
        m.blackVap += row.black_vap || 0;
        m.hispanicVap += row.hispanic_vap || 0;
        m.asianVap += row.asian_vap || 0;
        m.demVotes += row.dem_votes || 0;
        m.repVotes += row.rep_votes || 0;
        break;
      }
    }
  }

  // Compute derived percentages
  result.forEach(m => {
    const totalVap = m.vap || 1;
    const minVap = m.blackVap + m.hispanicVap + m.asianVap;
    m.minorityVapPct = (minVap / totalVap) * 100;

    const totalVotes = m.demVotes + m.repVotes;
    m.partisanLean = totalVotes > 0 ? (m.demVotes / totalVotes) * 100 : 50;
  });

  return result;
}

/**
 * Build deltas using centroid-based spatial matching.
 *
 * Phase 1: match same-numbered districts whose centroids are within 20 km
 *          (handles the common case where numbering is stable).
 * Phase 2: greedily match remaining A districts to the nearest unmatched B
 *          district (handles plans where some districts were renumbered).
 *
 * This avoids the nonsensical deltas produced by the naive ID-match approach
 * when a redistricting cycle renumbers even a handful of districts.
 */
export function buildDeltas(
  fcA: GeoJSON.FeatureCollection,
  metricsA: Map<string, DistrictMetrics>,
  fcB: GeoJSON.FeatureCollection,
  metricsB: Map<string, DistrictMetrics>
): DistrictDelta[] {
  // Build centroid lists
  const cA: { id: string; lng: number; lat: number }[] = fcA.features.map((f, i) => {
    const c = turf.centroid(f).geometry.coordinates;
    return { id: districtId(f, i), lng: c[0], lat: c[1] };
  });
  const cB: { id: string; lng: number; lat: number }[] = fcB.features.map((f, i) => {
    const c = turf.centroid(f).geometry.coordinates;
    return { id: districtId(f, i), lng: c[0], lat: c[1] };
  });

  // Fast Euclidean squared-distance in degree space (good enough for matching)
  function distSq(a: { lng: number; lat: number }, b: { lng: number; lat: number }) {
    const dlng = (a.lng - b.lng) * Math.cos((a.lat + b.lat) * Math.PI / 360);
    const dlat = a.lat - b.lat;
    return dlng * dlng + dlat * dlat; // degrees²; 1° ≈ 111 km → 0.18° ≈ 20 km
  }
  const MATCH_THRESHOLD_SQ = (20 / 111) * (20 / 111); // 20 km in degree²

  const matchedB = new Set<string>();
  const pairs: [string, string][] = [];

  // Phase 1: same-number matches within threshold
  const cBById = new Map(cB.map(c => [c.id, c]));
  for (const a of cA) {
    const b = cBById.get(a.id);
    if (b && distSq(a, b) < MATCH_THRESHOLD_SQ) {
      pairs.push([a.id, b.id]);
      matchedB.add(b.id);
    }
  }
  const matchedA = new Set(pairs.map(([id]) => id));

  // Phase 2: greedy nearest-neighbour for remaining A districts
  const unclaimedB = cB.filter(c => !matchedB.has(c.id));
  for (const a of cA) {
    if (matchedA.has(a.id)) continue;
    if (unclaimedB.length === 0) break;
    let bestIdx = 0;
    let bestDist = distSq(a, unclaimedB[0]);
    for (let j = 1; j < unclaimedB.length; j++) {
      const d = distSq(a, unclaimedB[j]);
      if (d < bestDist) { bestDist = d; bestIdx = j; }
    }
    const chosen = unclaimedB[bestIdx];
    pairs.push([a.id, chosen.id]);
    unclaimedB.splice(bestIdx, 1);
  }

  return pairs.map(([idA, idB]) => {
    const a = metricsA.get(idA) ?? zeroMetrics(idA);
    const b = metricsB.get(idB) ?? zeroMetrics(idA);
    const deltaMinorityVapPct = b.minorityVapPct - a.minorityVapPct;
    return {
      districtId: idA,
      matchedBId: idB,
      isRenumbered: idA !== idB,
      a,
      b,
      deltaPop: b.totalPop - a.totalPop,
      deltaVap: b.vap - a.vap,
      deltaMinorityVapPct,
      deltaPartisanLean: b.partisanLean - a.partisanLean,
      minorityFlagged: Math.abs(deltaMinorityVapPct) > 5
    };
  });
}

export function metricsFromGeoJsonProperties(
  fc: GeoJSON.FeatureCollection
): Map<string, DistrictMetrics> {
  const result = new Map<string, DistrictMetrics>();

  fc.features.forEach((feature, i) => {
    const p = feature.properties ?? {};
    const id = String(
      p.district ?? p.DISTRICT ?? p.DISTRICTID ?? p.District ??
      p.NAME ?? p.name ?? i + 1
    );

    const pop = Number(p.pop ?? p.TOTPOP ?? 0);
    const tvap = Number(p.tvap ?? p.VAP ?? pop * 0.75);
    const partisan = Number(p.partisan ?? 0.5);

    let blackVap: number, asianVap: number, hispanicVap: number, minorityVapPct: number;

    if (p.bvap !== undefined) {
      // Senate/House format: absolute VAP counts
      blackVap = Number(p.bvap ?? 0);
      asianVap = Number(p.avap ?? 0);
      hispanicVap = Number(p.hvap ?? 0);
      const bipocVap = Number(p.bipoc_vap ?? blackVap + asianVap + hispanicVap);
      minorityVapPct = tvap > 0 ? (bipocVap / tvap) * 100 : 0;
    } else {
      // Congress format: ratio values
      const pctBlack = Number(p.pct_bvap_al ?? 0);
      const pctAsian = Number(p.pct_avap_al ?? 0);
      const pctHispanic = Number(p.pct_hvp ?? 0);
      const pctWhite = Number(p.pct_wvap_al ?? 0);
      blackVap = pctBlack * tvap;
      asianVap = pctAsian * tvap;
      hispanicVap = pctHispanic * tvap;
      minorityVapPct = (1 - pctWhite) * 100;
    }

    result.set(id, {
      districtId: id,
      totalPop: pop,
      vap: tvap,
      blackVap,
      hispanicVap,
      asianVap,
      minorityVapPct,
      demVotes: partisan * 1000,
      repVotes: (1 - partisan) * 1000,
      partisanLean: partisan * 100
    });
  });

  return result;
}

export function districtId(feature: GeoJSON.Feature, fallback: number): string {
  const p = feature.properties ?? {};
  return String(
    p.DISTRICT ?? p.district ?? p.DISTRICTID ?? p.District ??
    p.NAME ?? p.name ?? p.ID ?? fallback
  );
}

function zeroMetrics(id: string): DistrictMetrics {
  return {
    districtId: id,
    totalPop: 0,
    vap: 0,
    blackVap: 0,
    hispanicVap: 0,
    asianVap: 0,
    minorityVapPct: 0,
    demVotes: 0,
    repVotes: 0,
    partisanLean: 50
  };
}
