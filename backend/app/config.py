from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    DATABASE_URL: str
    GEMINI_API_KEY: str

    CORS_ORIGINS: str = "*"
    POLL_INTERVAL_MINUTES: int = 15
    BACKFILL_YEARS: int = 5
    SKIP_BACKFILL: bool = False

    @property
    def cors_origins_list(self) -> list[str]:
        if self.CORS_ORIGINS == "*":
            return ["*"]
        return [o.strip() for o in self.CORS_ORIGINS.split(",")]


settings = Settings()
