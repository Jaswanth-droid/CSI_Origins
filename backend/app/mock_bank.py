import csv
import os
from pathlib import Path

# Load from backend/data/
DATA_DIR = Path(__file__).parent.parent / "data"
# Try the _new file first (in case Excel has locked the original)
_NEW_PATH = DATA_DIR / "mock_dataset_new.csv"
_ORIG_PATH = DATA_DIR / "mock_dataset.csv"
MOCK_DATA_PATH = _NEW_PATH if _NEW_PATH.exists() else _ORIG_PATH

def get_mock_data():
    if not MOCK_DATA_PATH.exists():
        return []
    
    accounts = []
    with open(MOCK_DATA_PATH, "r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            username = row.get("username", "").strip()
            email = row.get("email", "").strip()
            
            if not username and not email:
                continue # Skip completely blank or invalid rows
                
            try:
                balance_val = float(row.get("balance", 0.0) or 0.0)
            except ValueError:
                balance_val = 0.0
                
            accounts.append({
                "username": username,
                "phone_number": row.get("phone_number", "").strip(),
                "email": email,
                "password": row.get("password", "").strip(),
                "account_number": row.get("account_number", "").replace('="', '').replace('"', '').strip(),
                "balance": balance_val
            })
    return accounts

def verify_signup_credentials(username_input: str, password: str):
    """
    Verifies if the given username/email and password match any
    mock account in the mock_dataset.csv file.
    Returns the mock account dictionary if valid, None otherwise.
    """
    accounts = get_mock_data()
    username_input = username_input.strip().lower()
    for acc in accounts:
        csv_user = acc.get("username", "").lower()
        csv_email = acc.get("email", "").lower()
        
        # Allow them to sign in with either the username or the email from the CSV
        if (csv_user == username_input or csv_email == username_input) and acc.get("password") == password:
            return acc
    return None

