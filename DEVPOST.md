## Inspiration

Burnout is invisible until it breaks you. We've all pushed through exhausted weeks telling ourselves "just one more sprint" — only to hit a wall. The problem is there's no early warning system. Existing wellness apps track moods reactively; they don't predict risk before it peaks. We wanted to build something that could tell you *before* you burn out, not after.

---

## What it does

Recharge is a burnout risk prediction and daily wellness tracking app. Users input their work profile — role, workload, mental fatigue, remote setup — and an ML model scores their burnout risk (low/moderate/high) along with an 8-week projected risk trajectory. A SHAP-powered breakdown explains exactly which factors are driving the score.

Beyond prediction, users log short daily check-ins in plain text. Recharge runs lightweight NLP sentiment analysis on each entry and matches mentions of personal hobbies, blending user self-rating with automated sentiment to track wellness trends over time. The result: a personalized picture of risk *and* recovery.

---

## How we built it

- **Backend**: FastAPI with SQLAlchemy + SQLite for rapid prototyping. JWT auth (bcrypt + PyJWT) with 7-day tokens.
- **ML**: XGBoost classifier trained on HackerEarth employee burnout data, with SMOTE to handle class imbalance. SHAP values surface top contributing factors per prediction. Model artifacts serialized via joblib.
- **NLP**: Entirely rule-based sentiment engine — no external ML library dependency. Keyword substring matching ties daily logs to user-registered hobbies.
- **Frontend**: React 19 + TypeScript + Vite, single-page dashboard with live risk visualization, weekly projections, and a daily journal UI.
- **Infra**: Deployed on Render (backend) and Vercel (frontend). GitHub Actions CI runs linting and builds on every push.

---

## Challenges we ran into

- **Class imbalance in training data**: Burnout is rare in real datasets. Without SMOTE, the model defaulted to predicting "no burnout" for nearly everything — precision looked good but recall was terrible.
- **SHAP + XGBoost serialization**: Getting SHAP explanations to survive joblib round-trips without re-loading the full training environment required careful artifact versioning.
- **Blended sentiment scoring**: Deciding how much to trust user self-reported polarity vs. NLP-inferred polarity required tuning — users often rate their day higher than the text suggests (or vice versa).
- **Cold-start UX**: New users have no history. Making the risk score feel meaningful without weeks of data meant leaning entirely on the work profile model, which required careful framing in the UI.

---

## Accomplishments that we're proud of

- An end-to-end ML pipeline — data → SMOTE → XGBoost → SHAP — that produces explainable, per-user risk breakdowns, not just a black-box score.
- A fully custom NLP sentiment layer with zero ML library dependencies that still produces reasonable polarity signals.
- A clean, focused UI that surfaces complex model output (8-week projections, SHAP contributors) without overwhelming the user.
- Full JWT auth, hobby CRUD, daily logging, and burnout prediction all shipping in a single hackathon sprint.

---

## What we learned

- Explainability matters more than accuracy in wellness tools. Users won't trust a score they can't interrogate — SHAP was the right call.
- Rule-based NLP is underrated for constrained domains. Sentiment over short journal entries doesn't need transformers; a well-tuned keyword approach is fast, debuggable, and good enough.
- Designing for emotional context is different from designing for utility. Risk scores feel harsh without framing — tone in the UI copy matters as much as the model output.

---

## What's next for Recharge

- **Integrate the 150k-row student mental health dataset** already in the repo to train a student-specific risk model alongside the employee one.
- **Push notifications / weekly digests** — passive risk monitoring via email or mobile alerts when trajectory worsens.
- **Therapist / counselor integration** — let users share their risk report with a professional with one click.
- **Richer NLP** — swap the rule-based engine for a lightweight fine-tuned model (DistilBERT or similar) for more nuanced journal sentiment.
- **Team-level dashboards** — aggregate anonymized risk scores for managers to spot team-wide burnout patterns early.
