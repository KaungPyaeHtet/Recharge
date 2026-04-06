# React + FastAPI + Supabase Template

Starter template for rapid app development:

- `frontend/`: React + Vite + TypeScript + Supabase JS client
- `backend/`: FastAPI + Supabase Python client
- Auth flow included (email/password in frontend, bearer token validation in backend)

## 1) Frontend setup

```bash
cd frontend
npm install
cp .env.example .env
```

Set these in `frontend/.env`:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
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

Set these in `backend/.env`:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `FRONTEND_URL` (default `http://localhost:5173`)

Run:

```bash
uvicorn app.main:app --reload --port 8000
```

## Included API routes

- `GET /api/health`: public health check
- `GET /api/me`: protected route, requires `Authorization: Bearer <access_token>`

## GitHub template usage

Create a new repository from this template, then:

1. Clone new repo
2. Configure frontend/backend env files
3. Run frontend + backend in separate terminals
# React-Fastapi-Supabase-Template
