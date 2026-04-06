from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from supabase import Client, create_client

from .config import settings

security = HTTPBearer(auto_error=False)


def get_supabase_client() -> Client:
    return create_client(settings.supabase_url, settings.supabase_anon_key)


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(security),
) -> dict:
    if not credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing bearer token",
        )

    supabase = get_supabase_client()
    user_response = supabase.auth.get_user(credentials.credentials)
    user = user_response.user

    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
        )

    return {
        "id": user.id,
        "email": user.email,
        "phone": user.phone,
        "created_at": user.created_at,
    }
