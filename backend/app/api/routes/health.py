"""Liveness / configuration probe."""

from fastapi import APIRouter

from ...config import get_settings

router = APIRouter(tags=["health"])

_PLACEHOLDERS = {
    "github_token": {"your-github-pat"},
    "slack_webhook_url": {"https://hooks.slack.com/services/XXX/YYY/ZZZ"},
    "gemini_api_key": {"your-gemini-api-key"},
}


def _configured(value: str | None, key: str) -> bool:
    if not value:
        return False
    return value not in _PLACEHOLDERS.get(key, set())


@router.get("/health")
def health() -> dict:
    settings = get_settings()
    return {
        "status": "ok",
        "integrations": {
            "gemini": _configured(settings.gemini_api_key, "gemini_api_key"),
            "github": _configured(settings.github_token, "github_token"),
            "slack": _configured(settings.slack_webhook_url, "slack_webhook_url"),
        },
    }
