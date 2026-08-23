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


class RunbookValidateRequest(BaseModel):
    content: str = Field(..., description="Full runbook text to validate.")


class RunbookValidateResponse(BaseModel):
    valid: bool
    missing_sections: list[str] = Field(default_factory=list)


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


class SlackValidateRequest(BaseModel):
    webhook_url: str = Field(..., min_length=1)


class SlackValidateResponse(BaseModel):
    valid: bool = True


class GithubValidateResponse(BaseModel):
    valid: bool = True
    owner: str
    name: str
    full_name: str
    private: bool = False


class IncidentResponse(BaseModel):
    analysis: IncidentAnalysis
    slack_posted: bool
    slack_error: str | None = Field(
        default=None,
        description="Set when post_to_slack was requested but the webhook call failed.",
    )
    scanned_commits: int
    runbook_matches: list[RunbookMatch] = Field(default_factory=list)


# --------------------------------------------------------------------------- #
# Postmortem (posted to Slack when an incident is resolved)
# --------------------------------------------------------------------------- #
class PostmortemTimelineEvent(BaseModel):
    timestamp: str = Field(..., description="ISO-8601 timestamp for ordering/display.")
    label: str


class PostmortemFixRejection(BaseModel):
    rejected_by: str
    rejected_at: str
    reason: str


class PostmortemResolution(BaseModel):
    engineer: str
    submitted_at: str
    description: str


class PostmortemVerification(BaseModel):
    rejections: list[PostmortemFixRejection] = Field(default_factory=list)
    verified_by: str | None = None
    verified_at: str | None = None


class PostmortemClosure(BaseModel):
    closed_by: str
    closed_at: str


class PostmortemRequest(BaseModel):
    slack_webhook_url: str
    incident_number: int
    title: str
    started_at: str
    resolved_at: str
    reported_by: str
    assigned_to: str | None = None
    impact: str
    root_cause: str
    root_cause_evidence: list[str] = Field(default_factory=list)
    runbook_sections: list[str] = Field(default_factory=list)
    github_evidence: list[str] = Field(default_factory=list)
    recommended_remediation: list[str] = Field(default_factory=list)
    resolution: PostmortemResolution
    verification: PostmortemVerification
    closure: PostmortemClosure
    timeline: list[PostmortemTimelineEvent] = Field(default_factory=list)


class PostmortemResponse(BaseModel):
    slack_posted: bool
    slack_error: str | None = None


# --------------------------------------------------------------------------- #
# Sentry (autonomous mode)
# --------------------------------------------------------------------------- #
class SentryAuthorizeResponse(BaseModel):
    authorization_url: str


class SentryOrg(BaseModel):
    slug: str
    name: str


class SentryProject(BaseModel):
    slug: str
    name: str


class SentryProjectListResponse(BaseModel):
    projects: list[SentryProject]


class SentryConnectRequest(BaseModel):
    state: str
    org_slug: str
    project_slug: str


class SentryConnectResponse(BaseModel):
    connected: bool = True
    org_slug: str
    org_name: str
    project_slug: str
    project_name: str
