import { defineConfig, loadEnv, type Plugin } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import tailwindcss from '@tailwindcss/vite';

function aiAnalyzePlugin(): Plugin {
  return {
    name: 'ai-analyze',
    configureServer(server) {
      server.middlewares.use('/api/analyze', async (req: any, res: any) => {
        if (req.method !== 'POST') {
          res.statusCode = 405; res.end('Method Not Allowed'); return;
        }
        try {
          const chunks: Buffer[] = [];
          for await (const chunk of req) chunks.push(chunk as Buffer);
          const body = JSON.parse(Buffer.concat(chunks).toString());

          const provider = (process.env.AI_PROVIDER ?? 'groq').toLowerCase();
          const apiKey   = process.env.AI_API_KEY ?? '';
          const model    = process.env.AI_MODEL ?? defaultModel(provider);

          if (!apiKey) {
            res.statusCode = 503;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({
              error: 'AI_API_KEY not set. Add AI_PROVIDER and AI_API_KEY to .env'
            }));
            return;
          }

          const prompt = buildPrompt(body);
          const result = provider === 'anthropic'
            ? await callAnthropic(apiKey, model, prompt)
            : await callOpenAICompat(providerUrl(provider), apiKey, model, prompt);

          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify(result));
        } catch (e: any) {
          res.statusCode = 500;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: e.message ?? 'Internal server error' }));
        }
      });
    }
  };
}

// Keep these tables in sync with backend/main.py — the dev middleware and the
// deployed FastAPI backend must accept the same AI_PROVIDER values, or a
// provider that works in production silently misbehaves in dev.
const PROVIDER_MODELS: Record<string, string> = {
  groq:       'llama-3.3-70b-versatile',
  anthropic:  'claude-sonnet-4-6',
  openai:     'gpt-4o-mini',
  openrouter: 'google/gemini-flash-1.5',
  // Rolling alias, not a pinned version — gemini-2.5-flash-lite was retired
  // for new API keys and returned a 404 that read like a config error.
  google:     'gemini-flash-lite-latest',
};

// Anthropic is not OpenAI-compatible and is called by callAnthropic instead.
const PROVIDER_URLS: Record<string, string> = {
  groq:       'https://api.groq.com/openai/v1',
  openai:     'https://api.openai.com/v1',
  openrouter: 'https://openrouter.ai/api/v1',
  google:     'https://generativelanguage.googleapis.com/v1beta/openai',
};

export const SUPPORTED_PROVIDERS = Object.keys(PROVIDER_MODELS);

function defaultModel(provider: string): string {
  const m = PROVIDER_MODELS[provider];
  if (!m) throw new Error(unsupported(provider));
  return m;
}

function providerUrl(provider: string): string {
  const u = PROVIDER_URLS[provider];
  // Falling through to a default here is how a Gemini key ended up being sent
  // to Groq's endpoint. Fail loudly instead.
  if (!u) throw new Error(unsupported(provider));
  return u;
}

function unsupported(provider: string): string {
  return `AI_PROVIDER="${provider}" is not supported. Use one of: ${SUPPORTED_PROVIDERS.join(', ')}`;
}

