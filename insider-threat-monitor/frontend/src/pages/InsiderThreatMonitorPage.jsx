import React, { useEffect, useState } from 'react'
import api from '../api/client'
import StatTile from '../components/StatTile'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, CartesianGrid } from 'recharts'

export default function InsiderThreatMonitorPage() {
  const [activeTab, setActiveTab] = useState('feed') // 'feed' | 'analytics'
  const [actions, setActions] = useState([])
  const [baselines, setBaselines] = useState(null)
  const [analyticsData, setAnalyticsData] = useState(null)
  const [busyScenario, setBusyScenario] = useState(null)
  const [overrideBusy, setOverrideBusy] = useState(false)
  const [viewingDetailsId, setViewingDetailsId] = useState(null)
  const [actionDetails, setActionDetails] = useState(null)

  // Fetch actions, baselines, and system analytics
  const fetchData = () => {
    api.get('/insider-threat/actions').then(({ data }) => {
      setActions(data)
    }).catch(() => {})

    api.get('/insider-threat/analytics').then(({ data }) => {
      setAnalyticsData(data)
    }).catch(() => {})

    if (viewingDetailsId) {
      api.get(`/insider-threat/actions/${viewingDetailsId}`)
        .then(({ data }) => setActionDetails(data))
        .catch(() => {})
    }
  }

  useEffect(() => {
    fetchData()
    api.get('/insider-threat/baselines').then(({ data }) => setBaselines(data)).catch(() => {})

    // Poll every 3 seconds for low-latency live updates from the external Recipient Shield DB
    const interval = setInterval(fetchData, 3000)
    return () => clearInterval(interval)
  }, [viewingDetailsId])

  const handleViewDetails = (actionId) => {
    setViewingDetailsId(actionId)
    api.get(`/insider-threat/actions/${actionId}`)
      .then(({ data }) => setActionDetails(data))
      .catch(() => {})
  }

  // Run a threat simulation scenario
  const handleSimulate = (scenario) => {
    setBusyScenario(scenario)
    api.post('/insider-threat/simulate', { scenario })
      .then(({ data }) => {
        fetchData()
        handleViewDetails(data.id)
      })
      .finally(() => setBusyScenario(null))
  }

  // Override/approve a blocked action
  const handleOverride = (actionId) => {
    setOverrideBusy(true)
    api.post(`/insider-threat/actions/${actionId}/override`)
      .then(({ data }) => {
        fetchData()
        handleViewDetails(actionId)
      })
      .finally(() => setOverrideBusy(false))
  }

  // Stats calculation
  const totalUsers = new Set(actions.map((a) => a.username)).size
  const suspendedCount = actions.filter((a) => a.status === 'BLOCKED').length
  const alertCount = actions.filter((a) => a.risk_level === 'HIGH' || a.risk_level === 'MEDIUM').length

  const getActualRoleCount = (roleName) => {
    return actions.filter((a) => {
      const r = (a.role || '').toUpperCase().replace('_', ' ');
      if (roleName === 'SYS_ADMIN') return r === 'SYS ADMIN';
      if (roleName === 'SUPPORT_STAFF') return r === 'SUPPORT STAFF';
      if (roleName === 'FINANCIAL_OFFICER') return r === 'FINANCIAL OFFICER' || r === 'FINANCIAL' || r === 'FINANCE';
      if (roleName === 'SENDER') return r === 'SENDER' || r === 'USER' || r === 'USER_ROLE';
      return false;
    }).length
  }

  const chartData = [
    { name: 'SYS ADMIN', Baseline: 12, Actual: getActualRoleCount('SYS_ADMIN') },
    { name: 'SUPPORT', Baseline: 35, Actual: getActualRoleCount('SUPPORT_STAFF') },
    { name: 'FINANCE', Baseline: 24, Actual: getActualRoleCount('FINANCIAL_OFFICER') },
    { name: 'END USER', Baseline: 50, Actual: getActualRoleCount('SENDER') }
  ]

  // Helper to extract initials for user avatars
  const getInitials = (name) => {
    if (!name) return '??'
    return name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase()
  }

  if (viewingDetailsId && actionDetails) {
    const senderInitials = getInitials(actionDetails.sender.full_name)
    const receiverInitials = getInitials(actionDetails.receiver.full_name)

    return (
      <div className="space-y-6">
        {/* Deep Investigation Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-ink-100 pb-5">
          <div className="flex items-center gap-3">
            <button 
              onClick={() => { setViewingDetailsId(null); setActionDetails(null); }}
              className="btn-secondary py-1.5 px-3 text-xs flex items-center gap-1.5 hover:border-ink-300 transition-colors shadow-sm"
            >
              ← Back to Monitor Feed
            </button>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-extrabold text-ink-900">Privileged Action Investigation</h1>
                <span className="h-2 w-2 rounded-full bg-red-500 animate-ping"></span>
              </div>
              <p className="text-xs text-ink-400 font-mono mt-0.5">ID: {actionDetails.id}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className={`pill text-[11px] font-bold uppercase tracking-wider px-3 py-1.5 shadow-sm border ${
              actionDetails.status === 'BLOCKED'
                ? 'bg-red-50 text-red-700 border-red-200'
                : actionDetails.status === 'OVERRIDDEN'
                ? 'bg-slate-50 text-slate-700 border-slate-200'
                : 'bg-emerald-50 text-emerald-700 border-emerald-200'
            }`}>
              {actionDetails.status === 'BLOCKED' ? '🛑 SUSPENDED / BLOCKED' : actionDetails.status === 'OVERRIDDEN' ? '🔓 OVERRIDDEN' : '🟢 ACTIVE / APPROVED'}
            </span>
            {actionDetails.status === 'BLOCKED' && (
              <button
                className="btn bg-emerald-600 text-white hover:bg-emerald-700 text-xs py-2 px-4 shadow-md font-semibold transition-all hover:translate-y-[-1px]"
                disabled={overrideBusy}
                onClick={() => handleOverride(actionDetails.id)}
              >
                {overrideBusy ? 'Processing...' : 'Approve & Unlock'}
              </button>
            )}
          </div>
        </div>

        <div className="grid md:grid-cols-3 gap-6">
          {/* Column 1: Action/Transaction Audit File */}
          <div className="card p-6 border-t-4 border-t-red-500 shadow-sm space-y-6">
            <div className="flex items-center justify-between border-b border-ink-50 pb-3">
              <h2 className="text-xs font-extrabold uppercase tracking-wider text-ink-500 flex items-center gap-1.5">
                🔎 1. Operation & Threat Audit
              </h2>
              <span className="text-[10px] bg-red-50 text-red-700 font-bold px-1.5 py-0.5 rounded font-mono">AUDIT</span>
            </div>

            <div className="space-y-4">
              <div>
                <p className="text-[10px] font-bold text-ink-400 uppercase tracking-wide">Operation Type</p>
                <p className="font-mono text-xs font-bold text-blue-700 bg-blue-50 border border-blue-100 px-2.5 py-1.5 rounded-lg inline-block mt-1.5 shadow-sm">
                  {actionDetails.action_type}
                </p>
              </div>

              <div>
                <p className="text-[10px] font-bold text-ink-400 uppercase tracking-wide">Shift Context</p>
                <div className="mt-1.5 p-2.5 bg-slate-50 border border-ink-100 rounded-lg text-xs font-semibold text-ink-800 space-y-1">
                  <div className="flex justify-between">
                    <span className="text-ink-400 font-medium">Policy hours:</span>
                    <span>{actionDetails.shift_status}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-ink-400 font-medium">Context:</span>
                    <span>{actionDetails.business_context !== "None" ? actionDetails.business_context : "Standard Operations"}</span>
                  </div>
                </div>
              </div>
              
              {actionDetails.transaction && (
                <>
                  <div>
                    <p className="text-[10px] font-bold text-ink-400 uppercase tracking-wide">Amount</p>
                    <p className="text-3xl font-black text-ink-950 mt-1 tracking-tight">
                      ₹{actionDetails.transaction.amount.toLocaleString('en-IN')}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold text-ink-400 uppercase tracking-wide">Transfer Status</p>
                    <span className={`inline-block text-xs font-bold px-2 py-1 rounded-md mt-1 border ${
                      actionDetails.transaction.status === 'COMPLETED'
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-100'
                        : actionDetails.transaction.status === 'HELD'
                        ? 'bg-red-50 text-red-700 border-red-100'
                        : 'bg-amber-50 text-amber-700 border-amber-100'
                    }`}>
                      {actionDetails.transaction.status}
                    </span>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold text-ink-400 uppercase tracking-wide">Payment Note</p>
                    <p className="text-xs text-ink-600 italic bg-slate-50 border border-ink-100 p-3 rounded-lg mt-1.5 leading-relaxed">
                      "{actionDetails.transaction.note}"
                    </p>
                  </div>
                </>
              )}

              <div>
                <p className="text-[10px] font-bold text-ink-400 uppercase tracking-wide">Correlation Risk Score</p>
                <div className="flex items-end gap-1.5 mt-2">
                  <span className={`text-3xl font-black tracking-tight ${
                    actionDetails.transaction?.risk_level === 'HIGH'
                      ? 'text-red-600'
                      : actionDetails.transaction?.risk_level === 'MEDIUM'
                      ? 'text-amber-600'
                      : 'text-emerald-600'
                  }`}>
                    {actionDetails.transaction?.risk_score ?? 0}
                  </span>
                  <span className="text-xs text-ink-400 font-semibold mb-1">/ 100 ({actionDetails.transaction?.risk_level})</span>
                </div>
                <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden mt-2 border border-slate-200">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${
                      actionDetails.transaction?.risk_level === 'HIGH'
                        ? 'bg-red-500'
                        : actionDetails.transaction?.risk_level === 'MEDIUM'
                        ? 'bg-amber-500'
                        : 'bg-emerald-500'
                    }`}
                    style={{ width: `${actionDetails.transaction?.risk_score ?? 0}%` }}
                  ></div>
                </div>
              </div>

              <div>
                <p className="text-[10px] font-bold text-ink-400 uppercase tracking-wide">Anomalies Detected</p>
                {(!actionDetails.transaction?.reasons || actionDetails.transaction.reasons.length === 0) ? (
                  <p className="text-xs text-ink-400 italic mt-2 p-2 bg-slate-50 border border-ink-100 rounded-lg">No deviations flagged.</p>
                ) : (
                  <div className="space-y-2 mt-2">
                    {actionDetails.transaction.reasons.map((r, i) => (
                      <div key={i} className="text-xs text-red-800 bg-red-50/50 border border-red-100 rounded-lg p-2.5 flex items-start gap-2 leading-relaxed">
                        <span className="text-sm mt-[-2px]">🚨</span>
                        <span>{r}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Column 2: Sender (Originator) Profile */}
          <div className="card p-6 border-t-4 border-t-blue-500 shadow-sm space-y-6">
            <div className="flex items-center justify-between border-b border-ink-50 pb-3">
              <h2 className="text-xs font-extrabold uppercase tracking-wider text-ink-500 flex items-center gap-1.5">
                👤 2. Origin Identity Profile (Sender)
              </h2>
              <span className="text-[10px] bg-blue-50 text-blue-700 font-bold px-1.5 py-0.5 rounded font-mono">SENDER</span>
            </div>

            <div className="flex flex-col items-center py-2 bg-slate-50 border border-ink-100 rounded-xl">
              <div className="h-16 w-16 rounded-full bg-blue-600 text-white font-extrabold text-2xl flex items-center justify-center shadow-md border-2 border-white ring-4 ring-blue-50">
                {senderInitials}
              </div>
              <h3 className="text-base font-bold text-ink-950 mt-3">{actionDetails.sender.full_name}</h3>
              <p className="text-xs text-ink-400 font-mono mt-0.5">{actionDetails.sender.username}</p>
            </div>

            <div className="space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-2 border-b border-slate-100 pb-2">
                <div>
                  <p className="text-[10px] font-bold text-ink-400 uppercase tracking-wide">Email Address</p>
                  <p className="text-ink-800 font-medium mt-1 truncate">{actionDetails.sender.email}</p>
                </div>
                <div>
                  <p className="text-[10px] font-bold text-ink-400 uppercase tracking-wide">Phone Number</p>
                  <p className="text-ink-800 font-medium mt-1">{actionDetails.sender.phone}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 border-b border-slate-100 pb-2">
                <div>
                  <p className="text-[10px] font-bold text-ink-400 uppercase tracking-wide">Account Number</p>
                  <p className="text-ink-800 font-mono font-medium mt-1">{actionDetails.sender.account_number}</p>
                </div>
                {actionDetails.sender.balance !== undefined && (
                  <div>
                    <p className="text-[10px] font-bold text-ink-400 uppercase tracking-wide">Current Balance</p>
                    <p className="text-ink-950 font-bold mt-1">₹{actionDetails.sender.balance.toLocaleString('en-IN')}</p>
                  </div>
                )}
              </div>

              <div>
                <p className="text-[10px] font-bold text-ink-400 uppercase tracking-wide">Bank Branch</p>
                <p className="text-ink-600 font-medium mt-1">{actionDetails.sender.bank_name}</p>
              </div>
            </div>
          </div>

          {/* Column 3: Receiver (Recipient) Profile */}
          <div className="card p-6 border-t-4 border-t-purple-500 shadow-sm space-y-6">
            <div className="flex items-center justify-between border-b border-ink-50 pb-3">
              <h2 className="text-xs font-extrabold uppercase tracking-wider text-ink-500 flex items-center gap-1.5">
                🎯 3. Target Identity Profile (Receiver)
              </h2>
              <span className="text-[10px] bg-purple-50 text-purple-700 font-bold px-1.5 py-0.5 rounded font-mono">RECEIVER</span>
            </div>

            <div className="flex flex-col items-center py-2 bg-slate-50 border border-ink-100 rounded-xl">
              <div className="h-16 w-16 rounded-full bg-purple-600 text-white font-extrabold text-2xl flex items-center justify-center shadow-md border-2 border-white ring-4 ring-purple-50">
                {receiverInitials}
              </div>
              <h3 className="text-base font-bold text-ink-950 mt-3">{actionDetails.receiver.full_name}</h3>
              <p className="text-xs text-ink-400 font-mono mt-0.5">{actionDetails.receiver.username}</p>
            </div>

            <div className="space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-2 border-b border-slate-100 pb-2">
                <div>
                  <p className="text-[10px] font-bold text-ink-400 uppercase tracking-wide">Email Address</p>
                  <p className="text-ink-800 font-medium mt-1 truncate">{actionDetails.receiver.email}</p>
                </div>
                <div>
                  <p className="text-[10px] font-bold text-ink-400 uppercase tracking-wide">Phone Number</p>
                  <p className="text-ink-800 font-medium mt-1">{actionDetails.receiver.phone}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 border-b border-slate-100 pb-2">
                <div>
                  <p className="text-[10px] font-bold text-ink-400 uppercase tracking-wide">Account Number</p>
                  <p className="text-ink-800 font-mono font-medium mt-1">{actionDetails.receiver.account_number}</p>
                </div>
                {actionDetails.receiver.balance !== undefined && (
                  <div>
                    <p className="text-[10px] font-bold text-ink-400 uppercase tracking-wide">Current Balance</p>
                    <p className="text-ink-950 font-bold mt-1">₹{actionDetails.receiver.balance.toLocaleString('en-IN')}</p>
                  </div>
                )}
              </div>

              <div>
                <p className="text-[10px] font-bold text-ink-400 uppercase tracking-wide">Bank Branch</p>
                <p className="text-ink-600 font-medium mt-1">{actionDetails.receiver.bank_name}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {/* Title section with border */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-200 pb-2.5">
        <div>
          <h1 className="text-xl font-black text-ink-900 tracking-tight">Security & Privileged Monitor</h1>
          <p className="text-[11px] text-ink-400 font-medium leading-tight mt-0.5">
            Correlating anomalies, analyzing behavioral shifts, and enforcing automated mitigations in real-time.
          </p>
        </div>
        <div className="flex items-center gap-1.5 bg-emerald-50 border border-emerald-100 text-emerald-700 px-2.5 py-1 rounded-md text-[11px] font-bold self-start sm:self-center shadow-xs">
          <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse inline-block"></span>
          <span>Security Engine Live</span>
        </div>
      </div>

      {/* Navigation View Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
        <button
          onClick={() => setActiveTab('feed')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
            activeTab === 'feed'
              ? 'bg-ink-900 text-white shadow-xs'
              : 'text-ink-500 hover:text-ink-800 hover:bg-slate-100'
          }`}
        >
          <span>📡 Live Actions & Simulator</span>
          <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono font-black ${
            activeTab === 'feed' ? 'bg-ink-700 text-white' : 'bg-slate-200 text-slate-700'
          }`}>
            {actions.length}
          </span>
        </button>

        <button
          onClick={() => setActiveTab('analytics')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
            activeTab === 'analytics'
              ? 'bg-shield-600 text-white shadow-xs'
              : 'text-ink-500 hover:text-ink-800 hover:bg-slate-100'
          }`}
        >
          <span>🛡️ System Safety & User Risk Segregation</span>
          {analyticsData && (
            <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono font-black ${
              activeTab === 'analytics' ? 'bg-shield-700 text-white' : 'bg-emerald-100 text-emerald-800'
            }`}>
              {analyticsData.system_safety.score}%
            </span>
          )}
        </button>
      </div>

      {/* TAB 1: LIVE FEED & OPERATIONS */}
      {activeTab === 'feed' && (
        <div className="space-y-3">
          {/* Grid of stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
            <StatTile label="Monitored Identities" value={baselines ? baselines.roles.length + totalUsers : totalUsers} tone="brand" icon="👥" />
            <StatTile label="Actions Logged" value={actions.length} tone="default" icon="📋" />
            <StatTile label="Threat Alerts Active" value={alertCount} tone={alertCount > 0 ? 'medium' : 'default'} icon="⚠️" />
            <StatTile label="Suspended Sessions" value={suspendedCount} tone={suspendedCount > 0 ? 'high' : 'default'} icon="🚫" />
          </div>

          <div className="grid lg:grid-cols-3 gap-3.5 items-start">
            {/* Actions Feed */}
            <div className="card p-4 lg:col-span-2 shadow-sm space-y-2.5">
              <div className="flex items-center justify-between border-b border-ink-100 pb-2">
                <h2 className="text-xs font-black text-ink-800 tracking-wide uppercase">📡 Live Privileged Actions Feed</h2>
                <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-slate-500 bg-slate-50 border border-slate-200 px-2 py-0.5 rounded">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500"></span> Poll active
                </span>
              </div>

              {actions.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-center space-y-1.5">
                  <span className="text-2xl">📭</span>
                  <p className="text-xs font-bold text-ink-500">No privileged actions logged yet.</p>
                  <p className="text-[10px] text-ink-400">Perform a transfer in Recipient Shield or trigger a simulation to populate.</p>
                </div>
              ) : (
                <div className="overflow-y-auto overflow-x-auto thin-scroll max-h-[380px] pr-1 relative">
                  <table className="w-full text-left border-collapse text-[11px]">
                    <thead className="sticky top-0 bg-white z-10 shadow-[0_1px_0_0_rgba(0,0,0,0.05)]">
                      <tr className="text-[9.5px] uppercase tracking-wider text-ink-400">
                        <th className="pb-2 pt-1 font-bold">User Identity</th>
                        <th className="pb-2 pt-1 font-bold">Action Type</th>
                        <th className="pb-2 pt-1 font-bold">Resource Target</th>
                        <th className="pb-2 pt-1 font-bold text-center">Risk Index</th>
                        <th className="pb-2 pt-1 font-bold text-right">Enforcement</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {actions.map((act) => {
                        const isSelected = viewingDetailsId === act.id
                        const initials = getInitials(act.full_name)
                        
                        // Dynamic styling for action badge
                        let actionBadgeColor = 'bg-blue-50 text-blue-700 border-blue-100'
                        if (act.action_type.includes('DUMP') || act.action_type.includes('SQL')) {
                          actionBadgeColor = 'bg-rose-50 text-rose-700 border-rose-100'
                        } else if (act.action_type.includes('ELEVATION')) {
                          actionBadgeColor = 'bg-amber-50 text-amber-700 border-amber-100'
                        } else if (act.action_type.includes('CHANGE')) {
                          actionBadgeColor = 'bg-purple-50 text-purple-700 border-purple-100'
                        }

                        return (
                          <tr
                            key={act.id}
                            onClick={() => handleViewDetails(act.id)}
                            className={`cursor-pointer transition-colors duration-150 ${
                              isSelected ? 'bg-shield-50/50 font-medium' : 'hover:bg-slate-50/80'
                            }`}
                          >
                            <td className="py-2 pr-2 flex items-center gap-2">
                              <div className="h-7 w-7 rounded-full bg-slate-100 border border-slate-200 font-bold text-[9px] text-slate-700 flex items-center justify-center shrink-0 shadow-xs">
                                {initials}
                              </div>
                              <div>
                                <p className="text-ink-900 font-bold leading-tight text-[11px]">{act.full_name}</p>
                                <p className="text-[9.5px] text-ink-400 font-semibold leading-tight">{act.role}</p>
                              </div>
                            </td>
                            <td className="py-2 pr-2">
                              <span className={`font-mono text-[9px] font-bold px-1.5 py-0.5 rounded border shadow-xs ${actionBadgeColor}`}>
                                {act.action_type}
                              </span>
                            </td>
                            <td className="py-2 pr-2 text-ink-600 font-medium max-w-[120px] truncate font-mono text-[10px]">{act.resource_target || '--'}</td>
                            <td className="py-2 pr-2 text-center">
                              <span
                                className={`inline-block font-mono font-bold text-[10px] px-1.5 py-0.5 rounded-full ${
                                  act.risk_level === 'HIGH'
                                    ? 'bg-red-50 text-red-700 border border-red-100'
                                    : act.risk_level === 'MEDIUM'
                                    ? 'bg-amber-50 text-amber-700 border border-amber-100'
                                    : 'bg-emerald-50 text-emerald-700 border border-emerald-100'
                                }`}
                              >
                                {act.risk_score}
                              </span>
                            </td>
                            <td className="py-2 text-right">
                              <span
                                className={`pill text-[8.5px] font-extrabold tracking-wider uppercase border shadow-xs ${
                                  act.status === 'BLOCKED'
                                    ? 'bg-red-50 text-red-700 border-red-200'
                                    : act.status === 'OVERRIDDEN'
                                    ? 'bg-slate-50 text-slate-700 border-slate-200'
                                    : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                }`}
                              >
                                {act.status}
                              </span>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Right Sidebar: Simulators & Details */}
            <div className="space-y-3 lg:col-span-1">
              {/* Simulator Panel */}
              <div className="card p-3.5 shadow-sm space-y-2">
                <h2 className="text-xs font-black text-ink-800 border-b border-ink-100 pb-1.5 tracking-wide uppercase">⚡ Scenario Simulator</h2>
                <p className="text-[10px] text-ink-400 font-semibold leading-tight">
                  Trigger high-privileged operational events to test threat algorithms:
                </p>
                <div className="space-y-1.5">
                  <button
                    className="w-full text-left btn-secondary text-[11px] p-2 border-l-4 border-l-red-500 hover:border-l-red-600 hover:bg-slate-50 flex flex-col items-start gap-0.5 shadow-xs hover:translate-x-0.5 transition-all duration-150"
                    disabled={busyScenario !== null}
                    onClick={() => handleSimulate('admin_out_of_hours_sql_dump')}
                  >
                    <div className="flex w-full items-center justify-between">
                      <span className="font-extrabold text-ink-800 text-[11px]">1. Out-of-Hours SQL Dump</span>
                      <span className="text-[8.5px] text-red-700 font-black bg-red-50 border border-red-100 px-1 py-0.2 rounded">High Risk</span>
                    </div>
                    <span className="text-[9.5px] text-ink-400 font-medium leading-tight">
                      SysAdmin triggers database backup export at 2:14 AM outside ticket window.
                    </span>
                  </button>

                  <button
                    className="w-full text-left btn-secondary text-[11px] p-2 border-l-4 border-l-amber-500 hover:border-l-amber-600 hover:bg-slate-50 flex flex-col items-start gap-0.5 shadow-xs hover:translate-x-0.5 transition-all duration-150"
                    disabled={busyScenario !== null}
                    onClick={() => handleSimulate('support_role_elevation')}
                  >
                    <div className="flex w-full items-center justify-between">
                      <span className="font-extrabold text-ink-800 text-[11px]">2. Support Staff Elevation</span>
                      <span className="text-[8.5px] text-amber-700 font-black bg-amber-50 border border-amber-100 px-1 py-0.2 rounded">Med Risk</span>
                    </div>
                    <span className="text-[9.5px] text-ink-400 font-medium leading-tight">
                      Sarah Connor elevates to Admin override role without active incident ticket.
                    </span>
                  </button>

                  <button
                    className="w-full text-left btn-secondary text-[11px] p-2 border-l-4 border-l-emerald-500 hover:border-l-emerald-600 hover:bg-slate-50 flex flex-col items-start gap-0.5 shadow-xs hover:translate-x-0.5 transition-all duration-150"
                    disabled={busyScenario !== null}
                    onClick={() => handleSimulate('cfo_transfer')}
                  >
                    <div className="flex w-full items-center justify-between">
                      <span className="font-extrabold text-ink-800 text-[11px]">3. Normal CFO Transfer</span>
                      <span className="text-[8.5px] text-emerald-700 font-black bg-emerald-50 border border-emerald-100 px-1 py-0.2 rounded">Low Risk</span>
                    </div>
                    <span className="text-[9.5px] text-ink-400 font-medium leading-tight">
                      Bruce Wayne executes standard financial transfer during active maintenance.
                    </span>
                  </button>
                </div>
              </div>

              {/* Role Baselines Chart */}
              {baselines && (
                <div className="card p-3.5 shadow-sm space-y-2">
                  <h2 className="text-xs font-black text-ink-800 border-b border-ink-100 pb-1 tracking-wide uppercase">📈 Role Daily Activity</h2>
                  <p className="text-[10px] text-ink-400 font-semibold">Normal baseline actions vs live actions recorded.</p>
                  <ResponsiveContainer width="100%" height={115}>
                    <BarChart data={chartData} margin={{ left: -32, right: 5, bottom: 0, top: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                      <XAxis dataKey="name" stroke="#94a3b8" fontSize={8} tickLine={false} />
                      <YAxis stroke="#94a3b8" fontSize={8} tickLine={false} />
                      <Tooltip contentStyle={{ fontSize: '10px', borderRadius: '6px', padding: '4px 8px' }} />
                      <Bar dataKey="Baseline" fill="#cbd5e1" radius={[2, 2, 0, 0]} name="Baseline Avg" />
                      <Bar dataKey="Actual" fill="#2563eb" radius={[2, 2, 0, 0]} name="Actual (Live)" />
                    </BarChart>
                  </ResponsiveContainer>
                  <div className="text-[8.5px] text-slate-500 font-semibold flex items-center justify-between bg-slate-50 border border-slate-100 p-1.5 rounded">
                    <span>Shift: {baselines.normal_hours}</span>
                    <span>Active tickets: {baselines.active_maintenance_windows.length}</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: SYSTEM SAFETY & USER RISK SEGREGATION ANALYTICS */}
      {activeTab === 'analytics' && analyticsData && (
        <div className="space-y-3">
          {/* Top Platform Health Metrics */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
            <StatTile 
              label="System Safety Score" 
              value={`${analyticsData.system_safety.score}%`} 
              tone={analyticsData.system_safety.score >= 90 ? 'brand' : 'medium'} 
              icon="🛡️" 
            />
            <StatTile 
              label="Threat Defense Rate" 
              value={`${analyticsData.system_safety.threat_prevention_rate}%`} 
              tone="brand" 
              icon="⚡" 
            />
            <StatTile 
              label="Volume Processed" 
              value={`₹${analyticsData.system_safety.total_volume_processed.toLocaleString()}`} 
              tone="default" 
              icon="💳" 
            />
            <StatTile 
              label="Held / Protected" 
              value={`₹${analyticsData.system_safety.total_volume_protected.toLocaleString()}`} 
              tone={analyticsData.system_safety.total_volume_protected > 0 ? 'high' : 'default'} 
              icon="🔒" 
            />
          </div>

          {/* User Risk Segregation Distribution Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {/* Low Risk Tier */}
            <div className="card p-3 border-l-4 border-l-emerald-500 bg-emerald-50/20 space-y-1.5 shadow-xs">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-black text-emerald-900 uppercase tracking-wide">🟢 Safe Tier (0 - 29.9)</span>
                <span className="text-[10px] font-mono font-bold bg-emerald-100 text-emerald-800 px-1.5 py-0.2 rounded">
                  {analyticsData.user_risk_distribution.low_risk_percent}%
                </span>
              </div>
              <p className="text-xl font-black text-emerald-700">{analyticsData.user_risk_distribution.low_risk} Users</p>
              <p className="text-[10px] text-ink-500 leading-tight">
                Verified regular behavior. Frictionless transactions and normal baseline activity.
              </p>
            </div>

            {/* Medium Risk Tier */}
            <div className="card p-3 border-l-4 border-l-amber-500 bg-amber-50/20 space-y-1.5 shadow-xs">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-black text-amber-900 uppercase tracking-wide">🟡 Elevated Tier (30 - 69.9)</span>
                <span className="text-[10px] font-mono font-bold bg-amber-100 text-amber-800 px-1.5 py-0.2 rounded">
                  {analyticsData.user_risk_distribution.medium_risk_percent}%
                </span>
              </div>
              <p className="text-xl font-black text-amber-700">{analyticsData.user_risk_distribution.medium_risk} Users</p>
              <p className="text-[10px] text-ink-500 leading-tight">
                Step-up OTP challenge active. New beneficiary linkages or velocity shifts detected.
              </p>
            </div>

            {/* High Risk Tier */}
            <div className="card p-3 border-l-4 border-l-red-500 bg-red-50/20 space-y-1.5 shadow-xs">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-black text-red-900 uppercase tracking-wide">🔴 Critical Tier (70 - 100)</span>
                <span className="text-[10px] font-mono font-bold bg-red-100 text-red-800 px-1.5 py-0.2 rounded">
                  {analyticsData.user_risk_distribution.high_risk_percent}%
                </span>
              </div>
              <p className="text-xl font-black text-red-700">{analyticsData.user_risk_distribution.high_risk} Users</p>
              <p className="text-[10px] text-ink-500 leading-tight">
                Quarantined / Held sessions. Out-of-hours mass actions or severe anomalies.
              </p>
            </div>
          </div>

          {/* Registered Users Risk Segregation Table */}
          <div className="card p-4 shadow-sm space-y-3">
            <div className="flex items-center justify-between border-b border-ink-100 pb-2">
              <div>
                <h2 className="text-xs font-black text-ink-800 tracking-wide uppercase">👥 Registered Users Risk Segregation & Telemetry</h2>
                <p className="text-[10px] text-ink-400 font-medium mt-0.5">Live risk classification dynamically recalculated per transaction event.</p>
              </div>
              <span className="text-[10px] font-semibold text-slate-500 bg-slate-50 border border-slate-200 px-2 py-0.5 rounded">
                Total Registered: {analyticsData.users.length}
              </span>
            </div>

            <div className="overflow-x-auto thin-scroll">
              <table className="w-full text-left border-collapse text-[11px]">
                <thead>
                  <tr className="text-[9.5px] uppercase tracking-wider text-ink-400 border-b border-slate-100">
                    <th className="pb-2 pt-1 font-bold">User / Identity</th>
                    <th className="pb-2 pt-1 font-bold">Account / Bank</th>
                    <th className="pb-2 pt-1 font-bold">Activity Volume</th>
                    <th className="pb-2 pt-1 font-bold text-center">Live Risk Score</th>
                    <th className="pb-2 pt-1 font-bold text-right">Security Tier</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {analyticsData.users.map((u) => {
                    const initials = getInitials(u.full_name)
                    return (
                      <tr key={u.user_id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="py-2.5 pr-2 flex items-center gap-2">
                          <div className="h-7 w-7 rounded-full bg-slate-100 border border-slate-200 font-bold text-[9px] text-slate-700 flex items-center justify-center shrink-0 shadow-xs">
                            {initials}
                          </div>
                          <div>
                            <p className="text-ink-900 font-bold leading-tight text-[11px]">{u.full_name}</p>
                            <p className="text-[9.5px] text-ink-400 font-semibold leading-tight">{u.email}</p>
                          </div>
                        </td>
                        <td className="py-2.5 pr-2">
                          <p className="font-mono text-[10px] font-bold text-ink-700">{u.account_number}</p>
                          <p className="text-[9.5px] text-ink-400">Bal: ₹{u.balance.toLocaleString()}</p>
                        </td>
                        <td className="py-2.5 pr-2">
                          <p className="text-[10.5px] font-bold text-ink-800">{u.transactions_count} Transfers</p>
                          <p className="text-[9.5px] text-ink-400">₹{u.total_transferred.toLocaleString()} Vol</p>
                        </td>
                        <td className="py-2.5 pr-2 text-center">
                          <span
                            className={`inline-block font-mono font-bold text-[10px] px-2 py-0.5 rounded-full ${
                              u.risk_level === 'HIGH'
                                ? 'bg-red-50 text-red-700 border border-red-100'
                                : u.risk_level === 'MEDIUM'
                                ? 'bg-amber-50 text-amber-700 border border-amber-100'
                                : 'bg-emerald-50 text-emerald-700 border border-emerald-100'
                            }`}
                          >
                            {u.risk_score} {u.risk_level}
                          </span>
                        </td>
                        <td className="py-2.5 text-right">
                          <span
                            className={`pill text-[8.5px] font-extrabold tracking-wider uppercase border shadow-xs ${
                              u.tier === 'HIGH_RISK'
                                ? 'bg-red-50 text-red-700 border-red-200'
                                : u.tier === 'MEDIUM_RISK'
                                ? 'bg-amber-50 text-amber-700 border-amber-200'
                                : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                            }`}
                          >
                            {u.status}
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
