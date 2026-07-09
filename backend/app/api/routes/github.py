"""GitHub inspection endpoints."""

import httpx
from fastapi import APIRouter, HTTPException, Query

from ...models.schemas import CommitInfo, DeploymentInfo
from ...services import github_service

router = APIRouter(prefix="/api/github", tags=["github"])


@router.get("/commits", response_model=list[CommitInfo])
async def commits(
    repo: str = Query(..., description="Repo URL or 'owner/name'."),
    limit: int = Query(30, ge=1, le=100),
) -> list[CommitInfo]:
    try:
        owner, name = github_service.parse_repo(repo)
        return await github_service.list_recent_commits(owner, name, limit)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except httpx.HTTPStatusError as exc:
        raise HTTPException(
            status_code=exc.response.status_code,
            detail=f"GitHub API error: {exc.response.text}",
        ) from exc


@router.get("/deployments", response_model=list[DeploymentInfo])
async def deployments(
    repo: str = Query(..., description="Repo URL or 'owner/name'."),
    limit: int = Query(5, ge=1, le=100),
) -> list[DeploymentInfo]:
    try:
        owner, name = github_service.parse_repo(repo)
        return await github_service.list_deployments(owner, name, limit)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
