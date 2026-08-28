import React from 'react'

// A semicircular risk gauge, 0-100, with a needle and colored risk bands.
// Pure inline SVG -- no chart library needed for a single gauge, keeps
// Recharts reserved for the actual data charts on the analytics page.
export default function RiskGauge({ score = 0, level = 'LOW', size = 220 }) {
  const clamped = Math.max(0, Math.min(100, score))
  const angle = -180 + (clamped / 100) * 180 // -180 (left) .. 0 (right)
  const rad = (angle * Math.PI) / 180
  const cx = 110
  const cy = 110
  const r = 88
  const needleX = cx + r * 0.82 * Math.cos(rad)
  const needleY = cy + r * 0.82 * Math.sin(rad)

  const colorByLevel = { LOW: '#12946f', MEDIUM: '#b4790a', HIGH: '#c8293c' }
  const color = colorByLevel[level] || '#5b6784'

  const arc = (startDeg, endDeg, strokeColor) => {
    const sr = (startDeg * Math.PI) / 180
    const er = (endDeg * Math.PI) / 180
    const x1 = cx + r * Math.cos(sr)
    const y1 = cy + r * Math.sin(sr)
    const x2 = cx + r * Math.cos(er)
    const y2 = cy + r * Math.sin(er)
    const largeArc = endDeg - startDeg > 180 ? 1 : 0
    return (
      <path
        d={`M ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2}`}
        stroke={strokeColor}
        strokeWidth={16}
        strokeLinecap="round"
        fill="none"
      />
    )
  }

  return (
    <div className="flex flex-col items-center" style={{ width: size }}>
      <svg viewBox="0 0 220 130" width={size} height={size * (130 / 220)}>
        {arc(-180, -126, '#12946f')}
        {arc(-126, -54, '#b4790a')}
        {arc(-54, 0, '#c8293c')}
        {/* needle */}
        <circle cx={cx} cy={cy} r={7} fill="#0c1220" />
        <line x1={cx} y1={cy} x2={needleX} y2={needleY} stroke="#0c1220" strokeWidth={3} strokeLinecap="round" />
      </svg>
      <div className="-mt-6 flex flex-col items-center">
        <span className="text-4xl font-extrabold tracking-tight" style={{ color }}>
          {Math.round(clamped)}
        </span>
        <span className="text-xs font-semibold uppercase tracking-wide text-ink-400">Risk score / 100</span>
      </div>
    </div>
  )
}
