import React from 'react'

// How sure is the model of this risk score? Distinct from the risk score
// itself -- confidence measures agreement across the RandomForest's trees
// (see app/risk/engine.py::_tree_agreement_confidence on the backend), so a
// HIGH risk score can be reported with high OR lower confidence, and so can
// a LOW one. Kept in brand blue (not the risk red/amber/green ramp) so it's
// never mistaken for a risk-level signal.
function confidenceLabel(value) {
  if (value >= 0.9) return 'High confidence'
  if (value >= 0.75) return 'Moderate confidence'
  return 'Lower confidence'
}

export default function ConfidenceMeter({ confidence = 0, compact = false }) {
  const pct = Math.round(Math.max(0, Math.min(1, confidence)) * 100)
  const label = confidenceLabel(confidence)

  if (compact) {
    return (
      <span className="text-xs text-ink-400">
        Model confidence: <span className="font-semibold text-ink-600">{pct}%</span>
      </span>
    )
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-xs font-semibold uppercase tracking-wide text-ink-400">Model confidence</span>
        <span className="text-sm font-bold text-shield-700">{pct}%</span>
      </div>
      <div className="h-2 rounded-full bg-ink-100 overflow-hidden">
        <div className="h-full rounded-full bg-shield-500" style={{ width: `${Math.max(4, pct)}%` }} />
      </div>
      <p className="text-[11px] text-ink-400 mt-1.5">
        {label} -- based on how consistently the model's decision trees agree on this account's risk score.
      </p>
    </div>
  )
}
