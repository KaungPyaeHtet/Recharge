import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import "./App.css";

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000";

const TOKEN_STORAGE_KEY = "recharge_access_token";

function App() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [message, setMessage] = useState("Ready");
  const [burnoutForm, setBurnoutForm] = useState({
    date_of_joining: "2019-03-15",
    gender: "Male",
    company_type: "Service",
    wfh_setup_available: "Yes",
    designation: 3,
    resource_allocation: 6,
    mental_fatigue_score: 7,
  });

  const isAuthenticated = useMemo(() => !!sessionToken, [sessionToken]);

  useEffect(() => {
    setSessionToken(localStorage.getItem(TOKEN_STORAGE_KEY));
  }, []);

  const authJson = async (path: string, body: object) => {
    const response = await fetch(`${API_BASE_URL}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = (await response.json()) as Record<string, unknown>;
    return { response, data };
  };

  const handleSignUp = async (e: FormEvent) => {
    e.preventDefault();
    const { response, data } = await authJson("/api/auth/register", {
      email,
      password,
    });
    if (!response.ok) {
      const detail = data["detail"];
      setMessage(
        `Sign up failed: ${typeof detail === "string" ? detail : JSON.stringify(data)}`,
      );
      return;
    }
    const token = data["access_token"];
    if (typeof token !== "string") {
      setMessage("Sign up failed: missing token");
      return;
    }
    localStorage.setItem(TOKEN_STORAGE_KEY, token);
    setSessionToken(token);
    setMessage("Signed up and logged in.");
  };

  const handleSignIn = async (e: FormEvent) => {
    e.preventDefault();
    const { response, data } = await authJson("/api/auth/login", {
      email,
      password,
    });
    if (!response.ok) {
      const detail = data["detail"];
      setMessage(
        `Sign in failed: ${typeof detail === "string" ? detail : JSON.stringify(data)}`,
      );
      return;
    }
    const token = data["access_token"];
    if (typeof token !== "string") {
      setMessage("Sign in failed: missing token");
      return;
    }
    localStorage.setItem(TOKEN_STORAGE_KEY, token);
    setSessionToken(token);
    setMessage("Signed in.");
  };

  const handleSignOut = async () => {
    localStorage.removeItem(TOKEN_STORAGE_KEY);
    setSessionToken(null);
    setMessage("Signed out.");
  };

  const callBackend = async (path: string, withAuth = false) => {
    const response = await fetch(`${API_BASE_URL}${path}`, {
      headers: withAuth && sessionToken
        ? { Authorization: `Bearer ${sessionToken}` }
        : undefined,
    });
    const json = (await response.json()) as Record<string, unknown>;
    setMessage(JSON.stringify(json, null, 2));
  };

  const predictBurnout = async (e: FormEvent) => {
    e.preventDefault();
    if (!sessionToken) return;
    const response = await fetch(`${API_BASE_URL}/api/burnout/predict`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${sessionToken}`,
      },
      body: JSON.stringify(burnoutForm),
    });
    const json = (await response.json()) as Record<string, unknown>;
    setMessage(JSON.stringify(json, null, 2));
  };

  return (
    <main className="container">
      <h1>React + FastAPI + SQLite</h1>
      <p className="subtitle">Local SQLite DB + JWT auth; burnout API optional.</p>

      <form className="card" onSubmit={handleSignIn}>
        <h2>Auth</h2>
        <label>
          Email
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </label>
        <label>
          Password
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={6}
          />
        </label>
        <div className="row">
          <button type="submit">Sign In</button>
          <button type="button" onClick={handleSignUp}>
            Sign Up
          </button>
          <button type="button" onClick={handleSignOut} disabled={!isAuthenticated}>
            Sign Out
          </button>
        </div>
      </form>

      <section className="card">
        <h2>API checks</h2>
        <div className="row">
          <button type="button" onClick={() => void callBackend("/api/health")}>
            GET /api/health
          </button>
          <button
            type="button"
            disabled={!isAuthenticated}
            onClick={() => void callBackend("/api/me", true)}
          >
            GET /api/me
          </button>
          <button
            type="button"
            onClick={() => void callBackend("/api/burnout/status")}
          >
            GET /api/burnout/status
          </button>
        </div>
      </section>

      <form className="card" onSubmit={predictBurnout}>
        <h2>Burnout risk (train model first)</h2>
        <p className="subtitle">
          Matches HackerEarth-style fields. Requires sign-in.
        </p>
        <label>
          Date of joining
          <input
            type="date"
            value={burnoutForm.date_of_joining}
            onChange={(e) =>
              setBurnoutForm((f) => ({ ...f, date_of_joining: e.target.value }))
            }
            required
          />
        </label>
        <label>
          Gender
          <select
            value={burnoutForm.gender}
            onChange={(e) =>
              setBurnoutForm((f) => ({ ...f, gender: e.target.value }))
            }
          >
            <option>Male</option>
            <option>Female</option>
          </select>
        </label>
        <label>
          Company type
          <select
            value={burnoutForm.company_type}
            onChange={(e) =>
              setBurnoutForm((f) => ({ ...f, company_type: e.target.value }))
            }
          >
            <option>Service</option>
            <option>Product</option>
          </select>
        </label>
        <label>
          WFH available
          <select
            value={burnoutForm.wfh_setup_available}
            onChange={(e) =>
              setBurnoutForm((f) => ({
                ...f,
                wfh_setup_available: e.target.value,
              }))
            }
          >
            <option>Yes</option>
            <option>No</option>
          </select>
        </label>
        <label>
          Designation (0–10)
          <input
            type="number"
            min={0}
            max={10}
            step={1}
            value={burnoutForm.designation}
            onChange={(e) =>
              setBurnoutForm((f) => ({
                ...f,
                designation: Number(e.target.value),
              }))
            }
          />
        </label>
        <label>
          Resource allocation
          <input
            type="number"
            min={0}
            max={20}
            step={0.1}
            value={burnoutForm.resource_allocation}
            onChange={(e) =>
              setBurnoutForm((f) => ({
                ...f,
                resource_allocation: Number(e.target.value),
              }))
            }
          />
        </label>
        <label>
          Mental fatigue score
          <input
            type="number"
            min={0}
            max={10}
            step={0.1}
            value={burnoutForm.mental_fatigue_score}
            onChange={(e) =>
              setBurnoutForm((f) => ({
                ...f,
                mental_fatigue_score: Number(e.target.value),
              }))
            }
          />
        </label>
        <button type="submit" disabled={!isAuthenticated}>
          POST /api/burnout/predict
        </button>
      </form>

      <pre className="output">{message}</pre>
    </main>
  );
}

export default App;
