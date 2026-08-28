import React, { useState } from 'react'
import api from '../api/client'
import RiskPill from '../components/RiskPill'
import RecipientShieldScreen from '../components/RecipientShieldScreen'

const STEP_DELAY_MS = 650

export default function SimulationPage() {
  const [running, setRunning] = useState(false)
  const [revealedSteps, setRevealedSteps] = useState([])
  const [result, setResult] = useState(null)
  const [heldTxn, setHeldTxn] = useState(false)
  const [quickResults, setQuickResults] = useState({})
  const [quickBusy, setQuickBusy] = useState(null)

  async function runFullTakeoverSimulation() {
    setRunning(true)
    setResult(null)
    setRevealedSteps([])
    setHeldTxn(false)

    const { data } = await api.post('/simulation/compromised')

    for (const step of data.steps) {
      await sleep(STEP_DELAY_MS)
      setRevealedSteps((prev) => [...prev, step])
    }
    await sleep(400)
    setResult(data.risk_assessment)
    await sleep(600)
    setHeldTxn(true)
    setRunning(false)
  }

  async function runQuick(scenario, endpoint) {
    setQuickBusy(scenario)
    try {
      const { data } = await api.post(endpoint)
      setQuickResults((prev) => ({ ...prev, [scenario]: data.risk_assessment }))
    } finally {
      setQuickBusy(null)
    }
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-bold text-ink-900">Attack simulation</h1>
        <p className="text-sm text-ink-500 mt-0.5">
          Watch Recipient Shield detect a live account-takeover sequence, step by step -- the primary demonstration of
          the system.
        </p>
      </div>

      <div className="card p-6 md:p-8 bg-gradient-to-br from-ink-900 to-shield-950 text-white">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold">Run Account Takeover Simulation</h2>
            <p className="text-sm text-white/60 mt-1 max-w-xl">
              Simulates an attacker compromising a recipient's account in real time -- new device, password reset, SIM
              change, new beneficiary, and a rapid transfer attempt -- then shows Recipient Shield catching it before
              any money moves.
            </p>
          </div>
          <button className="btn-primary bg-white text-shield-900 hover:bg-white/90 shrink-0" onClick={runFullTakeoverSimulation} disabled={running}>
            {running ? 'Simulating...' : 'Run Account Takeover Simulation'}
          </button>
        </div>
      </div>

      {revealedSteps.length > 0 && (
        <div className="card p-6">
          <h3 className="text-sm font-bold text-ink-800 mb-4">Live attack sequence</h3>
          <ol className="space-y-3">
            {revealedSteps.map((s) => (
              <li key={s.step} className="flex items-center gap-3 animate-[fadeIn_0.3s_ease]">
                <span className="h-6 w-6 rounded-full bg-shield-100 text-shield-700 text-xs font-bold flex items-center justify-center shrink-0">
                  {s.step}
                </span>
                <span className="text-sm text-ink-700">{s.label}</span>
              </li>
            ))}
            {running && revealedSteps.length < 8 && (
              <li className="flex items-center gap-3 text-ink-400 text-sm pl-9">
                <span className="h-1.5 w-1.5 rounded-full bg-ink-300 animate-pulse" /> analyzing...
              </li>
            )}
          </ol>
        </div>
      )}

      {result && (
        <div>
          <RecipientShieldScreen
            assessment={result}
            amount={95000}
            actions={
              <div className="text-center py-2">
                {heldTxn ? (
                  <p className="text-sm font-semibold text-risk-high">
                    Transfer automatically held -- sender was warned before any money moved.
                  </p>
                ) : (
                  <p className="text-sm text-ink-400">Finalizing decision...</p>
                )}
              </div>
            }
          />
        </div>
      )}

      <div>
        <h2 className="text-sm font-bold text-ink-800 mb-3">Quick scenario triggers</h2>
        <div className="grid md:grid-cols-3 gap-4">
          <QuickCard
            title="Normal Account Simulation"
            description="Routine login/device/transaction behavior."
            expect="LOW RISK -> ALLOW"
            busy={quickBusy === 'normal'}
            onRun={() => runQuick('normal', '/simulation/normal')}
            result={quickResults.normal}
          />
          <QuickCard
            title="Medium Risk Simulation"
            description="Some unusual behavior, not confidently a takeover."
            expect="MEDIUM RISK -> VERIFY"
            busy={quickBusy === 'medium'}
            onRun={() => runQuick('medium', '/simulation/medium-risk')}
            result={quickResults.medium}
          />
          <QuickCard
            title="Compromised Account Simulation"
            description="New device -> password reset -> SIM change -> beneficiary -> transfer."
            expect="HIGH RISK -> WARN & HOLD"
            busy={quickBusy === 'compromised'}
            onRun={() => runQuick('compromised', '/simulation/compromised')}
            result={quickResults.compromised}
          />
        </div>
      </div>
    </div>
  )
}

function QuickCard({ title, description, expect, busy, onRun, result }) {
  return (
    <div className="card p-5 flex flex-col">
      <h3 className="text-sm font-bold text-ink-800">{title}</h3>
      <p className="text-xs text-ink-500 mt-1 flex-1">{description}</p>
      <p className="text-[11px] text-ink-400 mt-2 font-mono">{expect}</p>
      <button className="btn-secondary mt-4" onClick={onRun} disabled={busy}>
        {busy ? 'Running...' : 'Run'}
      </button>
      {result && (
        <div className="mt-3 flex items-center justify-between rounded-lg bg-ink-50 border border-ink-100 px-3 py-2">
          <RiskPill level={result.risk_level} />
          <span className="text-sm font-bold text-ink-800">{Math.round(result.risk_score)}/100</span>
        </div>
      )}
    </div>
  )
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
