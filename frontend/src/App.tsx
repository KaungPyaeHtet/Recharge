import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import "./App.css";
import { RISK_COLORS, WARNING_STYLES, cleanLabel, riskBand } from "./utils";

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ?? "";

const TOKEN_STORAGE_KEY = "recharge_access_token";

// ── Types ─────────────────────────────────────────────────────────────────────

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

type WellnessBurnoutResult = BurnoutPredictResponse & {
  mental_fatigue_base?: number;
  mental_fatigue_adjusted?: number;
  resource_allocation_adjusted?: number;
  daily_signal_summary?: string;
  daily_signal_notes?: string[];
  habit_insights?: string[];
  logs_used?: number;
  recommendations?: string[];
};

type HobbyRow = { id: string; name: string };

type AssessmentOut = {
  id: string;
  mode: string;
  risk_score: number;
  risk_band: "low" | "moderate" | "high";
  warning_level: string;
  created_at: string;
  top_contributors: BurnoutContributor[];
};

type LogOut = {
  id: string;
  log_date: string;
  raw_text: string;
  user_polarity: string | null;
  nlp_polarity: number;
  blended_polarity: number;
  matched_hobby_ids: string | null;
};

// ── Profile types & config ────────────────────────────────────────────────────

type UserProfileData = {
  date_of_joining: string;
  gender: string;
  company_type: string;
  wfh_setup_available: string;
  role_level: string;
  hours_per_day: string;
  evening_work: string;
  projects_count: string;
  end_of_day: string;
  switch_off: string;
  sleep_worries: string;
  exercise: string;
};

const DEFAULT_PROFILE: UserProfileData = {
  date_of_joining: "2022-01-01",
  gender: "Male",
  company_type: "Service",
  wfh_setup_available: "Yes",
  role_level: "mid",
  hours_per_day: "8",
  evening_work: "rarely",
  projects_count: "3_5",
  end_of_day: "okay",
  switch_off: "some_effort",
  sleep_worries: "rarely",
  exercise: "1_2",
};

const ROLE_OPTIONS = [
  { value: "intern",   label: "Intern / Trainee" },
  { value: "junior",   label: "Junior / Associate" },
  { value: "mid",      label: "Mid-level IC" },
  { value: "senior",   label: "Senior IC / Specialist" },
  { value: "lead",     label: "Lead / Manager" },
  { value: "director", label: "Director / VP" },
  { value: "exec",     label: "Exec / Founder" },
];

const PROFILE_SELECTS: Record<string, { label: string; options: { value: string; label: string }[] }> = {
  hours_per_day: {
    label: "How many hours do you typically work per day?",
    options: [
      { value: "under_6", label: "Under 6 hours" },
      { value: "6_7",     label: "About 6–7 hours" },
      { value: "8",       label: "About 8 hours" },
      { value: "9_10",    label: "9–10 hours" },
      { value: "10_12",   label: "10–12 hours" },
      { value: "12_plus", label: "12+ hours" },
    ],
  },
  evening_work: {
    label: "How often do you work evenings or weekends?",
    options: [
      { value: "rarely",    label: "Rarely or never" },
      { value: "sometimes", label: "Sometimes (1–2x/week)" },
      { value: "often",     label: "Often (3–4x/week)" },
      { value: "always",    label: "Almost always" },
    ],
  },
  projects_count: {
    label: "How many projects or responsibilities are you juggling?",
    options: [
      { value: "1_2",     label: "1–2 things" },
      { value: "3_5",     label: "3–5 things" },
      { value: "6_10",    label: "6–10 things" },
      { value: "10_plus", label: "More than 10" },
    ],
  },
  end_of_day: {
    label: "How do you feel at the end of a typical workday?",
    options: [
      { value: "great",    label: "Great, still energized" },
      { value: "okay",     label: "Okay, slightly tired" },
      { value: "tired",    label: "Fairly tired" },
      { value: "exhausted",label: "Exhausted" },
    ],
  },
  switch_off: {
    label: "How easy is it to mentally switch off from work?",
    options: [
      { value: "easy",        label: "Very easy" },
      { value: "some_effort", label: "Takes some effort" },
      { value: "hard",        label: "Quite hard" },
      { value: "very_hard",   label: "Very hard / can't stop thinking" },
    ],
  },
  sleep_worries: {
    label: "How often do you lose sleep due to work worries?",
    options: [
      { value: "rarely",    label: "Rarely or never" },
      { value: "sometimes", label: "Sometimes" },
      { value: "often",     label: "Often" },
      { value: "always",    label: "Almost always" },
    ],
  },
  exercise: {
    label: "How often do you exercise or do physical activity?",
    options: [
      { value: "4_5",   label: "4–5 times a week" },
      { value: "2_3",   label: "2–3 times a week" },
      { value: "1_2",   label: "1–2 times a week" },
      { value: "rarely",label: "Rarely" },
      { value: "never", label: "Never" },
    ],
  },
};

