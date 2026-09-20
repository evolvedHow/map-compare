<script lang="ts">
  import { onMount, onDestroy, untrack } from 'svelte';
  import L from 'leaflet';
  import 'leaflet/dist/leaflet.css';
  import type { DistrictMetrics, DistrictDelta, ColorByMode } from '../types';
  import { partisanColor, minorityVapColor, popDeltaColor, popColor } from '../utils/scales';

  interface Props {
    geojson: GeoJSON.FeatureCollection | null;
    metrics: Map<string, DistrictMetrics> | null;
    colorBy: ColorByMode;
    label: string;
    /** Side prefix shown in the tooltip ("A" / "B"). */
    side?: string;
    deltaMap?: Map<string, DistrictDelta>;   // for flip/competitive_change/minority_change modes
    onMapReady?: (map: L.Map) => void;
    onHover?: (id: string | null) => void;
    highlightedId?: string | null;
  }

  let {
    geojson, metrics, colorBy, label, side = '',
    deltaMap, onMapReady, onHover, highlightedId = null
  }: Props = $props();

  let mapEl: HTMLDivElement;
  let map: L.Map;
  let geojsonLayer = $state<L.GeoJSON | null>(null);
  const layerById = new Map<string, L.Path>();

  // Population is a comparison metric: Lower/Same/Higher only when deltas exist.
  const popCompare = $derived(colorBy === 'pop' && !!deltaMap && deltaMap.size > 0);

  // Custom fixed-position tooltip — rendered outside the overflow:hidden map
  // container so it never gets clipped when hovering near the map edge.
  let tipHtml    = $state('');
  let tipX       = $state(0);
  let tipY       = $state(0);
  let tipVisible = $state(false);

  function tipStyle(x: number, y: number): string {
    const W = typeof window !== 'undefined' ? window.innerWidth  : 1280;
    const H = typeof window !== 'undefined' ? window.innerHeight : 800;
    const TW = 210;   // max tooltip width (matches max-w below)
    const TH = 130;   // estimated max tooltip height
    const OX = 20;    // horizontal offset from cursor
    const OY = 40;    // vertical offset upward from cursor
    const left = x + OX + TW > W ? x - TW - OX : x + OX;
    const top  = y - OY < 0    ? y + OX        : y - OY;
    return `left:${left}px;top:${top}px;`;
  }

  onMount(() => {
    map = L.map(mapEl, { zoomControl: true, attributionControl: false }).setView([32.7, -83.5], 7);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 18
    }).addTo(map);
    // Open attribution source links in a new tab so users don't lose the app when clicking.
    L.control.attribution({
      prefix: '<a href="https://leafletjs.com" target="_blank" rel="noopener">Leaflet</a>'
    })
      .addAttribution('&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>')
      .addTo(map);
    onMapReady?.(map);
  });

  onDestroy(() => {
    map?.remove();
  });

  function featureId(feature: GeoJSON.Feature | undefined): string {
    if (!feature) return '';
    const p = feature.properties ?? {};
    return String(
      p.district ?? p.DISTRICT ?? p.DISTRICTID ??
      p.District ?? p.NAME ?? p.name ?? '?'
    );
  }

  // Absolute population buckets — used only when a single plan is selected and
  // there is nothing to compare.  When deltas are available, pop is colored by
  // Lower / Same / Higher relative to Plan A instead (see style()).
  function getColor(value: number, metric: string): string {
    if (metric === 'partisan') return partisanColor(value);
    if (metric === 'minority_vap') return minorityVapColor(value);
    return popColor(value);
  }

  function getDeltaColor(delta: DistrictDelta | undefined, mode: string): string {
    if (!delta) return '#e5e7eb'; // gray = no data
    if (mode === 'flip') {
      if (delta.partisanFlipLabel === 'Gained Dem') return '#2563eb'; // blue
      if (delta.partisanFlipLabel === 'Lost Dem')   return '#dc2626'; // red
      return '#d1d5db'; // unchanged gray
    }
    if (mode === 'competitive_change') {
      if (delta.competitiveChangeLabel === 'Gained Competitive') return '#16a34a'; // green
      if (delta.competitiveChangeLabel === 'Lost Competitive')   return '#f97316'; // orange
      return '#d1d5db';
    }
    if (mode === 'minority_change') {
      const hasGain = delta.bvapChangeLabel.includes('Gained') || delta.mvapChangeLabel.includes('Gained');
      const hasLoss = delta.bvapChangeLabel.includes('Lost')   || delta.mvapChangeLabel.includes('Lost');
      if (hasGain) return '#7c3aed'; // purple
      if (hasLoss) return '#d97706'; // amber
      return '#d1d5db';
    }
    return '#e5e7eb';
  }

  function buildTooltip(id: string, m: DistrictMetrics | undefined, delta?: DistrictDelta): string {
    if (!m) return `<strong>${side ? side + '-' : ''}District ${id}</strong><br><em>No data</em>`;
    const bvapPct = m.vap > 0 ? (m.blackVap / m.vap) * 100 : 0;
    const sign = m.partisanLean >= 50 ? 'D' : 'R';
    const margin = Math.abs(m.partisanLean - 50).toFixed(1);
    let base = `<strong>${side ? side + '-' : ''}District ${id}</strong><br>Pop: ${m.totalPop.toLocaleString()}<br>VAP: ${m.vap.toLocaleString()}<br>Black VAP: ${bvapPct.toFixed(1)}%<br>Minority VAP: ${m.minorityVapPct.toFixed(1)}%<br>Partisan: ${sign}+${margin}%`;
    if (delta) {
      const labels = [delta.partisanFlipLabel, delta.competitiveChangeLabel, delta.bvapChangeLabel, delta.mvapChangeLabel]
        .filter(l => l !== '').join(', ');
      if (labels) base += `<br><em>${labels}</em>`;
    }
    return base;
  }

  $effect(() => {
    if (!map || !geojson) return;

    // Use untrack to read the old layer without making it a reactive dependency.
    // Without this, writing geojsonLayer inside this same effect would re-trigger it → infinite loop.
    const oldLayer = untrack(() => geojsonLayer);
    if (oldLayer) {
      map.removeLayer(oldLayer);
    }
    layerById.clear();

    const isDeltaMode = colorBy === 'flip' || colorBy === 'competitive_change' || colorBy === 'minority_change';

    const newLayer = L.geoJSON(geojson as GeoJSON.GeoJsonObject, {
      style: feature => {
        if (!feature) return {};
        const id = featureId(feature);
        if (isDeltaMode) {
          const delta = deltaMap?.get(id);
          return { fillColor: getDeltaColor(delta, colorBy), fillOpacity: 0.8, color: '#fff', weight: 1.5 };
        }
        const m = metrics?.get(id);
        if (colorBy === 'pop') {
          const delta = deltaMap?.get(id);
          // Population is only meaningful as a *comparison* (Lower/Same/Higher
          // vs Plan A).  Absolute population buckets make everything look
          // uniformly dark — the "all districts higher" bug.
          if (delta) {
            const basePop = delta.a?.totalPop ?? m?.totalPop ?? 0;
            return {
              fillColor: popDeltaColor(delta.deltaPop, basePop),
              fillOpacity: 0.8, color: '#fff', weight: 1.5
            };
          }
          return { fillColor: popColor(m?.totalPop ?? 0), fillOpacity: 0.7, color: '#fff', weight: 1.5 };
        }
        const value = colorBy === 'minority_vap'
          ? (m?.minorityVapPct ?? 0)
          : (m?.partisanLean ?? 50);
        return { fillColor: getColor(value, colorBy), fillOpacity: 0.7, color: '#fff', weight: 1.5 };
      },
      onEachFeature: (feature, layer) => {
        const id = featureId(feature);
        const m = metrics?.get(id);
        layerById.set(id, layer as L.Path);
        const delta = isDeltaMode ? deltaMap?.get(id) : undefined;
        const html = buildTooltip(id, m, delta);
        layer.on('mousemove', (e: L.LeafletMouseEvent) => {
          tipHtml    = html;
          tipX       = e.originalEvent.clientX;
          tipY       = e.originalEvent.clientY;
          tipVisible = true;
        });
        layer.on('mouseover', () => onHover?.(id));
        layer.on('mouseout',  () => { tipVisible = false; onHover?.(null); });
      }
    }).addTo(map);

    geojsonLayer = newLayer;
    const bounds = newLayer.getBounds();
    // Tight padding so Georgia fills the frame with minimal empty space
    // above/below. The state is taller than wide, so height is usually the
    // limiting dimension in these side-by-side panes.
    if (bounds.isValid()) map.fitBounds(bounds, { padding: [2, 2] });
  });

  // Highlight sync: called when highlightedId changes OR geojsonLayer is rebuilt
  $effect(() => {
    const hl = highlightedId;
    const gl = geojsonLayer;
    if (!gl) return;
    gl.eachLayer(layer => {
      const l = layer as L.Path & { feature?: GeoJSON.Feature };
      const id = featureId(l.feature);
      const isHl = hl !== null && id === hl;
      l.setStyle({
        weight:      isHl ? 3   : 1.5,
        color:       isHl ? '#fbbf24' : '#fff',
        fillOpacity: isHl ? 0.9 : 0.7,
      });
      // tooltip is custom (fixed-position div); no Leaflet tooltip to open/close
    });
  });
