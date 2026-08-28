# Recipient Shield

**Financial Account Takeover Early-Warning & Transfer Protection System**
Team Sorting Scripts -- CSI-VITC Origins 2026, Track: FinSec & CyberFinance

> Detect compromised recipient accounts and warn senders **before** their
> money reaches an attacker -- by analyzing the **recipient's** recent
> behavioral activity, not just the sender's.

This is a hackathon prototype. **No real bank is connected, no real money
moves, and all accounts/transactions/behavioral events are simulated.**
The ML model is trained and evaluated entirely on synthetic data.

---

## 1. How it works

```
React frontend  --->  FastAPI REST API  --->  Recipient Risk Engine  --->  ML model (RandomForest)  --->  SQLite
   (Vite)                                      (feature engineering,          (trained on synthetic
                                                 explainability)                behavioral sequences)
```

1. Sender A picks a trusted recipient (B) and enters an amount.
2. **Before** the transfer completes, Recipient Shield pulls B's recent
   account-activity sequence (logins, device changes, password/SIM
   changes, beneficiary edits, transactions...) and runs it through a
   trained ML model.
3. The model outputs a 0-100 risk score, which maps to one of three
   decisions via a central, configurable threshold table
   (`backend/app/config.py`):

   | Score | Level | Action |
   |---|---|---|
   | 0-29 | LOW | **ALLOW** |
   | 30-69 | MEDIUM | **VERIFY** (step-up verification) |
   | 70-100 | HIGH | **WARN & HOLD** (transfer paused) |

4. The frontend shows a full "Recipient Shield Security Check" screen:
   risk gauge, plain-English reasons, a point-by-point explanation
   ("+25 New device", "+20 Password reset", ...), and the recipient's
   behavioral timeline with suspicious events highlighted.

The **key differentiator** is sequence-based detection: a lone password
reset looks very different from a password-reset-then-SIM-change-then-
new-beneficiary five minutes later. See `backend/app/risk/features.py`
and `backend/app/risk/scenarios.py`.

---

## 2. IMPORTANT -- read this before running

This project was built in a cloud sandbox whose network is locked down
(no access to PyPI or the npm registry), so `pip install` / `npm install`
could **not** be run or tested there. Every file uses the exact stack you
asked for (FastAPI, SQLAlchemy, Pydantic, RandomForest / scikit-learn on
the backend; React, Vite, Tailwind CSS, Recharts, Axios on the frontend)
and is standard, hand-checked code -- but the two install steps below
have not been exercised end-to-end on a live install. What **was** fully
tested inside that sandbox (using the subset of scikit-learn / pandas /
numpy / pydantic that happened to be pre-installed there):

- The entire ML pipeline: synthetic data generation, model training,
  evaluation metrics (`python -m app.ml.train_model`).
- The entire risk-scoring core end-to-end against the 3 canonical demo
  accounts (`python backend/verify_demo_accounts.py` -- see output below).
- Every Python file's syntax (`py_compile`) and every React/JSX file's
  syntax + local-import graph (via `esbuild`).
- Every API response shape (Pydantic schemas) against every field the
  frontend actually reads, cross-checked by hand and by `grep`.

What you should do on your first run: follow the steps below exactly, and
if anything errors, it's most likely a version pin in `requirements.txt`
/ `package.json` -- loosen the pin and retry. This is standard, widely
used tooling, so it should be a smooth install on a normal
internet-connected machine.

---

## 3. Setup

### Prerequisites
- Python 3.10+
- Node.js 18+
- Windows, macOS or Linux

### Backend

```powershell
# from the project root
cd backend
python -m venv venv

# Windows
venv\Scripts\activate
# macOS / Linux
source venv/bin/activate

pip install -r requirements.txt

# Generate synthetic training data + train the model (also happens
# automatically on first server start, but running it explicitly first
# lets you see the evaluation metrics printed to the console)
python -m app.ml.train_model

# Sanity-check the risk engine against the 3 canonical demo accounts
python verify_demo_accounts.py

# Start the API (also auto-creates the DB and seeds demo data on first run)
python -m uvicorn app.main:app --reload
```

The API is now at **http://127.0.0.1:8000** (interactive docs at
`/docs`). Health check: `GET /api/health`.

### Frontend

In a second terminal:

```powershell
cd frontend
npm install
npm run dev
```

Open **http://localhost:5173**. The Vite dev server proxies `/api/*` to
the backend on port 8000 (see `vite.config.js`), so no CORS setup is
needed in dev.

### Demo login

```
username: priya.sharma
password: demo1234
```

---

## 4. Demo script (matches the hackathon judging flow)

1. **Sign in** as `priya.sharma`.
2. Go to **Send money**, pick recipient **Amit Singh** (the seeded
   compromised account), enter e.g. ₹10,000, click **Continue Transfer**.
3. Watch the **Recipient Shield Security Check** screen: risk score,
   HIGH risk, reasons (new device, password reset, SIM change, new
   beneficiary...), the behavioral timeline, and the explanation panel.
4. The transfer is **held** -- no money moves.
5. Go to **Attack Simulation** and click **Run Account Takeover
   Simulation** for the full animated step-by-step attack sequence and
   detection.
6. Use the three **Quick scenario triggers** to show, back to back:
   - Normal Account Simulation -> **LOW risk -> ALLOW**
   - Medium Risk Simulation -> **MEDIUM risk -> VERIFY**
   - Compromised Account Simulation -> **HIGH risk -> WARN & HOLD**
