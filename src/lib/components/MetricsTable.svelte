<script lang="ts">
  import type { DistrictDelta, FairnessMetrics } from '../types';

  interface Props {
    deltas: DistrictDelta[];
    fairnessA: FairnessMetrics | null;
    fairnessB: FairnessMetrics | null;
    labelA: string;
    labelB: string;
  }

  let { deltas, fairnessA, fairnessB, labelA, labelB }: Props = $props();

  type SortKey = keyof DistrictDelta | 'totalPop_a' | 'vap_a' | 'minority_a' | 'lean_a' | 'totalPop_b' | 'vap_b' | 'minority_b' | 'lean_b' | 'white_a' | 'white_b';
  let sortKey = $state<string>('districtId');
  let sortDir = $state<1 | -1>(1);

  function toggleSort(key: string) {
    if (sortKey === key) sortDir = sortDir === 1 ? -1 : 1;
    else { sortKey = key; sortDir = 1; }
  }

  function getValue(d: DistrictDelta, key: string): number | string {
    switch (key) {
      case 'districtId': return d.districtId;
      case 'totalPop_a': return d.a.totalPop;
      case 'totalPop_b': return d.b.totalPop;
      case 'deltaPop': return d.deltaPop;
      case 'vap_a': return d.a.vap;
      case 'vap_b': return d.b.vap;
      case 'deltaVap': return d.deltaVap;
      case 'minority_a': return d.a.minorityVapPct;
      case 'minority_b': return d.b.minorityVapPct;
      case 'deltaMinorityVapPct': return d.deltaMinorityVapPct;
      case 'white_a': return d.a.vap > 0 ? (d.a.whiteVap / d.a.vap) * 100 : 0;
      case 'white_b': return d.b.vap > 0 ? (d.b.whiteVap / d.b.vap) * 100 : 0;
      case 'lean_a': return d.a.partisanLean;
      case 'lean_b': return d.b.partisanLean;
      case 'deltaPartisanLean': return d.deltaPartisanLean;
      default: return '';
    }
  }

  let sorted = $derived(
    [...deltas].sort((a, b) => {
      const va = getValue(a, sortKey);
      const vb = getValue(b, sortKey);
      if (typeof va === 'string') return sortDir * va.localeCompare(String(vb));
      return sortDir * ((va as number) - (vb as number));
    })
  );

  function fmtNum(n: number) {
    return n.toLocaleString(undefined, { maximumFractionDigits: 0 });
  }
  function fmtPct(n: number) {
    return n.toFixed(1) + '%';
  }
  function fmtDelta(n: number, pct = false) {
    const s = pct ? fmtPct(Math.abs(n)) : fmtNum(Math.abs(n));
    if (n > 0) return `+${s}`;
    if (n < 0) return `−${s}`;
    return '0';
  }
  function deltaClass(n: number) {
    if (n > 0) return 'text-green-700';
    if (n < 0) return 'text-red-600';
    return 'text-gray-400';
  }

  function fmtEG(n: number) {
    const pct = (n * 100).toFixed(1);
    return n > 0 ? `Dem +${pct}%` : `Rep +${Math.abs(n * 100).toFixed(1)}%`;
  }
  function fmtMM(n: number) {
    const pct = (n * 100).toFixed(1);
    return n > 0 ? `Dem +${pct}%` : `Rep +${Math.abs(n * 100).toFixed(1)}%`;
  }

  function exportCsv() {
    const headers = [
      'District', `Pop (${labelA})`, `Pop (${labelB})`, 'ΔPop',
      `VAP (${labelA})`, `VAP (${labelB})`, 'ΔVAP',
      `Minority VAP% (${labelA})`, `Minority VAP% (${labelB})`, 'ΔMinority VAP%',
      `White VAP% (${labelA})`, `White VAP% (${labelB})`, 'ΔWhite VAP%',
      `Partisan Lean (${labelA})`, `Partisan Lean (${labelB})`, 'ΔPartisan'
    ];
    const rows = sorted.map(d => {
      const wA = d.a.vap > 0 ? (d.a.whiteVap / d.a.vap) * 100 : 0;
      const wB = d.b.vap > 0 ? (d.b.whiteVap / d.b.vap) * 100 : 0;
      return [
        d.districtId, d.a.totalPop, d.b.totalPop, d.deltaPop,
        d.a.vap, d.b.vap, d.deltaVap,
        d.a.minorityVapPct.toFixed(2), d.b.minorityVapPct.toFixed(2), d.deltaMinorityVapPct.toFixed(2),
        wA.toFixed(2), wB.toFixed(2), (wB - wA).toFixed(2),
        d.a.partisanLean.toFixed(2), d.b.partisanLean.toFixed(2), d.deltaPartisanLean.toFixed(2)
      ];
    });
    const csv = [headers, ...rows].map(r => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'district-comparison.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

  type SortCol = { key: string; label: string };
  const cols: SortCol[] = [
    { key: 'districtId', label: 'District' },
    { key: 'totalPop_a', label: `Pop (A)` },
    { key: 'totalPop_b', label: `Pop (B)` },
    { key: 'deltaPop', label: 'ΔPop' },
    { key: 'vap_a', label: 'VAP (A)' },
    { key: 'vap_b', label: 'VAP (B)' },
    { key: 'deltaVap', label: 'ΔVAP' },
    { key: 'minority_a', label: 'Min VAP% (A)' },
    { key: 'minority_b', label: 'Min VAP% (B)' },
    { key: 'deltaMinorityVapPct', label: 'ΔMin VAP%' },
    { key: 'white_a', label: 'Wh VAP% (A)' },
    { key: 'white_b', label: 'Wh VAP% (B)' },
    { key: 'lean_a', label: 'Lean (A)' },
    { key: 'lean_b', label: 'Lean (B)' },
    { key: 'deltaPartisanLean', label: 'ΔLean' }
  ];
</script>

<div class="space-y-4">
  <!-- Fairness summary -->
  {#if fairnessA || fairnessB}
    <div class="grid grid-cols-2 gap-4">
      {#each [{ f: fairnessA, label: labelA }, { f: fairnessB, label: labelB }] as item}
        {#if item.f}
          <div class="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
            <p class="text-xs font-medium text-gray-500 mb-2">{item.label}</p>
            <div class="text-sm space-y-1">
              <p>
                <span class="font-medium">Efficiency Gap:</span>
                <span class="ml-2 {item.f.efficiencyGap > 0 ? 'text-blue-700' : 'text-red-700'}">
                  {fmtEG(item.f.efficiencyGap)}
                </span>
              </p>
              <p>
                <span class="font-medium">Mean-Median Diff:</span>
                <span class="ml-2 {item.f.meanMedian > 0 ? 'text-blue-700' : 'text-red-700'}">
                  {fmtMM(item.f.meanMedian)}
                </span>
              </p>
            </div>
          </div>
        {/if}
      {/each}
    </div>
  {/if}

  {#if deltas.some(d => d.minorityFlagged)}
    <div class="bg-amber-50 border border-amber-200 rounded-lg px-4 py-2 text-sm text-amber-700">
      ⚠ Rows highlighted in amber have a minority VAP change &gt;5 percentage points.
    </div>
  {/if}

  <div class="flex items-center justify-between">
    <p class="text-sm text-gray-500">{sorted.length} districts</p>
    <button
      onclick={exportCsv}
      class="px-4 py-1.5 border border-gray-300 rounded-lg text-sm hover:bg-gray-50 transition-colors"
    >
      Export CSV
    </button>
  </div>

  <div class="overflow-x-auto rounded-2xl border border-gray-200 shadow-sm">
    <table class="w-full text-sm border-collapse bg-white">
      <thead>
        <tr class="border-b border-gray-200 bg-gray-50">
          {#each cols as col}
            <th
              class="px-3 py-2.5 text-left text-xs font-semibold text-gray-600 whitespace-nowrap cursor-pointer hover:bg-gray-100 select-none"
              onclick={() => toggleSort(col.key)}
            >
              {col.label}
              {#if sortKey === col.key}
                <span class="ml-1 text-blue-500">{sortDir === 1 ? '↑' : '↓'}</span>
              {/if}
            </th>
          {/each}
        </tr>
      </thead>
      <tbody>
        {#each sorted as d (d.districtId)}
          {@const wvapPctA = d.a.vap > 0 ? (d.a.whiteVap / d.a.vap) * 100 : 0}
          {@const wvapPctB = d.b.vap > 0 ? (d.b.whiteVap / d.b.vap) * 100 : 0}
          <tr class="border-b border-gray-100 hover:bg-gray-50 {d.minorityFlagged ? 'bg-amber-50 hover:bg-amber-100' : ''}">
            <td class="px-3 py-2 font-medium">{d.districtId}</td>
            <td class="px-3 py-2 text-right">{fmtNum(d.a.totalPop)}</td>
            <td class="px-3 py-2 text-right">{fmtNum(d.b.totalPop)}</td>
            <td class="px-3 py-2 text-right {deltaClass(d.deltaPop)}">{fmtDelta(d.deltaPop)}</td>
            <td class="px-3 py-2 text-right">{fmtNum(d.a.vap)}</td>
            <td class="px-3 py-2 text-right">{fmtNum(d.b.vap)}</td>
            <td class="px-3 py-2 text-right {deltaClass(d.deltaVap)}">{fmtDelta(d.deltaVap)}</td>
            <td class="px-3 py-2 text-right">{fmtPct(d.a.minorityVapPct)}</td>
            <td class="px-3 py-2 text-right">{fmtPct(d.b.minorityVapPct)}</td>
            <td class="px-3 py-2 text-right font-medium {d.minorityFlagged ? 'text-amber-700' : deltaClass(d.deltaMinorityVapPct)}">
              {fmtDelta(d.deltaMinorityVapPct, true)}
            </td>
            <td class="px-3 py-2 text-right text-gray-500">{fmtPct(wvapPctA)}</td>
            <td class="px-3 py-2 text-right {deltaClass(wvapPctB - wvapPctA)}">{fmtPct(wvapPctB)}</td>
            <td class="px-3 py-2 text-right">{fmtPct(d.a.partisanLean)}</td>
            <td class="px-3 py-2 text-right">{fmtPct(d.b.partisanLean)}</td>
            <td class="px-3 py-2 text-right {deltaClass(d.deltaPartisanLean)}">{fmtDelta(d.deltaPartisanLean, true)}</td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
</div>
