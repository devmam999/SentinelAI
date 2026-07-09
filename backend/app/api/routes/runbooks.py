"""Runbook indexing + semantic search endpoints."""

from fastapi import APIRouter, HTTPException, Query
from fastapi.concurrency import run_in_threadpool

from ...models.schemas import RunbookInput, RunbookMatch
from ...services import chroma_service

router = APIRouter(prefix="/api/runbooks", tags=["runbooks"])


@router.post("", status_code=201)
async def index_runbook(runbook: RunbookInput) -> dict:
    try:
        await run_in_threadpool(chroma_service.add_runbook, runbook)
    except RuntimeError as exc:  # e.g. Gemini key missing (embeddings needed)
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    return {"status": "indexed", "id": runbook.id}


@router.get("/search", response_model=list[RunbookMatch])
async def search(
    q: str = Query(..., description="Natural-language incident description."),
    n: int = Query(3, ge=1, le=20),
) -> list[RunbookMatch]:
    try:
        return await run_in_threadpool(chroma_service.search_runbooks, q, n)
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
