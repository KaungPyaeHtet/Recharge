"""Lightweight rule-based sentiment and hobby matching for daily activity text."""

from __future__ import annotations

import re
from dataclasses import dataclass

# Substrings (lowercased) — keeps dependencies zero; swap for a real model later
_POSITIVE = (
    "great",
    "good",
    "rest",
    "relaxed",
    "happy",
    "walk",
    "exercise",
    "gym",
    "run",
    "yoga",
    "read",
    "friend",
    "family",
    "sleep",
    "vacation",
    "break",
    "fun",
    "progress",
    "finished",
    "celebrate",
    "grateful",
    "calm",
    "meditat",
    "hobby",
    "music",
    "nature",
    "productive",
)
_NEGATIVE = (
    "exhaust",
    "burn",
    "overwork",
    "stress",
    "anxious",
    "panic",
    "depress",
    "angry",
    "fight",
    "deadline",
    "all-nighter",
    "all nighter",
    "skip",
    "no sleep",
    "insomnia",
    "cry",
    "overwhelm",
    "toxic",
    "quit",
    "hopeless",
    "late",
    "crunch",
    "drain",
)


def _tokenize(text: str) -> set[str]:
    return set(re.findall(r"[a-z0-9]+", text.lower()))


def polarity_from_text(text: str) -> float:
    """Return score in [-1, 1] from keyword overlap."""
    if not text or not text.strip():
        return 0.0
    low = text.lower()
    pos = sum(1 for w in _POSITIVE if w in low)
    neg = sum(1 for w in _NEGATIVE if w in low)
    tokens = _tokenize(text)
    if "plus" in tokens:
        pos += 1
    if "minus" in tokens:
        neg += 1
    if pos == 0 and neg == 0:
        return 0.0
    return max(-1.0, min(1.0, (pos - neg) / max(pos + neg, 1)))


def user_polarity_numeric(polarity: str | None) -> float | None:
    if polarity is None:
        return None
    p = polarity.strip().lower()
    if p in ("plus", "+", "positive", "up"):
        return 1.0
    if p in ("minus", "-", "negative", "down"):
        return -1.0
    if p in ("neutral", "0", "flat"):
        return 0.0
    return None


@dataclass
class HobbyMatch:
    hobby_id: str
    hobby_name: str


def match_hobbies(text: str, hobbies: list[tuple[str, str]]) -> list[HobbyMatch]:
    """Match hobby id/name if name appears in text (case-insensitive)."""
    if not text.strip():
        return []
    low = text.lower()
    found: list[HobbyMatch] = []
    for hid, name in hobbies:
        n = name.strip().lower()
        if len(n) >= 2 and n in low:
            found.append(HobbyMatch(hobby_id=hid, hobby_name=name.strip()))
    return found
