import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import "./App.css";
import { RISK_COLORS, WARNING_STYLES, cleanLabel, riskBand } from "./utils";

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000";

const TOKEN_STORAGE_KEY = "recharge_access_token";

type BurnoutContributor = {
  feature: string;
  label: string;
  shap: number;
  share: number;
  direction: "increases_risk" | "decreases_risk";
};

type BurnoutForecastPoint = {
  day: number;
  risk_score: number;
};

type BurnoutPredictResponse = {
  risk_score: number;
  risk_band: "low" | "moderate" | "high";
  contributors: BurnoutContributor[];
  days_to_high_risk: number | null;
  projected_weekly_risk: BurnoutForecastPoint[];
  warning_level: "stable" | "watch" | "warning" | "critical";
  warning_message: string;
  disclaimer: string;
};

/** Extended when calling POST /api/wellness/burnout-preview */
type WellnessBurnoutResult = BurnoutPredictResponse & {
  mental_fatigue_base?: number;
  mental_fatigue_adjusted?: number;
  daily_signal_summary?: string;
  habit_insights?: string[];
  logs_used?: number;
};

type HobbyRow = { id: string; name: string };

function RiskGauge({ score }: { score: number }) {
  const pct = Math.round(score * 100);
  const band = riskBand(score);
  const strokeColor =
    band === "low" ? "#16a34a" : band === "moderate" ? "#d97706" : "#dc2626";
  const dashArray = 220;
  const dashOffset = dashArray - (dashArray * pct) / 100;

  return (
    <div className="gauge-wrapper">
      <svg viewBox="0 0 100 60" className="gauge-svg">
        <path
          d="M10,55 A45,45 0 0,1 90,55"
          fill="none"
          stroke="#e5e0d4"
          strokeWidth="8"
          strokeLinecap="round"
        />
        <path
          d="M10,55 A45,45 0 0,1 90,55"
          fill="none"
          stroke={strokeColor}
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={`${dashArray}`}
          strokeDashoffset={`${dashOffset}`}
        />
      </svg>
      <div className="gauge-center">
        <span className="gauge-pct" style={{ color: strokeColor }}>{pct}%</span>
        <span className="gauge-label" style={{ color: strokeColor }}>
          {RISK_COLORS[band].label}
        </span>
      </div>
    </div>
  );
}

function TrendBar({ points }: { points: BurnoutForecastPoint[] }) {
  const max = Math.max(...points.map((p) => p.risk_score), 0.01);
  return (
    <div className="trend-bars">
      {points.map((point) => {
        const pct = (point.risk_score / max) * 100;
        const score = point.risk_score;
        const band = riskBand(score);
        const color =
          band === "low" ? "#16a34a" : band === "moderate" ? "#d97706" : "#dc2626";
        return (
          <div key={point.day} className="trend-bar-item">
            <span className="trend-bar-value" style={{ color }}>
              {Math.round(point.risk_score * 100)}%
            </span>
            <div className="trend-bar-track">
              <div
                className="trend-bar-fill"
                style={{ height: `${pct}%`, background: color }}
              />
            </div>
            <span className="trend-bar-day">D{point.day}</span>
          </div>
        );
      })}
    </div>
  );
}

