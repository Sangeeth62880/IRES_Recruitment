import { useState, useEffect, useCallback } from 'react'
import { API_URL } from '../config'
import SU26Logo from '../assets/SU26logo.png'

const NAV_ITEMS = [
  { id: 'registrations', label: 'Registrations', icon: 'users' },
  { id: 'event-settings', label: 'Event Settings', icon: 'settings' }
]

function getDisplayStatus(r) {
  return r.verified ? 'verified' : 'pending'
}

const STATUS_BADGE_MAP = {
  verified: { className: 'badge--verified', label: 'Verified' },
  pending:  { className: 'badge--pending',  label: 'Pending' }
}

const TIER_BADGE_MAP = {
  early_bird: { className: 'badge--early-bird', label: 'Early Bird' },
  regular:    { className: 'badge--regular',    label: 'Regular' }
}

function getCsrfCookie() {
  const match = document.cookie.match(/(?:^|;\s*)csrf_token=([^;]+)/)
  return match ? decodeURIComponent(match[1]) : ''
}

/* SVG Icon Components */
function UsersIcon() {
  return (
    <svg className="sidebar__nav-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
    </svg>
  )
}

function SettingsIcon() {
  return (
    <svg className="sidebar__nav-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
      <path d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
    </svg>
  )
}

function SearchIcon() {
  return (
    <svg className="filter-bar__search-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
    </svg>
  )
}

function ExportIcon() {
  return (
    <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" />
    </svg>
  )
}

function LogoutIcon() {
  return (
    <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
    </svg>
  )
}

const NAV_ICONS = {
  users: UsersIcon,
  settings: SettingsIcon
}