function buildPrompt(body: any): string {
  const { planA, planB, metricsA, metricsB, topChanges, totalDistricts, significantlyChanged } = body;
  const changedList = ((topChanges ?? []) as any[]).slice(0, 12)
    .map(d =>
      `  • District ${d.id}${d.renumbered ? ` (spatially matched to Plan B D${d.matchedBId})` : ''}: lean ${d.leanA} → ${d.leanB}, Black VAP ${d.bvapA}% → ${d.bvapB}%`
    ).join('\n');

  const fmt = (v: any, decimals = 1) =>
    v === undefined || v === null ? 'n/a' : Number(v).toFixed(decimals);

  return `You are a nonpartisan redistricting expert. Analyze these two Georgia legislative district plans.

PLAN A: ${planA?.name} (${planA?.year})
PLAN B: ${planB?.name} (${planB?.year})

METRICS (Plan A → Plan B):
Population deviation max: ${fmt(metricsA?.popDevMax)}% → ${fmt(metricsB?.popDevMax)}%  (lower = more equal)
Polsby-Popper compactness avg: ${fmt(metricsA?.polsbyPopper, 3)} → ${fmt(metricsB?.polsbyPopper, 3)}  (higher = more compact, 0–1)
Convex hull ratio avg: ${fmt(metricsA?.convexHullRatio, 3)} → ${fmt(metricsB?.convexHullRatio, 3)}
County splits: ${metricsA?.countySplits ?? 'n/a'} → ${metricsB?.countySplits ?? 'n/a'}  (lower = fewer boundary crossings)
Majority-minority districts: ${metricsA?.mmDistricts ?? 'n/a'} → ${metricsB?.mmDistricts ?? 'n/a'}
Black-majority districts: ${metricsA?.bvapMaj ?? 'n/a'} → ${metricsB?.bvapMaj ?? 'n/a'}
Dem-leaning seats: ${metricsA?.demSeats ?? 'n/a'} → ${metricsB?.demSeats ?? 'n/a'} of ${totalDistricts}
Efficiency gap: ${fmt(metricsA?.efficiencyGap)}% → ${fmt(metricsB?.efficiencyGap)}%  (positive = Dem advantage; ±8% is the court threshold)
Mean-median difference: ${fmt(metricsA?.meanMedian)}% → ${fmt(metricsB?.meanMedian)}%
Partisan bias: ${fmt(metricsA?.partisanBias)}pp → ${fmt(metricsB?.partisanBias)}pp

CHANGED DISTRICTS (${significantlyChanged} of ${totalDistricts} changed >5pp):
${changedList || '  None exceeded the 5pp threshold'}

Respond ONLY with valid JSON — no markdown, no preamble:
{
  "execSummary": "2-3 sentence overview of the most important differences",
  "demographicImpact": "1-2 sentences on changes to racial and ethnic representation, including majority-minority district gains or losses",
  "partisanImpact": "1-2 sentences on partisan fairness changes — which party benefits from Plan B and what the efficiency gap and bias scores indicate",
  "compactnessNotes": "1 sentence on geographic compactness and county preservation changes",
  "vraConsiderations": "1-2 sentences on Voting Rights Act Section 2 considerations — whether minority representation was preserved, diluted, or enhanced",
  "keyFindings": ["specific finding with numbers", "specific finding", "specific finding", "specific finding", "specific finding"]
}`;
}

async function callOpenAICompat(
  baseUrl: string, apiKey: string, model: string, prompt: string
): Promise<Record<string, unknown>> {
  const resp = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
      temperature: 0.3,
      max_tokens: 1200,
    }),
  });
  if (!resp.ok) {
    const t = await resp.text();
    throw new Error(`${baseUrl} error ${resp.status}: ${t.slice(0, 200)}`);
  }
  const data = await resp.json();
  return parseJsonSafe(data.choices?.[0]?.message?.content ?? '{}');
}

async function callAnthropic(
  apiKey: string, model: string, prompt: string
): Promise<Record<string, unknown>> {
  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      max_tokens: 1200,
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  if (!resp.ok) {
    const t = await resp.text();
    throw new Error(`Anthropic error ${resp.status}: ${t.slice(0, 200)}`);
  }
  const data = await resp.json();
  return parseJsonSafe(data.content?.[0]?.text ?? '{}');
}

function parseJsonSafe(text: string): Record<string, unknown> {
  try { return JSON.parse(text); } catch { /* fall through */ }
  const m = text.match(/\{[\s\S]*\}/);
  if (m) return JSON.parse(m[0]);
  throw new Error('Could not parse JSON from AI response');
}

export default defineConfig(({ mode }) => {
  // Vite only exposes VITE_-prefixed vars, and never on process.env — so the
  // AI_* keys in .env were invisible to the dev middleware, which reads
  // process.env directly. The empty prefix loads every var; copy the ones we
  // need across without clobbering anything already set in the real shell
  // environment (which must win, so CI and one-off overrides still work).
  const fileEnv = loadEnv(mode, process.cwd(), '');
  for (const k of ['AI_PROVIDER', 'AI_API_KEY', 'AI_MODEL', 'VITE_ANALYZE_API_URL']) {
    if (!process.env[k] && fileEnv[k]) process.env[k] = fileEnv[k];
  }

  // In dev, if VITE_ANALYZE_API_URL is set, proxy to the local FastAPI backend.
  // If not set, the built-in Vite middleware (aiAnalyzePlugin) handles the call.
  const backendUrl = process.env.VITE_ANALYZE_API_URL;
  const proxyConfig = backendUrl
    ? { '/api/analyze': { target: backendUrl, changeOrigin: true } }
    : undefined;

  return {
    base: '/map-compare/',
    plugins: [tailwindcss(), svelte(), aiAnalyzePlugin()],
    optimizeDeps: {
      include: ['leaflet', 'shpjs'],
    },
    server: proxyConfig ? { proxy: proxyConfig } : undefined,
  };
});
