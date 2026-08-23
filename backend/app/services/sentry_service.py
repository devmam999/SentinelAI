"""Sentry OAuth + organization/project selection for autonomous mode."""

from __future__ import annotations

import base64
import json
import secrets
from datetime import datetime, timezone
from typing import Any
from urllib.parse import urlencode

import httpx

from ..config import get_settings
from . import supabase_admin

SENTRY_AUTH_URL = "https://sentry.io/oauth/authorize/"
SENTRY_TOKEN_URL = "https://sentry.io/oauth/token/"
SENTRY_API_BASE = "https://sentry.io/api/0"
SENTRY_SCOPES = "org:read project:read event:read"


class SentryNotConfiguredError(RuntimeError):
    pass


def _require_oauth_config() -> tuple[str, str, str]:
    settings = get_settings()
    if not settings.sentry_client_id or not settings.sentry_client_secret:
        raise SentryNotConfiguredError(
            "Sentry OAuth is not configured. Set SENTRY_CLIENT_ID and "
            "SENTRY_CLIENT_SECRET in backend/.env.local."
        )
    redirect_uri = settings.sentry_redirect_uri
    if not redirect_uri:
        raise SentryNotConfiguredError(
            "SENTRY_REDIRECT_URI is not configured for the backend OAuth callback."
        )
    return settings.sentry_client_id, settings.sentry_client_secret, redirect_uri


def build_oauth_state(project_id: str, user_id: str) -> str:
    payload = {
        "project_id": project_id,
        "user_id": user_id,
        "nonce": secrets.token_urlsafe(16),
    }
    raw = json.dumps(payload, separators=(",", ":")).encode("utf-8")
    return base64.urlsafe_b64encode(raw).decode("ascii").rstrip("=")


def parse_oauth_state(state: str) -> dict[str, str]:
    padded = state + "=" * (-len(state) % 4)
    raw = base64.urlsafe_b64decode(padded.encode("ascii"))
    data = json.loads(raw.decode("utf-8"))
    project_id = data.get("project_id")
    user_id = data.get("user_id")
    if not project_id or not user_id:
        raise ValueError("Invalid OAuth state.")
    return {"project_id": project_id, "user_id": user_id}


def build_authorization_url(project_id: str, user_id: str) -> tuple[str, str]:
    client_id, _, redirect_uri = _require_oauth_config()
    state = build_oauth_state(project_id, user_id)
    params = urlencode(
        {
            "response_type": "code",
            "client_id": client_id,
            "redirect_uri": redirect_uri,
            "scope": SENTRY_SCOPES,
            "state": state,
        }
    )
    return f"{SENTRY_AUTH_URL}?{params}", state


async def exchange_code_for_token(code: str) -> str:
    client_id, client_secret, redirect_uri = _require_oauth_config()
    async with httpx.AsyncClient(timeout=20) as client:
        resp = await client.post(
            SENTRY_TOKEN_URL,
            data={
                "grant_type": "authorization_code",
                "code": code,
                "client_id": client_id,
                "client_secret": client_secret,
                "redirect_uri": redirect_uri,
            },
            headers={"Content-Type": "application/x-www-form-urlencoded"},
        )
        resp.raise_for_status()
        payload = resp.json()
    token = payload.get("access_token")
    if not token:
        raise RuntimeError("Sentry did not return an access token.")
    return token


async def _sentry_get(path: str, access_token: str) -> Any:
    async with httpx.AsyncClient(timeout=20) as client:
        resp = await client.get(
            f"{SENTRY_API_BASE}{path}",
            headers={"Authorization": f"Bearer {access_token}"},
        )
        resp.raise_for_status()
        return resp.json()


async def list_organizations(access_token: str) -> list[dict[str, str]]:
    data = await _sentry_get("/organizations/", access_token)
    return [{"slug": org["slug"], "name": org.get("name") or org["slug"]} for org in data]


async def list_projects(access_token: str, org_slug: str) -> list[dict[str, str]]:
    data = await _sentry_get(f"/organizations/{org_slug}/projects/", access_token)
    return [{"slug": proj["slug"], "name": proj.get("name") or proj["slug"]} for proj in data]


async def save_pending_authorization(state: str, project_id: str, user_id: str, access_token: str) -> None:
    await supabase_admin.upsert_sentry_pending(
        {
            "state": state,
            "project_id": project_id,
            "user_id": user_id,
            "access_token": access_token,
        }
    )


async def load_pending_authorization(state: str) -> dict[str, Any]:
    row = await supabase_admin.get_sentry_pending(state)
    if not row:
        raise ValueError("This Sentry authorization session expired or is invalid.")

    expires_at = row.get("expires_at")
    if expires_at:
        expiry = datetime.fromisoformat(expires_at.replace("Z", "+00:00"))
        if expiry.tzinfo is None:
            expiry = expiry.replace(tzinfo=timezone.utc)
        if expiry < datetime.now(timezone.utc):
            raise ValueError("This Sentry authorization session expired. Connect again.")

    return row


async def complete_connection(state: str, org_slug: str, project_slug: str) -> dict[str, str]:
    pending = await load_pending_authorization(state)
    access_token = pending["access_token"]
    project_id = pending["project_id"]

    orgs = await list_organizations(access_token)
    org = next((item for item in orgs if item["slug"] == org_slug), None)
    if not org:
        raise ValueError("Selected Sentry organization was not authorized.")

    projects = await list_projects(access_token, org_slug)
    project = next((item for item in projects if item["slug"] == project_slug), None)
    if not project:
        raise ValueError("Selected Sentry project was not found for this organization.")

    await supabase_admin.upsert_sentry_connection(
        {
            "project_id": project_id,
            "access_token": access_token,
            "org_slug": org_slug,
            "org_name": org["name"],
            "project_slug": project_slug,
            "project_name": project["name"],
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }
    )
    await supabase_admin.delete_sentry_pending(state)

    return {
        "org_slug": org_slug,
        "org_name": org["name"],
        "project_slug": project_slug,
        "project_name": project["name"],
    }
