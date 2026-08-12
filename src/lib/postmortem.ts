import type { RunbookMatch } from './api'
import type { IncidentAnalysis } from './api'
import type { IncidentFix, StoredIncident } from './projectTeam'

export type PostmortemTimelineEvent = {
  timestamp: string
  label: string
}

export type PostmortemPayload = {
  slack_webhook_url: string
  incident_number: number
  title: string
  started_at: string
  resolved_at: string
  reported_by: string
  assigned_to: string | null
  impact: string
  root_cause: string
  root_cause_evidence: string[]
  runbook_sections: string[]
  github_evidence: string[]
  recommended_remediation: string[]
  resolution: {
    engineer: string
    submitted_at: string
    description: string
  }
  verification: {
    rejections: Array<{
      rejected_by: string
      rejected_at: string
      reason: string
    }>
    verified_by: string | null
    verified_at: string | null
  }
  closure: {
    closed_by: string
    closed_at: string
  }
  timeline: PostmortemTimelineEvent[]
}

function displayUsername(username: string | null | undefined, fallback = 'Unknown'): string {
  if (!username) return fallback
  return username.startsWith('@') ? username : `@${username}`
}

function buildImpact(incident: StoredIncident): string {
  const analysis = incident.analysis
  const parts: string[] = []

  if (incident.alert_description?.trim()) {
    parts.push(incident.alert_description.trim())
  }

  if (analysis?.affected_services?.length) {
    parts.push(`Affected services: ${analysis.affected_services.join(', ')}.`)
  }

  if (analysis?.likely_cause && !parts.some((p) => p.includes(analysis.likely_cause))) {
    parts.push(analysis.likely_cause)
  }

  return parts.join('\n\n') || 'Impact details were not recorded for this incident.'
}

function offsetIso(baseIso: string, seconds: number): string {
  const base = new Date(baseIso)
  return new Date(base.getTime() + seconds * 1000).toISOString()
}

function buildTimeline(input: {
  incident: StoredIncident
  fixesAsc: IncidentFix[]
  reporterUsername: string | null
  assigneeUsername: string | null
  closerUsername: string
  runbookMatches: RunbookMatch[] | null
  hasAnalysis: boolean
}): PostmortemTimelineEvent[] {
  const reporter = displayUsername(input.reporterUsername, 'Reporter')
  const events: PostmortemTimelineEvent[] = []

  events.push({
    timestamp: input.incident.created_at,
    label: `Incident created by ${reporter.replace(/^@/, '')}`,
  })

  events.push({
    timestamp: offsetIso(input.incident.created_at, 1),
    label: 'SentinelAI began analysis',
  })

  if (input.runbookMatches?.length) {
    events.push({
      timestamp: offsetIso(input.incident.created_at, 3),
      label: 'RAG retrieved relevant runbook sections',
    })
  }

  if (input.hasAnalysis) {
    events.push({
      timestamp: offsetIso(input.incident.created_at, 8),
      label: 'Gemini identified likely root cause',
    })
  }

  if (input.incident.assigned_at && input.assigneeUsername) {
    events.push({
      timestamp: input.incident.assigned_at,
      label: `${displayUsername(input.assigneeUsername).replace(/^@/, '')} assigned`,
    })
  }

  for (const fix of input.fixesAsc) {
    const engineer = displayUsername(fix.submitter_username, 'Engineer')
    events.push({
      timestamp: fix.created_at,
      label: `${engineer.replace(/^@/, '')} submitted resolution`,
    })

    if (fix.status === 'declined' && fix.reviewed_at) {
      const reviewer = displayUsername(fix.reviewer_username, 'Admin')
      events.push({
        timestamp: fix.reviewed_at,
        label: `${reviewer.replace(/^@/, '')} rejected resolution`,
      })
    }

    if (fix.status === 'approved' && fix.reviewed_at) {
      const reviewer = displayUsername(fix.reviewer_username ?? input.closerUsername, 'Admin')
      events.push({
        timestamp: fix.reviewed_at,
        label: `${reviewer.replace(/^@/, '')} approved resolution and closed the issue`,
      })
    }
  }

  return events.sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
  )
}

export function buildPostmortemPayload(input: {
  incident: StoredIncident
  fixes: IncidentFix[]
  reporterUsername: string | null
  closerUsername: string
  slackWebhookUrl: string
}): PostmortemPayload | null {
  const { incident, fixes, reporterUsername, closerUsername, slackWebhookUrl } = input

  if (!incident.resolved_at || !slackWebhookUrl.trim()) {
    return null
  }

  const analysis: IncidentAnalysis | null = incident.analysis
  const fixesAsc = [...fixes]
    .filter((fix) => fix.incident_id === incident.id)
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())

  const approvedFix = [...fixesAsc].reverse().find((fix) => fix.status === 'approved')
  if (!approvedFix) {
    return null
  }

  const declinedFixes = fixesAsc.filter((fix) => fix.status === 'declined')
  const runbookMatches = incident.runbook_matches ?? []
  const assigneeLabel = incident.assignee_username
    ? displayUsername(incident.assignee_username)
    : null

  const reportedBy = reporterUsername
    ? `Owner/Admin (${displayUsername(reporterUsername)})`
    : 'Owner/Admin'
  const rootCause = analysis?.likely_cause ?? incident.title
  const rootCauseEvidence: string[] = []
  if (analysis?.most_relevant_commit) {
    rootCauseEvidence.push(analysis.most_relevant_commit)
  }

  const githubEvidence = analysis?.most_relevant_commit ? [analysis.most_relevant_commit] : []
  const runbookSections = runbookMatches.map((match) => match.title).filter(Boolean)

  const rejections = declinedFixes
    .filter((fix) => fix.reviewed_at && fix.review_note)
    .map((fix) => ({
      rejected_by: displayUsername(fix.reviewer_username, 'Owner/Admin'),
      rejected_at: fix.reviewed_at!,
      reason: fix.review_note!.trim(),
    }))

  const verifiedBy =
    approvedFix.reviewer_username ?? closerUsername
      ? displayUsername(approvedFix.reviewer_username ?? closerUsername, 'Owner/Admin')
      : null

  return {
    slack_webhook_url: slackWebhookUrl.trim(),
    incident_number: incident.incident_number,
    title: incident.title,
    started_at: incident.created_at,
    resolved_at: incident.resolved_at,
    reported_by: reportedBy,
    assigned_to: assigneeLabel,
    impact: buildImpact(incident),
    root_cause: rootCause,
    root_cause_evidence: rootCauseEvidence,
    runbook_sections: runbookSections,
    github_evidence: githubEvidence,
    recommended_remediation: analysis?.next_steps ?? [],
    resolution: {
      engineer: displayUsername(approvedFix.submitter_username, 'Engineer'),
      submitted_at: approvedFix.created_at,
      description: approvedFix.fix_description,
    },
    verification: {
      rejections,
      verified_by: verifiedBy,
      verified_at: approvedFix.reviewed_at,
    },
    closure: {
      closed_by: displayUsername(closerUsername, 'Owner/Admin'),
      closed_at: incident.resolved_at,
    },
    timeline: buildTimeline({
      incident,
      fixesAsc,
      reporterUsername,
      assigneeUsername: incident.assignee_username ?? null,
      closerUsername,
      runbookMatches,
      hasAnalysis: Boolean(analysis),
    }),
  }
}
