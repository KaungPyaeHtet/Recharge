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

    return BurnoutPrediction(
        risk_score=round(proba, 4),
        risk_band=band,
        contributors=contributors,
    )
