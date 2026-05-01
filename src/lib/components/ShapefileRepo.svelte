<script lang="ts">
  import { onMount } from 'svelte';
  import { shapefiles, stateFips } from '../stores/shapefileStore';
  import { parseAndValidateShapefile, validateGeoJSON } from '../utils/shapefileParser';
  import { exportRepo, importRepo } from '../utils/exportImport';
  import ShapefileCard from './ShapefileCard.svelte';
  import type { ShapefileEntry, ValidationResult } from '../types';

  interface CatalogEntry {
    filename: string;
    name: string;
    chamber: 'senate' | 'house' | 'congress' | 'custom';
    year: number;
    provenance: string;
    tags: string[];
  }

  // Upload state
  let dragging = $state(false);
  let uploading = $state(false);
  let uploadError = $state<string | null>(null);
  let pendingFile = $state<File | null>(null);
  let validation = $state<ValidationResult | null>(null);
  let pendingGeojson = $state<GeoJSON.FeatureCollection | null>(null);

  // Metadata form
  let metaName = $state('');
  let metaStateFips = $state('13');
  let metaChamber = $state<'senate' | 'house' | 'congress' | 'custom'>('house');
  let metaYear = $state(new Date().getFullYear());
  let metaProvenance = $state('');
  let metaUploadedBy = $state('');
  let metaComments = $state('');
  let metaTagInput = $state('');
  let metaTags = $state<string[]>([]);

  // Filters
  let filterText = $state('');
  let filterChamber = $state('all');
  let filterState = $state('');

  // Pre-loaded plans
  let catalog = $state<CatalogEntry[]>([]);
  let showPresets = $state(true);
  let presetChamberFilter = $state('all');
  let loadingPreset = $state<string | null>(null);
  let presetError = $state<string | null>(null);
  let addingAll = $state(false);

  stateFips.subscribe(v => (metaStateFips = v));

  let allEntries: ShapefileEntry[] = $state([]);
  shapefiles.subscribe(v => (allEntries = v));

  let filtered = $derived(
    allEntries.filter(e => {
      const text = filterText.toLowerCase();
      const matchText =
        !text ||
        e.metadata.name.toLowerCase().includes(text) ||
        e.metadata.tags.some(t => t.toLowerCase().includes(text)) ||
        e.metadata.comments.toLowerCase().includes(text);
      const matchChamber = filterChamber === 'all' || e.metadata.chamber === filterChamber;
      const matchState = !filterState || e.metadata.stateFips === filterState;
      return matchText && matchChamber && matchState;
    })
  );

  let filteredCatalog = $derived(
    catalog.filter(item =>
      presetChamberFilter === 'all' || item.chamber === presetChamberFilter
    )
  );

  onMount(async () => {
    try {
      const resp = await fetch(`${import.meta.env.BASE_URL}data-catalog.json`);
      catalog = await resp.json();
    } catch (e) {
      console.error('Failed to load data catalog', e);
    }
  });

  function isAlreadyAdded(filename: string): boolean {
    return allEntries.some(e => e.metadata.tags.includes(`preset:${filename}`));
  }

  async function addPreset(item: CatalogEntry): Promise<boolean> {
    if (isAlreadyAdded(item.filename)) return true;
    try {
      const resp = await fetch(`${import.meta.env.BASE_URL}data/${item.filename}`);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const geojson = await resp.json() as GeoJSON.FeatureCollection;
      const v = validateGeoJSON(geojson);
      if (!v.valid) {
        presetError = `${item.name}: ${v.errors.join(', ')}`;
        return false;
      }
      const entry: ShapefileEntry = {
        metadata: {
          id: crypto.randomUUID(),
          name: item.name,
          stateFips: '13',
          chamber: item.chamber,
          year: item.year,
          provenance: item.provenance,
          uploadedBy: 'pre-loaded',
          comments: '',
          tags: [...item.tags, `preset:${item.filename}`],
          createdAt: new Date().toISOString(),
          districtCount: v.districtCount,
          bounds: v.bounds,
          warnings: v.warnings
        },
        geojson
      };
      await shapefiles.add(entry);
      return true;
    } catch (e) {
      presetError = `Failed to load ${item.name}: ${e instanceof Error ? e.message : String(e)}`;
      return false;
    }
  }

  async function handleAddPreset(item: CatalogEntry) {
    loadingPreset = item.filename;
    presetError = null;
    await addPreset(item);
    loadingPreset = null;
  }

  async function handleAddAll() {
    addingAll = true;
    presetError = null;
    const toAdd = filteredCatalog.filter(item => !isAlreadyAdded(item.filename));
    for (const item of toAdd) {
      loadingPreset = item.filename;
      await addPreset(item);
    }
    loadingPreset = null;
    addingAll = false;
  }

  // Drag and drop
  function onDragOver(e: DragEvent) {
    e.preventDefault();
    dragging = true;
  }
  function onDragLeave() {
    dragging = false;
  }
  async function onDrop(e: DragEvent) {
    e.preventDefault();
    dragging = false;
    const file = e.dataTransfer?.files?.[0];
    if (file) await handleFile(file);
  }
  async function onFileInput(e: Event) {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (file) await handleFile(file);
    (e.target as HTMLInputElement).value = '';
  }

  async function handleFile(file: File) {
    uploading = true;
    uploadError = null;
    validation = null;
    pendingGeojson = null;
    pendingFile = file;
    metaName = file.name.replace(/\.zip$/i, '');

    const result = await parseAndValidateShapefile(file);
    validation = result.validation;
    if (result.validation.valid) {
      pendingGeojson = result.geojson;
    }
    uploading = false;
  }

  function addTag() {
    const t = metaTagInput.trim();
    if (t && !metaTags.includes(t)) metaTags = [...metaTags, t];
    metaTagInput = '';
  }
  function removeTag(tag: string) {
    metaTags = metaTags.filter(t => t !== tag);
  }

  async function saveShapefile() {
    if (!pendingGeojson || !validation?.valid) return;

    const entry: ShapefileEntry = {
      metadata: {
        id: crypto.randomUUID(),
        name: metaName || pendingFile!.name,
        stateFips: metaStateFips,
        chamber: metaChamber,
        year: metaYear,
        provenance: metaProvenance,
        uploadedBy: metaUploadedBy,
        comments: metaComments,
        tags: metaTags,
        createdAt: new Date().toISOString(),
        districtCount: validation.districtCount,
        bounds: validation.bounds,
        warnings: validation.warnings
      },
      geojson: pendingGeojson
    };

    await shapefiles.add(entry);
    resetForm();
  }

  function resetForm() {
    pendingFile = null;
    validation = null;
    pendingGeojson = null;
    metaName = '';
    metaProvenance = '';
    metaUploadedBy = '';
    metaComments = '';
    metaTags = [];
    metaTagInput = '';
  }

  // Export / Import
  async function handleExport() {
    await exportRepo(allEntries);
  }

  async function handleImportInput(e: Event) {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    const imported = await importRepo(file);
    for (const entry of imported) {
      const exists = allEntries.find(e => e.metadata.id === entry.metadata.id);
      if (!exists) await shapefiles.add(entry);
    }
    (e.target as HTMLInputElement).value = '';
  }

  const chamberLabel: Record<string, string> = {
    congress: 'US Congress',
    senate: 'State Senate',
    house: 'State House',
    custom: 'Custom / Geography'
  };

  const chamberBadge: Record<string, string> = {
    congress: 'bg-purple-100 text-purple-700',
    senate: 'bg-blue-100 text-blue-700',
    house: 'bg-green-100 text-green-700',
    custom: 'bg-gray-100 text-gray-600'
  };
