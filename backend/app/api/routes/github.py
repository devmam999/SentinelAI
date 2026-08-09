"""GitHub inspection endpoints."""

import httpx
from fastapi import APIRouter, HTTPException, Query

from ...models.schemas import CommitInfo, DeploymentInfo, GithubValidateResponse
from ...services import github_service

router = APIRouter(prefix="/api/github", tags=["github"])


@router.get("/validate", response_model=GithubValidateResponse)
async def validate(
    repo: str = Query(..., description="Repo URL or 'owner/name'."),
) -> GithubValidateResponse:
    """Confirm a GitHub repository exists and is readable before saving a project."""

    try:
        owner, name = github_service.parse_repo(repo)
        info = await github_service.verify_repo_access(owner, name)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except httpx.HTTPStatusError as exc:
        raise HTTPException(status_code=400, detail=github_service.format_api_error(exc.response)) from exc
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail=f"Could not reach GitHub: {exc}") from exc
    return GithubValidateResponse(**info)


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
            status_code=502,
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
