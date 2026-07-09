"""Gemini (Google Gen AI) integration.

Provides two capabilities used across the app:

1. ``analyze_incident`` — structured incident analysis using ``response_schema``
   so Gemini returns JSON that maps 1:1 onto :class:`IncidentAnalysis`.
2. ``embed_texts`` — text embeddings that power ChromaDB semantic search.

The client is created lazily so the app can boot (and ``/health`` works) even
when ``GEMINI_API_KEY`` is not set. Calls that need the model raise a clear
error instead.
"""

from __future__ import annotations

import json
from functools import lru_cache

from google import genai
from google.genai import types

from ..config import get_settings
from ..models.schemas import (
    CommitInfo,
    DeploymentInfo,
    IncidentAnalysis,
    IncidentRequest,
    RunbookMatch,
)


@lru_cache
def _client() -> genai.Client:
    settings = get_settings()
    if not settings.gemini_api_key:
        raise RuntimeError(
            "GEMINI_API_KEY is not set. Add it to your environment / .env file."
        )
    return genai.Client(api_key=settings.gemini_api_key)


def embed_texts(texts: list[str]) -> list[list[float]]:
    """Return one embedding vector per input text (used by ChromaDB)."""

    if not texts:
        return []
    settings = get_settings()
    response = _client().models.embed_content(
        model=settings.gemini_embedding_model,
        contents=texts,
    )
    return [list(item.values) for item in response.embeddings]


_SYSTEM_GUIDANCE = """You are Sentinel, an autonomous Site Reliability Engineer.
A production alert just fired. Using the recent commit history, deployment
history, and available runbooks, determine the most probable root cause and the
remediation plan. Be decisive and concise — this goes straight to an on-call
Slack channel.

Rules:
- most_relevant_commit: the commit MESSAGE most likely responsible (not the SHA).
- likely_cause: a short phrase, e.g. "Deployment #418" or the offending change.
- confidence: an integer 0-100 reflecting how sure you are.
- affected_services: the services most likely impacted.
- suggested_runbook: pick the best-matching runbook TITLE from the provided list
  if one fits; otherwise propose a sensible runbook name.
- next_steps: concrete, ordered remediation actions.
"""


def _build_prompt(
    request: IncidentRequest,
    commits: list[CommitInfo],
    deployments: list[DeploymentInfo],
    runbooks: list[RunbookMatch],
) -> str:
    commit_lines = (
        "\n".join(
            f"- [{c.short_sha}] {c.message} (by {c.author}, {c.date})" for c in commits
        )
        or "No commits found."
    )
    deploy_lines = (
        "\n".join(
            f"- #{d.id} {d.environment} @ {d.ref}"
            + (f" — {d.description}" if d.description else "")
            for d in deployments
        )
        or "No deployment data available."
    )
    runbook_lines = (
        "\n".join(f"- {r.title}" for r in runbooks) or "No runbooks indexed."
    )
    signal = request.description or "An unspecified production alert fired."
    deployment = f"\nTriggering deployment: {request.deployment}" if request.deployment else ""

    return (
        f"{_SYSTEM_GUIDANCE}\n\n"
        f"=== Incident signal ===\n{signal}{deployment}\n\n"
        f"=== Recent commits (most recent first) ===\n{commit_lines}\n\n"
        f"=== Recent deployments ===\n{deploy_lines}\n\n"
        f"=== Candidate runbooks (choose suggested_runbook from these titles) ===\n"
        f"{runbook_lines}\n"
    )


def analyze_incident(
    request: IncidentRequest,
    commits: list[CommitInfo],
    deployments: list[DeploymentInfo],
    runbooks: list[RunbookMatch],
) -> IncidentAnalysis:
    """Ask Gemini to produce a structured incident analysis."""

    settings = get_settings()
    prompt = _build_prompt(request, commits, deployments, runbooks)

    response = _client().models.generate_content(
        model=settings.gemini_model,
        contents=prompt,
        config=types.GenerateContentConfig(
            response_mime_type="application/json",
            response_schema=IncidentAnalysis,
            temperature=0.2,
        ),
    )

    parsed = getattr(response, "parsed", None)
    if isinstance(parsed, IncidentAnalysis):
        return parsed
    # Fallback: parse raw JSON text if the SDK didn't hydrate .parsed.
    return IncidentAnalysis(**json.loads(response.text))
