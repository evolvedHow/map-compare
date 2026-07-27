"""
map-compare AI Analysis Backend
================================
FastAPI service that receives two district plan comparison payloads and
returns a structured narrative analysis using an LLM (Claude / Groq / Gemini).

This extracts the AI analysis logic that previously lived in vite.config.ts
(Vite dev-server only) so it works in production.

Endpoints:
  POST /api/analyze   — generate narrative comparison report
  GET  /api/health    — liveness check

Environment variables:
  AI_PROVIDER      groq | anthropic | openai | openrouter | google  (default: groq)
  AI_API_KEY       API key for the chosen provider
  AI_MODEL         Override model (optional — sensible defaults per provider)
  ALLOWED_ORIGINS  Comma-separated CORS origins (default: *)
"""
from __future__ import annotations

import json
import logging
import os

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

load_dotenv()

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# ── FastAPI app ────────────────────────────────────────────────────────────────

app = FastAPI(
    title="map-compare AI Analysis",
    description="LLM-powered redistricting plan comparison narrative generator",
    version="1.0.0",
)

_raw_origins = os.environ.get("ALLOWED_ORIGINS", "*")
_origins = [o.strip() for o in _raw_origins.split(",")] if _raw_origins != "*" else ["*"]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_origins,
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)


# ── Request / response models ──────────────────────────────────────────────────

class DistrictChange(BaseModel):
    id: str
    matchedBId: str | None = None
    renumbered: bool = False
    leanA: str = ""
    leanB: str = ""
    bvapA: str = ""
    bvapB: str = ""


class PlanInfo(BaseModel):
    name: str
    year: int


class AnalyzeRequest(BaseModel):
    planA: PlanInfo
    planB: PlanInfo
    metricsA: dict[str, float | int | None]
    metricsB: dict[str, float | int | None]
    topChanges: list[DistrictChange] = []
    totalDistricts: int = 0
    significantlyChanged: int = 0


class NarrativeReport(BaseModel):
    execSummary: str
    demographicImpact: str
    partisanImpact: str
    compactnessNotes: str
    vraConsiderations: str
    keyFindings: list[str]


# ── Provider config ────────────────────────────────────────────────────────────

_DEFAULTS: dict[str, str] = {
    "anthropic":  "claude-sonnet-4-20250514",
    "openai":     "gpt-4o-mini",
    "groq":       "llama-3.3-70b-versatile",
    "openrouter": "google/gemini-flash-1.5",
    # Rolling alias, not a pinned version — gemini-2.5-flash-lite was retired
    # for new API keys and 404s with a message that reads like a config error.
    "google":     "gemini/gemini-flash-lite-latest",
}

# LiteLLM provider prefix map
_LITELLM_PREFIX: dict[str, str] = {
    "anthropic":  "anthropic",
    "openai":     "openai",
    "groq":       "groq",
    "openrouter": "openrouter",
    "google":     "gemini",
}


def _get_litellm_model() -> str:
    provider = os.environ.get("AI_PROVIDER", "groq").lower()
    model_override = os.environ.get("AI_MODEL", "")
    base_model = model_override or _DEFAULTS.get(provider, "llama-3.3-70b-versatile")
    prefix = _LITELLM_PREFIX.get(provider, provider)
    # If the model name already has a prefix (e.g. "gemini/..."), don't double-prefix
    if "/" in base_model:
        return base_model
    return f"{prefix}/{base_model}"


def _set_api_key_env():
    """Map AI_API_KEY to the correct LiteLLM env var for the chosen provider."""
    provider = os.environ.get("AI_PROVIDER", "groq").lower()
    api_key = os.environ.get("AI_API_KEY", "")
    if not api_key:
        return
    mapping = {
        "anthropic":  "ANTHROPIC_API_KEY",
        "openai":     "OPENAI_API_KEY",
        "groq":       "GROQ_API_KEY",
        "openrouter": "OPENROUTER_API_KEY",
        "google":     "GEMINI_API_KEY",
    }
    env_var = mapping.get(provider)
    if env_var and not os.environ.get(env_var):
        os.environ[env_var] = api_key


# Set API key env var on startup
_set_api_key_env()


# ── Prompt builder ─────────────────────────────────────────────────────────────

