"""Liveness / configuration probe."""

from fastapi import APIRouter

from ...config import get_settings

router = APIRouter(tags=["health"])


@router.get("/health")
def health() -> dict:
    settings = get_settings()
    return {
        "status": "ok",
        "integrations": {
            "gemini": bool(settings.gemini_api_key),
            "github": bool(settings.github_token),
            "slack": bool(settings.slack_webhook_url),
        },
    }
