from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


def _default_burnout_model_path() -> Path:
    return Path(__file__).resolve().parent.parent / "ml" / "artifacts" / "burnout_model.joblib"


def _default_database_url() -> str:
    return f"sqlite:///{(Path(__file__).resolve().parent.parent / 'app.db').as_posix()}"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    app_name: str = "recharge-api"
    app_env: str = "development"
    frontend_url: str = "http://localhost:5173"
    database_url: str = Field(default_factory=_default_database_url)
    jwt_secret: str = "dev-only-change-me-use-long-random-string-in-production"
    jwt_algorithm: str = "HS256"
    jwt_expire_minutes: int = 60 * 24 * 7
    burnout_model_path: Path = Field(default_factory=_default_burnout_model_path)


settings = Settings()
