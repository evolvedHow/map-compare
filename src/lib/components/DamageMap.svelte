<script lang="ts">
  import { REDISTRICTING_HISTORY, WAVE_COLORS, partyLabel, partyColor } from '../utils/historyData';
  import type { RedistrictingWave } from '../types/cdm';

  const history = REDISTRICTING_HISTORY;

  // Decade redistrictings shown on the timeline for context
  const decadeYears = [2001, 2011, 2021];

  // Build a flat timeline sorted by year
  interface TimelineEntry {
    year: number;
    displayYear: string;
    type: 'decade' | 'court' | 'wave';
    label: string;
    party?: 'R' | 'D' | 'both';
    districtsChanged?: number;
    wave?: RedistrictingWave;
  }

  const timeline: TimelineEntry[] = [
    { year: 2001, displayYear: '2001', type: 'decade', label: 'Decade redistricting (D, 2000 Census)' },
    { year: 2004, displayYear: '2004', type: 'court',  label: 'Court redraws all GA districts' },
    ...history.waves.map(w => ({
      year: w.year,
      displayYear: w.displayYear,
      type: 'wave' as const,
      label: w.label,
      party: w.party,
      districtsChanged: w.totalDistrictsChanged,
      wave: w,
    })),
    { year: 2011, displayYear: '2011', type: 'decade', label: 'Decade redistricting (R, 2010 Census)' },
    { year: 2021, displayYear: '2021', type: 'decade', label: 'Decade redistricting (R, 2020 Census)' },
  ].sort((a, b) => a.year - b.year);

  // Count by chamber across all waves
  const congressTotal = history.waves
    .flatMap(w => w.chambers)
    .filter(c => c.chamber === 'congress')
    .reduce((s, c) => s + c.districtCount, 0);
  const houseTotal = history.waves
    .flatMap(w => w.chambers)
    .filter(c => c.chamber === 'house')
    .reduce((s, c) => s + c.districtCount, 0);
  const senateTotal = history.waves
    .flatMap(w => w.chambers)
    .filter(c => c.chamber === 'senate')
    .reduce((s, c) => s + c.districtCount, 0);

  let expandedWave = $state<number | null>(null);

  function toggle(year: number) {
    expandedWave = expandedWave === year ? null : year;
  }
</script>

