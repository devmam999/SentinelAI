"""Handle Sentry webhook events and create autonomous incidents."""

from __future__ import annotations

import logging
from typing import Any

from ..models.schemas import IncidentRequest
from . import incident_service, supabase_admin

logger = logging.getLogger(__name__)


def _build_alert_description(issue: dict[str, Any]) -> str:
    title = issue.get("title") or "Sentry issue"
    short_id = issue.get("shortId") or issue.get("short_id")
    culprit = issue.get("culprit")
    level = issue.get("level")
    metadata = issue.get("metadata") if isinstance(issue.get("metadata"), dict) else {}
    err_type = metadata.get("type") or metadata.get("value")

    lines = [f"Sentry issue {short_id}: {title}" if short_id else title]
    if culprit:
        lines.append(f"Culprit: {culprit}")
    if level:
        lines.append(f"Level: {level}")
    if err_type:
        lines.append(f"Error: {err_type}")
    return "\n".join(lines)


async def process_issue_webhook(payload: dict[str, Any]) -> dict[str, Any]:
    """Create an analyzed incident when Sentry reports a new issue."""

    action = payload.get("action")
    if action != "created":
        return {"status": "ignored", "reason": f"action={action}"}

    issue = (payload.get("data") or {}).get("issue") or {}
    issue_id = str(issue.get("id") or "").strip()
    project_slug = ((issue.get("project") or {}).get("slug") or "").strip()

    if not issue_id or not project_slug:
        return {"status": "ignored", "reason": "missing issue or project slug"}

    connections = await supabase_admin.list_sentry_connections_by_project_slug(project_slug)
    if not connections:
        logger.info("No SentinelAI project linked to Sentry project slug=%s", project_slug)
        return {"status": "ignored", "reason": "no linked project"}

    processed: list[dict[str, Any]] = []

    for connection in connections:
        project_id = connection["project_id"]
        org_slug = connection.get("org_slug") or ""

        project = await supabase_admin.get_project(project_id)
        if not project:
            continue
        if project.get("trigger_mode") != "autonomous":
            processed.append({"project_id": project_id, "status": "skipped", "reason": "manual trigger mode"})
            continue

        if await supabase_admin.sentry_incident_exists(project_id, issue_id):
            processed.append({"project_id": project_id, "status": "duplicate", "issue_id": issue_id})
            continue

        github_repo = (project.get("github_repo") or "").strip()
        if not github_repo:
            processed.append({"project_id": project_id, "status": "error", "reason": "missing github repo"})
            continue

        alert_description = _build_alert_description(issue)
        request = IncidentRequest(
            github_repo=github_repo,
            description=alert_description,
            slack_webhook_url=project.get("slack_webhook"),
            post_to_slack=bool(project.get("slack_webhook")),
        )

        try:
            result = await incident_service.analyze_and_notify(request)
        except Exception as exc:
            logger.exception("Analysis failed for Sentry issue %s project %s", issue_id, project_id)
            processed.append({"project_id": project_id, "status": "error", "reason": str(exc)})
            continue

        analysis = result.analysis
        title = analysis.likely_cause or analysis.most_relevant_commit or issue.get("title") or "Production incident"
        runbook_matches = [match.model_dump() for match in result.runbook_matches]

        try:
            incident = await supabase_admin.create_sentry_incident(
                {
                    "project_id": project_id,
                    "title": title,
                    "alert_description": alert_description,
                    "analysis": analysis.model_dump(),
                    "runbook_matches": runbook_matches or None,
                    "slack_posted": result.slack_posted,
                    "sentry_issue_id": issue_id,
                    "source": "sentry",
                    "status": "active",
                }
            )
        except Exception as exc:
            logger.exception("Could not save incident for Sentry issue %s", issue_id)
            processed.append({"project_id": project_id, "status": "error", "reason": str(exc)})
            continue

        processed.append(
            {
                "project_id": project_id,
                "org_slug": org_slug,
                "status": "created",
                "incident_id": incident.get("id"),
                "issue_id": issue_id,
                "slack_posted": result.slack_posted,
                "slack_error": result.slack_error,
            }
        )

    if not any(item.get("status") == "created" for item in processed):
        return {"status": "ignored", "results": processed}

    return {"status": "ok", "results": processed}
