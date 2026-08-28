import React from 'react'
import InsiderThreatMonitorPage from './pages/InsiderThreatMonitorPage'

export default function App() {
  return (
    <div className="min-h-screen bg-ink-50 flex flex-col">
      {/* Top Header Navbar */}
      <header className="bg-ink-900 text-white h-14 flex items-center justify-between px-6 border-b border-white/10 shrink-0">
        <div className="flex items-center gap-3">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" className="text-shield-400">
            <path d="M12 3l7 2.5v5.5c0 4.5-3 7.8-7 9-4-1.2-7-4.5-7-9V5.5L12 3z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
          </svg>
          <div>
            <p className="text-sm font-black leading-tight tracking-wide">INSIDER SHIELD</p>
            <p className="text-[9.5px] text-white/50 leading-none">Privileged Access & Threat Monitoring System</p>
          </div>
        </div>
        <div className="flex items-center gap-2 text-xs font-semibold text-white/70">
          <span>Target System: </span>
          <span className="bg-white/10 text-white px-2.5 py-0.5 rounded text-[11px]">Recipient Shield DB (Live)</span>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 p-4 md:px-6 md:py-4 max-w-7xl w-full mx-auto overflow-hidden flex flex-col">
        <InsiderThreatMonitorPage />
      </main>
    </div>
  )
}
