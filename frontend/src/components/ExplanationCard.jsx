import React from 'react'

export default function ExplanationCard({ topReason, contributions = [], riskScore = 0 }) {
  const maxPoints = Math.max(1, ...contributions.map((c) => c.points))

  return (
    <div className="card p-5">
      <div className="flex items-center justify-between mb-1">
        <h3 className="text-sm font-bold text-ink-800">Why this score?</h3>
        <span className="text-[11px] font-medium text-ink-400 uppercase tracking-wide">Explainable AI</span>
      </div>
      <p className="text-xs text-ink-500 mb-4">
        AI-generated risk assessment based on simulated account activity.
      </p>

      {contributions.length === 0 ? (
        <p className="text-sm text-ink-500">No significant risk factors were found for this account.</p>
      ) : (
        <div className="space-y-3">
          {contributions.map((c) => (
            <div key={c.feature}>
              <div className="flex items-center justify-between text-sm mb-1">
                <span className="text-ink-700">{c.label}</span>
                <span className="font-semibold text-ink-800">+{c.points}</span>
              </div>
              <div className="h-2 rounded-full bg-ink-100 overflow-hidden">
                <div
                  className="h-full rounded-full bg-shield-500"
                  style={{ width: `${Math.max(6, (c.points / maxPoints) * 100)}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="mt-5 rounded-lg bg-ink-50 border border-ink-100 p-3.5">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-400 mb-1">Top reason</p>
        <p className="text-sm text-ink-800 font-medium">{topReason}</p>
      </div>
    </div>
  )
}
