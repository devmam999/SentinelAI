"""ChromaDB runbook store with Gemini-powered semantic search.

Runbooks are embedded with Gemini (so the same model powers everything) and
persisted to disk via a ``PersistentClient``. Searching a natural-language
incident description returns the closest runbooks by vector similarity.
"""

from __future__ import annotations

import chromadb
from chromadb.api.types import Documents, EmbeddingFunction, Embeddings

from ..config import get_settings
from ..models.schemas import RunbookInput, RunbookMatch
from . import gemini_service


class GeminiEmbeddingFunction(EmbeddingFunction):
    """Chroma embedding function backed by the Gemini embeddings API."""

    def __call__(self, input: Documents) -> Embeddings:  # noqa: A002 (chroma API name)
        return gemini_service.embed_texts(list(input))

    @staticmethod
    def name() -> str:
        return "gemini_ef"

    def get_config(self) -> dict:
        return {"model": get_settings().gemini_embedding_model}

    @staticmethod
    def build_from_config(config: dict) -> "GeminiEmbeddingFunction":
        return GeminiEmbeddingFunction()


_collection = None


def _get_collection():
    """Lazily open (and cache) the persistent runbooks collection."""

    global _collection
    if _collection is None:
        settings = get_settings()
        client = chromadb.PersistentClient(path=settings.chroma_persist_dir)
        _collection = client.get_or_create_collection(
            name=settings.runbooks_collection,
            embedding_function=GeminiEmbeddingFunction(),
        )
    return _collection


def add_runbook(runbook: RunbookInput) -> None:
    """Index (or replace) a single runbook."""

    metadata = {"title": runbook.title, **runbook.metadata}
    _get_collection().upsert(
        ids=[runbook.id],
        documents=[runbook.content],
        metadatas=[metadata],
    )


def search_runbooks(query: str, n_results: int = 3) -> list[RunbookMatch]:
    """Semantic search over indexed runbooks."""

    collection = _get_collection()
    if collection.count() == 0:
        return []

    result = collection.query(
        query_texts=[query],
        n_results=max(1, min(n_results, collection.count())),
    )

    ids = (result.get("ids") or [[]])[0]
    documents = (result.get("documents") or [[]])[0]
    metadatas = (result.get("metadatas") or [[]])[0]
    distances = (result.get("distances") or [[]])[0]

    matches: list[RunbookMatch] = []
    for i, doc in enumerate(documents):
        meta = metadatas[i] or {}
        matches.append(
            RunbookMatch(
                id=ids[i],
                title=meta.get("title", ids[i]),
                content=doc,
                distance=distances[i] if i < len(distances) else None,
            )
        )
    return matches
