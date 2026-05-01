<script lang="ts">
  import { onMount } from 'svelte';
  import ShapefileRepo from './lib/components/ShapefileRepo.svelte';
  import CompareView from './lib/components/CompareView.svelte';
  import { shapefiles, darkMode } from './lib/stores/shapefileStore';

  type Tab = 'repo' | 'compare' | 'settings';
  let activeTab: Tab = $state('repo');
  let stateFips = $state('13');
  let dark = $state(false);

  darkMode.subscribe(v => (dark = v));

  onMount(() => {
    shapefiles.load();
  });

  const tabs: { id: Tab; label: string }[] = [
    { id: 'repo', label: 'Shapefile Repo' },
    { id: 'compare', label: 'Compare' },
    { id: 'settings', label: 'Settings' }
  ];
</script>

<div class={dark ? 'dark' : ''}>
  <div class="min-h-screen bg-[#F5F5F5] text-[#1A1A1A]">
    <!-- Header -->
    <header class="bg-white border-b border-gray-200 shadow-sm">
      <div class="max-w-screen-xl mx-auto px-6 py-4 flex items-center gap-6">
        <div>
          <h1 class="text-xl font-semibold tracking-tight">Redistricting Compare</h1>
          <p class="text-sm text-gray-500">Shapefile management &amp; district analysis</p>
        </div>
        <nav class="flex gap-1 ml-6">
          {#each tabs as tab}
            <button
              onclick={() => (activeTab = tab.id)}
              class="px-5 py-2 rounded-full text-sm font-medium transition-colors
                {activeTab === tab.id
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-600 hover:bg-gray-100'}"
            >
              {tab.label}
            </button>
          {/each}
        </nav>
      </div>
    </header>

    <!-- Main content -->
    <main class="max-w-screen-xl mx-auto px-6 py-8">
      {#if activeTab === 'repo'}
        <ShapefileRepo />
      {:else if activeTab === 'compare'}
        <CompareView />
      {:else}
        <!-- Settings -->
        <div class="max-w-md space-y-6">
          <h2 class="text-2xl font-semibold">Settings</h2>

          <div class="bg-white rounded-2xl p-6 shadow-sm space-y-4">
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1" for="fips">
                Default State FIPS Code
              </label>
              <input
                id="fips"
                type="text"
                maxlength="2"
                bind:value={stateFips}
                placeholder="e.g. 13 for Georgia"
                class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <p class="text-xs text-gray-400 mt-1">
                Used as the default state when uploading new shapefiles.
              </p>
            </div>

            <div class="flex items-center justify-between">
              <span class="text-sm font-medium text-gray-700">Dark mode</span>
              <button
                onclick={() => darkMode.set(!dark)}
                aria-label="Toggle dark mode"
                class="relative inline-flex h-6 w-11 items-center rounded-full transition-colors
                  {dark ? 'bg-blue-600' : 'bg-gray-300'}"
              >
                <span
                  class="inline-block h-4 w-4 rounded-full bg-white shadow transition-transform
                    {dark ? 'translate-x-6' : 'translate-x-1'}"
                ></span>
              </button>
            </div>
          </div>
        </div>
      {/if}
    </main>
  </div>
</div>
