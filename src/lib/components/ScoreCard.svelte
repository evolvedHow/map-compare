<script lang="ts">
  type Fmt = 'int' | 'pct1' | 'dec2' | 'dec3';

  interface Props {
    label: string;
    description?: string;
    a: number;
    b: number;
    fmt?: Fmt;
    unit?: string;
    // 'higher' = higher is better (compactness, minority representation)
    // 'lower'  = lower is better (deviation, splits)
    // 'neutral'= no directional judgement
    betterWhen?: 'higher' | 'lower' | 'neutral';
    loading?: boolean;
  }

  let {
    label,
    description = '',
    a,
    b,
    fmt = 'dec2',
    unit = '',
    betterWhen = 'neutral',
    loading = false
  }: Props = $props();

  function format(v: number, f: Fmt): string {
    switch (f) {
      case 'int':  return Math.round(v).toLocaleString();
      case 'pct1': return v.toFixed(1) + '%';
      case 'dec2': return v.toFixed(2);
      case 'dec3': return v.toFixed(3);
    }
  }

  function formatDelta(d: number, f: Fmt): string {
    const abs = Math.abs(d);
    const s = format(abs, f);
    return d > 0.0001 ? `+${s}` : d < -0.0001 ? `−${s}` : '—';
  }

  const delta = $derived(b - a);

  const isImprovement = $derived(
    betterWhen === 'neutral' || Math.abs(delta) < 0.0001
      ? null
      : betterWhen === 'higher' ? delta > 0 : delta < 0
  );

  const deltaColorClass = $derived(
    isImprovement === true  ? 'text-emerald-600' :
    isImprovement === false ? 'text-red-500' :
                              'text-gray-400'
  );

  const dirSymbol = $derived(
    isImprovement === true  ? '▲' :
    isImprovement === false ? '▼' : ''
  );
</script>

<div class="bg-white rounded-2xl border border-gray-200 shadow-sm p-4 flex flex-col gap-2.5">
  <div>
    <p class="text-[10px] font-bold text-gray-400 uppercase tracking-wider leading-none">{label}</p>
    {#if description}
      <p class="text-[10px] text-gray-400 mt-1 leading-snug">{description}</p>
    {/if}
  </div>

  {#if loading}
    <div class="flex items-center justify-center h-10 text-gray-300 text-xs italic">computing…</div>
  {:else}
    <div class="flex items-end justify-between gap-1">
      <!-- Plan A -->
      <div class="text-center min-w-0 flex-1">
        <p class="text-[9px] font-bold text-blue-500 uppercase tracking-wide mb-0.5">Plan A</p>
        <p class="text-2xl font-black text-blue-700 leading-none tabular-nums">
          {format(a, fmt)}<span class="text-xs font-normal text-gray-400 ml-0.5">{unit}</span>
        </p>
      </div>

      <!-- Delta -->
      <div class="text-center pb-0.5 min-w-0 shrink-0">
        <p class="text-xs font-bold {deltaColorClass} leading-none">
          {dirSymbol} {formatDelta(delta, fmt)}
        </p>
      </div>

      <!-- Plan B -->
      <div class="text-center min-w-0 flex-1">
        <p class="text-[9px] font-bold text-amber-500 uppercase tracking-wide mb-0.5">Plan B</p>
        <p class="text-2xl font-black text-amber-600 leading-none tabular-nums">
          {format(b, fmt)}<span class="text-xs font-normal text-gray-400 ml-0.5">{unit}</span>
        </p>
      </div>
    </div>
  {/if}
</div>
