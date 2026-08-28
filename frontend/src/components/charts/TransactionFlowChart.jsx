import React from 'react'
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
  ResponsiveContainer,
} from 'recharts'

// Sent vs. received are two distinct entities (not a magnitude scale), so
// they get fixed categorical colors -- never swapped, never reused for
// anything else on this chart. Validated colorblind-safe as a pair
// (CVD deltaE ~25, normal-vision deltaE ~28) -- see the dataviz skill.
const SENT_COLOR = '#2f63fb' // shield-500 (matches "Sent" badges elsewhere in the app)
const RECEIVED_COLOR = '#12946f' // risk-low (matches "Received" badges elsewhere in the app)

function formatINR(amount) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(amount)
}

function formatShortDate(iso) {
  const d = new Date(`${iso}T00:00:00`)
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
}

const tooltipStyle = { borderRadius: 10, border: '1px solid #dde1ec', fontSize: 13 }
const legendFormatter = (value) => <span className="text-xs text-ink-600">{value}</span>

export default function TransactionFlowChart({ data = [], mode = 'line' }) {
  if (data.length === 0) {
    return <p className="text-sm text-ink-400 text-center py-16">No completed transfers in this period yet.</p>
  }

  const chartData = data.map((d) => ({ ...d, label: formatShortDate(d.date) }))

  const sharedAxes = (
    <>
      <CartesianGrid strokeDasharray="3 3" stroke="#eef1f7" vertical={false} />
      <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#5b6784' }} axisLine={false} tickLine={false} />
      <YAxis
        tick={{ fontSize: 11, fill: '#5b6784' }}
        axisLine={false}
        tickLine={false}
        tickFormatter={(v) => (v >= 1000 ? `${Math.round(v / 1000)}k` : v)}
        width={44}
      />
      <Tooltip
        contentStyle={tooltipStyle}
        labelFormatter={(label, payload) => (payload && payload[0] ? new Date(`${payload[0].payload.date}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : label)}
        formatter={(value, name) => [formatINR(value), name]}
      />
      <Legend verticalAlign="top" align="right" height={28} iconType="circle" iconSize={8} formatter={legendFormatter} />
    </>
  )

  return (
    <ResponsiveContainer width="100%" height={300}>
      {mode === 'bar' ? (
        <BarChart data={chartData} margin={{ left: -8, right: 8, top: 4, bottom: 4 }} barGap={4}>
          {sharedAxes}
          <Bar dataKey="sent" name="Sent" fill={SENT_COLOR} radius={[4, 4, 0, 0]} maxBarSize={18} />
          <Bar dataKey="received" name="Received" fill={RECEIVED_COLOR} radius={[4, 4, 0, 0]} maxBarSize={18} />
        </BarChart>
      ) : (
        <LineChart data={chartData} margin={{ left: -8, right: 8, top: 4, bottom: 4 }}>
          {sharedAxes}
          <Line type="monotone" dataKey="sent" name="Sent" stroke={SENT_COLOR} strokeWidth={2.5} dot={{ r: 3 }} activeDot={{ r: 5 }} />
          <Line type="monotone" dataKey="received" name="Received" stroke={RECEIVED_COLOR} strokeWidth={2.5} dot={{ r: 3 }} activeDot={{ r: 5 }} />
        </LineChart>
      )}
    </ResponsiveContainer>
  )
}
