import { defineConfig, loadEnv, type Plugin } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import tailwindcss from '@tailwindcss/vite';
import { analyze } from './shared/analyze-core';

/**
 * Serves /api/analyze during `npm run dev` so local work needs no deployed
 * backend. The provider call itself comes from shared/analyze-core.ts — the
 * same module the Cloudflare Worker uses — so dev and production cannot drift
 * apart in which providers they support or which models they call.
 */
function aiAnalyzePlugin(): Plugin {
  return {
    name: 'ai-analyze',
    configureServer(server) {
      server.middlewares.use('/api/analyze', async (req: any, res: any) => {
        const send = (status: number, payload: unknown) => {
          res.statusCode = status;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify(payload));
        };

        if (req.method !== 'POST') return send(405, { error: 'Method Not Allowed' });

        const apiKey = process.env.AI_API_KEY ?? '';
        if (!apiKey) {
          return send(503, {
            error: 'AI_API_KEY not set. Add AI_PROVIDER and AI_API_KEY to .env',
          });
        }

        try {
          const chunks: Buffer[] = [];
          for await (const chunk of req) chunks.push(chunk as Buffer);
          const body = JSON.parse(Buffer.concat(chunks).toString());

          send(200, await analyze(body, {
            provider: (process.env.AI_PROVIDER ?? 'groq').toLowerCase(),
            apiKey,
            model: process.env.AI_MODEL,
          }));
        } catch (e: any) {
          send(500, { error: e?.message ?? 'Internal server error' });
        }
      });
    }
  };
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
