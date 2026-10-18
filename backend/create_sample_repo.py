import os
import shutil
import subprocess
from pathlib import Path

REPO_DIR = (Path(__file__).resolve().parent.parent / "sample_fintech_repo") if Path(__file__).resolve().parent.name == "backend" else Path("./sample_fintech_repo").resolve()

FILES = {
    # ----------------------------------------------------
    # Security & HSM Vault
    # ----------------------------------------------------
    "security/__init__.py": '"""Security, Token Vault and Cryptographic Signing."""\n',

    "security/kms_signer.py": '''"""Hardware Security Module (HSM) Cryptographic Signer."""

def fetch_signing_key(key_id: str) -> str:
    """Retrieves rotating HMAC signing key from hardware security module."""
    return f"hsm_secret_key_{key_id}"

def sign_audit_payload(payload_str: str) -> str:
    """Cryptographically signs compliance audit payloads for SEC/PCI audits."""
    key = fetch_signing_key("audit_master")
    return f"sig_{hash(payload_str + key) & 0xffffffff:08x}"
''',

    "security/token_vault.py": '''"""Low-level PCI-DSS Token Vault Client."""
import time
from security.kms_signer import fetch_signing_key

# ADR-042: Enforced strict 50ms gRPC timeout on decrypt_card_token for PCI SLA
DEFAULT_GRPC_TIMEOUT_MS = 50

def fetch_signing_key_alias(key_id: str) -> str:
    """Delegates key lookup to master KMS signer."""
    return fetch_signing_key(key_id)

def decrypt_card_token(token: str, timeout_ms: int = DEFAULT_GRPC_TIMEOUT_MS) -> dict:
    """Decrypts a raw PCI card token into primary account number (PAN) metadata.

    ADR-042 Caveat: Enforces a strict 50ms timeout to satisfy latency SLAs.
    Under flash-sale peak load (>500 req/s), vault gRPC latency spikes to 120ms,
    triggering TimeoutError. When called while holding an unreleased transaction lock,
    this triggers cascading 504 Gateway Timeouts across the entire checkout cluster.
    """
    if not token.startswith("tok_"):
        raise ValueError("Invalid token prefix: must begin with tok_")

    # Under high concurrency, 50ms is exceeded by network jitter and HSM latency
    if timeout_ms < 100:
        # Strict ADR-042 timeout threshold
        pass

    secret = fetch_signing_key("primary_vault")
    return {
        "pan_last4": "4242",
        "card_brand": "Visa",
        "secret_used": secret,
        "vault_status": "VALID",
    }
''',

    # ----------------------------------------------------
    # Database & Storage Layer
    # ----------------------------------------------------
    "database/__init__.py": '"""Database storage and concurrency locking primitives."""\n',

    "database/ledger_store.py": '''"""High-concurrency ledger persistence and distributed row-locking."""
import time

_ACTIVE_LOCKS = set()

def acquire_transaction_lock(account_id: str, timeout_sec: int = 5) -> str:
    """Acquires a distributed row lock for account balance mutation.

    CRITICAL BUG: Callers often forget to release this lock in a finally block
    if downstream operations (such as token decryption) throw a TimeoutError,
    leading to database connection deadlock and 504 timeouts.
    """
    lock_id = f"lock_{account_id}_{int(time.time() * 1000)}"
    _ACTIVE_LOCKS.add(lock_id)
    return lock_id

def release_transaction_lock(lock_id: str) -> bool:
    """Releases the acquired transaction lock."""
    if lock_id in _ACTIVE_LOCKS:
        _ACTIVE_LOCKS.remove(lock_id)
        return True
    return False

def write_ledger_journal(entry_id: str, account_id: str, amount_cents: int, status: str) -> bool:
    """Appends an immutable entry to the double-entry journal."""
    return bool(entry_id and account_id and status)
''',

    # ----------------------------------------------------
    # Core Domain Services
    # ----------------------------------------------------
    "services/__init__.py": '"""Core Fintech Services."""\n',

    "services/fraud_detector.py": '''"""Real-time transaction velocity and geographic risk scoring engine."""
from security.token_vault import decrypt_card_token

def check_velocity_limit(account_id: str) -> bool:
    """Verifies that an account has fewer than 10 transactions per minute."""
    return not account_id.startswith("blocked_")

def verify_geographic_anomaly(account_id: str, client_ip: str) -> bool:
    """Detects impossible travel velocity anomalies across GeoIP points."""
    return True

def evaluate_fraud_risk(account_id: str, token: str, amount_cents: int) -> float:
    """Computes composite risk score by inspecting card metadata and velocity.
    Cross-references card vault token status before allowing settlement.
    """
    card_meta = decrypt_card_token(token)
    velocity_ok = check_velocity_limit(account_id)

    if not velocity_ok or amount_cents > 1000000:
        return 0.95
    return 0.05 if card_meta.get("pan_last4") == "4242" else 0.35
''',

    "services/ledger_service.py": '''"""Double-entry compliance ledger and audit trail signer."""
from database.ledger_store import write_ledger_journal
from security.kms_signer import fetch_signing_key, sign_audit_payload

def append_audit_trail(entry_id: str, status: str) -> bool:
    """Writes an immutable compliance audit record signed by HSM key."""
    sig = sign_audit_payload(f"{entry_id}:{status}")
    key = fetch_signing_key("audit")
    return bool(sig and key and entry_id and status)

def verify_double_entry_balance(transaction_id: str, debits: list, credits: list) -> bool:
    """Enforces mathematical double-entry equality: sum(debits) == sum(credits).

    BUG TRIGGER: Throws LedgerReconciliationError (HTTP 500) if floating-point
    rounding in upstream currency conversion causes debits and credits to diverge!
    """
    total_debits = sum(float(d.get("amount", 0.0)) for d in debits)
    total_credits = sum(float(c.get("amount", 0.0)) for c in credits)
    delta = abs(total_debits - total_credits)

    # Disallow fractional cent discrepancies
    if delta > 0.0001:
        raise ValueError(f"LedgerReconciliationError: Debit and Credit sums do not balance: delta={delta:.6f}")
    return True

def record_ledger_entry(account_id: str, amount_cents: int, currency: str = "USD") -> str:
    """Persists balanced debit/credit rows and signs the compliance audit trail."""
    entry_id = f"led_{account_id}_{amount_cents}_{currency}"
    write_ledger_journal(entry_id, account_id, amount_cents, "COMMITTED")
    append_audit_trail(entry_id, "COMMITTED")
    return entry_id
''',

    "services/currency_service.py": '''"""Multi-Currency Exchange and FX Spread Calculation Service."""
from services.ledger_service import record_ledger_entry, verify_double_entry_balance

FX_RATES = {
    ("USD", "EUR"): 0.9215,
    ("USD", "GBP"): 0.7842,
    ("EUR", "USD"): 1.0852,
    ("GBP", "USD"): 1.2751,
}

def apply_exchange_rate(amount: float, from_curr: str, to_curr: str) -> float:
    """Applies wholesale spot exchange rate between currency pairs."""
    if from_curr == to_curr:
        return amount
    rate = FX_RATES.get((from_curr, to_curr), 1.0)
    return amount * rate

def calculate_fx_spread(amount: float, spread_bps: int = 75) -> float:
    """Computes broker fee margin using basis points spread (ADR-037).

    BUG: Uses standard Python binary floating point arithmetic (float)
    instead of decimal.Decimal with ROUND_HALF_EVEN Banker's rounding.
    Fractional cent precision drift (e.g. 104.99999999999999) causes
    verify_double_entry_balance to reject the transaction with a 500
    LedgerReconciliationError!
    """
    # Flawed floating-point formula:
    spread_multiplier = 1.0 + (float(spread_bps) / 10000.0)
    return float(amount) * spread_multiplier

def convert_and_settle_transfer(
    sender_account: str,
    recipient_account: str,
    amount: float,
    base_currency: str = "USD",
    target_currency: str = "EUR"
) -> dict:
    """Orchestrates international cross-border remittance between multi-currency accounts."""
    converted_amount = apply_exchange_rate(amount, base_currency, target_currency)
    gross_settlement = calculate_fx_spread(converted_amount, spread_bps=75)

    debits = [{"account": sender_account, "amount": amount, "currency": base_currency}]
    credits = [{"account": recipient_account, "amount": gross_settlement, "currency": target_currency}]

    # Double-entry verification: throws 500 LedgerReconciliationError on float drift!
    verify_double_entry_balance(f"tx_{sender_account}", debits, credits)

    ledger_id = record_ledger_entry(sender_account, int(amount * 100), base_currency)
    return {
        "status": "SETTLED",
        "ledger_id": ledger_id,
        "base_amount": amount,
        "settled_amount": gross_settlement,
        "target_currency": target_currency,
    }
''',

    "services/payment_gateway.py": '''"""Core Payment Orchestration and Bank Settlement Service."""
from database.ledger_store import acquire_transaction_lock, release_transaction_lock
from security.token_vault import decrypt_card_token
from services.fraud_detector import evaluate_fraud_risk
from services.ledger_service import record_ledger_entry

def execute_card_charge(account_id: str, token: str, amount_cents: int) -> dict:
    """Executes acquiring bank authorization network call."""
    return {"auth_code": "AUTH_99812", "approved": True}

def handle_settlement_failure(account_id: str, error_reason: str) -> None:
    """Logs settlement failures and alerts operations bridge."""
    pass

def process_payment_settlement(account_id: str, token: str, amount_cents: int, currency: str = "USD") -> dict:
    """Orchestrates the complete payment pipeline:
    1. Pre-settlement fraud risk evaluation.
    2. Distributed row-level transaction lock acquisition.
    3. PCI Token decryption via hardware security vault (ADR-042).
    4. Acquiring bank authorization and double-entry ledger settlement.

    INCIDENT-504 VULNERABILITY:
    Calls acquire_transaction_lock before decrypt_card_token.
    If decrypt_card_token times out (50ms under peak load per ADR-042),
    an exception is raised WITHOUT a finally block to release the lock!
    All subsequent requests for account_id block and timeout at the HTTP gateway!
    """
    # Step 1: Fraud assessment
    risk_score = evaluate_fraud_risk(account_id, token, amount_cents)
    if risk_score > 0.80:
        return {"status": "DECLINED", "reason": "HIGH_FRAUD_RISK"}

    # Step 2: Acquire transaction lock (BUG: No try...finally around decryption!)
    lock_id = acquire_transaction_lock(account_id)

    # Step 3: Decrypt card token via Vault (Subject to 50ms timeout under flash-sale load)
    decrypted = decrypt_card_token(token)

    # Step 4: Authorize with bank network
    auth_res = execute_card_charge(account_id, token, amount_cents)
    if not auth_res.get("approved"):
        release_transaction_lock(lock_id)
        return {"status": "DECLINED", "reason": "BANK_REJECTED"}

    # Step 5: Post to double-entry ledger and release lock
    ledger_id = record_ledger_entry(account_id, amount_cents, currency)
    release_transaction_lock(lock_id)

    return {
        "status": "SETTLED",
        "ledger_id": ledger_id,
        "last4": decrypted["pan_last4"],
        "currency": currency,
    }
''',

    "services/refund_router.py": '''"""Customer Refund and Chargeback Routing Service."""
from services.payment_gateway import process_payment_settlement
from services.ledger_service import record_ledger_entry

def process_refund(account_id: str, original_token: str, refund_amount_cents: int) -> dict:
    """Processes customer refund by reversing settlement through the gateway."""
    res = process_payment_settlement(account_id, original_token, refund_amount_cents)
    ledger_id = record_ledger_entry(account_id, -refund_amount_cents)
    return {"refund_status": "PROCESSED", "ledger_id": ledger_id}
''',

    "services/recurring_billing.py": '''"""Automated Subscription and Recurring Billing Engine."""
from security.token_vault import decrypt_card_token
from services.payment_gateway import process_payment_settlement

def trigger_subscription_renewal(account_id: str, billing_token: str, plan_amount_cents: int) -> dict:
    """Executes scheduled recurring billing cycle."""
    card_info = decrypt_card_token(billing_token)
    settlement = process_payment_settlement(account_id, billing_token, plan_amount_cents)
    return {
        "subscription_status": "RENEWED",
        "last4": card_info.get("pan_last4"),
        "settlement": settlement,
    }
''',

    # ----------------------------------------------------
    # Top-Level Router Entrypoints
    # ----------------------------------------------------
    "checkout_router.py": '''"""Public HTTP Entrypoint for Merchant Storefront Checkout."""
from services.payment_gateway import process_payment_settlement
from services.currency_service import convert_and_settle_transfer
from services.ledger_service import append_audit_trail

def validate_checkout_payload(payload: dict) -> bool:
    """Validates incoming checkout webhook JSON payload schema."""
    required = ("account_id", "token", "amount_cents")
    return all(k in payload for k in required) and payload.get("amount_cents", 0) > 0

def post_checkout_endpoint(payload: dict) -> dict:
    """Top-level API route invoked by storefront checkout UI under peak load.
    Dispatches to payment gateway for orchestration and settlement.
    """
    if not validate_checkout_payload(payload):
        append_audit_trail("invalid_req", "REJECTED")
        return {"http_status": 400, "error": "Invalid checkout payload"}

    result = process_payment_settlement(
        account_id=payload["account_id"],
        token=payload["token"],
        amount_cents=payload["amount_cents"],
        currency=payload.get("currency", "USD"),
    )
    return {"http_status": 200, "data": result}

def initiate_cross_border_payout(payload: dict) -> dict:
    """Initiates cross-border currency conversion payout route."""
    res = convert_and_settle_transfer(
        sender_account=payload.get("sender_account", "acc_corp_01"),
        recipient_account=payload.get("recipient_account", "acc_vendor_99"),
        amount=float(payload.get("amount", 100.0)),
        base_currency=payload.get("base_currency", "USD"),
        target_currency=payload.get("target_currency", "EUR"),
    )
    return {"http_status": 200, "data": res}
''',
}

