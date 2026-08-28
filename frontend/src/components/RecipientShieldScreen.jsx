import React from 'react'
import RiskGauge from './RiskGauge'
import RiskPill from './RiskPill'
import Timeline from './Timeline'
import ExplanationCard from './ExplanationCard'
import ConfidenceMeter from './ConfidenceMeter'

function formatINR(amount) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(amount)
}

const HEADLINE_STYLES = {
  LOW: { bg: 'bg-risk-lowBg', border: 'border-risk-low/20', text: 'text-risk-low' },
  MEDIUM: { bg: 'bg-risk-mediumBg', border: 'border-risk-medium/20', text: 'text-risk-medium' },
  HIGH: { bg: 'bg-risk-highBg', border: 'border-risk-high/20', text: 'text-risk-high' },
}

export default function RecipientShieldScreen({ assessment, amount, actions }) {
  const {
    risk_score, risk_level, headline, description, top_reason, reasons, feature_contributions,
    recent_events, recipient, confidence, sender_behavior_flags, recipient_aging,
  } = assessment
  const style = HEADLINE_STYLES[risk_level] || HEADLINE_STYLES.LOW

  return (
    <div className="space-y-6">
      <div className="text-center">
        <p className="text-xs font-semibold uppercase tracking-widest text-shield-600 mb-1">Recipient Shield Security Check</p>
        <h1 className="text-xl font-bold text-ink-900">
          Checking <span className="text-shield-700">{recipient.holder_name}</span>
          {amount ? <> before sending {formatINR(amount)}</> : null}
        </h1>
      </div>

      <div className={`card border ${style.border} ${style.bg} p-6 md:p-8`}>
        <div className="grid md:grid-cols-[220px_1fr] gap-6 items-center">
          <div className="flex justify-center">
            <RiskGauge score={risk_score} level={risk_level} />
          </div>
          <div>
            <div className="flex items-center gap-2 mb-2">
              <RiskPill level={risk_level} />
              <ConfidenceMeter confidence={confidence} compact />
            </div>
            <h2 className={`text-2xl font-extrabold ${style.text}`}>{headline}</h2>
            <p className="text-sm text-ink-600 mt-1.5 max-w-lg">{description}</p>
            {reasons.length > 0 && (
              <ul className="mt-4 space-y-1.5">
                {reasons.slice(0, 5).map((r, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-ink-700">
                    <span className={`mt-1.5 h-1.5 w-1.5 rounded-full shrink-0 ${style.text.replace('text-', 'bg-')}`} />
                    {r}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>

      {sender_behavior_flags && sender_behavior_flags.length > 0 && (
        <div className="card border border-risk-medium/30 bg-risk-mediumBg p-5 md:p-6">
          <p className="text-xs font-semibold uppercase tracking-widest text-risk-medium mb-2">
            Unusual sending pattern detected
          </p>
          <ul className="space-y-1.5">
            {sender_behavior_flags.map((f, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-ink-700">
                <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-risk-medium shrink-0" />
                {f.message}
              </li>
            ))}
          </ul>
          <p className="text-[11px] text-ink-500 mt-3">
            This is about YOUR account's own sending pattern -- separate from the recipient's risk shown above.
          </p>
        </div>
      )}

      {recipient_aging && recipient_aging.status === 'NEW' && (
        <div className="card border border-shield-300/50 bg-shield-50 p-5 md:p-6">
          <div className="flex items-center justify-between gap-3 mb-2">
            <p className="text-xs font-semibold uppercase tracking-widest text-shield-700">
              New recipient -- building trust
            </p>
            <span className="text-[11px] font-semibold text-shield-700 shrink-0">
              {recipient_aging.legitimate_transfer_count}/{recipient_aging.verification_threshold} transfers
            </span>
          </div>
          <p className="text-sm text-ink-700">
            You haven't sent money to this recipient many times before, so this transfer needs extra verification --
            regardless of the recipient's own risk score above. {recipient_aging.transfers_until_trusted === 1
              ? 'One more completed transfer and this recipient will be fully trusted.'
              : `${recipient_aging.transfers_until_trusted} more completed transfers and this recipient will be fully trusted.`}
          </p>
          <div className="mt-3 h-1.5 rounded-full bg-shield-100 overflow-hidden">
            <div
              className="h-full rounded-full bg-shield-500"
              style={{
                width: `${Math.min(100, (recipient_aging.legitimate_transfer_count / recipient_aging.verification_threshold) * 100)}%`,
              }}
            />
          </div>
        </div>
      )}

      <div className="grid md:grid-cols-2 gap-6">
        <ExplanationCard topReason={top_reason} contributions={feature_contributions} riskScore={risk_score} />
        <div className="card p-5">
          <h3 className="text-sm font-bold text-ink-800 mb-1">Recipient activity timeline</h3>
          <p className="text-xs text-ink-500 mb-4">Recent behavioral sequence for this account.</p>
          <Timeline events={recent_events} compact />
        </div>
      </div>

      <div className="card p-5">{actions}</div>

      <p className="text-center text-[11px] text-ink-400">
        {assessment.disclaimer}
      </p>
    </div>
  )
}
