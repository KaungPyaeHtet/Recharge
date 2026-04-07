# React + FastAPI + SQLite

Starter template:

- `frontend/`: React + Vite + TypeScript (JWT stored in `localStorage`)
- `backend/`: FastAPI + SQLAlchemy + SQLite (local `app.db` by default)
- Auth: `POST /api/auth/register`, `POST /api/auth/login`, bearer JWT on protected routes

## 1) Frontend setup

```bash
cd frontend
npm install
cp .env.example .env
```

Set in `frontend/.env` if needed:

- `VITE_API_BASE_URL` (default `http://localhost:8000`)

Run:

```bash
npm run dev
```

## 2) Backend setup

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
```

Set in `backend/.env` as needed:

- `FRONTEND_URL` (default `http://localhost:5173`)
- `JWT_SECRET` (use a long random string outside development)
- `DATABASE_URL` (optional; defaults to `sqlite:///{backend}/app.db`)

Run:

```bash
uvicorn app.main:app --reload --port 8000
```

On first start, tables are created automatically. The SQLite file appears at `backend/app.db` unless you override `DATABASE_URL`.

## Included API routes

- `GET /api/health`: public health check
- `POST /api/auth/register`, `POST /api/auth/login`: create account / login → JWT
- `GET /api/me`: protected; requires `Authorization: Bearer <access_token>`
- `GET /api/burnout/status`: whether a trained model file exists
- `POST /api/burnout/predict`: burnout risk + SHAP contributors (requires bearer token; train the model first)

## Burnout ML (optional)

Use **Python 3.11–3.12** for reliable wheels (`numpy` / `xgboost`). From `backend/`:

```bash
python3.12 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
python -m ml.train --synthetic
```

For real data, download the **HackerEarth Employee Burnout Challenge** CSV from Kaggle (URL in `backend/ml/train.py` docstring) and run `python -m ml.train --csv path/to/train.csv`. After retraining, restart the API process so it reloads the joblib file.

## GitHub template usage

1. Clone the repo
2. Configure frontend/backend env files
3. Run frontend + backend in separate terminals
