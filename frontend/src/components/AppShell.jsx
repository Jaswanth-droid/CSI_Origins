import React, { useEffect, useState } from 'react'
import api from '../api/client'
import { useAuth } from '../context/AuthContext'
import logoMark from '../assets/logo-mark.svg'

function iconBase(children) {
  return ({ active }) => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" className={active ? 'opacity-100' : 'opacity-80'}>
      {children}
    </svg>
  )
}

const HomeIcon = iconBase(
  <path d="M4 11.5L12 4l8 7.5M6 10v9h5v-5h2v5h5v-9" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
)
const SendIcon = iconBase(
  <path d="M4 12l16-8-6 16-3-6-6-2z" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
)
const HistoryIcon = iconBase(
  <path d="M3 12a9 9 0 109-9M3 12l0-4M3 12l3.5 1M12 7v5l3 2" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
)
const FlowIcon = iconBase(
  <path d="M4 20V11M9.5 20V5M15 20v-8M20 20v-4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
)
const ActivityIcon = iconBase(
  <path d="M3 12h4l2 7 4-14 2 7h6" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
)
const ShieldIcon = iconBase(
  <path d="M12 3l7 2.5v5.5c0 4.5-3 7.8-7 9-4-1.2-7-4.5-7-9V5.5L12 3z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
)
const BoltIcon = iconBase(
  <path d="M13 2L4 14h6l-1 8 9-12h-6l1-8z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
)
const AlertIcon = iconBase(
  <path d="M12 3.5c-1 0-1.8.7-1.8 1.6v.7C7.6 6.5 6 8.7 6 11.3v3.4L4.3 17c-.3.5.1 1 .7 1h14c.6 0 1-.5.7-1L18 14.7v-3.4c0-2.6-1.6-4.8-4.2-5.5v-.7c0-.9-.8-1.6-1.8-1.6zM9.5 19a2.5 2.5 0 005 0" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
)

const NAV_ITEMS = [
  { path: '/dashboard', label: 'Dashboard', icon: HomeIcon },
  { path: '/transfer', label: 'Send Money', icon: SendIcon },
  { path: '/history', label: 'Transaction History', icon: HistoryIcon },
  { path: '/transactions', label: 'Transaction Management', icon: FlowIcon },
  { path: '/timeline', label: 'Recipient Activity', icon: ActivityIcon },
  { path: '/alerts', label: 'Compromise Alerts', icon: AlertIcon },
  { path: '/analytics', label: 'Security Analytics', icon: ShieldIcon },
  { path: '/simulation', label: 'Attack Simulation', icon: BoltIcon },
]

export default function AppShell({ current, navigate, children }) {
  const { user, logout } = useAuth()
  const [alertCount, setAlertCount] = useState(0)

  useEffect(() => {
    if (!user?.accountId) return undefined
    let mounted = true
    function refresh() {
      api
        .get('/alerts', { params: { account_id: user.accountId } })
        .then(({ data }) => {
          if (mounted) setAlertCount(data.length)
        })
        .catch(() => {})
    }
    refresh()
    const id = setInterval(refresh, 3000)
    return () => {
      mounted = false
      clearInterval(id)
    }
  }, [user?.accountId])

  return (
    <div className="min-h-screen flex bg-ink-50">
      <aside className="hidden md:flex md:flex-col w-64 shrink-0 bg-ink-900 text-white">
        <div className="h-16 flex items-center gap-2.5 px-5 border-b border-white/10">
          <ShieldMark />
          <div>
            <p className="text-sm font-bold leading-tight">Recipient Shield</p>
            <p className="text-[10px] text-white/50 leading-tight">Prototype -- simulated data</p>
          </div>
        </div>
        <nav className="flex-1 py-4 px-3 space-y-1">
          {NAV_ITEMS.map((item) => {
            const active = current === item.path
            const Icon = item.icon
            const showBadge = item.path === '/alerts' && alertCount > 0
            return (
              <button
                key={item.path}
                onClick={() => navigate(item.path)}
                className={`w-full flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                  active ? 'bg-white/10 text-white' : 'text-white/60 hover:bg-white/5 hover:text-white'
                }`}
              >
                <Icon active={active} />
                <span className="flex-1 text-left">{item.label}</span>
                {showBadge && (
                  <span className="inline-flex items-center justify-center h-5 min-w-[1.25rem] px-1 rounded-full bg-risk-high text-white text-[10px] font-bold">
                    {alertCount}
                  </span>
                )}
              </button>
            )
          })}
        </nav>
        <div className="p-4 border-t border-white/10">
          <div className="flex items-center gap-2.5 mb-3">
            <div className="h-8 w-8 rounded-full bg-shield-500 flex items-center justify-center text-xs font-bold">
              {(user?.fullName || '?').slice(0, 1)}
            </div>
            <div className="min-w-0">
              <p className="text-xs font-semibold truncate">{user?.fullName}</p>
              <p className="text-[10px] text-white/50 truncate">@{user?.username}</p>
            </div>
          </div>
          <button onClick={logout} className="w-full text-xs font-semibold text-white/60 hover:text-white text-left">
            Sign out
          </button>
        </div>
      </aside>

      <div className="flex-1 min-w-0 flex flex-col">
        <div className="bg-shield-950 text-white text-[11px] text-center py-1.5 px-4">
          PROTOTYPE SYSTEM -- all accounts and activity are simulated. No real bank connection. No real money moves.
        </div>
        <main className="flex-1 p-4 md:p-8 max-w-7xl w-full mx-auto">{children}</main>
      </div>
    </div>
  )
}

function ShieldMark() {
  return <img src={logoMark} alt="Recipient Shield" className="h-[23px] w-auto shrink-0" />
}
