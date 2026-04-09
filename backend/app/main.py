from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware

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

# CORS must be registered before routers so it wraps the full middleware stack.
_allowed_origins = [o.strip() for o in settings.frontend_url.split(",") if o.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=_allowed_origins,
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
    return {"status": "ok"}


@app.get("/api/me")
def me(current_user: dict = Depends(get_current_user)) -> dict[str, dict]:
    return {"user": current_user}
