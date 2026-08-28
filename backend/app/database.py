"""
SQLAlchemy engine/session setup (hackathon brief sections 1 & 13).

SQLite is used for the prototype per the brief. `check_same_thread=False`
is required because FastAPI's TestClient / async request handling can hit
the connection from a different thread than the one that created it;
sessions are still scoped per-request via `get_db`, so this is safe for a
single-process demo.
"""
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import sessionmaker, declarative_base

from app.config import DATABASE_URL

connect_args = {"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {}
engine = create_engine(DATABASE_URL, connect_args=connect_args)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()


def get_db():
    """FastAPI dependency: yields a request-scoped DB session."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db():
    """Create all tables. Safe to call repeatedly (no-op if they exist)."""
    import app.models  # noqa: F401 -- ensure models are registered on Base
    Base.metadata.create_all(bind=engine)
    _apply_additive_migrations()


def _apply_additive_migrations():
    """This prototype has no formal migration tool (kept out to minimize
    dependencies). `create_all` above only creates tables that don't exist
    yet -- it never alters a table that's already on disk from an earlier
    run. This adds new nullable columns on pre-existing tables (e.g.
    `users.phone_number`, `transactions.notification_sent`, both added for
    transaction notifications). Safe to call repeatedly; no-ops once each
    column is present."""
    if not DATABASE_URL.startswith("sqlite"):
        return
    inspector = inspect(engine)
    table_names = inspector.get_table_names()

    if "users" in table_names:
        existing_columns = {c["name"] for c in inspector.get_columns("users")}
        if "phone_number" not in existing_columns:
            with engine.begin() as conn:
                conn.execute(text("ALTER TABLE users ADD COLUMN phone_number VARCHAR"))

    if "transactions" in table_names:
        existing_txn_columns = {c["name"] for c in inspector.get_columns("transactions")}
        if "notification_sent" not in existing_txn_columns:
            with engine.begin() as conn:
                conn.execute(text(
                    "ALTER TABLE transactions ADD COLUMN notification_sent BOOLEAN DEFAULT 0"
                ))

    if "recipients" in table_names:
        existing_rcpt_columns = {c["name"] for c in inspector.get_columns("recipients")}
        if "legitimate_transfer_count" not in existing_rcpt_columns:
            with engine.begin() as conn:
                conn.execute(text(
                    "ALTER TABLE recipients ADD COLUMN legitimate_transfer_count INTEGER DEFAULT 0"
                ))
                # One-time backfill for Trusted Recipient Aging: this column
                # is brand new, but real COMPLETED transfer history may
                # already exist for recipients added before this feature
                # shipped. Rather than treating every existing recipient as
                # NEW (which would suddenly demand step-up verification for
                # relationships the user has already used safely many
                # times), credit each recipient with the COMPLETED transfers
                # its owner has already sent to that same account.
                if "transactions" in table_names and "accounts" in table_names:
                    conn.execute(text(
                        """
                        UPDATE recipients
                        SET legitimate_transfer_count = (
                            SELECT COUNT(*) FROM transactions
                            WHERE transactions.recipient_account_id = recipients.account_id
                              AND transactions.status = 'COMPLETED'
                              AND transactions.sender_account_id = (
                                  SELECT id FROM accounts
                                  WHERE accounts.user_id = recipients.owner_user_id
                                  LIMIT 1
                              )
                        )
                        """
                    ))
