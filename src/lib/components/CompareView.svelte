<script lang="ts">
  import { onMount } from 'svelte';
  import L from 'leaflet';
  import ReportView from './ReportView.svelte';
  import MapPane from './MapPane.svelte';
  import { metricsFromGeoJsonProperties, buildDeltas, computeThresholds } from '../utils/spatialAnalysis';
  import { computeFairness } from '../utils/fairnessMetrics';
  import {
    computeCompactness,
    countySplitsCount,
    avgScore
  } from '../utils/compactnessMetrics';
  import type { DistrictCompactness } from '../utils/compactnessMetrics';
  import type { DistrictMetrics, DistrictDelta, FairnessMetrics } from '../types';
  import type { DisplacementMetrics, DistrictDisplacement } from '../types/cdm';
  import { computeDisplacement } from '../utils/displacementMetrics';
  import { getPlanCache, savePlanCache } from '../utils/db';

  interface CatalogEntry {
    filename: string;
    name: string;
    chamber: 'senate' | 'house' | 'congress' | 'custom';
    year: number;
    provenance: string;
    tags: string[];
  }

  interface LoadedPlan {
    entry: CatalogEntry;
    geojson: GeoJSON.FeatureCollection;
    metrics: Map<string, DistrictMetrics>;
  }

  let catalog = $state<CatalogEntry[]>([]);
  let loadingFileA = $state<string | null>(null);
  let loadingFileB = $state<string | null>(null);
  let loadError = $state<string | null>(null);
  let planA = $state<LoadedPlan | null>(null);
  let planB = $state<LoadedPlan | null>(null);
  let colorBy = $state<'partisan' | 'minority_vap' | 'pop'>('partisan');

  // Report state
  let reportMode = $state(false);
  let reportGenerating = $state(false);
  let compactnessA = $state<Map<string, DistrictCompactness> | null>(null);
  let compactnessB = $state<Map<string, DistrictCompactness> | null>(null);
  let countySplitsA = $state<number | null>(null);
  let countySplitsB = $state<number | null>(null);
  let displacement = $state<DisplacementMetrics | null>(null);
  let displacementDistricts = $state<DistrictDisplacement[]>([]);
  let bothCached = $state(false); // true when both selected plans have cached results

  const geoCache = new Map<string, GeoJSON.FeatureCollection>();
  let openSections = $state(new Set<string>(['congress', 'senate', 'house']));

  // Busy cursor + pointer-lock during report generation
  $effect(() => {
    document.body.style.cursor = reportGenerating ? 'wait' : '';
    return () => { document.body.style.cursor = ''; };
  });

  // Check IDB cache whenever plan selection changes
  $effect(() => {
    const a = planA?.entry.filename;
    const b = planB?.entry.filename;
    if (!a || !b) { bothCached = false; return; }
    Promise.all([getPlanCache(a), getPlanCache(b)])
      .then(([ca, cb]) => { bothCached = !!(ca && cb); })
      .catch(() => { bothCached = false; });
  });

  let mapA: L.Map | null = null;
  let mapB: L.Map | null = null;
  let syncing = false;

  let previewHoverA = $state<string | null>(null);
  let previewHoverB = $state<string | null>(null);
  const previewHlA = $derived(
    previewHoverA ?? (previewHoverB ? (deltas.find((d: any) => d.matchedBId === previewHoverB)?.districtId ?? null) : null)
  );
  const previewHlB = $derived(
    previewHoverA ? (deltas.find((d: any) => d.districtId === previewHoverA)?.matchedBId ?? null) : previewHoverB
  );

  function toggleSection(id: string) {
    const next = new Set(openSections);
    next.has(id) ? next.delete(id) : next.add(id);
    openSections = next;
  }

  function onMapAReady(map: L.Map) {
    mapA = map;
    if (mapB) { bindSync(mapA, mapB); bindSync(mapB, mapA); }
  }
  function onMapBReady(map: L.Map) {
    mapB = map;
    if (mapA) { bindSync(mapA, mapB); bindSync(mapB, mapA); }
  }
  function bindSync(src: L.Map, tgt: L.Map) {
    src.on('move', () => {
      if (syncing) return;
      syncing = true;
      tgt.setView(src.getCenter(), src.getZoom(), { animate: false });
      syncing = false;
    });
  }

  async function loadPlan(entry: CatalogEntry): Promise<LoadedPlan> {
    let geojson = geoCache.get(entry.filename);
    if (!geojson) {
      const resp = await fetch(`${import.meta.env.BASE_URL}data/${entry.filename}`);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      geojson = await resp.json() as GeoJSON.FeatureCollection;
      geoCache.set(entry.filename, geojson);
    }
    return { entry, geojson, metrics: metricsFromGeoJsonProperties(geojson) };
  }

  async function selectPlan(entry: CatalogEntry) {
    // Block double-loading the same file
    if (loadingFileA === entry.filename || loadingFileB === entry.filename) return;

    // Deselect if already selected
    if (planA?.entry.filename === entry.filename) {
      planA = planB;
      planB = null;
      loadError = null;
      reportMode = false;
      compactnessA = null; compactnessB = null;
      countySplitsA = null; countySplitsB = null;
      displacement = null; displacementDistricts = [];
      return;
    }
    if (planB?.entry.filename === entry.filename) {
      planB = null;
      loadError = null;
      reportMode = false;
      compactnessB = null; countySplitsB = null;
      displacement = null; displacementDistricts = [];
      return;
    }

    // Chamber restriction: Plan B must match Plan A's chamber
    const chamberA = planA?.entry.chamber ?? catalog.find(e => e.filename === loadingFileA)?.chamber;
    if (chamberA && entry.chamber !== chamberA) {
      loadError = `Chamber mismatch: cannot compare a ${chamberLabels[chamberA]} plan with a ${chamberLabels[entry.chamber]} plan. Select another ${chamberLabels[chamberA]} plan, or deselect Plan A first.`;
      return;
    }

    loadError = null;
    reportMode = false;
    compactnessA = null; compactnessB = null;
    countySplitsA = null; countySplitsB = null;

    // Determine slot BEFORE the async fetch to avoid race conditions
    const isSlotA = !planA && !loadingFileA;
    if (isSlotA) loadingFileA = entry.filename;
    else loadingFileB = entry.filename;

    try {
      const loaded = await loadPlan(entry);
      if (isSlotA) planA = loaded;
      else planB = loaded;
    } catch (e) {
      loadError = `Failed to load "${entry.name}": ${e instanceof Error ? e.message : String(e)}`;
    }
    if (isSlotA) loadingFileA = null;
    else loadingFileB = null;
  }

  async function generateReport() {
    if (!planA || !planB || reportGenerating) return;
    reportGenerating = true;
    loadError = null;

    const countyUrl = `${import.meta.env.BASE_URL}data/county.geojson`;

    // Check cache for plan A
    const cachedA = await getPlanCache(planA.entry.filename);
    if (cachedA) {
      compactnessA = new Map(Object.entries(cachedA.compactness));
      countySplitsA = cachedA.countySplits;
    } else {
      // Synchronous compactness (may take 1-3s for large plans)
      compactnessA = computeCompactness(planA.geojson);
    }

    // Check cache for plan B
    const cachedB = await getPlanCache(planB.entry.filename);
    if (cachedB) {
      compactnessB = new Map(Object.entries(cachedB.compactness));
      countySplitsB = cachedB.countySplits;
    } else {
      compactnessB = computeCompactness(planB.geojson);
    }

    // Displacement metric — runs after compactness so it doesn't block the report render
    displacement = null;
    displacementDistricts = [];
    try {
      const { summary, districts } = computeDisplacement(
        planA.geojson, planB.geojson,
        planA.entry.filename, planB.entry.filename,
      );
      displacement = summary;
      displacementDistricts = districts;
    } catch {
      displacement = null;
      displacementDistricts = [];
    }

    reportMode = true;
    reportGenerating = false;

    // County splits: async, only fetch if not already cached
    const fetchAndCacheSplits = async (
      geojson: GeoJSON.FeatureCollection,
      filename: string,
      compactness: Map<string, DistrictCompactness>,
      cached: boolean,
      setSplits: (n: number) => void
    ) => {
      if (cached) return; // already set from cache
      try {
        const n = await countySplitsCount(geojson, countyUrl);
        setSplits(n);
        await savePlanCache({
          filename,
          compactness: Object.fromEntries(compactness),
          countySplits: n,
          cachedAt: new Date().toISOString()
        });
      } catch {
        setSplits(-1);
        // Save compactness without splits so at least that's cached
        await savePlanCache({
          filename,
          compactness: Object.fromEntries(compactness),
          countySplits: null,
          cachedAt: new Date().toISOString()
        }).catch(() => {});
      }
    };

    fetchAndCacheSplits(
      planA.geojson, planA.entry.filename, compactnessA!, !!cachedA,
      n => (countySplitsA = n)
    );
    fetchAndCacheSplits(
      planB.geojson, planB.entry.filename, compactnessB!, !!cachedB,
      n => (countySplitsB = n)
    );
  }

  const grouped = $derived({
    congress: catalog.filter(e => e.chamber === 'congress'),
    senate: catalog.filter(e => e.chamber === 'senate'),
    house: catalog.filter(e => e.chamber === 'house'),
    custom: catalog.filter(e => e.chamber === 'custom'),
  });



  const deltas = $derived(
    planA && planB
      ? buildDeltas(planA.geojson, planA.metrics, planB.geojson, planB.metrics)
      : []
  );

  const fairnessA = $derived(planA ? computeFairness([...planA.metrics.values()]) : null);
  const fairnessB = $derived(planB ? computeFairness([...planB.metrics.values()]) : null);

  function planStats(p: LoadedPlan) {
    const ms = [...p.metrics.values()];
    const n = ms.length;
    if (!n) return null;
    const pops = ms.map(m => m.totalPop);
    const total = pops.reduce((s, v) => s + v, 0);
    const ideal = total / n;
    const maxDev = Math.max(...pops.map(p => ideal > 0 ? Math.abs(p - ideal) / ideal : 0)) * 100;
    const thresh = computeThresholds(ms);
    return {
      n, ideal, maxDev,
      mmDistricts: thresh.mvapMaj,
      bvapMaj: thresh.bvapMaj,
      demSeats: thresh.demDistricts,
      repSeats: thresh.repDistricts,
      competitive: thresh.competitive
    };
  }

  const statsA = $derived(planA ? planStats(planA) : null);
  const statsB = $derived(planB ? planStats(planB) : null);

  onMount(async () => {
    try {
      const resp = await fetch(`${import.meta.env.BASE_URL}data-catalog.json`);
      catalog = await resp.json();
    } catch {
      loadError = 'Could not load plan catalog.';
    }
  });

  const chamberLabels: Record<string, string> = {
    congress: 'US Congress', senate: 'State Senate', house: 'State House', custom: 'Geography',
  };
  const chamberHeaderColor: Record<string, string> = {
    congress: 'text-purple-600', senate: 'text-blue-600', house: 'text-green-600', custom: 'text-gray-500',
  };
