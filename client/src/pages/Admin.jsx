import { useState, useEffect, useCallback } from 'react'
import { API_URL } from '../config'

const NAV_ITEMS = [
  { id: 'registrations', label: 'Registrations' },
  { id: 'event-settings', label: 'Event Settings' }
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
    branch_name: ''
  })
  const [bankSaving, setBankSaving] = useState(false)
  const [bankStatus, setBankStatus] = useState({ type: '', message: '' })

  // Payment Display & QR state
  const [paymentMode, setPaymentMode] = useState('bank') // 'qr' | 'bank' | 'both'
  const [activeQrFilename, setActiveQrFilename] = useState(null)
  const [qrUploadFile, setQrUploadFile] = useState(null)
  const [qrUploadPreview, setQrUploadPreview] = useState(null)
  const [qrUploading, setQrUploading] = useState(false)
  const [qrStatus, setQrStatus] = useState({ type: '', message: '' })

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
    try { await apiFetch('/api/admin/logout', { method: 'POST' }) } catch {}
    setLoggedIn(false)
    setCsrfToken('')
    setRegistrations([])
  }

  // Data loaders
  const loadRegistrations = useCallback(async () => {
    try {
      const res = await apiFetch('/api/admin/registrations')
      setRegistrations(await res.json())
    } catch {}
  }, [apiFetch])

  const loadPricing = useCallback(async () => {
    try {
      const res = await apiFetch('/api/admin/settings/pricing')
      const data = await res.json()
      setEarlyBirdFee(String(data.early_bird_fee || ''))
      setRegularFee(String(data.regular_fee || ''))
      setEarlyBirdEnabled(!!data.early_bird_enabled)
    } catch {}
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
        branch_name: data.branch_name || ''
      })
    } catch {}
  }, [apiFetch])

  const loadEventInfo = useCallback(async () => {
    try {
      const res = await apiFetch('/api/settings/event')
      const data = await res.json()
      setEventDate(data.event_date || '')
      setEventVenue(data.event_venue || '')
    } catch {}
  }, [apiFetch])

  const loadPaymentSettings = useCallback(async () => {
    try {
      const res = await apiFetch('/api/admin/settings/payment')
      const data = await res.json()
      if (data.payment_display_mode) setPaymentMode(data.payment_display_mode)
      setActiveQrFilename(data.qr_image_filename || null)
    } catch {}
  }, [apiFetch])

  useEffect(() => {
    if (loggedIn) { loadRegistrations(); loadPricing(); loadBankDetails(); loadEventInfo(); loadPaymentSettings() }
  }, [loggedIn, loadRegistrations, loadPricing, loadBankDetails, loadEventInfo, loadPaymentSettings])

  useEffect(() => {
    if (loggedIn && activeSection === 'event-settings') {
      loadPricing()
      loadBankDetails()
      loadEventInfo()
      loadPaymentSettings()
    }
  }, [loggedIn, activeSection, loadPricing, loadBankDetails, loadEventInfo, loadPaymentSettings])

  // Registration actions
  async function handleVerify(id) {
    try { await apiFetch(`/api/admin/registrations/${id}/verify`, { method: 'PATCH' }); loadRegistrations() } catch {}
  }
  async function handleUnverify(id) {
    try { await apiFetch(`/api/admin/registrations/${id}/unverify`, { method: 'PATCH' }); loadRegistrations() } catch {}
  }
  async function handleDelete(id) {
    if (!confirm('Delete this registration?')) return
    try { await apiFetch(`/api/admin/registrations/${id}`, { method: 'DELETE' }); loadRegistrations() } catch {}
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
    } catch {}
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
          branch_name: branch
        })
      })
      const data = await res.json()
      if (res.ok && data.success) {
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
             (r.utr_number && r.utr_number.includes(q))
    }
    return true
  })

  // ── Login Screen ──
  if (!loggedIn) {
    return (
      <div className="login-screen">
        <div className="login-card">
          <div className="login-card__brand">SPACEUP VOL 8</div>
          <div className="login-card__brand-sub">Admin Portal</div>
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
        <div className="sidebar__brand">SPACEUP VOL 8</div>
        <div className="sidebar__brand-sub">Admin</div>
        <nav>
          <ul className="sidebar__nav">
            {NAV_ITEMS.map(item => (
              <li key={item.id}>
                <a
                  href={`#${item.id}`}
                  className={`sidebar__nav-item ${activeSection === item.id ? 'sidebar__nav-item--active' : ''}`}
                  onClick={e => { e.preventDefault(); setActiveSection(item.id) }}
                >
                  {item.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
        <div className="sidebar__footer">
          <button className="btn btn--outline" style={{ width: '100%', fontSize: 14 }} onClick={handleLogout}>
            LOGOUT
          </button>
        </div>
      </aside>

      {/* Main */}
      <main className="admin-main">
        <div className="admin-header">
          <div>
            <h1>SPACEUP VOL 8 ADMIN</h1>
            <p className="admin-header__stats">
              {registrations.length} registrations
            </p>
          </div>
        </div>

        {/* ── Registrations ── */}
        {activeSection === 'registrations' && (
          <div className="section">
            <div className="section-header">
              <h2>Registrations</h2>
              <button className="btn btn--primary btn--export" onClick={handleExportCSV}>
                EXPORT CSV
              </button>
            </div>

            {/* Filter Bar */}
            <div className="filter-bar">
              <input
                type="text"
                className="filter-bar__search"
                placeholder="Search name, institution, UTR..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
              />
              <div className="filter-toggle">
                {['all', 'verified', 'pending'].map(v => (
                  <button
                    key={v}
                    className={`filter-toggle__btn ${activeFilter === v ? 'filter-toggle__btn--active' : ''}`}
                    onClick={() => setActiveFilter(v)}
                  >
                    {v.charAt(0).toUpperCase() + v.slice(1)}
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
                    <th>UTR</th>
                    <th>Tier</th>
                    <th>Status</th>
                    <th>Date</th>
                    <th>Actions</th>
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
                          <td style={{ fontWeight: 500 }}>{r.name}</td>
                          <td style={{ fontSize: 12 }}>{r.email || '—'}</td>
                          <td style={{ fontWeight: 500 }}>{r.institution}</td>
                          <td style={{ fontFamily: "'Courier New', monospace", fontSize: 12, letterSpacing: '0.02em' }}>{r.utr_number}</td>
                          <td>
                            {r.fee_tier && (
                              <span className={`badge ${tierInfo.className}`}>
                                {tierInfo.label}
                              </span>
                            )}
                          </td>
                          <td>
                            <span className={`badge ${badgeInfo.className}`}>
                              {badgeInfo.label}
                            </span>
                          </td>
                          <td style={{ whiteSpace: 'nowrap', fontSize: 12, color: 'var(--text-muted)' }}>
                            {r.submitted_at ? new Date(r.submitted_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: '2-digit' }) : '—'}
                          </td>
                          <td>
                            <div className="actions">
                              {displayStatus === 'verified' ? (
                                <button className="btn btn--action" onClick={() => handleUnverify(r.id)}>Unverify</button>
                              ) : (
                                <button className="btn btn--action" onClick={() => handleVerify(r.id)}>Verify</button>
                              )}
                              <button className="btn btn--danger-action" onClick={() => handleDelete(r.id)}>Delete</button>
                              {r.screenshot_url && (
                                <a href={r.screenshot_url.startsWith('http') ? r.screenshot_url : `${API_URL}${r.screenshot_url}`} target="_blank" rel="noopener noreferrer" className="btn btn--action">View</a>
                              )}
                            </div>
                          </td>
                        </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── Event Settings ── */}
        {activeSection === 'event-settings' && (
          <div className="section">
            {/* Pricing Card */}
            <div className="admin-card">
              <h3 className="admin-card__heading">Ticket Pricing</h3>
              
              {/* Early Bird Toggle */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
                <label className="toggle-switch" style={{ marginBottom: 0 }}>
                  <input
                    type="checkbox"
                    className="toggle-switch__input"
                    checked={earlyBirdEnabled}
                    onChange={handleToggleEarlyBird}
                  />
                  <span className="toggle-switch__slider"></span>
                  <span className="toggle-switch__label">Early Bird Active</span>
                </label>
                <span className="live-indicator">
                  <span className="live-indicator__dot"></span>
                  LIVE: {earlyBirdEnabled ? `₹${earlyBirdFee || '0'} (EARLY BIRD)` : `₹${regularFee || '0'} (REGULAR)`}
                </span>
              </div>

              {pricingStatus.message && (
                <div className={`alert alert--${pricingStatus.type === 'error' ? 'error' : 'success'}`} style={{ marginBottom: 16 }}>
                  {pricingStatus.message}
                </div>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '16px', marginBottom: '16px' }}>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label htmlFor="early-bird-fee">Early Bird Price (₹)</label>
                  <input
                    type="number"
                    id="early-bird-fee"
                    value={earlyBirdFee}
                    onChange={e => setEarlyBirdFee(e.target.value)}
                    placeholder="299"
                    min="0"
                    style={{ width: '100%' }}
                  />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label htmlFor="regular-fee">Regular Price (₹)</label>
                  <input
                    type="number"
                    id="regular-fee"
                    value={regularFee}
                    onChange={e => setRegularFee(e.target.value)}
                    placeholder="499"
                    min="0"
                    style={{ width: '100%' }}
                  />
                </div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button
                  className="btn btn--primary"
                  style={{ width: 'auto', padding: '10px 24px' }}
                  onClick={handlePricingSave}
                  disabled={pricingSaving}
                >
                  {pricingSaving ? <><span className="spinner" /> SAVING...</> : '[ SAVE PRICING ]'}
                </button>
              </div>
            </div>

            {/* Event Info Card */}
            <div className="admin-card">
              <h3 className="admin-card__heading">Event Information</h3>
              {eventStatus.message && (
                <div className={`alert alert--${eventStatus.type === 'error' ? 'error' : 'success'}`} style={{ marginBottom: 16 }}>
                  {eventStatus.message}
                </div>
              )}
              <form onSubmit={handleEventSave}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '16px' }}>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label htmlFor="event-date">Event Date</label>
                    <input
                      type="text"
                      id="event-date"
                      value={eventDate}
                      onChange={e => setEventDate(e.target.value)}
                      placeholder="e.g. November 15-16, 2026"
                    />
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label htmlFor="event-venue">Event Venue</label>
                    <input
                      type="text"
                      id="event-venue"
                      value={eventVenue}
                      onChange={e => setEventVenue(e.target.value)}
                      placeholder="e.g. Bengaluru, India"
                    />
                  </div>
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <button
                    type="submit"
                    className="btn btn--primary"
                    style={{ width: 'auto', padding: '10px 24px' }}
                    disabled={eventSaving}
                  >
                    {eventSaving ? <><span className="spinner" /> SAVING...</> : '[ SAVE EVENT INFO ]'}
                  </button>
                </div>
              </form>
            </div>

            {/* Payment Display & QR Code Card */}
            <div className="admin-card">
              <h3 className="admin-card__heading">Payment Display & UPI QR Code</h3>
              <p className="helper-text" style={{ marginBottom: 16 }}>
                Choose how payment information is presented to registrants on the public page, and upload or replace the active UPI QR code.
              </p>

              {qrStatus.message && (
                <div className={`alert alert--${qrStatus.type === 'error' ? 'error' : 'success'}`} style={{ marginBottom: 16 }}>
                  {qrStatus.message}
                </div>
              )}

              {/* 3-Way Mode Toggle */}
              <label style={{ display: 'block', marginBottom: 8, fontSize: 13, fontWeight: 600, color: 'var(--text-muted)' }}>
                Display Mode on Registration Page
              </label>
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
                  <label style={{ display: 'block', marginBottom: 8, fontSize: 13, fontWeight: 600, color: 'var(--text-muted)' }}>
                    Active QR Code
                  </label>
                  {activeQrFilename ? (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                      <div className="qr-preview-box">
                        <img
                          src={`${API_URL}/api/payment/qr?t=${Date.now()}`}
                          alt="Active QR"
                          onError={e => { e.target.style.display = 'none' }}
                        />
                      </div>
                      <button
                        type="button"
                        onClick={handleQrRemove}
                        className="btn btn--action btn--delete"
                        style={{ width: '100%', fontSize: 12, padding: '6px 12px' }}
                      >
                        Remove QR
                      </button>
                    </div>
                  ) : (
                    <div style={{
                      width: 150,
                      height: 150,
                      border: '1px dashed var(--border)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      textAlign: 'center',
                      color: 'var(--text-subtle)',
                      fontSize: 12,
                      padding: 12
                    }}>
                      No QR Code currently set
                    </div>
                  )}
                </div>

                <form onSubmit={handleQrUpload} className="qr-upload-area">
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--text-muted)' }}>
                    {activeQrFilename ? 'Replace Active QR Code' : 'Upload New QR Code'}
                  </label>
                  <p className="helper-text" style={{ marginTop: -6 }}>
                    Upload a square PNG or JPG image of your UPI QR code (max 2MB).
                  </p>

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
                      background: 'var(--bg-input)',
                      border: '1px solid var(--border)',
                      padding: '8px 12px',
                      color: 'var(--text)',
                      fontFamily: 'var(--font-body)',
                      fontSize: 13
                    }}
                  />

                  {qrUploadPreview && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 4 }}>
                      <div style={{ width: 50, height: 50, background: 'var(--qr-bg)', padding: 2, border: '1px solid var(--border)' }}>
                        <img src={qrUploadPreview} alt="Upload preview" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                      </div>
                      <span style={{ fontSize: 12, color: 'var(--accent-cyan)' }}>
                        Ready to upload: {qrUploadFile?.name}
                      </span>
                    </div>
                  )}

                  <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
                    <button
                      type="submit"
                      className="btn btn--primary"
                      style={{ width: 'auto', padding: '8px 20px' }}
                      disabled={!qrUploadFile || qrUploading}
                    >
                      {qrUploading ? <><span className="spinner" /> UPLOADING...</> : (activeQrFilename ? '[ REPLACE QR CODE ]' : '[ UPLOAD QR CODE ]')}
                    </button>
                  </div>
                </form>
              </div>
            </div>

            {/* Bank Details Card */}
            <div className="admin-card">
              <h3 className="admin-card__heading">Bank Transfer Details</h3>
              <p className="helper-text" style={{ marginBottom: 16 }}>
                Provide the organization's bank details for the registration payment page. Leave empty to hide.
              </p>
              {bankStatus.message && (
                <div className={`alert alert--${bankStatus.type === 'error' ? 'error' : 'success'}`} style={{ marginBottom: 16 }}>
                  {bankStatus.message}
                </div>
              )}
              <form onSubmit={handleBankSave}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '16px' }}>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label htmlFor="bank-name">Bank Name</label>
                    <input
                      type="text"
                      id="bank-name"
                      value={bankDetails.bank_name}
                      onChange={e => setBankDetails(prev => ({ ...prev, bank_name: e.target.value }))}
                      placeholder="e.g. Federal Bank"
                      maxLength={100}
                    />
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label htmlFor="account-holder">Account Holder</label>
                    <input
                      type="text"
                      id="account-holder"
                      value={bankDetails.account_holder}
                      onChange={e => setBankDetails(prev => ({ ...prev, account_holder: e.target.value }))}
                      placeholder="e.g. SEDS CUSAT"
                      maxLength={100}
                    />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '16px', marginBottom: '16px' }}>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label htmlFor="account-number">Account Number</label>
                    <input
                      type="text"
                      id="account-number"
                      value={bankDetails.account_number}
                      onChange={e => setBankDetails(prev => ({ ...prev, account_number: e.target.value }))}
                      placeholder="9 to 18 digits"
                      maxLength={18}
                    />
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label htmlFor="ifsc-code">IFSC Code</label>
                    <input
                      type="text"
                      id="ifsc-code"
                      value={bankDetails.ifsc_code}
                      onChange={e => setBankDetails(prev => ({ ...prev, ifsc_code: e.target.value.toUpperCase() }))}
                      placeholder="e.g. FDRL0001234"
                      maxLength={11}
                    />
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label htmlFor="branch-name">Branch Name</label>
                    <input
                      type="text"
                      id="branch-name"
                      value={bankDetails.branch_name}
                      onChange={e => setBankDetails(prev => ({ ...prev, branch_name: e.target.value }))}
                      placeholder="e.g. CUSAT Campus"
                      maxLength={100}
                    />
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 20 }}>
                  <button
                    type="submit"
                    className="btn btn--primary"
                    style={{ width: 'auto', padding: '10px 24px' }}
                    disabled={bankSaving}
                  >
                    {bankSaving ? <><span className="spinner" /> SAVING...</> : '[ SAVE BANK DETAILS ]'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}

export default Admin
