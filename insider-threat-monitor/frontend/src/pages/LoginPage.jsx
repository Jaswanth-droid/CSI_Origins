import React, { useState } from 'react'
import { useAuth } from '../context/AuthContext'
import logoFull from '../assets/logo-full.png'

export default function LoginPage({ navigate }) {
  const { login, loading, error } = useAuth()
  const [username, setUsername] = useState('priya.sharma')
  const [password, setPassword] = useState('demo1234')

  async function handleSubmit(e) {
    e.preventDefault()
    try {
      await login(username, password)
      navigate('/dashboard')
    } catch {
      // error surfaced via useAuth().error
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-ink-950 via-shield-950 to-ink-900 px-4">
      <div className="w-full max-w-md">
        <div className="flex flex-col items-center justify-center mb-8">
          <img src={logoFull} alt="Recipient Shield" className="w-56 h-auto" />
          <p className="text-white/50 text-xs leading-tight -mt-2">Account Takeover Early-Warning System</p>
        </div>

        <form onSubmit={handleSubmit} className="card p-7">
          <h1 className="text-lg font-bold text-ink-900 mb-1">Sign in</h1>
          <p className="text-sm text-ink-500 mb-6">Log in as a sender to send a protected transfer.</p>

          <div className="mb-4">
            <label className="label">Username</label>
            <input className="input" value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" />
          </div>
          <div className="mb-2">
            <label className="label">Password</label>
            <input
              className="input"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
            />
          </div>

          {error && (
            <p className="text-sm text-risk-high bg-risk-highBg rounded-lg px-3 py-2 mt-3">{error}</p>
          )}

          <button type="submit" disabled={loading} className="btn-primary w-full mt-5">
            {loading ? 'Signing in...' : 'Sign in'}
          </button>

          <button
            type="button"
            onClick={() => navigate('/signup')}
            className="w-full text-center text-xs font-semibold text-shield-600 hover:underline mt-4"
          >
            New here? Create an account
          </button>

          <div className="mt-5 rounded-lg bg-ink-50 border border-ink-100 px-3.5 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-400 mb-1">Demo credentials</p>
            <p className="text-xs text-ink-600">username: <span className="font-mono">priya.sharma</span></p>
            <p className="text-xs text-ink-600">password: <span className="font-mono">demo1234</span></p>
          </div>
        </form>

        <p className="text-center text-white/40 text-[11px] mt-6">
          Prototype system. Simulated banking users only -- no real accounts, no real money.
        </p>
      </div>
    </div>
  )
}
