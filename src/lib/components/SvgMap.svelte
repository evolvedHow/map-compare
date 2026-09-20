<script lang="ts">
  import type { DistrictMetrics, DistrictDelta } from '../types';
  import { districtId } from '../utils/spatialAnalysis';
  import {
    partisanColor, minorityVapColor, popColor, popDeltaColor,
    changeShade, CHANGE_COLORS
  } from '../utils/scales';

  interface Props {
    geojson: GeoJSON.FeatureCollection;
    metrics: Map<string, DistrictMetrics>;
    colorBy: 'partisan' | 'minority_vap' | 'pop' | 'delta';
    deltas?: DistrictDelta[];
    /** Per-district comparison deltas. When present, Population renders
     *  Higher / Same / Lower relative to Plan A (matches the Leaflet maps). */
    deltaMap?: Map<string, DistrictDelta>;
    width?: number;
    height?: number;
    label?: string;
  }

  let {
    geojson,
    metrics,
    colorBy,
    deltas = [],
    deltaMap,
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
      if (!d) return CHANGE_COLORS.stable;
      // Same predicate as the "Shifted >5pp" count: partisan lean OR minority
      // VAP moved more than 5 points.  Minority-only shifts render amber so
      // the map can never show fewer districts highlighted than the count.
      const s = changeShade(d.deltaPartisanLean, d.deltaMinorityVapPct);
      if (s.stable)  return CHANGE_COLORS.stable;
      if (s.vraOnly) return CHANGE_COLORS.vraOnly;
      return CHANGE_COLORS[s.partisan];
    }
    const m = metrics.get(id);
    if (!m) return '#e5e7eb';
    if (colorBy === 'partisan')     return partisanColor(m.partisanLean);
    if (colorBy === 'minority_vap') return minorityVapColor(m.minorityVapPct);
    const delta = deltaMap?.get(id);
    if (delta) {
      const basePop = delta.a?.totalPop ?? m.totalPop;
      return popDeltaColor(delta.deltaPop, basePop);
    }
    return popColor(m.totalPop);
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
