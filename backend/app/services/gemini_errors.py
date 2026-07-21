"""Friendly messages for Gemini API quota / rate-limit failures."""

from __future__ import annotations

import re

_RATE_LIMIT_RE = re.compile(
    r"429|resource_exhausted|quota exceeded|rate.?limit",
    re.IGNORECASE,
)
_RETRY_IN_RE = re.compile(r"retry in ([\d.]+)\s*s", re.IGNORECASE)
_RETRY_DELAY_RE = re.compile(r"""retryDelay['"]?\s*:\s*['"]?([\d.]+)""", re.IGNORECASE)


def is_rate_limit_error(exc: BaseException) -> bool:
    return bool(_RATE_LIMIT_RE.search(str(exc)))


def format_rate_limit_message(exc: BaseException) -> str:
    """Return a short user-facing message with retry delay rounded to 2 decimal places."""

    text = str(exc)
    seconds: float | None = None

    match = _RETRY_IN_RE.search(text)
    if match:
        seconds = float(match.group(1))
    else:
        delay_match = _RETRY_DELAY_RE.search(text)
        if delay_match:
            seconds = float(delay_match.group(1))

    if seconds is None:
        seconds = 5.0

    return f"You exceeded the capabilities of your model. Please try again in {seconds:.2f} seconds"
