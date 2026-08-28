import React, { useEffect, useState } from 'react'
import api from '../api/client'
import RiskGauge from './RiskGauge'
import RiskPill from './RiskPill'
import ConfidenceMeter from './ConfidenceMeter'
import ExplanationCard from './ExplanationCard'
import Timeline from './Timeline'

// Recipient Shield's core feature scores RECIPIENT accounts before a
// transfer. This card reuses the exact same generic risk engine
// (GET /api/risk/{account_id} works for ANY account, sender or recipient --
// see backend/app/risk/engine.py) but points it at the logged-in user's OWN
// account, so they can see their own account's safety based on their own
// activity so far. Copy is written for "this is you" rather than "this is
// someone you're about to pay" -- the API's own headline/description fields
// are recipient-phrased, so this component supplies its own.
const SAFETY_COPY = {
  LOW: {
    label: 'Your account looks safe',
    description: 'No unusual activity has been detected on your account recently.',
  },
  MEDIUM: {
    label: 'Some unusual activity detected',
    description: 'A few unusual events were found on your account recently. Review your recent activity below.',
  },
  HIGH: {
    label: 'Signs of possible compromise',
    description: 'Your account shows behavior consistent with a takeover attempt. Consider changing your password and reviewing your recent activity immediately.',
  },
}

export default function AccountSafetyCard({ accountId }) {
  const [assessment, setAssessment] = useState(null)
  const [expanded, setExpanded] = useState(false)

  useEffect(() => {
    if (!accountId) return undefined
    let mounted = true
    function load() {
      api
        .get(`/risk/${accountId}`)
        .then(({ data }) => {
          if (mounted) setAssessment(data)
        })
        .catch((err) => console.error('Error loading account safety:', err))
    }
    load()
    const id = setInterval(load, 3000)
    return () => {
      mounted = false
      clearInterval(id)
    }
  }, [accountId])

  if (!assessment) {
    return (
      <div className="card p-6">
        <h2 className="text-sm font-bold text-ink-800 mb-1">Account safety</h2>
        <p className="text-sm text-ink-400 text-center py-10">Checking your account activity...</p>
      </div>
    )
  }

  const copy = SAFETY_COPY[assessment.risk_level] || SAFETY_COPY.LOW

  return (
    <div className="card p-6">
      <div className="flex items-center justify-between mb-1">
        <h2 className="text-sm font-bold text-ink-800">Account safety</h2>
        <span className="text-[11px] text-ink-400">Based on your own account activity</span>
      </div>

      <div className="grid md:grid-cols-[150px_1fr] gap-5 items-center mt-3">
        <div className="flex justify-center">
          <RiskGauge score={assessment.risk_score} level={assessment.risk_level} size={140} />
        </div>
        <div>
          <RiskPill level={assessment.risk_level}>{copy.label}</RiskPill>
          <p className="text-sm text-ink-600 mt-2 max-w-md">{copy.description}</p>
          <div className="mt-3 max-w-xs">
            <ConfidenceMeter confidence={assessment.confidence} />
          </div>
        </div>
      </div>

      <button
        onClick={() => setExpanded((v) => !v)}
        className="mt-4 text-xs font-semibold text-shield-600 hover:underline"
      >
        {expanded ? 'Hide full breakdown' : 'View full activity & breakdown'}
      </button>

      {expanded && (
        <div className="grid md:grid-cols-2 gap-6 mt-4">
          <ExplanationCard
            topReason={assessment.top_reason}
            contributions={assessment.feature_contributions}
            riskScore={assessment.risk_score}
          />
          <div className="card p-5">
            <h3 className="text-sm font-bold text-ink-800 mb-1">Your recent activity</h3>
            <p className="text-xs text-ink-500 mb-4">Logins, device changes, and transactions on your own account.</p>
            <Timeline events={assessment.recent_events} compact />
          </div>
        </div>
      )}
    </div>
  )
}
