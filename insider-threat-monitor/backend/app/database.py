import os
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base

# External Recipient Shield DB connection (dynamically resolve active workspace DB)
WORKSPACE_RS_DB = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../../backend/data/recipient_shield.db"))
DOWNLOADS_RS_DB = "C:/Users/DELL/Downloads/recipient-shield-phase3/recipient-shield-phase3/backend/data/recipient_shield.db"
RS_DB_PATH = WORKSPACE_RS_DB if os.path.exists(WORKSPACE_RS_DB) else DOWNLOADS_RS_DB

rs_engine = create_engine(f"sqlite:///{RS_DB_PATH}", connect_args={"check_same_thread": False})
RS_SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=rs_engine)

# Local Insider Threat Monitor DB connection (read-write SQLite)
monitor_engine = create_engine("sqlite:///insider_threat_monitor.db", connect_args={"check_same_thread": False})
MonitorSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=monitor_engine)

Base = declarative_base()


def get_rs_db():
    db = RS_SessionLocal()
    try:
        yield db
    finally:
        db.close()


def get_monitor_db():
    db = MonitorSessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db():
    import app.models  # ensure models are registered
    Base.metadata.create_all(bind=monitor_engine)
