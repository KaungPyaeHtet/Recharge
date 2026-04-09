from __future__ import annotations

import json
import uuid
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from .auth import get_current_user
from .config import settings
from .database import get_db
from .models import AssessmentResult
from .recommendations import get_recommendations
from ml.predictor import load_bundle, predict_with_shap

router = APIRouter(prefix="/api/burnout", tags=["burnout"])

_bundle: dict[str, Any] | None = None


def get_bundle() -> dict:
    global _bundle
    if _bundle is None:
        path = settings.burnout_model_path
        if not path.is_file():
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Analysis service is temporarily unavailable. Please try again later.",
            )
        _bundle = load_bundle(path)
    return _bundle


class BurnoutPredictIn(BaseModel):
    date_of_joining: str = Field(
        description="ISO date (employee start), e.g. 2019-03-15",
        examples=["2019-03-15"],
    )
    gender: str
    company_type: str
    wfh_setup_available: str
    designation: int = Field(ge=0, le=10)
    resource_allocation: float = Field(ge=0, le=20)
    mental_fatigue_score: float = Field(ge=0, le=10)


class BurnoutPredictOut(BaseModel):
    risk_score: float
    risk_band: str
    contributors: list[dict[str, Any]]
    days_to_high_risk: int | None
    projected_weekly_risk: list[dict[str, float | int]]
    warning_level: str
    warning_message: str
    recommendations: list[str] = []
    disclaimer: str = (
        "Educational wellness screening only — not a medical diagnosis."
    )


@router.get("/status")
def burnout_status() -> dict[str, bool]:
    path = settings.burnout_model_path
    return {
        "model_loaded": _bundle is not None,
        "model_exists": path.is_file(),
    }


@router.post("/predict", response_model=BurnoutPredictOut)
def burnout_predict(
    body: BurnoutPredictIn,
    user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> BurnoutPredictOut:
    bundle = get_bundle()
    payload = body.model_dump()
    result = predict_with_shap(bundle, payload)
    recs = get_recommendations("professional", result.risk_band, result.contributors)

    uid = uuid.UUID(user["id"])
    entry = AssessmentResult(
        user_id=uid,
        mode="professional",
        risk_score=result.risk_score,
        risk_band=result.risk_band,
        warning_level=result.warning_level,
        payload_json=json.dumps(payload),
        contributors_json=json.dumps(result.contributors),
    )
    db.add(entry)
    db.commit()

    return BurnoutPredictOut(
        risk_score=result.risk_score,
        risk_band=result.risk_band,
        contributors=result.contributors,
        days_to_high_risk=result.days_to_high_risk,
        projected_weekly_risk=result.projected_weekly_risk,
        warning_level=result.warning_level,
        warning_message=result.warning_message,
        recommendations=recs,
    )
