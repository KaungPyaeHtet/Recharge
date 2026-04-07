from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .auth import get_current_user
from .auth_routes import router as auth_router
from .burnout import router as burnout_router
from .config import settings
from .database import Base, engine
from .models import User  # noqa: F401 — registers ``users`` with SQLAlchemy metadata


@asynccontextmanager
async def lifespan(_app: FastAPI):
    Base.metadata.create_all(bind=engine)
    yield


app = FastAPI(title=settings.app_name, lifespan=lifespan)

app.include_router(auth_router)
app.include_router(burnout_router)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.frontend_url],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok", "env": settings.app_env}


@app.get("/api/me")
def me(current_user: dict = Depends(get_current_user)) -> dict[str, dict]:
    return {"user": current_user}
