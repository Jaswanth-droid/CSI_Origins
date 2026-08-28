import React, { createContext, useContext, useState, useCallback } from 'react'
import api from '../api/client'

const AuthContext = createContext(null)

function _persistSession(data) {
  localStorage.setItem('rs_token', data.access_token)
  const u = {
    id: data.user_id,
    username: data.username,
    fullName: data.full_name,
    accountId: data.account_id,
    email: data.email || '',
    phoneNumber: data.phone_number || '',
    needsContactSetup: !!data.needs_contact_setup,
    needsAccountSetup: !!data.needs_account_setup,
  }
  localStorage.setItem('rs_user', JSON.stringify(u))
  return u
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    const raw = localStorage.getItem('rs_user')
    return raw ? JSON.parse(raw) : null
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const login = useCallback(async (username, password) => {
    setLoading(true)
    setError(null)
    try {
      const { data } = await api.post('/auth/login', { username, password })
      const u = _persistSession(data)
      setUser(u)
      return u
    } catch (e) {
      const msg = e?.response?.data?.detail || 'Login failed. Please check your credentials.'
      setError(msg)
      throw new Error(msg)
    } finally {
      setLoading(false)
    }
  }, [])

  const signup = useCallback(async (fullName, username, password) => {
    setLoading(true)
    setError(null)
    try {
      const { data } = await api.post('/auth/signup', { full_name: fullName, username, password })
      const u = _persistSession(data)
      setUser(u)
      return u
    } catch (e) {
      const msg = e?.response?.data?.detail || 'Could not create your account. Please try again.'
      setError(msg)
      throw new Error(msg)
    } finally {
      setLoading(false)
    }
  }, [])

  const logout = useCallback(() => {
    localStorage.removeItem('rs_token')
    localStorage.removeItem('rs_user')
    setUser(null)
    window.location.hash = '#/login'
  }, [])

  const updateContactDetails = useCallback(async (phoneNumber, email) => {
    const { data } = await api.put('/auth/contact', { phone_number: phoneNumber, email })
    setUser((prev) => {
      if (!prev) return prev
      const next = { ...prev, phoneNumber: data.phone_number || '', email: data.email || '', needsContactSetup: false }
      localStorage.setItem('rs_user', JSON.stringify(next))
      return next
    })
  }, [])

  const sendOTP = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const { data } = await api.post('/auth/send-otp')
      return data
    } catch (e) {
      const msg = e?.response?.data?.detail || 'Could not send OTP.'
      setError(msg)
      throw new Error(msg)
    } finally {
      setLoading(false)
    }
  }, [])

  const verifyOTPAndLink = useCallback(async (otp) => {
    setLoading(true)
    setError(null)
    try {
      const { data } = await api.post('/auth/verify-otp-and-link', { otp })
      const u = _persistSession(data)
      setUser(u)
      return u
    } catch (e) {
      const msg = e?.response?.data?.detail || 'Could not verify OTP.'
      setError(msg)
      throw new Error(msg)
    } finally {
      setLoading(false)
    }
  }, [])

  return (
    <AuthContext.Provider value={{ user, login, signup, logout, loading, error, updateContactDetails, sendOTP, verifyOTPAndLink }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
