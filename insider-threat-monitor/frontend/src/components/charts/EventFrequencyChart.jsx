import React from 'react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer, Cell } from 'recharts'

function humanize(eventType) {
  return eventType
    .split('_')
    .map((w) => w[0] + w.slice(1).toLowerCase())
    .join(' ')
}

export default function EventFrequencyChart({ frequency = {} }) {
  const data = Object.entries(frequency)
    .map(([type, count]) => ({ type: humanize(type), count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8)

  if (data.length === 0) {
    return <p className="text-sm text-ink-400 text-center py-10">No suspicious events recorded yet.</p>
  }

  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={data} layout="vertical" margin={{ left: 8, right: 16, top: 4, bottom: 4 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#eef1f7" horizontal={false} />
        <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11, fill: '#5b6784' }} axisLine={false} tickLine={false} />
        <YAxis
          type="category"
          dataKey="type"
          width={150}
          tick={{ fontSize: 12, fill: '#232c42' }}
          axisLine={false}
          tickLine={false}
        />
        <Tooltip contentStyle={{ borderRadius: 10, border: '1px solid #dde1ec', fontSize: 13 }} />
        <Bar dataKey="count" radius={[0, 6, 6, 0]} maxBarSize={18}>
          {data.map((_, i) => (
            <Cell key={i} fill="#2f63fb" fillOpacity={1 - i * 0.07} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}
