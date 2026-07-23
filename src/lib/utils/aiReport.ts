export interface NarrativeReport {
  execSummary: string;
  demographicImpact: string;
  partisanImpact: string;
  compactnessNotes: string;
  vraConsiderations: string;
  keyFindings: string[];
}

export interface AnalyzePayload {
  planA: { name: string; year: number };
  planB: { name: string; year: number };
  metricsA: Record<string, number>;
  metricsB: Record<string, number>;
  topChanges: Array<{
    id: string;
    matchedBId: string;
    renumbered: boolean;
    leanA: string;
    leanB: string;
    bvapA: string;
    bvapB: string;
  }>;
  totalDistricts: number;
  significantlyChanged: number;
}

/**
 * Base URL for the AI analysis API.
 *
 * In development:  Vite dev-server middleware handles /api/analyze directly,
 *                  so API_BASE defaults to '' (same origin).
 *
 * In production:   Set VITE_ANALYZE_API_URL to the Railway backend URL at
 *                  build time, e.g. https://map-compare-api.up.railway.app
 *                  The frontend is static (GitHub Pages) so the backend must
 *                  allow CORS from the Pages origin.
 */
const API_BASE: string = import.meta.env.VITE_ANALYZE_API_URL ?? '';

export async function generateNarrative(payload: AnalyzePayload): Promise<NarrativeReport> {
  const resp = await fetch(`${API_BASE}/api/analyze`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    let msg: string;
    try { msg = JSON.parse(text).error; } catch { msg = text || `API error ${resp.status}`; }
    throw new Error(msg);
  }
  const data = await resp.json();
  if (data.error) throw new Error(data.error);
  return data as NarrativeReport;
}
