import React, { useEffect, useState } from 'react'
import api from '../api/client'
import { useAuth } from '../context/AuthContext'
import RecipientShieldScreen from '../components/RecipientShieldScreen'

function formatINR(amount) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(amount)
}

const STEPS = { COMPOSE: 'compose', CHECKING: 'checking', RESULT: 'result', VERIFYING: 'verifying', DONE: 'done' }

// The VERIFY decision can now be triggered by up to three independent,
// simultaneous causes: the recipient's own risk_level (MEDIUM), a
// sender-behavior flag (unusual velocity/amount -- see
// sender_behavior_flags), or Trusted Recipient Aging (a still-new
// recipient -- see recipient_aging). A fixed "unusual activity" message
// would be misleading for the latter two, so this builds copy from
// whichever reason(s) actually apply to this assessment.
function verifyReasonCopy(assessment) {
  const reasons = []
  if (assessment.risk_level === 'MEDIUM') {
    reasons.push("some unusual activity was detected on this recipient's account")
  }
  if (assessment.sender_behavior_flags && assessment.sender_behavior_flags.length > 0) {
    reasons.push('this transfer looks unusual compared to your normal sending pattern')
  }
  if (assessment.recipient_aging && assessment.recipient_aging.status === 'NEW') {
    reasons.push("this is a new recipient you haven't sent money to many times before")
  }

  let joined
  if (reasons.length === 0) {
    joined = 'additional verification is required for this transfer'
  } else if (reasons.length === 1) {
    joined = reasons[0]
  } else {
    joined = `${reasons.slice(0, -1).join(', ')}, and ${reasons[reasons.length - 1]}`
  }
  const capitalized = joined.charAt(0).toUpperCase() + joined.slice(1)
  return `${capitalized}. Enter the verification code we've sent to your registered number to continue.`
}

