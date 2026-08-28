import React from 'react'
import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from 'recharts'

const COLORS = { POOR: '#c8293c', FAIR: '#b4790a', GOOD: '#2f63fb', EXCELLENT: '#12946f' }

export default function CibilDistributionChart({ distribution = {} }) {
  const data = ['POOR', 'FAIR', 'GOOD', 'EXCELLENT']
    .map((level) => ({ name: level, value: distribution[level] || 0 }))
    .filter((d) => d.value > 0)

  if (data.length === 0) {
    return <p className="text-sm text-ink-400 text-center py-10">No monitored credit profiles yet.</p>
  }

  return (
    <ResponsiveContainer width="100%" height={240}>
      <PieChart>
        <Pie data={data} dataKey="value" nameKey="name" innerRadius={62} outerRadius={92} paddingAngle={3}>
          {data.map((d) => (
            <Cell key={d.name} fill={COLORS[d.name]} stroke="white" strokeWidth={2} />
          ))}
        </Pie>
        <Tooltip
          contentStyle={{ borderRadius: 10, border: '1px solid #dde1ec', fontSize: 13 }}
          formatter={(value, name) => [`${value} accounts`, `${name} score`]}
        />
        <Legend
          verticalAlign="bottom"
          height={28}
          formatter={(value) => <span className="text-xs text-ink-600">{value}</span>}
        />
      </PieChart>
    </ResponsiveContainer>
  )
}
