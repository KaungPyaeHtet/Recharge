# Recharge — Claude Code Context

## Project Summary
Full-stack burnout risk assessment app (Hackathon 2026). ML-powered prediction + daily wellness tracking.

## Tech Stack
- **Frontend**: React 19 + TypeScript + Vite (port 5173)
- **Backend**: FastAPI + SQLAlchemy + SQLite (port 8000)
- **ML**: XGBoost + SHAP + SMOTE, model at `backend/ml/artifacts/burnout_model.joblib`
- **Auth**: JWT (PyJWT) + bcrypt, token in localStorage as `recharge_access_token`
- **CI**: GitHub Actions (`.github/workflows/ci.yml`)

## Directory Layout
```
Recharge/
├── backend/
│   ├── app/
│   │   ├── main.py          # FastAPI entry, lifespan creates DB tables
│   │   ├── auth.py          # JWT helpers, bcrypt
│   │   ├── auth_routes.py   # POST /api/auth/register, /api/auth/login
│   │   ├── burnout.py       # GET /api/burnout/status, POST /api/burnout/predict
│   │   ├── wellness_routes.py # /api/wellness/* (hobbies, logs, burnout-preview)
│   │   ├── daily_nlp.py     # Lightweight rule-based sentiment + hobby matching
│   │   ├── models.py        # SQLAlchemy: User, Hobby, DailyActivityLog
│   │   ├── database.py      # SQLAlchemy engine/session setup
│   │   └── config.py        # Pydantic Settings (reads .env)
│   ├── ml/
│   │   ├── predictor.py     # XGBoost predict + SHAP explanations
│   │   ├── train.py         # Training pipeline
│   │   ├── schema_cols.py   # Feature column names
│   │   └── artifacts/burnout_model.joblib
│   ├── tests/               # pytest: conftest.py + test_auth/burnout/health
│   ├── requirements.txt
│   ├── .env                 # JWT_SECRET required
│   └── .env.example
├── frontend/
│   ├── src/
│   │   ├── App.tsx          # All UI: landing page + dashboard
│   │   └── utils.ts         # getRiskColor(), getRiskLabel()
│   ├── package.json
│   └── vite.config.ts
├── student_mental_health_burnout.csv  # 150k row dataset (not used by model yet)
└── CLAUDE.md                # This file
```

## API Routes
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | /api/health | No | Health check |
| POST | /api/auth/register | No | Create account → JWT |
| POST | /api/auth/login | No | Login → JWT |
| GET | /api/me | Yes | Current user |
| GET | /api/burnout/status | No | Model loaded? |
| POST | /api/burnout/predict | Yes | Burnout risk from work profile |
| POST/GET/DELETE | /api/wellness/hobbies | Yes | Hobby CRUD |
| POST/GET | /api/wellness/logs | Yes | Daily check-in logs |
| POST | /api/wellness/burnout-preview | Yes | Burnout + wellness adjustment |

## Database Models
- **User**: id (UUID), email, password_hash, created_at
- **Hobby**: id, user_id (FK), name (≤120), created_at
- **DailyActivityLog**: id, user_id (FK), log_date, raw_text, user_polarity, nlp_polarity, blended_polarity, matched_hobby_ids

## ML Input/Output
**Input fields**: date_of_joining, gender, company_type, wfh_setup_available, designation (0-10), resource_allocation (0-20), mental_fatigue_score (0-10)

**Output**: risk_score (0-1), risk_band (low/moderate/high), contributors (SHAP), days_to_high_risk, projected_weekly_risk (8 weeks), warning_level, warning_message

Risk bands: low < 0.35, moderate 0.35-0.65, high > 0.65

## Environment Variables
**Backend** (`backend/.env`):
```
JWT_SECRET=<required>
APP_ENV=development
FRONTEND_URL=http://localhost:5173
DATABASE_URL=sqlite:///./app.db        # optional
BURNOUT_MODEL_PATH=...                 # optional, has default
```

**Frontend** (`frontend/.env`):
```
VITE_API_BASE_URL=http://localhost:8000
```

## Dev Commands
```bash
# Backend
cd backend && source .venv/bin/activate
uvicorn app.main:app --reload --port 8000

# Frontend
cd frontend && npm run dev

# Train model
cd backend && python -m ml.train --synthetic

# Tests
cd backend && pytest
cd frontend && npm test

# CI lint
cd frontend && npm run lint && npm run build
```

## Key Design Notes
- SQLite for dev — no Docker/Compose
- NLP is rule-based (no external ML library dependency), can be swapped
- Hobby matching is substring-based keyword search in daily logs
- CORS: comma-separated `FRONTEND_URL` env var
- JWT expiry: 7 days (configurable via `JWT_EXPIRE_MINUTES`)
- SMOTE used for class imbalance in training
- `student_mental_health_burnout.csv` exists but model currently trains on HackerEarth employee burnout data