7. Go to **Security Analytics** for the fleet-wide dashboard: risk
   distribution, suspicious event frequency, risk over time, and the
   model's real evaluation metrics (accuracy / precision / recall / F1 /
   confusion matrix / detection rate / false-positive rate), computed
   from the synthetic test split -- not hardcoded.

---

## 5. What was actually verified in the build sandbox

```
$ python -m app.ml.train_model
accuracy: 0.9685   precision: 0.8986   recall / detection_rate: 0.9852
false_positive_rate: 0.0371   f1_score: 0.9399
medium_risk_routing.correctly_routed_rate: 1.0
(evaluated on a held-out split of 6,000 simulated behavioral sequences)

$ python verify_demo_accounts.py
[PASS] ACCOUNT 1 - Normal Recipient       -> LOW    (score 10.4)  decision=ALLOW
[PASS] ACCOUNT 3 - Medium Risk Recipient  -> MEDIUM (score 48.1)  decision=VERIFY
[PASS] ACCOUNT 2 - Compromised Recipient  -> HIGH   (score 97.9)  decision=WARN_AND_HOLD
ALL CHECKS PASSED
```

The ≥90% detection-rate target from the hackathon proposal is met
(98.5%), computed honestly from the synthetic test set -- see
`backend/app/ml/train_model.py` for exactly how "detected" and
"false positive" are defined (a MEDIUM-risk call on a genuinely
compromised account still counts as "detected" because it triggers
step-up verification rather than silently allowing the transfer;
see the code comments for the full reasoning).

---

## 6. Project structure

```
backend/
  app/
    main.py              FastAPI app, CORS, startup (auto-seed, auto-train)
    config.py             central config: risk thresholds, weights, JWT, etc.
    models.py              SQLAlchemy models (users, accounts, account_events,
                            recipients, transactions, risk_assessments)
    schemas.py             Pydantic request/response schemas
    security.py             demo auth: PBKDF2 password hashing + JWT
    events.py                 catalog of simulated account-event types
    seed.py                    seeds the 3 canonical demo accounts
    risk/
      scenarios.py         normal / medium / compromised event-sequence builders
                            (single source of truth for seed data, ML training
                            data, AND the live simulation endpoints)
      features.py            behavioral feature engineering (sequence-based)
      teacher.py               transparent weighted-sum scorer used only to
                                generate ML training targets
      engine.py                  loads the trained model, runs inference,
                                  central risk-assessment orchestration
      explain.py                  explainable-AI feature-contribution layer
    ml/
      generate_data.py      synthetic dataset generator (thousands of sequences)
      train_model.py          trains RandomForestRegressor + evaluation metrics
      artifacts/                 trained model + metrics.json (checked in)
    routers/                auth, accounts, recipients, transfers, risk,
                             simulation, analytics
  verify_demo_accounts.py  standalone risk-engine sanity check (no DB needed)
  requirements.txt

frontend/
  src/
    pages/                 Login, Dashboard, Transfer, TransactionHistory,
                            RecipientTimeline, SecurityAnalytics, Simulation
    components/             RecipientShieldScreen, RiskGauge, Timeline,
                             ExplanationCard, AppShell, charts/
    context/AuthContext.jsx
    api/client.js            axios instance (JWT auto-attached)
    useHashRoute.js            tiny dependency-free router
  package.json
  tailwind.config.js
```

---

## 7. API reference

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/auth/login` | Sign in, get a JWT |
| GET | `/api/accounts/{id}` | Account details |
| GET | `/api/accounts/{id}/activity` | Raw event history |
| GET | `/api/accounts/{id}/transactions` | Transaction history |
| GET | `/api/recipients` | Sender's trusted recipients |
| **POST** | **`/api/transfers/check-risk`** | **The critical endpoint** -- risk-checks a recipient before transfer |
| POST | `/api/transfers` | Finalize/cancel a transfer (subject to the risk decision) |
| GET | `/api/transfers` | Transfer history |
| GET | `/api/risk/{id}` | Standalone current risk assessment |
| GET | `/api/risk/{id}/timeline` | Behavioral timeline |
| POST | `/api/simulation/normal` / `/medium-risk` / `/compromised` | Reset a demo account to that archetype |
| GET | `/api/analytics` | Fleet-wide security analytics + model metrics |
| GET | `/api/health` | Health check |

Full interactive docs at `/docs` once the backend is running.

---

## 8. Security notes (prototype scope)

- No real banking credentials, accounts, or transactions are ever used.
- Passwords are hashed with salted PBKDF2-HMAC-SHA256 (stdlib `hashlib`,
  200k iterations) -- not bcrypt, to avoid a native-compiled dependency
  for a hackathon demo; JWTs via PyJWT.
- CORS is restricted to the Vite dev origins in `app/config.py`.
- All amounts are illustrative (INR) and never leave the local database.
- `DISCLAIMER` in `app/config.py` is surfaced in the API and the UI.

## 9. References

- E. A. Lopez-Rojas, A. Elmir & S. Axelsson, *PaySim: A Financial Mobile
  Money Simulator for Fraud Detection*, 2016 (fraud-simulation concept).
- RBI, *Master Directions on Fraud Risk Management*, 2024 (early-warning
  signal concepts).
- All model weights, feature engineering, and the risk-scoring engine in
  this repository are original work for this hackathon.
