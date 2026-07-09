"""GitHub REST integration.

We use ``httpx`` directly against the documented REST endpoints so the
dependency footprint stays small and we control exactly which fields we read:

- List commits:  GET /repos/{owner}/{repo}/commits
- Compare:       GET /repos/{owner}/{repo}/compare/{base}...{head}
- Deployments:   GET /repos/{owner}/{repo}/deployments

Auth is a fine-grained / classic PAT sent as ``Authorization: Bearer``. A token
is optional for public repos but strongly recommended to avoid rate limiting.
"""

from __future__ import annotations

import re

import httpx

from ..config import get_settings
from ..models.schemas import CommitInfo, DeploymentInfo

_REPO_RE = re.compile(r"github\.com[/:]([^/]+)/([^/#?]+?)(?:\.git)?/?$", re.IGNORECASE)


def parse_repo(repo: str) -> tuple[str, str]:
    """Accept a full GitHub URL or an ``owner/name`` slug and return (owner, name)."""

    repo = (repo or "").strip()
    match = _REPO_RE.search(repo)
    if match:
        return match.group(1), match.group(2)
    if "/" in repo and " " not in repo:
        owner, _, name = repo.partition("/")
        name = name.strip("/")
        if owner and name:
            return owner, name
    raise ValueError(f"Could not parse a GitHub 'owner/name' from: {repo!r}")


def _headers() -> dict[str, str]:
    settings = get_settings()
    headers = {
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": settings.github_api_version,
    }
    if settings.github_token:
        headers["Authorization"] = f"Bearer {settings.github_token}"
    return headers


def _to_commit(raw: dict) -> CommitInfo:
    commit = raw.get("commit", {}) or {}
    author = commit.get("author", {}) or {}
    login = (raw.get("author") or {}).get("login")
    return CommitInfo(
        sha=raw.get("sha", ""),
        short_sha=(raw.get("sha", "") or "")[:7],
        message=(commit.get("message") or "").split("\n", 1)[0].strip(),
        author=author.get("name") or login or "unknown",
        date=author.get("date") or "",
        url=raw.get("html_url", ""),
    )


async def list_recent_commits(owner: str, repo: str, limit: int = 30) -> list[CommitInfo]:
    settings = get_settings()
    url = f"{settings.github_api_url}/repos/{owner}/{repo}/commits"
    async with httpx.AsyncClient(timeout=20) as client:
        resp = await client.get(
            url, headers=_headers(), params={"per_page": max(1, min(limit, 100))}
        )
        resp.raise_for_status()
        data = resp.json()
    return [_to_commit(item) for item in data]


async def compare_commits(
    owner: str, repo: str, base: str, head: str
) -> list[CommitInfo]:
    """Commits introduced between ``base`` and ``head`` (e.g. two deployments)."""

    settings = get_settings()
    url = f"{settings.github_api_url}/repos/{owner}/{repo}/compare/{base}...{head}"
    async with httpx.AsyncClient(timeout=20) as client:
        resp = await client.get(url, headers=_headers())
        resp.raise_for_status()
        data = resp.json()
    return [_to_commit(item) for item in data.get("commits", [])]


async def list_deployments(owner: str, repo: str, limit: int = 5) -> list[DeploymentInfo]:
    """Best-effort deployment lookup. Returns [] if none / not accessible."""

    settings = get_settings()
    url = f"{settings.github_api_url}/repos/{owner}/{repo}/deployments"
    try:
        async with httpx.AsyncClient(timeout=20) as client:
            resp = await client.get(
                url, headers=_headers(), params={"per_page": max(1, min(limit, 100))}
            )
            resp.raise_for_status()
            data = resp.json()
    except httpx.HTTPError:
        return []

    return [
        DeploymentInfo(
            id=item.get("id", 0),
            environment=item.get("environment", "") or "",
            ref=item.get("ref", "") or "",
            description=item.get("description"),
            created_at=item.get("created_at"),
        )
        for item in data
    ]
