from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from .auth import create_access_token, hash_password, verify_password
from .database import get_db
from .models import User

router = APIRouter(prefix="/api/auth", tags=["auth"])


class RegisterBody(BaseModel):
    email: str = Field(min_length=3, max_length=255)
    password: str = Field(min_length=6, max_length=128)


class LoginBody(BaseModel):
    email: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


@router.post("/register", response_model=TokenResponse)
def register(body: RegisterBody, db: Session = Depends(get_db)) -> TokenResponse:
    user = User(
        email=body.email.strip().lower(),
        password_hash=hash_password(body.password),
    )
    db.add(user)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Email already registered",
        ) from None
    db.refresh(user)
    token = create_access_token(user_id=user.id, email=user.email)
    return TokenResponse(access_token=token)


@router.post("/login", response_model=TokenResponse)
def login(body: LoginBody, db: Session = Depends(get_db)) -> TokenResponse:
    email = body.email.strip().lower()
    user = db.scalars(select(User).where(User.email == email)).one_or_none()
    if not user or not verify_password(body.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
        )
    token = create_access_token(user_id=user.id, email=user.email)
    return TokenResponse(access_token=token)
