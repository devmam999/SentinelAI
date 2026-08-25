"""Minimal Supabase admin client for server-side writes (service role only)."""

from __future__ import annotations

from typing import Any

import httpx

from ..config import get_settings


def _require_admin_config() -> tuple[str, str]:
    settings = get_settings()
    if not settings.supabase_url or not settings.supabase_service_role_key:
        raise RuntimeError(
            "Supabase admin is not configured. Set SUPABASE_URL and "
            "SUPABASE_SERVICE_ROLE_KEY in backend/.env.local."
        )
    return settings.supabase_url.rstrip("/"), settings.supabase_service_role_key


def _headers(key: str) -> dict[str, str]:
    return {
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
        "Prefer": "return=minimal",
    }


async def user_can_manage_project(user_id: str, project_id: str) -> bool:
    """Return True when the user is the project owner or an admin member."""

    base, key = _require_admin_config()
    headers = _headers(key)

    async with httpx.AsyncClient(timeout=15) as client:
        project_resp = await client.get(
            f"{base}/rest/v1/projects",
            params={"id": f"eq.{project_id}", "select": "user_id"},
            headers=headers,
        )
        project_resp.raise_for_status()
        rows = project_resp.json()
        if rows and rows[0].get("user_id") == user_id:
            return True

        member_resp = await client.get(
            f"{base}/rest/v1/project_members",
            params={
                "project_id": f"eq.{project_id}",
                "user_id": f"eq.{user_id}",
                "role": "eq.admin",
                "select": "user_id",
            },
            headers=headers,
        )
        member_resp.raise_for_status()
        return bool(member_resp.json())


async def upsert_sentry_pending(row: dict[str, Any]) -> None:
    base, key = _require_admin_config()
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.post(
            f"{base}/rest/v1/sentry_oauth_pending",
            headers={**_headers(key), "Prefer": "resolution=merge-duplicates,return=minimal"},
            json=row,
        )
        resp.raise_for_status()


async def get_sentry_pending(state: str) -> dict[str, Any] | None:
    base, key = _require_admin_config()
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.get(
            f"{base}/rest/v1/sentry_oauth_pending",
            params={"state": f"eq.{state}", "select": "*"},
            headers=_headers(key),
        )
        resp.raise_for_status()
        rows = resp.json()
        return rows[0] if rows else None


async def update_sentry_pending(state: str, fields: dict[str, Any]) -> None:
    base, key = _require_admin_config()
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.patch(
            f"{base}/rest/v1/sentry_oauth_pending",
            params={"state": f"eq.{state}"},
            headers=_headers(key),
            json=fields,
        )
        resp.raise_for_status()


async def delete_sentry_pending(state: str) -> None:
    base, key = _require_admin_config()
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.delete(
            f"{base}/rest/v1/sentry_oauth_pending",
            params={"state": f"eq.{state}"},
            headers=_headers(key),
        )
        resp.raise_for_status()


async def upsert_sentry_connection(row: dict[str, Any]) -> None:
    base, key = _require_admin_config()
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.post(
            f"{base}/rest/v1/project_sentry_connections",
            headers={**_headers(key), "Prefer": "resolution=merge-duplicates,return=minimal"},
            json=row,
        )
        resp.raise_for_status()


async def list_sentry_connections_by_project_slug(project_slug: str) -> list[dict[str, Any]]:
    base, key = _require_admin_config()
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.get(
            f"{base}/rest/v1/project_sentry_connections",
            params={"project_slug": f"eq.{project_slug}", "select": "*"},
            headers=_headers(key),
        )
        resp.raise_for_status()
        return resp.json()


async def get_project(project_id: str) -> dict[str, Any] | None:
    base, key = _require_admin_config()
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.get(
            f"{base}/rest/v1/projects",
            params={"id": f"eq.{project_id}", "select": "*"},
            headers=_headers(key),
        )
        resp.raise_for_status()
        rows = resp.json()
        return rows[0] if rows else None


async def sentry_incident_exists(project_id: str, sentry_issue_id: str) -> bool:
    base, key = _require_admin_config()
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.get(
            f"{base}/rest/v1/incidents",
            params={
                "project_id": f"eq.{project_id}",
                "sentry_issue_id": f"eq.{sentry_issue_id}",
                "select": "id",
            },
            headers=_headers(key),
        )
        resp.raise_for_status()
        return bool(resp.json())


async def create_sentry_incident(row: dict[str, Any]) -> dict[str, Any]:
    base, key = _require_admin_config()
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.post(
            f"{base}/rest/v1/incidents",
            headers={**_headers(key), "Prefer": "return=representation"},
            json=row,
        )
        resp.raise_for_status()
        rows = resp.json()
        return rows[0] if rows else {}
