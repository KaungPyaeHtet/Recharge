from __future__ import annotations

import json
import math
import uuid
from datetime import date, datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from .auth import get_current_user
from .burnout import BurnoutPredictIn, BurnoutPredictOut, get_bundle
from .recommendations import get_recommendations
from .daily_nlp import match_hobbies, polarity_from_text, user_polarity_numeric
from .database import get_db
from .models import AssessmentResult, DailyActivityLog, Hobby
from ml.predictor import predict_with_shap

router = APIRouter(prefix="/api/wellness", tags=["wellness"])


class HobbyCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)


class HobbyOut(BaseModel):
    id: str
    name: str


class LogCreate(BaseModel):
    text: str = Field(min_length=1, max_length=2000)
    polarity: str | None = Field(
        default=None,
        description="Optional: plus | minus | neutral -- blends with NLP",
    )
    log_date: date | None = None


class LogOut(BaseModel):
    id: str
    log_date: date
    raw_text: str
    user_polarity: str | None
    nlp_polarity: float
    blended_polarity: float
    matched_hobby_ids: str | None


class DailySignals(BaseModel):
    """Structured answers from the daily check-in questions."""
    energy: str = ""    # Great | Good | Low | Drained
    sleep: str = ""     # Refreshing | Okay | Restless | Very poor
    stress: str = ""    # Calm | Mild | High | Overwhelming
    breaks: str = ""    # Several | One or two | Barely | None


# Deltas applied directly to ML inputs per answer
_ENERGY_FATIGUE: dict[str, float] = {
    "Great": -1.5, "Good": -0.5, "Low": 1.5, "Drained": 3.0,
}
_SLEEP_FATIGUE: dict[str, float] = {
    "Refreshing": -1.0, "Okay": 0.0, "Restless": 1.0, "Very poor": 2.0,
}
_STRESS_FATIGUE: dict[str, float] = {
    "Calm": -1.0, "Mild": 0.0, "High": 1.5, "Overwhelming": 3.0,
}
_BREAKS_RESOURCE: dict[str, float] = {
    "Several": -2.0, "One or two": -0.5, "Barely": 1.5, "None": 3.0,
}


def _apply_daily_signals(
    fatigue: float,
    resource: float,
    signals: DailySignals | None,
) -> tuple[float, float, float, float, list[str]]:
    """Return (adj_fatigue, adj_resource, fatigue_delta, resource_delta, notes)."""
    if not signals:
        return fatigue, resource, 0.0, 0.0, []
    fd = (
        _ENERGY_FATIGUE.get(signals.energy, 0.0)
        + _SLEEP_FATIGUE.get(signals.sleep, 0.0)
        + _STRESS_FATIGUE.get(signals.stress, 0.0)
    )
    rd = _BREAKS_RESOURCE.get(signals.breaks, 0.0)
    adj_f = max(0.0, min(10.0, fatigue + fd))
    adj_r = max(0.0, min(20.0, resource + rd))
    notes: list[str] = []
    if signals.energy in ("Low", "Drained"):
        notes.append(f"Low energy ({signals.energy}) raised fatigue estimate.")
    elif signals.energy in ("Great", "Good"):
        notes.append(f"Good energy ({signals.energy}) lowered fatigue estimate.")
    if signals.sleep in ("Restless", "Very poor"):
        notes.append(f"Poor sleep ({signals.sleep}) raised fatigue estimate.")
    if signals.stress in ("High", "Overwhelming"):
        notes.append(f"High stress ({signals.stress}) raised fatigue estimate.")
    if signals.breaks in ("Barely", "None"):
        notes.append(f"Few breaks ({signals.breaks}) raised workload estimate.")
    elif signals.breaks in ("Several", "One or two"):
        notes.append(f"Good break habits ({signals.breaks}) lowered workload estimate.")
    return adj_f, adj_r, fd, rd, notes


class BurnoutPreviewIn(BaseModel):
    work_profile: BurnoutPredictIn
    lookback_days: int = Field(default=14, ge=1, le=90)
    daily_signals: DailySignals | None = None


class BurnoutPreviewOut(BurnoutPredictOut):
    mental_fatigue_base: float
    mental_fatigue_adjusted: float
    resource_allocation_adjusted: float
    daily_signal_summary: str
    daily_signal_notes: list[str]
    habit_insights: list[str]
    logs_used: int


def _uid(user: dict) -> uuid.UUID:
    return uuid.UUID(user["id"])