function Admin() {
  const [loggedIn, setLoggedIn] = useState(false)
  const [password, setPassword] = useState('')
  const [loginError, setLoginError] = useState('')
  const [loggingIn, setLoggingIn] = useState(false)
  const [activeSection, setActiveSection] = useState('registrations')
  const [csrfToken, setCsrfToken] = useState(() => getCsrfCookie())

  const [registrations, setRegistrations] = useState([])
  const [activeFilter, setActiveFilter] = useState('all')
  const [searchQuery, setSearchQuery] = useState('')

  // Pricing state
  const [earlyBirdFee, setEarlyBirdFee] = useState('')
  const [regularFee, setRegularFee] = useState('')
  const [earlyBirdEnabled, setEarlyBirdEnabled] = useState(false)
  const [pricingSaving, setPricingSaving] = useState(false)
  const [pricingStatus, setPricingStatus] = useState({ type: '', message: '' })

  // Event info state
  const [eventDate, setEventDate] = useState('')
  const [eventVenue, setEventVenue] = useState('')
  const [eventSaving, setEventSaving] = useState(false)
  const [eventStatus, setEventStatus] = useState({ type: '', message: '' })

  // Bank state
  const [bankDetails, setBankDetails] = useState({
    bank_name: '',
    account_holder: '',
    account_number: '',
    ifsc_code: '',
    branch_name: '',
    is_locked: false
  })
  const [bankConfirmPassword, setBankConfirmPassword] = useState('')
  const [bankSaving, setBankSaving] = useState(false)
  const [bankStatus, setBankStatus] = useState({ type: '', message: '' })

  // Payment Display & QR state
  const [paymentMode, setPaymentMode] = useState('bank') // 'qr' | 'bank' | 'both'
  const [activeQrFilename, setActiveQrFilename] = useState(null)
  const [qrUploadFile, setQrUploadFile] = useState(null)
  const [qrUploadPreview, setQrUploadPreview] = useState(null)
  const [qrUploading, setQrUploading] = useState(false)
  const [qrStatus, setQrStatus] = useState({ type: '', message: '' })
  const [qrTimestamp, setQrTimestamp] = useState(() => Date.now())

  const apiFetch = useCallback(async (url, options = {}) => {
    const method = options.method ? options.method.toUpperCase() : 'GET'
    const isMutating = ['POST', 'PATCH', 'PUT', 'DELETE'].includes(method)
    const token = csrfToken || getCsrfCookie()

    const headers = {
      ...options.headers,
      ...(isMutating && token ? { 'X-CSRF-Token': token } : {})
    }

    const fullUrl = url.startsWith('http') ? url : `${API_URL}${url}`
    const res = await fetch(fullUrl, { ...options, headers, credentials: 'include' })
    if (res.status === 401) {
      setLoggedIn(false)
      setLoginError('Session expired. Please log in again.')
      throw new Error('Unauthorized')
    }
    return res
  }, [csrfToken])

  // Retrieve fresh CSRF token whenever session is established
  useEffect(() => {
    if (loggedIn) {
      fetch(`${API_URL}/api/admin/csrf-token`, { credentials: 'include' })
        .then(r => r.json())
        .then(data => {
          if (data.csrfToken) setCsrfToken(data.csrfToken)
        })
        .catch(() => {})
    }
  }, [loggedIn])

  // Auth
  async function handleLogin(e) {
    e.preventDefault()
    setLoginError('')
    setLoggingIn(true)
    try {
      const res = await fetch(`${API_URL}/api/admin/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ password })
      })
      const data = await res.json()
      if (data.success) {
        setLoggedIn(true)
        setPassword('')
        if (data.csrfToken) setCsrfToken(data.csrfToken)
      } else {
        setLoginError(data.error || 'Incorrect password')
      }
    } catch {
      setLoginError('Network error')
    } finally {
      setLoggingIn(false)
    }
  }

  async function handleLogout() {
    try { await apiFetch('/api/admin/logout', { method: 'POST' }) } catch { /* ignore */ }
    setLoggedIn(false)
    setCsrfToken('')
    setRegistrations([])
  }

  // Data loaders
  const loadRegistrations = useCallback(async () => {
    try {
      const res = await apiFetch('/api/admin/registrations')
      setRegistrations(await res.json())
    } catch { /* ignore */ }
  }, [apiFetch])

  const loadPricing = useCallback(async () => {
    try {
      const res = await apiFetch('/api/admin/settings/pricing')
      const data = await res.json()
      setEarlyBirdFee(String(data.early_bird_fee || ''))
      setRegularFee(String(data.regular_fee || ''))
      setEarlyBirdEnabled(!!data.early_bird_enabled)
    } catch { /* ignore */ }
  }, [apiFetch])

  const loadBankDetails = useCallback(async () => {
    try {
      const res = await apiFetch('/api/settings/bank')
      const data = await res.json()
      setBankDetails({
        bank_name: data.bank_name || '',
        account_holder: data.account_holder || '',
        account_number: data.account_number || '',
        ifsc_code: data.ifsc_code || '',
        branch_name: data.branch_name || '',
        is_locked: !!data.is_locked
      })
    } catch { /* ignore */ }
  }, [apiFetch])

  const loadEventInfo = useCallback(async () => {
    try {
      const res = await apiFetch('/api/settings/event')
      const data = await res.json()
      setEventDate(data.event_date || '')
      setEventVenue(data.event_venue || '')
    } catch { /* ignore */ }
  }, [apiFetch])

  const loadPaymentSettings = useCallback(async () => {
    try {
      const res = await apiFetch('/api/admin/settings/payment')
      const data = await res.json()
      if (data.payment_display_mode) setPaymentMode(data.payment_display_mode)
      setActiveQrFilename(data.qr_image_filename || null)
    } catch { /* ignore */ }
  }, [apiFetch])

  useEffect(() => {
    if (!loggedIn) return
    let ignore = false
    const init = async () => {
      if (!ignore) {
        await loadRegistrations()
        await loadPricing()
        await loadBankDetails()
        await loadEventInfo()
        await loadPaymentSettings()
      }
    }
    init()
    return () => { ignore = true }
  }, [loggedIn, loadRegistrations, loadPricing, loadBankDetails, loadEventInfo, loadPaymentSettings])

  useEffect(() => {
    if (!loggedIn || activeSection !== 'event-settings') return
    let ignore = false
    const refreshSettings = async () => {
      if (!ignore) {
        await loadPricing()
        await loadBankDetails()
        await loadEventInfo()
        await loadPaymentSettings()
      }
    }
    refreshSettings()
    return () => { ignore = true }
  }, [loggedIn, activeSection, loadPricing, loadBankDetails, loadEventInfo, loadPaymentSettings])

  // Registration actions
  async function handleVerify(id) {
    try { await apiFetch(`/api/admin/registrations/${id}/verify`, { method: 'PATCH' }); await loadRegistrations() } catch { /* ignore */ }
  }
  async function handleUnverify(id) {
    try { await apiFetch(`/api/admin/registrations/${id}/unverify`, { method: 'PATCH' }); await loadRegistrations() } catch { /* ignore */ }
  }
  async function handleDelete(id) {
    if (!confirm('Delete this registration?')) return
    try { await apiFetch(`/api/admin/registrations/${id}`, { method: 'DELETE' }); await loadRegistrations() } catch { /* ignore */ }
  }
  async function handleExportCSV() {
    try {
      const res = await apiFetch('/api/admin/export/csv')
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url; a.download = 'registrations.csv'
      document.body.appendChild(a); a.click()
      document.body.removeChild(a); URL.revokeObjectURL(url)
    } catch { /* ignore */ }
  }

  // Pricing save
  async function handlePricingSave() {
    setPricingStatus({ type: '', message: '' })
    setPricingSaving(true)
    try {
      const res = await apiFetch('/api/admin/settings/pricing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          early_bird_fee: parseInt(earlyBirdFee, 10) || 0,
          regular_fee: parseInt(regularFee, 10) || 0,
          early_bird_enabled: earlyBirdEnabled
        })
      })
      const data = await res.json()
      if (data.success) {
        setEarlyBirdFee(String(data.early_bird_fee))
        setRegularFee(String(data.regular_fee))
        setEarlyBirdEnabled(data.early_bird_enabled)
        setPricingStatus({ type: 'success', message: 'Pricing saved successfully!' })
        setTimeout(() => setPricingStatus(prev => prev.type === 'success' ? { type: '', message: '' } : prev), 4000)
      } else {
        setPricingStatus({ type: 'error', message: data.error || 'Failed to save pricing' })
      }
    } catch {
      setPricingStatus({ type: 'error', message: 'Network error. Please try again.' })
    } finally {
      setPricingSaving(false)
    }
  }

  // Early bird toggle (auto-saves)
  async function handleToggleEarlyBird() {
    const newVal = !earlyBirdEnabled
    setEarlyBirdEnabled(newVal)
    try {
      await apiFetch('/api/admin/settings/pricing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ early_bird_enabled: newVal })
      })
    } catch {
      setEarlyBirdEnabled(!newVal) // revert on error
    }
  }

  // Event info save
  async function handleEventSave(e) {
    e.preventDefault()
    setEventStatus({ type: '', message: '' })
    setEventSaving(true)
    try {
      const res = await apiFetch('/api/admin/settings/event', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event_date: eventDate.trim(), event_venue: eventVenue.trim() })
      })
      const data = await res.json()
      if (res.ok && data.success) {
        setEventStatus({ type: 'success', message: 'Event info saved!' })
        setTimeout(() => setEventStatus(prev => prev.type === 'success' ? { type: '', message: '' } : prev), 4000)
      } else {
        setEventStatus({ type: 'error', message: data.error || 'Failed to save' })
      }
    } catch {
      setEventStatus({ type: 'error', message: 'Network error.' })
    } finally {
      setEventSaving(false)
    }
  }

  // Bank save
  async function handleBankSave(e) {
    e.preventDefault()
    setBankStatus({ type: '', message: '' })

    const acNum = bankDetails.account_number.trim()
    const ifsc = bankDetails.ifsc_code.trim()
    const bankName = bankDetails.bank_name.trim()
    const holder = bankDetails.account_holder.trim()
    const branch = bankDetails.branch_name.trim()

    if (bankName.length > 100) {
      setBankStatus({ type: 'error', message: 'Bank name must be at most 100 characters' })
      return
    }
    if (holder.length > 100) {
      setBankStatus({ type: 'error', message: 'Account holder must be at most 100 characters' })
      return
    }
    if (acNum && !/^\d{9,18}$/.test(acNum)) {
      setBankStatus({ type: 'error', message: 'Account number must be numeric, 9-18 digits' })
      return
    }
    if (ifsc && !/^[A-Z]{4}0[A-Z0-9]{6}$/.test(ifsc)) {
      setBankStatus({ type: 'error', message: 'IFSC code must match standard format (e.g. FDRL0001234)' })
      return
    }
    if (branch.length > 100) {
      setBankStatus({ type: 'error', message: 'Branch name must be at most 100 characters' })
      return
    }

    if (bankDetails.is_locked) {
      setBankStatus({ type: 'error', message: 'Bank settings are locked by server configuration and cannot be modified.' })
      return
    }

    if (!bankConfirmPassword.trim()) {
      setBankStatus({ type: 'error', message: 'Admin password confirmation is required to authorize changes to bank details.' })
      return
    }

    setBankSaving(true)
    try {
      const res = await apiFetch('/api/admin/settings/bank', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bank_name: bankName,
          account_holder: holder,
          account_number: acNum,
          ifsc_code: ifsc,
          branch_name: branch,
          confirm_password: bankConfirmPassword
        })
      })
      const data = await res.json()
      if (res.ok && data.success) {
        setBankConfirmPassword('')
        setBankStatus({ type: 'success', message: 'Bank details saved successfully!' })
        setTimeout(() => setBankStatus(prev => prev.type === 'success' ? { type: '', message: '' } : prev), 4000)
      } else {
        setBankStatus({ type: 'error', message: data.error || 'Failed to save bank details' })
      }
    } catch {
      setBankStatus({ type: 'error', message: 'Network error. Please try again.' })
    } finally {
      setBankSaving(false)
    }
  }

  // Payment display mode change
  async function handlePaymentModeChange(newMode) {
    setPaymentMode(newMode)
    setQrStatus({ type: '', message: '' })
    try {
      const res = await apiFetch('/api/admin/settings/payment-mode', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ payment_display_mode: newMode })
      })
      const data = await res.json()
      if (res.ok && data.success) {
        setQrStatus({ type: 'success', message: `Display mode set to ${newMode === 'both' ? 'Both (QR + Bank)' : newMode.toUpperCase() + ' only'}` })
        setTimeout(() => setQrStatus(prev => prev.type === 'success' ? { type: '', message: '' } : prev), 3000)
      } else {
        setQrStatus({ type: 'error', message: data.error || 'Failed to update payment display mode' })
      }
    } catch {
      setQrStatus({ type: 'error', message: 'Network error updating display mode' })
    }
  }

  // QR Upload
  async function handleQrUpload(e) {
    e.preventDefault()
    if (!qrUploadFile) return
    setQrUploading(true)
    setQrStatus({ type: '', message: '' })

    const fd = new FormData()
    fd.append('qr_image', qrUploadFile)

    try {
      const res = await apiFetch('/api/admin/settings/qr', {
        method: 'POST',
        body: fd
      })
      const data = await res.json()
      if (res.ok && data.success) {
        setActiveQrFilename(data.qr_image_filename)
        setQrTimestamp(Date.now())
        setQrUploadFile(null)
        setQrUploadPreview(null)
        setQrStatus({ type: 'success', message: 'QR code updated successfully!' })
        setTimeout(() => setQrStatus(prev => prev.type === 'success' ? { type: '', message: '' } : prev), 4000)
      } else {
        setQrStatus({ type: 'error', message: data.error || 'Failed to upload QR image' })
      }
    } catch {
      setQrStatus({ type: 'error', message: 'Network error uploading QR code' })
    } finally {
      setQrUploading(false)
    }
  }

  // QR Remove
  async function handleQrRemove() {
    if (!confirm('Are you sure you want to remove the active QR code?')) return
    setQrStatus({ type: '', message: '' })
    try {
      const res = await apiFetch('/api/admin/settings/qr', {
        method: 'DELETE'
      })
      const data = await res.json()
      if (res.ok && data.success) {
        setActiveQrFilename(null)
        setQrTimestamp(Date.now())
        setQrStatus({ type: 'success', message: 'Active QR code removed.' })
        setTimeout(() => setQrStatus(prev => prev.type === 'success' ? { type: '', message: '' } : prev), 3000)
      } else {
        setQrStatus({ type: 'error', message: data.error || 'Failed to remove QR code' })
      }
    } catch {
      setQrStatus({ type: 'error', message: 'Network error' })
    }
  }

  // Filter registrations
  const filtered = registrations.filter(r => {
    const status = getDisplayStatus(r)

    if (activeFilter === 'verified' && status !== 'verified') return false
    if (activeFilter === 'pending' && status !== 'pending') return false

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      return (r.name && r.name.toLowerCase().includes(q)) || 
             (r.institution && r.institution.toLowerCase().includes(q)) || 
             (r.utr_number && r.utr_number.includes(q)) ||
             (r.email && r.email.toLowerCase().includes(q))
    }
    return true
  })

  const verifiedCount = registrations.filter(r => r.verified).length
  const pendingCount = registrations.filter(r => !r.verified).length

  // ── Login Screen ──
  if (!loggedIn) {
    return (
      <div className="login-screen">
        <div className="login-card">
          <div className="login-card__brand">SPACEUP VOL 8</div>
          <div className="login-card__brand-sub">Admin Terminal</div>
          <h2>[ ACCESS ]</h2>
          {loginError && <div className="alert alert--error">{loginError}</div>}
          <form onSubmit={handleLogin}>
            <div className="form-group">
              <label htmlFor="admin-password">Password</label>
              <input
                type="password"
                id="admin-password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Enter admin password"
                autoFocus
              />
            </div>
            <button type="submit" className="btn btn--primary" disabled={loggingIn}>
              {loggingIn ? <><span className="spinner" /> ENTERING...</> : '[ ENTER ]'}
            </button>
          </form>
        </div>
      </div>
    )
  }

  // ── Dashboard ──
  return (
    <div className="admin-layout">
      {/* Sidebar */}
      <aside className="sidebar">
        <div>
          {/* Brand Header */}
          <div className="sidebar__brand-container">
            <div className="sidebar__logo-wrapper">
              <div className="sidebar__logo-glow" />
              <img src={SU26Logo} alt="SpaceUp 26" className="sidebar__logo" />
            </div>
            <div>
              <div className="sidebar__brand-text">
                SpaceUp Vol 8
                <span className="sidebar__brand-dot" />
              </div>
              <div className="sidebar__brand-sub">Admin Terminal</div>
            </div>
          </div>

          {/* Navigation */}
          <div className="sidebar__nav-section">
            <p className="sidebar__nav-label">Management</p>
            <nav>
              <ul className="sidebar__nav">
                {NAV_ITEMS.map(item => {
                  const IconComponent = NAV_ICONS[item.icon]
                  return (
                    <li key={item.id}>
                      <a
                        href={`#${item.id}`}
                        className={`sidebar__nav-item ${activeSection === item.id ? 'sidebar__nav-item--active' : ''}`}
                        onClick={e => { e.preventDefault(); setActiveSection(item.id) }}
                      >
                        {IconComponent && <IconComponent />}
                        <span>{item.label}</span>
                        {item.id === 'registrations' && (
                          <span className="sidebar__nav-count">{registrations.length}</span>
                        )}
                      </a>
                    </li>
                  )
                })}
              </ul>
            </nav>
          </div>
        </div>

        {/* Sidebar Footer */}
        <div className="sidebar__footer">
          <button className="btn btn--outline" style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }} onClick={handleLogout}>
            <LogoutIcon />
            [ LOGOUT ]
          </button>
        </div>
      </aside>

      {/* Main */}
      <main className="admin-main">
        {/* Top Bar */}
        <header className="admin-topbar">
          <div className="admin-topbar__status">
            <div style={{ position: 'relative', width: 10, height: 10 }}>
              <span className="admin-topbar__ping" />
            </div>
            <span className="admin-topbar__session">SESSION: SU26-STAGE-PROD</span>
          </div>
        </header>

        <div className="admin-content">

          {/* ── Registrations ── */}
          {activeSection === 'registrations' && (
            <div>
              {/* Section Header */}
              <div className="section-header">
                <div>
                  <h2>Registrations Directory</h2>
                  <div className="section-header__stats">
                    <span className="section-header__stat section-header__stat--cyan">{registrations.length} total registrations</span>
                    <span className="section-header__divider">•</span>
                    <span className="section-header__stat section-header__stat--green">{verifiedCount} Verified</span>
                    <span className="section-header__divider">•</span>
                    <span className="section-header__stat section-header__stat--yellow">{pendingCount} Pending Verification</span>
                  </div>
                </div>
                <button className="btn btn--export" onClick={handleExportCSV}>
                  <ExportIcon />
                  [ EXPORT CSV ]
                </button>
              </div>

              {/* Filter Bar */}
              <div className="filter-bar">
                <div className="filter-bar__search-wrapper">
                  <SearchIcon />
                  <input
                    type="text"
                    className="filter-bar__search"
                    placeholder="Search name, institution, UTR, email..."
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                  />
                  <span className="filter-bar__shortcut">⌘K</span>
                </div>
                <div className="filter-toggle">
                  {[
                    { key: 'all', label: `ALL (${registrations.length})` },
                    { key: 'verified', label: `VERIFIED (${verifiedCount})` },
                    { key: 'pending', label: `PENDING (${pendingCount})` }
                  ].map(v => (
                    <button
                      key={v.key}
                      className={`filter-toggle__btn ${activeFilter === v.key ? 'filter-toggle__btn--active' : ''}`}
                      onClick={() => setActiveFilter(v.key)}
                    >
                      {v.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Registrations Table */}
              <div className="table-wrapper">
                <table>
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Email</th>
                      <th>Institution</th>
                      <th>UTR / REF</th>
                      <th>Tier</th>
                      <th>Status</th>
                      <th>Date</th>
                      <th style={{ textAlign: 'right' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.length === 0 ? (
                      <tr>
                        <td colSpan={8} style={{ textAlign: 'center', color: 'var(--text-subtle)', padding: 40 }}>
                          No registrations found
                        </td>
                      </tr>
                    ) : (
                      filtered.map(r => {
                        const displayStatus = getDisplayStatus(r)
                        const badgeInfo = STATUS_BADGE_MAP[displayStatus] || STATUS_BADGE_MAP.pending
                        const tierInfo = TIER_BADGE_MAP[r.fee_tier] || TIER_BADGE_MAP.regular

                        return (
                          <tr key={r.id}>
                            <td className="td-name">
                              <div className="td-name-group">
                                <span className={`td-status-dot ${displayStatus === 'verified' ? 'td-status-dot--green' : 'td-status-dot--yellow'}`} />
                                <span>{r.name}</span>
                              </div>
                            </td>
                            <td className="td-mono" style={{ color: 'var(--text-muted)' }}>{r.email || '—'}</td>
                            <td>{r.institution}</td>
                            <td className="td-mono" style={{ color: 'var(--text-muted)', letterSpacing: '0.08em' }}>{r.utr_number}</td>
                            <td>
                              {r.fee_tier && (
                                <span className={`badge ${tierInfo.className}`}>
                                  {tierInfo.label}
                                </span>
                              )}
                            </td>
                            <td>
                              <span className={`badge ${badgeInfo.className}`}>
                                <span className={`badge__dot ${displayStatus === 'verified' ? 'badge__dot--green' : 'badge__dot--yellow'}`} />
                                {badgeInfo.label}
                              </span>
                            </td>
                            <td className="td-mono" style={{ whiteSpace: 'nowrap' }}>
                              {r.submitted_at ? new Date(r.submitted_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: '2-digit' }) : '—'}
                            </td>
                            <td>
                              <div className="td-actions">
                                {displayStatus === 'verified' ? (
                                  <button className="btn btn--action btn--unverify" onClick={() => handleUnverify(r.id)}>Unverify</button>
                                ) : (
                                  <button className="btn btn--action btn--verify" onClick={() => handleVerify(r.id)}>Verify</button>
                                )}
                                <button className="btn--danger-action" onClick={() => handleDelete(r.id)}>Delete</button>
                                {r.screenshot_url && (
                                  <a href={r.screenshot_url.startsWith('http') ? r.screenshot_url : `${API_URL}${r.screenshot_url}`} target="_blank" rel="noopener noreferrer" className="btn btn--action btn--view">View Slip</a>
                                )}
                              </div>
                            </td>
                          </tr>
                        )
                      })
                    )}
                  </tbody>
                </table>

                {/* Table Footer */}
                <div className="table-footer">
                  <div>
                    Showing <span style={{ color: 'var(--text)', fontWeight: 600 }}>1-{filtered.length}</span> of <span style={{ color: 'var(--text)', fontWeight: 600 }}>{filtered.length}</span> attendees
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ── Event Settings ── */}
          {activeSection === 'event-settings' && (
            <div>
              {/* Ticket Pricing Card */}
              <div className="admin-card">
                <div className="admin-card__header">
                  <div className="admin-card__title-group">
                    <div className="admin-card__accent-bar admin-card__accent-bar--pink" />
                    <h3 className="admin-card__heading">Ticket Pricing</h3>
                  </div>
                  <div className="admin-card__live-badge">
                    <span className="admin-card__live-dot" />
                    <span>LIVE: {earlyBirdEnabled ? `₹${earlyBirdFee || '0'} (EARLY BIRD ACTIVE)` : `₹${regularFee || '0'} (REGULAR PHASE)`}</span>
                  </div>
                </div>

                {/* Early Bird Toggle */}
                <div className="toggle-row">
                  <div className="toggle-row__left">
                    <label className="toggle-switch">
                      <input
                        type="checkbox"
                        checked={earlyBirdEnabled}
                        onChange={handleToggleEarlyBird}
                      />
                      <span className="toggle-switch__slider" />
                    </label>
                    <div className="toggle-row__info">
                      <h4>{earlyBirdEnabled ? 'EARLY BIRD ACTIVE' : 'EARLY BIRD INACTIVE'}</h4>
                      <p>When toggled, early bird price takes precedence on the public checkout portal.</p>
                    </div>
                  </div>
                  <span className="toggle-row__phase">PHASE 01</span>
                </div>

                {pricingStatus.message && (
                  <div className={`alert alert--${pricingStatus.type === 'error' ? 'error' : 'success'}`}>
                    {pricingStatus.message}
                  </div>
                )}

                <div className="admin-form-grid admin-form-grid--3">
                  <div>
                    <label className="cyber-label" htmlFor="early-bird-fee">EARLY BIRD PRICE (₹)</label>
                    <div className="cyber-input-wrapper">
                      <span className="cyber-input-prefix">₹</span>
                      <input
                        className="cyber-input"
                        type="number"
                        id="early-bird-fee"
                        value={earlyBirdFee}
                        onChange={e => setEarlyBirdFee(e.target.value)}
                        placeholder="299"
                        min="0"
                        style={{ paddingLeft: 32 }}
                      />
                    </div>
                  </div>
                  <div>
                    <label className="cyber-label" htmlFor="regular-fee">REGULAR PRICE (₹)</label>
                    <div className="cyber-input-wrapper">
                      <span className="cyber-input-prefix" style={{ color: 'var(--text-muted)' }}>₹</span>
                      <input
                        className="cyber-input"
                        type="number"
                        id="regular-fee"
                        value={regularFee}
                        onChange={e => setRegularFee(e.target.value)}
                        placeholder="499"
                        min="0"
                        style={{ paddingLeft: 32 }}
                      />
                    </div>
                  </div>
                </div>

                <div className="admin-card__actions">
                  <button
                    className="btn--cyber-primary"
                    onClick={handlePricingSave}
                    disabled={pricingSaving}
                  >
                    {pricingSaving ? <><span className="spinner" /> SAVING...</> : '[ SAVE PRICING ]'}
                  </button>
                </div>
              </div>

              {/* Event Information Card */}
              <div className="admin-card">
                <div className="admin-card__header">
                  <div className="admin-card__title-group">
                    <div className="admin-card__accent-bar admin-card__accent-bar--cyan" />
                    <h3 className="admin-card__heading">Event Information</h3>
                  </div>
                </div>

                {eventStatus.message && (
                  <div className={`alert alert--${eventStatus.type === 'error' ? 'error' : 'success'}`}>
                    {eventStatus.message}
                  </div>
                )}

                <form onSubmit={handleEventSave}>
                  <div className="admin-form-grid admin-form-grid--2">
                    <div>
                      <label className="cyber-label" htmlFor="event-date">EVENT DATE</label>
                      <input
                        className="cyber-input"
                        type="text"
                        id="event-date"
                        value={eventDate}
                        onChange={e => setEventDate(e.target.value)}
                        placeholder="e.g. 10-10-2026"
                      />
                    </div>
                    <div>
                      <label className="cyber-label" htmlFor="event-venue">EVENT VENUE</label>
                      <input
                        className="cyber-input"
                        type="text"
                        id="event-venue"
                        value={eventVenue}
                        onChange={e => setEventVenue(e.target.value)}
                        placeholder="e.g. CUSAT, KOCHI"
                      />
                    </div>
                  </div>
                  <div className="admin-card__actions">
                    <button
                      type="submit"
                      className="btn--cyber-primary"
                      disabled={eventSaving}
                    >
                      {eventSaving ? <><span className="spinner" /> SAVING...</> : '[ SAVE EVENT INFO ]'}
                    </button>
                  </div>
                </form>
              </div>

              {/* Payment Display & QR Code Card */}
              <div className="admin-card">
                <div className="admin-card__header">
                  <div className="admin-card__title-group">
                    <div className="admin-card__accent-bar admin-card__accent-bar--purple" />
                    <h3 className="admin-card__heading">Payment Display & UPI QR Code</h3>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-muted)' }}>QR Status:</span>
                    <span style={{
                      padding: '2px 8px',
                      borderRadius: 4,
                      fontFamily: 'var(--font-mono)',
                      fontSize: 11,
                      fontWeight: 700,
                      background: activeQrFilename ? 'rgba(52, 211, 153, 0.2)' : 'rgba(244, 63, 94, 0.2)',
                      color: activeQrFilename ? '#6EE7B7' : '#FCA5A5',
                      border: `1px solid ${activeQrFilename ? 'rgba(52, 211, 153, 0.4)' : 'rgba(244, 63, 94, 0.4)'}`
                    }}>
                      {activeQrFilename ? 'ENABLED' : 'DISABLED'}
                    </span>
                  </div>
                </div>

                <p className="helper-text" style={{ marginBottom: 16 }}>
                  Choose how payment information is presented to registrants on the public page, and upload or replace the active UPI QR code.
                </p>

                {qrStatus.message && (
                  <div className={`alert alert--${qrStatus.type === 'error' ? 'error' : 'success'}`}>
                    {qrStatus.message}
                  </div>
                )}

                {/* 3-Way Mode Toggle */}
                <label className="cyber-label" style={{ marginBottom: 8 }}>Display Mode on Registration Page</label>
                <div className="mode-selector">
                  <button
                    type="button"
                    className={`mode-btn ${paymentMode === 'bank' ? 'mode-btn--active' : ''}`}
                    onClick={() => handlePaymentModeChange('bank')}
                  >
                    Bank Details Only
                  </button>
                  <button
                    type="button"
                    className={`mode-btn ${paymentMode === 'qr' ? 'mode-btn--active' : ''}`}
                    onClick={() => handlePaymentModeChange('qr')}
                  >
                    QR Code Only
                  </button>
                  <button
                    type="button"
                    className={`mode-btn ${paymentMode === 'both' ? 'mode-btn--active' : ''}`}
                    onClick={() => handlePaymentModeChange('both')}
                  >
                    Both (QR + Bank)
                  </button>
                </div>

                {/* QR Management Panel */}
                <div className="qr-admin-panel">
                  <div>
                    {/* Bank fields */}
                    <form onSubmit={handleBankSave}>
                      {bankDetails.is_locked && (
                        <div style={{
                          background: 'rgba(255, 31, 157, 0.12)',
                          border: '1px solid var(--neon-pink)',
                          borderRadius: 6,
                          padding: '10px 14px',
                          marginBottom: 16,
                          display: 'flex',
                          alignItems: 'center',
                          gap: 10,
                          color: 'var(--neon-pink)',
                          fontSize: 12,
                          fontFamily: 'var(--font-mono)'
                        }}>
                          <span style={{ fontSize: 16 }}>🔒</span>
                          <span><strong>FINANCIAL LOCK ACTIVE:</strong> Bank details are hard-locked by server configuration (<code>LOCK_BANK_SETTINGS=true</code>). Editing via web interface is disabled.</span>
                        </div>
                      )}

                      <div className="admin-form-grid admin-form-grid--2" style={{ marginBottom: 16 }}>
                        <div>
                          <label className="cyber-label" htmlFor="bank-name">BANK NAME</label>
                          <input className="cyber-input" type="text" id="bank-name" value={bankDetails.bank_name} onChange={e => setBankDetails(prev => ({ ...prev, bank_name: e.target.value }))} placeholder="e.g. Federal Bank" maxLength={100} disabled={bankDetails.is_locked} />
                        </div>
                        <div>
                          <label className="cyber-label" htmlFor="account-holder">PAYEE ACCOUNT HOLDER</label>
                          <input className="cyber-input" type="text" id="account-holder" value={bankDetails.account_holder} onChange={e => setBankDetails(prev => ({ ...prev, account_holder: e.target.value }))} placeholder="e.g. SEDS CUSAT" maxLength={100} disabled={bankDetails.is_locked} />
                        </div>
                      </div>
                      <div className="admin-form-grid admin-form-grid--2" style={{ marginBottom: 16 }}>
                        <div>
                          <label className="cyber-label" htmlFor="account-number">ACCOUNT NUMBER</label>
                          <input className="cyber-input" type="text" id="account-number" value={bankDetails.account_number} onChange={e => setBankDetails(prev => ({ ...prev, account_number: e.target.value }))} placeholder="9 to 18 digits" maxLength={18} disabled={bankDetails.is_locked} />
                        </div>
                        <div>
                          <label className="cyber-label" htmlFor="ifsc-code">IFSC CODE</label>
                          <input className="cyber-input" type="text" id="ifsc-code" value={bankDetails.ifsc_code} onChange={e => setBankDetails(prev => ({ ...prev, ifsc_code: e.target.value.toUpperCase() }))} placeholder="e.g. FDRL0001234" maxLength={11} style={{ textTransform: 'uppercase' }} disabled={bankDetails.is_locked} />
                        </div>
                      </div>
                      <div className="admin-form-grid admin-form-grid--2" style={{ marginBottom: 16 }}>
                        <div>
                          <label className="cyber-label" htmlFor="branch-name">BRANCH</label>
                          <input className="cyber-input" type="text" id="branch-name" value={bankDetails.branch_name} onChange={e => setBankDetails(prev => ({ ...prev, branch_name: e.target.value }))} placeholder="e.g. CUSAT Campus" maxLength={100} disabled={bankDetails.is_locked} />
                        </div>
                      </div>

                      {!bankDetails.is_locked && (
                        <div style={{
                          marginBottom: 16,
                          padding: '12px 14px',
                          background: 'rgba(0, 240, 255, 0.05)',
                          border: '1px solid rgba(0, 240, 255, 0.25)',
                          borderRadius: 6
                        }}>
                          <label className="cyber-label" htmlFor="bank-confirm-password" style={{ color: 'var(--neon-cyan)', display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span>🔐</span> STEP-UP AUTH: CONFIRM ADMIN PASSWORD
                          </label>
                          <p style={{ fontSize: 11, color: 'var(--text-subtle)', marginBottom: 8 }}>
                            To prevent unauthorized tampering, re-enter your admin password to authorize changes to bank payment details.
                          </p>
                          <input
                            className="cyber-input"
                            type="password"
                            id="bank-confirm-password"
                            value={bankConfirmPassword}
                            onChange={e => setBankConfirmPassword(e.target.value)}
                            placeholder="Enter master password to authorize update"
                            autoComplete="current-password"
                          />
                        </div>
                      )}

                      {bankStatus.message && (
                        <div className={`alert alert--${bankStatus.type === 'error' ? 'error' : 'success'}`}>
                          {bankStatus.message}
                        </div>
                      )}

                      <div className="admin-card__actions" style={{ borderTop: '1px solid rgba(0,240,255,0.1)', paddingTop: 16 }}>
                        <button
                          type="submit"
                          className="btn--cyber-cyan"
                          disabled={bankSaving || bankDetails.is_locked || (!bankConfirmPassword && !bankDetails.is_locked)}
                        >
                          {bankSaving ? (
                            <><span className="spinner" /> SAVING...</>
                          ) : bankDetails.is_locked ? (
                            '🔒 [ BANK DETAILS LOCKED BY SERVER ]'
                          ) : (
                            '[ AUTHORIZE & UPDATE PAYMENT GATEWAY ]'
                          )}
                        </button>
                      </div>
                    </form>
                  </div>

                  {/* QR Preview column */}
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
                    <label className="cyber-label">{activeQrFilename ? 'Active QR Code' : 'Upload QR Code'}</label>
                    {activeQrFilename ? (
                      <>
                        <div className="qr-preview-box" style={{ background: '#fff', padding: 4, borderRadius: 8, border: '2px solid var(--neon-pink)' }}>
                          <img
                            src={`${API_URL}/api/payment/qr?t=${qrTimestamp}`}
                            alt="Active QR"
                            onError={e => { e.target.style.display = 'none' }}
                          />
                        </div>
                        <button
                          type="button"
                          onClick={handleQrRemove}
                          className="btn--danger-action"
                          style={{ width: '100%', padding: '8px 12px', fontSize: 11 }}
                        >
                          Remove QR
                        </button>
                      </>
                    ) : (
                      <div style={{
                        width: 150,
                        height: 150,
                        border: '1px dashed var(--border)',
                        borderRadius: 8,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        textAlign: 'center',
                        color: 'var(--text-subtle)',
                        fontSize: 11,
                        padding: 12
                      }}>
                        No QR Code currently set
                      </div>
                    )}

                    <form onSubmit={handleQrUpload} style={{ width: '100%' }}>
                      <input
                        type="file"
                        id="admin-qr-file"
                        accept="image/png, image/jpeg, image/jpg"
                        onChange={e => {
                          const f = e.target.files[0]
                          if (f) {
                            setQrUploadFile(f)
                            setQrUploadPreview(URL.createObjectURL(f))
                          } else {
                            setQrUploadFile(null)
                            setQrUploadPreview(null)
                          }
                        }}
                        style={{
                          width: '100%',
                          background: 'var(--bg-input)',
                          border: '1px solid var(--border)',
                          borderRadius: 4,
                          padding: '6px 8px',
                          color: 'var(--text)',
                          fontFamily: 'var(--font-mono)',
                          fontSize: 11
                        }}
                      />

                      {qrUploadPreview && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
                          <div style={{ width: 40, height: 40, background: '#fff', padding: 2, border: '1px solid var(--border)', borderRadius: 4 }}>
                            <img src={qrUploadPreview} alt="Upload preview" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                          </div>
                          <span style={{ fontSize: 11, color: 'var(--neon-cyan)', fontFamily: 'var(--font-mono)' }}>
                            Ready: {qrUploadFile?.name}
                          </span>
                        </div>
                      )}

                      <button
                        type="submit"
                        className="btn--cyber-primary"
                        style={{ width: '100%', marginTop: 8, fontSize: 11, padding: '8px 12px' }}
                        disabled={!qrUploadFile || qrUploading}
                      >
                        {qrUploading ? <><span className="spinner" /> UPLOADING...</> : (activeQrFilename ? '[ REPLACE QR ]' : '[ UPLOAD QR ]')}
                      </button>
                    </form>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}

export default Admin
