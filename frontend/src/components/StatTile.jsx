import React from 'react'

export default function StatTile({ label, value, sublabel, tone = 'default' }) {
  const toneClass = {
    default: 'text-ink-900',
    low: 'text-risk-low',
    medium: 'text-risk-medium',
    high: 'text-risk-high',
    brand: 'text-shield-600',
  }[tone]

  return (
    <div className="card p-5">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-400">{label}</p>
      <p className={`text-2xl font-extrabold mt-1.5 ${toneClass}`}>{value}</p>
      {sublabel && <p className="text-xs text-ink-400 mt-1">{sublabel}</p>}
    </div>
  )
}
