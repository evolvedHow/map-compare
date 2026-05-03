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

export async function generateNarrative(payload: AnalyzePayload): Promise<NarrativeReport> {
  const resp = await fetch('/api/analyze', {
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
