import random
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app import models, schemas
from app.security import get_current_user
from app.risk.scenarios import build_normal_sequence

router = APIRouter(prefix="/api/recipients", tags=["recipients"])


@router.get("/search")
def search_recipient_accounts(
    q: str = "",
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    query_val = q.strip().lower()
    if len(query_val) < 2:
        return []
    
    # Query users in project DB whose username or full_name matches the query
    users = db.query(models.User).all()
    matches = []
    
    for u in users:
        # Exclude self
        if u.id == current_user.id:
            continue
            
        username_match = u.username and query_val in u.username.lower()
        fullname_match = u.full_name and query_val in u.full_name.lower()
        
        if username_match or fullname_match:
            # Look up their account
            account = db.query(models.Account).filter(models.Account.user_id == u.id).first()
            if account:
                matches.append({
                    "username": u.username,
                    "full_name": u.full_name,
                    "account_number": account.account_number,
                    "account_id": account.id
                })
                
    return matches[:5]  # Return up to 5 matching accounts


@router.get("", response_model=list[schemas.RecipientOut])
def list_recipients(db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    recipients = (
        db.query(models.Recipient)
        .filter(models.Recipient.owner_user_id == current_user.id)
        .order_by(models.Recipient.added_at)
        .all()
    )
    return recipients


def _generate_account_number(db: Session) -> str:
    for _ in range(20):
        candidate = f"UNB-RCPT-{random.randint(300000, 999999)}"
        exists = db.query(models.Account).filter(models.Account.account_number == candidate).first()
        if not exists:
            return candidate
    raise HTTPException(status_code=500, detail="Could not generate a unique account number, please try again")


@router.post("", response_model=schemas.RecipientOut)
def add_recipient(
    payload: schemas.CreateRecipientRequest,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Add a new trusted recipient. This looks up an existing bank account in the DB
    and links it to the user's trusted list. It does not create new simulated accounts
    to prevent sending money to random un-registered accounts.
    """
    if not payload.account_number:
        raise HTTPException(
            status_code=400,
            detail="Account number is required to link a recipient"
        )

    # Clean the account number in case the user copy-pastes Excel formatting
    account_number = payload.account_number.replace('="', '').replace('"', '').strip()

    account = db.query(models.Account).filter(models.Account.account_number == account_number).first()
    if not account:
        raise HTTPException(
            status_code=400,
            detail=f"Account number {account_number} does not exist in our system."
        )

    # Prevent adding yourself
    user_account = db.query(models.Account).filter(models.Account.user_id == current_user.id).first()
    if user_account and user_account.id == account.id:
        raise HTTPException(
            status_code=400,
            detail="You cannot add your own account as a recipient."
        )

    # Check if they already added this recipient
    existing_rec = db.query(models.Recipient).filter(
        models.Recipient.owner_user_id == current_user.id,
        models.Recipient.account_id == account.id
    ).first()
    if existing_rec:
        raise HTTPException(
            status_code=400,
            detail=f"{account.holder_name} is already in your trusted recipients list."
        )

    recipient = models.Recipient(
        owner_user_id=current_user.id,
        account_id=account.id,
        nickname=payload.nickname or account.holder_name,
        trusted=True,
    )
    db.add(recipient)
    db.commit()
    db.refresh(recipient)

    return recipient

