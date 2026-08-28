import random
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app import config
from app.database import get_db
from app import models, schemas
from app.security import hash_password, verify_password, create_access_token, get_current_user
from app.risk.scenarios import build_normal_sequence

router = APIRouter(prefix="/api/auth", tags=["auth"])


def _generate_sender_account_number(db: Session) -> str:
    for _ in range(20):
        candidate = f"UNB-SEND-{random.randint(100000, 999999)}"
        exists = db.query(models.Account).filter(models.Account.account_number == candidate).first()
        if not exists:
            return candidate
    raise HTTPException(status_code=500, detail="Could not generate a unique account number, please try again")


from app.mock_bank import verify_signup_credentials
from app.risk.scenarios import build_normal_sequence

@router.post("/signup", response_model=schemas.LoginResponse, status_code=status.HTTP_201_CREATED)
def signup(payload: schemas.SignupRequest, db: Session = Depends(get_db)):
    """
    Sign Up Flow:
    1. Check if username/email + password exist in the international bank CSV dataset.
       If NOT found → reject ("not found in international dataset").
    2. Check if this user already exists in OUR project DB.
       If YES → reject ("already registered, please sign in").
    3. If found in CSV but not in our DB → create the user, defer account linking to OTP step.
    """
    acc_data = verify_signup_credentials(payload.username, payload.password)
    if not acc_data:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, 
            detail="Account not found in international banking dataset. Please check your credentials."
        )

    # Check if already registered in OUR project DB (match by username OR email)
    existing = db.query(models.User).filter(
        (models.User.username == payload.username) | 
        (models.User.email == acc_data.get("email", ""))
    ).first()
    if existing is not None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, 
            detail="You are already registered. Please sign in instead."
        )

    user = models.User(
        username=payload.username,
        password_hash=hash_password(payload.password),
        full_name=payload.full_name,
        email=acc_data.get("email", ""),
        phone_number=acc_data.get("phone_number", ""),
        role="sender",
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    token = create_access_token(user.id, user.username)
    return schemas.LoginResponse(
        access_token=token,
        user_id=user.id,
        username=user.username,
        full_name=user.full_name,
        account_id="",
        email=user.email,
        phone_number=user.phone_number,
        needs_contact_setup=False,
        needs_account_setup=True,
    )

@router.post("/send-otp")
def send_otp(current_user: models.User = Depends(get_current_user)):
    from app.email_otp import send_otp_email
    
    user_email = current_user.email
    if not user_email:
        raise HTTPException(status_code=400, detail="No email associated with this account.")
    
    try:
        send_otp_email(user_email)
    except RuntimeError as e:
        raise HTTPException(status_code=500, detail=str(e))
    
    # Mask email for display: ja***10@gmail.com
    parts = user_email.split("@")
    masked = parts[0][:2] + "***" + parts[0][-2:] + "@" + parts[1] if len(parts[0]) > 4 else parts[0][0] + "***@" + parts[1]
    
    return {"message": f"OTP sent to {masked}", "masked_email": masked}

@router.post("/verify-otp-and-link", response_model=schemas.LoginResponse)
def verify_otp_and_link(
    payload: schemas.VerifyOTPRequest, 
    db: Session = Depends(get_db), 
    current_user: models.User = Depends(get_current_user)
):
    from app.email_otp import verify_otp
    
    if not verify_otp(current_user.email, payload.otp):
        raise HTTPException(status_code=400, detail="Invalid or expired OTP. Please try again.")
        
    # User is already authenticated and their username/password was checked during signup
    # We can retrieve the data again from the CSV using their username (which is immutable)
    # The password isn't easily accessible here since it's hashed in the DB, 
    # but they couldn't have signed up without it matching.
    # We'll just fetch based on username + email + phone to be safe, or just username.
    from app.mock_bank import get_mock_data
    accounts = get_mock_data()
    acc_data = None
    curr_uname = current_user.username.lower()
    for acc in accounts:
        if acc.get("username", "").lower() == curr_uname or acc.get("email", "").lower() == curr_uname:
            acc_data = acc
            break
    
    if not acc_data:
        raise HTTPException(status_code=400, detail="Account details not found in international dataset.")
        
    # Check if user already has an account
    existing_acc = db.query(models.Account).filter(models.Account.user_id == current_user.id).first()
    if existing_acc:
        raise HTTPException(status_code=400, detail="User already has a linked account.")
        
    # Create the account in DB based on mock data
    account = models.Account(
        user_id=current_user.id,
        account_number=acc_data["account_number"],
        holder_name=current_user.full_name,
        account_type="savings",
        balance=acc_data.get("balance", 0.0),
        bank_name="International Bank (Mock)"
    )
    db.add(account)
    db.flush()
    
    # Generate synthetic transactions for this account using its balance seed
    baseline_seed = abs(hash(account.id)) % (2**31)
    from datetime import datetime
    for e in build_normal_sequence(datetime.utcnow(), seed=baseline_seed):
        db.add(models.AccountEvent(
            account_id=account.id,
            event_type=e["event_type"],
            timestamp=e["timestamp"],
            device_id=e.get("device_id"),
            ip_address=e.get("ip_address"),
            location=e.get("location"),
            amount=e.get("amount"),
            event_metadata=e.get("metadata") or {},
            risk_signal=bool(e.get("risk_signal")),
        ))
        
    db.commit()
    db.refresh(current_user)
    db.refresh(account)
    
    token = create_access_token(current_user.id, current_user.username)
    return schemas.LoginResponse(
        access_token=token,
        user_id=current_user.id,
        username=current_user.username,
        full_name=current_user.full_name,
        account_id=account.id,
        email=current_user.email,
        phone_number=current_user.phone_number,
        needs_contact_setup=False,
        needs_account_setup=False,
    )



@router.post("/login", response_model=schemas.LoginResponse)
def login(payload: schemas.LoginRequest, db: Session = Depends(get_db)):
    """
    Sign In Flow:
    1. Look up the user in OUR project DB by username OR email (case-insensitive).
    2. If NOT found → tell them to sign up first.
    3. If found → verify password → log them in.
    4. Check if they still need account setup (OTP step wasn't completed).
    """
    login_input = payload.username.strip().lower()
    
    # Try to find user by username, email, or full name (case-insensitive)
    user = None
    all_users = db.query(models.User).all()
    for u in all_users:
        if (u.username and u.username.lower() == login_input) or \
           (u.email and u.email.lower() == login_input) or \
           (u.full_name and u.full_name.lower() == login_input):
            user = u
            break
    
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, 
            detail="No account found. Please sign up first."
        )
    
    if not verify_password(payload.password, user.password_hash):
        # Fallback to check the CSV files (mock_dataset.csv or mock_dataset_new.csv)
        csv_match = (
            verify_signup_credentials(user.username, payload.password)
            or verify_signup_credentials(user.email, payload.password)
            or verify_signup_credentials(user.full_name, payload.password)
        )
        if csv_match:
            user.password_hash = hash_password(payload.password)
            db.commit()
        else:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED, 
                detail="Incorrect password."
            )

    account = db.query(models.Account).filter(models.Account.user_id == user.id).first()
    token = create_access_token(user.id, user.username)
    return schemas.LoginResponse(
        access_token=token,
        user_id=user.id,
        username=user.username,
        full_name=user.full_name,
        account_id=account.id if account else "",
        email=user.email,
        phone_number=user.phone_number,
        needs_contact_setup=False,
        needs_account_setup=account is None,
    )


@router.get("/me")
def me(current_user: models.User = Depends(get_current_user)):
    return {
        "id": current_user.id,
        "username": current_user.username,
        "full_name": current_user.full_name,
        "email": current_user.email,
        "phone_number": current_user.phone_number,
        "needs_contact_setup": not (current_user.phone_number and current_user.email),
    }


@router.put("/contact", response_model=schemas.ContactDetailsOut)
def update_contact_details(
    payload: schemas.ContactDetailsRequest,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Save the sender's mobile number and email so Recipient Shield can
    send them real-time transaction status notifications (SMS -- simulated
    in this prototype -- and email, sent for real over SMTP when
    configured; see app/notifications.py)."""
    current_user.phone_number = payload.phone_number
    current_user.email = payload.email
    db.commit()
    db.refresh(current_user)
    return current_user
