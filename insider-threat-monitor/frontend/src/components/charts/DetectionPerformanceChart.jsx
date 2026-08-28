import React from 'react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer, Cell, LabelList } from 'recharts'

export default function DetectionPerformanceChart({ metrics = {} }) {
  const data = [
    { name: 'Accuracy', value: metrics.accuracy },
    { name: 'Precision', value: metrics.precision },
    { name: 'Recall / Detection', value: metrics.detection_rate ?? metrics.recall },
    { name: 'F1 Score', value: metrics.f1_score },
  ]
    .filter((d) => typeof d.value === 'number')
    .map((d) => ({ ...d, pct: Math.round(d.value * 1000) / 10 }))

  if (data.length === 0) {
    return <p className="text-sm text-ink-400 text-center py-10">Model metrics not available. Run `python -m app.ml.train_model`.</p>
  }

  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={data} margin={{ top: 16, right: 16, left: -12, bottom: 4 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#eef1f7" vertical={false} />
        <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#5b6784' }} axisLine={false} tickLine={false} />
        <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: '#5b6784' }} axisLine={false} tickLine={false} unit="%" />
        <Tooltip formatter={(v) => [`${v}%`, 'Score']} contentStyle={{ borderRadius: 10, border: '1px solid #dde1ec', fontSize: 13 }} />
        <Bar dataKey="pct" radius={[6, 6, 0, 0]} maxBarSize={56}>
          {data.map((d, i) => (
            <Cell key={i} fill={d.pct >= 90 ? '#12946f' : d.pct >= 75 ? '#2f63fb' : '#b4790a'} />
          ))}
          <LabelList dataKey="pct" position="top" formatter={(v) => `${v}%`} style={{ fontSize: 12, fill: '#232c42', fontWeight: 600 }} />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}
