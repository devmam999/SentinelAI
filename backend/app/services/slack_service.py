"""Slack Incoming Webhook integration.

Posts a Block Kit formatted incident message. The top-level ``text`` field is
required by Slack as the notification/preview fallback; ``blocks`` is what
renders in the channel.
"""

from __future__ import annotations

import re

import httpx

from ..models.schemas import IncidentAnalysis

_WEBHOOK_URL_RE = re.compile(
    r"^https://hooks\.slack\.com/services/[A-Za-z0-9]+/[A-Za-z0-9]+/[A-Za-z0-9_-]+/?$"
)

_SLACK_WEBHOOK_ERRORS: dict[str, str] = {
    "no_service": (
        "The Slack webhook URL is invalid, disabled, or was revoked. "
        "Create a new Incoming Webhook in Slack and update this project's Slack URL."
    ),
    "no_team": (
        "The Slack workspace for this webhook is missing or invalid. "
        "Check the webhook URL in project settings."
    ),
    "channel_not_found": (
        "The Slack channel for this webhook no longer exists. "
        "Create a new Incoming Webhook targeting an active channel."
    ),
    "invalid_token": "The Slack webhook token is invalid. Regenerate the webhook URL in Slack.",
}


def format_webhook_error(response: httpx.Response) -> str:
    """Turn Slack's terse webhook error bodies into actionable messages."""

    body = (response.text or "").strip()
    if body in _SLACK_WEBHOOK_ERRORS:
        return _SLACK_WEBHOOK_ERRORS[body]
    if body:
        return f"Slack webhook failed ({response.status_code}): {body}"
    return f"Slack webhook failed ({response.status_code} {response.reason_phrase})"


def build_incident_payload(analysis: IncidentAnalysis) -> dict:
    """Render an :class:`IncidentAnalysis` into a Slack Block Kit payload.

    Layout matches the product spec:

        🚨 Production Incident
        Likely Cause / Confidence
        Most Relevant Commit
        Affected Services
        Suggested Runbook
        Next Steps
    """

    def bullets(items: list[str]) -> str:
        return "\n".join(f"• {item}" for item in items) if items else "—"

    blocks: list[dict] = [
        {
            "type": "header",
            "text": {"type": "plain_text", "text": "🚨 Production Incident", "emoji": True},
        },
        {
            "type": "section",
            "fields": [
                {"type": "mrkdwn", "text": f"*Likely Cause:*\n{analysis.likely_cause}"},
                {"type": "mrkdwn", "text": f"*Confidence:*\n{analysis.confidence}%"},
            ],
        },
        {
            "type": "section",
            "text": {
                "type": "mrkdwn",
                "text": f"*Most Relevant Commit:*\n{analysis.most_relevant_commit}",
            },
        },
        {
            "type": "section",
            "text": {
                "type": "mrkdwn",
                "text": f"*Affected Services:*\n{bullets(analysis.affected_services)}",
            },
        },
        {
            "type": "section",
            "text": {
                "type": "mrkdwn",
                "text": f"*Suggested Runbook:*\n{analysis.suggested_runbook}",
            },
        },
        {
            "type": "section",
            "text": {
                "type": "mrkdwn",
                "text": f"*Next Steps:*\n{bullets(analysis.next_steps)}",
            },
        },
    ]

    return {"text": "🚨 Production Incident", "blocks": blocks}


def normalize_webhook_url(url: str) -> str:
    """Validate Slack Incoming Webhook URL shape before calling Slack."""

    normalized = (url or "").strip().rstrip("/")
    if not _WEBHOOK_URL_RE.match(normalized):
        raise ValueError(
            "Invalid Slack webhook URL. Use an Incoming Webhook URL like "
            "https://hooks.slack.com/services/T.../B.../..."
        )
    return normalized


async def verify_webhook(webhook_url: str) -> None:
    """Send a lightweight test message to confirm the webhook is active."""

    url = normalize_webhook_url(webhook_url)
    payload = {
        "text": "SentinelAI webhook validation — you can ignore this message.",
    }
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.post(url, json=payload)
        resp.raise_for_status()
        if (resp.text or "").strip() != "ok":
            raise httpx.HTTPStatusError(
                "Unexpected Slack webhook response.",
                request=resp.request,
                response=resp,
            )


async def post_incident(webhook_url: str, analysis: IncidentAnalysis) -> None:
    """POST the incident message to a Slack Incoming Webhook."""

    payload = build_incident_payload(analysis)
    url = normalize_webhook_url(webhook_url)
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.post(url, json=payload)
        # Slack returns 200 with body "ok" on success.
        resp.raise_for_status()
