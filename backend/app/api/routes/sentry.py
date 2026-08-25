"""Sentry OAuth endpoints for autonomous incident detection."""

from __future__ import annotations

import json

from fastapi import APIRouter, HTTPException, Query, Request
from fastapi.responses import RedirectResponse

from ...config import get_settings
from ...models.schemas import (
    SentryAttachRequest,
    SentryAuthorizeResponse,
    SentryConnectRequest,
    SentryConnectResponse,
    SentryOrg,
    SentryProject,
    SentryProjectListResponse,
)
from ...services import sentry_ingestion_service, sentry_service, supabase_admin
from ...services.sentry_service import SentryNotConfiguredError

router = APIRouter(prefix="/api/sentry", tags=["sentry"])


def _frontend_return_url(
    project_id: str | None,
    *,
    sentry_oauth: str | None = None,
    error: str | None = None,
) -> str:
    settings = get_settings()
    base = (settings.frontend_url or "http://localhost:8443").rstrip("/")
    path = f"/edit-project/{project_id}" if project_id else "/add-project"
    params: list[str] = []
    if sentry_oauth:
        params.append(f"sentry_oauth={sentry_oauth}")
    if error:
        params.append(f"sentry_error={error}")
    if not params:
        return f"{base}{path}"
    return f"{base}{path}?{'&'.join(params)}"


@router.get("/authorize", response_model=SentryAuthorizeResponse)
async def authorize(
    user_id: str = Query(..., description="Authenticated Supabase user id."),
    project_id: str | None = Query(default=None, description="SentinelAI project id (optional for new projects)."),
) -> SentryAuthorizeResponse:
    """Return the Sentry OAuth URL for the user to authorize incident access."""

    try:
        if project_id:
            allowed = await supabase_admin.user_can_manage_project(user_id, project_id)
            if not allowed:
                raise HTTPException(
                    status_code=403,
                    detail="You do not have permission to connect Sentry for this project.",
                )

        url, _state = sentry_service.build_authorization_url(user_id, project_id)
        return SentryAuthorizeResponse(authorization_url=url)
    except SentryNotConfiguredError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


@router.get("/callback")
async def callback(
    code: str | None = Query(default=None),
    state: str | None = Query(default=None),
    error: str | None = Query(default=None),
) -> RedirectResponse:
    """OAuth redirect target — exchanges the code and returns to the project editor."""

    project_id: str | None = None
    if state:
        try:
            project_id = sentry_service.parse_oauth_state(state)["project_id"]
        except ValueError:
            pass

    if error or not code or not state:
        if state:
            return RedirectResponse(_frontend_return_url(project_id, error=error or "authorization_denied"))
        raise HTTPException(status_code=400, detail=error or "Sentry authorization failed.")

    try:
        parsed = sentry_service.parse_oauth_state(state)
        project_id = parsed["project_id"]
        user_id = parsed["user_id"]

        if project_id:
            allowed = await supabase_admin.user_can_manage_project(user_id, project_id)
            if not allowed:
                return RedirectResponse(_frontend_return_url(project_id, error="forbidden"))

        access_token = await sentry_service.exchange_code_for_token(code)
        await sentry_service.save_pending_authorization(state, user_id, access_token, project_id)
        return RedirectResponse(_frontend_return_url(project_id, sentry_oauth=state))
    except SentryNotConfiguredError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except Exception as exc:
        try:
            parsed = sentry_service.parse_oauth_state(state)
            return RedirectResponse(_frontend_return_url(parsed["project_id"], error="callback_failed"))
        except ValueError:
            raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get("/organizations", response_model=list[SentryOrg])
async def organizations(state: str = Query(..., description="Pending OAuth state from callback.")) -> list[SentryOrg]:
    """List Sentry organizations available for the pending OAuth session."""

    try:
        pending = await sentry_service.load_pending_authorization(state)
        orgs = await sentry_service.list_organizations(pending["access_token"])
        return [SentryOrg(slug=org["slug"], name=org["name"]) for org in orgs]
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get("/projects", response_model=SentryProjectListResponse)
async def projects(
    state: str = Query(..., description="Pending OAuth state from callback."),
    org_slug: str = Query(..., description="Selected Sentry organization slug."),
) -> SentryProjectListResponse:
    """List Sentry projects for the selected organization."""

    try:
        pending = await sentry_service.load_pending_authorization(state)
        items = await sentry_service.list_projects(pending["access_token"], org_slug)
        return SentryProjectListResponse(
            projects=[SentryProject(slug=item["slug"], name=item["name"]) for item in items]
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/connect", response_model=SentryConnectResponse)
async def connect(request: SentryConnectRequest) -> SentryConnectResponse:
    """Persist the selected Sentry organization and project for autonomous mode."""

    try:
        result = await sentry_service.complete_connection(
            request.state,
            request.org_slug,
            request.project_slug,
        )
        return SentryConnectResponse(**result, connected=True)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/attach", response_model=SentryConnectResponse)
async def attach(request: SentryAttachRequest) -> SentryConnectResponse:
    """Link a pre-project Sentry OAuth session to a newly created project."""

    try:
        result = await sentry_service.attach_pending_connection(
            request.state,
            request.project_id,
            request.user_id,
        )
        return SentryConnectResponse(**result, connected=True)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/webhook")
async def webhook(request: Request) -> dict:
    """Receive Sentry Internal Integration webhooks and open autonomous incidents."""

    raw_body = await request.body()
    resource = request.headers.get("sentry-hook-resource", "")
    signature = request.headers.get("sentry-hook-signature")

    if not sentry_service.verify_webhook_signature(raw_body, signature):
        raise HTTPException(status_code=401, detail="Invalid Sentry webhook signature.")

    try:
        payload = sentry_service.parse_webhook_json(raw_body)
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=400, detail="Invalid JSON payload.") from exc

    if resource == "installation":
        return {"status": "ok", "resource": resource}

    if resource == "issue":
        return await sentry_ingestion_service.process_issue_webhook(payload)

    return {"status": "ignored", "resource": resource or "unknown"}
