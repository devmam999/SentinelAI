"""Incident orchestration — the end-to-end pipeline.

Given an incoming alert this service:

1. Pulls recent commit + deployment history from GitHub (to find the bad commit).
2. Runs semantic search over runbooks in ChromaDB.
3. Asks Gemini to produce a structured :class:`IncidentAnalysis`.
4. Posts the formatted alert to Slack (if a webhook is available).

CPU/blocking SDK calls (Gemini, Chroma) are pushed to a threadpool so the async
event loop stays responsive.
"""

from __future__ import annotations

from fastapi.concurrency import run_in_threadpool

from ..config import get_settings
from ..models.schemas import IncidentRequest, IncidentResponse
from . import chroma_service, gemini_service, github_service, slack_service


async def analyze_and_notify(request: IncidentRequest) -> IncidentResponse:
    settings = get_settings()
    owner, repo = github_service.parse_repo(request.github_repo)

    # 1. GitHub context.
    commits = await github_service.list_recent_commits(
        owner, repo, settings.commit_scan_limit
    )
    deployments = await github_service.list_deployments(owner, repo, limit=5)

    # 2. Runbook semantic search (Chroma calls are sync).
    query = request.description or request.deployment or "production incident"
    runbooks = await run_in_threadpool(chroma_service.search_runbooks, query, 3)

    # 3. Gemini structured analysis (sync SDK call).
    analysis = await run_in_threadpool(
        gemini_service.analyze_incident, request, commits, deployments, runbooks
    )

    # 4. Slack notification.
    webhook = request.slack_webhook_url or settings.slack_webhook_url
    slack_posted = False
    if request.post_to_slack and webhook:
        await slack_service.post_incident(webhook, analysis)
        slack_posted = True

    return IncidentResponse(
        analysis=analysis,
        slack_posted=slack_posted,
        scanned_commits=len(commits),
        runbook_matches=runbooks,
    )
