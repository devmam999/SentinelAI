"""Pydantic models shared across services and API routes."""

from pydantic import BaseModel, Field


# --------------------------------------------------------------------------- #
# GitHub
# --------------------------------------------------------------------------- #
class CommitInfo(BaseModel):
    sha: str
    short_sha: str
    message: str
    author: str
    date: str
    url: str


class DeploymentInfo(BaseModel):
    id: int
    environment: str
    ref: str
    description: str | None = None
    created_at: str | None = None


# --------------------------------------------------------------------------- #
# Runbooks (ChromaDB)
# --------------------------------------------------------------------------- #
class RunbookInput(BaseModel):
    """A runbook to index for semantic search."""

    id: str = Field(..., description="Stable unique id, e.g. the storage path.")
    title: str
    content: str = Field(..., description="Full runbook text (markdown/plain).")
    metadata: dict[str, str] = Field(default_factory=dict)


class RunbookMatch(BaseModel):
    id: str
    title: str
    content: str
    distance: float | None = None


# --------------------------------------------------------------------------- #
# Incident analysis
# --------------------------------------------------------------------------- #
class IncidentAnalysis(BaseModel):
    """Structured output produced by Gemini and rendered into the Slack alert.

    Field order mirrors the Slack message layout requested by the product.
    """

    likely_cause: str = Field(..., description="e.g. 'Deployment #418'.")
    confidence: int = Field(..., ge=0, le=100, description="0-100 confidence.")
    most_relevant_commit: str = Field(
        ..., description="Message/title of the commit most likely at fault."
    )
    affected_services: list[str] = Field(default_factory=list)
    suggested_runbook: str
    next_steps: list[str] = Field(default_factory=list)


class IncidentRequest(BaseModel):
    """Incoming alert that kicks off the analysis pipeline."""

    github_repo: str = Field(
        ..., description="Repo URL or 'owner/name' to scan for the bad commit."
    )
    description: str = Field(
        default="",
        description="Alert text / incident signal used for runbook search + analysis.",
    )
    slack_webhook_url: str | None = Field(
        default=None,
        description="Per-project Slack webhook. Falls back to SLACK_WEBHOOK_URL.",
    )
    deployment: str | None = Field(
        default=None, description="Optional deployment identifier that triggered the alert."
    )
    post_to_slack: bool = True


class IncidentResponse(BaseModel):
    analysis: IncidentAnalysis
    slack_posted: bool
    scanned_commits: int
    runbook_matches: list[RunbookMatch] = Field(default_factory=list)
