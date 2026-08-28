import React from 'react'
import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from 'recharts'

const COLORS = { LOW: '#12946f', MEDIUM: '#b4790a', HIGH: '#c8293c' }

export default function RiskDistributionChart({ distribution = {} }) {
  const data = ['LOW', 'MEDIUM', 'HIGH']
    .map((level) => ({ name: level, value: distribution[level] || 0 }))
    .filter((d) => d.value > 0)

  if (data.length === 0) {
    return <p className="text-sm text-ink-400 text-center py-10">No monitored accounts yet.</p>
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
          formatter={(value, name) => [`${value} accounts`, `${name} risk`]}
        />
        <Legend
          verticalAlign="bottom"
          height={28}
          formatter={(value) => <span className="text-xs text-ink-600">{value} risk</span>}
        />
      </PieChart>
    </ResponsiveContainer>
  )
}
