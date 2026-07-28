# map-compare — Redistricting Plan Comparison Tool

Side-by-side interactive comparison of redistricting plans with metrics and
AI-generated narratives.
Part of the [Fair Districts GA](https://fairdistrictsga.org) toolset.

---

## Purpose

map-compare lets researchers and advocates:

- Load any two redistricting plans (from a preset library or by uploading
  shapefiles) and view them side by side on interactive maps
- Compute **fairness metrics** for each plan: efficiency gap, mean-median
  difference, majority-minority district count
- Compute **compactness metrics**: Polsby-Popper score and Schwartzberg score
  per district
- Analyse **community splits**: how many counties or cities are divided
  between two or more districts in each plan
- Generate an **AI narrative** describing the comparison using any of four
  LLM providers (Groq, Anthropic, OpenAI, Google Gemini)
- Upload custom shapefiles (`.shp` / `.dbf`) to compare unofficial proposals
- Save plans to **IndexedDB** so they persist across browser sessions

All metric computation happens entirely in the browser.  The only server-side
piece is a small Cloudflare Worker that holds the AI provider key — a static
site cannot keep a secret, so the key cannot live in the bundle.  Everything
except the AI narrative works with the Worker offline.

**Audience:** Researchers, advocates comparing specific plans, expert witnesses
preparing testimony.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Svelte 5 (runes) |
| Build | Vite 6 |
| Language | TypeScript |
| Styling | Tailwind CSS 4 |
| Map | Leaflet 1.9 |
| Geospatial analysis | Turf.js 7 (area, perimeter, intersection) |
| Shapefile parsing | shpjs 6 + JSZip 3 (browser-side) |
| CSV parsing | PapaParse 5 |
| Persistence | IndexedDB (via idb 8) |
| AI narratives | Cloudflare Worker proxy to an LLM (Groq / Anthropic / OpenAI / OpenRouter / Google) |
| Package manager | npm |

---

## Directory Layout

```
map-compare/
├── src/
│   ├── App.svelte                  ← Root component, routing between views
│   ├── lib/
│   │   ├── components/
│   │   │   ├── MapPane.svelte          ← Single Leaflet map panel
│   │   │   ├── CompareView.svelte      ← Side-by-side map comparison
│   │   │   ├── MetricsTable.svelte     ← Per-district metric table
│   │   │   ├── ReportView.svelte       ← Metrics summary + AI narrative
│   │   │   ├── ScoreCard.svelte        ← High-level plan scorecard
│   │   │   ├── ShapefileCard.svelte    ← Plan selection card
│   │   │   └── ShapefileRepo.svelte    ← Preset plan library browser
│   │   ├── utils/
│   │   │   ├── compactnessMetrics.ts   ← Polsby-Popper, Schwartzberg
│   │   │   ├── fairnessMetrics.ts      ← Efficiency gap, mean-median
│   │   │   ├── spatialAnalysis.ts      ← County/city split counting
│   │   │   ├── shapefileParser.ts      ← Parse .shp/.dbf via shpjs
│   │   │   ├── aiReport.ts             ← POST to LLM provider for narrative
│   │   │   ├── db.ts                   ← IndexedDB plan storage + cache
│   │   │   └── exportImport.ts         ← Export metrics CSV / import plans
│   │   ├── stores/
│   │   │   └── shapefileStore.ts       ← Svelte 5 stores for loaded plans
│   │   └── types/
│   │       └── index.ts                ← DistrictMetrics, Plan, FairnessMetrics
├── public/
│   └── data/                       ← Preset GeoJSON files (populated by fdp sync)
│       ├── congress_*.geojson
│       ├── house_*.geojson
│       ├── senate_*.geojson
│       ├── county.geojson
│       ├── places_2020data.geojson
│       └── demographics/
├── scripts/
│   └── sync_data.sh                ← Pull GeoJSON from fdp platform
├── vite.config.ts
└── package.json
```

---

## Setup

```bash
cd ~/codebox/map-compare
npm install
```

Create `.env` for **local development only** — it is gitignored, and this
repository is public:

```env
AI_PROVIDER=groq                    # groq | anthropic | openai | openrouter | google
AI_API_KEY=gsk_...                  # API key for the chosen provider
AI_MODEL=llama-3.3-70b-versatile    # optional; defaults to provider's recommended model
```

### Where the AI key lives

The site is static, so it cannot hold a secret — anything in the bundle is
readable by every visitor. A small Cloudflare Worker holds the key instead and
makes the provider call on the visitor's behalf. Visitors configure nothing.

| environment | key location |
|---|---|
| local dev (`npm run dev`) | `.env` — read by the Vite middleware, never sent to the browser |
| deployed | Cloudflare Worker secret (`npm run worker:secret`) |
| GitHub Pages build | no key — only `VITE_ANALYZE_API_URL` in `.env.production`, a public URL |

One-time Worker setup:

```bash
npx wrangler login
npm run worker:secret     # prompts for AI_API_KEY, stored by Cloudflare
npm run worker:deploy     # prints the Worker URL
```

Then put that URL in `.env.production` as `VITE_ANALYZE_API_URL` (no trailing
slash) and rebuild. Non-secret Worker settings — provider, allowed origins —
live in `wrangler.toml`.

`npm run worker:dev` runs the Worker locally in Cloudflare's runtime and picks
up `.env` automatically.

---

## Development

```bash
npm run dev        # → http://localhost:5174
```

The preset plan library (`ShapefileRepo.svelte`) fetches GeoJSON from
`/data/`.  During dev, Vite serves these from `public/data/`.

To sync data from the platform before starting dev:

```bash
npm run sync       # → fdp sync-app map_compare --dest public/data
npm run dev
```

---

## Building for Production

```bash
npm run build
# prebuild: npm run sync (copy GeoJSON from fdp)
# build:    vite build → dist/
```

Output is a self-contained static site in `dist/`.  AI narrative calls go to
the Cloudflare Worker named in `VITE_ANALYZE_API_URL`, which holds the provider
key; the key is never part of the bundle.

---

## Metrics Reference

### Fairness metrics (`fairnessMetrics.ts`)

**Efficiency gap** — measures wasted-vote asymmetry:

```
EG = (wasted_dem_votes − wasted_rep_votes) / total_votes
```

A positive EG means more Democratic votes were "wasted" (party was cracked or
packed).  Values above ±7–8% are generally considered significant.

**Mean-median difference** — measures partisan bias in vote distribution:

```
MM = mean(district_dem_share) − median(district_dem_share)
```

Positive values indicate a systematic advantage for Republicans; negative for
Democrats.  Values above ±2% indicate potential bias.

### Compactness metrics (`compactnessMetrics.ts`)

**Polsby-Popper score** — area-to-perimeter ratio (0 = most elongated, 1 = perfect circle):

```
PP = (4π × area) / perimeter²
```

**Schwartzberg score** — perimeter ratio (1 = perfect circle, higher = less compact):

```
SB = perimeter / (2π × √(area / π))
```

Both use Turf.js for area and perimeter measurements in metres (via
`turf.area()` and geometry calculation from projected coordinates).

### Spatial analysis (`spatialAnalysis.ts`)

**County splits** — counts how many counties are divided across two or more
districts in each plan.  Uses the reference `county.geojson` for intersection
analysis.

---

## AI Narrative Generation

`utils/aiReport.ts` sends a structured prompt to the configured LLM provider
asking it to write a plain-English summary of the metric comparison.

Supported providers and their default models:

| Provider | Default model |
|---|---|
| Groq | `llama-3.3-70b-versatile` |
| Anthropic | `claude-sonnet-4-6` |
| OpenAI | `gpt-4o-mini` |
| OpenRouter | `google/gemini-flash-1.5` |
| Google | `gemini-flash-lite-latest` |

The browser never talks to the provider directly and never sees the key.  It
POSTs to `/api/analyze`, which is served by the Vite dev middleware locally and
by the Cloudflare Worker in production.  Both import the same module —
`shared/analyze-core.ts` — so dev and production cannot drift apart in which
providers they support or which models they call.

---

## Plan Storage (IndexedDB)

`utils/db.ts` wraps IndexedDB via the `idb` library:

- **Plan store:** Saves uploaded or fetched GeoJSON by plan ID.  Plans persist
  across sessions without re-uploading.
- **Metrics cache:** Caches computed metrics keyed by plan ID + metric type
  so expensive Turf.js calculations don't repeat on reload.

Plans can be exported to GeoJSON or metrics to CSV via `exportImport.ts`.

---

## Preset Plan Library

`ShapefileRepo.svelte` displays the preset plan catalogue defined in
`fdp/config/apps/map_compare.yml`.  Each entry references a GeoJSON in
`public/data/` (populated by `npm run sync`).

To add a new preset plan:

1. Add the GeoJSON file to `fdp/data/repos/main/boundaries/{chamber}/`
2. Add an entry in `fdp/config/apps/map_compare.yml` under the appropriate chamber
3. Run `npm run sync` to pull it into `public/data/`

---

## Uploading Custom Shapefiles

Users can upload a `.zip` containing `.shp` + `.dbf` files (standard shapefile
format).  `shapefileParser.ts` uses `shpjs` to parse the binary format in the
browser and converts it to GeoJSON.  The parsed plan is then saved to IndexedDB.

Requirements for uploaded shapefiles:
- Must include a `.dbf` with at minimum a district identifier column
- Geometry should be in WGS-84 (EPSG:4326) — other CRS are not auto-converted
- Each feature should represent one district

---

## FDP Integration

```
fdp/config/apps/map_compare.yml    ← preset plan catalogue (mirrors fdex plans)
fdp/data/repos/main/               ← canonical GeoJSON source
map-compare/scripts/sync_data.sh   ← copies from fdp into public/data/
```

To test with a workspace (e.g. a new boundary file):

```bash
fdp workspace create test_plans --base main
cp ~/new_house.geojson ~/codebox/fgdp/fdp/data/workspaces/test_plans/boundaries/house/
FDP_WORKSPACE=test_plans npm run sync && npm run dev
```

---

## Related Projects

| Project | Integration |
|---|---|
| **fdp** | Canonical source for preset GeoJSON files |
| **fdex** | Shares identical plan catalogue; plan IDs match across both apps |
| **fdga-chain** | Could consume `/ensemble/enacted` endpoint for scoring preloaded plans |
| **lrdb** | Independent; no runtime integration |