export default function TransferPage({ navigate }) {
  const { user } = useAuth()
  const [recipients, setRecipients] = useState([])
  const [recipientId, setRecipientId] = useState('')
  const [amount, setAmount] = useState('10000')
  const [note, setNote] = useState('')
  const [step, setStep] = useState(STEPS.COMPOSE)
  const [assessment, setAssessment] = useState(null)
  const [finalTxn, setFinalTxn] = useState(null)
  const [otp, setOtp] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  const [showAddRecipient, setShowAddRecipient] = useState(false)
  const [newHolderName, setNewHolderName] = useState('')
  const [newAccountNumber, setNewAccountNumber] = useState('')
  const [newNickname, setNewNickname] = useState('')
  const [addingRecipient, setAddingRecipient] = useState(false)
  const [addRecipientError, setAddRecipientError] = useState(null)

  const [searchQuery, setSearchQuery] = useState('')
  const [suggestions, setSuggestions] = useState([])

  async function handleSearchChange(e) {
    const val = e.target.value
    setSearchQuery(val)
    if (val.trim().length < 2) {
      setSuggestions([])
      return
    }
    try {
      const { data } = await api.get('/recipients/search', { params: { q: val } })
      setSuggestions(data)
    } catch (err) {
      console.error('Error fetching suggestions:', err)
    }
  }

  function handleSelectSuggestion(s) {
    setNewHolderName(s.full_name)
    setNewAccountNumber(s.account_number)
    setSearchQuery(`${s.full_name} (@${s.username})`)
    setSuggestions([])
  }

  function loadRecipients() {
    return api.get('/recipients').then(({ data }) => {
      setRecipients(data)
      return data
    })
  }

  useEffect(() => {
    loadRecipients().then((data) => {
      if (data.length) setRecipientId(data[0].account.id)
    })
  }, [])

  async function handleAddRecipient(e) {
    e.preventDefault()
    setAddingRecipient(true)
    setAddRecipientError(null)
    try {
      const { data } = await api.post('/recipients', {
        holder_name: newHolderName,
        account_number: newAccountNumber.trim() || undefined,
        nickname: newNickname.trim() || undefined,
      })
      await loadRecipients()
      setRecipientId(data.account.id)
      setShowAddRecipient(false)
      setNewHolderName('')
      setNewAccountNumber('')
      setNewNickname('')
      setSearchQuery('')
      setSuggestions([])
    } catch (err) {
      setAddRecipientError(err?.response?.data?.detail || 'Could not add this recipient. Please try again.')
    } finally {
      setAddingRecipient(false)
    }
  }

  async function handleContinue(e) {
    e.preventDefault()
    setError(null)
    setStep(STEPS.CHECKING)
    try {
      const { data } = await api.post('/transfers/check-risk', {
        sender_id: user.accountId,
        recipient_id: recipientId,
        amount: Number(amount),
      })
      setAssessment(data)
      setStep(STEPS.RESULT)
    } catch (err) {
      setError(err?.response?.data?.detail || 'Could not run the risk check. Please try again.')
      setStep(STEPS.COMPOSE)
    }
  }

  async function submitTransfer({ verified = false, action = 'confirm' }) {
    setBusy(true)
    setError(null)
    try {
      const { data } = await api.post('/transfers', {
        sender_id: user.accountId,
        recipient_id: recipientId,
        amount: Number(amount),
        note,
        verified,
        action,
      })
      setFinalTxn(data)
      setStep(STEPS.DONE)
    } catch (err) {
      setError(err?.response?.data?.detail || 'Transfer could not be completed.')
    } finally {
      setBusy(false)
    }
  }

  function reset() {
    setStep(STEPS.COMPOSE)
    setAssessment(null)
    setFinalTxn(null)
    setOtp('')
    setError(null)
  }

  if (step === STEPS.CHECKING) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <div className="h-14 w-14 rounded-full border-4 border-shield-200 border-t-shield-600 animate-spin mb-6" />
        <p className="text-sm font-semibold text-ink-700">Recipient Shield is analyzing recent account activity...</p>
        <p className="text-xs text-ink-400 mt-1">Checking device history, security changes, and transaction patterns.</p>
      </div>
    )
  }

  if (step === STEPS.RESULT && assessment) {
    return (
      <RecipientShieldScreen
        assessment={assessment}
        amount={Number(amount)}
        actions={<DecisionActions assessment={assessment} busy={busy} error={error}
          onAllow={() => submitTransfer({ verified: false, action: 'confirm' })}
          onVerify={() => setStep(STEPS.VERIFYING)}
          onCancel={() => submitTransfer({ verified: false, action: 'cancel' })}
        />}
      />
    )
  }

  if (step === STEPS.VERIFYING && assessment) {
    return (
      <div className="max-w-md mx-auto">
        <div className="card p-7">
          <p className="text-xs font-semibold uppercase tracking-widest text-shield-600 mb-1">Step-up verification</p>
          <h1 className="text-lg font-bold text-ink-900 mb-1">Confirm it's really {assessment.recipient.holder_name}</h1>
          <p className="text-sm text-ink-500 mb-5">
            {verifyReasonCopy(assessment)}
          </p>
          <label className="label">Verification code (simulated -- enter any 6 digits)</label>
          <input
            className="input tracking-[0.3em] text-center font-mono text-lg"
            maxLength={6}
            value={otp}
            onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
            placeholder="------"
          />
          {error && <p className="text-sm text-risk-high mt-3">{error}</p>}
          <div className="flex gap-3 mt-6">
            <button className="btn-secondary flex-1" onClick={() => setStep(STEPS.RESULT)}>
              Back
            </button>
            <button
              className="btn-primary flex-1"
              disabled={otp.length !== 6 || busy}
              onClick={() => submitTransfer({ verified: true, action: 'confirm' })}
            >
              {busy ? 'Verifying...' : 'Verify & continue'}
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (step === STEPS.DONE && finalTxn) {
    return <DoneScreen txn={finalTxn} onNewTransfer={reset} navigate={navigate} />
  }

  const amountNum = Number(amount || 0)

  return (
    <div className="max-w-lg mx-auto">
      <h1 className="text-xl font-bold text-ink-900 mb-1">Send money</h1>
      <p className="text-sm text-ink-500 mb-6">
        Every transfer is checked by Recipient Shield before it's completed -- we analyze the recipient's account, not
        just yours.
      </p>

      <form onSubmit={handleContinue} className="card p-6 space-y-5">
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="label mb-0">Recipient</label>
            <button
              type="button"
              className="text-xs font-semibold text-shield-600 hover:underline"
              onClick={() => {
                setShowAddRecipient((v) => !v)
                setAddRecipientError(null)
              }}
            >
              {showAddRecipient ? 'Cancel' : '+ Add new recipient'}
            </button>
          </div>

          {!showAddRecipient && (
            <select className="input" value={recipientId} onChange={(e) => setRecipientId(e.target.value)}>
              {recipients.map((r) => (
                <option key={r.id} value={r.account.id}>
                  {r.nickname || r.account.holder_name} -- {r.account.account_number}
                  {r.trust_status === 'NEW' ? ' (New)' : ''}
                </option>
              ))}
            </select>
          )}

          {showAddRecipient && (
            <div className="rounded-xl border border-ink-200 bg-ink-50 p-4 space-y-3 relative">
              <p className="text-xs text-ink-500">
                Search for an existing user in the system by their name or username.
              </p>
              <div className="relative">
                <label className="label">Recipient Username or Name</label>
                <input
                  className="input"
                  value={searchQuery}
                  onChange={handleSearchChange}
                  placeholder="Type name or username..."
                  required={showAddRecipient}
                  autoComplete="off"
                />
                {suggestions.length > 0 && (
                  <div className="absolute z-10 w-full mt-1 bg-white border border-ink-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                    {suggestions.map((s) => (
                      <button
                        key={s.account_id}
                        type="button"
                        className="w-full text-left px-4 py-2 text-sm hover:bg-ink-50 transition border-b border-ink-50 last:border-0 block"
                        onClick={() => handleSelectSuggestion(s)}
                      >
                        <div className="font-semibold text-ink-800">{s.full_name}</div>
                        <div className="text-xs text-ink-500">@{s.username} • Account: {s.account_number}</div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div>
                <label className="label">Nickname (optional)</label>
                <input
                  className="input"
                  value={newNickname}
                  onChange={(e) => setNewNickname(e.target.value)}
                  placeholder="e.g. Mom"
                />
              </div>
              {addRecipientError && (
                <p className="text-sm text-risk-high bg-risk-highBg rounded-lg px-3 py-2">{addRecipientError}</p>
              )}
              <button
                type="button"
                className="btn-primary w-full"
                disabled={newAccountNumber.trim().length === 0 || addingRecipient}
                onClick={handleAddRecipient}
              >
                {addingRecipient ? 'Adding recipient...' : 'Add recipient'}
              </button>
            </div>
          )}
        </div>

        <div>
          <label className="label">Amount (INR)</label>
          <div className="relative">
            <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-400 text-sm">Rs.</span>
            <input
              className="input pl-9"
              type="number"
              min="1"
              step="1"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              required
            />
          </div>
          <div className="flex gap-2 mt-2">
            {[1000, 10000, 50000].map((v) => (
              <button
                type="button"
                key={v}
                onClick={() => setAmount(String(v))}
                className="text-xs px-2.5 py-1 rounded-full bg-ink-100 text-ink-600 hover:bg-ink-200"
              >
                {formatINR(v)}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="label">Note (optional)</label>
          <input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="What's this for?" />
        </div>

        {error && <p className="text-sm text-risk-high bg-risk-highBg rounded-lg px-3 py-2">{error}</p>}

        <button className="btn-primary w-full" disabled={!recipientId || amountNum <= 0 || showAddRecipient}>
          Continue Transfer
        </button>
        <p className="text-[11px] text-ink-400 text-center">
          Recipient Shield will analyze the recipient's account before this transfer completes.
        </p>
      </form>
    </div>
  )
}

function DecisionActions({ assessment, busy, error, onAllow, onVerify, onCancel }) {
  // Branches on `decision` (ALLOW/VERIFY/WARN_AND_HOLD), NOT `risk_level` --
  // decision is the authoritative field the backend actually enforces, and
  // the two can now diverge: a sender-behavior flag (unusual transfer
  // velocity or amount, see sender_behavior_flags above) can force VERIFY
  // even when the recipient's own risk_level is LOW. Branching on
  // risk_level here would show "Continue Transfer" while the backend
  // silently requires verification underneath -- confusing, not unsafe
  // (money still can't move without it), but worth getting right.
  const decision = assessment.decision
  return (
    <div className="space-y-3">
      {error && <p className="text-sm text-risk-high bg-risk-highBg rounded-lg px-3 py-2">{error}</p>}
      {decision === 'ALLOW' && (
        <div className="flex gap-3">
          <button className="btn-primary flex-1" disabled={busy} onClick={onAllow}>
            {busy ? 'Sending...' : 'Continue Transfer'}
          </button>
        </div>
      )}
      {decision === 'VERIFY' && (
        <div className="flex gap-3">
          <button className="btn-secondary flex-1" disabled={busy} onClick={onCancel}>
            Cancel Transfer
          </button>
          <button className="btn-primary flex-1" disabled={busy} onClick={onVerify}>
            Verify Recipient & Continue
          </button>
        </div>
      )}
      {decision === 'WARN_AND_HOLD' && (
        <div className="flex gap-3">
          <button className="btn-danger flex-1" disabled={busy} onClick={onCancel}>
            {busy ? 'Cancelling...' : 'Cancel Transfer'}
          </button>
          <button className="btn-secondary flex-1" disabled={busy} onClick={onVerify}>
            Verify Recipient
          </button>
        </div>
      )}
    </div>
  )
}

function DoneScreen({ txn, onNewTransfer, navigate }) {
  const { user } = useAuth()
  const config = {
    COMPLETED: { title: 'Transfer complete', tone: 'text-risk-low', bg: 'bg-risk-lowBg', body: 'Your money is on its way.' },
    HELD: {
      title: 'Transfer paused for manual review',
      tone: 'text-risk-high',
      bg: 'bg-risk-highBg',
      body: 'This recipient account showed strong signs of compromise. Your funds were not sent. Our security team will follow up.',
    },
    CANCELLED: { title: 'Transfer cancelled', tone: 'text-ink-600', bg: 'bg-ink-100', body: 'No money was sent.' },
    PENDING_VERIFICATION: { title: 'Verification required', tone: 'text-risk-medium', bg: 'bg-risk-mediumBg', body: 'Please complete verification to continue.' },
  }[txn.status] || { title: txn.status, tone: 'text-ink-600', bg: 'bg-ink-100', body: '' }

  return (
    <div className="max-w-md mx-auto text-center py-10">
      <div className={`mx-auto h-16 w-16 rounded-full ${config.bg} flex items-center justify-center mb-5`}>
        <StatusIcon status={txn.status} className={config.tone} />
      </div>
      <h1 className={`text-xl font-bold ${config.tone}`}>{config.title}</h1>
      <p className="text-sm text-ink-500 mt-2">{config.body}</p>
      <p className="text-2xl font-extrabold text-ink-900 mt-5">{formatINR(txn.amount)}</p>
      {txn.status === 'COMPLETED' && (
        <p className="text-xs font-medium text-ink-500 mt-3">
          Recipient Shield Security Check completed.
          {' '}
          {(txn.sms_status === 'SENT' || txn.sms_status === 'SIMULATED') && txn.sms_masked_number && (
            <>SMS notification sent to your registered mobile number ({txn.sms_masked_number}).</>
          )}
          {txn.sms_status === 'FAILED' && (
            <>Transaction successful. SMS notification could not be delivered.</>
          )}
          {!txn.sms_status && (
            <>Add a phone number in your profile to get SMS confirmations for future transfers.</>
          )}
        </p>
      )}
      {user.email && (
        <p className="text-[11px] text-ink-400 mt-2">
          An email with the full transaction details was sent to {user.email}.
        </p>
      )}
      <div className="flex gap-3 justify-center mt-8">
        <button className="btn-secondary" onClick={() => navigate('/dashboard')}>
          Back to dashboard
        </button>
        <button className="btn-primary" onClick={onNewTransfer}>
          Send another
        </button>
      </div>
    </div>
  )
}

function StatusIcon({ status, className }) {
  if (status === 'COMPLETED') {
    return (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" className={className}>
        <path d="M5 13l4 4L19 7" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    )
  }
  if (status === 'HELD') {
    return (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" className={className}>
        <path d="M12 9v4M12 17h.01M10.3 3.9L2.7 17.1a1.8 1.8 0 001.6 2.7h15.4a1.8 1.8 0 001.6-2.7L13.7 3.9a1.8 1.8 0 00-3.4 0z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    )
  }
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" className={className}>
      <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
