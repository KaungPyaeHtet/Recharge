"""
Train burnout risk classifier on the Student Mental Health Burnout dataset.

Usage (from backend/):
    python -m ml.student_train --csv ../../student_mental_health_burnout.csv
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.impute import SimpleImputer
from sklearn.metrics import classification_report, f1_score, roc_auc_score
from sklearn.model_selection import train_test_split
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler
from xgboost import XGBClassifier

from ml.student_schema_cols import CAT_COLS, NUM_COLS, TARGET_COL


def build_student_pipeline(scale_pos_weight: float = 2.0) -> Pipeline:
    cat_pipe = Pipeline([
        ("impute", SimpleImputer(strategy="most_frequent")),
        ("onehot", OneHotEncoder(handle_unknown="ignore", sparse_output=False)),
    ])
    num_pipe = Pipeline([
        ("impute", SimpleImputer(strategy="median")),
        ("scale", StandardScaler()),
    ])
    preprocessor = ColumnTransformer([
        ("cat", cat_pipe, CAT_COLS),
        ("num", num_pipe, NUM_COLS),
    ], remainder="drop")

    clf = XGBClassifier(
        n_estimators=300,
        max_depth=6,
        learning_rate=0.05,
        subsample=0.8,
        colsample_bytree=0.8,
        min_child_weight=3,
        scale_pos_weight=scale_pos_weight,
        eval_metric="logloss",
        random_state=42,
        n_jobs=-1,
    )
    return Pipeline([
        ("preprocess", preprocessor),
        ("clf", clf),
    ])


def train_student(csv_path: Path, out_path: Path) -> None:
    df = pd.read_csv(csv_path)

    # Normalise column names to lowercase with underscores
    df.columns = [c.strip().lower().replace(" ", "_") for c in df.columns]

    required = [TARGET_COL] + CAT_COLS + NUM_COLS
    missing = [c for c in required if c not in df.columns]
    if missing:
        raise SystemExit(f"Missing columns: {missing}. Found: {list(df.columns)}")

    df = df.dropna(subset=[TARGET_COL])
    # Binary: High burnout = 1, Medium / Low = 0
    y = (df[TARGET_COL].str.strip().str.lower() == "high").astype(int)
    X = df[CAT_COLS + NUM_COLS]

    # Coerce numerics
    for col in NUM_COLS:
        X = X.copy()
        X[col] = pd.to_numeric(X[col], errors="coerce")

    stratify = y if len(np.unique(y)) > 1 else None
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=42, stratify=stratify
    )

    neg = int((y_train == 0).sum())
    pos = int((y_train == 1).sum())
    spw = round(neg / pos, 4) if pos else 1.0

    pipe = build_student_pipeline(scale_pos_weight=spw)
    pipe.fit(X_train, y_train)

    proba = pipe.predict_proba(X_test)[:, 1]
    pred = (proba >= 0.5).astype(int)

    metrics = {
        "f1": float(f1_score(y_test, pred, zero_division=0)),
        "roc_auc": float(roc_auc_score(y_test, proba)) if len(np.unique(y_test)) > 1 else None,
        "report": classification_report(y_test, pred, zero_division=0),
        "positive_rate_train": float(y_train.mean()),
        "positive_rate_test": float(y_test.mean()),
    }

    meta = {
        "model_type": "student",
        "target_col": TARGET_COL,
        "cat_cols": CAT_COLS,
        "num_cols": NUM_COLS,
        "positive_class_label": "high_burnout",
        "metrics": metrics,
    }
    bundle = {"pipeline": pipe, "meta": meta}

    out_path.parent.mkdir(parents=True, exist_ok=True)
    joblib.dump(bundle, out_path)
    meta_path = out_path.with_suffix(".meta.json")
    meta_path.write_text(json.dumps(meta, indent=2, default=str), encoding="utf-8")

    print("Saved:", out_path)
    print(f"F1: {metrics['f1']:.4f}  ROC-AUC: {metrics['roc_auc']}")
    print(metrics["report"])


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--csv", type=Path, required=True, help="Path to student CSV")
    parser.add_argument(
        "--out", type=Path,
        default=Path(__file__).resolve().parent / "artifacts" / "student_burnout_model.joblib",
    )
    args = parser.parse_args()
    train_student(args.csv, args.out)


if __name__ == "__main__":
    main()
