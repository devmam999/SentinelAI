"""Runbook indexing, validation, and semantic search endpoints."""

from fastapi import APIRouter, File, Form, HTTPException, Query, UploadFile
from fastapi.concurrency import run_in_threadpool

from ...models.schemas import (
    RunbookInput,
    RunbookMatch,
    RunbookValidateRequest,
    RunbookValidateResponse,
)
from ...services import chroma_service, runbook_validation_service
from ...services.gemini_errors import format_rate_limit_message, is_rate_limit_error

router = APIRouter(prefix="/api/runbooks", tags=["runbooks"])


def _raise_runbook_error(action: str, exc: Exception) -> None:
    if is_rate_limit_error(exc):
        raise HTTPException(status_code=429, detail=format_rate_limit_message(exc)) from exc
    raise HTTPException(status_code=400, detail=f"Could not {action} runbook: {exc}") from exc


def _runbook_title(filename: str, title: str | None) -> str:
    if title and title.strip():
        return title.strip()
    return (filename or "runbook").rsplit("/", 1)[-1]


@router.post("/validate", response_model=RunbookValidateResponse)
async def validate(body: RunbookValidateRequest) -> RunbookValidateResponse:
    """Semantic check that a runbook contains all required sections."""

    try:
        missing = await run_in_threadpool(
            runbook_validation_service.validate_sections, body.content
        )
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except Exception as exc:
        if is_rate_limit_error(exc):
            raise HTTPException(status_code=429, detail=format_rate_limit_message(exc)) from exc
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    return RunbookValidateResponse(valid=len(missing) == 0, missing_sections=missing)


@router.post("/validate-file", response_model=RunbookValidateResponse)
async def validate_file(file: UploadFile = File(...)) -> RunbookValidateResponse:
    """Validate an uploaded .md or .pdf runbook file."""

    data = await file.read()
    try:
        content = await run_in_threadpool(
            runbook_validation_service.read_runbook_bytes, data, file.filename or ""
        )
        missing = await run_in_threadpool(runbook_validation_service.validate_sections, content)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except Exception as exc:
        _raise_runbook_error("read", exc)

    return RunbookValidateResponse(valid=len(missing) == 0, missing_sections=missing)


@router.post("/index-file", status_code=201)
async def index_file(
    file: UploadFile = File(...),
    runbook_id: str = Form(...),
    title: str = Form(""),
    project_id: str = Form(""),
) -> dict:
    """Parse an uploaded .md or .pdf runbook and index it in ChromaDB."""

    data = await file.read()
    try:
        content = await run_in_threadpool(
            runbook_validation_service.read_runbook_bytes, data, file.filename or ""
        )
        metadata = {"project_id": project_id} if project_id else {}
        runbook = RunbookInput(
            id=runbook_id,
            title=_runbook_title(file.filename or "", title),
            content=content,
            metadata=metadata,
        )
        await run_in_threadpool(chroma_service.add_runbook, runbook)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except Exception as exc:
        _raise_runbook_error("index", exc)

    return {"status": "indexed", "id": runbook_id}


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
    except Exception as exc:
        if is_rate_limit_error(exc):
            raise HTTPException(status_code=429, detail=format_rate_limit_message(exc)) from exc
        raise HTTPException(status_code=400, detail=str(exc)) from exc
