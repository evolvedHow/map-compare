<script lang="ts">
  import ScoreCard from './ScoreCard.svelte';
  import MapPane from './MapPane.svelte';
  import SvgMap from './SvgMap.svelte';
  import L from 'leaflet';
  import { avgScore, seatVotesCurve, partisanBias } from '../utils/compactnessMetrics';
  import { computeThresholds } from '../utils/spatialAnalysis';
  import type { DistrictThresholds } from '../types';
  import { generateNarrative } from '../utils/aiReport';
  import type { NarrativeReport, AnalyzePayload } from '../utils/aiReport';
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
  const threshA = $derived(computeThresholds([...planA.metrics.values()]));
  const threshB = $derived(computeThresholds([...planB.metrics.values()]));
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
    const bvapPct = (m: DistrictMetrics) => m.vap > 0 ? (m.blackVap / m.vap) * 100 : 0;
    return [...ds].sort((x, y) => {
      let va: number | string = 0, vb: number | string = 0;
      switch (key) {
        case 'id':     va = x.districtId;         vb = y.districtId;         break;
        case 'pop_b':  va = x.b.totalPop;         vb = y.b.totalPop;         break;
        case 'lean_a': va = x.a.partisanLean;     vb = y.a.partisanLean;     break;
        case 'lean_b': va = x.b.partisanLean;     vb = y.b.partisanLean;     break;
        case 'dlean':  va = x.deltaPartisanLean;  vb = y.deltaPartisanLean;  break;
        case 'bvap_a': va = bvapPct(x.a);         vb = bvapPct(y.a);         break;
        case 'bvap_b': va = bvapPct(x.b);         vb = bvapPct(y.b);         break;
        case 'dbvap':  va = bvapPct(x.b)-bvapPct(x.a); vb = bvapPct(y.b)-bvapPct(y.a); break;
        case 'pp_b': {
          va = compactnessB.get(x.matchedBId)?.polsbyPopper ?? 0;
          vb = compactnessB.get(y.matchedBId)?.polsbyPopper ?? 0; break;
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
  const halfN = $derived(Math.ceil(sortedDeltas.length / 2));
  const leftDeltas  = $derived(sortedDeltas.slice(0, halfN));
  const rightDeltas = $derived(sortedDeltas.slice(halfN));

  // ── Format helpers ───────────────────────────────────────────────────────

  function fmtN(n: number) { return Math.round(n).toLocaleString(); }
  function fmtPct(n: number) { return n.toFixed(1) + '%'; }
  function fmtEG(n: number) {
    return `${n > 0 ? 'D' : 'R'}+${(Math.abs(n) * 100).toFixed(1)}%`;
  }
  function fmtBias(n: number) {
    if (Math.abs(n) < 0.5) return 'Neutral';
    return (n > 0 ? 'Dem' : 'Rep') + ` +${Math.abs(n).toFixed(1)}pp`;
  }
  function fmtLean(lean: number) {
    const d = lean - 50;
    if (Math.abs(d) < 0.5) return 'EVEN';
    return d > 0 ? `D+${d.toFixed(1)}%` : `R+${Math.abs(d).toFixed(1)}%`;
  }
  function leanClass(lean: number) {
    const d = lean - 50;
    if (Math.abs(d) < 1) return 'text-gray-500';
    return d > 0 ? 'text-blue-700' : 'text-red-600';
  }
  // Color for Plan B value based on directional change from Plan A
  function bValClass(delta: number, threshold = 0.5) {
    if (Math.abs(delta) < threshold) return 'text-amber-600';
    return delta > 0 ? 'text-emerald-600 font-semibold' : 'text-red-600 font-semibold';
  }
  function bPopClass(delta: number) {
    if (Math.abs(delta) < 50) return 'text-amber-600';
    return delta > 0 ? 'text-emerald-600' : 'text-red-600';
  }
  function arrow(delta: number, threshold = 0.5) {
    if (Math.abs(delta) < threshold) return '';
    return delta > 0 ? ' ↑' : ' ↓';
  }

  // ── SVG: Demographic bar chart ───────────────────────────────────────────

  const BAR_CHART_H = 220;
  const BAR_PAD_L = 36;
  const BAR_PAD_B = 28;
  const BAR_PAD_T = 16;

  // Use the spatial-matched deltas for bar chart (so Plan B bars use the correct matched district)
  const sortedDistrictIds = $derived(
    [...deltas]
      .filter(d => d.a.vap > 0)
      .sort((a, b) => (a.a.blackVap / a.a.vap) - (b.a.blackVap / b.a.vap))
      .map(d => d.districtId)
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

  // ── Hover sync ───────────────────────────────────────────────────────────
  let hoveredA = $state<string | null>(null);
  let hoveredB = $state<string | null>(null);
  const hlA = $derived(
    hoveredA ?? (hoveredB ? (deltas.find(d => d.matchedBId === hoveredB)?.districtId ?? null) : null)
  );
  const hlB = $derived(
    hoveredA ? (deltas.find(d => d.districtId === hoveredA)?.matchedBId ?? null) : hoveredB
  );
  const hoveredDelta = $derived(
    hoveredA ? deltas.find(d => d.districtId === hoveredA) :
    hoveredB ? deltas.find(d => d.matchedBId === hoveredB) :
    null
  );

  // ── Changed districts spotlight ──────────────────────────────────────────
  const changedDeltas = $derived(
    deltas
      .filter(d => Math.abs(d.deltaPartisanLean) > 5 || Math.abs(d.deltaMinorityVapPct) > 5)
      .sort((a, b) => Math.abs(b.deltaPartisanLean) - Math.abs(a.deltaPartisanLean))
  );

  // ── AI Narrative ─────────────────────────────────────────────────────────
  let narrative = $state<NarrativeReport | null>(null);
  let narrativeLoading = $state(false);
  let narrativeError = $state<string | null>(null);

  async function runGenerateNarrative() {
    narrativeLoading = true;
    narrativeError = null;
    try {
      const payload: AnalyzePayload = {
        planA: { name: planA.entry.name, year: planA.entry.year },
        planB: { name: planB.entry.name, year: planB.entry.year },
        metricsA: {
          popDevMax:       sA.maxDev,
          polsbyPopper:    avgPPA,
          convexHullRatio: avgCHRA,
          countySplits:    countySplitsA ?? 0,
          mmDistricts:     sA.mmDistricts,
          bvapMaj:         sA.bvapMaj,
          demSeats:        sA.demSeats,
          efficiencyGap:   fairnessA.efficiencyGap * 100,
          meanMedian:      fairnessA.meanMedian * 100,
          partisanBias:    biasA,
        },
        metricsB: {
          popDevMax:       sB.maxDev,
          polsbyPopper:    avgPPB,
          convexHullRatio: avgCHRB,
          countySplits:    countySplitsB ?? 0,
          mmDistricts:     sB.mmDistricts,
          bvapMaj:         sB.bvapMaj,
          demSeats:        sB.demSeats,
          efficiencyGap:   fairnessB.efficiencyGap * 100,
          meanMedian:      fairnessB.meanMedian * 100,
          partisanBias:    biasB,
        },
        topChanges: changedDeltas.slice(0, 12).map(d => ({
          id:          d.districtId,
          matchedBId:  d.matchedBId,
          renumbered:  d.isRenumbered,
          leanA:       fmtLean(d.a.partisanLean),
          leanB:       fmtLean(d.b.partisanLean),
          bvapA:       (d.a.vap > 0 ? (d.a.blackVap / d.a.vap) * 100 : 0).toFixed(1),
          bvapB:       (d.b.vap > 0 ? (d.b.blackVap / d.b.vap) * 100 : 0).toFixed(1),
        })),
        totalDistricts:      sA.n,
        significantlyChanged: changedDeltas.length,
      };
      narrative = await generateNarrative(payload);
    } catch (e: any) {
      narrativeError = e.message ?? 'Failed to generate analysis';
    } finally {
      narrativeLoading = false;
    }
  }

  // ── Export ───────────────────────────────────────────────────────────────

  function exportCsv() {
    const rows = sortedDeltas.map(d => {
      const bA = d.a.vap > 0 ? (d.a.blackVap / d.a.vap) * 100 : 0;
      const bB = d.b.vap > 0 ? (d.b.blackVap / d.b.vap) * 100 : 0;
      const ppA = (compactnessA.get(d.districtId)?.polsbyPopper ?? 0).toFixed(3);
      const ppB = (compactnessB.get(d.matchedBId)?.polsbyPopper ?? 0).toFixed(3);
      return [
        d.districtId,
        d.isRenumbered ? d.matchedBId : '',
        d.a.totalPop, d.b.totalPop,
        bA.toFixed(1), bB.toFixed(1),
        d.a.minorityVapPct.toFixed(1), d.b.minorityVapPct.toFixed(1),
        d.a.partisanLean.toFixed(1), d.b.partisanLean.toFixed(1),
        ppA, ppB
      ].join(',');
    });
    const header = 'District A,District B (if renumbered),Pop A,Pop B,BVAP% A,BVAP% B,Min% A,Min% B,Lean A,Lean B,PP A,PP B';
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

  <!-- ── AI Narrative ── -->
  <section class="bg-gradient-to-br from-indigo-50 to-white rounded-2xl border border-indigo-200 shadow-sm overflow-hidden">
    <div class="px-5 py-3 border-b border-indigo-100 bg-indigo-50/50 flex items-center justify-between gap-4 flex-wrap">
      <div>
        <h3 class="text-sm font-bold text-indigo-900">AI Analysis</h3>
        <p class="text-[11px] text-indigo-400 mt-0.5">Nonpartisan AI assessment · configure AI_PROVIDER and AI_API_KEY in .env</p>
      </div>
      {#if !narrative && !narrativeLoading}
        <button
          onclick={runGenerateNarrative}
          class="shrink-0 flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-medium transition-colors print:hidden"
        >
          <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
          Generate Analysis
        </button>
      {/if}
    </div>

    {#if narrativeLoading}
      <div class="px-5 py-8 flex items-center gap-3 text-indigo-500">
        <svg class="animate-spin w-5 h-5 shrink-0" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
        </svg>
        <span class="text-sm italic">Generating analysis… this may take 5–15 seconds</span>
      </div>
    {:else if narrativeError}
      <div class="px-5 py-4 text-sm text-red-600 flex items-start gap-2">
        <span class="shrink-0 font-bold mt-0.5">!</span>
        <div>
          <p>{narrativeError}</p>
          <button onclick={runGenerateNarrative} class="mt-1 text-xs text-red-500 underline print:hidden">Try again</button>
        </div>
      </div>
    {:else if narrative}
      <div class="p-5 space-y-4">
        <p class="text-sm text-gray-800 leading-relaxed">{narrative.execSummary}</p>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
          <div>
            <h4 class="text-[10px] font-bold text-indigo-600 uppercase tracking-wider mb-1">Demographic Impact</h4>
            <p class="text-xs text-gray-700 leading-relaxed">{narrative.demographicImpact}</p>
          </div>
          <div>
            <h4 class="text-[10px] font-bold text-indigo-600 uppercase tracking-wider mb-1">Partisan Impact</h4>
            <p class="text-xs text-gray-700 leading-relaxed">{narrative.partisanImpact}</p>
          </div>
          <div>
            <h4 class="text-[10px] font-bold text-indigo-600 uppercase tracking-wider mb-1">Geographic Compactness</h4>
            <p class="text-xs text-gray-700 leading-relaxed">{narrative.compactnessNotes}</p>
          </div>
          <div>
            <h4 class="text-[10px] font-bold text-indigo-600 uppercase tracking-wider mb-1">VRA Considerations</h4>
            <p class="text-xs text-gray-700 leading-relaxed">{narrative.vraConsiderations}</p>
          </div>
        </div>
        {#if narrative.keyFindings?.length}
          <div class="border-t border-indigo-100 pt-3">
            <h4 class="text-[10px] font-bold text-indigo-600 uppercase tracking-wider mb-2">Key Findings</h4>
            <ul class="space-y-1.5">
              {#each narrative.keyFindings as finding}
                <li class="text-xs text-gray-700 leading-relaxed flex gap-2">
                  <span class="text-indigo-400 font-bold shrink-0 mt-0.5">▸</span>
                  <span>{finding}</span>
                </li>
              {/each}
            </ul>
          </div>
        {/if}
        <button onclick={() => { narrative = null; }} class="text-[10px] text-gray-400 hover:text-gray-600 transition-colors print:hidden">
          ↺ Regenerate
        </button>
      </div>
    {:else}
      <div class="px-5 py-5 text-center text-sm text-indigo-300 italic print:hidden">
        Click "Generate Analysis" to get an AI-powered nonpartisan assessment of these redistricting changes.
      </div>
      <div class="hidden print:block px-5 py-3 text-xs text-gray-400 italic">
        AI analysis not generated for this report.
      </div>
    {/if}
  </section>

  <!-- ── Maps ── -->
  <div class="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden print:overflow-visible">
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
    <!-- Leaflet maps: screen only -->
    <div class="grid grid-cols-2 print:hidden" style="height: 260px;">
      <div class="border-r border-gray-200 h-full">
        <MapPane
          geojson={planA.geojson}
          metrics={planA.metrics}
          {colorBy}
          label={planA.entry.name}
          onMapReady={onMapReadyA}
          onHover={(id) => (hoveredA = id)}
          highlightedId={hlA}
        />
      </div>
      <div class="h-full">
        <MapPane
          geojson={planB.geojson}
          metrics={planB.metrics}
          {colorBy}
          label={planB.entry.name}
          onMapReady={onMapReadyB}
          onHover={(id) => (hoveredB = id)}
          highlightedId={hlB}
        />
      </div>
    </div>

    <!-- Hover comparison panel: screen only -->
    {#if hoveredDelta}
      {@const bvapA = hoveredDelta.a.vap > 0 ? (hoveredDelta.a.blackVap / hoveredDelta.a.vap) * 100 : 0}
      {@const bvapB = hoveredDelta.b.vap > 0 ? (hoveredDelta.b.blackVap / hoveredDelta.b.vap) * 100 : 0}
      <div class="px-5 py-2 bg-indigo-50 border-t border-indigo-100 text-xs flex gap-4 flex-wrap items-center print:hidden">
        <span class="font-bold text-gray-800">
          D{hoveredDelta.districtId}{hoveredDelta.isRenumbered ? ` → B-D${hoveredDelta.matchedBId}` : ''}
        </span>
        <span>
          Lean:
          <span class="{leanClass(hoveredDelta.a.partisanLean)} font-bold">{fmtLean(hoveredDelta.a.partisanLean)}</span>
          →
          <span class="{leanClass(hoveredDelta.b.partisanLean)} font-bold">{fmtLean(hoveredDelta.b.partisanLean)}</span>
        </span>
        <span>Pop: {fmtN(hoveredDelta.a.totalPop)} → {fmtN(hoveredDelta.b.totalPop)}</span>
        <span>Black VAP: {bvapA.toFixed(1)}% → {bvapB.toFixed(1)}%</span>
        <span>Minority VAP: {hoveredDelta.a.minorityVapPct.toFixed(1)}% → {hoveredDelta.b.minorityVapPct.toFixed(1)}%</span>
      </div>
    {/if}

    <!-- SVG maps: print only -->
    <div class="hidden print:grid print:grid-cols-2 gap-4 px-4 py-3">
      <SvgMap
        geojson={planA.geojson}
        metrics={planA.metrics}
        {colorBy}
        label={planA.entry.name}
        width={340}
        height={230}
      />
      <SvgMap
        geojson={planB.geojson}
        metrics={planB.metrics}
        {colorBy}
        label={planB.entry.name}
        width={340}
        height={230}
      />
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

  <!-- ── Changed Districts Spotlight ── -->
  {#if changedDeltas.length > 0}
  <section class="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden print:overflow-visible">
    <div class="px-5 py-3 border-b border-gray-100 bg-gray-50">
      <h3 class="text-sm font-semibold text-gray-800">
        Changed Districts
        <span class="ml-1.5 text-xs font-normal text-gray-400">({changedDeltas.length} of {deltas.length} shifted &gt;5pp)</span>
      </h3>
      <p class="text-[11px] text-gray-400 mt-0.5">
        Left map: Plan A boundaries colored by partisan shift. Blue = D gain, red = R gain, gray = stable (&lt;5pp). Amber badge = minority VAP shift &gt;5pp (VRA-relevant).
      </p>
    </div>
    <div class="p-5">
      <div class="flex gap-6 flex-wrap">
        <!-- Delta choropleth -->
        <div class="shrink-0">
          <SvgMap
            geojson={planA.geojson}
            metrics={planA.metrics}
            colorBy="delta"
            {deltas}
            width={260}
            height={200}
          />
          <div class="flex items-center gap-2.5 mt-1.5 flex-wrap text-[10px] text-gray-500">
            <span class="flex items-center gap-1"><span class="w-3 h-2 rounded-sm bg-[#1d4ed8] inline-block"></span>D+10+</span>
            <span class="flex items-center gap-1"><span class="w-3 h-2 rounded-sm bg-[#93c5fd] inline-block"></span>D+5–10</span>
            <span class="flex items-center gap-1"><span class="w-3 h-2 rounded-sm bg-[#d1d5db] inline-block"></span>Stable</span>
            <span class="flex items-center gap-1"><span class="w-3 h-2 rounded-sm bg-[#fca5a5] inline-block"></span>R+5–10</span>
            <span class="flex items-center gap-1"><span class="w-3 h-2 rounded-sm bg-[#b91c1c] inline-block"></span>R+10+</span>
          </div>
        </div>
        <!-- Changed district cards -->
        <div class="flex-1 min-w-[260px]">
          <div class="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {#each changedDeltas as d}
              {@const bvapA = d.a.vap > 0 ? (d.a.blackVap / d.a.vap) * 100 : 0}
              {@const bvapB = d.b.vap > 0 ? (d.b.blackVap / d.b.vap) * 100 : 0}
              <div class="border rounded-xl p-2.5 {d.minorityFlagged ? 'bg-amber-50 border-amber-200' : 'bg-gray-50 border-gray-200'}">
                <div class="flex items-center gap-1 mb-1">
                  <span class="text-[11px] font-bold text-gray-800">D{d.districtId}</span>
                  {#if d.isRenumbered}
                    <span class="text-[9px] text-violet-600 font-medium">→{d.matchedBId}</span>
                  {/if}
                  {#if d.minorityFlagged}
                    <span class="ml-auto text-[9px] bg-amber-200 text-amber-700 px-1 rounded font-bold">VRA</span>
                  {/if}
                </div>
                <div class="text-[11px] flex items-center gap-1">
                  <span class="{leanClass(d.a.partisanLean)}">{fmtLean(d.a.partisanLean)}</span>
                  <span class="text-gray-300">→</span>
                  <span class="{leanClass(d.b.partisanLean)} font-semibold">{fmtLean(d.b.partisanLean)}</span>
                </div>
                <div class="text-[10px] text-gray-500 mt-0.5">
                  BVAP: {bvapA.toFixed(1)}% → <span class="{bValClass(bvapB - bvapA)}">{bvapB.toFixed(1)}%</span>
                </div>
              </div>
            {/each}
          </div>
        </div>
      </div>
    </div>
  </section>
  {/if}

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

  <!-- ── VRA Threshold Analysis (R script 4 / script 8 equivalents) ── -->
  <section class="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden print:overflow-visible">
    <div class="px-5 py-3 border-b border-gray-100 bg-gray-50">
      <h3 class="text-sm font-semibold text-gray-800">VRA Threshold Analysis</h3>
      <p class="text-[11px] text-gray-400 mt-0.5">
        District counts by demographic and partisan thresholds. Majority ≥50%, Influence 37%–50%.
      </p>
    </div>
    <div class="p-5 space-y-4">
      <!-- Threshold table -->
      <div class="overflow-x-auto">
        <table class="w-full text-xs border-collapse">
          <thead>
            <tr class="border-b border-gray-200 bg-gray-50">
              <th class="px-3 py-2 text-left text-gray-600 font-semibold">Category</th>
              <th class="px-3 py-2 text-center text-blue-600 font-semibold">Plan A</th>
              <th class="px-3 py-2 text-center text-amber-600 font-semibold">Plan B</th>
              <th class="px-3 py-2 text-center text-gray-400 font-semibold">Δ</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-100">
            {#each [
              { label: 'Competitive Districts (46.5%–53.5% Dem)', a: threshA.competitive,   b: threshB.competitive },
              { label: 'Democratic Districts (≥50% Dem)',         a: threshA.demDistricts,  b: threshB.demDistricts },
              { label: 'Republican Districts (<50% Dem)',         a: threshA.repDistricts,  b: threshB.repDistricts },
              { label: '─ BVAP Majority (≥50%)',                  a: threshA.bvapMaj,       b: threshB.bvapMaj },
              { label: '─ BVAP Influence (37%–50%)',              a: threshA.bvapInf,       b: threshB.bvapInf },
              { label: '─ MVAP Majority (≥50%)',                  a: threshA.mvapMaj,       b: threshB.mvapMaj },
              { label: '─ MVAP Influence (37%–50%)',              a: threshA.mvapInf,       b: threshB.mvapInf },
              { label: '─ HVAP Majority (≥50%)',                  a: threshA.hvapMaj,       b: threshB.hvapMaj },
              { label: '─ HVAP Influence (37%–50%)',              a: threshA.hvapInf,       b: threshB.hvapInf },
              { label: '─ AVAP Majority (≥50%)',                  a: threshA.avapMaj,       b: threshB.avapMaj },
              { label: '─ AVAP Influence (37%–50%)',              a: threshA.avapInf,       b: threshB.avapInf },
            ] as row}
              {@const diff = row.b - row.a}
              <tr class="hover:bg-gray-50">
                <td class="px-3 py-1.5 text-gray-700">{row.label}</td>
                <td class="px-3 py-1.5 text-center font-semibold text-blue-700">{row.a}</td>
                <td class="px-3 py-1.5 text-center font-semibold text-amber-600">{row.b}</td>
                <td class="px-3 py-1.5 text-center font-semibold {diff > 0 ? 'text-emerald-600' : diff < 0 ? 'text-red-600' : 'text-gray-400'}">
                  {diff > 0 ? `+${diff}` : diff === 0 ? '—' : diff}
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>

      <!-- Safety tier breakdown (R script 8 equivalent) -->
      <div>
        <p class="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">Partisan Safety Tiers</p>
        <div class="overflow-x-auto">
          <table class="w-full text-xs border-collapse">
            <thead>
              <tr class="border-b border-gray-200 bg-gray-50">
                <th class="px-3 py-1.5 text-left text-gray-600 font-semibold">Tier</th>
                <th class="px-3 py-1.5 text-center text-blue-600 font-semibold">Plan A</th>
                <th class="px-3 py-1.5 text-center text-amber-600 font-semibold">Plan B</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-100">
              {#each [
                { tier: 'Safe R',        color: 'text-red-700',    bgA: '#bc131e' },
                { tier: 'Lean R',        color: 'text-red-500',    bgA: '#eb4956' },
                { tier: 'Competitive R', color: 'text-pink-600',   bgA: '#c36e9e' },
                { tier: 'Competitive D', color: 'text-indigo-500', bgA: '#7279db' },
                { tier: 'Lean D',        color: 'text-blue-600',   bgA: '#3c6ebf' },
                { tier: 'Safe D',        color: 'text-blue-800',   bgA: '#1f4bae' },
              ] as row}
                <tr class="hover:bg-gray-50">
                  <td class="px-3 py-1.5 flex items-center gap-2">
                    <span class="w-3 h-3 rounded-sm shrink-0" style="background:{row.bgA}"></span>
                    <span class="{row.color} font-medium">{row.tier}</span>
                  </td>
                  <td class="px-3 py-1.5 text-center font-semibold text-blue-700">{threshA.safetyTiers[row.tier] ?? 0}</td>
                  <td class="px-3 py-1.5 text-center font-semibold text-amber-600">{threshB.safetyTiers[row.tier] ?? 0}</td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      </div>
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
  <section class="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden print:overflow-visible">
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
    <div class="overflow-x-auto print:overflow-visible px-4 py-4">
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
          {@const delta = deltas.find(d => d.districtId === distId)}
          {@const mA = delta?.a}
          {@const mB = delta?.b}
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
  <section class="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden print:overflow-visible">
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

  <!-- ── District comparison table (2-column layout) ── -->
  <section class="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden print:overflow-visible">
    <div class="px-5 py-3 border-b border-gray-100 bg-gray-50 flex items-center justify-between flex-wrap gap-3">
      <div>
        <h3 class="text-sm font-semibold text-gray-800">District-Level Comparison</h3>
        <p class="text-[11px] text-gray-400 mt-0.5">
          {sortedDeltas.length} districts · click headers to sort ·
          <span class="text-amber-600">amber rows</span> = minority VAP shift &gt;5pp ·
          <span class="text-violet-600 font-medium">R</span> = renumbered district (spatially matched)
        </p>
      </div>
      <div class="flex items-center gap-4 text-[11px] text-gray-500 flex-wrap">
        <span><span class="text-blue-600 font-bold">A</span> = Baseline &nbsp;·&nbsp; <span class="text-amber-600 font-bold">B</span> = Comparison</span>
        <span class="text-emerald-600 font-semibold">↑</span> = B higher &nbsp;
        <span class="text-red-500 font-semibold">↓</span> = B lower
      </div>
    </div>

    <div class="grid grid-cols-2 divide-x divide-gray-200">
      {#each [leftDeltas, rightDeltas] as half}
        <div class="overflow-x-auto print:overflow-visible">
          <table class="w-full text-[11px] border-collapse">
            <thead>
              <tr class="border-b border-gray-200 bg-gray-50 text-gray-500 sticky top-0">
                <th
                  class="px-2 py-2 text-left font-semibold cursor-pointer hover:bg-gray-100 whitespace-nowrap"
                  onclick={() => toggleSort('id')}
                >D#{sortIcon('id')}</th>
                <th class="px-1 py-2 text-right text-blue-600 font-semibold">Pop A</th>
                <th
                  class="px-1 py-2 text-right font-semibold cursor-pointer hover:bg-gray-100 whitespace-nowrap"
                  onclick={() => toggleSort('pop_b')}
                >Pop B{sortIcon('pop_b')}</th>
                <th class="px-1 py-2 text-right font-semibold whitespace-nowrap" title="Pop B deviation from ideal district size">Pop Dev%</th>
                <th
                  class="px-1 py-2 text-right text-blue-600 font-semibold cursor-pointer hover:bg-gray-100 whitespace-nowrap"
                  onclick={() => toggleSort('lean_a')}
                >Lean A{sortIcon('lean_a')}</th>
                <th
                  class="px-1 py-2 text-right font-semibold cursor-pointer hover:bg-gray-100 whitespace-nowrap"
                  onclick={() => toggleSort('lean_b')}
                >Lean B{sortIcon('lean_b')}</th>
                <th class="px-1 py-2 text-left font-semibold whitespace-nowrap text-gray-400">Partisan Δ</th>
                <th
                  class="px-1 py-2 text-right text-blue-600 font-semibold cursor-pointer hover:bg-gray-100 whitespace-nowrap"
                  onclick={() => toggleSort('bvap_a')}
                >BVAP A{sortIcon('bvap_a')}</th>
                <th
                  class="px-1 py-2 text-right font-semibold cursor-pointer hover:bg-gray-100 whitespace-nowrap"
                  onclick={() => toggleSort('bvap_b')}
                >BVAP B{sortIcon('bvap_b')}</th>
                <th class="px-1 py-2 text-left font-semibold whitespace-nowrap text-gray-400">BVAP Δ</th>
                <th class="px-1 py-2 text-left font-semibold whitespace-nowrap text-gray-400">MVAP Δ</th>
                <th
                  class="px-1 py-2 text-right text-blue-600 font-semibold cursor-pointer hover:bg-gray-100"
                  onclick={() => toggleSort('pp_b')}
                  title="Polsby-Popper compactness"
                >PP A</th>
                <th
                  class="px-1 py-2 text-right font-semibold cursor-pointer hover:bg-gray-100"
                  onclick={() => toggleSort('pp_b')}
                  title="Polsby-Popper compactness"
                >PP B{sortIcon('pp_b')}</th>
              </tr>
            </thead>
            <tbody>
              {#each half as d (d.districtId)}
                {@const bvapA = d.a.vap > 0 ? (d.a.blackVap / d.a.vap) * 100 : 0}
                {@const bvapB = d.b.vap > 0 ? (d.b.blackVap / d.b.vap) * 100 : 0}
                {@const ppA  = compactnessA.get(d.districtId)?.polsbyPopper ?? 0}
                {@const ppB  = compactnessB.get(d.matchedBId)?.polsbyPopper ?? 0}
                <tr class="border-b border-gray-100 hover:bg-gray-50 transition-colors {d.minorityFlagged ? 'bg-amber-50 hover:bg-amber-100' : ''}">
                  <!-- District ID + renumbering badge -->
                  <td class="px-2 py-1.5 font-bold text-gray-800 whitespace-nowrap">
                    {d.districtId}
                    {#if d.isRenumbered}
                      <span class="ml-0.5 text-[9px] text-violet-600 font-bold align-top" title="Spatially matched to Plan B district {d.matchedBId}">→{d.matchedBId}</span>
                    {/if}
                  </td>
                  <!-- Population -->
                  <td class="px-1 py-1.5 text-right font-mono text-blue-700 tabular-nums">{fmtN(d.a.totalPop)}</td>
                  <td class="px-1 py-1.5 text-right font-mono tabular-nums {bPopClass(d.deltaPop)}">
                    {fmtN(d.b.totalPop)}{arrow(d.deltaPop, 50)}
                  </td>
                  <!-- Pop deviation from ideal (R script 7 equivalent) -->
                  <td class="px-1 py-1.5 text-right font-mono tabular-nums text-[10px] {Math.abs(d.popDeviationPct) > 0.05 ? 'text-red-600 font-semibold' : 'text-gray-400'}">
                    {d.popDeviationPct >= 0 ? '+' : ''}{(d.popDeviationPct * 100).toFixed(1)}%
                  </td>
                  <!-- Partisan lean -->
                  <td class="px-1 py-1.5 text-right font-mono tabular-nums {leanClass(d.a.partisanLean)}">{fmtLean(d.a.partisanLean)}</td>
                  <td class="px-1 py-1.5 text-right font-mono tabular-nums {leanClass(d.b.partisanLean)}">
                    {fmtLean(d.b.partisanLean)}{arrow(d.deltaPartisanLean)}
                  </td>
                  <!-- Partisan flip label (R script 7 equivalent) -->
                  <td class="px-1 py-1.5 text-[10px] whitespace-nowrap {d.partisanFlipLabel === 'Gained Dem' ? 'text-blue-700 font-semibold' : d.partisanFlipLabel === 'Lost Dem' ? 'text-red-600 font-semibold' : 'text-gray-300'}">
                    {d.partisanFlipLabel || '—'}
                  </td>
                  <!-- Black VAP % -->
                  <td class="px-1 py-1.5 text-right font-mono tabular-nums text-blue-700 {bvapA > 50 ? 'font-bold' : ''}">{bvapA.toFixed(1)}%</td>
                  <td class="px-1 py-1.5 text-right font-mono tabular-nums {bValClass(bvapB - bvapA)} {bvapB > 50 ? 'font-bold' : ''}">
                    {bvapB.toFixed(1)}%{arrow(bvapB - bvapA)}
                  </td>
                  <!-- BVAP change label (R script 7 equivalent) -->
                  <td class="px-1 py-1.5 text-[10px] whitespace-nowrap {d.bvapChangeLabel.includes('Gained') ? 'text-emerald-700 font-semibold' : d.bvapChangeLabel.includes('Lost') ? 'text-red-600 font-semibold' : 'text-gray-300'}">
                    {d.bvapChangeLabel || '—'}
                  </td>
                  <!-- MVAP change label (R script 7 equivalent) -->
                  <td class="px-1 py-1.5 text-[10px] whitespace-nowrap {d.mvapChangeLabel.includes('Gained') ? 'text-emerald-700 font-semibold' : d.mvapChangeLabel.includes('Lost') ? 'text-red-600 font-semibold' : 'text-gray-300'}">
                    {d.mvapChangeLabel || '—'}
                  </td>
                  <!-- Polsby-Popper -->
                  <td class="px-1 py-1.5 text-right font-mono tabular-nums text-blue-700">{ppA.toFixed(3)}</td>
                  <td class="px-1 py-1.5 text-right font-mono tabular-nums {bValClass(ppB - ppA, 0.01)}">{ppB.toFixed(3)}{arrow(ppB - ppA, 0.01)}</td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      {/each}
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
