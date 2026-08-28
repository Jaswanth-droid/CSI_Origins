import React from 'react'

function timeAgo(iso) {
  const then = new Date(iso).getTime()
  const now = Date.now()
  const diffMs = Math.max(0, now - then)
  const mins = Math.round(diffMs / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins} min${mins === 1 ? '' : 's'} ago`
  const hours = Math.round(mins / 60)
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`
  const days = Math.round(hours / 24)
  return `${days} day${days === 1 ? '' : 's'} ago`
}

function formatAmount(amount) {
  if (amount === null || amount === undefined) return null
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(amount)
}

export default function Timeline({ events = [], compact = false }) {
  if (!events.length) {
    return <p className="text-sm text-ink-400 py-6 text-center">No account activity recorded yet.</p>
  }

  // most-recent first for display
  const sorted = [...events].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))

  return (
    <ol className={`relative ${compact ? 'max-h-80 overflow-y-auto thin-scroll pr-1' : ''}`}>
      {sorted.map((e, i) => (
        <li key={i} className="relative pl-8 pb-6 last:pb-0">
          {i !== sorted.length - 1 && (
            <span className="absolute left-[9px] top-4 bottom-0 w-px bg-ink-200" />
          )}
          <span
            className={`absolute left-0 top-0.5 flex h-5 w-5 items-center justify-center rounded-full ring-4 ring-white ${
              e.risk_signal ? 'bg-risk-high' : 'bg-ink-300'
            }`}
          >
            <span className="h-1.5 w-1.5 rounded-full bg-white" />
          </span>
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className={`text-sm font-semibold ${e.risk_signal ? 'text-risk-high' : 'text-ink-800'}`}>
                {e.label}
                {e.risk_signal && (
                  <span className="ml-2 pill-high align-middle">flagged</span>
                )}
              </p>
              <p className="text-xs text-ink-400 mt-0.5">
                {timeAgo(e.timestamp)}
                {e.device_id ? ` -- ${e.device_id}` : ''}
                {e.location ? ` -- ${e.location}` : ''}
              </p>
              {e.metadata && e.metadata.beneficiary_name && (
                <p className="text-xs text-ink-500 mt-0.5">Beneficiary: {e.metadata.beneficiary_name}</p>
              )}
            </div>
            {formatAmount(e.amount) && (
              <span className="text-sm font-semibold text-ink-700 whitespace-nowrap">{formatAmount(e.amount)}</span>
            )}
          </div>
        </li>
      ))}
    </ol>
  )
}
