import React, { useEffect, useState } from 'react'
import api from '../api/client'
import StatTile from '../components/StatTile'
import RiskDistributionChart from '../components/charts/RiskDistributionChart'
import CibilDistributionChart from '../components/charts/CibilDistributionChart'
import EventFrequencyChart from '../components/charts/EventFrequencyChart'
import RiskOverTimeChart from '../components/charts/RiskOverTimeChart'
import DetectionPerformanceChart from '../components/charts/DetectionPerformanceChart'

export default function SecurityAnalyticsPage({ navigate }) {
  const [data, setData] = useState(null)

  useEffect(() => {
    api.get('/analytics').then(({ data }) => setData(data))
  }, [])

  if (!data) {
    return <p className="text-sm text-ink-400 text-center py-20">Loading analytics...</p>
  }

  const m = data.model_metrics || {}

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-ink-900">Security analytics</h1>
          <p className="text-sm text-ink-500 mt-0.5">Fleet-wide risk posture across all monitored recipient accounts.</p>
        </div>
        <button className="btn-primary" onClick={() => navigate('/simulation')}>
          Run attack simulation
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatTile label="Monitored recipients" value={data.total_monitored_recipients} tone="brand" />
        <StatTile label="Potential takeovers detected" value={data.potential_takeovers_detected} tone="high" />
        <StatTile label="Transfers prevented" value={data.transfers_prevented} tone="medium" />
        <StatTile label="Average risk score" value={data.average_risk_score} tone="default" />
      </div>

      <div className="grid grid-cols-3 gap-4">
        <StatTile label="Low risk accounts" value={data.low_risk_count} tone="low" />
        <StatTile label="Medium risk accounts" value={data.medium_risk_count} tone="medium" />
        <StatTile label="High risk accounts" value={data.high_risk_count} tone="high" />
      </div>

      <div className="grid md:grid-cols-3 gap-6">
        <div className="card p-6">
          <h2 className="text-sm font-bold text-ink-800 mb-1">Risk distribution</h2>
          <p className="text-xs text-ink-500 mb-2">Current classification across all monitored accounts.</p>
          <RiskDistributionChart distribution={data.risk_distribution} />
        </div>
        <div className="card p-6">
          <h2 className="text-sm font-bold text-ink-800 mb-1">Credit profile (CIBIL)</h2>
          <p className="text-xs text-ink-500 mb-2">CIBIL score distribution across all monitored accounts.</p>
          <CibilDistributionChart distribution={data.cibil_distribution} />
        </div>
        <div className="card p-6">
          <h2 className="text-sm font-bold text-ink-800 mb-1">Suspicious event frequency</h2>
          <p className="text-xs text-ink-500 mb-2">Most common flagged behavioral events across all accounts.</p>
          <EventFrequencyChart frequency={data.suspicious_event_frequency} />
        </div>
      </div>

      <div className="card p-6">
        <h2 className="text-sm font-bold text-ink-800 mb-1">Risk over time</h2>
        <p className="text-xs text-ink-500 mb-2">Average risk score across every risk check performed, by day.</p>
        <RiskOverTimeChart points={data.risk_over_time} />
      </div>

      <div className="card p-6">
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-sm font-bold text-ink-800">Model evaluation (simulated test data)</h2>
          <span className="text-[11px] text-ink-400">Trained {m.trained_at ? new Date(m.trained_at).toLocaleString() : '--'}</span>
        </div>
        <p className="text-xs text-ink-500 mb-2">
          {m.model_type} -- evaluated on a held-out split of {m.n_test ?? '--'} simulated sequences.
        </p>
        <DetectionPerformanceChart metrics={m} />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4">
          <MiniStat label="Detection rate" value={m.detection_rate} />
          <MiniStat label="False positive rate" value={m.false_positive_rate} invert />
          <MiniStat label="Precision" value={m.precision} />
          <MiniStat label="Avg. warning lead time" value={m.avg_warning_lead_time_minutes} suffix=" min" isPercent={false} />
        </div>
        {m.confusion_matrix && (
          <div className="mt-5">
            <p className="text-xs font-semibold text-ink-600 mb-2">Confusion matrix (normal vs. compromised)</p>
            <ConfusionMatrix cm={m.confusion_matrix} />
          </div>
        )}
        <p className="text-[11px] text-ink-400 mt-4">{m.disclaimer}</p>
      </div>
    </div>
  )
}

function MiniStat({ label, value, suffix = '', isPercent = true, invert = false }) {
  const display = value === undefined || value === null ? '--' : isPercent ? `${Math.round(value * 100)}%` : `${value}${suffix}`
  const good = isPercent ? (invert ? value < 0.1 : value >= 0.9) : true
  return (
    <div className="rounded-lg bg-ink-50 border border-ink-100 p-3">
      <p className="text-[10px] uppercase tracking-wide text-ink-400 font-semibold">{label}</p>
      <p className={`text-lg font-bold ${good ? 'text-risk-low' : 'text-ink-800'}`}>{display}</p>
    </div>
  )
}

function ConfusionMatrix({ cm }) {
  const cell = 'flex flex-col items-center justify-center rounded-lg py-4 text-center'
  return (
    <div className="grid grid-cols-2 gap-2 max-w-sm">
      <div className={`${cell} bg-risk-lowBg`}>
        <span className="text-xl font-bold text-risk-low">{cm.tn}</span>
        <span className="text-[10px] text-ink-500 mt-0.5">True negative (normal, correctly allowed)</span>
      </div>
      <div className={`${cell} bg-risk-mediumBg`}>
        <span className="text-xl font-bold text-risk-medium">{cm.fp}</span>
        <span className="text-[10px] text-ink-500 mt-0.5">False positive (normal, flagged)</span>
      </div>
      <div className={`${cell} bg-risk-highBg`}>
        <span className="text-xl font-bold text-risk-high">{cm.fn}</span>
        <span className="text-[10px] text-ink-500 mt-0.5">False negative (compromised, missed)</span>
      </div>
      <div className={`${cell} bg-risk-lowBg`}>
        <span className="text-xl font-bold text-risk-low">{cm.tp}</span>
        <span className="text-[10px] text-ink-500 mt-0.5">True positive (compromised, detected)</span>
      </div>
    </div>
  )
}
