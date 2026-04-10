# Recharge

ML-powered burnout risk assessment app. Tracks your work profile, daily check-ins, and habits to surface burnout risk early — before it becomes a crisis.

## Stack

- **Frontend**: React 19 + TypeScript + Vite (port 5173)
- **Backend**: FastAPI + SQLAlchemy + SQLite (port 8000)
- **ML**: XGBoost + SHAP — burnout prediction with contributor explanations
- **Auth**: JWT (PyJWT + bcrypt), token stored in `localStorage`

## Project Structure

```
Recharge/
├── frontend/
│   ├── src/
│   │   ├── App.tsx          # All UI: landing, dashboard, history, profile pages
│   │   ├── App.css          # Styles
│   │   └── utils.ts         # Risk color helpers
│   ├── .env.example
│   └── package.json
│
├── backend/
│   ├── app/
│   │   ├── main.py              # FastAPI entry point, lifespan DB setup
│   │   ├── auth.py              # JWT helpers, bcrypt
│   │   ├── auth_routes.py       # POST /api/auth/register, /api/auth/login
│   │   ├── burnout.py           # POST /api/burnout/predict
│   │   ├── wellness_routes.py   # /api/wellness/* — hobbies, logs, burnout-preview
│   │   ├── profile_routes.py    # GET/PUT /api/profile — stored work profile
│   │   ├── assessment_routes.py # GET /api/assessments/history
│   │   ├── student_routes.py    # Student burnout assessment
│   │   ├── daily_nlp.py         # Rule-based sentiment + hobby matching
│   │   ├── recommendations.py   # Tip generation from risk band + contributors
│   │   ├── models.py            # SQLAlchemy models
│   │   ├── database.py          # Engine + session setup
│   │   └── config.py            # Pydantic Settings (.env reader)
│   ├── ml/
│   │   ├── predictor.py         # predict_with_shap()
│   │   ├── train.py             # Training pipeline (synthetic or CSV)
│   │   ├── schema_cols.py       # Feature column definitions
│   │   └── artifacts/
│   │       └── burnout_model.joblib
│   ├── tests/
│   ├── .env.example
│   └── requirements.txt
│
└── CLAUDE.md                    # Project context for Claude Code
```

## Running Locally

### 1. Backend

Requires **Python 3.11 or 3.12** (needed for XGBoost/numpy wheels).

```bash
cd backend

# Create and activate virtual environment
python3.12 -m venv .venv
source .venv/bin/activate       # Windows: .venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Configure environment
cp .env.example .env
# Edit .env and set JWT_SECRET to a long random string
```

Required in `backend/.env`:

```
JWT_SECRET=your-long-random-secret-here
```

Optional overrides:

```
APP_ENV=development
FRONTEND_URL=http://localhost:5173
DATABASE_URL=sqlite:///./app.db
```

Train the ML model (required before running predictions):

```bash
python -m ml.train --synthetic
```

Start the API:

```bash
uvicorn app.main:app --reload --port 8000
```

Tables are created automatically on first start. The SQLite database appears at `backend/app.db`.

---

### 2. Frontend

Requires **Node.js 18+**.

```bash
cd frontend
npm install
cp .env.example .env
```

Optional in `frontend/.env`:

```
VITE_API_BASE_URL=http://localhost:8000
```

Start the dev server:

```bash
npm run dev
```

Open [http://localhost:5173](http://localhost:5173).

---

## API Routes

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/health` | No | Health check |
| POST | `/api/auth/register` | No | Create account, returns JWT |
| POST | `/api/auth/login` | No | Login, returns JWT |
| GET | `/api/me` | Yes | Current user info |
| GET | `/api/burnout/status` | No | Model loaded check |
| POST | `/api/burnout/predict` | Yes | Burnout risk from work profile |
| GET/PUT | `/api/profile` | Yes | Stored work profile (set once, update anytime) |
| POST | `/api/wellness/hobbies` | Yes | Add hobby to protect |
| GET | `/api/wellness/hobbies` | Yes | List hobbies |
| DELETE | `/api/wellness/hobbies/:id` | Yes | Remove hobby |
| POST | `/api/wellness/logs` | Yes | Save daily check-in |
| GET | `/api/wellness/logs` | Yes | List recent check-ins |
| POST | `/api/wellness/burnout-preview` | Yes | Burnout prediction with daily signals + habit context |
| GET | `/api/assessments/history` | Yes | Past assessment results |

## How It Works

1. **Set up your profile** — answer questions about your role, company, work hours, and recovery habits once. Stored in the database, editable any time.

2. **Daily check-in** — each day, answer 4 quick questions (energy, sleep, stress, breaks) and optionally add a free-text note. These are saved as daily logs.

3. **Analyze** — click Analyze to run the burnout prediction. The model takes your work profile as the base, then applies:
   - Direct adjustments from today's check-in questions (energy/sleep/stress raise or lower `mental_fatigue_score`; breaks adjust `resource_allocation`)
   - A 14-day NLP sentiment signal from your log notes
   - XGBoost outputs a risk score (0–1) with SHAP contributor explanations

4. **History** — view your risk trend as a line chart over time, plus all past daily logs.

## Deploying to Vercel

The backend and frontend are deployed as two separate Vercel projects.

### Database (required before deploying backend)

SQLite doesn't work on Vercel's serverless runtime. You need a hosted PostgreSQL database.

1. Create a free account at [neon.tech](https://neon.tech)
2. Create a new project and copy the connection string — it looks like:
   ```
   postgresql://user:password@ep-xxx.us-east-1.aws.neon.tech/neondb?sslmode=require
   ```
3. You'll paste this as `DATABASE_URL` when setting up the backend below.

---

### Deploy the Backend

1. Go to [vercel.com](https://vercel.com) → **Add New Project** → import your repo
2. Set **Root Directory** to `backend`
3. Vercel will auto-detect Python. No build command needed.
4. Add these **Environment Variables** in the Vercel project settings:

   | Variable | Value |
   |----------|-------|
   | `JWT_SECRET` | A long random string (e.g. output of `openssl rand -hex 32`) |
   | `DATABASE_URL` | Your Neon PostgreSQL connection string |
   | `FRONTEND_URL` | Your frontend Vercel URL (set after deploying frontend, or update later) |
   | `APP_ENV` | `production` |

5. Click **Deploy**. Note the backend URL (e.g. `https://recharge-api.vercel.app`).

---

### Deploy the Frontend

1. **Add New Project** → same repo
2. Set **Root Directory** to `frontend`
3. Add this **Environment Variable**:

   | Variable | Value |
   |----------|-------|
   | `VITE_API_BASE_URL` | Your backend Vercel URL from the step above |

4. Click **Deploy**.

---

### Connect them together

After both are deployed:

1. Copy the frontend URL (e.g. `https://recharge.vercel.app`)
2. Go to the **backend** Vercel project → Settings → Environment Variables
3. Update `FRONTEND_URL` to the frontend URL
4. **Redeploy** the backend so the CORS setting takes effect

---

### Redeploy after code changes

Push to `main` — Vercel auto-deploys both projects via the Git integration.

To deploy manually:
```bash
npm install -g vercel

# Deploy backend
cd backend && vercel --prod

# Deploy frontend
cd frontend && vercel --prod
```

## Running Tests

```bash
# Backend
cd backend
source .venv/bin/activate
pytest

# Frontend
cd frontend
npm test
```
