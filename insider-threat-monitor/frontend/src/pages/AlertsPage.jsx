import React, { useCallback, useEffect, useState } from 'react'
import api from '../api/client'
import { useAuth } from '../context/AuthContext'
import RiskPill from '../components/RiskPill'

function formatINR(amount) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(amount)
}

export default function AlertsPage() {
  const { user } = useAuth()
  const [alerts, setAlerts] = useState([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState(null)
  const [confirmId, setConfirmId] = useState(null)
  const [errorById, setErrorById] = useState({})

  const load = useCallback(async () => {
    const { data } = await api.get('/alerts', { params: { account_id: user.accountId } })
    setAlerts(data)
    setLoading(false)
  }, [user.accountId])

  useEffect(() => {
    let mounted = true
    function refresh() {
      load().catch((err) => console.error('Error polling alerts:', err))
    }
    refresh()
    const id = setInterval(refresh, 3000)
    return () => {
      mounted = false
      clearInterval(id)
    }
  }, [load])

  async function requestRefund(transactionId) {
    setBusyId(transactionId)
    setErrorById((prev) => ({ ...prev, [transactionId]: null }))
    try {
      // Sender has explicitly confirmed via the two-step dialog below --
      // consent: true is only ever sent as a direct result of that click.
      await api.post(`/transfers/${transactionId}/request-refund`, { consent: true })
      setConfirmId(null)
      await load()
    } catch (err) {
      setErrorById((prev) => ({
        ...prev,
        [transactionId]: err?.response?.data?.detail || 'Could not submit the refund request. Please try again.',
      }))
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div>
      <h1 className="text-xl font-bold text-ink-900 mb-1">Compromise alerts</h1>
      <p className="text-sm text-ink-500 mb-6 max-w-2xl">
        Recipient Shield keeps watching recipients even after a transfer completes. If an account you already sent
        money to starts showing strong signs of takeover, it shows up here so you can request an automatic refund --
        with your explicit permission.
      </p>

      {loading ? (
        <p className="text-sm text-ink-400 text-center py-10">Loading...</p>
      ) : alerts.length === 0 ? (
        <div className="card p-10 text-center">
          <p className="text-sm font-semibold text-ink-700">No compromise alerts</p>
          <p className="text-xs text-ink-400 mt-1">
            None of your completed transfers' recipients currently show post-transfer risk signs.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {alerts.map((alert) => (
            <AlertCard
              key={alert.transaction.id}
              alert={alert}
              busy={busyId === alert.transaction.id}
              error={errorById[alert.transaction.id]}
              confirming={confirmId === alert.transaction.id}
              onAskConfirm={() => setConfirmId(alert.transaction.id)}
              onCancelConfirm={() => setConfirmId(null)}
              onConfirmRefund={() => requestRefund(alert.transaction.id)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function AlertCard({ alert, busy, error, confirming, onAskConfirm, onCancelConfirm, onConfirmRefund }) {
  const { transaction, recipient, original_risk_level, current_risk, refund_request, message } = alert
  const alreadyRefunded = refund_request && refund_request.status === 'APPROVED'

  return (
    <div className="card border border-risk-high/20 bg-risk-highBg/40 p-5 md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-risk-high mb-1">
            Recipient compromised after transfer
          </p>
          <h2 className="text-base font-bold text-ink-900">{recipient.holder_name}</h2>
          <p className="text-xs text-ink-500">{recipient.account_number} -- {recipient.bank_name}</p>
        </div>
        <div className="text-right">
          <p className="text-lg font-extrabold text-ink-900">{formatINR(transaction.amount)}</p>
          <p className="text-[11px] text-ink-400">{new Date(transaction.created_at).toLocaleString()}</p>
        </div>
      </div>

      <div className="flex items-center gap-2 mb-3">
        {original_risk_level && (
          <span className="text-xs text-ink-500">
            At transfer time: <RiskPill level={original_risk_level} />
          </span>
        )}
        <span className="text-xs text-ink-500">
          Now: <RiskPill level={current_risk.risk_level} />
        </span>
      </div>

      <p className="text-sm text-ink-700 mb-3">{message}</p>

      {current_risk.reasons?.length > 0 && (
        <ul className="mb-4 space-y-1">
          {current_risk.reasons.slice(0, 4).map((r, i) => (
            <li key={i} className="flex items-start gap-2 text-xs text-ink-600">
              <span className="mt-1 h-1.5 w-1.5 rounded-full bg-risk-high shrink-0" />
              {r}
            </li>
          ))}
        </ul>
      )}

      {error && <p className="text-sm text-risk-high bg-white/70 rounded-lg px-3 py-2 mb-3">{error}</p>}

      {alreadyRefunded ? (
        <div className="rounded-lg bg-white/70 px-3 py-2.5 flex items-center justify-between">
          <p className="text-sm font-semibold text-risk-low">Refund completed</p>
          <p className="text-xs text-ink-500">
            {formatINR(refund_request.refunded_amount)} returned to your account
            {refund_request.resolved_at ? ` on ${new Date(refund_request.resolved_at).toLocaleDateString()}` : ''}
          </p>
        </div>
      ) : confirming ? (
        <div className="rounded-lg bg-white/70 px-4 py-3">
          <p className="text-sm text-ink-700 mb-3">
            This will submit an auto-refund request to the bank for {formatINR(transaction.amount)} and reverse this
            transfer. Do you want to proceed?
          </p>
          <div className="flex gap-3">
            <button className="btn-secondary flex-1" onClick={onCancelConfirm} disabled={busy}>
              No, go back
            </button>
            <button className="btn-danger flex-1" onClick={onConfirmRefund} disabled={busy}>
              {busy ? 'Submitting...' : 'Yes, request refund'}
            </button>
          </div>
        </div>
      ) : (
        <button className="btn-danger" onClick={onAskConfirm}>
          Request auto-refund
        </button>
      )}
    </div>
  )
}
