"""Format structured postmortem data into Slack Block Kit payloads."""

from __future__ import annotations

from datetime import datetime, timezone

from ..models.schemas import PostmortemRequest


def _parse_ts(value: str) -> datetime:
    normalized = value.replace("Z", "+00:00")
    dt = datetime.fromisoformat(normalized)
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt


def format_timestamp(value: str) -> str:
    """Render ISO timestamps like ``Aug 11, 2:14:03 PM``."""

    dt = _parse_ts(value).astimezone()
    hour = dt.strftime("%I").lstrip("0") or "12"
    return f"{dt.strftime('%b')} {dt.day}, {hour}:{dt.strftime('%M:%S %p')}"


def format_timestamp_short(value: str) -> str:
    """Render ISO timestamps like ``Aug 11, 2:28 PM``."""

    dt = _parse_ts(value).astimezone()
    hour = dt.strftime("%I").lstrip("0") or "12"
    return f"{dt.strftime('%b')} {dt.day}, {hour}:{dt.strftime('%M %p')}"


def format_duration(started_at: str, resolved_at: str) -> str:
    start = _parse_ts(started_at)
    end = _parse_ts(resolved_at)
    total_seconds = max(0, int((end - start).total_seconds()))
    minutes, seconds = divmod(total_seconds, 60)
    hours, minutes = divmod(minutes, 60)

    parts: list[str] = []
    if hours:
        parts.append(f"{hours} hour{'s' if hours != 1 else ''}")
    if minutes:
        parts.append(f"{minutes} minute{'s' if minutes != 1 else ''}")
    parts.append(f"{seconds} second{'s' if seconds != 1 else ''}")
    return ", ".join(parts)


def _bullets(items: list[str]) -> str:
    return "\n".join(f"• {item}" for item in items) if items else "—"


def _section(title: str, body: str) -> dict:
    return {
        "type": "section",
        "text": {"type": "mrkdwn", "text": f"*{title}*\n{body}"},
    }


def build_postmortem_text(request: PostmortemRequest) -> str:
    """Plain-text fallback for Slack notifications."""

    incident_id = f"INC-{request.incident_number}"
    duration = format_duration(request.started_at, request.resolved_at)
    assigned = request.assigned_to or "Unassigned"

    lines = [
        f"Postmortem — {incident_id}: {request.title}",
        "",
        "1. Incident Overview",
        f"Incident ID: {incident_id}",
        f"Title: {request.title}",
        f"Started: {format_timestamp(request.started_at)}",
        f"Resolved: {format_timestamp(request.resolved_at)}",
        f"Duration: {duration}",
        f"Reported by: {request.reported_by}",
        f"Assigned to: {assigned}",
    ]
    return "\n".join(lines)


def build_postmortem_payload(request: PostmortemRequest) -> dict:
    """Render a :class:`PostmortemRequest` into Slack Block Kit blocks."""

    incident_id = f"INC-{request.incident_number}"
    duration = format_duration(request.started_at, request.resolved_at)
    assigned = request.assigned_to or "Unassigned"

    overview = "\n".join(
        [
            f"*Incident ID:* {incident_id}",
            f"*Title:* {request.title}",
            f"*Started:* {format_timestamp(request.started_at)}",
            f"*Resolved:* {format_timestamp(request.resolved_at)}",
            f"*Duration:* {duration}",
            f"*Reported by:* {request.reported_by}",
            f"*Assigned to:* {assigned}",
        ]
    )

    root_cause_body = request.root_cause
    if request.root_cause_evidence:
        root_cause_body += "\n\n*Evidence:*\n" + _bullets(request.root_cause_evidence)

    investigation_parts: list[str] = []
    if request.runbook_sections:
        investigation_parts.append("*Runbook sections consulted:*\n" + _bullets(request.runbook_sections))
    if request.github_evidence:
        investigation_parts.append("*Relevant GitHub commit:*\n" + _bullets(request.github_evidence))
    investigation = "\n\n".join(investigation_parts) if investigation_parts else "—"

    resolution_body = "\n".join(
        [
            f"*Engineer:* {request.resolution.engineer}",
            f"*Submitted:* {format_timestamp_short(request.resolution.submitted_at)}",
            "",
            request.resolution.description,
        ]
    )

    verification_lines: list[str] = []
    for rejection in request.verification.rejections:
        verification_lines.extend(
            [
                f"*Rejected by:* {rejection.rejected_by}",
                f"*Time:* {format_timestamp_short(rejection.rejected_at)}",
                f"*Reason of Rejection:* \"{rejection.reason}\"",
                "",
            ]
        )
    if request.verification.verified_by and request.verification.verified_at:
        verification_lines.extend(
            [
                f"*Verified by:* {request.verification.verified_by}",
                f"*Verified:* {format_timestamp_short(request.verification.verified_at)}",
            ]
        )
    verification = "\n".join(line for line in verification_lines if line).strip() or "—"

    closure = "\n".join(
        [
            "*Status:* CLOSED",
            f"*Closed by:* {request.closure.closed_by}",
            f"*Closed at:* {format_timestamp(request.closure.closed_at)}",
            "*Final Resolution:* Approved",
        ]
    )

    timeline = "\n".join(
        f"{format_timestamp_short(event.timestamp)}   {event.label}" for event in request.timeline
    )

    blocks: list[dict] = [
        {
            "type": "header",
            "text": {
                "type": "plain_text",
                "text": f"📋 Postmortem — {incident_id}",
                "emoji": True,
            },
        },
        _section("1. Incident Overview", overview),
        _section("2. Impact", request.impact),
        _section("3. Root Cause", root_cause_body),
        _section("4. Detection & Investigation", investigation),
        _section("5. Recommended Remediation", _bullets(request.recommended_remediation)),
        _section("6. Resolution", resolution_body),
        _section("7. Verification", verification),
        _section("8. Closure", closure),
        _section("9. Timeline", timeline or "—"),
    ]

    return {
        "text": build_postmortem_text(request),
        "blocks": blocks,
    }
