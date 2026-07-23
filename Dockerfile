# map-compare AI Analysis Backend
#
# Build context: map-compare/ directory
#
# Local build:
#   cd ~/codebox/fgdp/map-compare
#   docker build -t map-compare-backend .
#
# Railway setup:
#   Root directory: map-compare
#   Dockerfile path: Dockerfile
#   Port: 8005
#
# Required environment variables:
#   AI_PROVIDER   groq | anthropic | openai | google   (default: groq)
#   AI_API_KEY    API key for the chosen provider
#
# Optional:
#   AI_MODEL        override model name
#   ALLOWED_ORIGINS comma-separated CORS origins (default: *)

FROM python:3.12-slim

RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

RUN pip install --no-cache-dir uv

COPY backend/pyproject.toml ./
RUN uv pip install --system --no-cache \
    "fastapi>=0.110.0" \
    "uvicorn[standard]>=0.27.0" \
    "litellm>=1.30.0" \
    "python-dotenv>=1.0.0" \
    "pydantic>=2.0.0"

COPY backend/ ./backend/

ENV PYTHONUNBUFFERED=1
EXPOSE 8005

CMD ["sh", "-c", "uvicorn backend.main:app --host 0.0.0.0 --port ${PORT:-8005}"]
