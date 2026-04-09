"""
Map heterogeneous burnout CSVs (e.g. HackerEarth, Mental Health & Burnout Kaggle)
into the internal schema expected by ml.train / predictor.

Kaggle (mental health): https://www.kaggle.com/datasets/khushikyad001/mental-health-and-burnout-in-the-workplace
"""

from __future__ import annotations

import re
from typing import Iterable

import pandas as pd

from ml.schema_cols import CAT_COLS, DATE_COL, TARGET_COL

# Numeric columns present in CSVs (tenure_days is derived in training)
_CSV_NUM_COLS = ["Designation", "Resource Allocation", "Mental Fatigue Score"]

# Canonical internal names after normalization (used by train_from_dataframe before tenure)
INTERNAL_COLS = [TARGET_COL, DATE_COL, *CAT_COLS, *_CSV_NUM_COLS]

_ALIASES: dict[str, list[str]] = {
    TARGET_COL: [
        "Burn Rate",
        "BurnRate",
        "burn_rate",
        "BurnoutLevel",
        "burnout_level",
        "burnout",
        "Burnout",
    ],
    DATE_COL: [
        "Date of Joining",
        "DateOfJoining",
        "date_of_joining",
        "JoinDate",
        "JoiningDate",
        "start_date",
        "Start Date",
    ],
    "Gender": ["Gender", "gender", "Sex", "sex"],
    "Company Type": [
        "Company Type",
        "CompanyType",
        "company_type",
        "OrganizationType",
    ],
    "WFH Setup Available": [
        "WFH Setup Available",
        "WFH",
        "wfh_setup_available",
        "Work From Home",
        "RemoteWork",
        "remote",
    ],
    "Designation": ["Designation", "designation", "JobLevel", "job_level", "Level"],
    "Resource Allocation": [
        "Resource Allocation",
        "ResourceAllocation",
        "resource_allocation",
        "Workload",
        "workload",
        "HoursAllocated",
    ],
    "Mental Fatigue Score": [
        "Mental Fatigue Score",
        "MentalFatigueScore",
        "mental_fatigue_score",
        "Mental Fatigue",
        "FatigueScore",
        "fatigue",
    ],
}


def _norm_key(name: str) -> str:
    return re.sub(r"[^a-z0-9]", "", name.lower())


def _build_lookup(df: pd.DataFrame) -> dict[str, str]:
    return {_norm_key(c): c for c in df.columns}


def _resolve_column(df: pd.DataFrame, canonical: str, aliases: Iterable[str]) -> str | None:
    lu = _build_lookup(df)
    for alias in aliases:
        k = _norm_key(alias)
        if k in lu:
            return lu[k]
    return None


def normalize_to_training_schema(
    df: pd.DataFrame,
    *,
    default_gender: str = "Unknown",
) -> pd.DataFrame:
    """Rename / coerce columns to HackerEarth-style names used by the pipeline."""
    out = df.copy()
    rename_map: dict[str, str] = {}
    for canonical, aliases in _ALIASES.items():
        src = _resolve_column(out, canonical, aliases)
        if src and src != canonical:
            rename_map[src] = canonical
    out = out.rename(columns=rename_map)

    missing = [c for c in INTERNAL_COLS if c not in out.columns]
    if missing:
        raise ValueError(
            "Could not map required columns after normalization. "
            f"Missing: {missing}. Present columns: {list(df.columns)}"
        )

    if "Gender" not in out.columns or out["Gender"].isna().all():
        out["Gender"] = default_gender
    out["Gender"] = out["Gender"].fillna(default_gender).astype(str)

    for col in ("Company Type", "WFH Setup Available"):
        out[col] = out[col].fillna("Unknown").astype(str)

    for col in ("Designation", "Resource Allocation", "Mental Fatigue Score", TARGET_COL):
        out[col] = pd.to_numeric(out[col], errors="coerce")

    out[DATE_COL] = pd.to_datetime(out[DATE_COL], errors="coerce")

    # If target is e.g. Likert 1–5 or 0–100, scale to 0–1 so default threshold 0.5 stays meaningful
    target = out[TARGET_COL]
    if target.notna().any():
        hi = float(target.max())
        lo = float(target.min())
        if hi > 1.0 and hi > lo:
            out[TARGET_COL] = (target - lo) / (hi - lo)

    return out[INTERNAL_COLS]


def detect_format(df: pd.DataFrame) -> str:
    """Return 'ready' if already canonical, else 'alias' if normalizable."""
    if all(c in df.columns for c in INTERNAL_COLS):
        return "ready"
    if _resolve_column(df, TARGET_COL, _ALIASES[TARGET_COL]):
        return "alias"
    return "unknown"
