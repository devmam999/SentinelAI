"""Slack Incoming Webhook integration.

Posts a Block Kit formatted incident message. The top-level ``text`` field is
required by Slack as the notification/preview fallback; ``blocks`` is what
renders in the channel.
"""

from __future__ import annotations

import httpx

from ..models.schemas import IncidentAnalysis


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


async def post_incident(webhook_url: str, analysis: IncidentAnalysis) -> None:
    """POST the incident message to a Slack Incoming Webhook."""

    payload = build_incident_payload(analysis)
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.post(webhook_url, json=payload)
        # Slack returns 200 with body "ok" on success.
        resp.raise_for_status()