</script>

<div class="flex h-full overflow-hidden print:block print:h-auto print:overflow-visible">
  <!-- ─── Sidebar ─── -->
  <aside class="w-72 flex-shrink-0 bg-white border-r border-gray-200 flex flex-col overflow-hidden select-none print:hidden">
    <div class="px-4 py-3 border-b border-gray-100 bg-gray-50">
      <h2 class="text-sm font-semibold text-gray-700">Plan Browser</h2>
      <p class="text-xs text-gray-400 mt-0.5 leading-tight">
        1st click = baseline <span class="font-bold text-blue-600">A</span>.
        Click a <em>different</em> plan = comparison <span class="font-bold text-amber-500">B</span>.
      </p>
    </div>

    <div class="flex-1 overflow-y-auto">
      {#each (['congress', 'senate', 'house', 'custom'] as const) as chamber}
        {#if grouped[chamber].length > 0}
          <button
            class="w-full flex items-center justify-between px-4 py-2 text-[11px] font-bold uppercase tracking-wider hover:bg-gray-50 transition-colors {chamberHeaderColor[chamber]}"
            onclick={() => toggleSection(chamber)}
          >
            <span>{chamberLabels[chamber]}</span>
            <span class="text-gray-300 text-sm">{openSections.has(chamber) ? '▾' : '▸'}</span>
          </button>

          {#if openSections.has(chamber)}
            {#each grouped[chamber] as entry (entry.filename)}
              {@const isA = planA?.entry.filename === entry.filename}
              {@const isB = planB?.entry.filename === entry.filename}
              {@const isLoading = loadingFileA === entry.filename || loadingFileB === entry.filename}
              {@const isLocked = !!planA && !isA && !isB && entry.chamber !== planA.entry.chamber}
              <button
                class="w-full text-left px-3 py-2.5 flex items-start gap-2.5 transition-colors
                  {isA ? 'bg-blue-50 border-l-2 border-blue-500' : isB ? 'bg-amber-50 border-l-2 border-amber-400' : isLocked ? 'border-l-2 border-transparent opacity-35 cursor-not-allowed' : 'border-l-2 border-transparent hover:bg-gray-50 hover:border-gray-200'}"
                onclick={() => selectPlan(entry)}
                disabled={isLoading || isLocked || reportGenerating}
                title={isLocked ? `Only ${chamberLabels[planA!.entry.chamber]} plans can be compared` : undefined}
              >
                <span class="shrink-0 mt-0.5 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold
                  {isA ? 'bg-blue-600 text-white' : isB ? 'bg-amber-500 text-white' : 'bg-gray-100 text-gray-400'}">
                  {isA ? 'A' : isB ? 'B' : ''}
                </span>
                <div class="min-w-0 flex-1">
                  <p class="text-xs leading-snug {isA || isB ? 'font-semibold text-gray-900' : 'text-gray-700'} truncate">{entry.name}</p>
                  <div class="flex items-center gap-1 mt-0.5 flex-wrap">
                    <span class="text-[10px] text-gray-400">{entry.year}</span>
                    {#if entry.tags.includes('enacted')}
                      <span class="text-[10px] bg-emerald-100 text-emerald-700 px-1 rounded-sm font-medium">enacted</span>
                    {/if}
                    {#if entry.tags.includes('remedy')}
                      <span class="text-[10px] bg-orange-100 text-orange-700 px-1 rounded-sm font-medium">remedy</span>
                    {/if}
                    {#if entry.tags.includes('proposed')}
                      <span class="text-[10px] bg-sky-100 text-sky-700 px-1 rounded-sm font-medium">proposed</span>
                    {/if}
                  </div>
                </div>
                {#if isLoading}
                  <span class="shrink-0 text-[10px] text-gray-400 italic mt-1">loading…</span>
                {/if}
              </button>
            {/each}
          {/if}
        {/if}
      {/each}
    </div>

    <!-- Error message in sidebar (visible where the user is clicking) -->
    {#if loadError}
      <div class="mx-3 mb-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-xs text-red-700 leading-snug">
        {loadError}
      </div>
    {/if}

    <!-- Legend -->
    <div class="px-4 py-3 border-t border-gray-100 bg-gray-50 space-y-1.5">
      <div class="flex items-center gap-2 text-xs text-gray-500">
        <span class="w-5 h-5 rounded-full bg-blue-600 flex items-center justify-center text-white text-[10px] font-bold shrink-0">A</span>
        Baseline (left map)
      </div>
      <div class="flex items-center gap-2 text-xs text-gray-500">
        <span class="w-5 h-5 rounded-full bg-amber-500 flex items-center justify-center text-white text-[10px] font-bold shrink-0">B</span>
        Comparison (right map)
      </div>
      <p class="text-[10px] text-gray-400">Click <strong>A</strong> to deselect. Click <strong>B</strong> to remove comparison.</p>
    </div>
  </aside>

  <!-- ─── Main content ─── -->
  <main class="flex-1 overflow-y-auto bg-gray-50 print:overflow-visible print:h-auto print:w-full relative">

    <!-- Busy overlay: blocks all interaction and shows progress indicator -->
    {#if reportGenerating}
      <div class="absolute inset-0 z-50 bg-white/70 backdrop-blur-sm flex flex-col items-center justify-center gap-4 cursor-wait">
        <svg class="animate-spin w-10 h-10 text-blue-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
        <div class="text-center">
          <p class="text-sm font-semibold text-gray-800">Computing report…</p>
          <p class="text-xs text-gray-500 mt-0.5">Polsby-Popper, compactness, VRA thresholds</p>
        </div>
      </div>
    {/if}

    <!-- Selection header bar -->
    <div class="sticky top-0 z-10 bg-white border-b border-gray-200 px-6 py-3 flex items-center gap-4 flex-wrap shadow-sm print:hidden">
      <div class="flex items-center gap-2.5 min-w-0">
        <span class="w-6 h-6 rounded-full bg-blue-600 flex items-center justify-center text-white text-xs font-bold shrink-0">A</span>
        <div class="min-w-0">
          <p class="text-[10px] text-gray-400 uppercase tracking-wide">Baseline</p>
          <p class="text-sm font-semibold {planA ? 'text-gray-900' : 'text-gray-400'} truncate max-w-xs">
            {planA?.entry.name ?? 'Select a plan in the sidebar →'}
          </p>
        </div>
      </div>

      {#if planA}
        <div class="text-gray-300 font-light text-lg">vs</div>
        <div class="flex items-center gap-2.5 min-w-0">
          <span class="w-6 h-6 rounded-full bg-amber-500 flex items-center justify-center text-white text-xs font-bold shrink-0">B</span>
          <div class="min-w-0">
            <p class="text-[10px] text-gray-400 uppercase tracking-wide">Comparison</p>
            <p class="text-sm font-semibold {planB ? 'text-gray-900' : 'text-gray-400'} truncate max-w-xs">
              {planB?.entry.name ?? 'Select a second plan →'}
            </p>
          </div>
        </div>
      {/if}

      {#if reportMode && planA && planB}
        <button
          onclick={() => { reportMode = false; }}
          class="ml-auto text-xs text-gray-400 hover:text-gray-600 underline"
        >
          ← Back to quick view
        </button>
      {/if}
    </div>


    <!-- Empty state -->
    {#if !planA && !planB}
      <div class="flex flex-col items-center justify-center h-[65vh] text-center text-gray-400 px-8">
        <div class="text-7xl mb-5 opacity-15">⇐</div>
        <p class="text-xl font-semibold text-gray-500 mb-2">Select plans from the sidebar</p>
        <p class="text-sm max-w-xs">
          Choose a <strong class="text-blue-600">baseline (A)</strong> then a
          <strong class="text-amber-500">comparison (B)</strong> and click
          <strong>Generate Report</strong> for a comprehensive analysis.
        </p>
      </div>

    {:else if reportMode && planA && planB && compactnessA && compactnessB && fairnessA && fairnessB}
      <!-- ── Full Report ── -->
      <div class="px-6 pt-5">
        <ReportView
          {planA}
          {planB}
          {compactnessA}
          {compactnessB}
          {countySplitsA}
          {countySplitsB}
          {deltas}
          {fairnessA}
          {fairnessB}
          {displacement}
          {displacementDistricts}
          {colorBy}
          onMapReadyA={onMapAReady}
          onMapReadyB={onMapBReady}
          onColorByChange={(v) => (colorBy = v)}
        />
      </div>

    {:else}
      <div class="p-6 space-y-5">

        <!-- Quick maps preview -->
        <div class="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
          <div class="flex items-center justify-between px-4 py-2 border-b border-gray-100 bg-gray-50">
            <span class="text-xs font-medium text-gray-500">Map Preview</span>
            <div class="flex gap-1">
              {#each [['partisan','Partisan'], ['minority_vap','Minority VAP'], ['pop','Population']] as [val, lbl]}
                <button
                  onclick={() => (colorBy = val as 'partisan' | 'minority_vap' | 'pop')}
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
              {#key planA?.entry.filename}
                <MapPane
                  geojson={planA?.geojson ?? null}
                  metrics={planA?.metrics ?? null}
                  {colorBy}
                  label={planA?.entry.name ?? 'Plan A'}
                  onMapReady={onMapAReady}
                  onHover={(id) => (previewHoverA = id)}
                  highlightedId={previewHlA}
                />
              {/key}
            </div>
            <div class="h-full">
              {#key planB?.entry.filename}
                <MapPane
                  geojson={planB?.geojson ?? null}
                  metrics={planB?.metrics ?? null}
                  {colorBy}
                  label={planB?.entry.name ?? 'Plan B'}
                  onMapReady={onMapBReady}
                  onHover={(id) => (previewHoverB = id)}
                  highlightedId={previewHlB}
                />
              {/key}
            </div>
          </div>
        </div>

        <!-- Quick comparison cards — only shown when both plans selected -->
        {#if planA && planB && statsA && statsB}
          <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div class="bg-white rounded-xl border border-gray-200 p-4 text-center">
              <p class="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-1">Districts</p>
              <p class="text-2xl font-black text-gray-700">{statsA.n}</p>
            </div>
            <div class="bg-white rounded-xl border border-gray-200 p-4">
              <p class="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-1">Competitive (46.5–53.5%)</p>
              <div class="flex justify-around">
                <div class="text-center">
                  <p class="text-[9px] text-blue-500 font-bold">A</p>
                  <p class="text-xl font-black text-blue-700">{statsA.competitive}</p>
                </div>
                <div class="text-center">
                  <p class="text-[9px] text-amber-500 font-bold">B</p>
                  <p class="text-xl font-black {statsB.competitive !== statsA.competitive ? 'text-amber-600' : 'text-gray-500'}">{statsB.competitive}</p>
                </div>
              </div>
            </div>
            <div class="bg-white rounded-xl border border-gray-200 p-4">
              <p class="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-1">Majority-Minority</p>
              <div class="flex justify-around">
                <div class="text-center">
                  <p class="text-[9px] text-blue-500 font-bold">A</p>
                  <p class="text-xl font-black text-blue-700">{statsA.mmDistricts}</p>
                </div>
                <div class="text-center">
                  <p class="text-[9px] text-amber-500 font-bold">B</p>
                  <p class="text-xl font-black {statsB.mmDistricts > statsA.mmDistricts ? 'text-emerald-600' : statsB.mmDistricts < statsA.mmDistricts ? 'text-red-500' : 'text-amber-600'}">{statsB.mmDistricts}</p>
                </div>
              </div>
            </div>
            <div class="bg-white rounded-xl border border-gray-200 p-4">
              <p class="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-1">Dem / Rep Seats</p>
              <div class="flex justify-around">
                <div class="text-center">
                  <p class="text-[9px] text-blue-500 font-bold">A</p>
                  <p class="text-sm font-black text-blue-700">{statsA.demSeats}D&nbsp;{statsA.repSeats}R</p>
                </div>
                <div class="text-center">
                  <p class="text-[9px] text-amber-500 font-bold">B</p>
                  <p class="text-sm font-black text-amber-600">{statsB.demSeats}D&nbsp;{statsB.repSeats}R</p>
                </div>
              </div>
            </div>
            <div class="bg-white rounded-xl border border-gray-200 p-4">
              <p class="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-1">Max Pop Deviation</p>
              <div class="flex justify-around">
                <div class="text-center">
                  <p class="text-[9px] text-blue-500 font-bold">A</p>
                  <p class="text-lg font-black text-blue-700">{statsA.maxDev.toFixed(1)}%</p>
                </div>
                <div class="text-center">
                  <p class="text-[9px] text-amber-500 font-bold">B</p>
                  <p class="text-lg font-black {statsB.maxDev < statsA.maxDev ? 'text-emerald-600' : 'text-amber-600'}">{statsB.maxDev.toFixed(1)}%</p>
                </div>
              </div>
            </div>
          </div>
        {/if}

        <!-- Generate Report CTA -->
        {#if planA && planB}
          <div class="bg-gradient-to-br from-blue-600 to-blue-700 rounded-2xl p-6 text-white shadow-lg">
            <div class="flex items-start justify-between gap-6 flex-wrap">
              <div>
                <h3 class="text-lg font-bold mb-1">Generate Comprehensive Report</h3>
                <p class="text-blue-200 text-sm leading-relaxed max-w-lg">
                  Computes Polsby-Popper &amp; Convex Hull compactness, county split counts, seats-votes
                  responsiveness curve, partisan bias, efficiency gap, VRA demographic impact — all in one
                  printable report.
                </p>
                <div class="flex flex-wrap gap-2 mt-3">
                  {#each ['Polsby-Popper', 'Convex Hull Ratio', 'County Splits', 'Seats-Votes Curve', 'Efficiency Gap', 'VRA Analysis'] as badge}
                    <span class="bg-white/20 text-white text-[10px] font-semibold px-2 py-0.5 rounded-full">{badge}</span>
                  {/each}
                </div>
              </div>
              <button
                onclick={generateReport}
                disabled={reportGenerating}
                class="shrink-0 px-8 py-3 bg-white text-blue-700 font-bold rounded-xl text-sm hover:bg-blue-50 transition-colors disabled:opacity-60 disabled:cursor-not-allowed shadow-sm"
              >
                {#if reportGenerating}
                  <span class="flex items-center gap-2">
                    <svg class="animate-spin w-4 h-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                      <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Computing…
                  </span>
                {:else if bothCached}
                  <span class="flex items-center gap-1.5">
                    <svg class="w-4 h-4 text-emerald-500" viewBox="0 0 20 20" fill="currentColor">
                      <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"/>
                    </svg>
                    Load from Cache →
                  </span>
                {:else}
                  Generate Report →
                {/if}
              </button>
            </div>
          </div>
        {/if}

      </div>
    {/if}
  </main>
</div>
