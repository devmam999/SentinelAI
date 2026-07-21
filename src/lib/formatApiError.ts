const RATE_LIMIT_RE = /429|resource_exhausted|quota exceeded|rate.?limit/i
const RETRY_IN_RE = /retry in ([\d.]+)\s*s/i
const RETRY_DELAY_RE = /retryDelay['"]?\s*:\s*['"]?([\d.]+)/i

const FRIENDLY_RATE_LIMIT_PREFIX = 'You exceeded the capabilities of your model'

export function isRateLimitError(message: string): boolean {
  return RATE_LIMIT_RE.test(message) || message.startsWith(FRIENDLY_RATE_LIMIT_PREFIX)
}

export function formatRateLimitMessage(message: string): string {
  const retryIn = message.match(RETRY_IN_RE)
  const retryDelay = message.match(RETRY_DELAY_RE)
  const raw = retryIn?.[1] ?? retryDelay?.[1]
  const seconds = raw ? parseFloat(raw) : 5
  return `You exceeded the capabilities of your model. Please try again in ${seconds.toFixed(2)} seconds`
}

/** Normalize raw API / Gemini errors for display in the UI. */
export function formatApiError(message: string): string {
  if (isRateLimitError(message)) {
    return formatRateLimitMessage(message)
  }
  return message
}
