"""Assessment history endpoints — returns saved prediction snapshots."""
from __future__ import annotations

import json
import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from .auth import get_current_user
from .database import get_db
from .models import AssessmentResult

router = APIRouter(prefix="/api/assessments", tags=["assessments"])


class AssessmentOut(BaseModel):
    id: str
    mode: str
    risk_score: float
    risk_band: str
    warning_level: str
    created_at: datetime
    top_contributors: list[dict]


@router.get("/history", response_model=list[AssessmentOut])
def assessment_history(
    limit: int = Query(default=30, ge=1, le=100),
    mode: str | None = Query(default=None, description="Filter by mode: professional | student"),
    user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[AssessmentOut]:
    uid = uuid.UUID(user["id"])
    stmt = (
        select(AssessmentResult)
        .where(AssessmentResult.user_id == uid)
        .order_by(AssessmentResult.created_at.desc())
        .limit(limit)
    )
    if mode:
        stmt = stmt.where(AssessmentResult.mode == mode)

    rows = db.scalars(stmt).all()
    out = []
    for r in rows:
        try:
            contributors = json.loads(r.contributors_json or "[]")[:3]
        except Exception:
            contributors = []
        out.append(AssessmentOut(
            id=str(r.id),
            mode=r.mode,
            risk_score=r.risk_score,
            risk_band=r.risk_band,
            warning_level=r.warning_level,
            created_at=r.created_at,
            top_contributors=contributors,
        ))
    return out
