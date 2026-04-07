"""
Generate a CSV compatible with `ml.train` defaults (HackerEarth-style columns).

Use for local training before you attach a real dataset from Kaggle or elsewhere.
"""

from __future__ import annotations

from datetime import date, timedelta

import numpy as np
import pandas as pd


def generate_burnout_csv(
    n_rows: int = 2500,
    random_state: int = 42,
    start: date | None = None,
) -> pd.DataFrame:
    rng = np.random.default_rng(random_state)
    start = start or date(2015, 1, 1)

    genders = np.array(["Male", "Female"])
    company_types = np.array(["Service", "Product"])
    wfh = np.array(["Yes", "No"])

    gender = rng.choice(genders, size=n_rows)
    company_type = rng.choice(company_types, size=n_rows)
    wfh_setup = rng.choice(wfh, size=n_rows)

    designation = rng.integers(0, 6, size=n_rows)
    resource_allocation = rng.uniform(1, 10, size=n_rows)
    mental_fatigue = rng.uniform(0, 10, size=n_rows)

    days_ago = rng.integers(30, 365 * 8, size=n_rows)
    join_dates = [start + timedelta(days=int(d)) for d in days_ago]

    # Latent "strain" drives both fatigue and burn (imbalanced positive class).
    strain = (
        0.35 * (mental_fatigue / 10)
        + 0.25 * (resource_allocation / 10)
        + 0.15 * (designation / 5)
        + 0.1 * (wfh_setup == "No").astype(float)
        + rng.normal(0, 0.12, size=n_rows)
    )
    burn_rate = np.clip(strain + rng.normal(0, 0.08, size=n_rows), 0.0, 1.0)

    df = pd.DataFrame(
        {
            "Employee ID": [f"E{i:05d}" for i in range(n_rows)],
            "Date of Joining": join_dates,
            "Gender": gender,
            "Company Type": company_type,
            "WFH Setup Available": wfh_setup,
            "Designation": designation,
            "Resource Allocation": np.round(resource_allocation, 2),
            "Mental Fatigue Score": np.round(mental_fatigue, 2),
            "Burn Rate": np.round(burn_rate, 4),
        }
    )
    return df
