"""Incident analysis + Slack notification endpoints."""

import httpx
from fastapi import APIRouter, HTTPException, Query

from ...models.schemas import IncidentAnalysis, IncidentRequest, IncidentResponse
from ...services import incident_service, slack_service

router = APIRouter(prefix="/api/incidents", tags=["incidents"])


@router.post("/analyze", response_model=IncidentResponse)
async def analyze(request: IncidentRequest) -> IncidentResponse:
    """Full pipeline: GitHub + runbooks + Gemini, then post to Slack."""

    try:
        return await incident_service.analyze_and_notify(request)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except RuntimeError as exc:  # missing API key, etc.
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except httpx.HTTPStatusError as exc:
        raise HTTPException(
            status_code=exc.response.status_code,
            detail=f"Upstream error: {exc.response.text}",
        ) from exc


@router.post("/notify")
async def notify(
    analysis: IncidentAnalysis,
    webhook: str = Query(..., description="Slack Incoming Webhook URL."),
) -> dict:
    """Post an already-built analysis to Slack (useful for previews/testing)."""

    try:
        await slack_service.post_incident(webhook, analysis)
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail=f"Slack error: {exc}") from exc
    return {"status": "sent"}
