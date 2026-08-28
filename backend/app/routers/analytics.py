"""
Security analytics + evaluation metrics (hackathon brief sections 10 & 16).
"""
from collections import Counter, defaultdict
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.config import DISCLAIMER
from app.database import get_db
from app import models, schemas
from app.security import get_current_user
from app.risk import engine as risk_engine
from app.routers.accounts import compute_cibil_score

router = APIRouter(prefix="/api/analytics", tags=["analytics"])


@router.get("", response_model=schemas.AnalyticsOut)
def get_analytics(db: Session = Depends(get_db), _user=Depends(get_current_user)):
    accounts = db.query(models.Account).all()

    level_counts = Counter()
    scores = []
    per_account_level = {}
    cibil_counts = Counter()  # POOR, FAIR, GOOD, EXCELLENT

    for account in accounts:
        cibil = compute_cibil_score(db, account)
        
        if cibil < 600:
            cibil_counts["POOR"] += 1
        elif cibil < 700:
            cibil_counts["FAIR"] += 1
        elif cibil < 750:
            cibil_counts["GOOD"] += 1
        else:
            cibil_counts["EXCELLENT"] += 1

        events = [e.to_dict() for e in account.events]
        if not events:
            continue
        result = risk_engine.assess(events, reference_time=None)
        level_counts[result["risk_level"]] += 1
        scores.append(result["risk_score"])
        per_account_level[account.id] = result["risk_level"]

    total_monitored = len(per_account_level)
    avg_score = round(sum(scores) / len(scores), 1) if scores else 0.0

    # transfers prevented: any transaction that was HELD or CANCELLED, or
    # any completed-under-verification, counts as "the system intervened"
    txns = db.query(models.Transaction).all()
    transfers_prevented = sum(1 for t in txns if t.status in ("HELD", "CANCELLED"))

    potential_takeovers = level_counts.get("HIGH", 0)

    # post-transfer compromises: completed transfers whose recipient has
    # SINCE become HIGH risk (unresolved -- still showing "COMPLETED", not
    # yet refunded) reuses the same live per-account risk levels computed
    # above, so it's always in sync with what the Alerts page would show.
    post_transfer_compromises = sum(
        1 for t in txns
        if t.status == "COMPLETED" and per_account_level.get(t.recipient_account_id) == "HIGH"
    )
    # refunds issued: post-transfer compromises the sender already acted on
    refunds_issued = db.query(models.RefundRequest).filter(models.RefundRequest.status == "APPROVED").count()

    # suspicious event frequency across all accounts (risk_signal events only)
    event_freq = Counter()
    all_events = db.query(models.AccountEvent).filter(models.AccountEvent.risk_signal == True).all()  # noqa: E712
    for e in all_events:
        event_freq[e.event_type] += 1

    # risk over time: bucket stored RiskAssessment rows by day
    assessments = db.query(models.RiskAssessment).order_by(models.RiskAssessment.created_at).all()
    by_day = defaultdict(list)
    for a in assessments:
        day = a.created_at.strftime("%Y-%m-%d")
        by_day[day].append(a.risk_score)
    risk_over_time = [
        {"date": day, "average_risk_score": round(sum(vals) / len(vals), 1), "count": len(vals)}
        for day, vals in sorted(by_day.items())
    ]

    return schemas.AnalyticsOut(
        total_monitored_recipients=total_monitored,
        low_risk_count=level_counts.get("LOW", 0),
        medium_risk_count=level_counts.get("MEDIUM", 0),
        high_risk_count=level_counts.get("HIGH", 0),
        potential_takeovers_detected=potential_takeovers,
        transfers_prevented=transfers_prevented,
        post_transfer_compromises_detected=post_transfer_compromises,
        refunds_issued=refunds_issued,
        average_risk_score=avg_score,
        risk_distribution={
            "LOW": level_counts.get("LOW", 0),
            "MEDIUM": level_counts.get("MEDIUM", 0),
            "HIGH": level_counts.get("HIGH", 0),
        },
        cibil_distribution={
            "POOR": cibil_counts.get("POOR", 0),
            "FAIR": cibil_counts.get("FAIR", 0),
            "GOOD": cibil_counts.get("GOOD", 0),
            "EXCELLENT": cibil_counts.get("EXCELLENT", 0),
        },
        suspicious_event_frequency=dict(event_freq),
        risk_over_time=risk_over_time,
        model_metrics=risk_engine.model_metrics(),
        disclaimer=DISCLAIMER,
    )
