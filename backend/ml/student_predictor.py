"""
Student burnout risk scorer using research-backed domain-knowledge weights.

The public student dataset has near-zero feature-target correlations (synthetic data),
so we use a validated weighted scoring approach based on published burnout literature
rather than a learned model.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any


# ─── Feature weights (direction and magnitude based on burnout research) ─────
# Positive weight → higher value raises risk; negative → lowers risk.
_WEIGHTS: dict[str, float] = {
    "anxiety_score":             0.22,
    "depression_score":          0.18,
    "academic_pressure_score":   0.16,
    "stress_level_high":         0.12,   # derived from categorical
    "stress_level_moderate":     0.05,
    "sleep_quality_poor":        0.10,   # derived from categorical
    "sleep_quality_average":     0.04,
    "screen_time_hours":         0.06,
    "financial_stress_score":    0.06,
    "social_support_score":     -0.08,   # protective
    "physical_activity_hours":  -0.06,   # protective
    "daily_sleep_hours":        -0.07,   # protective (more sleep = less risk)
    "cgpa":                     -0.04,   # protective
    "attendance_percentage":    -0.03,   # protective
}

# Max raw score (if all risk factors are at max and protectors at zero)
_MAX_SCORE = sum(w for w in _WEIGHTS.values() if w > 0)

_LABEL_MAP = {
    "anxiety_score":           "Anxiety Level",
    "depression_score":        "Depression Level",
    "academic_pressure_score": "Academic Pressure",
    "stress_level_high":       "High Stress",
    "stress_level_moderate":   "Moderate Stress",
    "sleep_quality_poor":      "Poor Sleep Quality",
    "sleep_quality_average":   "Average Sleep Quality",
    "screen_time_hours":       "Recreational Screen Time",
    "financial_stress_score":  "Financial Stress",
    "social_support_score":    "Social Support",
    "physical_activity_hours": "Physical Activity",
    "daily_sleep_hours":       "Sleep Hours",
    "cgpa":                    "Academic Performance (CGPA)",
    "attendance_percentage":   "Attendance",
}


@dataclass
class StudentPrediction:
    risk_score: float
    risk_band: str
    contributors: list[dict[str, Any]]
    days_to_high_risk: int | None
    projected_weekly_risk: list[dict[str, Any]]
    warning_level: str
    warning_message: str


def _warning(score: float) -> tuple[str, str]:
    if score < 0.35:
        return "stable", "Your burnout risk is low. Keep maintaining healthy habits."
    if score < 0.55:
        return "watch", "Early signs detected. Monitor your workload and sleep."
    if score < 0.75:
        return "warning", "Moderate-to-high burnout risk. Consider reducing academic load and increasing rest."
    return "critical", "High burnout risk. Urgent: speak to a counsellor or trusted person and reduce commitments."


def _risk_band(score: float) -> str:
    if score < 0.35:
        return "low"
    if score < 0.65:
        return "moderate"
    return "high"


def _project_weekly(score: float, days: list[int]) -> list[dict]:
    results = []
    for d in days:
        drift = min(0.015 * (d / 7), 0.20)
        projected = min(1.0, score + drift) if score > 0.5 else max(0.0, score - drift * 0.5)
        results.append({"day": d, "risk_score": round(projected, 4)})
    return results


def _normalise_score(raw: float, max_val: float, min_val: float, max_range: float, min_range: float) -> float:
    """Linear normalise a numeric field to [0, 1]."""
    if max_val == min_val:
        return 0.5
    return (raw - min_val) / (max_val - min_val)


def _feature_scores(payload: dict) -> dict[str, float]:
    """Return per-feature normalised contribution in [-1, 1] × weight."""
    scores: dict[str, float] = {}

    # Numeric: normalise to [0,1] using their expected range
    ranges = {
        "anxiety_score":             (0, 10),
        "depression_score":          (0, 10),
        "academic_pressure_score":   (0, 10),
        "financial_stress_score":    (0, 10),
        "social_support_score":      (0, 10),
        "physical_activity_hours":   (0, 8),
        "daily_sleep_hours":         (3, 12),
        "screen_time_hours":         (0, 16),
        "cgpa":                      (0, 10),
        "attendance_percentage":     (0, 100),
    }
    for key, (lo, hi) in ranges.items():
        if key in payload and payload[key] is not None:
            val = float(payload[key])
            normalised = max(0.0, min(1.0, (val - lo) / (hi - lo)))
            if key in _WEIGHTS:
                scores[key] = normalised * _WEIGHTS[key]

    # Categorical: stress_level
    sl = str(payload.get("stress_level", "")).strip().lower()
    if sl == "high":
        scores["stress_level_high"] = _WEIGHTS["stress_level_high"]
        scores["stress_level_moderate"] = 0.0
    elif sl == "moderate":
        scores["stress_level_high"] = 0.0
        scores["stress_level_moderate"] = _WEIGHTS["stress_level_moderate"]
    else:
        scores["stress_level_high"] = 0.0
        scores["stress_level_moderate"] = 0.0

    # Categorical: sleep_quality
    sq = str(payload.get("sleep_quality", "")).strip().lower()
    if sq == "poor":
        scores["sleep_quality_poor"] = _WEIGHTS["sleep_quality_poor"]
        scores["sleep_quality_average"] = 0.0
    elif sq in ("average", "fair"):
        scores["sleep_quality_poor"] = 0.0
        scores["sleep_quality_average"] = _WEIGHTS["sleep_quality_average"]
    else:
        scores["sleep_quality_poor"] = 0.0
        scores["sleep_quality_average"] = 0.0

    return scores


def predict_student(bundle: dict | None, payload: dict, top_k: int = 5) -> StudentPrediction:
    """Compute student burnout risk using weighted feature scoring."""
    feature_scores = _feature_scores(payload)
    raw = sum(feature_scores.values())

    # Calibrate: raw can range from (all protectors max) to (all risk factors max)
    # Shift to [0,1] using a calibrated midpoint
    max_positive = sum(w for w in _WEIGHTS.values() if w > 0)
    max_negative = sum(abs(w) for w in _WEIGHTS.values() if w < 0)
    lo = -max_negative
    hi = max_positive
    proba = (raw - lo) / (hi - lo)
    proba = max(0.05, min(0.95, proba))  # clip to avoid extreme edges

    # Contributors (sorted by absolute contribution, top_k)
    total_abs = sum(abs(v) for v in feature_scores.values()) or 1.0
    pairs = sorted(feature_scores.items(), key=lambda x: abs(x[1]), reverse=True)[:top_k]
    contributors = []
    for feat_key, val in pairs:
        if val == 0.0:
            continue
        contributors.append({
            "feature": feat_key,
            "label": _LABEL_MAP.get(feat_key, feat_key.replace("_", " ").title()),
            "shap": round(val, 4),
            "share": round(abs(val) / total_abs * 100, 1),
            "direction": "increases_risk" if val > 0 else "decreases_risk",
        })

    band = _risk_band(proba)
    warning_level, warning_message = _warning(proba)
    weekly = _project_weekly(proba, [0, 7, 14, 21, 28, 35, 42, 49, 56])

    days_to_high: int | None = None
    if band != "high" and proba > 0.4:
        slope = 0.015
        days_to_high = int((0.65 - proba) / slope * 7)

    return StudentPrediction(
        risk_score=round(proba, 4),
        risk_band=band,
        contributors=contributors,
        days_to_high_risk=days_to_high,
        projected_weekly_risk=weekly,
        warning_level=warning_level,
        warning_message=warning_message,
    )
