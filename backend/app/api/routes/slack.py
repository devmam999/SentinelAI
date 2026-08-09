"""Slack webhook validation endpoints."""

import httpx
from fastapi import APIRouter, HTTPException

from ...models.schemas import SlackValidateRequest, SlackValidateResponse
from ...services import slack_service
from ...services.slack_service import format_webhook_error

router = APIRouter(prefix="/api/slack", tags=["slack"])


@router.post("/validate", response_model=SlackValidateResponse)
async def validate(body: SlackValidateRequest) -> SlackValidateResponse:
    """Confirm a Slack Incoming Webhook URL is active before saving a project."""

    try:
        await slack_service.verify_webhook(body.webhook_url)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except httpx.HTTPStatusError as exc:
        raise HTTPException(status_code=400, detail=format_webhook_error(exc.response)) from exc
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail=f"Could not reach Slack: {exc}") from exc
    return SlackValidateResponse()
