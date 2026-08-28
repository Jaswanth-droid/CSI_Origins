import React from 'react'

export default function StatTile({ label, value, tone = 'default', icon }) {
  const accentClass = {
    default: 'border-t-4 border-t-ink-200',
    low: 'border-t-4 border-t-risk-low',
    medium: 'border-t-4 border-t-risk-medium',
    high: 'border-t-4 border-t-risk-high',
    brand: 'border-t-4 border-t-shield-600',
  }[tone]

  const textClass = {
    default: 'text-ink-900',
    low: 'text-risk-low',
    medium: 'text-risk-medium',
    high: 'text-risk-high',
    brand: 'text-shield-600',
  }[tone]

  const bgLight = {
    default: 'bg-ink-100 text-ink-600',
    low: 'bg-risk-lowBg text-risk-low',
    medium: 'bg-risk-mediumBg text-risk-medium',
    high: 'bg-risk-highBg text-risk-high',
    brand: 'bg-shield-50 text-shield-600',
  }[tone]

  return (
    <div className={`card p-3.5 ${accentClass} hover:shadow-md hover:translate-y-[-1px] transition-all duration-200 relative overflow-hidden group`}>
      <div className="flex justify-between items-center">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wider text-ink-400 group-hover:text-ink-500 transition-colors">{label}</p>
          <p className={`text-2xl font-black mt-0.5 tracking-tight ${textClass}`}>{value}</p>
        </div>
        <div className={`h-8 w-8 rounded-lg ${bgLight} text-base flex items-center justify-center shrink-0 shadow-sm`}>
          {icon || "📊"}
        </div>
      </div>
    </div>
  )
}
