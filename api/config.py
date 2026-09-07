from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    environment: str = "development"

    # Supabase
    supabase_url: str = ""
    supabase_anon_key: str = ""
    supabase_service_role_key: str = ""
    supabase_jwt_secret: str = ""
    supabase_jwks_url: str = ""  # https://{ref}.supabase.co/auth/v1/.well-known/jwks.json

    # Database
    database_url: str = ""

    # Redis
    redis_url: str = "redis://localhost:6379"

    # Cloudflare R2
    r2_access_key: str = ""
    r2_secret_key: str = ""
    r2_endpoint: str = ""
    r2_bucket_name: str = "sosh-media"

    # Expo Push
    expo_access_token: str = ""

    # Tuning (adjustable without a code deploy)
    voting_window_hours: int = 2

    class Config:
        env_file = ".env"
        extra = "ignore"


settings = Settings()
