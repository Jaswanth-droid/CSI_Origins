import React, { useEffect, useState } from 'react'
import api from '../api/client'
import { useAuth } from '../context/AuthContext'
import RiskPill from '../components/RiskPill'
import AccountSafetyCard from '../components/AccountSafetyCard'
import { PieChart, Pie, Cell } from 'recharts'

function getCibilInfo(score) {
  if (score >= 750) return { label: 'Excellent', color: '#12946f' }
  if (score >= 700) return { label: 'Good', color: '#2f63fb' }
  if (score >= 600) return { label: 'Fair', color: '#b4790a' }
  return { label: 'Poor', color: '#c8293c' }
}

function formatINR(amount) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(amount)
}

export default function DashboardPage({ navigate }) {
  const { user } = useAuth()
  const [account, setAccount] = useState(null)
  const [recipients, setRecipients] = useState([])
  const [transactions, setTransactions] = useState([])
  const [alerts, setAlerts] = useState([])
  const [notifications, setNotifications] = useState([])
  const [loading, setLoading] = useState(true)
  const [testBusy, setTestBusy] = useState(false)
  const [testError, setTestError] = useState(null)

  function refreshNotifications() {
    return api.get('/notifications', { params: { limit: 6 } }).then(({ data }) => setNotifications(data))
  }

  useEffect(() => {
    let mounted = true
    async function load() {
      try {
        const [accRes, recRes, txnRes, alertRes, notifRes] = await Promise.all([
          api.get(`/accounts/${user.accountId}`),
          api.get('/recipients'),
          api.get(`/accounts/${user.accountId}/transactions`),
          api.get('/alerts', { params: { account_id: user.accountId } }),
          api.get('/notifications', { params: { limit: 6 } }),
        ])
        if (!mounted) return
        setAccount(accRes.data)
        setRecipients(recRes.data)
        setTransactions(txnRes.data.slice(0, 5))
        setAlerts(alertRes.data)
        setNotifications(notifRes.data)
      } catch (err) {
        console.error('Error polling dashboard:', err)
      } finally {
        if (mounted) setLoading(false)
      }
    }
    load()
    const id = setInterval(load, 3000)
    return () => {
      mounted = false
      clearInterval(id)
    }
  }, [user.accountId])

  async function sendTest() {
    setTestBusy(true)
    setTestError(null)
    try {
      await api.post('/notifications/test')
      await refreshNotifications()
    } catch (err) {
      setTestError(err?.response?.data?.detail || 'Could not send a test notification.')
    } finally {
      setTestBusy(false)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-ink-900">Welcome back, {user.fullName.split(' ')[0]}</h1>
        <p className="text-sm text-ink-500 mt-0.5">Here's what's happening with your account today.</p>
      </div>

      {alerts.length > 0 && (
        <button
          onClick={() => navigate('/alerts')}
          className="w-full text-left card border border-risk-high/30 bg-risk-highBg p-4 flex items-center justify-between gap-4 hover:brightness-95 transition"
        >
          <div>
            <p className="text-sm font-bold text-risk-high">
              {alerts.length} recipient{alerts.length > 1 ? 's' : ''} you sent money to now {alerts.length > 1 ? 'show' : 'shows'} signs of compromise
            </p>
            <p className="text-xs text-ink-600 mt-0.5">
              Review these transfers and, with your permission, request an automatic refund.
            </p>
          </div>
          <span className="text-xs font-semibold text-risk-high shrink-0">View alerts &rarr;</span>
        </button>
      )}

      <div className="grid md:grid-cols-3 gap-4">
        <div className="card p-6 md:col-span-1 bg-gradient-to-br from-ink-900 to-shield-950 text-white flex flex-col justify-between">
          <div>
            <p className="text-xs uppercase tracking-wide text-white/50 font-semibold">Available balance</p>
            <p className="text-3xl font-extrabold mt-2">
              {loading ? '...' : formatINR(account?.balance ?? 0)}
            </p>
            <p className="text-xs text-white/50 mt-3 truncate">
              {account?.account_number}
            </p>
            <p className="text-[10px] text-white/40 truncate">
              {account?.bank_name}
            </p>
          </div>
          <div className="mt-6 flex gap-2">
            <button className="btn-primary bg-white text-shield-900 hover:bg-white/90 text-xs py-1.5 px-3" onClick={() => navigate('/transfer')}>
              Send money
            </button>
            <button className="btn-ghost text-white/80 hover:bg-white/10 text-xs py-1.5 px-3" onClick={() => navigate('/history')}>
              History
            </button>
          </div>
        </div>

        <div className="card p-6 md:col-span-1 bg-white border border-ink-200 flex flex-col justify-between min-h-[200px]">
          <div>
            <p className="text-xs uppercase tracking-wide text-ink-400 font-semibold">Credit Score (CIBIL)</p>
            <p className="text-3xl font-extrabold text-ink-900 mt-2">
              {loading ? '...' : account?.cibil_score ?? '--'}
            </p>
            <p className="text-xs text-ink-500 mt-0.5">
              {!loading && account?.cibil_score && (
                <span className="font-bold" style={{ color: getCibilInfo(account.cibil_score).color }}>
                  Rating: {getCibilInfo(account.cibil_score).label}
                </span>
              )}
            </p>
          </div>
          <div className="flex justify-center -mt-4 relative h-[75px]">
            {!loading && account?.cibil_score && (
              <>
                <PieChart width={120} height={70}>
                  <Pie
                    data={[
                      { value: account.cibil_score - 300 },
                      { value: 900 - account.cibil_score }
                    ]}
                    cx={60}
                    cy={65}
                    startAngle={180}
                    endAngle={0}
                    innerRadius={30}
                    outerRadius={45}
                    dataKey="value"
                    stroke="none"
                  >
                    <Cell fill={getCibilInfo(account.cibil_score).color} />
                    <Cell fill="#e2e8f0" />
                  </Pie>
                </PieChart>
                <div className="absolute text-center" style={{ top: '42px', left: '50%', transform: 'translateX(-50%)' }}>
                  <span className="text-[10px] text-ink-400 font-bold uppercase">CIBIL</span>
                </div>
              </>
            )}
          </div>
        </div>

        <div className="card p-6">
          <p className="text-xs uppercase tracking-wide text-ink-400 font-semibold mb-3">Trusted recipients</p>
          <div className="space-y-3">
            {recipients.map((r) => (
              <div key={r.id} className="flex items-center gap-3">
                <div className="h-8 w-8 rounded-full bg-shield-100 text-shield-700 flex items-center justify-center text-xs font-bold shrink-0">
                  {r.account.holder_name.slice(0, 1)}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-ink-800 truncate">{r.nickname || r.account.holder_name}</p>
                  <p className="text-[11px] text-ink-400 truncate">{r.account.account_number}</p>
                </div>
                <span
                  className={`pill text-[10px] shrink-0 ${
                    r.trust_status === 'NEW' ? 'bg-shield-100 text-shield-700' : 'bg-risk-lowBg text-risk-low'
                  }`}
                  title={
                    r.trust_status === 'NEW'
                      ? `New recipient -- ${r.legitimate_transfer_count ?? 0} of the transfers needed to build full trust`
                      : 'Trusted recipient'
                  }
                >
                  {r.trust_status === 'NEW' ? 'New' : 'Trusted'}
                </span>
              </div>
            ))}
            {recipients.length === 0 && !loading && (
              <p className="text-xs text-ink-400">No trusted recipients yet.</p>
            )}
          </div>
        </div>
      </div>

      <AccountSafetyCard accountId={user.accountId} />

      <div className="card p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-bold text-ink-800">Recent transfers</h2>
          <button className="text-xs font-semibold text-shield-600 hover:underline" onClick={() => navigate('/history')}>
            View all
          </button>
        </div>
        {transactions.length === 0 ? (
          <p className="text-sm text-ink-400 py-6 text-center">No transfers yet. Send your first protected transfer.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wide text-ink-400 border-b border-ink-100">
                <th className="py-2 pr-3 font-semibold">Date</th>
                <th className="py-2 pr-3 font-semibold">From</th>
                <th className="py-2 pr-3 font-semibold">To</th>
                <th className="py-2 pr-3 font-semibold">Amount</th>
                <th className="py-2 pr-3 font-semibold">Risk</th>
                <th className="py-2 text-right font-semibold">Status</th>
              </tr>
            </thead>
            <tbody>
              {transactions.map((t) => {
                const isOutgoing = t.sender_account_id === user.accountId
                const isCompleted = t.status === 'COMPLETED'
                
                let badgeText = t.status.replace(/_/g, ' ')
                let badgeClass = 'bg-ink-100 text-ink-500'
                
                const styles = {
                  COMPLETED: 'bg-risk-lowBg text-risk-low',
                  HELD: 'bg-risk-highBg text-risk-high',
                  CANCELLED: 'bg-ink-100 text-ink-500',
                  PENDING_VERIFICATION: 'bg-risk-mediumBg text-risk-medium',
                  PENDING_RISK_CHECK: 'bg-ink-100 text-ink-500',
                  REFUNDED: 'bg-risk-mediumBg text-risk-medium',
                }
                
                if (isCompleted) {
                  badgeText = isOutgoing ? 'Sent' : 'Received'
                  badgeClass = isOutgoing ? 'bg-shield-100 text-shield-700 font-bold' : 'bg-risk-lowBg text-risk-low font-bold'
                } else {
                  badgeClass = styles[t.status] || badgeClass
                }

                return (
                  <tr key={t.id} className="border-t border-ink-100 first:border-0">
                    <td className="py-3 pr-3 text-ink-500">{new Date(t.created_at).toLocaleDateString()}</td>
                    <td className="py-3 pr-3 font-medium text-ink-700">{t.sender_name || 'Unknown'}</td>
                    <td className="py-3 pr-3 font-medium text-ink-700">{t.recipient_name || 'Unknown'}</td>
                    <td className="py-3 pr-3 font-semibold text-ink-800">{formatINR(t.amount)}</td>
                    <td className="py-3 pr-3">{t.risk_level && <RiskPill level={t.risk_level} />}</td>
                    <td className="py-3 text-right">
                      <span className={`pill ${badgeClass}`}>{badgeText}</span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      <div className="card p-6">
        <div className="flex items-start justify-between gap-4 mb-1">
          <div>
            <h2 className="text-sm font-bold text-ink-800">Recent notifications</h2>
            <p className="text-xs text-ink-500 mt-0.5">
              Emailed to {user.email || 'your email'} as each transfer's status changes.
            </p>
          </div>
          <button className="btn-secondary shrink-0 text-xs px-3 py-1.5" onClick={sendTest} disabled={testBusy}>
            {testBusy ? 'Sending...' : 'Send test email'}
          </button>
        </div>

        {testError && <p className="text-sm text-risk-high bg-risk-highBg rounded-lg px-3 py-2 mt-3">{testError}</p>}

        {notifications.length === 0 ? (
          <p className="text-sm text-ink-400 py-6 text-center">
            No notifications yet -- send a transfer, or use "Send test email" above to check your setup.
          </p>
        ) : (
          <div className="space-y-2.5 mt-4">
            {notifications.map((n) => (
              <div key={n.id} className="flex items-start gap-3 text-sm">
                <span className="text-xs font-bold uppercase tracking-wide text-shield-600 w-14 shrink-0 pt-0.5">
                  {n.channel}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-ink-700 truncate">{n.subject || n.message}</p>
                  <p className="text-[11px] text-ink-500">
                    Notified on this payment to {n.recipient_contact} at {new Date(n.created_at).toLocaleString()} ({n.status === 'SENT' ? 'via Real Email' : n.status === 'FAILED' ? 'Failed' : 'Simulated'})
                  </p>
                  {n.status === 'FAILED' && n.error && (
                    <p className="text-[11px] text-risk-high mt-0.5">{n.error}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function StatusBadge({ status }) {
  const styles = {
    COMPLETED: 'bg-risk-lowBg text-risk-low',
    HELD: 'bg-risk-highBg text-risk-high',
    CANCELLED: 'bg-ink-100 text-ink-500',
    PENDING_VERIFICATION: 'bg-risk-mediumBg text-risk-medium',
    PENDING_RISK_CHECK: 'bg-ink-100 text-ink-500',
    REFUNDED: 'bg-risk-mediumBg text-risk-medium',
  }
  return (
    <span className={`pill ${styles[status] || 'bg-ink-100 text-ink-500'}`}>{status.replace(/_/g, ' ')}</span>
  )
}
