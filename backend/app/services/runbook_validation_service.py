"""Semantic validation for required runbook sections.

Uses Gemini embeddings to check whether a runbook document contains content
semantically similar to each required section — not just exact heading matches.
"""

from __future__ import annotations

import io
import math
import re

from . import gemini_service

# Product-required sections. Each has a display label plus semantic query variants
# so differently worded headings still match (e.g. "Setup", "Installation").
REQUIRED_SECTIONS: list[dict[str, list[str]]] = [
    {
        "label": "How to set up and run the service",
        "queries": [
            "How to set up and run the service",
            "installation setup configuration and how to start the service",
            "prerequisites deploy run and operate the service",
        ],
    },
    {
        "label": "How to test or verify that it works",
        "queries": [
            "How to test or verify that it works",
            "testing verification smoke test health check validation steps",
            "how to confirm the service is working correctly",
        ],
    },
    {
        "label": "What common errors or symptoms to look for",
        "queries": [
            "What common errors or symptoms to look for",
            "common failures error messages warning signs symptoms to monitor",
            "troubleshooting indicators and known failure modes",
        ],
    },
    {
        "label": "What action to take for each error",
        "queries": [
            "What action to take for each error",
            "remediation steps fix resolution playbook for each error",
            "what to do when this error occurs recovery actions",
        ],
    },
]

# Minimum cosine similarity between a section query and the best-matching chunk.
_SIMILARITY_THRESHOLD = 0.58


def _cosine_similarity(a: list[float], b: list[float]) -> float:
    dot = sum(x * y for x, y in zip(a, b))
    norm_a = math.sqrt(sum(x * x for x in a))
    norm_b = math.sqrt(sum(x * x for x in b))
    if norm_a == 0 or norm_b == 0:
        return 0.0
    return dot / (norm_a * norm_b)


def _chunk_content(text: str) -> list[str]:
    """Split runbook text into chunks for semantic comparison."""

    text = text.strip()
    if not text:
        return []

    chunks: list[str] = []
    current: list[str] = []

    for line in text.splitlines():
        # Treat markdown headings as natural section boundaries.
        if re.match(r"^#{1,6}\s+", line) and current:
            chunk = "\n".join(current).strip()
            if chunk:
                chunks.append(chunk)
            current = [line]
        else:
            current.append(line)

    if current:
        chunk = "\n".join(current).strip()
        if chunk:
            chunks.append(chunk)

    # Fall back to paragraph splits when there are no headings.
    if len(chunks) <= 1:
        chunks = [p.strip() for p in re.split(r"\n\s*\n+", text) if len(p.strip()) > 40]

    # Ensure very long sections are still searchable in smaller pieces.
    sized: list[str] = []
    for chunk in chunks:
        if len(chunk) <= 1200:
            sized.append(chunk)
            continue
        for i in range(0, len(chunk), 900):
            piece = chunk[i : i + 900].strip()
            if len(piece) > 40:
                sized.append(piece)

    return sized


def extract_pdf_text(data: bytes) -> str:
    from pypdf import PdfReader

    reader = PdfReader(io.BytesIO(data))
    return "\n".join(page.extract_text() or "" for page in reader.pages).strip()


def read_runbook_bytes(data: bytes, filename: str) -> str:
    """Extract plain text from an uploaded .md or .pdf runbook."""

    name = (filename or "").lower()
    if name.endswith(".pdf"):
        return extract_pdf_text(data)
    if name.endswith(".md"):
        return data.decode("utf-8", errors="replace")
    raise ValueError("Only .md or .pdf files are supported.")


def validate_sections(content: str) -> list[str]:
    """Return labels of required sections not found in ``content``."""

    chunks = _chunk_content(content)
    if not chunks:
        return [spec["label"] for spec in REQUIRED_SECTIONS]

    section_queries = [q for spec in REQUIRED_SECTIONS for q in spec["queries"]]
    embeddings = gemini_service.embed_texts(chunks + section_queries)
    chunk_embeddings = embeddings[: len(chunks)]
    query_embeddings = embeddings[len(chunks) :]

    missing: list[str] = []
    offset = 0
    for spec in REQUIRED_SECTIONS:
        query_count = len(spec["queries"])
        spec_queries = query_embeddings[offset : offset + query_count]
        offset += query_count

        best = 0.0
        for query_emb in spec_queries:
            for chunk_emb in chunk_embeddings:
                best = max(best, _cosine_similarity(query_emb, chunk_emb))

        if best < _SIMILARITY_THRESHOLD:
            missing.append(spec["label"])

    return missing