def _build_prompt(req: AnalyzeRequest) -> str:
    def fmt(v, decimals=1):
        if v is None:
            return "n/a"
        return f"{float(v):.{decimals}f}"

    changed_list = "\n".join(
        f"  • District {d.id}"
        + (f" (spatially matched to Plan B D{d.matchedBId})" if d.renumbered else "")
        + f": lean {d.leanA} → {d.leanB}, Black VAP {d.bvapA}% → {d.bvapB}%"
        for d in req.topChanges[:12]
    ) or "  None exceeded the 5pp threshold"

    ma, mb = req.metricsA, req.metricsB
    return f"""You are a nonpartisan redistricting expert. Analyze these two Georgia legislative district plans.

PLAN A: {req.planA.name} ({req.planA.year})
PLAN B: {req.planB.name} ({req.planB.year})

METRICS (Plan A → Plan B):
Population deviation max: {fmt(ma.get('popDevMax'))}% → {fmt(mb.get('popDevMax'))}%  (lower = more equal)
Polsby-Popper compactness avg: {fmt(ma.get('polsbyPopper'), 3)} → {fmt(mb.get('polsbyPopper'), 3)}  (higher = more compact, 0–1)
Convex hull ratio avg: {fmt(ma.get('convexHullRatio'), 3)} → {fmt(mb.get('convexHullRatio'), 3)}
County splits: {ma.get('countySplits', 'n/a')} → {mb.get('countySplits', 'n/a')}  (lower = fewer boundary crossings)
Majority-minority districts: {ma.get('mmDistricts', 'n/a')} → {mb.get('mmDistricts', 'n/a')}
Black-majority districts: {ma.get('bvapMaj', 'n/a')} → {mb.get('bvapMaj', 'n/a')}
Dem-leaning seats: {ma.get('demSeats', 'n/a')} → {mb.get('demSeats', 'n/a')} of {req.totalDistricts}
Efficiency gap: {fmt(ma.get('efficiencyGap'))}% → {fmt(mb.get('efficiencyGap'))}%  (positive = Dem advantage; ±8% is the court threshold)
Mean-median difference: {fmt(ma.get('meanMedian'))}% → {fmt(mb.get('meanMedian'))}%
Partisan bias: {fmt(ma.get('partisanBias'))}pp → {fmt(mb.get('partisanBias'))}pp

CHANGED DISTRICTS ({req.significantlyChanged} of {req.totalDistricts} changed >5pp):
{changed_list}

Respond ONLY with valid JSON — no markdown, no preamble:
{{
  "execSummary": "2-3 sentence overview of the most important differences",
  "demographicImpact": "1-2 sentences on changes to racial and ethnic representation, including majority-minority district gains or losses",
  "partisanImpact": "1-2 sentences on partisan fairness changes — which party benefits from Plan B and what the efficiency gap and bias scores indicate",
  "compactnessNotes": "1 sentence on geographic compactness and county preservation changes",
  "vraConsiderations": "1-2 sentences on Voting Rights Act Section 2 considerations — whether minority representation was preserved, diluted, or enhanced",
  "keyFindings": ["specific finding with numbers", "specific finding", "specific finding", "specific finding", "specific finding"]
}}"""


def _parse_json_safe(text: str) -> dict:
    """Try to parse JSON; if that fails, extract the first JSON object."""
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass
    import re
    m = re.search(r"\{[\s\S]*\}", text)
    if m:
        return json.loads(m.group(0))
    raise ValueError("Could not parse JSON from LLM response")


# ── Endpoints ─────────────────────────────────────────────────────────────────

@app.get("/api/health")
def health():
    provider = os.environ.get("AI_PROVIDER", "groq")
    api_key_set = bool(os.environ.get("AI_API_KEY"))
    return {
        "status": "ok",
        "provider": provider,
        "model": _get_litellm_model(),
        "api_key_configured": api_key_set,
    }


@app.post("/api/analyze", response_model=NarrativeReport)
async def analyze(req: AnalyzeRequest):
    """
    Generate a narrative redistricting comparison report.

    Accepts a plan comparison payload and returns a structured JSON narrative
    with executive summary, partisan/demographic impact, and key findings.
    """
    api_key = os.environ.get("AI_API_KEY", "")
    if not api_key:
        raise HTTPException(
            status_code=503,
            detail="AI_API_KEY not configured. Set AI_PROVIDER and AI_API_KEY environment variables.",
        )

    try:
        import litellm  # noqa: PLC0415

        model = _get_litellm_model()
        prompt = _build_prompt(req)

        logger.info("Calling %s for analysis narrative", model)
        response = await litellm.acompletion(
            model=model,
            messages=[{"role": "user", "content": prompt}],
            temperature=0.3,
            max_tokens=1200,
        )
        content = response.choices[0].message.content or "{}"
        result = _parse_json_safe(content)
        return NarrativeReport(**result)

    except Exception as exc:  # noqa: BLE001
        logger.exception("LLM call failed: %s", exc)
        raise HTTPException(status_code=500, detail=str(exc)) from exc
