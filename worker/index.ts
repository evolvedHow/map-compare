/**
 * map-compare AI analysis — Cloudflare Worker.
 *
 * Replaces the Railway/FastAPI container. Its only job is to hold the AI key
 * server-side and relay one request, which is all a static GitHub Pages site
 * needs: the browser cannot keep a secret, so the key lives here instead.
 *
 * Routes
 *   GET  /api/health   config check — never returns the key itself
 *   POST /api/analyze  plan comparison → narrative JSON
 *
 * Config (wrangler.toml [vars], except the key)
 *   AI_PROVIDER      groq | anthropic | openai | openrouter | google
 *   AI_API_KEY       secret — set with `npx wrangler secret put AI_API_KEY`
 *   AI_MODEL         optional model override
 *   ALLOWED_ORIGINS  comma-separated origins, or * (default)
 *
 * Deploy:  npm run worker:deploy
 */

import { analyze, resolveModel, SUPPORTED_PROVIDERS } from '../shared/analyze-core';

export interface Env {
  AI_PROVIDER?: string;
  AI_API_KEY?: string;
  AI_MODEL?: string;
  ALLOWED_ORIGINS?: string;
}

function corsHeaders(request: Request, env: Env): Record<string, string> {
  const allowed = (env.ALLOWED_ORIGINS ?? '*').split(',').map(s => s.trim()).filter(Boolean);
  const origin = request.headers.get('Origin') ?? '';
  // Echo the caller's origin when it is on the list, so the header stays valid
  // for credentialed requests and for multi-origin setups.
  const allowOrigin = allowed.includes('*')
    ? '*'
    : allowed.includes(origin) ? origin : allowed[0] ?? '*';
  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'content-type',
    'Access-Control-Max-Age': '600',
    'Vary': 'Origin',
  };
}

function json(data: unknown, status: number, headers: Record<string, string>): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const cors = corsHeaders(request, env);
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors });
    }

    if (url.pathname === '/api/health') {
      const provider = (env.AI_PROVIDER ?? 'groq').toLowerCase();
      let model = '';
      let providerOk = true;
      try {
        model = resolveModel({ provider, apiKey: '', model: env.AI_MODEL });
      } catch {
        providerOk = false;
      }
      return json({
        status: providerOk && env.AI_API_KEY ? 'ok' : 'misconfigured',
        provider,
        model,
        // Reports whether the key is present, never what it is.
        api_key_configured: Boolean(env.AI_API_KEY),
        supported_providers: SUPPORTED_PROVIDERS,
      }, 200, cors);
    }

    if (url.pathname === '/api/analyze') {
      if (request.method !== 'POST') {
        return json({ error: 'Method Not Allowed' }, 405, cors);
      }
      if (!env.AI_API_KEY) {
        return json({
          error: 'AI_API_KEY is not configured on this Worker. Set it with: wrangler secret put AI_API_KEY',
        }, 503, cors);
      }
      let body: unknown;
      try {
        body = await request.json();
      } catch {
        return json({ error: 'Request body is not valid JSON' }, 400, cors);
      }
      try {
        const result = await analyze(body, {
          provider: (env.AI_PROVIDER ?? 'groq').toLowerCase(),
          apiKey: env.AI_API_KEY,
          model: env.AI_MODEL,
        });
        return json(result, 200, cors);
      } catch (e: any) {
        return json({ error: e?.message ?? 'Analysis failed' }, 502, cors);
      }
    }

    return json({ error: 'Not Found' }, 404, cors);
  },
};
