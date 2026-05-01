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

export function buildDeltas(
  metricsA: Map<string, DistrictMetrics>,
  metricsB: Map<string, DistrictMetrics>
) {
  // Union of all district IDs
  const allIds = new Set([...metricsA.keys(), ...metricsB.keys()]);
  return [...allIds].map(id => {
    const a = metricsA.get(id) ?? zeroMetrics(id);
    const b = metricsB.get(id) ?? zeroMetrics(id);
    const deltaMinorityVapPct = b.minorityVapPct - a.minorityVapPct;
    return {
      districtId: id,
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
