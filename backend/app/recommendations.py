"""Rule-based personalised recovery recommendations."""
from __future__ import annotations

from typing import Any


_STUDENT_RULES: list[tuple[str, float, str]] = [
    # (feature_key_fragment, shap_positive_threshold, recommendation)
    ("anxiety", 0.0, "Practice 5-minute box breathing before study sessions to lower anxiety."),
    ("depression", 0.0, "Reach out to a friend or counsellor — social connection reduces depression."),
    ("stress_level", 0.0, "Break large tasks into 25-minute focused sprints (Pomodoro) to cut perceived stress."),
    ("sleep_quality", 0.0, "Set a consistent sleep schedule — even one extra hour improves focus within a week."),
    ("daily_sleep", 0.0, "Aim for 7–9 hours. Poor sleep amplifies every other burnout driver."),
    ("screen_time", 0.0, "Put a 30-minute screen-free buffer before bed to improve sleep quality."),
    ("academic_pressure", 0.0, "Talk to your academic advisor about workload — deadlines are often more flexible than they feel."),
    ("financial_stress", 0.0, "Check your institution's emergency fund or scholarship board — many go unclaimed."),
    ("social_support", 0.0, "Join one study group or campus club — even light social contact buffers burnout."),
    ("physical_activity", 0.0, "Add a 20-minute walk between study blocks; movement is the fastest cortisol reset."),
    ("attendance", 0.0, "If attendance is slipping, email your lecturer early — proactive contact prevents compounding stress."),
    ("cgpa", 0.0, "Talk to a tutor about targeted weak spots rather than re-reading everything."),
    ("daily_study", 0.0, "Study in 50-minute blocks with 10-minute breaks rather than marathon sessions."),
]

_PROFESSIONAL_RULES: list[tuple[str, str]] = [
    ("mental_fatigue", "Schedule a full recovery day this week — mental fatigue compounds fast."),
    ("resource_allocation", "Flag workload overload to your manager. Sustained overallocation predicts burnout within weeks."),
    ("designation", "High-seniority roles carry hidden context-switching costs — protect at least 2-hour focus blocks daily."),
    ("wfh_setup", "Invest in a proper WFH workspace — ergonomics and light quality directly affect fatigue."),
    ("tenure_days", "New hires carry adjustment stress. Set 90-day expectations with your manager explicitly."),
    ("company_type", "Service-industry pace differs from product companies — calibrate output expectations accordingly."),
    ("gender", ""),  # skip gender recommendations
]

_ALWAYS_STUDENT = [
    "Drink water consistently — even mild dehydration reduces cognitive performance by ~10%.",
    "Take at least one completely study-free hour per day.",
]

_ALWAYS_PROFESSIONAL = [
    "Protect at least 30 minutes of non-screen time daily.",
    "Write three things that went well each evening — gratitude journaling lowers cortisol.",
]


def _match_student(contributors: list[dict[str, Any]]) -> list[str]:
    tips: list[str] = []
    seen: set[str] = set()
    for c in contributors:
        feat = c.get("feature", "").lower()
        direction = c.get("direction", "")
        if direction != "increases_risk":
            continue
        for key, _thresh, tip in _STUDENT_RULES:
            if key in feat and tip and tip not in seen:
                tips.append(tip)
                seen.add(tip)
                break
    return tips


def _match_professional(contributors: list[dict[str, Any]]) -> list[str]:
    tips: list[str] = []
    seen: set[str] = set()
    for c in contributors:
        feat = c.get("feature", "").lower()
        direction = c.get("direction", "")
        if direction != "increases_risk":
            continue
        for key, tip in _PROFESSIONAL_RULES:
            if key in feat and tip and tip not in seen:
                tips.append(tip)
                seen.add(tip)
                break
    return tips


def get_recommendations(
    mode: str,
    risk_band: str,
    contributors: list[dict[str, Any]],
) -> list[str]:
    """Return up to 5 personalised tips ordered by contributor importance."""
    if mode == "student":
        tips = _match_student(contributors)
        always = _ALWAYS_STUDENT
    else:
        tips = _match_professional(contributors)
        always = _ALWAYS_PROFESSIONAL

    combined = tips[:4]
    for tip in always:
        if tip not in combined:
            combined.append(tip)
        if len(combined) >= 5:
            break

    if risk_band == "high":
        combined.insert(0, "Your risk is high — consider speaking to a professional counsellor or GP this week.")

    return combined[:6]
