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
