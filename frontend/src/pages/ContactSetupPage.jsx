import React, { useState } from 'react'
import { useAuth } from '../context/AuthContext'

export default function ContactSetupPage({ onDone }) {
  const { user, updateContactDetails } = useAuth()
  const [phoneNumber, setPhoneNumber] = useState('')
  const [email, setEmail] = useState(user?.email || '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  async function handleSubmit(e) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await updateContactDetails(phoneNumber.trim(), email.trim())
      onDone()
    } catch (err) {
      setError(err?.response?.data?.detail || 'Could not save your contact details. Please check the format and try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-ink-950 via-shield-950 to-ink-900 px-4">
      <div className="w-full max-w-md">
        <div className="flex items-center gap-3 justify-center mb-8">
          <svg width="34" height="34" viewBox="0 0 24 24" fill="none">
            <path d="M12 2l8 3v6c0 5-3.4 8.7-8 11-4.6-2.3-8-6-8-11V5l8-3z" fill="#568cff" />
            <path d="M8.5 12.2l2.4 2.4 4.6-4.9" stroke="white" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <div>
            <p className="text-white font-extrabold text-lg leading-tight">Recipient Shield</p>
            <p className="text-white/50 text-xs leading-tight">Account Takeover Early-Warning System</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="card p-7">
          <h1 className="text-lg font-bold text-ink-900 mb-1">Stay notified</h1>
          <p className="text-sm text-ink-500 mb-6">
            Add your mobile number and email so we can alert you about every transfer -- an SMS the moment its
            status changes, and an email with the full transaction details.
          </p>

          <div className="mb-4">
            <label className="label">Mobile number</label>
            <input
              className="input"
              type="tel"
              placeholder="+91 98765 43210"
              value={phoneNumber}
              onChange={(e) => setPhoneNumber(e.target.value)}
              autoComplete="tel"
              required
            />
          </div>
          <div className="mb-2">
            <label className="label">Email address</label>
            <input
              className="input"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              required
            />
          </div>

          {error && (
            <p className="text-sm text-risk-high bg-risk-highBg rounded-lg px-3 py-2 mt-3">{error}</p>
          )}

          <button type="submit" disabled={busy} className="btn-primary w-full mt-5">
            {busy ? 'Saving...' : 'Save & continue'}
          </button>
          <button
            type="button"
            onClick={onDone}
            disabled={busy}
            className="w-full text-center text-xs font-semibold text-ink-400 hover:text-ink-600 mt-3"
          >
            Skip for now
          </button>
        </form>

        <p className="text-center text-white/40 text-[11px] mt-6">
          Prototype system. SMS delivery is simulated; email is sent for real if the backend has SMTP configured.
        </p>
      </div>
    </div>
  )
}