@router.post("/hobbies", response_model=HobbyOut)
def create_hobby(
    body: HobbyCreate,
    user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> HobbyOut:
    uid = _uid(user)
    name = body.name.strip()
    hobby = Hobby(user_id=uid, name=name)
    db.add(hobby)
    db.commit()
    db.refresh(hobby)
    return HobbyOut(id=str(hobby.id), name=hobby.name)


@router.get("/hobbies", response_model=list[HobbyOut])
def list_hobbies(
    user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[HobbyOut]:
    uid = _uid(user)
    rows = db.scalars(select(Hobby).where(Hobby.user_id == uid).order_by(Hobby.created_at)).all()
    return [HobbyOut(id=str(h.id), name=h.name) for h in rows]


@router.delete("/hobbies/{hobby_id}", response_class=Response)
def delete_hobby(
    hobby_id: str,
    user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Response:
    uid = _uid(user)
    try:
        hid = uuid.UUID(hobby_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail="Invalid hobby id") from e
    hobby = db.get(Hobby, hid)
    if not hobby or hobby.user_id != uid:
        raise HTTPException(status_code=404, detail="Hobby not found")
    db.delete(hobby)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/logs", response_model=LogOut)
def create_log(
    body: LogCreate,
    user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> LogOut:
    uid = _uid(user)
    log_day = body.log_date or date.today()
    nlp = polarity_from_text(body.text)
    up = user_polarity_numeric(body.polarity)
    if up is None:
        blended = nlp
    else:
        blended = max(-1.0, min(1.0, 0.45 * up + 0.55 * nlp))

    hobbies = db.scalars(select(Hobby).where(Hobby.user_id == uid)).all()
    pairs = [(str(h.id), h.name) for h in hobbies]
    matches = match_hobbies(body.text, pairs)
    matched_ids = ",".join(m.hobby_id for m in matches) if matches else None

    entry = DailyActivityLog(
        user_id=uid,
        log_date=log_day,
        raw_text=body.text.strip(),
        user_polarity=(body.polarity.strip().lower() if body.polarity else None),
        nlp_polarity=nlp,
        blended_polarity=blended,
        matched_hobby_ids=matched_ids,
    )
    db.add(entry)
    db.commit()
    db.refresh(entry)
    return LogOut(
        id=str(entry.id),
        log_date=entry.log_date,
        raw_text=entry.raw_text,
        user_polarity=entry.user_polarity,
        nlp_polarity=entry.nlp_polarity,
        blended_polarity=entry.blended_polarity,
        matched_hobby_ids=entry.matched_hobby_ids,
    )


class LogUpdate(BaseModel):
    text: str = Field(min_length=1, max_length=2000)
    polarity: str | None = None


@router.patch("/logs/{log_id}", response_model=LogOut)
def update_log(
    log_id: str,
    body: LogUpdate,
    user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> LogOut:
    uid = _uid(user)
    try:
        lid = uuid.UUID(log_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail="Invalid log id") from e
    entry = db.get(DailyActivityLog, lid)
    if not entry or entry.user_id != uid:
        raise HTTPException(status_code=404, detail="Log not found")

    nlp = polarity_from_text(body.text)
    up = user_polarity_numeric(body.polarity)
    blended = nlp if up is None else max(-1.0, min(1.0, 0.45 * up + 0.55 * nlp))

    hobbies = db.scalars(select(Hobby).where(Hobby.user_id == uid)).all()
    pairs = [(str(h.id), h.name) for h in hobbies]
    matches = match_hobbies(body.text, pairs)
    matched_ids = ",".join(m.hobby_id for m in matches) if matches else None

    entry.raw_text = body.text.strip()
    entry.user_polarity = body.polarity.strip().lower() if body.polarity else None
    entry.nlp_polarity = nlp
    entry.blended_polarity = blended
    entry.matched_hobby_ids = matched_ids
    db.commit()
    db.refresh(entry)
    return LogOut(
        id=str(entry.id),
        log_date=entry.log_date,
        raw_text=entry.raw_text,
        user_polarity=entry.user_polarity,
        nlp_polarity=entry.nlp_polarity,
        blended_polarity=entry.blended_polarity,
        matched_hobby_ids=entry.matched_hobby_ids,
    )


@router.get("/logs", response_model=list[LogOut])
def list_logs(
    days: int = Query(default=30, ge=1, le=365),
    user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[LogOut]:
    uid = _uid(user)
    since = date.today() - timedelta(days=days)
    rows = db.scalars(
        select(DailyActivityLog)
        .where(DailyActivityLog.user_id == uid, DailyActivityLog.log_date >= since)
        .order_by(DailyActivityLog.log_date.desc(), DailyActivityLog.created_at.desc())
    ).all()
    return [
        LogOut(
            id=str(r.id),
            log_date=r.log_date,
            raw_text=r.raw_text,
            user_polarity=r.user_polarity,
            nlp_polarity=r.nlp_polarity,
            blended_polarity=r.blended_polarity,
            matched_hobby_ids=r.matched_hobby_ids,
        )
        for r in rows
    ]


def _aggregated_daily_signal(logs: list[DailyActivityLog], end_date: date) -> tuple[float, str]:
    if not logs:
        return 0.0, "No daily logs in this window -- add check-ins for habit-aware adjustment."
    num = 0.0
    den = 0.0
    for log in logs:
        days_ago = max(0, (end_date - log.log_date).days)
        w = math.exp(-days_ago / 7.0)
        num += w * log.blended_polarity
        den += w
    agg = num / den if den else 0.0
    if agg > 0.15:
        summary = "Recent check-ins skew positive -- model fatigue is adjusted slightly downward."
    elif agg < -0.15:
        summary = "Recent check-ins skew negative -- model fatigue is adjusted upward."
    else:
        summary = "Recent check-ins are mixed or neutral -- small fatigue adjustment from daily text."
    return max(-1.0, min(1.0, agg)), summary


@router.post("/burnout-preview", response_model=BurnoutPreviewOut)
def burnout_preview(
    body: BurnoutPreviewIn,
    user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> BurnoutPreviewOut:
    uid = _uid(user)
    bundle = get_bundle()
    profile = body.work_profile.model_dump()
    base_fatigue = float(profile["mental_fatigue_score"])
    base_resource = float(profile["resource_allocation"])

    # ── Step 1: Apply structured daily signals directly to ML inputs ──────────
    (sig_fatigue, sig_resource, _fd, _rd, signal_notes) = _apply_daily_signals(
        base_fatigue, base_resource, body.daily_signals
    )

    # ── Step 2: Apply NLP log signal on top ───────────────────────────────────
    since = date.today() - timedelta(days=body.lookback_days)
    logs = list(
        db.scalars(
            select(DailyActivityLog).where(
                DailyActivityLog.user_id == uid,
                DailyActivityLog.log_date >= since,
            )
        ).all()
    )

    agg, summary = _aggregated_daily_signal(logs, date.today())
    nlp_fatigue_delta = -1.25 * agg
    adj_fatigue = max(0.0, min(10.0, sig_fatigue + nlp_fatigue_delta))
    adj_resource = sig_resource  # resource only adjusted by daily signals

    profile_adj = {**profile, "mental_fatigue_score": adj_fatigue, "resource_allocation": adj_resource}

    result = predict_with_shap(bundle, profile_adj)
    recs = get_recommendations("professional", result.risk_band, result.contributors)

    # ── One assessment per calendar day -- upsert ──────────────────────────────
    today_start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    today_end = today_start + timedelta(days=1)
    existing = db.scalars(
        select(AssessmentResult).where(
            AssessmentResult.user_id == uid,
            AssessmentResult.created_at >= today_start,
            AssessmentResult.created_at < today_end,
        )
    ).first()
    if existing:
        existing.risk_score = result.risk_score
        existing.risk_band = result.risk_band
        existing.warning_level = result.warning_level
        existing.payload_json = json.dumps(profile_adj)
        existing.contributors_json = json.dumps(result.contributors)
    else:
        db.add(AssessmentResult(
            user_id=uid,
            mode="professional",
            risk_score=result.risk_score,
            risk_band=result.risk_band,
            warning_level=result.warning_level,
            payload_json=json.dumps(profile_adj),
            contributors_json=json.dumps(result.contributors),
        ))
    db.commit()

    hobbies = db.scalars(select(Hobby).where(Hobby.user_id == uid)).all()
    habit_insights: list[str] = []
    window_days = min(7, body.lookback_days)
    recent_since = date.today() - timedelta(days=window_days)
    recent_logs = [lg for lg in logs if lg.log_date >= recent_since]
    recent_blob = " ".join(lg.raw_text.lower() for lg in recent_logs)
    for h in hobbies:
        key_name = h.name.strip().lower()
        if len(key_name) < 2:
            continue
        mentioned = key_name in recent_blob
        ids_in_window = {lg.matched_hobby_ids or "" for lg in recent_logs}
        id_hit = any(str(h.id) in (mid or "") for mid in ids_in_window)
        if not mentioned and not id_hit:
            habit_insights.append(
                f'No mention of "{h.name}" in the last {window_days} days - '
                "habit slip can track with rising fatigue; plan one small session."
            )
    if not hobbies and logs:
        habit_insights.append(
            "Add hobbies you care about under Wellness -- we'll flag when they disappear from your notes."
        )
    if agg < -0.35 and not habit_insights:
        habit_insights.append(
            "Strong negative pattern in your notes -- consider workload boundaries and recovery blocks."
        )

    return BurnoutPreviewOut(
        risk_score=result.risk_score,
        risk_band=result.risk_band,
        contributors=result.contributors,
        days_to_high_risk=result.days_to_high_risk,
        projected_weekly_risk=result.projected_weekly_risk,
        warning_level=result.warning_level,
        warning_message=result.warning_message,
        disclaimer="Educational wellness screening only -- not a medical diagnosis.",
        mental_fatigue_base=base_fatigue,
        mental_fatigue_adjusted=adj_fatigue,
        resource_allocation_adjusted=adj_resource,
        daily_signal_summary=summary,
        daily_signal_notes=signal_notes,
        habit_insights=habit_insights,
        logs_used=len(logs),
        recommendations=recs,
    )