function App() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authMode, setAuthMode] = useState<"signin" | "signup">("signin");
  const [authError, setAuthError] = useState("");
  const [sessionToken, setSessionToken] = useState<string | null>(() =>
    localStorage.getItem(TOKEN_STORAGE_KEY),
  );
  const [burnoutForm, setBurnoutForm] = useState({
    date_of_joining: "2019-03-15",
    gender: "Male",
    company_type: "Service",
    wfh_setup_available: "Yes",
    designation: 3,
    resource_allocation: 6,
    mental_fatigue_score: 7,
  });
  const [burnoutResult, setBurnoutResult] = useState<WellnessBurnoutResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [hobbies, setHobbies] = useState<HobbyRow[]>([]);
  const [hobbyName, setHobbyName] = useState("");
  const [logNote, setLogNote] = useState("");
  const [logPolarity, setLogPolarity] = useState<"" | "plus" | "minus" | "neutral">("");
  const [lookbackDays, setLookbackDays] = useState(14);
  const [wellnessMsg, setWellnessMsg] = useState("");

  const isAuthenticated = useMemo(() => !!sessionToken, [sessionToken]);

  useEffect(() => {
    if (!sessionToken) {
      setHobbies([]);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/api/wellness/hobbies`, {
          headers: { Authorization: `Bearer ${sessionToken}` },
        });
        if (!res.ok || cancelled) return;
        const data = (await res.json()) as HobbyRow[];
        if (!cancelled) setHobbies(data);
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sessionToken]);

  const authJson = async (path: string, body: object) => {
    const response = await fetch(`${API_BASE_URL}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = (await response.json()) as Record<string, unknown>;
    return { response, data };
  };

  const handleAuth = async (e: FormEvent) => {
    e.preventDefault();
    setAuthError("");
    setLoading(true);
    const path = authMode === "signup" ? "/api/auth/register" : "/api/auth/login";
    try {
      const { response, data } = await authJson(path, { email, password });
      if (!response.ok) {
        const detail = data["detail"];
        setAuthError(typeof detail === "string" ? detail : "Authentication failed");
        return;
      }
      const token = data["access_token"];
      if (typeof token !== "string") {
        setAuthError("Missing token in response");
        return;
      }
      localStorage.setItem(TOKEN_STORAGE_KEY, token);
      setSessionToken(token);
      setShowAuthModal(false);
    } catch {
      setAuthError("Network error — is the backend running?");
    } finally {
      setLoading(false);
    }
  };

  const handleSignOut = () => {
    localStorage.removeItem(TOKEN_STORAGE_KEY);
    setSessionToken(null);
    setBurnoutResult(null);
  };

  const predictBurnout = async (e: FormEvent) => {
    e.preventDefault();
    if (!sessionToken) return;
    setLoading(true);
    setWellnessMsg("");
    try {
      const response = await fetch(`${API_BASE_URL}/api/burnout/predict`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${sessionToken}`,
        },
        body: JSON.stringify(burnoutForm),
      });
      const json = (await response.json()) as Record<string, unknown>;
      if (response.ok) {
        setBurnoutResult(json as unknown as WellnessBurnoutResult);
      }
    } finally {
      setLoading(false);
    }
  };

  const addHobby = async () => {
    const name = hobbyName.trim();
    if (!sessionToken || !name) return;
    const res = await fetch(`${API_BASE_URL}/api/wellness/hobbies`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${sessionToken}`,
      },
      body: JSON.stringify({ name }),
    });
    if (res.ok) {
      const row = (await res.json()) as HobbyRow;
      setHobbies((h) => [...h, row]);
      setHobbyName("");
      setWellnessMsg(`Saved hobby “${row.name}”.`);
    }
  };

  const removeHobby = async (id: string) => {
    if (!sessionToken) return;
    const res = await fetch(`${API_BASE_URL}/api/wellness/hobbies/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${sessionToken}` },
    });
    if (res.ok) {
      setHobbies((h) => h.filter((x) => x.id !== id));
      setWellnessMsg("Hobby removed.");
    }
  };

  const saveDailyLog = async () => {
    const text = logNote.trim();
    if (!sessionToken || !text) return;
    const body: { text: string; polarity?: string } = { text };
    if (logPolarity) body.polarity = logPolarity;
    const res = await fetch(`${API_BASE_URL}/api/wellness/logs`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${sessionToken}`,
      },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      setLogNote("");
      setLogPolarity("");
      setWellnessMsg("Check-in saved. Run “Analyze with wellness” to fold it into risk.");
    } else {
      setWellnessMsg("Could not save check-in.");
    }
  };

  const predictBurnoutWithWellness = async () => {
    if (!sessionToken) return;
    setLoading(true);
    setWellnessMsg("");
    try {
      const response = await fetch(`${API_BASE_URL}/api/wellness/burnout-preview`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${sessionToken}`,
        },
        body: JSON.stringify({
          work_profile: burnoutForm,
          lookback_days: lookbackDays,
        }),
      });
      const json = (await response.json()) as Record<string, unknown>;
      if (response.ok) {
        setBurnoutResult(json as unknown as WellnessBurnoutResult);
      } else {
        setWellnessMsg(typeof json["detail"] === "string" ? json["detail"] : "Preview failed.");
      }
    } finally {
      setLoading(false);
    }
  };

  const openAuth = (mode: "signin" | "signup") => {
    setAuthMode(mode);
    setAuthError("");
    setShowAuthModal(true);
  };

  if (!isAuthenticated) {
    return (
      <div className="landing">
        <nav className="nav">
          <div className="nav-inner">
            <div className="nav-brand">
              <div className="nav-logo-mark" />
              <span className="nav-name">Recharge</span>
            </div>
            <div className="nav-links">
              <a href="#features" className="nav-link">Features</a>
              <a href="#how-it-works" className="nav-link">How it works</a>
            </div>
            <div className="nav-actions">
              <button className="btn-nav-ghost" onClick={() => openAuth("signin")}>
                Sign in
              </button>
              <button className="btn-nav-primary" onClick={() => openAuth("signup")}>
                Try free
              </button>
            </div>
          </div>
        </nav>

        <section className="hero">
          <div className="hero-eyebrow">Burnout Prevention</div>
          <h1 className="hero-title">
            Know your limits<br />
            <span className="hero-accent">before they know you.</span>
          </h1>
          <p className="hero-sub">
            Recharge analyzes your work patterns with machine learning to surface
            burnout risk early — giving you time to reset before it becomes a crisis.
          </p>
          <div className="hero-cta">
            <button className="btn-primary btn-lg" onClick={() => openAuth("signup")}>
              Start your assessment
            </button>
            <span className="hero-cta-note">Free to use. No card required.</span>
          </div>
        </section>

        <section className="features-section" id="features">
          <div className="section-inner">
            <h2 className="section-title">What Recharge does</h2>
            <p className="section-sub">
              Three signals that tell you where you stand — and where you're heading.
            </p>
            <div className="features-grid">
              {[
                {
                  num: "01",
                  title: "Risk Score",
                  desc: "A single burnout probability score derived from your work profile using a trained ML model.",
                },
                {
                  num: "02",
                  title: "8-Week Forecast",
                  desc: "Project how your risk evolves over the next two months so you can course-correct early.",
                },
                {
                  num: "03",
                  title: "Key Contributors",
                  desc: "See exactly which factors are driving your score — and which ones are protecting you.",
                },
              ].map((f) => (
                <div key={f.num} className="feature-card">
                  <span className="feature-num">{f.num}</span>
                  <h3 className="feature-title">{f.title}</h3>
                  <p className="feature-desc">{f.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="how-section" id="how-it-works">
          <div className="section-inner">
            <h2 className="section-title">How it works</h2>
            <div className="steps">
              {[
                { step: "1", label: "Create an account", desc: "Sign up with your email in under a minute." },
                { step: "2", label: "Enter your work profile", desc: "Share basic details about your role, workload, and fatigue." },
                { step: "3", label: "Get your risk report", desc: "Receive an ML-powered score, forecast, and actionable breakdown." },
              ].map((s) => (
                <div key={s.step} className="step-item">
                  <div className="step-num">{s.step}</div>
                  <div>
                    <h4 className="step-label">{s.label}</h4>
                    <p className="step-desc">{s.desc}</p>
                  </div>
                </div>
              ))}
            </div>
            <button
              className="btn-primary"
              style={{ marginTop: "2rem" }}
              onClick={() => openAuth("signup")}
            >
              Get started free
            </button>
          </div>
        </section>

        <footer className="footer">
          <div className="footer-inner">
            <span className="footer-brand">Recharge</span>
            <span className="footer-note">Built for Hackathon 2026</span>
          </div>
        </footer>

        {showAuthModal && (
          <div className="modal-overlay" onClick={() => setShowAuthModal(false)}>
            <div className="auth-card" onClick={(e) => e.stopPropagation()}>
              <div className="modal-close-row">
                <button className="modal-close" onClick={() => setShowAuthModal(false)}>
                  &times;
                </button>
              </div>
              <div className="auth-header">
                <h2 className="auth-title">
                  {authMode === "signin" ? "Sign in to Recharge" : "Create your account"}
                </h2>
                <p className="auth-sub">
                  {authMode === "signin"
                    ? "Access your burnout dashboard"
                    : "Free assessment, takes under 2 minutes"}
                </p>
              </div>

              <div className="auth-tabs">
                <button
                  className={`auth-tab ${authMode === "signin" ? "active" : ""}`}
                  onClick={() => { setAuthMode("signin"); setAuthError(""); }}
                >
                  Sign In
                </button>
                <button
                  className={`auth-tab ${authMode === "signup" ? "active" : ""}`}
                  onClick={() => { setAuthMode("signup"); setAuthError(""); }}
                >
                  Sign Up
                </button>
              </div>

              <form onSubmit={handleAuth} className="auth-form">
                <div className="field">
                  <label className="field-label">Email address</label>
                  <input
                    className="field-input"
                    type="email"
                    placeholder="you@company.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                </div>
                <div className="field">
                  <label className="field-label">Password</label>
                  <input
                    className="field-input"
                    type="password"
                    placeholder="Min. 6 characters"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    minLength={6}
                  />
                </div>
                {authError && <div className="auth-error">{authError}</div>}
                <button className="btn-primary btn-full" type="submit" disabled={loading}>
                  {loading
                    ? "Please wait..."
                    : authMode === "signin"
                    ? "Sign In"
                    : "Create Account"}
                </button>
              </form>
            </div>
          </div>
        )}
      </div>
    );
  }

  // Authenticated dashboard
  return (
    <div className="app">
      <nav className="nav nav-app">
        <div className="nav-inner">
          <div className="nav-brand">
            <div className="nav-logo-mark" />
            <span className="nav-name">Recharge</span>
          </div>
          <div className="nav-links">
            <span className="nav-link nav-link-active">Dashboard</span>
            <span className="nav-link">Assessment</span>
          </div>
          <div className="nav-actions">
            <div className="nav-user-pill">
              <div className="nav-avatar">
                {email ? email[0].toUpperCase() : "U"}
              </div>
              <span className="nav-user-email">{email || "Account"}</span>
            </div>
            <button className="btn-nav-ghost" onClick={handleSignOut}>
              Sign out
            </button>
          </div>
        </div>
      </nav>

      <div className="dashboard">
        <header className="dash-header">
          <div>
            <h1 className="dash-title">Burnout Risk Assessment</h1>
            <p className="dash-sub">
              Fill in your work profile below to get a personalized risk score
            </p>
          </div>
          {burnoutResult && (
            <div
              className="risk-badge-large"
              style={{
                background: RISK_COLORS[burnoutResult.risk_band].bg,
                borderColor: RISK_COLORS[burnoutResult.risk_band].border,
                color: RISK_COLORS[burnoutResult.risk_band].text,
              }}
            >
              {RISK_COLORS[burnoutResult.risk_band].label}
            </div>
          )}
        </header>

        <div className="dash-grid">
          {/* Assessment Form */}
          <form className="card form-card" onSubmit={predictBurnout}>
            <h2 className="card-title">Work Profile</h2>

            <div className="form-grid">
              <div className="field">
                <label className="field-label">When did you start this job?</label>
                <input
                  className="field-input"
                  type="date"
                  value={burnoutForm.date_of_joining}
                  onChange={(e) =>
                    setBurnoutForm((f) => ({ ...f, date_of_joining: e.target.value }))
                  }
                  required
                />
              </div>
              <div className="field">
                <label className="field-label">Gender</label>
                <select
                  className="field-input"
                  value={burnoutForm.gender}
                  onChange={(e) =>
                    setBurnoutForm((f) => ({ ...f, gender: e.target.value }))
                  }
                >
                  <option>Male</option>
                  <option>Female</option>
                </select>
              </div>
              <div className="field">
                <label className="field-label">What kind of company?</label>
                <select
                  className="field-input"
                  value={burnoutForm.company_type}
                  onChange={(e) =>
                    setBurnoutForm((f) => ({ ...f, company_type: e.target.value }))
                  }
                >
                  <option value="Service">Service (consulting, agency)</option>
                  <option value="Product">Product (tech, SaaS)</option>
                </select>
              </div>
              <div className="field">
                <label className="field-label">Can you work from home?</label>
                <select
                  className="field-input"
                  value={burnoutForm.wfh_setup_available}
                  onChange={(e) =>
                    setBurnoutForm((f) => ({ ...f, wfh_setup_available: e.target.value }))
                  }
                >
                  <option value="Yes">Yes, I have a WFH setup</option>
                  <option value="No">No, office only</option>
                </select>
              </div>
            </div>

            <div className="divider" />

            <div className="slider-fields">
              {[
                {
                  key: "designation" as const,
                  label: "How senior is your role?",
                  min: 0, max: 10, step: 1,
                  hint: "0 = intern / junior  ·  5 = mid-level  ·  10 = exec / founder",
                },
                {
                  key: "resource_allocation" as const,
                  label: "How heavy is your current workload?",
                  min: 0, max: 20, step: 0.5,
                  hint: "1–5 = light  ·  6–10 = moderate  ·  11–15 = heavy  ·  16+ = unsustainable",
                },
                {
                  key: "mental_fatigue_score" as const,
                  label: "How mentally drained do you feel day-to-day?",
                  min: 0, max: 10, step: 0.1,
                  hint: "0 = completely fine  ·  5 = noticeably tired  ·  10 = exhausted",
                },
              ].map(({ key, label, min, max, step, hint }) => (
                <div key={key} className="slider-field">
                  <div className="slider-header">
                    <label className="field-label">{label}</label>
                    <span className="slider-value">{burnoutForm[key]}</span>
                  </div>
                  <input
                    className="slider"
                    type="range"
                    min={min}
                    max={max}
                    step={step}
                    value={burnoutForm[key]}
                    onChange={(e) =>
                      setBurnoutForm((f) => ({ ...f, [key]: Number(e.target.value) }))
                    }
                  />
                  <span className="slider-hint">{hint}</span>
                </div>
              ))}
            </div>

            <div className="analyze-actions">
              <button className="btn-primary btn-full" type="submit" disabled={loading}>
                {loading ? (
                  <span className="loading-dots">
                    Analyzing<span>.</span><span>.</span><span>.</span>
                  </span>
                ) : (
                  "Analyze (profile only)"
                )}
              </button>
              <button
                className="btn-secondary btn-full"
                type="button"
                disabled={loading}
                onClick={() => void predictBurnoutWithWellness()}
              >
                Analyze with wellness &amp; habits
              </button>
            </div>

            <div className="divider" />
            <h3 className="subsection-title">Hobbies &amp; daily check-in</h3>
            <p className="subsection-hint">
              Set activities you want to keep (guitar, running, reading). Each day, jot what you did
              — we use light keyword NLP plus optional &quot;+ / -&quot; labels. The wellness run adjusts
              fatigue from your notes and flags habit slip.
            </p>
            <div className="wellness-row">
              <input
                className="field-input hobby-input"
                placeholder="e.g. piano, climbing, journaling"
                value={hobbyName}
                onChange={(e) => setHobbyName(e.target.value)}
              />
              <button type="button" className="btn-secondary" onClick={() => void addHobby()}>
                Add hobby
              </button>
            </div>
            {hobbies.length > 0 && (
              <div className="hobby-chips">
                {hobbies.map((h) => (
                  <span key={h.id} className="hobby-chip">
                    {h.name}
                    <button
                      type="button"
                      className="hobby-chip-remove"
                      aria-label={`Remove ${h.name}`}
                      onClick={() => void removeHobby(h.id)}
                    >
                      &times;
                    </button>
                  </span>
                ))}
              </div>
            )}
            <textarea
              className="field-input log-textarea"
              placeholder="Today: e.g. worked late, skipped gym, 20m walk at lunch..."
              value={logNote}
              onChange={(e) => setLogNote(e.target.value)}
              rows={3}
            />
            <div className="wellness-row">
              <label className="field-label-inline">
                Day felt like
                <select
                  className="field-input"
                  value={logPolarity}
                  onChange={(e) =>
                    setLogPolarity(
                      e.target.value as "" | "plus" | "minus" | "neutral",
                    )
                  }
                >
                  <option value="">Auto (NLP from text)</option>
                  <option value="plus">Good / recharging (+)</option>
                  <option value="minus">Hard / draining (-)</option>
                  <option value="neutral">Neutral</option>
                </select>
              </label>
              <label className="field-label-inline">
                Look back (days)
                <input
                  className="field-input lookback-input"
                  type="number"
                  min={1}
                  max={90}
                  value={lookbackDays}
                  onChange={(e) => setLookbackDays(Number(e.target.value))}
                />
              </label>
              <button type="button" className="btn-secondary" onClick={() => void saveDailyLog()}>
                Save check-in
              </button>
            </div>
            {wellnessMsg && <p className="wellness-toast">{wellnessMsg}</p>}
          </form>

          {/* Results Panel */}
          {burnoutResult ? (
            <div className="results-col">
              <div className="card">
                <h2 className="card-title">Risk Score</h2>
                <RiskGauge score={burnoutResult.risk_score} />
                <div
                  className="warning-banner"
                  style={{
                    background: WARNING_STYLES[burnoutResult.warning_level].bg,
                    borderColor: WARNING_STYLES[burnoutResult.warning_level].border,
                    color: WARNING_STYLES[burnoutResult.warning_level].text,
                  }}
                >
                  {burnoutResult.warning_message}
                </div>
                {burnoutResult.logs_used !== undefined && (
                  <div className="wellness-insights">
                    <p className="wellness-summary">{burnoutResult.daily_signal_summary}</p>
                    {burnoutResult.mental_fatigue_base !== undefined &&
                      burnoutResult.mental_fatigue_adjusted !== undefined && (
                        <p className="fatigue-adjust">
                          Fatigue in form: <strong>{burnoutResult.mental_fatigue_base.toFixed(1)}</strong>
                          {" → "}
                          model input:{" "}
                          <strong>{burnoutResult.mental_fatigue_adjusted.toFixed(1)}</strong>
                          {" "}
                          <span className="logs-used">
                            ({burnoutResult.logs_used} check-ins in window)
                          </span>
                        </p>
                      )}
                    {burnoutResult.habit_insights && burnoutResult.habit_insights.length > 0 && (
                      <ul className="habit-insight-list">
                        {burnoutResult.habit_insights.map((line, i) => (
                          <li key={`${i}-${line.slice(0, 48)}`}>{line}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
                {burnoutResult.days_to_high_risk !== null && (
                  <p className="forecast-note">
                    High-risk threshold in{" "}
                    <strong>{burnoutResult.days_to_high_risk} days</strong>
                  </p>
                )}
              </div>

              <div className="card">
                <h2 className="card-title">8-Week Forecast</h2>
                <TrendBar points={burnoutResult.projected_weekly_risk} />
              </div>

              <div className="card">
                <h2 className="card-title">Key Contributors</h2>
                <div className="contributors">
                  {burnoutResult.contributors.map((item) => (
                    <div
                      key={item.feature}
                      className={`contributor-chip ${item.direction}`}
                    >
                      <span className="chip-dir">
                        {item.direction === "increases_risk" ? "+" : "-"}
                      </span>
                      <span className="chip-label">{cleanLabel(item.label)}</span>
                      <span className="chip-share">{item.share}%</span>
                    </div>
                  ))}
                </div>
                <p className="disclaimer">{burnoutResult.disclaimer}</p>
              </div>
            </div>
          ) : (
            <div className="results-col">
              <div className="card empty-state">
                <div className="empty-dot" />
                <h3 className="empty-title">Your results will appear here</h3>
                <p className="empty-sub">
                  Complete the work profile on the left and click "Analyze" to receive
                  your personalized burnout risk report.
                </p>
                <ul className="empty-list">
                  <li>ML-powered risk score</li>
                  <li>8-week projection</li>
                  <li>Actionable contributor breakdown</li>
                </ul>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default App;
