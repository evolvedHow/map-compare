import * as turf from '@turf/turf';
import type { CrosswalkRow, DistrictMetrics, DistrictDelta, DistrictThresholds } from '../types';

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
        m.whiteVap += row.white_vap || 0;
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
    // If white_vap wasn't in the crosswalk data, derive it
    if (m.whiteVap === 0 && m.vap > 0) {
      m.whiteVap = Math.max(0, m.vap - minVap);
    }

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
  // Ideal population for plan B (used for per-district deviation, R script 7 equivalent)
  const totalPopB = [...metricsB.values()].reduce((s, m) => s + m.totalPop, 0);
  const idealPop = metricsB.size > 0 ? totalPopB / metricsB.size : 0;
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

    // R script 7 equivalent: change classification
    const bvapPctA = a.vap > 0 ? a.blackVap / a.vap : 0;
    const bvapPctB = b.vap > 0 ? b.blackVap / b.vap : 0;
    const mvapPctA = a.minorityVapPct / 100;
    const mvapPctB = b.minorityVapPct / 100;
    const popDeviation = b.totalPop - idealPop;

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
      minorityFlagged: Math.abs(deltaMinorityVapPct) > 5,
      bvapChangeLabel: classifyBvapChange(bvapPctA, bvapPctB),
      mvapChangeLabel: classifyMvapChange(mvapPctA, mvapPctB),
      partisanFlipLabel: classifyPartisanFlip(a.partisanLean, b.partisanLean),
      competitiveChangeLabel: classifyCompetitiveChange(a.partisanLean, b.partisanLean),
      popDeviation,
      popDeviationPct: idealPop > 0 ? popDeviation / idealPop : 0
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

    let blackVap: number, asianVap: number, hispanicVap: number, whiteVap: number, minorityVapPct: number;

    if (p.bvap !== undefined) {
      // Senate/House format: absolute VAP counts
      blackVap = Number(p.bvap ?? 0);
      asianVap = Number(p.avap ?? 0);
      hispanicVap = Number(p.hvap ?? 0);
      const wvap = Number(p.wvap ?? p.white_vap ?? 0);
      const bipocVap = Number(p.bipoc_vap ?? blackVap + asianVap + hispanicVap);
      minorityVapPct = tvap > 0 ? (bipocVap / tvap) * 100 : 0;
      whiteVap = wvap > 0 ? wvap : Math.max(0, tvap - bipocVap);
    } else {
      // Congress format: ratio values
      const pctBlack = Number(p.pct_bvap_al ?? 0);
      const pctAsian = Number(p.pct_avap_al ?? 0);
      const pctHispanic = Number(p.pct_hvp ?? 0);
      const pctWhite = Number(p.pct_wvap_al ?? 0);
      blackVap = pctBlack * tvap;
      asianVap = pctAsian * tvap;
      hispanicVap = pctHispanic * tvap;
      whiteVap = pctWhite * tvap;
      minorityVapPct = (1 - pctWhite) * 100;
    }

    result.set(id, {
      districtId: id,
      totalPop: pop,
      vap: tvap,
      blackVap,
      hispanicVap,
      asianVap,
      whiteVap,
      minorityVapPct,
      demVotes: partisan * 1000,
      repVotes: (1 - partisan) * 1000,
      partisanLean: partisan * 100
    });
  });

  return result;
}

// ── R script 8 equivalent: 6-tier partisan safety classification ──────────────
export function safetyTier(lean: number): string {
  // lean is 0–100 Dem percentage
  const l = lean / 100;
  if (l < 0.40)  return 'Safe R';
  if (l < 0.465) return 'Lean R';
  if (l < 0.50)  return 'Competitive R';
  if (l < 0.535) return 'Competitive D';
  if (l < 0.60)  return 'Lean D';
  return 'Safe D';
}

// ── R script 7 equivalent: change classification helpers ─────────────────────