<div class="px-6 py-5 space-y-6 max-w-5xl mx-auto">

  <!-- ── Header ── -->
  <div class="space-y-1">
    <h2 class="text-lg font-bold text-gray-900">Mid-Decade Redistricting History</h2>
    <p class="text-sm text-gray-500">
      Georgia, 2001–2023 · Source: {history.author} ({history.created})
    </p>
  </div>

  <!-- ── Summary stats ── -->
  <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
    <div class="bg-white rounded-xl border border-gray-200 shadow-sm p-4 text-center">
      <div class="text-3xl font-bold text-red-600">{history.totalDistrictsChanged}</div>
      <div class="text-xs text-gray-500 mt-1">Districts altered</div>
      <div class="text-[10px] text-gray-400">in 4 waves</div>
    </div>
    <div class="bg-white rounded-xl border border-gray-200 shadow-sm p-4 text-center">
      <div class="text-3xl font-bold text-gray-700">{congressTotal}</div>
      <div class="text-xs text-gray-500 mt-1">Congressional</div>
    </div>
    <div class="bg-white rounded-xl border border-gray-200 shadow-sm p-4 text-center">
      <div class="text-3xl font-bold text-gray-700">{houseTotal}</div>
      <div class="text-xs text-gray-500 mt-1">State House</div>
    </div>
    <div class="bg-white rounded-xl border border-gray-200 shadow-sm p-4 text-center">
      <div class="text-3xl font-bold text-gray-700">{history.additionalBillsNotPassed}</div>
      <div class="text-xs text-gray-500 mt-1">Bills not passed</div>
      <div class="text-[10px] text-gray-400">additional attempts</div>
    </div>
  </div>

  <!-- ── Context note ── -->
  <div class="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800">
    <span class="font-semibold">Context:</span> Without a requirement otherwise, the party in power at the time of the decennial census
    always seeks to maximize its electoral advantage. Mid-decade redistricting allows ongoing tweaks to
    maintain party power and keep incumbents in office. All 4 waves would be disallowed under a proposed
    ban on mid-decade changes.
  </div>

  <!-- ── Timeline ── -->
  <div>
    <h3 class="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">Timeline</h3>
    <div class="space-y-1">
      {#each timeline as entry}
        {#if entry.type === 'decade'}
          <div class="flex items-center gap-3 py-1.5 px-3 rounded-lg bg-indigo-50 border border-indigo-100">
            <span class="text-xs font-bold text-indigo-600 w-16 shrink-0">{entry.displayYear}</span>
            <span class="text-xs font-semibold text-indigo-700">{entry.label}</span>
          </div>
        {:else if entry.type === 'court'}
          <div class="flex items-center gap-3 py-1.5 px-3 rounded-lg bg-gray-50 border border-gray-200">
            <span class="text-xs font-bold text-gray-500 w-16 shrink-0">{entry.displayYear}</span>
            <span class="text-xs text-gray-600 italic">{entry.label}</span>
          </div>
        {:else if entry.wave}
          {@const wave = entry.wave}
          {@const colors = WAVE_COLORS[wave.year]}
          <div class="rounded-lg border {colors.border} overflow-hidden">
            <button
              onclick={() => toggle(wave.year)}
              class="w-full flex items-center gap-3 py-2 px-3 {colors.bg} hover:opacity-90 transition-opacity text-left"
            >
              <span class="text-xs font-bold {colors.text} w-16 shrink-0">{wave.displayYear}</span>
              <span class="text-xs font-semibold {colors.text} flex-1">{wave.label}</span>
              <span class="text-[10px] font-medium {colors.text} shrink-0">
                {wave.totalDistrictsChanged} districts · {partyLabel(wave.party)}
              </span>
              <svg class="w-3.5 h-3.5 {colors.text} shrink-0 transition-transform {expandedWave === wave.year ? 'rotate-180' : ''}"
                xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                <path fill-rule="evenodd" d="M5.22 8.22a.75.75 0 0 1 1.06 0L10 11.94l3.72-3.72a.75.75 0 1 1 1.06 1.06l-4.25 4.25a.75.75 0 0 1-1.06 0L5.22 9.28a.75.75 0 0 1 0-1.06z" clip-rule="evenodd"/>
              </svg>
            </button>

            {#if expandedWave === wave.year}
              <div class="bg-white px-4 py-3 space-y-3 border-t {colors.border}">
                <div>
                  <span class="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Stated reason</span>
                  <p class="text-sm text-gray-700 mt-0.5 italic">{wave.reason}</p>
                </div>

                {#if wave.legalContext}
                  <div>
                    <span class="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Legal context</span>
                    <p class="text-sm text-gray-600 mt-0.5">{wave.legalContext}</p>
                  </div>
                {/if}

                {#if wave.electionResult}
                  <div>
                    <span class="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Election outcome</span>
                    <p class="text-sm text-gray-600 mt-0.5">{wave.electionResult}</p>
                  </div>
                {/if}

                <div>
                  <span class="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Districts by chamber</span>
                  <div class="mt-1 flex flex-wrap gap-2">
                    {#each wave.chambers as c}
                      <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-700">
                        <span class="capitalize">{c.chamber}</span>
                        <span class="font-bold">{c.districtCount}</span>
                        {#if c.allDistricts}<span class="text-gray-400">(all)</span>{/if}
                      </span>
                    {/each}
                  </div>
                </div>

                <div class="pt-1 border-t border-gray-100">
                  <p class="text-xs text-gray-400">
                    Specific district IDs will be resolved when historical boundary files are loaded.
                    Use the <span class="font-medium text-gray-500">Compare</span> tab to compute
                    displacement metrics for this wave once boundary files are available.
                  </p>
                </div>
              </div>
            {/if}
          </div>
        {/if}
      {/each}
    </div>
  </div>

  <!-- ── Data gap notice ── -->
  <div class="bg-gray-50 border border-gray-200 rounded-xl p-4 space-y-2">
    <h4 class="text-sm font-semibold text-gray-700">Boundary Files Needed for Displacement Analysis</h4>
    <p class="text-sm text-gray-600">
      To compute how many voters were displaced in each wave, we need the "before" boundary files
      for each redistricting period. The table below shows what's available.
    </p>
    <table class="w-full text-xs mt-2">
      <thead>
        <tr class="text-left text-gray-400 border-b border-gray-200">
          <th class="pb-1 pr-4 font-semibold">Wave</th>
          <th class="pb-1 pr-4 font-semibold">Before plan needed</th>
          <th class="pb-1 font-semibold">Status</th>
        </tr>
      </thead>
      <tbody class="divide-y divide-gray-100">
        <tr class="py-1">
          <td class="py-1.5 pr-4 font-medium text-amber-700">2005–2006</td>
          <td class="py-1.5 pr-4 text-gray-600">2001 enacted (pre-Republican redraw)</td>
          <td class="py-1.5"><span class="text-orange-600 font-medium">Pending</span></td>
        </tr>
        <tr>
          <td class="py-1.5 pr-4 font-medium text-orange-700">2012</td>
          <td class="py-1.5 pr-4 text-gray-600">2011 enacted (pre-super-majority redraw)</td>
          <td class="py-1.5"><span class="text-orange-600 font-medium">Pending</span></td>
        </tr>
        <tr>
          <td class="py-1.5 pr-4 font-medium text-rose-700">2015</td>
          <td class="py-1.5 pr-4 text-gray-600">2012 enacted (pre-incumbent-protection redraw)</td>
          <td class="py-1.5"><span class="text-orange-600 font-medium">Pending</span></td>
        </tr>
        <tr>
          <td class="py-1.5 pr-4 font-medium text-red-700">2023</td>
          <td class="py-1.5 pr-4 text-gray-600">2021 enacted → 2023 enacted (available)</td>
          <td class="py-1.5"><span class="text-emerald-600 font-medium">Available — load in Compare tab</span></td>
        </tr>
      </tbody>
    </table>
  </div>

</div>
