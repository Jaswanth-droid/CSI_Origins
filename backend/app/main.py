"""
Recipient Shield FastAPI application entrypoint.

Run:  python -m uvicorn app.main:app --reload   (from the backend/ directory)

On startup, this will:
  1. Create the SQLite tables if they don't exist
  2. Train the ML model if no trained model artifact exists yet
  3. Seed demo data if the users table is empty
so a completely clean checkout can go from `pip install -r requirements.txt`
to a fully working demo with a single command.
"""
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import APP_NAME, APP_VERSION, DISCLAIMER, CORS_ORIGINS, MODEL_PATH
from app.database import init_db, SessionLocal
from app import models


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()

    if not MODEL_PATH.exists():
        from app.ml.train_model import train
        train()

    db = SessionLocal()
    try:
        if db.query(models.User).count() == 0:
            from app.seed import seed
            seed(reset=False)
    finally:
        db.close()

    yield  # app runs here


app = FastAPI(
    title=APP_NAME,
    version=APP_VERSION,
    description=(
        "Financial Account Takeover Early-Warning & Transfer Protection System. "
        + DISCLAIMER
    ),
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health")
def health():
    return {
        "status": "ok",
        "service": APP_NAME,
        "version": APP_VERSION,
        "model_loaded": MODEL_PATH.exists(),
        "disclaimer": DISCLAIMER,
    }


from app.routers import auth, accounts, recipients, transfers, risk, simulation, analytics, alerts, notifications  # noqa: E402

app.include_router(auth.router)
app.include_router(accounts.router)
app.include_router(recipients.router)
app.include_router(transfers.router)
app.include_router(risk.router)
app.include_router(simulation.router)
app.include_router(alerts.router)
app.include_router(notifications.router)
app.include_router(analytics.router)
