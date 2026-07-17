"""Central application settings.

All configuration is read from environment variables (or a local ``.env`` file)
so nothing sensitive is ever committed. Access settings through
``get_settings()`` which is cached for the lifetime of the process.
"""

from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env.local",
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=False,
    )

    # --- Gemini (AI) ---
    gemini_api_key: str | None = None
    gemini_model: str = "gemini-2.5-flash"
    gemini_embedding_model: str = "gemini-embedding-001"

    # --- GitHub ---
    github_token: str | None = None
    github_api_url: str = "https://api.github.com"
    github_api_version: str = "2022-11-28"
    # How many recent commits to hand to the model when hunting the bad commit.
    commit_scan_limit: int = 30

    # --- Slack ---
    # Optional global fallback webhook. Per-project webhooks (sent in the request
    # body) always take precedence over this value.
    slack_webhook_url: str | None = None

    # --- ChromaDB (runbook vector store) ---
    chroma_persist_dir: str = "./data/chroma"
    runbooks_collection: str = "runbooks"

    # --- Server ---
    cors_origins: list[str] = Field(
        default_factory=lambda: [
            "http://localhost:8443",
            "http://localhost:5173",
            "http://127.0.0.1:8443",
        ]
    )
    # Deployed frontend origin for CORS (e.g. your Vercel URL).
    frontend_url: str | None = None


@lru_cache
def get_settings() -> Settings:
    return Settings()