// bvapPct is a 0–1 fraction
export function classifyBvapChange(bvapPctA: number, bvapPctB: number): string {
  if (bvapPctA >= 0.5 && bvapPctB < 0.5) return 'Lost BVAP Majority';
  if (bvapPctA < 0.5 && bvapPctB >= 0.5) return 'Gained BVAP Majority';
  if (bvapPctA >= 0.37 && bvapPctA < 0.5 && (bvapPctB >= 0.5 || bvapPctB < 0.37)) return 'Lost BVAP Influence';
  if ((bvapPctA < 0.37 || bvapPctA >= 0.5) && bvapPctB >= 0.37 && bvapPctB < 0.5) return 'Gained BVAP Influence';
  return '';
}

// mvapPct is a 0–1 fraction (minorityVapPct / 100)
export function classifyMvapChange(mvapPctA: number, mvapPctB: number): string {
  if (mvapPctA >= 0.5 && mvapPctB < 0.5) return 'Lost MVAP Majority';
  if (mvapPctA < 0.5 && mvapPctB >= 0.5) return 'Gained MVAP Majority';
  if (mvapPctA >= 0.37 && mvapPctA < 0.5 && (mvapPctB >= 0.5 || mvapPctB < 0.37)) return 'Lost MVAP Influence';
  if ((mvapPctA < 0.37 || mvapPctA >= 0.5) && mvapPctB >= 0.37 && mvapPctB < 0.5) return 'Gained MVAP Influence';
  return '';
}

// lean is 0–100 Dem percentage; 50 = toss-up
export function classifyPartisanFlip(leanA: number, leanB: number): string {
  if (leanA >= 50 && leanB < 50) return 'Lost Dem';
  if (leanA < 50  && leanB >= 50) return 'Gained Dem';
  return '';
}

// lean is 0–100 Dem percentage; competitive = 46.5%–53.5%
export function classifyCompetitiveChange(leanA: number, leanB: number): string {
  const compA = leanA >= 46.5 && leanA <= 53.5;
  const compB = leanB >= 46.5 && leanB <= 53.5;
  if (!compA && compB) return 'Gained Competitive';
  if (compA && !compB) return 'Lost Competitive';
  return '';
}

// ── R script 4 / script 8 equivalent: count districts by VRA thresholds ──────
export function computeThresholds(metrics: DistrictMetrics[]): DistrictThresholds {
  const tierCounts: Record<string, number> = {
    'Safe R': 0, 'Lean R': 0, 'Competitive R': 0,
    'Competitive D': 0, 'Lean D': 0, 'Safe D': 0
  };
  let competitive = 0, demDistricts = 0, repDistricts = 0;
  let bvapMaj = 0, bvapInf = 0;
  let mvapMaj = 0, mvapInf = 0;
  let hvapMaj = 0, hvapInf = 0;
  let avapMaj = 0, avapInf = 0;

  for (const m of metrics) {
    const lean = m.partisanLean / 100;
    const bvap = m.vap > 0 ? m.blackVap    / m.vap : 0;
    const mvap = m.minorityVapPct / 100;
    const hvap = m.vap > 0 ? m.hispanicVap / m.vap : 0;
    const avap = m.vap > 0 ? m.asianVap    / m.vap : 0;

    // Partisan
    if (lean >= 0.465 && lean <= 0.535) competitive++;
    if (lean >= 0.5) demDistricts++; else repDistricts++;
    tierCounts[safetyTier(m.partisanLean)]++;

    // BVAP
    if (bvap >= 0.5) bvapMaj++; else if (bvap >= 0.37) bvapInf++;
    // MVAP
    if (mvap >= 0.5) mvapMaj++; else if (mvap >= 0.37) mvapInf++;
    // HVAP
    if (hvap >= 0.5) hvapMaj++; else if (hvap >= 0.37) hvapInf++;
    // AVAP
    if (avap >= 0.5) avapMaj++; else if (avap >= 0.37) avapInf++;
  }

  return {
    competitive, demDistricts, repDistricts,
    bvapMaj, bvapInf,
    mvapMaj, mvapInf,
    hvapMaj, hvapInf,
    avapMaj, avapInf,
    safetyTiers: tierCounts
  };
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
    whiteVap: 0,
    minorityVapPct: 0,
    demVotes: 0,
    repVotes: 0,
    partisanLean: 50
  };
}
