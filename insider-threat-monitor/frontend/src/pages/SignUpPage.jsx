import React, { useState } from 'react'
import { useAuth } from '../context/AuthContext'
import logoFull from '../assets/logo-full.png'

export default function SignUpPage({ navigate }) {
  const { signup, loading, error } = useAuth()
  const [fullName, setFullName] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [formError, setFormError] = useState(null)

  async function handleSubmit(e) {
    e.preventDefault()
    setFormError(null)

    if (password !== confirmPassword) {
      setFormError('Passwords do not match')
      return
    }
    if (password.length < 6) {
      setFormError('Password must be at least 6 characters')
      return
    }

    try {
      await signup(fullName.trim(), username.trim(), password)
      // Don't navigate — App.jsx will automatically show OTP page
      // because needs_account_setup=true
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
          <h1 className="text-lg font-bold text-ink-900 mb-1">Create your account</h1>
          <p className="text-sm text-ink-500 mb-6">
            Sign up to get your own simulated bank account, protected by Recipient Shield on every transfer.
          </p>

          <div className="mb-4">
            <label className="label">Full name</label>
            <input
              className="input"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              autoComplete="name"
              required
            />
          </div>
          <div className="mb-4">
            <label className="label">Username</label>
            <input
              className="input"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              placeholder="e.g. rahul.verma"
              required
            />
          </div>
          <div className="mb-4">
            <label className="label">Password</label>
            <input
              className="input"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
              minLength={6}
              required
            />
          </div>
          <div className="mb-2">
            <label className="label">Confirm password</label>
            <input
              className="input"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              autoComplete="new-password"
              minLength={6}
              required
            />
          </div>

          {(formError || error) && (
            <p className="text-sm text-risk-high bg-risk-highBg rounded-lg px-3 py-2 mt-3">{formError || error}</p>
          )}

          <button type="submit" disabled={loading} className="btn-primary w-full mt-5">
            {loading ? 'Creating account...' : 'Sign up'}
          </button>

          <button
            type="button"
            onClick={() => navigate('/login')}
            className="w-full text-center text-xs font-semibold text-shield-600 hover:underline mt-4"
          >
            Already have an account? Sign in
          </button>
        </form>

        <p className="text-center text-white/40 text-[11px] mt-6">
          Prototype system. Simulated banking users only -- no real accounts, no real money. Your new account starts
          with a simulated balance and no transfers -- add your phone/email next to enable notifications.
        </p>
      </div>
    </div>
  )
}
