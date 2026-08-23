const RATE_LIMIT_RE = /429|resource_exhausted|quota exceeded|rate.?limit|overloaded/i
const RETRY_AFTER_TEXT_RE = /(?:retry|try again) in ([\d.]+)\s*(?:s|sec(?:onds?)?)\b/i
const RETRY_DELAY_RE = /retryDelay['"]?\s*:\s*['"]?([\d.]+)\s*s?['"]?/i
const RETRY_INFO_TYPE = 'type.googleapis.com/google.rpc.RetryInfo'

const FRIENDLY_RATE_LIMIT_PREFIX = 'You exceeded the capabilities of your model'

export function isRateLimitError(message: string): boolean {
  return RATE_LIMIT_RE.test(message) || message.startsWith(FRIENDLY_RATE_LIMIT_PREFIX)
}

function parseDurationSeconds(raw: string): number | null {
  const value = raw.trim().replace(/^['"]|['"]$/g, '')
  if (!value) return null

  const durationMatch = value.match(/^([\d.]+)\s*s(?:ec(?:onds?)?)?$/i)
  if (durationMatch) return parseFloat(durationMatch[1])

  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : null
}

function extractFromRetryInfo(details: unknown[]): number | null {
  for (const detail of details) {
    if (!detail || typeof detail !== 'object') continue
    const entry = detail as Record<string, unknown>
    if (entry['@type'] !== RETRY_INFO_TYPE) continue
    if (entry.retryDelay == null) continue
    const seconds = parseDurationSeconds(String(entry.retryDelay))
    if (seconds != null) return seconds
  }
  return null
}

function extractFromErrorPayload(payload: unknown): number | null {
  if (!payload || typeof payload !== 'object') return null
  const error = (payload as Record<string, unknown>).error
  if (!error || typeof error !== 'object') return null

  const details = (error as Record<string, unknown>).details
  if (Array.isArray(details)) {
    const fromRetryInfo = extractFromRetryInfo(details)
    if (fromRetryInfo != null) return fromRetryInfo
  }

  const message = (error as Record<string, unknown>).message
  if (typeof message === 'string') {
    const fromMessage = parseRetrySecondsFromText(message)
    if (fromMessage != null) return fromMessage
  }

  return null
}

function parseRetrySecondsFromText(message: string): number | null {
  const retryAfterText = message.match(RETRY_AFTER_TEXT_RE)
  if (retryAfterText) return parseFloat(retryAfterText[1])

  const retryDelay = message.match(RETRY_DELAY_RE)
  if (retryDelay) return parseFloat(retryDelay[1])

  return null
}

export function extractRetrySeconds(message: string): number | null {
  const fromText = parseRetrySecondsFromText(message)
  if (fromText != null) return fromText

  const jsonStart = message.indexOf('{')
  if (jsonStart >= 0 && message.includes('retryDelay')) {
    try {
      const payload = JSON.parse(message.slice(jsonStart)) as unknown
      const fromPayload = extractFromErrorPayload(payload)
      if (fromPayload != null) return fromPayload
    } catch {
      // ignore malformed JSON fragments in error strings
    }
  }

  return null
}

export function formatRateLimitMessage(message: string): string {
  const seconds = extractRetrySeconds(message)
  if (seconds == null) {
    return `${FRIENDLY_RATE_LIMIT_PREFIX}. Please try again later.`
  }
  return `${FRIENDLY_RATE_LIMIT_PREFIX}. Please try again in ${seconds.toFixed(2)} seconds`
}

/** Normalize raw API / Gemini errors for display in the UI. */
export function formatApiError(message: string): string {
  if (isRateLimitError(message)) {
    return formatRateLimitMessage(message)
  }
  return message
}
