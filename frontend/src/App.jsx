import React, { useState } from 'react'
import { useAuth } from './context/AuthContext'
import { useHashRoute } from './useHashRoute'
import AppShell from './components/AppShell'
import LoginPage from './pages/LoginPage'
import SignUpPage from './pages/SignUpPage'
import OTPVerificationPage from './pages/OTPVerificationPage'
import ContactSetupPage from './pages/ContactSetupPage'
import DashboardPage from './pages/DashboardPage'
import TransferPage from './pages/TransferPage'
import TransactionHistoryPage from './pages/TransactionHistoryPage'
import TransactionManagementPage from './pages/TransactionManagementPage'
import RecipientTimelinePage from './pages/RecipientTimelinePage'
import SecurityAnalyticsPage from './pages/SecurityAnalyticsPage'
import SimulationPage from './pages/SimulationPage'
import AlertsPage from './pages/AlertsPage'

const PAGES = {
  '/dashboard': DashboardPage,
  '/transfer': TransferPage,
  '/history': TransactionHistoryPage,
  '/transactions': TransactionManagementPage,
  '/timeline': RecipientTimelinePage,
  '/alerts': AlertsPage,
  '/analytics': SecurityAnalyticsPage,
  '/simulation': SimulationPage,
}

export default function App() {
  const { user } = useAuth()
  const { path, navigate } = useHashRoute()
  const [contactSetupDoneForUserId, setContactSetupDoneForUserId] = useState(null)
  const [accountSetupDoneForUserId, setAccountSetupDoneForUserId] = useState(null)

  if (!user) {
    if (path === '/signup') {
      return <SignUpPage navigate={navigate} />
    }
    return <LoginPage navigate={navigate} />
  }

  if (user.needsAccountSetup && accountSetupDoneForUserId !== user.id) {
    return <OTPVerificationPage onDone={() => setAccountSetupDoneForUserId(user.id)} />
  }

  if (user.needsContactSetup && contactSetupDoneForUserId !== user.id) {
    return <ContactSetupPage onDone={() => setContactSetupDoneForUserId(user.id)} />
  }

  const Page = PAGES[path] || DashboardPage

  return (
    <AppShell current={path in PAGES ? path : '/dashboard'} navigate={navigate}>
      <Page navigate={navigate} />
    </AppShell>
  )
}
