/**
 * Shared AI-analysis core.
 *
 * Runs unchanged in two places:
 *   - the Vite dev-server middleware (Node, local development)
 *   - the Cloudflare Worker (workerd, deployed)
 *
 * Both call analyze() and neither owns a private copy of the provider tables,
 * the prompt, or the response parsing. That matters: this file exists because
 * the dev middleware and the old FastAPI backend had drifted into two separate
 * implementations, and a provider that worked in one silently misbehaved in
 * the other (AI_PROVIDER=google fell through to Groq's endpoint in dev, and
 * both had pinned a Gemini model that Google had since retired).
 *
 * Uses nothing but fetch, so it is portable across both runtimes — no Node
 * built-ins, no Cloudflare-specific APIs.
 */

export interface AnalyzeConfig {
  provider: string;
  apiKey: string;
  model?: string;
}

export interface Narrative {
  execSummary: string;
  demographicImpact: string;
  partisanImpact: string;
  compactnessNotes: string;
  vraConsiderations: string;
  keyFindings: string[];
}

// Rolling aliases are preferred over pinned versions where a provider offers
// them — gemini-2.5-flash-lite was retired for new API keys and started
// returning a 404 whose message read like a configuration error.
const PROVIDER_MODELS: Record<string, string> = {
  groq:       'llama-3.3-70b-versatile',
  anthropic:  'claude-sonnet-4-6',
  openai:     'gpt-4o-mini',
  openrouter: 'google/gemini-flash-1.5',
  google:     'gemini-flash-lite-latest',
};

// Anthropic is not OpenAI-compatible and is handled by callAnthropic instead.
const PROVIDER_URLS: Record<string, string> = {
  groq:       'https://api.groq.com/openai/v1',
  openai:     'https://api.openai.com/v1',
  openrouter: 'https://openrouter.ai/api/v1',
  google:     'https://generativelanguage.googleapis.com/v1beta/openai',
};

export const SUPPORTED_PROVIDERS = Object.keys(PROVIDER_MODELS);

export class UnsupportedProviderError extends Error {
  constructor(provider: string) {
    super(`AI_PROVIDER="${provider}" is not supported. Use one of: ${SUPPORTED_PROVIDERS.join(', ')}`);
    this.name = 'UnsupportedProviderError';
  }
}

export function defaultModel(provider: string): string {
  const m = PROVIDER_MODELS[provider];
  if (!m) throw new UnsupportedProviderError(provider);
  return m;
}

export function providerUrl(provider: string): string {
  const u = PROVIDER_URLS[provider];
  // Never fall through to a default here — that is how a Gemini key ended up
  // being posted to api.groq.com.
  if (!u) throw new UnsupportedProviderError(provider);
  return u;
}

export function resolveModel(cfg: AnalyzeConfig): string {
  return cfg.model || defaultModel(cfg.provider);
}

export function buildPrompt(body: any): string {
  const {
    planA, planB, metricsA, metricsB, topChanges, totalDistricts, significantlyChanged,
  } = body ?? {};

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
  baseUrl: string, apiKey: string, model: string, prompt: string,
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
  const data: any = await resp.json();
  return parseJsonSafe(data.choices?.[0]?.message?.content ?? '{}');
}

async function callAnthropic(
  apiKey: string, model: string, prompt: string,
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
  const data: any = await resp.json();
  return parseJsonSafe(data.content?.[0]?.text ?? '{}');
}

export function parseJsonSafe(text: string): Record<string, unknown> {
  try { return JSON.parse(text); } catch { /* fall through */ }
  const m = text.match(/\{[\s\S]*\}/);
  if (m) return JSON.parse(m[0]);
  throw new Error('Could not parse JSON from AI response');
}

/** Build the prompt, call the configured provider, return the parsed narrative. */
export async function analyze(body: any, cfg: AnalyzeConfig): Promise<Record<string, unknown>> {
  const provider = (cfg.provider || 'groq').toLowerCase();
  const model = cfg.model || defaultModel(provider);
  const prompt = buildPrompt(body);
  return provider === 'anthropic'
    ? callAnthropic(cfg.apiKey, model, prompt)
    : callOpenAICompat(providerUrl(provider), cfg.apiKey, model, prompt);
}
