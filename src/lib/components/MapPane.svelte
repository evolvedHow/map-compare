<script lang="ts">
  import { onMount, onDestroy, untrack } from 'svelte';
  import L from 'leaflet';
  import 'leaflet/dist/leaflet.css';
  import type { DistrictMetrics, DistrictDelta, ColorByMode } from '../types';

  interface Props {
    geojson: GeoJSON.FeatureCollection | null;
    metrics: Map<string, DistrictMetrics> | null;
    colorBy: ColorByMode;
    label: string;
    deltaMap?: Map<string, DistrictDelta>;   // for flip/competitive_change/minority_change modes
    onMapReady?: (map: L.Map) => void;
    onHover?: (id: string | null) => void;
    highlightedId?: string | null;
  }

  let {
    geojson, metrics, colorBy, label,
    deltaMap, onMapReady, onHover, highlightedId = null
  }: Props = $props();

  let mapEl: HTMLDivElement;
  let map: L.Map;
  let geojsonLayer = $state<L.GeoJSON | null>(null);
  const layerById = new Map<string, L.Path>();

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

  function getColor(value: number, metric: string): string {
    if (metric === 'partisan') {
      if (value >= 65) return '#1a4fa0';
      if (value >= 55) return '#4c8ed9';
      if (value >= 50) return '#93b8e8';
      if (value >= 45) return '#e8a097';
      if (value >= 35) return '#d94c4c';
      return '#a01a1a';
    }
    if (metric === 'minority_vap') {
      if (value >= 60) return '#5c2d91';
      if (value >= 45) return '#8b5cf6';
      if (value >= 30) return '#a78bfa';
      if (value >= 15) return '#ddd6fe';
      return '#f5f3ff';
    }
    if (value >= 80000) return '#14532d';
    if (value >= 60000) return '#15803d';
    if (value >= 40000) return '#4ade80';
    if (value >= 20000) return '#bbf7d0';
    return '#f0fdf4';
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
    if (!m) return `<strong>District ${id}</strong><br><em>No data</em>`;
    const bvapPct = m.vap > 0 ? (m.blackVap / m.vap) * 100 : 0;
    const sign = m.partisanLean >= 50 ? 'D' : 'R';
    const margin = Math.abs(m.partisanLean - 50).toFixed(1);
    let base = `<strong>District ${id}</strong><br>Pop: ${m.totalPop.toLocaleString()}<br>VAP: ${m.vap.toLocaleString()}<br>Black VAP: ${bvapPct.toFixed(1)}%<br>Minority VAP: ${m.minorityVapPct.toFixed(1)}%<br>Partisan: ${sign}+${margin}%`;
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
        const value =
          colorBy === 'pop'          ? (m?.totalPop ?? 0)
          : colorBy === 'minority_vap' ? (m?.minorityVapPct ?? 0)
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
  <div bind:this={mapEl} class="flex-1"></div>
</div>

{#if tipVisible}
  <div
    class="fixed z-[9999] pointer-events-none max-w-[210px] bg-white/95 border border-gray-200 rounded-lg shadow-lg px-3 py-2 text-xs leading-snug text-gray-800"
    style={tipStyle(tipX, tipY)}
  >
    {@html tipHtml}
  </div>
{/if}
