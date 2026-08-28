import React, { useEffect, useState } from 'react'
import api from '../api/client'
import { useAuth } from '../context/AuthContext'
import StatTile from '../components/StatTile'
import TransactionFlowChart from '../components/charts/TransactionFlowChart'

function formatINR(amount) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(amount)
}

const RANGE_OPTIONS = [
  { label: '7D', days: 7 },
  { label: '30D', days: 30 },
  { label: '90D', days: 90 },
]

export default function TransactionManagementPage() {
  const { user } = useAuth()
  const [summary, setSummary] = useState(null)
  const [loading, setLoading] = useState(true)
  const [days, setDays] = useState(30)
  const [chartType, setChartType] = useState('line') // 'line' | 'bar'

  useEffect(() => {
    let mounted = true
    function load() {
      api
        .get('/transfers/summary/daily', { params: { account_id: user.accountId, days } })
        .then(({ data }) => {
          if (mounted) {
            setSummary(data)
            setLoading(false)
          }
        })
        .catch((err) => console.error('Error loading transaction summary:', err))
    }
    load()
    const id = setInterval(load, 3000)
    return () => {
      mounted = false
      clearInterval(id)
    }
  }, [user.accountId, days])

  const net = summary ? summary.total_received - summary.total_sent : 0

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-ink-900">Transaction management</h1>
        <p className="text-sm text-ink-500 mt-0.5">
          Money you've sent to others and money others have sent you, by day.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatTile
          label={`Total sent (${days}d)`}
          value={loading ? '...' : formatINR(summary?.total_sent ?? 0)}
          tone="default"
        />
        <StatTile
          label={`Total received (${days}d)`}
          value={loading ? '...' : formatINR(summary?.total_received ?? 0)}
          tone="low"
        />
        <StatTile
          label="Net"
          value={loading ? '...' : `${net >= 0 ? '+' : '-'}${formatINR(Math.abs(net))}`}
          tone={net >= 0 ? 'low' : 'high'}
          sublabel={net >= 0 ? 'More received than sent' : 'More sent than received'}
        />
      </div>

      <div className="card p-6">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div>
            <h2 className="text-sm font-bold text-ink-800">Daily money flow</h2>
            <p className="text-xs text-ink-500 mt-0.5">Only completed transfers are counted -- held or cancelled transfers never moved money.</p>
          </div>

          <div className="flex items-center gap-4">
            <div className="flex gap-1.5" role="group" aria-label="Date range">
              {RANGE_OPTIONS.map((opt) => (
                <button
                  key={opt.days}
                  onClick={() => setDays(opt.days)}
                  className={`text-xs font-semibold px-3 py-1.5 rounded-full transition-colors ${
                    days === opt.days ? 'bg-shield-600 text-white' : 'bg-white border border-ink-200 text-ink-600 hover:bg-ink-50'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            <div className="flex gap-1.5 border-l border-ink-200 pl-4" role="group" aria-label="Chart type">
              <button
                onClick={() => setChartType('line')}
                aria-pressed={chartType === 'line'}
                className={`text-xs font-semibold px-3 py-1.5 rounded-full transition-colors ${
                  chartType === 'line' ? 'bg-shield-600 text-white' : 'bg-white border border-ink-200 text-ink-600 hover:bg-ink-50'
                }`}
              >
                Line
              </button>
              <button
                onClick={() => setChartType('bar')}
                aria-pressed={chartType === 'bar'}
                className={`text-xs font-semibold px-3 py-1.5 rounded-full transition-colors ${
                  chartType === 'bar' ? 'bg-shield-600 text-white' : 'bg-white border border-ink-200 text-ink-600 hover:bg-ink-50'
                }`}
              >
                Bar
              </button>
            </div>
          </div>
        </div>

        {loading ? (
          <p className="text-sm text-ink-400 text-center py-16">Loading transaction summary...</p>
        ) : (
          <TransactionFlowChart data={summary?.daily || []} mode={chartType} />
        )}
      </div>
    </div>
  )
}
