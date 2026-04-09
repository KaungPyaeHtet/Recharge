"""Student burnout prediction endpoint."""
from __future__ import annotations

import json
from typing import Any

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from .auth import get_current_user
from .database import get_db
from .models import AssessmentResult
from .recommendations import get_recommendations
from ml.student_predictor import predict_student

router = APIRouter(prefix="/api/student", tags=["student"])


class StudentPredictIn(BaseModel):
    gender: str = Field(examples=["Male"])
    course: str = Field(examples=["Engineering"])
    year: str = Field(examples=["2nd Year"])
    stress_level: str = Field(examples=["High"])
    sleep_quality: str = Field(examples=["Poor"])
    internet_quality: str = Field(examples=["Good"])
    age: float = Field(ge=15, le=40, examples=[20])
    daily_study_hours: float = Field(ge=0, le=20, examples=[6])
    daily_sleep_hours: float = Field(ge=0, le=16, examples=[6])
    screen_time_hours: float = Field(ge=0, le=20, examples=[5])
    anxiety_score: float = Field(ge=0, le=10, examples=[6])
    depression_score: float = Field(ge=0, le=10, examples=[5])
    academic_pressure_score: float = Field(ge=0, le=10, examples=[7])
    financial_stress_score: float = Field(ge=0, le=10, examples=[5])
    social_support_score: float = Field(ge=0, le=10, examples=[4])
    physical_activity_hours: float = Field(ge=0, le=10, examples=[1])
    attendance_percentage: float = Field(ge=0, le=100, examples=[75])
    cgpa: float = Field(ge=0, le=10, examples=[6.5])


class StudentPredictOut(BaseModel):
    risk_score: float
    risk_band: str
    contributors: list[dict[str, Any]]
    days_to_high_risk: int | None
    projected_weekly_risk: list[dict[str, Any]]
    warning_level: str
    warning_message: str
    recommendations: list[str]
    disclaimer: str = "Educational wellness screening only — not a medical diagnosis."


@router.get("/status")
def student_status() -> dict[str, Any]:
    return {"scorer": "domain_knowledge_weighted", "ready": True}


@router.post("/predict", response_model=StudentPredictOut)
def student_predict(
    body: StudentPredictIn,
    user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> StudentPredictOut:
    import uuid
    payload = body.model_dump()
    result = predict_student(None, payload)

    recs = get_recommendations("student", result.risk_band, result.contributors)

    # Persist assessment
    uid = uuid.UUID(user["id"])
    entry = AssessmentResult(
        user_id=uid,
        mode="student",
        risk_score=result.risk_score,
        risk_band=result.risk_band,
        warning_level=result.warning_level,
        payload_json=json.dumps(payload),
        contributors_json=json.dumps(result.contributors),
    )
    db.add(entry)
    db.commit()

    return StudentPredictOut(
        risk_score=result.risk_score,
        risk_band=result.risk_band,
        contributors=result.contributors,
        days_to_high_risk=result.days_to_high_risk,
        projected_weekly_risk=result.projected_weekly_risk,
        warning_level=result.warning_level,
        warning_message=result.warning_message,
        recommendations=recs,
    )
