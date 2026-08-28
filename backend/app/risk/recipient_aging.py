"""
Trusted Recipient Aging.

A brand-new recipient carries more fraud risk than one the sender has a
real, repeated history with -- there's no track record yet to distinguish
"a genuine ongoing relationship" from "a one-off scam beneficiary set up
minutes before the transfer". This module implements a simple, transparent
aging mechanism (deliberately NOT part of the ML risk engine -- like
app/risk/sender_signals.py, this is a plain rule against the sender's own
`Recipient` relationship row, so it stays easy to explain in the UI):

  - A recipient starts life NEW (legitimate_transfer_count == 0).
  - Each of the first NEW_RECIPIENT_VERIFICATION_COUNT completed, legitimate
    transfers to that recipient increments the count (see
    app/routers/transfers.py::initiate_transfer, which increments it only
    when a transfer actually COMPLETES).
  - Once the count reaches NEW_RECIPIENT_VERIFICATION_COUNT, the recipient
    is TRUSTED and stops requiring the extra step-up verification this
    module asks for.
  - A refund issued against a completed transfer to this recipient (see
    request_refund) resets the count back to 0 -- a refund means the
    "legitimate transaction" it credited turned out not to be legitimate
    after all, so that trust-building progress should not stand.

This is deliberately independent of the recipient's own behavioral risk
score (app/risk/engine.py) and of the sender-behavior signals
(app/risk/sender_signals.py) -- a recipient can be perfectly LOW risk by
account activity and still be brand-new to THIS sender, which is exactly
the case this module exists to catch.
"""
from app.config import NEW_RECIPIENT_VERIFICATION_COUNT

STATUS_NEW = "NEW"
STATUS_TRUSTED = "TRUSTED"


def status_for(recipient_link) -> str:
    """`recipient_link` is a models.Recipient row, or None (e.g. a transfer
    to an account the sender hasn't saved as a recipient at all -- treated
    as maximally new/untrusted, same as a freshly-added one)."""
    count = getattr(recipient_link, "legitimate_transfer_count", 0) or 0
    if count >= NEW_RECIPIENT_VERIFICATION_COUNT:
        return STATUS_TRUSTED
    return STATUS_NEW


def evaluate(recipient_link) -> dict:
    """Returns the full aging picture for this sender/recipient relationship,
    used both to decide whether to escalate the transfer decision and to
    show trust-building progress in the UI."""
    count = getattr(recipient_link, "legitimate_transfer_count", 0) or 0
    status = status_for(recipient_link)
    transfers_until_trusted = max(0, NEW_RECIPIENT_VERIFICATION_COUNT - count)
    return {
        "status": status,
        "legitimate_transfer_count": count,
        "verification_threshold": NEW_RECIPIENT_VERIFICATION_COUNT,
        "transfers_until_trusted": transfers_until_trusted,
        "requires_extra_verification": status == STATUS_NEW,
    }
