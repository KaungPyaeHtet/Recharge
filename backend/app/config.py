from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    app_name: str = "fastapi-supabase-template"
    app_env: str = "development"
    frontend_url: str = "http://localhost:5173"
    supabase_url: str
    supabase_anon_key: str


settings = Settings()
