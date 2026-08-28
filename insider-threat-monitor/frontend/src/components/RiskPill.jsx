import React from 'react'

const CLASS_BY_LEVEL = {
  LOW: 'pill-low',
  MEDIUM: 'pill-medium',
  HIGH: 'pill-high',
}

const DOT_BY_LEVEL = {
  LOW: 'bg-risk-low',
  MEDIUM: 'bg-risk-medium',
  HIGH: 'bg-risk-high',
}

export default function RiskPill({ level, children }) {
  return (
    <span className={CLASS_BY_LEVEL[level] || 'pill bg-ink-100 text-ink-600'}>
      <span className={`h-1.5 w-1.5 rounded-full ${DOT_BY_LEVEL[level] || 'bg-ink-400'}`} />
      {children || `${level} RISK`}
    </span>
  )
}
