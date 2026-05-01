<script lang="ts">
  import { onMount } from 'svelte';
  import Papa from 'papaparse';
  import L from 'leaflet';
  import MapPane from './MapPane.svelte';
  import MetricsTable from './MetricsTable.svelte';
  import { shapefiles } from '../stores/shapefileStore';
  import { spatialJoin, buildDeltas } from '../utils/spatialAnalysis';
  import { computeFairness } from '../utils/fairnessMetrics';
  import type {
    ShapefileEntry,
    CrosswalkRow,
    DistrictMetrics,
    DistrictDelta,
    FairnessMetrics
  } from '../types';

  let allEntries: ShapefileEntry[] = $state([]);
  shapefiles.subscribe(v => (allEntries = v));

  let selectedIdA = $state('');
  let selectedIdB = $state('');
  let colorBy = $state<'pop' | 'minority_vap' | 'partisan'>('partisan');
  let csvFile = $state<File | null>(null);
  let analysisRunning = $state(false);
  let analysisError = $state<string | null>(null);

  // Results
  let metricsA = $state<Map<string, DistrictMetrics> | null>(null);
  let metricsB = $state<Map<string, DistrictMetrics> | null>(null);
  let deltas = $state<DistrictDelta[]>([]);
  let fairnessA = $state<FairnessMetrics | null>(null);
  let fairnessB = $state<FairnessMetrics | null>(null);
  let hasResults = $state(false);

  // Map sync via Leaflet move events
  let mapA: L.Map | null = null;
  let mapB: L.Map | null = null;
  let syncing = false; // re-entrance guard

  function syncMaps(source: L.Map, target: L.Map) {
    source.on('move', () => {
      if (syncing) return;
      syncing = true;
      target.setView(source.getCenter(), source.getZoom(), { animate: false });
      syncing = false;
    });
  }

  function onMapAReady(map: L.Map) {
    mapA = map;
    if (mapB) { syncMaps(mapA, mapB); syncMaps(mapB, mapA); }
  }
  function onMapBReady(map: L.Map) {
    mapB = map;
    if (mapA) { syncMaps(mapA, mapB); syncMaps(mapB, mapA); }
  }

  const entryA = $derived(allEntries.find(e => e.metadata.id === selectedIdA) ?? null);
  const entryB = $derived(allEntries.find(e => e.metadata.id === selectedIdB) ?? null);

  async function runAnalysis() {
    if (!entryA || !entryB) return;
    analysisRunning = true;
    analysisError = null;
    hasResults = false;
    deltas = [];

    let rows: CrosswalkRow[] = [];

    if (csvFile) {
      try {
        rows = await parseCsv(csvFile);
      } catch (err) {
        analysisError = `CSV parse error: ${err instanceof Error ? err.message : String(err)}`;
        analysisRunning = false;
        return;
      }
    }

    try {
      const mA = spatialJoin(entryA.geojson, rows);
      const mB = spatialJoin(entryB.geojson, rows);
      metricsA = mA;
      metricsB = mB;

      deltas = buildDeltas(mA, mB);

      fairnessA = computeFairness([...mA.values()]);
      fairnessB = computeFairness([...mB.values()]);

      hasResults = true;
    } catch (err) {
      analysisError = `Analysis error: ${err instanceof Error ? err.message : String(err)}`;
    }

    analysisRunning = false;
  }

  function parseCsv(file: File): Promise<CrosswalkRow[]> {
    return new Promise((resolve, reject) => {
      Papa.parse<Record<string, string>>(file, {
        header: true,
        skipEmptyLines: true,
        complete(results) {
          const rows: CrosswalkRow[] = results.data.map(r => ({
            unit_id: r.unit_id ?? '',
            total_pop: parseFloat(r.total_pop) || 0,
            vap: parseFloat(r.vap) || 0,
            black_vap: parseFloat(r.black_vap) || 0,
            hispanic_vap: parseFloat(r.hispanic_vap) || 0,
            asian_vap: parseFloat(r.asian_vap) || 0,
            dem_votes: parseFloat(r.dem_votes) || 0,
            rep_votes: parseFloat(r.rep_votes) || 0,
            lat: parseFloat(r.lat) || 0,
            lon: parseFloat(r.lon) || 0
          }));
          resolve(rows);
        },
        error(err) {
          reject(err);
        }
      });
    });
  }
</script>