function profileToBurnoutForm(p: UserProfileData) {
  const ROLE_MAP: Record<string, number> = {
    intern: 1, junior: 2, mid: 4, senior: 6, lead: 7, director: 9, exec: 10,
  };
  const HOURS_MAP: Record<string, number> = {
    under_6: 3, "6_7": 5, "8": 8, "9_10": 12, "10_12": 15, "12_plus": 18,
  };
  const EVENING_MAP: Record<string, number> = {
    rarely: 0, sometimes: 2, often: 4, always: 6,
  };
  const PROJECTS_MAP: Record<string, number> = {
    "1_2": 0, "3_5": 1, "6_10": 2, "10_plus": 3,
  };
  const END_OF_DAY_MAP: Record<string, number> = {
    great: -2, okay: 0, tired: 2, exhausted: 4,
  };
  const SWITCH_OFF_MAP: Record<string, number> = {
    easy: -1, some_effort: 0, hard: 2, very_hard: 3,
  };
  const SLEEP_MAP: Record<string, number> = {
    rarely: 0, sometimes: 1, often: 2, always: 3,
  };
  const EXERCISE_MAP: Record<string, number> = {
    "4_5": -2, "2_3": -1, "1_2": 0, rarely: 1, never: 2,
  };

  return {
    date_of_joining: p.date_of_joining,
    gender: p.gender,
    company_type: p.company_type === "Student" ? "Service" : p.company_type,
    wfh_setup_available: p.wfh_setup_available,
    designation: ROLE_MAP[p.role_level] ?? 4,
    resource_allocation: Math.min(20,
      (HOURS_MAP[p.hours_per_day] ?? 8) +
      (EVENING_MAP[p.evening_work] ?? 0) +
      (PROJECTS_MAP[p.projects_count] ?? 1),
    ),
    mental_fatigue_score: Math.min(10, Math.max(0,
      5 +
      (END_OF_DAY_MAP[p.end_of_day] ?? 0) +
      (SWITCH_OFF_MAP[p.switch_off] ?? 0) +
      (SLEEP_MAP[p.sleep_worries] ?? 0) +
      (EXERCISE_MAP[p.exercise] ?? 0),
    )),
  };
}

// ── Profile page ──────────────────────────────────────────────────────────────