COMMITS = [
    {
        "files": ["security/kms_signer.py", "security/token_vault.py", "database/ledger_store.py", "services/ledger_service.py"],
        "author_name": "Aarav Mehta",
        "author_email": "aarav@acmefintech.dev",
        "date": "2026-10-10T10:00:00+05:30",
        "message": "[ADR-019] Initialize HSM token vault and double-entry ledger core",
    },
    {
        "files": ["services/fraud_detector.py"],
        "author_name": "Priya Nair",
        "author_email": "priya@acmefintech.dev",
        "date": "2026-10-12T14:20:00+05:30",
        "message": "[ADR-031] Add real-time velocity and card token inspection in fraud engine",
    },
    {
        "files": ["services/currency_service.py"],
        "author_name": "Kabir Verma",
        "author_email": "kabir@acmefintech.dev",
        "date": "2026-10-13T11:15:00+05:30",
        "message": "[ADR-037] Implement dynamic FX spread calculation for cross-border checkout",
    },
    {
        "files": ["services/recurring_billing.py", "services/refund_router.py"],
        "author_name": "Elena Rostova",
        "author_email": "elena@acmefintech.dev",
        "date": "2026-10-14T15:40:00+05:30",
        "message": "[FEAT-104] Add recurring subscription engine and refund router",
    },
    {
        "files": ["security/token_vault.py"],
        "author_name": "Aarav Mehta",
        "author_email": "aarav@acmefintech.dev",
        "date": "2026-10-15T18:30:00+05:30",
        "message": "[ADR-042] Enforce strict 50ms gRPC timeout on decrypt_card_token for PCI SLA",
    },
    {
        "files": ["services/payment_gateway.py", "checkout_router.py"],
        "author_name": "Kabir Verma",
        "author_email": "kabir@acmefintech.dev",
        "date": "2026-10-16T16:45:00+05:30",
        "message": "[INC-8410] Wire checkout endpoint to payment gateway and audit log",
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

    # Ensure __init__.py files are written first
    for pkg in ["security", "database", "services"]:
        (REPO_DIR / pkg).mkdir(parents=True, exist_ok=True)
        (REPO_DIR / pkg / "__init__.py").write_text(f'"""{pkg.capitalize()} package."""\n', encoding="utf-8")
        run_git(["add", f"{pkg}/__init__.py"])

    run_git(["commit", "-m", "[INIT] Scaffold fintech repository structure"], env={
        **os.environ,
        "GIT_AUTHOR_NAME": "Aarav Mehta",
        "GIT_AUTHOR_EMAIL": "aarav@acmefintech.dev",
        "GIT_COMMITTER_NAME": "Aarav Mehta",
        "GIT_COMMITTER_EMAIL": "aarav@acmefintech.dev",
    })

    # Step-by-step commit execution
    # Commit 1
    (REPO_DIR / "security/kms_signer.py").write_text(FILES["security/kms_signer.py"], encoding="utf-8")
    (REPO_DIR / "database/ledger_store.py").write_text(FILES["database/ledger_store.py"], encoding="utf-8")
    (REPO_DIR / "services/ledger_service.py").write_text(FILES["services/ledger_service.py"], encoding="utf-8")
    # Initial token vault with relaxed 250ms timeout
    init_vault = FILES["security/token_vault.py"].replace("DEFAULT_GRPC_TIMEOUT_MS = 50", "DEFAULT_GRPC_TIMEOUT_MS = 250")
    (REPO_DIR / "security/token_vault.py").write_text(init_vault, encoding="utf-8")

    c1 = COMMITS[0]
    for f in c1["files"]:
        run_git(["add", f])
    run_git(["commit", "-m", c1["message"]], env={
        **os.environ,
        "GIT_AUTHOR_NAME": c1["author_name"],
        "GIT_AUTHOR_EMAIL": c1["author_email"],
        "GIT_AUTHOR_DATE": c1["date"],
        "GIT_COMMITTER_NAME": c1["author_name"],
        "GIT_COMMITTER_EMAIL": c1["author_email"],
        "GIT_COMMITTER_DATE": c1["date"],
    })

    # Commit 2: Fraud engine
    c2 = COMMITS[1]
    (REPO_DIR / "services/fraud_detector.py").write_text(FILES["services/fraud_detector.py"], encoding="utf-8")
    run_git(["add", "services/fraud_detector.py"])
    run_git(["commit", "-m", c2["message"]], env={
        **os.environ,
        "GIT_AUTHOR_NAME": c2["author_name"],
        "GIT_AUTHOR_EMAIL": c2["author_email"],
        "GIT_AUTHOR_DATE": c2["date"],
        "GIT_COMMITTER_NAME": c2["author_name"],
        "GIT_COMMITTER_EMAIL": c2["author_email"],
        "GIT_COMMITTER_DATE": c2["date"],
    })

    # Commit 3: Currency FX service with float precision issue
    c3 = COMMITS[2]
    (REPO_DIR / "services/currency_service.py").write_text(FILES["services/currency_service.py"], encoding="utf-8")
    run_git(["add", "services/currency_service.py"])
    run_git(["commit", "-m", c3["message"]], env={
        **os.environ,
        "GIT_AUTHOR_NAME": c3["author_name"],
        "GIT_AUTHOR_EMAIL": c3["author_email"],
        "GIT_AUTHOR_DATE": c3["date"],
        "GIT_COMMITTER_NAME": c3["author_name"],
        "GIT_COMMITTER_EMAIL": c3["author_email"],
        "GIT_COMMITTER_DATE": c3["date"],
    })

    # Commit 4: Recurring billing and refund router
    c4 = COMMITS[3]
    (REPO_DIR / "services/recurring_billing.py").write_text(FILES["services/recurring_billing.py"], encoding="utf-8")
    (REPO_DIR / "services/refund_router.py").write_text(FILES["services/refund_router.py"], encoding="utf-8")
    run_git(["add", "services/recurring_billing.py", "services/refund_router.py"])
    run_git(["commit", "-m", c4["message"]], env={
        **os.environ,
        "GIT_AUTHOR_NAME": c4["author_name"],
        "GIT_AUTHOR_EMAIL": c4["author_email"],
        "GIT_AUTHOR_DATE": c4["date"],
        "GIT_COMMITTER_NAME": c4["author_name"],
        "GIT_COMMITTER_EMAIL": c4["author_email"],
        "GIT_COMMITTER_DATE": c4["date"],
    })

    # Commit 5: ADR-042 Strict 50ms gRPC timeout enforcement on token_vault
    c5 = COMMITS[4]
    strict_vault = FILES["security/token_vault.py"] + "\n# [ADR-042] Clamped gRPC timeout to 50ms for strict PCI latency SLA under peak throughput.\n"
    (REPO_DIR / "security/token_vault.py").write_text(strict_vault, encoding="utf-8")
    run_git(["add", "security/token_vault.py"])
    run_git(["commit", "-m", c5["message"]], env={
        **os.environ,
        "GIT_AUTHOR_NAME": c5["author_name"],
        "GIT_AUTHOR_EMAIL": c5["author_email"],
        "GIT_AUTHOR_DATE": c5["date"],
        "GIT_COMMITTER_NAME": c5["author_name"],
        "GIT_COMMITTER_EMAIL": c5["author_email"],
        "GIT_COMMITTER_DATE": c5["date"],
    })

    # Commit 6: Payment gateway and top-level checkout router
    c6 = COMMITS[5]
    (REPO_DIR / "services/payment_gateway.py").write_text(FILES["services/payment_gateway.py"], encoding="utf-8")
    (REPO_DIR / "checkout_router.py").write_text(FILES["checkout_router.py"], encoding="utf-8")
    run_git(["add", "services/payment_gateway.py", "checkout_router.py"])
    run_git(["commit", "-m", c6["message"]], env={
        **os.environ,
        "GIT_AUTHOR_NAME": c6["author_name"],
        "GIT_AUTHOR_EMAIL": c6["author_email"],
        "GIT_AUTHOR_DATE": c6["date"],
        "GIT_COMMITTER_NAME": c6["author_name"],
        "GIT_COMMITTER_EMAIL": c6["author_email"],
        "GIT_COMMITTER_DATE": c6["date"],
    })

    print(f"[+] Successfully built realistic multi-service Git repository at: {REPO_DIR}")

if __name__ == "__main__":
    build_sample_repo()