<div class="space-y-6">
  <h2 class="text-2xl font-semibold">Compare Plans</h2>

  {#if allEntries.length < 2}
    <div class="bg-amber-50 border border-amber-200 rounded-2xl p-6 text-amber-700 text-sm">
      You need at least <strong>2 shapefiles</strong> in the Repo to compare. Upload them in the
      <button
        class="underline font-medium"
        onclick={() => document.querySelector<HTMLButtonElement>('[data-tab="repo"]')?.click()}
      >
        Shapefile Repo
      </button> tab.
    </div>
  {:else}
    <!-- Setup panel -->
    <div class="bg-white rounded-2xl shadow-sm p-6 border border-gray-100 space-y-4">
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label for="compare-plan-a" class="text-xs font-medium text-gray-500">Current Plan (A)</label>
          <select
            id="compare-plan-a"
            bind:value={selectedIdA}
            class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mt-1 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">— Select shapefile —</option>
            {#each allEntries as e}
              <option value={e.metadata.id}>{e.metadata.name}</option>
            {/each}
          </select>
        </div>
        <div>
          <label for="compare-plan-b" class="text-xs font-medium text-gray-500">Proposed Plan (B)</label>
          <select
            id="compare-plan-b"
            bind:value={selectedIdB}
            class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mt-1 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">— Select shapefile —</option>
            {#each allEntries as e}
              <option value={e.metadata.id}>{e.metadata.name}</option>
            {/each}
          </select>
        </div>
      </div>

      <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label for="compare-csv" class="text-xs font-medium text-gray-500">
            Demographic crosswalk CSV
            <span class="text-gray-400 ml-1">(optional — enables metrics &amp; table)</span>
          </label>
          <input
            id="compare-csv"
            type="file"
            accept=".csv"
            onchange={(e) => { csvFile = (e.target as HTMLInputElement).files?.[0] ?? null; }}
            class="w-full mt-1 text-sm text-gray-500 file:mr-3 file:py-1 file:px-3 file:rounded-lg file:border file:border-gray-300 file:bg-white file:text-sm file:cursor-pointer hover:file:bg-gray-50"
          />
          <p class="text-xs text-gray-400 mt-0.5">
            Columns: unit_id, total_pop, vap, black_vap, hispanic_vap, asian_vap, dem_votes, rep_votes, lat, lon
          </p>
        </div>
        <div>
          <label for="compare-color-by" class="text-xs font-medium text-gray-500">Choropleth metric</label>
          <select
            id="compare-color-by"
            bind:value={colorBy}
            class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mt-1 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="partisan">Partisan Lean</option>
            <option value="minority_vap">Minority VAP %</option>
            <option value="pop">Total Population</option>
          </select>
        </div>
      </div>

      {#if analysisError}
        <div class="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
          {analysisError}
        </div>
      {/if}

      <button
        onclick={runAnalysis}
        disabled={!selectedIdA || !selectedIdB || selectedIdA === selectedIdB || analysisRunning}
        class="px-6 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {analysisRunning ? 'Analyzing…' : 'Compare'}
      </button>
    </div>

    <!-- Side-by-side maps -->
    {#if entryA || entryB}
      <div class="grid grid-cols-2 gap-3 rounded-2xl overflow-hidden border border-gray-200 shadow-sm">
        <div class="min-h-[460px]">
          <MapPane
            shapefile={entryA}
            metrics={metricsA}
            {colorBy}
            label={entryA?.metadata.name ?? 'Current Plan (A)'}
            onMapReady={onMapAReady}
          />
        </div>
        <div class="min-h-[460px]">
          <MapPane
            shapefile={entryB}
            metrics={metricsB}
            {colorBy}
            label={entryB?.metadata.name ?? 'Proposed Plan (B)'}
            onMapReady={onMapBReady}
          />
        </div>
      </div>

      <!-- Legend -->
      <div class="flex items-center gap-6 text-xs text-gray-500 justify-center">
        {#if colorBy === 'partisan'}
          <span class="flex items-center gap-1"><span class="inline-block w-3 h-3 rounded-sm bg-[#1a4fa0]"></span>Strong Dem</span>
          <span class="flex items-center gap-1"><span class="inline-block w-3 h-3 rounded-sm bg-[#93b8e8]"></span>Lean Dem</span>
          <span class="flex items-center gap-1"><span class="inline-block w-3 h-3 rounded-sm bg-[#e8a097]"></span>Lean Rep</span>
          <span class="flex items-center gap-1"><span class="inline-block w-3 h-3 rounded-sm bg-[#a01a1a]"></span>Strong Rep</span>
        {:else if colorBy === 'minority_vap'}
          <span class="flex items-center gap-1"><span class="inline-block w-3 h-3 rounded-sm bg-[#f5f3ff]"></span>&lt;15%</span>
          <span class="flex items-center gap-1"><span class="inline-block w-3 h-3 rounded-sm bg-[#a78bfa]"></span>30–45%</span>
          <span class="flex items-center gap-1"><span class="inline-block w-3 h-3 rounded-sm bg-[#5c2d91]"></span>&gt;60%</span>
        {:else}
          <span class="flex items-center gap-1"><span class="inline-block w-3 h-3 rounded-sm bg-[#f0fdf4]"></span>Low pop</span>
          <span class="flex items-center gap-1"><span class="inline-block w-3 h-3 rounded-sm bg-[#14532d]"></span>High pop</span>
        {/if}
      </div>
    {/if}

    <!-- Metrics table -->
    {#if hasResults && deltas.length > 0}
      <MetricsTable
        {deltas}
        {fairnessA}
        {fairnessB}
        labelA={entryA?.metadata.name ?? 'Plan A'}
        labelB={entryB?.metadata.name ?? 'Plan B'}
      />
    {:else if hasResults && deltas.length === 0}
      <p class="text-gray-400 text-center py-6">No district matches found. Check that your shapefile and CSV use overlapping geographies.</p>
    {:else if entryA && entryB && !hasResults}
      <p class="text-gray-400 text-center py-6 text-sm">
        Select plans and click <strong>Compare</strong> to see the metrics table.
        Upload a crosswalk CSV to enable demographic &amp; partisan analysis.
      </p>
    {/if}
  {/if}
</div>
