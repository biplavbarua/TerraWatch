from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    DATABASE_URL: str

    # OpenRouter API key (used for Gemini via OpenRouter's OpenAI-compatible API)
    OPENROUTER_API_KEY: str = ""
    # Backward-compat alias: if only GEMINI_API_KEY is set in .env, use it
    GEMINI_API_KEY: str = ""

    CORS_ORIGINS: str = "*"
    POLL_INTERVAL_MINUTES: int = 15
    BACKFILL_YEARS: int = 5
    SKIP_BACKFILL: bool = False

    # Secret token for the admin-only /api/ingest/trigger endpoint.
    # Set to any long random string in production.
    ADMIN_TOKEN: str = "change-me-in-production"

    @property
    def cors_origins_list(self) -> list[str]:
        if self.CORS_ORIGINS == "*":
            return ["*"]
        return [o.strip() for o in self.CORS_ORIGINS.split(",")]

    def model_post_init(self, __context) -> None:
        """Resolve the OPENROUTER_API_KEY from either env var name."""
        if not self.OPENROUTER_API_KEY and self.GEMINI_API_KEY:
            # Backward compat: old .env files only have GEMINI_API_KEY
            object.__setattr__(self, "OPENROUTER_API_KEY", self.GEMINI_API_KEY)


settings = Settings()
