"""
Train burnout risk classifier with SMOTE + XGBoost; save joblib bundle for FastAPI.

Default schema matches the popular **HackerEarth Employee Burnout Challenge** CSV
on Kaggle (column names with spaces). Download from:
https://www.kaggle.com/datasets/redwankarimsony/hackerearth-employee-burnout-challenge

Other usable public options (columns differ — adjust `TARGET_COL` / feature lists in this file):
- https://www.kaggle.com/datasets/khushikyad001/mental-health-and-burnout-in-the-workplace
- https://www.kaggle.com/datasets/anandvashishtha5362/predicting-employee-burnout

Usage (from `backend/`):
  python -m ml.train --synthetic
  python -m ml.train --csv path/to/train.csv
"""

from __future__ import annotations

import argparse
import json
from datetime import date
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from imblearn.over_sampling import SMOTE
from imblearn.pipeline import Pipeline as ImbPipeline
from sklearn.compose import ColumnTransformer
from sklearn.impute import SimpleImputer
from sklearn.metrics import classification_report, f1_score, roc_auc_score
from sklearn.model_selection import train_test_split
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder
from xgboost import XGBClassifier

from ml.schema_cols import CAT_COLS, DATE_COL, NUM_COLS, TARGET_COL
from ml.synthetic import generate_burnout_csv


def _add_tenure_days(df: pd.DataFrame, reference_date: date) -> pd.DataFrame:
    out = df.copy()
    out[DATE_COL] = pd.to_datetime(out[DATE_COL], errors="coerce")
    ref = pd.Timestamp(reference_date)
    out["tenure_days"] = (ref - out[DATE_COL]).dt.days.clip(lower=0)
    return out


def build_pipeline() -> ImbPipeline:
    cat_pipe = Pipeline(
        steps=[
            ("impute", SimpleImputer(strategy="most_frequent")),
            (
                "onehot",
                OneHotEncoder(handle_unknown="ignore", sparse_output=False),
            ),
        ]
    )
    num_pipe = Pipeline(
        steps=[
            ("impute", SimpleImputer(strategy="median")),
        ]
    )

    preprocessor = ColumnTransformer(
        transformers=[
            ("cat", cat_pipe, CAT_COLS),
            ("num", num_pipe, NUM_COLS),
        ],
        remainder="drop",
    )

    clf = XGBClassifier(
        n_estimators=200,
        max_depth=5,
        learning_rate=0.08,
        subsample=0.9,
        colsample_bytree=0.9,
        eval_metric="logloss",
        random_state=42,
        n_jobs=-1,
    )

    return ImbPipeline(
        steps=[
            ("preprocess", preprocessor),
            ("smote", SMOTE(random_state=42)),
            ("clf", clf),
        ]
    )


def train_from_dataframe(df: pd.DataFrame, burn_threshold: float = 0.5) -> tuple:
    df = df.dropna(subset=[TARGET_COL])
    reference_date = pd.to_datetime(df[DATE_COL], errors="coerce").max()
    if pd.isna(reference_date):
        reference_date = pd.Timestamp(date.today())
    reference_date = reference_date.date()

    df = _add_tenure_days(df, reference_date)
    df = df.dropna(subset=NUM_COLS + CAT_COLS)

    y = (df[TARGET_COL].astype(float) >= burn_threshold).astype(int)
    X = df[CAT_COLS + NUM_COLS]

    stratify = y if len(np.unique(y)) > 1 else None
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=42, stratify=stratify
    )

    pipe = build_pipeline()
    pipe.fit(X_train, y_train)

    proba = pipe.predict_proba(X_test)[:, 1]
    pred = (proba >= 0.5).astype(int)

    metrics = {
        "f1": float(f1_score(y_test, pred, zero_division=0)),
        "roc_auc": float(roc_auc_score(y_test, proba))
        if len(np.unique(y_test)) > 1
        else None,
        "report": classification_report(y_test, pred, zero_division=0),
        "positive_rate_train": float(y_train.mean()),
        "positive_rate_test": float(y_test.mean()),
    }

    meta = {
        "target_col": TARGET_COL,
        "date_col": DATE_COL,
        "cat_cols": CAT_COLS,
        "num_cols": NUM_COLS,
        "reference_date": reference_date.isoformat(),
        "burn_threshold": burn_threshold,
        "positive_class_label": "high_burnout_risk",
        "metrics": metrics,
    }

    bundle = {"pipeline": pipe, "meta": meta}
    return bundle, metrics


def main() -> None:
    parser = argparse.ArgumentParser(description="Train burnout model")
    parser.add_argument("--csv", type=Path, help="Training CSV path")
    parser.add_argument(
        "--synthetic",
        action="store_true",
        help="Generate synthetic CSV (HackerEarth-like columns) and train",
    )
    parser.add_argument(
        "--out",
        type=Path,
        default=Path(__file__).resolve().parent / "artifacts" / "burnout_model.joblib",
        help="Output joblib path",
    )
    parser.add_argument(
        "--threshold",
        type=float,
        default=0.5,
        help="Burn rate threshold for binary positive class",
    )
    args = parser.parse_args()

    if args.synthetic:
        df = generate_burnout_csv()
    elif args.csv:
        df = pd.read_csv(args.csv)
    else:
        raise SystemExit("Provide --csv PATH or --synthetic")

    bundle, metrics = train_from_dataframe(df, burn_threshold=args.threshold)
    args.out.parent.mkdir(parents=True, exist_ok=True)
    joblib.dump(bundle, args.out)

    meta_path = args.out.with_suffix(".meta.json")
    meta_path.write_text(
        json.dumps(bundle["meta"], indent=2, default=str), encoding="utf-8"
    )

    print("Saved:", args.out)
    print("Meta:", meta_path)
    print("F1:", metrics["f1"], "ROC-AUC:", metrics["roc_auc"])
    print(metrics["report"])


if __name__ == "__main__":
    main()
