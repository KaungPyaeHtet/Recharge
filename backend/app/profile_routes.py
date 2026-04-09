"""User work-profile endpoints — stores friendly survey answers once per user."""
from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from .auth import get_current_user
from .database import get_db
from .models import UserProfile

router = APIRouter(prefix="/api/profile", tags=["profile"])


class ProfileIn(BaseModel):
    date_of_joining: str
    gender: str
    company_type: str
    wfh_setup_available: str
    role_level: str
    hours_per_day: str
    evening_work: str
    projects_count: str
    end_of_day: str
    switch_off: str
    sleep_worries: str
    exercise: str


class ProfileOut(ProfileIn):
    pass


def _row_to_out(p: UserProfile) -> ProfileOut:
    return ProfileOut(
        date_of_joining=p.date_of_joining,
        gender=p.gender,
        company_type=p.company_type,
        wfh_setup_available=p.wfh_setup_available,
        role_level=p.role_level,
        hours_per_day=p.hours_per_day,
        evening_work=p.evening_work,
        projects_count=p.projects_count,
        end_of_day=p.end_of_day,
        switch_off=p.switch_off,
        sleep_worries=p.sleep_worries,
        exercise=p.exercise,
    )


@router.get("", response_model=ProfileOut)
def get_profile(
    user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ProfileOut:
    uid = uuid.UUID(user["id"])
    p = db.scalars(select(UserProfile).where(UserProfile.user_id == uid)).first()
    if not p:
        raise HTTPException(status_code=404, detail="No profile yet")
    return _row_to_out(p)


@router.put("", response_model=ProfileOut)
def upsert_profile(
    body: ProfileIn,
    user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ProfileOut:
    uid = uuid.UUID(user["id"])
    p = db.scalars(select(UserProfile).where(UserProfile.user_id == uid)).first()
    data = body.model_dump()
    if p:
        for k, v in data.items():
            setattr(p, k, v)
    else:
        p = UserProfile(user_id=uid, **data)
        db.add(p)
    db.commit()
    db.refresh(p)
    return _row_to_out(p)
