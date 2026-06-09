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

  onMount(() => {
    map = L.map(mapEl, { zoomControl: true }).setView([32.7, -83.5], 7);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 18
    }).addTo(map);
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
        (layer as L.Path).bindTooltip(buildTooltip(id, m, delta), {
          direction: 'center',
          sticky: false,
          permanent: false,
        });
        layer.on('mouseover', () => onHover?.(id));
        layer.on('mouseout',  () => onHover?.(null));
      }
    }).addTo(map);

    geojsonLayer = newLayer;
    const bounds = newLayer.getBounds();
    if (bounds.isValid()) map.fitBounds(bounds, { padding: [12, 12] });
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
      if (isHl) l.openTooltip();
      else      l.closeTooltip();
    });
  });
</script>

<div class="flex flex-col h-full">
  <div class="text-xs font-semibold text-center py-1.5 px-2 bg-white border-b border-gray-200 truncate text-gray-700">
    {label}
  </div>
  <div bind:this={mapEl} class="flex-1"></div>
</div>
