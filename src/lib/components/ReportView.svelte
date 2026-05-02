<script lang="ts">
  import ScoreCard from './ScoreCard.svelte';
  import MapPane from './MapPane.svelte';
  import L from 'leaflet';
  import { avgScore, seatVotesCurve, partisanBias } from '../utils/compactnessMetrics';
  import type { DistrictCompactness, SeatVotePoint } from '../utils/compactnessMetrics';
  import type { DistrictMetrics, DistrictDelta, FairnessMetrics } from '../types';

  interface CatalogEntry {
    filename: string;
    name: string;
    chamber: string;
    year: number;
    provenance: string;
    tags: string[];
  }

  interface LoadedPlan {
    entry: CatalogEntry;
    geojson: GeoJSON.FeatureCollection;
    metrics: Map<string, DistrictMetrics>;
  }

  interface Props {
    planA: LoadedPlan;
    planB: LoadedPlan;
    compactnessA: Map<string, DistrictCompactness>;
    compactnessB: Map<string, DistrictCompactness>;
    countySplitsA: number | null;
    countySplitsB: number | null;
    deltas: DistrictDelta[];
    fairnessA: FairnessMetrics;
    fairnessB: FairnessMetrics;
    colorBy: 'partisan' | 'minority_vap' | 'pop';
    onMapReadyA?: (map: L.Map) => void;
    onMapReadyB?: (map: L.Map) => void;
    onColorByChange?: (v: 'partisan' | 'minority_vap' | 'pop') => void;
  }

  let {
    planA, planB, compactnessA, compactnessB,
    countySplitsA, countySplitsB,
    deltas, fairnessA, fairnessB,
    colorBy, onMapReadyA, onMapReadyB, onColorByChange
  }: Props = $props();

  // ── Derived summary stats ────────────────────────────────────────────────

  function planStats(p: LoadedPlan) {
    const ms = [...p.metrics.values()];
    const n = ms.length;
    if (n === 0) return { n, total: 0, ideal: 0, maxDev: 0, mmDistricts: 0, bvapMaj: 0, demSeats: 0, repSeats: 0 };
    const pops = ms.map(m => m.totalPop);
    const total = pops.reduce((s, v) => s + v, 0);
    const ideal = total / n;
    const maxDev = Math.max(...pops.map(p => ideal > 0 ? Math.abs(p - ideal) / ideal : 0)) * 100;
    const mmDistricts = ms.filter(m => m.minorityVapPct > 50).length;
    const bvapMaj = ms.filter(m => m.vap > 0 && (m.blackVap / m.vap) * 100 > 50).length;
    const demSeats = ms.filter(m => m.partisanLean > 50).length;
    return { n, total, ideal, maxDev, mmDistricts, bvapMaj, demSeats, repSeats: n - demSeats };
  }

  const sA = $derived(planStats(planA));
  const sB = $derived(planStats(planB));
  const avgPPA = $derived(avgScore(compactnessA, 'polsbyPopper'));
  const avgPPB = $derived(avgScore(compactnessB, 'polsbyPopper'));
  const avgCHRA = $derived(avgScore(compactnessA, 'convexHullRatio'));
  const avgCHRB = $derived(avgScore(compactnessB, 'convexHullRatio'));
  const biasA = $derived(partisanBias([...planA.metrics.values()]));
  const biasB = $derived(partisanBias([...planB.metrics.values()]));
  const svCurveA = $derived(seatVotesCurve([...planA.metrics.values()]));
  const svCurveB = $derived(seatVotesCurve([...planB.metrics.values()]));

  // ── Sorting / table state ────────────────────────────────────────────────

  let sortKey = $state('id');
  let sortDir = $state<1 | -1>(1);

  function toggleSort(key: string) {
    if (sortKey === key) sortDir = sortDir === 1 ? -1 : 1;
    else { sortKey = key; sortDir = 1; }
  }

  function sortIcon(key: string) {
    return sortKey === key ? (sortDir === 1 ? ' ↑' : ' ↓') : '';
  }

  function sortDeltas(ds: DistrictDelta[], key: string, dir: 1 | -1): DistrictDelta[] {
    return [...ds].sort((a, b) => {
      const bvapPct = (m: DistrictMetrics) => m.vap > 0 ? (m.blackVap / m.vap) * 100 : 0;
      let va: number | string = 0, vb: number | string = 0;
      switch (key) {
        case 'id':     va = a.districtId;           vb = b.districtId;           break;
        case 'pop_a':  va = a.a.totalPop;           vb = b.a.totalPop;           break;
        case 'pop_b':  va = a.b.totalPop;           vb = b.b.totalPop;           break;
        case 'dpop':   va = a.deltaPop;             vb = b.deltaPop;             break;
        case 'bvap_a': va = bvapPct(a.a);          vb = bvapPct(b.a);           break;
        case 'bvap_b': va = bvapPct(a.b);          vb = bvapPct(b.b);           break;
        case 'dbvap':  va = bvapPct(a.b)-bvapPct(a.a); vb = bvapPct(b.b)-bvapPct(b.a); break;
        case 'min_a':  va = a.a.minorityVapPct;    vb = b.a.minorityVapPct;     break;
        case 'min_b':  va = a.b.minorityVapPct;    vb = b.b.minorityVapPct;     break;
        case 'dmin':   va = a.deltaMinorityVapPct; vb = b.deltaMinorityVapPct;  break;
        case 'lean_a': va = a.a.partisanLean;       vb = b.a.partisanLean;       break;
        case 'lean_b': va = a.b.partisanLean;       vb = b.b.partisanLean;       break;
        case 'dlean':  va = a.deltaPartisanLean;   vb = b.deltaPartisanLean;    break;
        case 'pp_a': {
          const ca = compactnessA.get(a.districtId)?.polsbyPopper ?? 0;
          const cb = compactnessA.get(b.districtId)?.polsbyPopper ?? 0;
          va = ca; vb = cb; break;
        }
        case 'pp_b': {
          const ca = compactnessB.get(a.districtId)?.polsbyPopper ?? 0;
          const cb = compactnessB.get(b.districtId)?.polsbyPopper ?? 0;
          va = ca; vb = cb; break;
        }
      }
      if (typeof va === 'string') {
        const na = parseInt(va), nb = parseInt(vb as string);
        if (!isNaN(na) && !isNaN(nb)) return dir * (na - nb);
        return dir * va.localeCompare(String(vb));
      }
      return dir * ((va as number) - (vb as number));
    });
  }

  const sortedDeltas = $derived(sortDeltas(deltas, sortKey, sortDir));

  // ── Format helpers ───────────────────────────────────────────────────────

  function fmtN(n: number) { return Math.round(n).toLocaleString(); }
  function fmtPct(n: number) { return n.toFixed(1) + '%'; }
  function fmtDelta(n: number, pct = false, threshold = 0.05) {
    if (Math.abs(n) < threshold) return '—';
    const s = pct ? fmtPct(Math.abs(n)) : fmtN(Math.abs(n));
    return n > 0 ? `+${s}` : `−${s}`;
  }
  function dClass(n: number, threshold = 0.05) {
    if (Math.abs(n) < threshold) return 'text-gray-300';
    return n > 0 ? 'text-emerald-600 font-medium' : 'text-red-500 font-medium';
  }
  function fmtEG(n: number) {
    const p = n > 0 ? 'D' : 'R';
    return `${p}+${(Math.abs(n) * 100).toFixed(1)}%`;
  }
  function fmtBias(n: number) {
    if (Math.abs(n) < 0.5) return 'Neutral';
    return (n > 0 ? 'Dem' : 'Rep') + ` +${Math.abs(n).toFixed(1)}pp`;
  }

  // ── SVG: Demographic bar chart ───────────────────────────────────────────

  const BAR_CHART_H = 220;
  const BAR_PAD_L = 36;
  const BAR_PAD_B = 28;
  const BAR_PAD_T = 16;

  const sortedDistrictIds = $derived(
    [...planA.metrics.entries()]
      .filter(([, m]) => m.vap > 0)
      .sort((a, b) => (a[1].blackVap / a[1].vap) - (b[1].blackVap / b[1].vap))
      .map(([id]) => id)
  );

  const barChartWidth = $derived(
    Math.max(600, sortedDistrictIds.length * 18)
  );
  const barPlotW = $derived(barChartWidth - BAR_PAD_L);
  const barPlotH = BAR_CHART_H - BAR_PAD_T - BAR_PAD_B;
  const barW = $derived(Math.max(3, Math.floor(barPlotW / sortedDistrictIds.length) * 0.38));
  const barGap = $derived(barPlotW / (sortedDistrictIds.length || 1));

  function barX(i: number, offset: number) {
    return BAR_PAD_L + i * barGap + barGap * 0.5 + offset;
  }
  function barY(pct: number) {
    return BAR_PAD_T + barPlotH * (1 - pct / 100);
  }
  function barH(pct: number) {
    return barPlotH * (pct / 100);
  }

  // ── SVG: Seats-votes curve ───────────────────────────────────────────────

  const SV_W = 480;
  const SV_H = 220;
  const SV_PAD_L = 40;
  const SV_PAD_B = 32;
  const SV_PAD_T = 14;
  const SV_PAD_R = 12;
  const svPlotW = SV_W - SV_PAD_L - SV_PAD_R;
  const svPlotH = SV_H - SV_PAD_T - SV_PAD_B;

  function svX(votes: number) { return SV_PAD_L + ((votes - 25) / 50) * svPlotW; }
  function svY(seats: number) { return SV_PAD_T + (1 - seats / 100) * svPlotH; }

  function toPath(curve: SeatVotePoint[]): string {
    if (curve.length === 0) return '';
    return curve
      .map((p, i) => `${i === 0 ? 'M' : 'L'}${svX(p.voteShare).toFixed(1)},${svY(p.seatShare).toFixed(1)}`)
      .join(' ');
  }

  const currentVoteA = $derived((() => {
    const ms = [...planA.metrics.values()];
    const n = ms.length;
    return n > 0 ? ms.reduce((s, m) => s + m.partisanLean, 0) / n : 50;
  })());
  const currentVoteB = $derived((() => {
    const ms = [...planB.metrics.values()];
    const n = ms.length;
    return n > 0 ? ms.reduce((s, m) => s + m.partisanLean, 0) / n : 50;
  })());
  const currentSeatsA = $derived(
    [...planA.metrics.values()].filter(m => m.partisanLean > 50).length / Math.max(1, sA.n) * 100
  );
  const currentSeatsB = $derived(
    [...planB.metrics.values()].filter(m => m.partisanLean > 50).length / Math.max(1, sB.n) * 100
  );

  // ── Export ───────────────────────────────────────────────────────────────

  function exportCsv() {
    const rows = sortedDeltas.map(d => {
      const bA = d.a.vap > 0 ? (d.a.blackVap / d.a.vap) * 100 : 0;
      const bB = d.b.vap > 0 ? (d.b.blackVap / d.b.vap) * 100 : 0;
      const ppA = (compactnessA.get(d.districtId)?.polsbyPopper ?? 0).toFixed(3);
      const ppB = (compactnessB.get(d.districtId)?.polsbyPopper ?? 0).toFixed(3);
      return [
        d.districtId,
        d.a.totalPop, d.b.totalPop, d.deltaPop,
        bA.toFixed(1), bB.toFixed(1), (bB - bA).toFixed(1),
        d.a.minorityVapPct.toFixed(1), d.b.minorityVapPct.toFixed(1), d.deltaMinorityVapPct.toFixed(1),
        d.a.partisanLean.toFixed(1), d.b.partisanLean.toFixed(1), d.deltaPartisanLean.toFixed(1),
        ppA, ppB
      ].join(',');
    });
    const header = 'District,Pop A,Pop B,ΔPop,BVAP% A,BVAP% B,ΔBVAP%,Min% A,Min% B,ΔMin%,Lean A,Lean B,ΔLean,PP A,PP B';
    const csv = [header, ...rows].join('\n');
    const a = Object.assign(document.createElement('a'), {
      href: URL.createObjectURL(new Blob([csv], { type: 'text/csv' })),
      download: 'redistricting-report.csv'
    });
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function printReport() {
    window.print();
  }
</script>

<div class="space-y-6 pb-10 print:space-y-4">

  <!-- ── Report header ── -->
  <div class="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 print:shadow-none print:border-0">
    <div class="flex items-start justify-between flex-wrap gap-4">
      <div>
        <p class="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Redistricting Impact Analysis</p>
        <h2 class="text-xl font-bold text-gray-900 leading-tight">
          <span class="text-blue-700">{planA.entry.name}</span>
          <span class="text-gray-400 font-normal mx-2">vs</span>
          <span class="text-amber-600">{planB.entry.name}</span>
        </h2>
        <p class="text-xs text-gray-400 mt-1.5">
          <span class="text-blue-600 font-medium">A:</span> {planA.entry.provenance}, {planA.entry.year}
          &nbsp;·&nbsp;
          <span class="text-amber-500 font-medium">B:</span> {planB.entry.provenance}, {planB.entry.year}
          &nbsp;·&nbsp;
          {sA.n} districts
          &nbsp;·&nbsp;
          Data: 2020 Census PL 94-171
        </p>
      </div>
      <div class="flex gap-2 print:hidden">
        <button
          onclick={printReport}
          class="flex items-center gap-1.5 px-4 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50 transition-colors"
        >
          <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
          </svg>
          Print / PDF
        </button>
        <button
          onclick={exportCsv}
          class="flex items-center gap-1.5 px-4 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50 transition-colors"
        >
          Export CSV
        </button>
      </div>
    </div>
  </div>

  <!-- ── Maps ── -->
  <div class="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden print:hidden">
    <div class="flex items-center justify-between px-4 py-2 border-b border-gray-100 bg-gray-50">
      <span class="text-xs font-semibold text-gray-500">District Maps</span>
      <div class="flex gap-1">
        {#each [['partisan','Partisan'], ['minority_vap','Minority VAP'], ['pop','Population']] as [val, lbl]}
          <button
            onclick={() => onColorByChange?.(val as 'partisan' | 'minority_vap' | 'pop')}
            class="px-2.5 py-1 rounded-lg text-xs font-medium transition-colors
              {colorBy === val ? 'bg-blue-600 text-white' : 'text-gray-500 hover:bg-gray-100 border border-gray-200'}"
          >
            {lbl}
          </button>
        {/each}
      </div>
    </div>
    <div class="grid grid-cols-2" style="height: 260px;">
      <div class="border-r border-gray-200 h-full">
        <MapPane
          geojson={planA.geojson}
          metrics={planA.metrics}
          {colorBy}
          label={planA.entry.name}
          onMapReady={onMapReadyA}
        />
      </div>
      <div class="h-full">
        <MapPane
          geojson={planB.geojson}
          metrics={planB.metrics}
          {colorBy}
          label={planB.entry.name}
          onMapReady={onMapReadyB}
        />
      </div>
    </div>
    <!-- Legend -->
    <div class="px-5 py-2 border-t border-gray-100 flex items-center gap-5 text-[11px] text-gray-500 bg-gray-50">
      {#if colorBy === 'partisan'}
        <span class="flex items-center gap-1.5"><span class="w-3 h-3 rounded-sm bg-[#1a4fa0] shrink-0"></span>D+15+</span>
        <span class="flex items-center gap-1.5"><span class="w-3 h-3 rounded-sm bg-[#93b8e8] shrink-0"></span>Lean Dem</span>
        <span class="flex items-center gap-1.5"><span class="w-3 h-3 rounded-sm bg-[#e8a097] shrink-0"></span>Lean Rep</span>
        <span class="flex items-center gap-1.5"><span class="w-3 h-3 rounded-sm bg-[#a01a1a] shrink-0"></span>R+15+</span>
      {:else if colorBy === 'minority_vap'}
        <span class="flex items-center gap-1.5"><span class="w-3 h-3 rounded-sm bg-[#f5f3ff] border border-gray-200 shrink-0"></span>&lt;15%</span>
        <span class="flex items-center gap-1.5"><span class="w-3 h-3 rounded-sm bg-[#a78bfa] shrink-0"></span>30–45%</span>
        <span class="flex items-center gap-1.5"><span class="w-3 h-3 rounded-sm bg-[#5c2d91] shrink-0"></span>&gt;60%</span>
      {:else}
        <span class="flex items-center gap-1.5"><span class="w-3 h-3 rounded-sm bg-[#f0fdf4] border border-gray-200 shrink-0"></span>Lower</span>
        <span class="flex items-center gap-1.5"><span class="w-3 h-3 rounded-sm bg-[#14532d] shrink-0"></span>Higher</span>
      {/if}
    </div>
  </div>

  <!-- ── Score cards: Population & Compactness ── -->
  <section>
    <h3 class="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3 px-0.5">Population &amp; Compactness</h3>
    <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
      <ScoreCard
        label="Max Population Deviation"
        description="Max % deviation from ideal district size. Lower = more equal."
        a={sA.maxDev}
        b={sB.maxDev}
        fmt="pct1"
        betterWhen="lower"
      />
      <ScoreCard
        label="Polsby-Popper (avg)"
        description="4π·Area/Perimeter². 0–1 scale; higher = more compact."
        a={avgPPA}
        b={avgPPB}
        fmt="dec3"
        betterWhen="higher"
      />
      <ScoreCard
        label="Convex Hull Ratio (avg)"
        description="Area ÷ convex hull area. 1.0 = perfectly convex shape."
        a={avgCHRA}
        b={avgCHRB}
        fmt="dec3"
        betterWhen="higher"
      />
      <ScoreCard
        label="County Splits"
        description="Counties divided across multiple districts. Lower = fewer splits."
        a={countySplitsA ?? 0}
        b={countySplitsB ?? 0}
        fmt="int"
        betterWhen="lower"
        loading={countySplitsA === null || countySplitsB === null}
      />
    </div>
  </section>

  <!-- ── Score cards: Representation ── -->
  <section>
    <h3 class="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3 px-0.5">Representation &amp; Demographics</h3>
    <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
      <ScoreCard
        label="Majority-Minority Districts"
        description="Districts where minority VAP exceeds 50%."
        a={sA.mmDistricts}
        b={sB.mmDistricts}
        fmt="int"
        betterWhen="higher"
      />
      <ScoreCard
        label="Black VAP Majority Districts"
        description="Districts where Black VAP exceeds 50% (VRA-relevant)."
        a={sA.bvapMaj}
        b={sB.bvapMaj}
        fmt="int"
        betterWhen="higher"
      />
    </div>
  </section>

  <!-- ── Score cards: Partisan fairness ── -->
  <section>
    <h3 class="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3 px-0.5">Partisan Fairness</h3>
    <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
      <ScoreCard
        label="Dem Seats (lean &gt;50%)"
        description="Districts where Dem partisan lean exceeds 50%."
        a={sA.demSeats}
        b={sB.demSeats}
        fmt="int"
        betterWhen="neutral"
      />
      <ScoreCard
        label="Efficiency Gap"
        description="(Wasted Dem votes − Wasted Rep votes) ÷ total. Pos = Dem wins more wasted votes."
        a={fairnessA.efficiencyGap * 100}
        b={fairnessB.efficiencyGap * 100}
        fmt="pct1"
        betterWhen="neutral"
      />
      <ScoreCard
        label="Mean-Median Difference"
        description="Mean Dem vote share minus median. Negative = Rep structural advantage."
        a={fairnessA.meanMedian * 100}
        b={fairnessB.meanMedian * 100}
        fmt="pct1"
        betterWhen="neutral"
      />
      <ScoreCard
        label="Partisan Bias"
        description="At uniform 50% vote share, Dem seat share minus 50%. Pos = Dem structural advantage."
        a={biasA}
        b={biasB}
        fmt="pct1"
        betterWhen="neutral"
      />
    </div>

    <!-- Fairness interpretation note -->
    <div class="mt-3 bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-xs text-gray-500 leading-relaxed">
      <strong class="text-gray-700">Reading fairness metrics:</strong>
      An efficiency gap above ±8% is considered a potential partisan gerrymander by some courts.
      The mean-median difference measures asymmetry — a large negative value indicates votes are
      "packed" such that one party consistently wins narrow victories while the other wins landslides.
      Partisan bias tests what happens when both parties get exactly 50% of the vote.
    </div>
  </section>

  <!-- ── Demographic bar chart ── -->
  <section class="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
    <div class="px-5 py-3 border-b border-gray-100 bg-gray-50">
      <h3 class="text-sm font-semibold text-gray-800">Black Voting-Age Population by District</h3>
      <p class="text-[11px] text-gray-400 mt-0.5">
        Districts sorted left→right by Plan A Black VAP %.
        Red dashed line = 50% majority threshold.
        <span class="text-blue-600 font-medium">■ Plan A</span>
        &nbsp;
        <span class="text-amber-500 font-medium">■ Plan B</span>
      </p>
    </div>
    <div class="overflow-x-auto px-4 py-4">
      <svg
        width={barChartWidth + BAR_PAD_L}
        height={BAR_CHART_H}
        style="display:block;"
      >
        <!-- Grid lines & y-axis labels -->
        {#each [0, 25, 50, 75, 100] as yVal}
          {@const y = barY(yVal)}
          <line
            x1={BAR_PAD_L} y1={y}
            x2={barChartWidth + BAR_PAD_L} y2={y}
            stroke={yVal === 50 ? '#ef4444' : '#e5e7eb'}
            stroke-width={yVal === 50 ? 1.5 : 0.5}
            stroke-dasharray={yVal === 50 ? '5,3' : 'none'}
          />
          <text x={BAR_PAD_L - 4} y={y + 3} text-anchor="end" font-size="9" fill="#9ca3af">{yVal}%</text>
        {/each}

        <!-- Bars -->
        {#each sortedDistrictIds as distId, i}
          {@const mA = planA.metrics.get(distId)}
          {@const mB = planB.metrics.get(distId)}
          {@const bvapA = mA && mA.vap > 0 ? (mA.blackVap / mA.vap) * 100 : 0}
          {@const bvapB = mB && mB.vap > 0 ? (mB.blackVap / mB.vap) * 100 : 0}
          <!-- Plan A bar -->
          <rect
            x={barX(i, -barW - 1)}
            y={barY(bvapA)}
            width={barW}
            height={barH(bvapA)}
            fill="#3b82f6"
            opacity="0.85"
          />
          <!-- Plan B bar -->
          <rect
            x={barX(i, 1)}
            y={barY(bvapB)}
            width={barW}
            height={barH(bvapB)}
            fill="#f59e0b"
            opacity="0.85"
          />
          <!-- District label (only if not too crowded) -->
          {#if sortedDistrictIds.length <= 56}
            <text
              x={barX(i, 0)}
              y={BAR_CHART_H - BAR_PAD_B + 10}
              text-anchor="middle"
              font-size="8"
              fill="#9ca3af"
            >{distId}</text>
          {/if}
        {/each}

        <!-- x-axis line -->
        <line
          x1={BAR_PAD_L} y1={barY(0)}
          x2={barChartWidth + BAR_PAD_L} y2={barY(0)}
          stroke="#d1d5db" stroke-width="1"
        />
      </svg>
    </div>
  </section>

  <!-- ── Seats-votes curve ── -->
  <section class="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
    <div class="px-5 py-3 border-b border-gray-100 bg-gray-50">
      <h3 class="text-sm font-semibold text-gray-800">Seats-Votes Responsiveness Curve</h3>
      <p class="text-[11px] text-gray-400 mt-0.5">
        Shows projected Dem seat share at each hypothetical uniform vote swing.
        Gray diagonal = proportional outcome.
        Dots = current partisan composition.
      </p>
    </div>
    <div class="px-6 py-5 flex flex-wrap gap-8 items-start">
      <svg width={SV_W} height={SV_H} style="display:block; overflow:visible;">
        <!-- Grid -->
        {#each [25, 37.5, 50, 62.5, 75] as xV}
          <line x1={svX(xV)} y1={SV_PAD_T} x2={svX(xV)} y2={SV_H - SV_PAD_B} stroke="#e5e7eb" stroke-width="0.5" />
          <text x={svX(xV)} y={SV_H - SV_PAD_B + 12} text-anchor="middle" font-size="9" fill="#9ca3af">{xV}%</text>
        {/each}
        {#each [0, 25, 50, 75, 100] as yV}
          <line x1={SV_PAD_L} y1={svY(yV)} x2={SV_W - SV_PAD_R} y2={svY(yV)} stroke="#e5e7eb" stroke-width="0.5" />
          <text x={SV_PAD_L - 4} y={svY(yV) + 3} text-anchor="end" font-size="9" fill="#9ca3af">{yV}%</text>
        {/each}

        <!-- Proportionality reference diagonal -->
        <line
          x1={svX(25)} y1={svY(0)}
          x2={svX(75)} y2={svY(100)}
          stroke="#9ca3af" stroke-width="0.8" stroke-dasharray="4,3"
        />
        <!-- 50-50 crosshairs -->
        <line x1={svX(50)} y1={SV_PAD_T} x2={svX(50)} y2={SV_H - SV_PAD_B} stroke="#d1d5db" stroke-width="0.8" />
        <line x1={SV_PAD_L} y1={svY(50)} x2={SV_W - SV_PAD_R} y2={svY(50)} stroke="#d1d5db" stroke-width="0.8" />

        <!-- Plan A curve -->
        {#if toPath(svCurveA)}
          <path d={toPath(svCurveA)} fill="none" stroke="#3b82f6" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" />
        {/if}
        <!-- Plan B curve -->
        {#if toPath(svCurveB)}
          <path d={toPath(svCurveB)} fill="none" stroke="#f59e0b" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" />
        {/if}

        <!-- Current position dots -->
        <circle cx={svX(currentVoteA)} cy={svY(currentSeatsA)} r="5" fill="#3b82f6" stroke="white" stroke-width="1.5" />
        <circle cx={svX(currentVoteB)} cy={svY(currentSeatsB)} r="5" fill="#f59e0b" stroke="white" stroke-width="1.5" />

        <!-- Axis labels -->
        <text x={SV_PAD_L + svPlotW / 2} y={SV_H} text-anchor="middle" font-size="10" fill="#6b7280" font-weight="600">Dem Vote Share →</text>
        <text x={8} y={SV_PAD_T + svPlotH / 2} text-anchor="middle" font-size="10" fill="#6b7280" font-weight="600" transform={`rotate(-90, 8, ${SV_PAD_T + svPlotH / 2})`}>Dem Seats →</text>
      </svg>

      <!-- Partisan summary box -->
      <div class="flex-1 min-w-52 space-y-4">
        <div>
          <p class="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">At Current Vote Share</p>
          <div class="space-y-1.5 text-sm">
            <div class="flex items-center justify-between">
              <span class="flex items-center gap-1.5"><span class="w-3 h-3 rounded-full bg-blue-500 inline-block"></span>Plan A</span>
              <span class="font-semibold tabular-nums">{fmtPct(currentVoteA)} votes → {sA.demSeats}D / {sA.repSeats}R</span>
            </div>
            <div class="flex items-center justify-between">
              <span class="flex items-center gap-1.5"><span class="w-3 h-3 rounded-full bg-amber-500 inline-block"></span>Plan B</span>
              <span class="font-semibold tabular-nums">{fmtPct(currentVoteB)} votes → {sB.demSeats}D / {sB.repSeats}R</span>
            </div>
          </div>
        </div>
        <div>
          <p class="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">Partisan Bias (at 50% vote)</p>
          <div class="space-y-1 text-sm">
            <div class="flex justify-between">
              <span class="text-blue-700 font-medium">Plan A</span>
              <span class="font-semibold">{fmtBias(biasA)}</span>
            </div>
            <div class="flex justify-between">
              <span class="text-amber-600 font-medium">Plan B</span>
              <span class="font-semibold">{fmtBias(biasB)}</span>
            </div>
          </div>
        </div>
        <div>
          <p class="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">Efficiency Gap</p>
          <div class="space-y-1 text-sm">
            <div class="flex justify-between">
              <span class="text-blue-700 font-medium">Plan A</span>
              <span class="font-semibold">{fmtEG(fairnessA.efficiencyGap)}</span>
            </div>
            <div class="flex justify-between">
              <span class="text-amber-600 font-medium">Plan B</span>
              <span class="font-semibold">{fmtEG(fairnessB.efficiencyGap)}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </section>

  <!-- ── District comparison table ── -->
  <section class="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
    <div class="px-5 py-3 border-b border-gray-100 bg-gray-50 flex items-center justify-between flex-wrap gap-3">
      <div>
        <h3 class="text-sm font-semibold text-gray-800">District-Level Detail</h3>
        <p class="text-[11px] text-gray-400 mt-0.5">
          {sortedDeltas.length} districts · click headers to sort ·
          <span class="text-amber-600">amber rows</span> = minority VAP shift &gt;5pp
        </p>
      </div>
      <div class="flex items-center gap-3 text-[11px] text-gray-500">
        <span class="flex items-center gap-1.5"><span class="w-3 h-3 rounded-sm bg-blue-200 inline-block"></span>Plan A</span>
        <span class="flex items-center gap-1.5"><span class="w-3 h-3 rounded-sm bg-amber-200 inline-block"></span>Plan B</span>
      </div>
    </div>
    <div class="overflow-x-auto">
      <table class="w-full text-xs border-collapse">
        <thead>
          <tr class="border-b-2 border-gray-200">
            <th class="px-3 py-2 text-left text-gray-500 font-semibold bg-gray-50" rowspan="2">District</th>
            <th class="px-2 py-1.5 text-center text-blue-700 font-semibold bg-blue-50 border-l border-gray-200" colspan="3">Population</th>
            <th class="px-2 py-1.5 text-center text-purple-700 font-semibold bg-purple-50 border-l border-gray-200" colspan="3">Black VAP %</th>
            <th class="px-2 py-1.5 text-center text-violet-700 font-semibold bg-violet-50 border-l border-gray-200" colspan="3">Minority VAP %</th>
            <th class="px-2 py-1.5 text-center text-indigo-700 font-semibold bg-indigo-50 border-l border-gray-200" colspan="3">Partisan Lean</th>
            <th class="px-2 py-1.5 text-center text-teal-700 font-semibold bg-teal-50 border-l border-gray-200" colspan="2">Polsby-Popper</th>
          </tr>
          <tr class="border-b border-gray-200 bg-gray-50 text-gray-500">
            {#each [
              ['pop_a','A'],['pop_b','B'],['dpop','Δ'],
              ['bvap_a','A'],['bvap_b','B'],['dbvap','Δ'],
              ['min_a','A'],['min_b','B'],['dmin','Δ'],
              ['lean_a','A'],['lean_b','B'],['dlean','Δ'],
              ['pp_a','A'],['pp_b','B']
            ] as [key, lbl], ci}
              <th
                class="px-2 py-1.5 font-semibold cursor-pointer hover:bg-gray-100 transition-colors whitespace-nowrap
                  {[0,3,6,9,12].includes(ci) ? 'border-l border-gray-200' : ''}
                  {lbl === 'A' ? 'text-blue-600' : lbl === 'B' ? 'text-amber-600' : 'text-gray-600'}"
                onclick={() => toggleSort(key)}
              >
                {lbl}{sortIcon(key)}
              </th>
            {/each}
          </tr>
        </thead>
        <tbody>
          {#each sortedDeltas as d (d.districtId)}
            {@const bvapA = d.a.vap > 0 ? (d.a.blackVap / d.a.vap) * 100 : 0}
            {@const bvapB = d.b.vap > 0 ? (d.b.blackVap / d.b.vap) * 100 : 0}
            {@const dbvap = bvapB - bvapA}
            {@const ppA = compactnessA.get(d.districtId)?.polsbyPopper ?? 0}
            {@const ppB = compactnessB.get(d.districtId)?.polsbyPopper ?? 0}
            <tr class="border-b border-gray-100 hover:bg-gray-50 transition-colors {d.minorityFlagged ? 'bg-amber-50 hover:bg-amber-100' : ''}">
              <td class="px-3 py-2 font-bold text-gray-800 {d.minorityFlagged ? 'text-amber-800' : ''}">{d.districtId}</td>
              <td class="px-2 py-2 text-right font-mono text-blue-700 border-l border-gray-100">{fmtN(d.a.totalPop)}</td>
              <td class="px-2 py-2 text-right font-mono text-amber-700">{fmtN(d.b.totalPop)}</td>
              <td class="px-2 py-2 text-right font-mono {dClass(d.deltaPop, 500)}">{fmtDelta(d.deltaPop, false, 500)}</td>
              <td class="px-2 py-2 text-right font-mono text-blue-700 border-l border-gray-100 {bvapA > 50 ? 'font-bold' : ''}">{fmtPct(bvapA)}</td>
              <td class="px-2 py-2 text-right font-mono text-amber-700 {bvapB > 50 ? 'font-bold' : ''}">{fmtPct(bvapB)}</td>
              <td class="px-2 py-2 text-right font-mono {dClass(dbvap, 0.5)}">{fmtDelta(dbvap, true, 0.5)}</td>
              <td class="px-2 py-2 text-right font-mono text-blue-700 border-l border-gray-100 {d.a.minorityVapPct > 50 ? 'font-bold' : ''}">{fmtPct(d.a.minorityVapPct)}</td>
              <td class="px-2 py-2 text-right font-mono text-amber-700 {d.b.minorityVapPct > 50 ? 'font-bold' : ''}">{fmtPct(d.b.minorityVapPct)}</td>
              <td class="px-2 py-2 text-right font-mono {d.minorityFlagged ? 'text-amber-700 font-bold' : dClass(d.deltaMinorityVapPct, 0.5)}">{fmtDelta(d.deltaMinorityVapPct, true, 0.5)}</td>
              <td class="px-2 py-2 text-right font-mono border-l border-gray-100 {d.a.partisanLean >= 50 ? 'text-blue-600' : 'text-red-500'}">{fmtPct(d.a.partisanLean)}</td>
              <td class="px-2 py-2 text-right font-mono {d.b.partisanLean >= 50 ? 'text-blue-600' : 'text-red-500'}">{fmtPct(d.b.partisanLean)}</td>
              <td class="px-2 py-2 text-right font-mono {dClass(d.deltaPartisanLean, 0.5)}">{fmtDelta(d.deltaPartisanLean, true, 0.5)}</td>
              <td class="px-2 py-2 text-right font-mono text-blue-700 border-l border-gray-100">{ppA.toFixed(3)}</td>
              <td class="px-2 py-2 text-right font-mono text-amber-700">{ppB.toFixed(3)}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  </section>

  <!-- ── Methodology ── -->
  <section class="bg-gray-50 border border-gray-200 rounded-2xl px-5 py-4 text-xs text-gray-500 leading-relaxed">
    <p class="font-semibold text-gray-600 mb-1">Methodology &amp; Data Sources</p>
    <p>
      Census data: 2020 Decennial Census, PL 94-171 redistricting file.
      Population and VAP figures are from the GeoJSON feature properties as published by the Georgia General Assembly.
      <strong>Polsby-Popper</strong> compactness: 4π·A/P² computed from geodesic area and perimeter using Turf.js.
      <strong>Convex hull ratio</strong>: feature area divided by convex hull area.
      <strong>Efficiency gap</strong>: (wasted Dem votes − wasted Rep votes) / total votes, where wasted = losing votes + winning votes above bare majority.
      Partisan lean derived from the composite <em>partisan</em> field in the source GeoJSON (blend of 2018–2022 election cycles).
      County splits count counties with district lines crossing their boundaries.
      All scores are non-partisan and computed identically for both plans.
    </p>
  </section>
</div>

<style>
  @media print {
    :global(body) { background: white; }
    section { break-inside: avoid; }
  }
</style>
