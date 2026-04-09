import uuid
from datetime import date, datetime, timezone

from sqlalchemy import Date, DateTime, Float, ForeignKey, String, Text, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from .database import Base


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


class User(Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=_utc_now,
    )


class Hobby(Base):
    """Activity the user wants to protect (running, music, etc.)."""

    __tablename__ = "hobbies"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid,
        ForeignKey("users.id", ondelete="CASCADE"),
        index=True,
    )
    name: Mapped[str] = mapped_column(String(120))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=_utc_now,
    )


class DailyActivityLog(Base):
    """Free-text daily check-in with light NLP + optional user +/- label."""

    __tablename__ = "daily_activity_logs"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid,
        ForeignKey("users.id", ondelete="CASCADE"),
        index=True,
    )
    log_date: Mapped[date] = mapped_column(Date, index=True)
    raw_text: Mapped[str] = mapped_column(Text)
    user_polarity: Mapped[str | None] = mapped_column(String(16), nullable=True)
    nlp_polarity: Mapped[float] = mapped_column(default=0.0)
    blended_polarity: Mapped[float] = mapped_column(default=0.0)
    matched_hobby_ids: Mapped[str | None] = mapped_column(String(500), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=_utc_now,
    )


class UserProfile(Base):
    """Stored work profile (friendly answers that map to ML inputs)."""

    __tablename__ = "user_profiles"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid,
        ForeignKey("users.id", ondelete="CASCADE"),
        unique=True,
        index=True,
    )
    date_of_joining: Mapped[str] = mapped_column(String(20))
    gender: Mapped[str] = mapped_column(String(16))
    company_type: Mapped[str] = mapped_column(String(16))
    wfh_setup_available: Mapped[str] = mapped_column(String(4))
    role_level: Mapped[str] = mapped_column(String(32))
    hours_per_day: Mapped[str] = mapped_column(String(32))
    evening_work: Mapped[str] = mapped_column(String(32))
    projects_count: Mapped[str] = mapped_column(String(32))
    end_of_day: Mapped[str] = mapped_column(String(32))
    switch_off: Mapped[str] = mapped_column(String(32))
    sleep_worries: Mapped[str] = mapped_column(String(32))
    exercise: Mapped[str] = mapped_column(String(32))
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=_utc_now,
    )


class AssessmentResult(Base):
    """Persisted burnout/risk prediction snapshot for a user."""

    __tablename__ = "assessment_results"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid,
        ForeignKey("users.id", ondelete="CASCADE"),
        index=True,
    )
    mode: Mapped[str] = mapped_column(String(32))          # "professional" | "student"
    risk_score: Mapped[float] = mapped_column(Float)
    risk_band: Mapped[str] = mapped_column(String(16))
    warning_level: Mapped[str] = mapped_column(String(16))
    payload_json: Mapped[str] = mapped_column(Text)        # JSON of input fields
    contributors_json: Mapped[str] = mapped_column(Text, default="[]")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=_utc_now,
        index=True,
    )
