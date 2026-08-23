"""Friendly messages for Gemini API quota / rate-limit failures."""

from __future__ import annotations

import json
import re
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime

_RATE_LIMIT_RE = re.compile(
    r"429|resource_exhausted|quota exceeded|rate.?limit|overloaded",
    re.IGNORECASE,
)
# "Please retry in 53.016342224s" / "try again in 34.12 seconds"
_RETRY_AFTER_TEXT_RE = re.compile(
    r"(?:retry|try again) in ([\d.]+)\s*(?:s|sec(?:onds?)?)\b",
    re.IGNORECASE,
)
# JSON / dict serialization: "retryDelay": "53s" or 'retryDelay': '47.5s'
_RETRY_DELAY_RE = re.compile(
    r"""retryDelay['"]?\s*:\s*['"]?([\d.]+)\s*s?['"]?""",
    re.IGNORECASE,
)
_RETRY_INFO_TYPE = "type.googleapis.com/google.rpc.RetryInfo"


def is_rate_limit_error(exc: BaseException) -> bool:
    if _RATE_LIMIT_RE.search(str(exc)):
        return True
    message = getattr(exc, "message", None)
    return bool(message and _RATE_LIMIT_RE.search(str(message)))


def _parse_duration_seconds(raw: str) -> float | None:
    """Parse Gemini RetryInfo values like ``53s`` or ``53.016342224s``."""

    value = raw.strip().strip('"').strip("'")
    if not value:
        return None

    match = re.fullmatch(r"([\d.]+)\s*s(?:ec(?:onds?)?)?", value, re.IGNORECASE)
    if match:
        return float(match.group(1))

    try:
        return float(value)
    except ValueError:
        return None


def _extract_from_retry_info(details: list[object]) -> float | None:
    for detail in details:
        if not isinstance(detail, dict):
            continue
        if detail.get("@type") != _RETRY_INFO_TYPE:
            continue
        delay = detail.get("retryDelay")
        if delay is None:
            continue
        seconds = _parse_duration_seconds(str(delay))
        if seconds is not None:
            return seconds
    return None


def _extract_from_error_payload(payload: object) -> float | None:
    if not isinstance(payload, dict):
        return None

    error = payload.get("error")
    if isinstance(error, dict):
        details = error.get("details")
        if isinstance(details, list):
            seconds = _extract_from_retry_info(details)
            if seconds is not None:
                return seconds

        message = error.get("message")
        if isinstance(message, str):
            seconds = _parse_retry_seconds_from_text(message)
            if seconds is not None:
                return seconds

    return None


def _retry_after_from_response(exc: BaseException) -> float | None:
    response = getattr(exc, "response", None)
    if response is None or not hasattr(response, "headers"):
        return None

    retry_after = response.headers.get("Retry-After") or response.headers.get("retry-after")
    if not retry_after:
        return None

    retry_after = retry_after.strip()
    try:
        return max(0.0, float(retry_after))
    except ValueError:
        pass

    try:
        retry_at = parsedate_to_datetime(retry_after)
        if retry_at.tzinfo is None:
            retry_at = retry_at.replace(tzinfo=timezone.utc)
        return max(0.0, (retry_at - datetime.now(timezone.utc)).total_seconds())
    except (TypeError, ValueError, OverflowError):
        return None


def _parse_retry_seconds_from_text(text: str) -> float | None:
    match = _RETRY_AFTER_TEXT_RE.search(text)
    if match:
        return float(match.group(1))

    delay_match = _RETRY_DELAY_RE.search(text)
    if delay_match:
        return float(delay_match.group(1))

    return None


def extract_retry_seconds(exc: BaseException) -> float | None:
    """Return retry delay in seconds from a Gemini / Google API error."""

    details = getattr(exc, "details", None)
    if isinstance(details, dict):
        seconds = _extract_from_error_payload(details)
        if seconds is not None:
            return seconds

    message = getattr(exc, "message", None)
    if message:
        seconds = _parse_retry_seconds_from_text(str(message))
        if seconds is not None:
            return seconds

    seconds = _parse_retry_seconds_from_text(str(exc))
    if seconds is not None:
        return seconds

    # Some SDK errors stringify nested JSON — try a best-effort JSON scan.
    text = str(exc)
    if "retryDelay" in text:
        try:
            start = text.find("{")
            if start >= 0:
                payload = json.loads(text[start:])
                seconds = _extract_from_error_payload(payload)
                if seconds is not None:
                    return seconds
        except json.JSONDecodeError:
            pass

    return _retry_after_from_response(exc)


def format_rate_limit_message(exc: BaseException) -> str:
    """Return a short user-facing message with the server-provided retry delay."""

    seconds = extract_retry_seconds(exc)
    if seconds is None:
        return (
            "You exceeded the capabilities of your model. "
            "Please try again later."
        )

    return (
        "You exceeded the capabilities of your model. "
        f"Please try again in {seconds:.2f} seconds"
    )
