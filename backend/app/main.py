from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse

from .auth import get_current_user
from .auth_routes import router as auth_router
from .burnout import router as burnout_router
from .wellness_routes import router as wellness_router
from .student_routes import router as student_router
from .assessment_routes import router as assessment_router
from .profile_routes import router as profile_router
from .config import settings
from .database import Base, engine
from .models import AssessmentResult, DailyActivityLog, Hobby, User, UserProfile  # noqa: F401  # pyright: ignore[reportUnusedImport]


@asynccontextmanager
async def lifespan(_app: FastAPI):
    Base.metadata.create_all(bind=engine)
    yield


app = FastAPI(title=settings.app_name, lifespan=lifespan)

# CORS: in production the frontend is served from the same origin (bundled),
# so we open all origins. In dev, restrict to the configured FRONTEND_URL(s).
if settings.app_env == "production":
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=False,
        allow_methods=["*"],
        allow_headers=["*"],
    )
else:
    _dev_origins = [o.strip().rstrip("/") for o in settings.frontend_url.split(",") if o.strip()]
    app.add_middleware(
        CORSMiddleware,
        allow_origins=_dev_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

app.include_router(auth_router)
app.include_router(burnout_router)
app.include_router(wellness_router)
app.include_router(student_router)
app.include_router(assessment_router)
app.include_router(profile_router)


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok", "env": settings.app_env}


@app.get("/api/me")
def me(current_user: dict = Depends(get_current_user)) -> dict[str, dict]:
    return {"user": current_user}


# ── Serve bundled React frontend (production) ─────────────────────────────────
_FRONTEND_DIST = Path(__file__).resolve().parent.parent / "frontend_dist"


@app.get("/{full_path:path}", include_in_schema=False)
def serve_spa(full_path: str) -> FileResponse:
    candidate = _FRONTEND_DIST / full_path
    if candidate.is_file():
        return FileResponse(candidate)
    return FileResponse(_FRONTEND_DIST / "index.html")
