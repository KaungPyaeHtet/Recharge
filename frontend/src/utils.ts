export const RISK_COLORS = {
  low:      { bg: "#f0fdf4", border: "#86efac", text: "#166534", label: "Low Risk" },
  moderate: { bg: "#fffbeb", border: "#fcd34d", text: "#92400e", label: "Moderate Risk" },
  high:     { bg: "#fff1f2", border: "#fca5a5", text: "#991b1b", label: "High Risk" },
};

export const WARNING_STYLES = {
  stable:   { bg: "#f0fdf4", border: "#86efac", text: "#166534" },
  watch:    { bg: "#eff6ff", border: "#93c5fd", text: "#1e40af" },
  warning:  { bg: "#fffbeb", border: "#fcd34d", text: "#92400e" },
  critical: { bg: "#fff1f2", border: "#fca5a5", text: "#991b1b" },
};

const LABEL_OVERRIDES: Record<string, string> = {
  mental_fatigue_score: "Mental Fatigue",
  resource_allocation:  "Workload",
  designation:          "Seniority Level",
  tenure_days:          "Time at Company",
  wfh_setup_available:  "Remote Work Access",
  company_type:         "Company Type",
  gender:               "Gender",
};

export function cleanLabel(raw: string): string {
  const lower = raw.toLowerCase().replace(/\s+/g, "_");
  for (const [key, label] of Object.entries(LABEL_OVERRIDES)) {
    if (lower.includes(key)) return label;
  }
  return raw
    .replace(/^(cat|num)\s+/i, "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

export function riskBand(score: number): "low" | "moderate" | "high" {
  return score < 0.35 ? "low" : score < 0.65 ? "moderate" : "high";
}
