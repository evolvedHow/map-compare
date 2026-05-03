<script lang="ts">
  import CompareView from './lib/components/CompareView.svelte';
  import { darkMode } from './lib/stores/shapefileStore';

  let dark = $state(false);
  let showSettings = $state(false);
  let stateFips = $state('13');

  darkMode.subscribe(v => (dark = v));
</script>

<div class="{dark ? 'dark' : ''} h-screen flex flex-col bg-gray-50 text-gray-900 overflow-hidden print:h-auto print:overflow-visible print:block">
  <!-- Header -->
  <header class="bg-white border-b border-gray-200 shadow-sm flex-shrink-0 z-20 print:hidden">
    <div class="px-6 py-3 flex items-center justify-between">
      <div class="flex items-center gap-3">
        <div>
          <h1 class="text-base font-bold tracking-tight text-gray-900">Redistricting Compare</h1>
          <p class="text-[11px] text-gray-400 leading-none">Georgia 2020–2024 · Census PL 94-171</p>
        </div>
      </div>
      <button
        onclick={() => (showSettings = !showSettings)}
        class="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition-colors border border-gray-200"
        aria-label="Settings"
      >
        <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
          <path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
        Settings
      </button>
    </div>
  </header>

  <!-- Settings panel (slide-down overlay) -->
  {#if showSettings}
    <button class="absolute inset-0 z-30 bg-black/20 cursor-default" aria-label="Close settings" onclick={() => (showSettings = false)} onkeydown={(e) => e.key === 'Escape' && (showSettings = false)}></button>
    <div class="absolute top-[52px] right-4 z-40 bg-white rounded-2xl shadow-xl border border-gray-200 p-5 w-80 space-y-4">
      <h2 class="text-sm font-semibold text-gray-800">Settings</h2>
      <div>
        <label for="fips" class="text-xs font-medium text-gray-500 block mb-1">Default State FIPS</label>
        <input
          id="fips"
          type="text"
          maxlength="2"
          bind:value={stateFips}
          class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="13 = Georgia"
        />
      </div>
      <div class="flex items-center justify-between">
        <span class="text-sm text-gray-600">Dark mode</span>
        <button
          onclick={() => darkMode.set(!dark)}
          aria-label="Toggle dark mode"
          class="relative inline-flex h-6 w-11 items-center rounded-full transition-colors {dark ? 'bg-blue-600' : 'bg-gray-300'}"
        >
          <span class="inline-block h-4 w-4 rounded-full bg-white shadow transition-transform {dark ? 'translate-x-6' : 'translate-x-1'}"></span>
        </button>
      </div>
      <button
        onclick={() => (showSettings = false)}
        class="w-full py-2 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm text-gray-600 transition-colors"
      >
        Close
      </button>
    </div>
  {/if}

  <!-- Main: full height below header -->
  <div class="flex-1 overflow-hidden print:overflow-visible print:h-auto">
    <CompareView />
  </div>
</div>
