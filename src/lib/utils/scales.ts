/**
 * Shared color scales used by every map renderer and legend.
 *
 * Keeping the scale logic in one module means the Canvas/Leaflet maps, the
 * print SVG maps, and the on-screen legends can never drift apart.
 *
 * Partisan scale mirrors the 6-tier safety classification in spatialAnalysis
 * (`safetyTier`), so the map legend and the "Partisan Safety Tiers" report
 * table always agree. Minority-VAP bins mirror the VRA threshold analysis
 * (Influence 37–50%, Majority ≥50%).
 */

export type PartisanTier =
  | 'Safe R' | 'Lean R' | 'Competitive R'
  | 'Competitive D' | 'Lean D' | 'Safe D';

// Colors match the safety-tier table swatches in ReportView.
export const PARTISAN_TIER_COLORS: Record<PartisanTier, string> = {
  'Safe R': '#bc131e',
  'Lean R': '#eb4956',
  'Competitive R': '#c36e9e',
  'Competitive D': '#7279db',
  'Lean D': '#3c6ebf',
  'Safe D': '#1f4bae',
};

export const PARTISAN_TIERS: PartisanTier[] = [
  'Safe R', 'Lean R', 'Competitive R', 'Competitive D', 'Lean D', 'Safe D',
];

/** lean is the 0–100 Democratic share. */
export function partisanTier(lean: number): PartisanTier {
  const l = lean / 100;
  if (l < 0.40)  return 'Safe R';
  if (l < 0.465) return 'Lean R';
  if (l < 0.50)  return 'Competitive R';
  if (l < 0.535) return 'Competitive D';
  if (l < 0.60)  return 'Lean D';
  return 'Safe D';
}

export function partisanColor(lean: number): string {
  return PARTISAN_TIER_COLORS[partisanTier(lean)];
}

/**
 * Minority VAP bins aligned with the demographic threshold analysis:
 *   <15 / 15–25 / 25–37 / 37–50 Influence / ≥50 Majority.
 */
export function minorityVapColor(pct: number): string {
  if (pct >= 50) return '#5c2d91';  // Majority
  if (pct >= 37) return '#8b5cf6';  // Influence
  if (pct >= 25) return '#a78bfa';
  if (pct >= 15) return '#ddd6fe';
  return '#f5f3ff';
}

// ---------------------------------------------------------------------------
// Absolute population buckets — only used when a single plan is shown (no
// comparison).  With two plans, Population is always shown as a comparison
// (Higher / Same / Lower) via popDeltaClass.
// ---------------------------------------------------------------------------

export function popColor(value: number): string {
  if (value >= 80000) return '#14532d';
  if (value >= 60000) return '#15803d';
  if (value >= 40000) return '#4ade80';
  if (value >= 20000) return '#bbf7d0';
  return '#f0fdf4';
}

// ---------------------------------------------------------------------------
// Population comparison (Lower / Same / Higher)
// ---------------------------------------------------------------------------

export type PopDeltaClass = 'lower' | 'same' | 'higher';

/** Same = within 0.5% of Plan A's district population. */
export function popDeltaClass(deltaPop: number, basePop: number): PopDeltaClass {
  const threshold = Math.max(1, basePop * 0.005);
  if (Math.abs(deltaPop) <= threshold) return 'same';
  return deltaPop > 0 ? 'higher' : 'lower';
}

export function popDeltaColor(deltaPop: number, basePop: number): string {
  const c = popDeltaClass(deltaPop, basePop);
  if (c === 'higher') return '#14532d';
  if (c === 'lower')  return '#bbf7d0';
  return '#e5e7eb';
}

// ── Changed-district classification (ReportView "Changed Districts") ────────
// A district is "significantly changed" when partisan lean OR minority VAP
// shifts by more than 5pp.  The map must colour exactly the same predicate as
// the count, otherwise "4 changed / 2 highlighted" style mismatches appear.

export interface ChangeShades {
  partisan: 'd_plus' | 'd' | 'r' | 'r_plus';
  vraOnly: boolean;
  stable: boolean;
}

export function changeShade(
  deltaPartisanLean: number,
  deltaMinorityVapPct: number,
): ChangeShades {
  const partisanChanged = Math.abs(deltaPartisanLean) > 5;
  if (partisanChanged) {
    if (deltaPartisanLean > 10) return { partisan: 'd_plus', vraOnly: false, stable: false };
    if (deltaPartisanLean > 5)  return { partisan: 'd', vraOnly: false, stable: false };
    if (deltaPartisanLean < -10) return { partisan: 'r_plus', vraOnly: false, stable: false };
    return { partisan: 'r', vraOnly: false, stable: false };
  }
  if (Math.abs(deltaMinorityVapPct) > 5) return { partisan: 'd', vraOnly: true, stable: false };
  return { partisan: 'd', vraOnly: false, stable: true };
}

export const CHANGE_COLORS = {
  d_plus:  '#1d4ed8',
  d:       '#93c5fd',
  r:       '#fca5a5',
  r_plus:  '#b91c1c',
  vraOnly: '#fcd34d',   // amber — VRA-relevant shift, partisan stable
  stable:  '#e5e7eb',
};