</script>

<div class="space-y-8">
  <!-- Header row -->
  <div class="flex items-center justify-between">
    <h2 class="text-2xl font-semibold">Shapefile Repository</h2>
    <div class="flex gap-2">
      <button
        onclick={handleExport}
        class="px-4 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50 transition-colors"
      >
        Export Repo
      </button>
      <label class="px-4 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50 cursor-pointer transition-colors">
        Import Repo
        <input type="file" accept=".zip" onchange={handleImportInput} class="hidden" />
      </label>
    </div>
  </div>

  <!-- Pre-loaded Plans -->
  {#if catalog.length > 0}
    <div class="bg-blue-50 border border-blue-200 rounded-2xl overflow-hidden">
      <!-- Section header -->
      <div class="flex items-center justify-between px-5 py-3 bg-blue-100 border-b border-blue-200">
        <button
          class="flex items-center gap-2 font-semibold text-blue-900 text-sm"
          onclick={() => (showPresets = !showPresets)}
        >
          <span class="text-base">{showPresets ? '▾' : '▸'}</span>
          Pre-loaded Georgia Plans
          <span class="text-xs font-normal text-blue-600">({catalog.length} available)</span>
        </button>
        <div class="flex items-center gap-2">
          <select
            bind:value={presetChamberFilter}
            class="border border-blue-300 rounded-lg px-2 py-1 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="all">All chambers</option>
            <option value="congress">Congress</option>
            <option value="senate">Senate</option>
            <option value="house">House</option>
            <option value="custom">Geography</option>
          </select>
          <button
            onclick={handleAddAll}
            disabled={addingAll || filteredCatalog.every(i => isAlreadyAdded(i.filename))}
            class="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-medium hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {addingAll ? 'Adding…' : 'Add All'}
          </button>
        </div>
      </div>

      {#if showPresets}
        <div class="p-4 space-y-2">
          {#if presetError}
            <div class="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-xs text-red-700">
              ✗ {presetError}
            </div>
          {/if}

          <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {#each filteredCatalog as item (item.filename)}
              {@const added = isAlreadyAdded(item.filename)}
              {@const loading = loadingPreset === item.filename}
              <div
                class="flex items-start justify-between gap-2 bg-white rounded-xl border px-3 py-2.5
                  {added ? 'border-green-200 opacity-60' : 'border-blue-200 hover:border-blue-400'} transition-colors"
              >
                <div class="min-w-0">
                  <p class="text-xs font-medium text-gray-800 leading-tight truncate">{item.name}</p>
                  <div class="flex flex-wrap gap-1 mt-1">
                    <span class="text-[10px] px-1.5 py-0.5 rounded-full font-medium {chamberBadge[item.chamber]}">
                      {chamberLabel[item.chamber]}
                    </span>
                    <span class="text-[10px] px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500">{item.year}</span>
                    {#each item.tags.slice(0, 2) as tag}
                      <span class="text-[10px] px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500">{tag}</span>
                    {/each}
                  </div>
                </div>
                <button
                  onclick={() => handleAddPreset(item)}
                  disabled={added || loading || addingAll}
                  class="shrink-0 px-2.5 py-1 rounded-lg text-xs font-medium transition-colors
                    {added
                      ? 'bg-green-100 text-green-700 cursor-default'
                      : loading
                        ? 'bg-gray-100 text-gray-400 cursor-wait'
                        : 'bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40'}"
                >
                  {added ? '✓' : loading ? '…' : 'Add'}
                </button>
              </div>
            {/each}
          </div>
        </div>
      {/if}
    </div>
  {/if}

  <!-- Upload zone -->
  <div
    role="button"
    tabindex="0"
    class="border-2 border-dashed rounded-2xl p-8 text-center transition-colors
      {dragging ? 'border-blue-400 bg-blue-50' : 'border-gray-300 bg-white hover:border-blue-300'}"
    ondragover={onDragOver}
    ondragleave={onDragLeave}
    ondrop={onDrop}
    onkeydown={(e) => e.key === 'Enter' && document.getElementById('shp-input')?.click()}
  >
    {#if uploading}
      <p class="text-blue-600 font-medium">Parsing shapefile…</p>
    {:else}
      <p class="text-gray-500">Drag &amp; drop a <strong>.zip</strong> shapefile here</p>
      <p class="text-gray-400 text-sm mt-1">or</p>
      <label class="mt-3 inline-block px-5 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium cursor-pointer hover:bg-blue-700 transition-colors">
        Browse File
        <input id="shp-input" type="file" accept=".zip" onchange={onFileInput} class="hidden" />
      </label>
    {/if}
  </div>

  <!-- Validation result + metadata form -->
  {#if validation}
    <div class="bg-white rounded-2xl shadow-sm p-6 space-y-4 border border-gray-100">
      <h3 class="font-semibold text-base">Validation Report</h3>

      {#if validation.errors.length > 0}
        <div class="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700 space-y-1">
          {#each validation.errors as err}
            <p>✗ {err}</p>
          {/each}
        </div>
      {:else}
        <div class="bg-green-50 border border-green-200 rounded-lg p-3 text-sm text-green-700">
          ✓ Valid &mdash; {validation.districtCount} districts detected &middot;
          Geometry: {validation.geometryType} &middot;
          Bounds: [{validation.bounds.map(n => n.toFixed(2)).join(', ')}]
        </div>
      {/if}

      {#if validation.warnings.length > 0}
        <div class="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-700 space-y-1">
          {#each validation.warnings as w}
            <p>⚠ {w}</p>
          {/each}
        </div>
      {/if}

      {#if validation.valid}
        <!-- Metadata form -->
        <h3 class="font-semibold text-base pt-2">Add Metadata</h3>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label for="meta-name" class="text-xs font-medium text-gray-500">Name *</label>
            <input
              id="meta-name"
              bind:value={metaName}
              class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mt-1 focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="e.g. GA Senate 2024 Enacted"
            />
          </div>
          <div>
            <label for="meta-state-fips" class="text-xs font-medium text-gray-500">State FIPS</label>
            <input
              id="meta-state-fips"
              bind:value={metaStateFips}
              maxlength="2"
              class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mt-1 focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="13"
            />
          </div>
          <div>
            <label for="meta-chamber" class="text-xs font-medium text-gray-500">Chamber</label>
            <select
              id="meta-chamber"
              bind:value={metaChamber}
              class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mt-1 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="senate">State Senate</option>
              <option value="house">State House</option>
              <option value="congress">US Congress</option>
              <option value="custom">Custom</option>
            </select>
          </div>
          <div>
            <label for="meta-year" class="text-xs font-medium text-gray-500">Year</label>
            <input
              id="meta-year"
              type="number"
              bind:value={metaYear}
              class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mt-1 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div class="sm:col-span-2">
            <label for="meta-provenance" class="text-xs font-medium text-gray-500">Provenance / Source</label>
            <input
              id="meta-provenance"
              bind:value={metaProvenance}
              class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mt-1 focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="e.g. Georgia General Assembly, SB 1"
            />
          </div>
          <div>
            <label for="meta-uploaded-by" class="text-xs font-medium text-gray-500">Uploaded by</label>
            <input
              id="meta-uploaded-by"
              bind:value={metaUploadedBy}
              class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mt-1 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label for="meta-tag-input" class="text-xs font-medium text-gray-500">Tags</label>
            <div class="flex flex-wrap gap-1 mt-1 mb-1">
              {#each metaTags as tag}
                <span class="inline-flex items-center gap-1 bg-blue-50 text-blue-700 text-xs px-2 py-0.5 rounded-full">
                  {tag}
                  <button onclick={() => removeTag(tag)} class="hover:text-red-500">&times;</button>
                </span>
              {/each}
            </div>
            <div class="flex gap-2">
              <input
                id="meta-tag-input"
                bind:value={metaTagInput}
                onkeydown={(e) => e.key === 'Enter' && addTag()}
                placeholder="enacted, proposed, 2024…"
                class="flex-1 border border-gray-300 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button onclick={addTag} class="px-3 py-1.5 bg-gray-100 rounded-lg text-xs hover:bg-gray-200">Add</button>
            </div>
          </div>
          <div class="sm:col-span-2">
            <label for="meta-comments" class="text-xs font-medium text-gray-500">Comments</label>
            <textarea
              id="meta-comments"
              bind:value={metaComments}
              rows="2"
              class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mt-1 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            ></textarea>
          </div>
        </div>

        <div class="flex gap-3 pt-2">
          <button
            onclick={saveShapefile}
            class="px-6 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
          >
            Save to Repo
          </button>
          <button
            onclick={resetForm}
            class="px-6 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
        </div>
      {/if}
    </div>
  {/if}

  <!-- Filters -->
  {#if allEntries.length > 0}
    <div class="flex gap-3 flex-wrap">
      <input
        bind:value={filterText}
        placeholder="Search by name, tag, comment…"
        class="flex-1 min-w-48 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
      />
      <select
        bind:value={filterChamber}
        class="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
      >
        <option value="all">All chambers</option>
        <option value="senate">State Senate</option>
        <option value="house">State House</option>
        <option value="congress">US Congress</option>
        <option value="custom">Custom</option>
      </select>
      <input
        bind:value={filterState}
        placeholder="State FIPS"
        maxlength="2"
        class="w-28 border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
    </div>

    <!-- Cards grid -->
    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {#each filtered as entry (entry.metadata.id)}
        <ShapefileCard {entry} />
      {/each}
    </div>

    {#if filtered.length === 0}
      <p class="text-gray-400 text-center py-8">No shapefiles match your filters.</p>
    {/if}
  {:else if !validation}
    <p class="text-gray-400 text-center py-12">
      No shapefiles in the repo yet. Use the pre-loaded plans above or upload your own.
    </p>
  {/if}
</div>
