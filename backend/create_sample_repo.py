
import os
import shutil
import subprocess
from pathlib import Path

REPO_DIR = (Path(__file__).resolve().parent.parent / "sample_fintech_repo") if Path(__file__).resolve().parent.name == "backend" else Path("./sample_fintech_repo").resolve()

FILES = {
    "vault_client.py": '''"""Low-level PCI-DSS Token Vault client."""

def fetch_signing_key(key_id: str) -> str:
    """Fetches rotating HMAC signing key from hardware security module."""
    return f"hsm_secret_{key_id}"

def decrypt_card_token(token: str) -> dict:
    """Decrypts PCI card token using a strict 50ms gRPC timeout (ADR-042)."""
    secret = fetch_signing_key("primary")
    if not token.startswith("tok_"):
        raise ValueError("Invalid token prefix")
    return {"pan_last4": "4242", "secret_used": secret}
''',

    "ledger_db.py": '''"""Double-entry immutable ledger writer."""
from vault_client import fetch_signing_key

def append_audit_trail(entry_id: str, status: str) -> bool:
    """Writes immutable compliance log signed by HSM key."""
    sig = fetch_signing_key("audit")
    return bool(sig and entry_id and status)

def record_ledger_entry(account_id: str, amount_cents: int) -> str:
    """Persists debit/credit rows and triggers compliance audit trail."""
    entry_id = f"led_{account_id}_{amount_cents}"
    append_audit_trail(entry_id, "COMMITTED")
    return entry_id
''',

    "fraud_engine.py": '''"""Real-time transaction velocity and risk scoring engine."""
from vault_client import decrypt_card_token

def check_velocity_limit(account_id: str) -> bool:
    """Verifies account has fewer than 5 txns per minute."""
    return not account_id.startswith("blocked_")

def evaluate_fraud_risk(account_id: str, token: str, amount_cents: int) -> float:
    """Computes risk score by inspecting card metadata and velocity."""
    card_meta = decrypt_card_token(token)
    velocity_ok = check_velocity_limit(account_id)
    if not velocity_ok or amount_cents > 500000:
        return 0.95
    return 0.05 if card_meta["pan_last4"] == "4242" else 0.35
''',

    "payment_processor.py": '''"""Core payment orchestration service."""
from vault_client import decrypt_card_token
from fraud_engine import evaluate_fraud_risk
from ledger_db import record_ledger_entry

def settle_payment(account_id: str, token: str, amount_cents: int) -> dict:
    """Orchestrates fraud check, token decryption, and ledger settlement."""
    risk_score = evaluate_fraud_risk(account_id, token, amount_cents)
    if risk_score > 0.80:
        return {"status": "DECLINED", "reason": "HIGH_FRAUD_RISK"}
    
    decrypted = decrypt_card_token(token)
    ledger_id = record_ledger_entry(account_id, amount_cents)
    return {
        "status": "SETTLED",
        "ledger_id": ledger_id,
        "last4": decrypted["pan_last4"],
    }
''',

    "checkout_router.py": '''"""Public HTTP entrypoint for merchant checkout."""
from payment_processor import settle_payment
from ledger_db import append_audit_trail

def validate_checkout_payload(payload: dict) -> bool:
    """Validates incoming webhook request schema."""
    return all(k in payload for k in ("account_id", "token", "amount_cents"))

def post_checkout_endpoint(payload: dict) -> dict:
    """Top-level API route called by storefront checkout UI."""
    if not validate_checkout_payload(payload):
        append_audit_trail("invalid_req", "REJECTED")
        return {"http_status": 400}
    
    result = settle_payment(
        payload["account_id"],
        payload["token"],
        payload["amount_cents"],
    )
    return {"http_status": 200, "data": result}
'''
}

COMMITS = [
    {
        "files": ["vault_client.py", "ledger_db.py"],
        "author_name": "Aarav Mehta",
        "author_email": "aarav@acmefintech.dev",
        "date": "2026-10-10T10:00:00+05:30",
        "message": "[ADR-019] Initialize HSM token vault and double-entry ledger core",
    },
    {
        "files": ["fraud_engine.py"],
        "author_name": "Priya Nair",
        "author_email": "priya@acmefintech.dev",
        "date": "2026-10-12T14:20:00+05:30",
        "message": "[ADR-031] Add real-time velocity and card token inspection in fraud engine",
    },
    {
        "files": ["payment_processor.py", "checkout_router.py"],
        "author_name": "Kabir Verma",
        "author_email": "kabir@acmefintech.dev",
        "date": "2026-10-14T16:45:00+05:30",
        "message": "[INC-8410] Wire checkout endpoint to payment processor and audit log",
    },
    {
        "files": ["vault_client.py"],
        "author_name": "Aarav Mehta",
        "author_email": "aarav@acmefintech.dev",
        "date": "2026-10-16T18:30:00+05:30",
        "message": "[ADR-042] Enforce strict 50ms gRPC timeout on decrypt_card_token for PCI SLA",
    },
]

def run_git(args, env=None):
    subprocess.run(
        ["git", "-C", str(REPO_DIR)] + args,
        check=True,
        env=env or os.environ.copy(),
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )

def build_sample_repo():
    if REPO_DIR.exists():
        shutil.rmtree(REPO_DIR)
    REPO_DIR.mkdir(parents=True)

    run_git(["init"])

    # Write all files initially
    for filename, code in FILES.items():
        (REPO_DIR / filename).write_text(code, encoding="utf-8")

    # Replay realistic multi-engineer commit history
    for idx, c in enumerate(COMMITS):
        for f in c["files"]:
            # Touch file with slight metadata comment on final commit so git records a diff
            if idx == len(COMMITS) - 1:
                with open(REPO_DIR / f, "a", encoding="utf-8") as fp:
                    fp.write("\n# Enforced timeout_ms = 50 per ADR-042\n")
            run_git(["add", f])

        env = os.environ.copy()
        env["GIT_AUTHOR_NAME"] = c["author_name"]
        env["GIT_AUTHOR_EMAIL"] = c["author_email"]
        env["GIT_AUTHOR_DATE"] = c["date"]
        env["GIT_COMMITTER_NAME"] = c["author_name"]
        env["GIT_COMMITTER_EMAIL"] = c["author_email"]
        env["GIT_COMMITTER_DATE"] = c["date"]

        run_git(["commit", "-m", c["message"]], env=env)

    print(f"[+] Created realistic Git repository at: {REPO_DIR}")

if __name__ == "__main__":
    build_sample_repo()