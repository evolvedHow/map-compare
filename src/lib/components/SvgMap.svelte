<script lang="ts">
  import type { DistrictMetrics, DistrictDelta } from '../types';
  import { districtId } from '../utils/spatialAnalysis';

  interface Props {
    geojson: GeoJSON.FeatureCollection;
    metrics: Map<string, DistrictMetrics>;
    colorBy: 'partisan' | 'minority_vap' | 'pop' | 'delta';
    deltas?: DistrictDelta[];
    width?: number;
    height?: number;
    label?: string;
  }

  let {
    geojson,
    metrics,
    colorBy,
    deltas = [],
    width = 420,
    height = 290,
    label = ''
  }: Props = $props();

  function walkCoords(
    geom: GeoJSON.Geometry | null | undefined,
    fn: (lon: number, lat: number) => void
  ) {
    if (!geom) return;
    if (geom.type === 'Polygon') {
      for (const ring of geom.coordinates) for (const p of ring) fn(p[0], p[1]);
    } else if (geom.type === 'MultiPolygon') {
      for (const poly of geom.coordinates)
        for (const ring of poly)
          for (const p of ring) fn(p[0], p[1]);
    }
  }

  function computeBbox(): [number, number, number, number] {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const f of geojson.features) {
      walkCoords(f.geometry, (lon, lat) => {
        if (lon < minX) minX = lon;
        if (lon > maxX) maxX = lon;
        if (lat < minY) minY = lat;
        if (lat > maxY) maxY = lat;
      });
    }
    return [minX, minY, maxX, maxY];
  }

  function makeProjector(
    bbox: [number, number, number, number]
  ): (lon: number, lat: number) => [number, number] {
    const [minX, minY, maxX, maxY] = bbox;
    const pad = 6;
    const cosLat = Math.cos(((minY + maxY) / 2) * Math.PI / 180);
    const spanX = (maxX - minX) * cosLat;
    const spanY = maxY - minY;
    const availW = width - pad * 2;
    const availH = height - pad * 2;
    const scale = Math.min(availW / spanX, availH / spanY);
    const dx = pad + (availW - spanX * scale) / 2;
    const dy = pad + (availH - spanY * scale) / 2;
    return (lon, lat) => [
      dx + (lon - minX) * cosLat * scale,
      height - dy - (lat - minY) * scale
    ];
  }

  function ringToD(
    ring: number[][],
    project: (lon: number, lat: number) => [number, number]
  ): string {
    if (ring.length < 3) return '';
    const pts = ring.map(p => project(p[0], p[1]));
    return 'M' + pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join('L') + 'Z';
  }

  function geomToD(
    geom: GeoJSON.Geometry | null | undefined,
    project: (lon: number, lat: number) => [number, number]
  ): string {
    if (!geom) return '';
    if (geom.type === 'Polygon')
      return geom.coordinates.map(r => ringToD(r, project)).join('');
    if (geom.type === 'MultiPolygon')
      return geom.coordinates.flatMap(poly => poly.map(r => ringToD(r, project))).join('');
    return '';
  }

  function districtFill(id: string): string {
    if (colorBy === 'delta') {
      const d = deltas.find(x => x.districtId === id);
      if (!d) return '#e5e7eb';
      const v = d.deltaPartisanLean;
      if (v > 10)  return '#1d4ed8';
      if (v > 5)   return '#93c5fd';
      if (v < -10) return '#b91c1c';
      if (v < -5)  return '#fca5a5';
      return '#d1d5db';
    }
    const m = metrics.get(id);
    if (!m) return '#e5e7eb';
    if (colorBy === 'partisan') {
      const v = m.partisanLean;
      if (v >= 65) return '#1a4fa0';
      if (v >= 55) return '#4c8ed9';
      if (v >= 50) return '#93b8e8';
      if (v >= 45) return '#e8a097';
      if (v >= 35) return '#d94c4c';
      return '#a01a1a';
    }
    if (colorBy === 'minority_vap') {
      const v = m.minorityVapPct;
      if (v >= 60) return '#5c2d91';
      if (v >= 45) return '#8b5cf6';
      if (v >= 30) return '#a78bfa';
      if (v >= 15) return '#ddd6fe';
      return '#f5f3ff';
    }
    const v = m.totalPop;
    if (v >= 80000) return '#14532d';
    if (v >= 60000) return '#15803d';
    if (v >= 40000) return '#4ade80';
    if (v >= 20000) return '#bbf7d0';
    return '#f0fdf4';
  }

  const paths = $derived.by(() => {
    const bbox = computeBbox();
    const project = makeProjector(bbox);
    return geojson.features
      .map((f, i) => {
        const id = districtId(f, i);
        const d = geomToD(f.geometry, project);
        return { id, d, fill: districtFill(id) };
      })
      .filter(x => x.d);
  });
</script>

{#if label}
  <p class="text-[10px] font-semibold text-center text-gray-600 mb-0.5 leading-tight">{label}</p>
{/if}
<svg
  {width}
  {height}
  viewBox="0 0 {width} {height}"
  style="display:block; max-width:100%; overflow:visible;"
>
  {#each paths as p (p.id)}
    <path
      d={p.d}
      fill={p.fill}
      stroke="#ffffff"
      stroke-width="0.6"
      fill-rule="evenodd"
    />
  {/each}
</svg>
