"""FastAPI application entrypoint.

Run locally:
    uvicorn app.main:app --reload --port 8000
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from . import __version__
from .api.routes import github, health, incidents, runbooks
from .config import get_settings


def create_app() -> FastAPI:
    settings = get_settings()

    app = FastAPI(
        title="SentinelAI Backend",
        version=__version__,
        description=(
            "Autonomous incident response: GitHub commit analysis, ChromaDB "
            "runbook search, Gemini reasoning, and Slack alerting."
        ),
    )

    cors_origins = list(settings.cors_origins)
    if settings.frontend_url:
        origin = settings.frontend_url.rstrip("/")
        if origin not in cors_origins:
            cors_origins.append(origin)

    app.add_middleware(
        CORSMiddleware,
        allow_origins=cors_origins,
        # Allow any Vercel deployment (production + preview URLs).
        allow_origin_regex=r"https://.*\.vercel\.app",
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.include_router(health.router)
    app.include_router(github.router)
    app.include_router(runbooks.router)
    app.include_router(incidents.router)

    return app


app = create_app()