function ProfilePage({
  initial,
  onSave,
}: {
  initial: UserProfileData | null;
  onSave: (p: UserProfileData) => void;
}) {
  const [form, setForm] = useState<UserProfileData>(initial ?? DEFAULT_PROFILE);
  const [saving, setSaving] = useState(false);

  const set = (key: keyof UserProfileData, value: string) =>
    setForm((f) => ({ ...f, [key]: value }));

  return (
    <div className="dashboard">
      <header className="dash-header">
        <div>
          <h1 className="dash-title">Work Profile</h1>
          <p className="dash-sub">
            Fill this in once. We use it to compute your burnout risk — update any time.
          </p>
        </div>
        <button
          className="btn-primary"
          disabled={saving}
          onClick={() => { setSaving(true); onSave(form); }}
        >
          {saving ? "Saving…" : "Save Profile"}
        </button>
      </header>

      <div className="profile-form">
        {/* ── Basics ── */}
        <div className="card profile-section">
          <h2 className="profile-section-title">Basics</h2>
          <div className="form-grid">
            <div className="field">
              <label className="field-label">
                {form.company_type === "Student" ? "When did you start your studies?" : "When did you start this job?"}
              </label>
              <input
                className="field-input"
                type="date"
                value={form.date_of_joining}
                onChange={(e) => set("date_of_joining", e.target.value)}
              />
            </div>
            <div className="field">
              <label className="field-label">Gender</label>
              <select className="field-input" value={form.gender} onChange={(e) => set("gender", e.target.value)}>
                <option>Male</option>
                <option>Female</option>
              </select>
            </div>
            <div className="field">
              <label className="field-label">What best describes you?</label>
              <select className="field-input" value={form.company_type} onChange={(e) => set("company_type", e.target.value)}>
                <option value="Service">Employee — Service (consulting, agency)</option>
                <option value="Product">Employee — Product (tech, SaaS)</option>
                <option value="Student">Student (university, bootcamp)</option>
              </select>
            </div>
            <div className="field">
              <label className="field-label">
                {form.company_type === "Student" ? "Do you study from home?" : "Can you work from home?"}
              </label>
              <select className="field-input" value={form.wfh_setup_available} onChange={(e) => set("wfh_setup_available", e.target.value)}>
                <option value="Yes">{form.company_type === "Student" ? "Yes, I study remotely" : "Yes, I have a WFH setup"}</option>
                <option value="No">{form.company_type === "Student" ? "No, I attend in person" : "No, office only"}</option>
              </select>
            </div>
          </div>
        </div>

        {/* ── Role ── */}
        <div className="card profile-section">
          <h2 className="profile-section-title">{form.company_type === "Student" ? "Your Level" : "Your Role"}</h2>
          <div className="field">
            <label className="field-label">What best describes your role?</label>
            <div className="role-options">
              {ROLE_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  className={`role-option ${form.role_level === opt.value ? "selected" : ""}`}
                  onClick={() => set("role_level", opt.value)}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* ── Workload ── */}
        <div className="card profile-section">
          <h2 className="profile-section-title">Your Workload</h2>
          <div className="profile-selects">
            {(["hours_per_day", "evening_work", "projects_count"] as const).map((key) => (
              <div key={key} className="field">
                <label className="field-label">{PROFILE_SELECTS[key].label}</label>
                <select
                  className="field-input"
                  value={form[key]}
                  onChange={(e) => set(key, e.target.value)}
                >
                  {PROFILE_SELECTS[key].options.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        </div>

        {/* ── Energy & Recovery ── */}
        <div className="card profile-section">
          <h2 className="profile-section-title">Your Energy &amp; Recovery</h2>
          <div className="profile-selects">
            {(["end_of_day", "switch_off", "sleep_worries", "exercise"] as const).map((key) => (
              <div key={key} className="field">
                <label className="field-label">{PROFILE_SELECTS[key].label}</label>
                <select
                  className="field-input"
                  value={form[key]}
                  onChange={(e) => set(key, e.target.value)}
                >
                  {PROFILE_SELECTS[key].options.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────


function RiskGauge({ score }: { score: number }) {
  const pct = Math.round(score * 100);
  const band = riskBand(score);
  const strokeColor =
    band === "low" ? "#16a34a" : band === "moderate" ? "#d97706" : "#dc2626";
  const dashArray = 220;
  const dashOffset = dashArray - (dashArray * pct) / 100;

  return (
    <div className="gauge-wrapper">
      <svg viewBox="0 0 100 75" className="gauge-svg">
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

function RiskLineChart({ items }: { items: AssessmentOut[] }) {
  const sorted = [...items].reverse().slice(-30);
  if (sorted.length === 0) {
    return (
      <p className="history-empty-inline">
        No assessments yet — run an analysis to start tracking.
      </p>
    );
  }

  const W = 600;
  const H = 200;
  const PAD = { top: 16, right: 24, bottom: 36, left: 40 };
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;

  const xStep = sorted.length > 1 ? innerW / (sorted.length - 1) : innerW;
  const toX = (i: number) => PAD.left + (sorted.length > 1 ? i * xStep : innerW / 2);
  const toY = (score: number) => PAD.top + innerH - score * innerH;

  // Build polyline points
  const points = sorted.map((a, i) => `${toX(i)},${toY(a.risk_score)}`).join(" ");

  // Area path (fill under line)
  const area =
    `M ${toX(0)},${toY(sorted[0].risk_score)} ` +
    sorted.slice(1).map((a, i) => `L ${toX(i + 1)},${toY(a.risk_score)}`).join(" ") +
    ` L ${toX(sorted.length - 1)},${PAD.top + innerH} L ${toX(0)},${PAD.top + innerH} Z`;

  // Reference lines at 35% and 65%
  const yLow = toY(0.35);
  const yHigh = toY(0.65);

  // Label every nth point so they don't crowd
  const labelEvery = sorted.length <= 7 ? 1 : sorted.length <= 14 ? 2 : 4;

  return (
    <div className="risk-line-chart-wrap">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="risk-line-chart-svg"
        aria-label="Risk score over time"
      >
        {/* Reference bands */}
        <rect
          x={PAD.left} y={PAD.top}
          width={innerW} height={yHigh - PAD.top}
          fill="#fef2f2" opacity="0.6"
        />
        <rect
          x={PAD.left} y={yHigh}
          width={innerW} height={yLow - yHigh}
          fill="#fffbeb" opacity="0.6"
        />
        <rect
          x={PAD.left} y={yLow}
          width={innerW} height={PAD.top + innerH - yLow}
          fill="#f0fdf4" opacity="0.6"
        />

        {/* Reference lines */}
        <line x1={PAD.left} y1={yLow} x2={PAD.left + innerW} y2={yLow}
          stroke="#86efac" strokeWidth="1" strokeDasharray="4 3" />
        <line x1={PAD.left} y1={yHigh} x2={PAD.left + innerW} y2={yHigh}
          stroke="#fca5a5" strokeWidth="1" strokeDasharray="4 3" />
        <text x={PAD.left + innerW + 4} y={yLow + 4} fontSize="9" fill="#16a34a">35%</text>
        <text x={PAD.left + innerW + 4} y={yHigh + 4} fontSize="9" fill="#dc2626">65%</text>

        {/* Y axis ticks */}
        {[0, 25, 50, 75, 100].map((pct) => {
          const y = toY(pct / 100);
          return (
            <g key={pct}>
              <line x1={PAD.left - 4} y1={y} x2={PAD.left} y2={y} stroke="#d0c8af" strokeWidth="1" />
              <text x={PAD.left - 6} y={y + 4} fontSize="9" fill="#a09a8e" textAnchor="end">{pct}</text>
            </g>
          );
        })}

        {/* Axes */}
        <line x1={PAD.left} y1={PAD.top} x2={PAD.left} y2={PAD.top + innerH}
          stroke="#d0c8af" strokeWidth="1" />
        <line x1={PAD.left} y1={PAD.top + innerH} x2={PAD.left + innerW} y2={PAD.top + innerH}
          stroke="#d0c8af" strokeWidth="1" />

        {/* Area fill */}
        <path d={area} fill="url(#lineGrad)" opacity="0.25" />
        <defs>
          <linearGradient id="lineGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#d97706" />
            <stop offset="100%" stopColor="#d97706" stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* Line */}
        <polyline
          points={points}
          fill="none"
          stroke="#d97706"
          strokeWidth="2"
          strokeLinejoin="round"
          strokeLinecap="round"
        />

        {/* Points */}
        {sorted.map((a, i) => {
          const cx = toX(i);
          const cy = toY(a.risk_score);
          const color =
            a.risk_band === "low" ? "#16a34a"
            : a.risk_band === "moderate" ? "#d97706"
            : "#dc2626";
          const d = new Date(a.created_at);
          const lbl = d.toLocaleDateString("en", { month: "short", day: "numeric" });
          return (
            <g key={a.id}>
              <circle cx={cx} cy={cy} r="4" fill={color} stroke="#fff" strokeWidth="1.5" />
              <title>{`${Math.round(a.risk_score * 100)}% ${a.risk_band} — ${lbl}`}</title>
              {i % labelEvery === 0 && (
                <text
                  x={cx}
                  y={PAD.top + innerH + 14}
                  fontSize="9"
                  fill="#6b6355"
                  textAnchor="middle"
                >
                  {lbl}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function HistoryPage({
  assessments,
  logs,
  historyTab,
  setHistoryTab,
  loading,
  sessionToken,
  onLogUpdate,
}: {
  assessments: AssessmentOut[];
  logs: LogOut[];
  historyTab: "assessments" | "logs";
  setHistoryTab: (t: "assessments" | "logs") => void;
  loading: boolean;
  sessionToken: string | null;
  onLogUpdate: (updated: LogOut) => void;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [saving, setSaving] = useState(false);

  const startEdit = (log: LogOut) => {
    setEditingId(log.id);
    setEditText(log.raw_text);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditText("");
  };

  const saveEdit = async (logId: string) => {
    if (!sessionToken || !editText.trim()) return;
    setSaving(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/wellness/logs/${logId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${sessionToken}`,
        },
        body: JSON.stringify({ text: editText.trim() }),
      });
      if (res.ok) {
        const updated = (await res.json()) as LogOut;
        onLogUpdate(updated);
        setEditingId(null);
        setEditText("");
      }
    } finally {
      setSaving(false);
    }
  };
  const latest = assessments[0];
  const trend = (() => {
    if (assessments.length < 2) return null;
    const diff = assessments[0].risk_score - assessments[1].risk_score;
    if (diff > 0.03) return "up";
    if (diff < -0.03) return "down";
    return "stable";
  })();

  return (
    <div className="dashboard">
      <header className="dash-header">
        <div>
          <h1 className="dash-title">Risk History</h1>
          <p className="dash-sub">
            Your burnout trend over time — updates every time you run an analysis.
          </p>
        </div>
        {latest && (
          <div
            className="risk-badge-large"
            style={{
              background: RISK_COLORS[latest.risk_band].bg,
              borderColor: RISK_COLORS[latest.risk_band].border,
              color: RISK_COLORS[latest.risk_band].text,
            }}
          >
            Latest: {Math.round(latest.risk_score * 100)}%
            {trend === "up" && " \u2191"}
            {trend === "down" && " \u2193"}
            {trend === "stable" && " \u2192"}
          </div>
        )}
      </header>

      <div className="history-tabs-row">
        <button
          className={`history-tab ${historyTab === "assessments" ? "active" : ""}`}
          onClick={() => setHistoryTab("assessments")}
        >
          Risk Assessments ({assessments.length})
        </button>
        <button
          className={`history-tab ${historyTab === "logs" ? "active" : ""}`}
          onClick={() => setHistoryTab("logs")}
        >
          Daily Logs ({logs.length})
        </button>
      </div>

      {loading ? (
        <div className="history-loading">Loading history\u2026</div>
      ) : historyTab === "assessments" ? (
        <div className="history-section">
          {assessments.length > 1 && (
            <div className="card" style={{ marginBottom: "1.25rem" }}>
              <h2 className="card-title">Risk Trend</h2>
              <RiskLineChart items={assessments} />
            </div>
          )}
          {assessments.length === 0 ? (
            <div className="card empty-state">
              <div className="empty-dot" />
              <h3 className="empty-title">No assessments yet</h3>
              <p className="empty-sub">
                Run an analysis from the Dashboard to start tracking your risk over time.
              </p>
            </div>
          ) : (
            <div className="assessment-list">
              {assessments.map((a) => {
                const d = new Date(a.created_at);
                const scoreColor =
                  a.risk_band === "low"
                    ? "#16a34a"
                    : a.risk_band === "moderate"
                    ? "#d97706"
                    : "#dc2626";
                return (
                  <div key={a.id} className="assessment-card card">
                    <div className="ac-left">
                      <span className="ac-date">
                        {d.toLocaleDateString("en", {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        })}
                      </span>
                      <span className="ac-time">
                        {d.toLocaleTimeString("en", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                      <span className="ac-mode">{a.mode}</span>
                    </div>
                    <div className="ac-score-col">
                      <span className="ac-score-num" style={{ color: scoreColor }}>
                        {Math.round(a.risk_score * 100)}%
                      </span>
                      <span
                        className="ac-band"
                        style={{
                          background: RISK_COLORS[a.risk_band].bg,
                          borderColor: RISK_COLORS[a.risk_band].border,
                          color: RISK_COLORS[a.risk_band].text,
                        }}
                      >
                        {RISK_COLORS[a.risk_band].label}
                      </span>
                    </div>
                    {a.top_contributors.length > 0 && (
                      <div className="ac-contributors">
                        {a.top_contributors.slice(0, 3).map((c) => (
                          <span
                            key={c.feature}
                            className={`contributor-chip ${c.direction}`}
                          >
                            <span className="chip-dir">
                              {c.direction === "increases_risk" ? "+" : "\u2212"}
                            </span>
                            <span className="chip-label">{cleanLabel(c.label)}</span>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        <div className="history-section">
          {logs.length === 0 ? (
            <div className="card empty-state">
              <div className="empty-dot" />
              <h3 className="empty-title">No daily logs yet</h3>
              <p className="empty-sub">
                Add daily check-ins from the Dashboard to track your mood and habits.
              </p>
            </div>
          ) : (
            <div className="log-list">
              {logs.map((l) => {
                const pol = l.blended_polarity;
                const dotColor =
                  pol > 0.15 ? "#16a34a" : pol < -0.15 ? "#dc2626" : "#a09a8e";
                const polLabel =
                  pol > 0.15 ? "Positive" : pol < -0.15 ? "Negative" : "Neutral";
                const isEditing = editingId === l.id;
                return (
                  <div key={l.id} className="log-card card">
                    <div className="lc-header">
                      <span className="lc-date">{l.log_date}</span>
                      <span className="lc-pol" style={{ color: dotColor }}>
                        <span className="lc-dot" style={{ background: dotColor }} />
                        {polLabel}
                      </span>
                      {l.user_polarity && (
                        <span className="lc-user-pol">marked: {l.user_polarity}</span>
                      )}
                      {!isEditing && (
                        <button
                          type="button"
                          className="lc-edit-btn"
                          onClick={() => startEdit(l)}
                        >
                          Edit
                        </button>
                      )}
                    </div>
                    {isEditing ? (
                      <div className="lc-edit-block">
                        <textarea
                          className="field-input log-textarea"
                          value={editText}
                          onChange={(e) => setEditText(e.target.value)}
                          rows={4}
                          autoFocus
                        />
                        <div className="lc-edit-actions">
                          <button
                            type="button"
                            className="btn-primary btn-sm"
                            disabled={saving}
                            onClick={() => void saveEdit(l.id)}
                          >
                            {saving ? "Saving…" : "Save"}
                          </button>
                          <button
                            type="button"
                            className="btn-secondary btn-sm"
                            disabled={saving}
                            onClick={cancelEdit}
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <p className="lc-text">{l.raw_text}</p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Streak helper ─────────────────────────────────────────────────────────────

function toLocalDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function computeStreak(items: AssessmentOut[]): number {
  if (!items.length) return 0;
  const dates = new Set(items.map((a) => toLocalDateStr(new Date(a.created_at))));
  const today = new Date();
  const todayStr = toLocalDateStr(today);
  const startOffset = dates.has(todayStr) ? 0 : 1;
  let streak = 0;
  for (let i = startOffset; i <= 365; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    if (dates.has(toLocalDateStr(d))) streak++;
    else break;
  }
  return streak;
}

// ── Main App ──────────────────────────────────────────────────────────────────

function App() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authMode, setAuthMode] = useState<"signin" | "signup">("signin");
  const [authError, setAuthError] = useState("");
  const [sessionToken, setSessionToken] = useState<string | null>(() =>
    localStorage.getItem(TOKEN_STORAGE_KEY),
  );
  const [userProfile, setUserProfile] = useState<UserProfileData | null>(null);

  const [burnoutResult, setBurnoutResult] = useState<WellnessBurnoutResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [hobbies, setHobbies] = useState<HobbyRow[]>([]);
  const [hobbyName, setHobbyName] = useState("");
  const [logNote, setLogNote] = useState("");
  const [dailyQ, setDailyQ] = useState({
    energy:    "" as string,
    sleep:     "" as string,
    stress:    "" as string,
    breaks:    "" as string,
  });
  const [wellnessMsg, setWellnessMsg] = useState("");
  const [wellnessMsgType, setWellnessMsgType] = useState<"info" | "error">("info");
  const [savingLog, setSavingLog] = useState(false);
  const [savingHobby, setSavingHobby] = useState(false);
  const [streak, setStreak] = useState<number | null>(null);

  // History
  const [activePage, setActivePage] = useState<"dashboard" | "history" | "profile">("dashboard");
  const [assessments, setAssessments] = useState<AssessmentOut[]>([]);
  const [logs, setLogs] = useState<LogOut[]>([]);
  const [historyTab, setHistoryTab] = useState<"assessments" | "logs">("assessments");
  const [historyLoading, setHistoryLoading] = useState(false);

  const isAuthenticated = useMemo(() => !!sessionToken, [sessionToken]);

  const showMsg = (msg: string, type: "info" | "error" = "info") => {
    setWellnessMsg(msg);
    setWellnessMsgType(type);
    setTimeout(() => setWellnessMsg(""), 4000);
  };

  useEffect(() => {
    if (!sessionToken) {
      setHobbies([]);
      setUserProfile(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const [hr, pr] = await Promise.all([
          fetch(`${API_BASE_URL}/api/wellness/hobbies`, {
            headers: { Authorization: `Bearer ${sessionToken}` },
          }),
          fetch(`${API_BASE_URL}/api/profile`, {
            headers: { Authorization: `Bearer ${sessionToken}` },
          }),
        ]);
        if (cancelled) return;
        if (hr.ok) {
          const data = (await hr.json()) as HobbyRow[];
          if (!cancelled) setHobbies(data);
        }
        if (pr.ok) {
          const p = (await pr.json()) as UserProfileData;
          if (!cancelled) setUserProfile(p);
        }
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sessionToken]);

  const loadHistory = async () => {
    if (!sessionToken) return;
    setHistoryLoading(true);
    try {
      const [ar, lr] = await Promise.all([
        fetch(`${API_BASE_URL}/api/assessments/history?limit=50`, {
          headers: { Authorization: `Bearer ${sessionToken}` },
        }),
        fetch(`${API_BASE_URL}/api/wellness/logs?days=90`, {
          headers: { Authorization: `Bearer ${sessionToken}` },
        }),
      ]);
      if (ar.ok) setAssessments((await ar.json()) as AssessmentOut[]);
      if (lr.ok) setLogs((await lr.json()) as LogOut[]);
    } finally {
      setHistoryLoading(false);
    }
  };

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
        setAuthError("Sign-in failed. Please try again.");
        return;
      }
      localStorage.setItem(TOKEN_STORAGE_KEY, token);
      setSessionToken(token);
      setShowAuthModal(false);
    } catch {
      setAuthError("Connection failed. Please check your network and try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleSignOut = () => {
    localStorage.removeItem(TOKEN_STORAGE_KEY);
    setSessionToken(null);
    setBurnoutResult(null);
    setActivePage("dashboard");
    setAssessments([]);
    setLogs([]);
    setUserProfile(null);
  };


  const saveProfile = async (p: UserProfileData) => {
    if (!sessionToken) return;
    try {
      const res = await fetch(`${API_BASE_URL}/api/profile`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${sessionToken}`,
        },
        body: JSON.stringify(p),
      });
      if (res.ok) {
        const saved = (await res.json()) as UserProfileData;
        setUserProfile(saved);
        setActivePage("dashboard");
        showMsg("Profile saved.");
      } else {
        showMsg("Couldn't save profile. Please try again.", "error");
      }
    } catch {
      showMsg("Connection failed. Please try again.", "error");
    }
  };

  const addHobby = async () => {
    const name = hobbyName.trim();
    if (!sessionToken || !name || savingHobby) return;
    setSavingHobby(true);
    try {
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
        showMsg(`"${row.name}" added to your habits.`);
      } else {
        showMsg("Couldn't add habit. Please try again.", "error");
      }
    } catch {
      showMsg("Connection failed. Please try again.", "error");
    } finally {
      setSavingHobby(false);
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
    }
  };

  const saveDailyLog = async () => {
    const freeText = logNote.trim();
    if (!sessionToken || savingLog) return;
    const parts: string[] = [];
    if (dailyQ.energy)  parts.push(`Energy today: ${dailyQ.energy}`);
    if (dailyQ.sleep)   parts.push(`Sleep last night: ${dailyQ.sleep}`);
    if (dailyQ.stress)  parts.push(`Stress level: ${dailyQ.stress}`);
    if (dailyQ.breaks)  parts.push(`Breaks taken: ${dailyQ.breaks}`);
    if (freeText)        parts.push(freeText);
    const text = parts.join(". ");
    if (!text) return;
    setSavingLog(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/wellness/logs`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${sessionToken}`,
        },
        body: JSON.stringify({ text } as { text: string }),
      });
      if (res.ok) {
        setLogNote("");
        setDailyQ({ energy: "", sleep: "", stress: "", breaks: "" });
        showMsg("Check-in saved — your next analysis will include it.");
      } else {
        showMsg("Couldn't save check-in. Please try again.", "error");
      }
    } catch {
      showMsg("Connection failed. Please try again.", "error");
    } finally {
      setSavingLog(false);
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
          work_profile: profileToBurnoutForm(userProfile!),
          lookback_days: 14,
          daily_signals: {
            energy: dailyQ.energy,
            sleep: dailyQ.sleep,
            stress: dailyQ.stress,
            breaks: dailyQ.breaks,
          },
        }),
      });
      const json = (await response.json()) as Record<string, unknown>;
      if (response.ok) {
        setBurnoutResult(json as unknown as WellnessBurnoutResult);
        // refresh streak in background
        void fetch(`${API_BASE_URL}/api/assessments/history?limit=60`, {
          headers: { Authorization: `Bearer ${sessionToken}` },
        }).then(async (r) => {
          if (r.ok) {
            const data = (await r.json()) as AssessmentOut[];
            setStreak(computeStreak(data));
            setAssessments(data);
          }
        });
      } else {
        showMsg("Analysis failed. Please try again.", "error");
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

  // ── Landing (unauthenticated) ─────────────────────────────────────────────

  if (!isAuthenticated) {
    return (
      <div className="landing">
        <nav className="nav">
          <div className="nav-inner">
            <div className="nav-brand">
              <img src="/favicon.svg" className="nav-logo-mark" alt="" />
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
            burnout risk early \u2014 giving you time to reset before it becomes a crisis.
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
              Three signals that tell you where you stand \u2014 and where you&apos;re heading.
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
                  desc: "See exactly which factors are driving your score \u2014 and which ones are protecting you.",
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
                    placeholder="your@email.com"
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

  // ── Authenticated shell ───────────────────────────────────────────────────

  return (
    <div className="app">
      <nav className="nav nav-app">
        <div className="nav-inner">
          <div className="nav-brand">
            <div className="nav-logo-mark" />
            <span className="nav-name">Recharge</span>
          </div>
          <div className="nav-links">
            <button
              className={`nav-link nav-link-btn ${activePage === "dashboard" ? "nav-link-active" : ""}`}
              onClick={() => setActivePage("dashboard")}
            >
              Dashboard
            </button>
            <button
              className={`nav-link nav-link-btn ${activePage === "history" ? "nav-link-active" : ""}`}
              onClick={() => { setActivePage("history"); void loadHistory(); }}
            >
              History
            </button>
            <button
              className={`nav-link nav-link-btn ${activePage === "profile" ? "nav-link-active" : ""}`}
              onClick={() => setActivePage("profile")}
            >
              Profile
            </button>
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

      {activePage === "history" ? (
        <HistoryPage
          assessments={assessments}
          logs={logs}
          historyTab={historyTab}
          setHistoryTab={setHistoryTab}
          loading={historyLoading}
          sessionToken={sessionToken}
          onLogUpdate={(updated) =>
            setLogs((prev) => prev.map((l) => (l.id === updated.id ? updated : l)))
          }
        />
      ) : activePage === "profile" ? (
        <ProfilePage
          initial={userProfile}
          onSave={(p) => void saveProfile(p)}
        />
      ) : (
        <div className="dashboard">
          <header className="dash-header">
            <div>
              <h1 className="dash-title">Burnout Risk Assessment</h1>
              <p className="dash-sub">
                {userProfile ? "Your work profile is loaded — add a check-in and analyze." : "Set up your work profile to get a personalized risk score."}
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
            <div className="card form-card">
              {userProfile ? (
                <>
                  <div className="profile-summary-header">
                    <h2 className="card-title" style={{ margin: 0 }}>Work Profile</h2>
                    <button
                      type="button"
                      className="btn-secondary btn-sm"
                      onClick={() => setActivePage("profile")}
                    >
                      Edit
                    </button>
                  </div>
                  <div className="profile-summary-grid">
                    <div className="ps-item">
                      <span className="ps-label">Role</span>
                      <span className="ps-value">
                        {ROLE_OPTIONS.find((r) => r.value === userProfile.role_level)?.label ?? userProfile.role_level}
                      </span>
                    </div>
                    <div className="ps-item">
                      <span className="ps-label">{userProfile.company_type === "Student" ? "Study" : "Company"}</span>
                      <span className="ps-value">
                        {userProfile.company_type === "Student" ? "Student" : userProfile.company_type}
                        {" · "}
                        {userProfile.company_type === "Student"
                          ? (userProfile.wfh_setup_available === "Yes" ? "Remote" : "In-person")
                          : `WFH ${userProfile.wfh_setup_available}`}
                      </span>
                    </div>
                    <div className="ps-item">
                      <span className="ps-label">Hours/day</span>
                      <span className="ps-value">
                        {PROFILE_SELECTS.hours_per_day.options.find((o) => o.value === userProfile.hours_per_day)?.label ?? userProfile.hours_per_day}
                      </span>
                    </div>
                    <div className="ps-item">
                      <span className="ps-label">Evening work</span>
                      <span className="ps-value">
                        {PROFILE_SELECTS.evening_work.options.find((o) => o.value === userProfile.evening_work)?.label ?? userProfile.evening_work}
                      </span>
                    </div>
                    <div className="ps-item">
                      <span className="ps-label">End of day</span>
                      <span className="ps-value">
                        {PROFILE_SELECTS.end_of_day.options.find((o) => o.value === userProfile.end_of_day)?.label ?? userProfile.end_of_day}
                      </span>
                    </div>
                    <div className="ps-item">
                      <span className="ps-label">Switch off</span>
                      <span className="ps-value">
                        {PROFILE_SELECTS.switch_off.options.find((o) => o.value === userProfile.switch_off)?.label ?? userProfile.switch_off}
                      </span>
                    </div>
                  </div>
                </>
              ) : (
                <div className="profile-empty-state">
                  <p className="profile-empty-text">
                    You haven&apos;t set up your work profile yet.
                  </p>
                  <button
                    type="button"
                    className="btn-primary"
                    onClick={() => setActivePage("profile")}
                  >
                    Set up profile
                  </button>
                </div>
              )}

              <div className="divider" />
              <h3 className="subsection-title">Today&apos;s check-in</h3>
              <p className="subsection-hint">
                Quick snapshot of today. These signals blend with your profile when you Analyze.
              </p>

              <div className="daily-qs">
                {([
                  {
                    key: "energy" as const,
                    label: "How's your energy?",
                    options: ["Great", "Good", "Low", "Drained"],
                  },
                  {
                    key: "sleep" as const,
                    label: "Sleep last night?",
                    options: ["Refreshing", "Okay", "Restless", "Very poor"],
                  },
                  {
                    key: "stress" as const,
                    label: "Stress level today?",
                    options: ["Calm", "Mild", "High", "Overwhelming"],
                  },
                  {
                    key: "breaks" as const,
                    label: "Breaks taken?",
                    options: ["Several", "One or two", "Barely", "None"],
                  },
                ] as const).map(({ key, label, options }) => (
                  <div key={key} className="daily-q-row">
                    <span className="daily-q-label">{label}</span>
                    <div className="daily-q-options">
                      {options.map((opt) => (
                        <button
                          key={opt}
                          type="button"
                          className={`daily-q-btn ${dailyQ[key] === opt ? "selected" : ""}`}
                          onClick={() => setDailyQ((q) => ({ ...q, [key]: dailyQ[key] === opt ? "" : opt }))}
                        >
                          {opt}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              <div className="divider" />
              <h3 className="subsection-title">Hobbies &amp; notes</h3>
              <p className="subsection-hint">
                Add hobbies you want to protect. Jot extra notes below — we auto-detect mood and flag habit slip when you Analyze.
              </p>
              <div className="wellness-row">
                <input
                  className="field-input hobby-input"
                  placeholder="e.g. piano, climbing, journaling"
                  value={hobbyName}
                  onChange={(e) => setHobbyName(e.target.value)}
                />
                <button type="button" className="btn-secondary" disabled={savingHobby || !hobbyName.trim()} onClick={() => void addHobby()}>
                  {savingHobby ? "Adding…" : "Add"}
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
                <button type="button" className="btn-secondary" disabled={savingLog} onClick={() => void saveDailyLog()}>
                  {savingLog ? "Saving…" : "Save check-in"}
                </button>
              </div>
              {wellnessMsg && (
                <p className={`wellness-toast${wellnessMsgType === "error" ? " wellness-toast-error" : ""}`}>
                  {wellnessMsg}
                </p>
              )}

              <div className="analyze-actions">
                {!userProfile ? (
                  <div className="no-profile-nudge">
                    <p className="no-profile-text">Set up your profile to run an analysis.</p>
                    <button
                      type="button"
                      className="btn-secondary btn-full"
                      onClick={() => setActivePage("profile")}
                    >
                      Go to Profile
                    </button>
                  </div>
                ) : (
                  <button
                    className="btn-primary btn-full"
                    type="button"
                    disabled={loading}
                    onClick={() => void predictBurnoutWithWellness()}
                  >
                    {loading ? (
                      <span className="loading-dots">
                        Analyzing<span>.</span><span>.</span><span>.</span>
                      </span>
                    ) : (
                      "Analyze"
                    )}
                  </button>
                )}
              </div>
            </div>

            {burnoutResult ? (
              <div className="results-col">
                <div className="card">
                  <div className="risk-score-header">
                    <h2 className="card-title" style={{ margin: 0 }}>Risk Score</h2>
                    {streak !== null && streak > 0 && (
                      <span className="streak-badge">
                        {streak >= 7 ? "🔥" : "✓"} {streak} day streak
                      </span>
                    )}
                  </div>
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
                      {/* Daily signal notes — what the check-in questions changed */}
                      {burnoutResult.daily_signal_notes && burnoutResult.daily_signal_notes.length > 0 && (
                        <div className="signal-notes">
                          <span className="signal-notes-label">Today&apos;s check-in adjustments</span>
                          <ul className="signal-notes-list">
                            {burnoutResult.daily_signal_notes.map((note, i) => (
                              <li key={i}>{note}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {burnoutResult.mental_fatigue_base !== undefined &&
                        burnoutResult.mental_fatigue_adjusted !== undefined && (
                          <p className="fatigue-adjust">
                            Fatigue: <strong>{burnoutResult.mental_fatigue_base.toFixed(1)}</strong>
                            {" \u2192 "}
                            <strong>{burnoutResult.mental_fatigue_adjusted.toFixed(1)}</strong>
                            {burnoutResult.resource_allocation_adjusted !== undefined && (
                              <> &nbsp;·&nbsp; Workload adjusted to <strong>{burnoutResult.resource_allocation_adjusted.toFixed(1)}</strong></>
                            )}
                            {" "}
                            <span className="logs-used">
                              ({burnoutResult.logs_used} log{burnoutResult.logs_used !== 1 ? "s" : ""})
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

                {burnoutResult.recommendations && burnoutResult.recommendations.length > 0 && (
                  <div className="card suggestions-card">
                    <h2 className="card-title">What to do</h2>
                    <ul className="suggestions-list">
                      {burnoutResult.recommendations.map((tip, i) => (
                        <li key={i} className="suggestion-item">{tip}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            ) : (
              <div className="results-col">
                <div className="card empty-state">
                  <div className="empty-dot" />
                  <h3 className="empty-title">Your results will appear here</h3>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
