import React, { useEffect, useState } from 'react'
import api from '../api/client'
import { useAuth } from '../context/AuthContext'
import RiskPill from '../components/RiskPill'

function formatINR(amount) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(amount)
}

const STATUS_STYLES = {
  COMPLETED: 'bg-risk-lowBg text-risk-low',
  HELD: 'bg-risk-highBg text-risk-high',
  CANCELLED: 'bg-ink-100 text-ink-500',
  PENDING_VERIFICATION: 'bg-risk-mediumBg text-risk-medium',
  PENDING_RISK_CHECK: 'bg-ink-100 text-ink-500',
  REFUNDED: 'bg-risk-mediumBg text-risk-medium',
}

export default function TransactionHistoryPage() {
  const { user } = useAuth()
  const [transactions, setTransactions] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('ALL')

  useEffect(() => {
    let mounted = true
    function load() {
      api.get(`/accounts/${user.accountId}/transactions`)
        .then(({ data }) => {
          if (mounted) {
            setTransactions(data)
            setLoading(false)
          }
        })
        .catch((err) => console.error('Error polling transactions:', err))
    }
    load()
    const id = setInterval(load, 3000)
    return () => {
      mounted = false
      clearInterval(id)
    }
  }, [user.accountId])

  const filtered = filter === 'ALL' ? transactions : transactions.filter((t) => t.status === filter)

  return (
    <div>
      <h1 className="text-xl font-bold text-ink-900 mb-1">Transaction history</h1>
      <p className="text-sm text-ink-500 mb-6">Every transfer, along with the Recipient Shield decision that governed it.</p>

      <div className="flex gap-2 mb-4">
        {['ALL', 'COMPLETED', 'HELD', 'CANCELLED', 'PENDING_VERIFICATION', 'REFUNDED'].map((s) => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={`text-xs font-semibold px-3 py-1.5 rounded-full ${
              filter === s ? 'bg-shield-600 text-white' : 'bg-white border border-ink-200 text-ink-600'
            }`}
          >
            {s.replace(/_/g, ' ')}
          </button>
        ))}
      </div>

      <div className="card overflow-hidden">
        {loading ? (
          <p className="text-sm text-ink-400 text-center py-10">Loading...</p>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-ink-400 text-center py-10">No transactions match this filter.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wide text-ink-400 border-b border-ink-100">
                <th className="py-3 px-5 font-semibold">Date</th>
                <th className="py-3 px-5 font-semibold">From</th>
                <th className="py-3 px-5 font-semibold">To</th>
                <th className="py-3 px-5 font-semibold">Amount</th>
                <th className="py-3 px-5 font-semibold">Note</th>
                <th className="py-3 px-5 font-semibold">Risk</th>
                <th className="py-3 px-5 font-semibold text-right">Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((t) => {
                const isOutgoing = t.sender_account_id === user.accountId
                const isCompleted = t.status === 'COMPLETED'
                
                let badgeText = t.status.replace(/_/g, ' ')
                let badgeClass = STATUS_STYLES[t.status] || 'bg-ink-100 text-ink-500'
                
                if (isCompleted) {
                  badgeText = isOutgoing ? 'Sent' : 'Received'
                  badgeClass = isOutgoing ? 'bg-shield-100 text-shield-700 font-bold' : 'bg-risk-lowBg text-risk-low font-bold'
                }

                return (
                  <tr key={t.id} className="border-b border-ink-100 last:border-0">
                    <td className="py-3.5 px-5 text-ink-500">{new Date(t.created_at).toLocaleString()}</td>
                    <td className="py-3.5 px-5 font-medium text-ink-700">{t.sender_name || 'Unknown'}</td>
                    <td className="py-3.5 px-5 font-medium text-ink-700">{t.recipient_name || 'Unknown'}</td>
                    <td className="py-3.5 px-5 font-semibold text-ink-800">{formatINR(t.amount)}</td>
                    <td className="py-3.5 px-5 text-ink-500">{t.note || '--'}</td>
                    <td className="py-3.5 px-5">{t.risk_level ? <RiskPill level={t.risk_level} /> : '--'}</td>
                    <td className="py-3.5 px-5 text-right">
                      <span className={`pill ${badgeClass}`}>
                        {badgeText}
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
