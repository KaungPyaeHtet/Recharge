"""Load trained bundle, run prediction + SHAP explanations."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from pathlib import Path
from typing import Any

import joblib
import numpy as np
import pandas as pd
import shap

from ml.schema_cols import CAT_COLS, NUM_COLS


@dataclass
class BurnoutPrediction:
    risk_score: float
    risk_band: str
    contributors: list[dict[str, Any]]
    days_to_high_risk: int | None
    projected_weekly_risk: list[dict[str, float | int]]
    warning_level: str
    warning_message: str


def _humanize_feature(name: str) -> str:
    mapping = {
        "Designation": "Designation level",
        "Resource Allocation": "Resource allocation",
        "Mental Fatigue Score": "Mental fatigue",
        "tenure_days": "Tenure (days)",
    }
    if name in mapping:
        return mapping[name]
    if "Gender" in name or "Company Type" in name or "WFH" in name:
        return name.replace("_", " ").replace("  ", " ").strip()
    return name.replace("num__", "").replace("cat__", "").replace("_", " ")


def load_bundle(path: Path) -> dict:
    return joblib.load(path)


def row_from_payload(
    payload: dict,
    reference_date: date,
) -> pd.DataFrame:
    join = pd.to_datetime(payload["date_of_joining"]).date()
    tenure_days = max(0, (reference_date - join).days)
    row = {
        "Gender": payload["gender"],
        "Company Type": payload["company_type"],
        "WFH Setup Available": payload["wfh_setup_available"],
        "Designation": int(payload["designation"]),
        "Resource Allocation": float(payload["resource_allocation"]),
        "Mental Fatigue Score": float(payload["mental_fatigue_score"]),
        "tenure_days": float(tenure_days),
    }
    return pd.DataFrame([row], columns=CAT_COLS + NUM_COLS)


def predict_with_shap(
    bundle: dict,
    payload: dict,
    top_k: int = 5,
) -> BurnoutPrediction:
    meta = bundle["meta"]
    pipe = bundle["pipeline"]
    reference_date = date.fromisoformat(meta["reference_date"])

    X = row_from_payload(payload, reference_date=reference_date)

    preprocess = pipe.named_steps["preprocess"]
    clf = pipe.named_steps["clf"]

    Xt = preprocess.transform(X)
    proba = float(pipe.predict_proba(X)[0, 1])

    if proba < 0.35:
        band = "low"
    elif proba < 0.65:
        band = "moderate"
    else:
        band = "high"

    feature_names = preprocess.get_feature_names_out()
    explainer = shap.TreeExplainer(clf)
    sv = explainer.shap_values(Xt)
    if isinstance(sv, list):
        sv = np.asarray(sv[-1])
    else:
        sv = np.asarray(sv)
    if sv.ndim == 3:
        sv = sv[0, :, 1]
    elif sv.ndim == 2:
        sv = sv[0]
    else:
        sv = sv.reshape(-1)
    sv = np.asarray(sv).reshape(-1)

    order = np.argsort(np.abs(sv))[::-1][:top_k]
    total = float(np.sum(np.abs(sv))) or 1.0
    contributors: list[dict[str, Any]] = []
    for i in order:
        name = str(feature_names[i])
        raw = float(sv[i])
        contributors.append(
            {
                "feature": name,
                "label": _humanize_feature(name),
                "shap": raw,
                "share": round(100.0 * abs(raw) / total, 1),
                "direction": "increases_risk" if raw > 0 else "decreases_risk",
            }
        )

    days_to_high_risk, projected_weekly_risk = _project_risk_curve(
        bundle=bundle,
        payload=payload,
        reference_date=reference_date,
    )
    warning_level, warning_message = _warning_from_projection(
        current_risk=proba,
        days_to_high_risk=days_to_high_risk,
    )

    return BurnoutPrediction(
        risk_score=round(proba, 4),
        risk_band=band,
        contributors=contributors,
        days_to_high_risk=days_to_high_risk,
        projected_weekly_risk=projected_weekly_risk,
        warning_level=warning_level,
        warning_message=warning_message,
    )


def _project_risk_curve(
    bundle: dict,
    payload: dict,
    reference_date: date,
    horizon_days: int = 56,
    step_days: int = 7,
    target_high_risk: float = 0.65,
) -> tuple[int | None, list[dict[str, float | int]]]:
    """Build a simple near-term forecast by increasing fatigue and workload over time."""
    pipe = bundle["pipeline"]
    baseline_fatigue = float(payload["mental_fatigue_score"])
    baseline_alloc = float(payload["resource_allocation"])
    baseline_designation = float(payload["designation"])
    join_date = pd.to_datetime(payload["date_of_joining"]).date()

    first_day_cross: int | None = None
    forecast: list[dict[str, float | int]] = []
    for days_ahead in range(0, horizon_days + step_days, step_days):
        fatigue_trend = min(10.0, baseline_fatigue + (days_ahead / 7.0) * 0.25)
        allocation_trend = min(20.0, baseline_alloc + (days_ahead / 7.0) * 0.10)
        # A small tenure-adjusted pressure factor (higher seniority tends to absorb less increase).
        designation_relief = max(0.85, 1.0 - (baseline_designation * 0.01))
        fatigue_trend = min(10.0, fatigue_trend * designation_relief)

        row_payload = {
            **payload,
            "date_of_joining": join_date.isoformat(),
            "mental_fatigue_score": fatigue_trend,
            "resource_allocation": allocation_trend,
        }
        X_step = row_from_payload(
            row_payload,
            reference_date=reference_date
            if days_ahead == 0
            else date.fromordinal(reference_date.toordinal() + days_ahead),
        )
        step_risk = float(pipe.predict_proba(X_step)[0, 1])
        forecast.append({"day": days_ahead, "risk_score": round(step_risk, 4)})

        if first_day_cross is None and step_risk >= target_high_risk:
            first_day_cross = days_ahead

    return first_day_cross, forecast


def _warning_from_projection(
    current_risk: float,
    days_to_high_risk: int | None,
) -> tuple[str, str]:
    if current_risk >= 0.65:
        return "critical", "High burnout risk now. Trigger immediate support and workload reduction."
    if days_to_high_risk is not None and days_to_high_risk <= 14:
        return "warning", "Burnout risk is projected to become high within 2 weeks."
    if days_to_high_risk is not None and days_to_high_risk <= 28:
        return "watch", "Burnout risk trend is rising and may become high this month."
    return "stable", "No near-term high-risk signal. Keep monitoring weekly."
