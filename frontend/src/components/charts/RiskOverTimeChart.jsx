import React from 'react'
import { AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer } from 'recharts'

export default function RiskOverTimeChart({ points = [] }) {
  if (points.length === 0) {
    return <p className="text-sm text-ink-400 text-center py-10">Not enough risk-check history yet.</p>
  }

  return (
    <ResponsiveContainer width="100%" height={240}>
      <AreaChart data={points} margin={{ left: -12, right: 16, top: 8, bottom: 4 }}>
        <defs>
          <linearGradient id="riskFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#2f63fb" stopOpacity={0.35} />
            <stop offset="100%" stopColor="#2f63fb" stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#eef1f7" vertical={false} />
        <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#5b6784' }} axisLine={false} tickLine={false} />
        <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: '#5b6784' }} axisLine={false} tickLine={false} />
        <Tooltip
          contentStyle={{ borderRadius: 10, border: '1px solid #dde1ec', fontSize: 13 }}
          formatter={(value) => [`${value}`, 'Avg risk score']}
        />
        <Area type="monotone" dataKey="average_risk_score" stroke="#2f63fb" strokeWidth={2.5} fill="url(#riskFill)" />
      </AreaChart>
    </ResponsiveContainer>
  )
}
