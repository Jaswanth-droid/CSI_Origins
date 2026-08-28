import React, { useEffect, useState, useCallback } from 'react'
import api from '../api/client'
import Timeline from '../components/Timeline'
import RiskPill from '../components/RiskPill'
import RiskGauge from '../components/RiskGauge'
import ExplanationCard from '../components/ExplanationCard'
import ConfidenceMeter from '../components/ConfidenceMeter'

export default function RecipientTimelinePage() {
  const [recipients, setRecipients] = useState([])
  const [selected, setSelected] = useState(null)
  const [risk, setRisk] = useState(null)
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)
  const [simBusy, setSimBusy] = useState(false)
  const [simMessage, setSimMessage] = useState(null)

  useEffect(() => {
    api.get('/recipients').then(({ data }) => {
      setRecipients(data)
      if (data.length) setSelected(data[0].account.id)
      setLoading(false)
    })
  }, [])

  const loadRisk = useCallback((accountId) => {
    if (!accountId) return Promise.resolve()
    return Promise.all([api.get(`/risk/${accountId}`), api.get(`/risk/${accountId}/timeline`)]).then(([r, t]) => {
      setRisk(r.data)
      setEvents(t.data)
    })
  }, [])

  useEffect(() => {
    setSimMessage(null)
    let mounted = true
    loadRisk(selected).then(() => {
      if (!mounted) return
    })
    return () => {
      mounted = false
    }
  }, [selected, loadRisk])

  async function simulateCompromise() {
    if (!selected) return
    setSimBusy(true)
    setSimMessage(null)
    try {
      // (Demo/testing tool) Marks THIS specific recipient as compromised,
      // instead of the fixed canonical demo account the Attack Simulation
      // page's quick triggers always reset. This is what lets you actually
      // exercise the "Compromise Alerts" flow: send this recipient money
      // first (while they're still low/medium risk, so the transfer
      // completes), then come back here and trigger this to see the alert
      // appear for that already-completed transfer.
      await api.post('/simulation/compromised', { account_id: selected })
      await loadRisk(selected)
      setSimMessage('Done -- this account now shows signs of compromise. If you have a completed transfer to it, check Compromise Alerts.')
    } catch (err) {
      setSimMessage(err?.response?.data?.detail || 'Could not run the simulation.')
    } finally {
      setSimBusy(false)
    }
  }

  return (
    <div>
      <h1 className="text-xl font-bold text-ink-900 mb-1">Recipient activity</h1>
      <p className="text-sm text-ink-500 mb-6">Behavioral timelines for your trusted recipients' accounts.</p>

      <div className="grid md:grid-cols-[220px_1fr] gap-6">
        <div className="space-y-2">
          {loading && <p className="text-sm text-ink-400">Loading...</p>}
          {recipients.map((r) => (
            <button
              key={r.id}
              onClick={() => setSelected(r.account.id)}
              className={`w-full text-left card p-3.5 transition-colors ${
                selected === r.account.id ? 'border-shield-400 ring-1 ring-shield-300' : ''
              }`}
            >
              <p className="text-sm font-semibold text-ink-800">{r.nickname || r.account.holder_name}</p>
              <p className="text-[11px] text-ink-400">{r.account.account_number}</p>
            </button>
          ))}
        </div>

        <div className="space-y-6">
          {risk && (
            <div className="card p-6 grid md:grid-cols-[200px_1fr] gap-6 items-center">
              <div className="flex justify-center">
                <RiskGauge score={risk.risk_score} level={risk.risk_level} size={170} />
              </div>
              <div>
                <div className="flex items-center gap-2 mb-2 flex-wrap">
                  <RiskPill level={risk.risk_level} />
                  <span className="text-xs text-ink-400">{risk.decision.replace(/_/g, ' ')}</span>
                  {risk.recipient_aging && (
                    <span
                      className={`pill text-[10px] ${
                        risk.recipient_aging.status === 'NEW' ? 'bg-shield-100 text-shield-700' : 'bg-risk-lowBg text-risk-low'
                      }`}
                    >
                      {risk.recipient_aging.status === 'NEW'
                        ? `New recipient -- ${risk.recipient_aging.legitimate_transfer_count}/${risk.recipient_aging.verification_threshold} transfers`
                        : 'Trusted recipient'}
                    </span>
                  )}
                </div>
                <h2 className="text-lg font-bold text-ink-900">{risk.recipient.holder_name}</h2>
                <p className="text-sm text-ink-500 mb-4">{risk.recipient.account_number}</p>
                <ConfidenceMeter confidence={risk.confidence} />
              </div>
            </div>
          )}

          <div className="grid md:grid-cols-2 gap-6">
            {risk && (
              <ExplanationCard topReason={risk.top_reason} contributions={risk.feature_contributions} riskScore={risk.risk_score} />
            )}
            <div className="card p-5">
              <div className="flex items-center justify-between mb-1">
                <h3 className="text-sm font-bold text-ink-800">Behavioral timeline</h3>
                {risk && <span className="text-[11px] text-ink-400">Possible account takeover: {risk.risk_level}</span>}
              </div>
              <p className="text-xs text-ink-500 mb-4">Traced from this recipient's own account activity -- logins, device/SIM changes, beneficiary edits, transactions.</p>
              <Timeline events={events} />
            </div>
          </div>

          {selected && (
            <div className="card p-5 border border-ink-200 bg-ink-50">
              <p className="text-xs font-semibold uppercase tracking-wide text-ink-400 mb-1">Demo tool</p>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-xs text-ink-500 max-w-lg">
                  Testing post-transfer monitoring? This simulates this specific recipient's account becoming
                  compromised right now -- send them money first while they're still safe, then trigger this to see
                  it show up under Compromise Alerts.
                </p>
                <button className="btn-secondary text-xs px-3 py-1.5 shrink-0" onClick={simulateCompromise} disabled={simBusy}>
                  {simBusy ? 'Simulating...' : 'Simulate compromise on this account'}
                </button>
              </div>
              {simMessage && <p className="text-xs text-ink-600 mt-3">{simMessage}</p>}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
