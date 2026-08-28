import React, { useState } from 'react'
import { useAuth } from '../context/AuthContext'

export default function OTPVerificationPage({ onDone }) {
  const { sendOTP, verifyOTPAndLink, loading, error } = useAuth()
  
  const [step, setStep] = useState(1) // 1: request, 2: verify
  const [otp, setOtp] = useState('')
  const [maskedEmail, setMaskedEmail] = useState('')

  async function handleSendOTP(e) {
    e.preventDefault()
    try {
      const res = await sendOTP()
      setMaskedEmail(res.masked_email || '')
      setStep(2)
    } catch (err) {
      // error surfaced via useAuth().error
    }
  }

  async function handleVerifyOTP(e) {
    e.preventDefault()
    try {
      await verifyOTPAndLink(otp.trim())
      onDone()
    } catch (err) {
      // error surfaced via useAuth().error
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

        <div className="card p-7">
          <h1 className="text-lg font-bold text-ink-900 mb-1">Two-Factor Authentication</h1>
          <p className="text-sm text-ink-500 mb-6">
            To complete your account setup, we'll send a one-time verification code to the email registered with your bank profile.
          </p>

          {step === 1 ? (
            <form onSubmit={handleSendOTP}>
              <div style={{background: '#f0f4ff', borderRadius: 10, padding: '14px 18px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 10}}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#4361ee" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="2" y="4" width="20" height="16" rx="2"/>
                  <path d="M22 7l-10 7L2 7"/>
                </svg>
                <span style={{fontSize: 13, color: '#4361ee', fontWeight: 600}}>OTP will be sent to your registered email</span>
              </div>
              
              <button type="submit" disabled={loading} className="btn-primary w-full mt-2">
                {loading ? 'Sending...' : 'Send OTP to my Email'}
              </button>
              
              {error && (
                <p className="text-sm text-risk-high bg-risk-highBg rounded-lg px-3 py-2 mt-3 text-center">{error}</p>
              )}
            </form>
          ) : (
            <form onSubmit={handleVerifyOTP}>
              <div style={{background: '#e8f5e9', borderRadius: 10, padding: '14px 18px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 10}}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#2e7d32" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22 11.08V12a10 10 0 11-5.93-9.14"/>
                  <path d="M22 4L12 14.01l-3-3"/>
                </svg>
                <span style={{fontSize: 13, color: '#2e7d32', fontWeight: 600}}>
                  OTP sent to {maskedEmail}. Check your inbox!
                </span>
              </div>
              
              <div className="mb-4">
                <label className="label">Enter 6-digit OTP</label>
                <input
                  className="input"
                  value={otp}
                  onChange={(e) => setOtp(e.target.value)}
                  placeholder="Enter code from email"
                  maxLength={6}
                  style={{letterSpacing: '6px', fontSize: 20, fontWeight: 700, textAlign: 'center'}}
                  required
                />
              </div>
              
              {error && (
                <p className="text-sm text-risk-high bg-risk-highBg rounded-lg px-3 py-2 mt-3 mb-3">{error}</p>
              )}

              <button type="submit" disabled={loading} className="btn-primary w-full mt-2">
                {loading ? 'Verifying...' : 'Verify & Complete Setup'}
              </button>
              
              <button
                type="button"
                onClick={() => { setStep(1); setOtp(''); }}
                className="w-full text-center text-xs font-semibold text-shield-600 hover:underline mt-4"
              >
                Didn't receive it? Send again
              </button>
            </form>
          )}
        </div>
        
        <p className="text-center text-white/30 text-[11px] mt-6">
          The OTP expires in 5 minutes. Check your spam folder if you don't see it.
        </p>
      </div>
    </div>
  )
}