</script>

<div class="flex flex-col h-full">
  <div class="text-xs font-semibold text-center py-1.5 px-2 bg-white border-b border-gray-200 truncate text-gray-700">
    {label}
  </div>
  <div class="relative flex-1 min-h-0">
    <div bind:this={mapEl} class="absolute inset-0"></div>

    <!-- Legend overlay — lives with the map so preview and report can never drift -->
    <div class="absolute top-2 right-2 z-[500] pointer-events-none bg-white/95 border border-gray-200 rounded-lg shadow-sm px-2.5 py-2 text-[10px] leading-tight text-gray-700 max-h-[85%] overflow-y-auto">
      <p class="font-semibold text-gray-500 mb-1">
        {colorBy === 'partisan' ? 'Partisan Lean' : colorBy === 'minority_vap' ? 'Minority VAP' : colorBy === 'pop' ? (popCompare ? 'Population change' : 'Population') : 'Change'}
      </p>
      {#if colorBy === 'partisan'}
        {#each [
          ['Safe R', '#bc131e'], ['Lean R', '#eb4956'], ['Competitive R', '#c36e9e'],
          ['Competitive D', '#7279db'], ['Lean D', '#3c6ebf'], ['Safe D', '#1f4bae']
        ] as [t, c]}
          <div class="flex items-center gap-1.5"><span class="w-2.5 h-2.5 rounded-sm shrink-0" style="background:{c}"></span>{t}</div>
        {/each}
      {:else if colorBy === 'minority_vap'}
        {#each [
          ['≥50% Majority', '#5c2d91'], ['37–50% Influence', '#8b5cf6'], ['25–37%', '#a78bfa'],
          ['15–25%', '#ddd6fe'], ['<15%', '#f5f3ff']
        ] as [t, c]}
          <div class="flex items-center gap-1.5"><span class="w-2.5 h-2.5 rounded-sm shrink-0" style="background:{c}"></span>{t}</div>
        {/each}
      {:else if colorBy === 'pop'}
        {#if popCompare}
          {#each [['Higher', '#14532d'], ['Same (±0.5%)', '#e5e7eb'], ['Lower', '#bbf7d0']] as [t, c]}
            <div class="flex items-center gap-1.5"><span class="w-2.5 h-2.5 rounded-sm shrink-0" style="background:{c}"></span>{t}</div>
          {/each}
        {:else}
          {#each [['≥80K', '#14532d'], ['60–80K', '#15803d'], ['40–60K', '#4ade80'], ['20–40K', '#bbf7d0'], ['<20K', '#f0fdf4']] as [t, c]}
            <div class="flex items-center gap-1.5"><span class="w-2.5 h-2.5 rounded-sm shrink-0" style="background:{c}"></span>{t}</div>
          {/each}
        {/if}
      {:else if colorBy === 'flip'}
        {#each [['Gained Dem', '#2563eb'], ['Lost Dem', '#dc2626'], ['Unchanged', '#d1d5db']] as [t, c]}
          <div class="flex items-center gap-1.5"><span class="w-2.5 h-2.5 rounded-sm shrink-0" style="background:{c}"></span>{t}</div>
        {/each}
      {:else if colorBy === 'competitive_change'}
        {#each [['Gained Competitive', '#16a34a'], ['Lost Competitive', '#f97316'], ['Unchanged', '#d1d5db']] as [t, c]}
          <div class="flex items-center gap-1.5"><span class="w-2.5 h-2.5 rounded-sm shrink-0" style="background:{c}"></span>{t}</div>
        {/each}
      {:else if colorBy === 'minority_change'}
        {#each [['Gained Minority VAP', '#7c3aed'], ['Lost Minority VAP', '#d97706'], ['Unchanged', '#d1d5db']] as [t, c]}
          <div class="flex items-center gap-1.5"><span class="w-2.5 h-2.5 rounded-sm shrink-0" style="background:{c}"></span>{t}</div>
        {/each}
      {/if}
    </div>
  </div>
</div>

{#if tipVisible}
  <div
    class="fixed z-[9999] pointer-events-none max-w-[210px] bg-white/95 border border-gray-200 rounded-lg shadow-lg px-3 py-2 text-xs leading-snug text-gray-800"
    style={tipStyle(tipX, tipY)}
  >
    {@html tipHtml}
  </div>
{/if}
