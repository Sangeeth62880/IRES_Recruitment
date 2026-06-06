import { useState, useEffect, useCallback, useRef } from 'react'
import constants from '../../../shared/constants.json'
const { VALID_TEAMS, TEAM_LABELS } = constants

const NAV_ITEMS = [
  { id: 'registrations', label: 'Registrations' },
  { id: 'team-links', label: 'Team Links' },
  { id: 'qr', label: 'QR Manager' },
  { id: 'sms', label: 'SMS Verify' }
]

const getBaseUrl = () => {
  let base = import.meta.env.DEV ? 'http://localhost:5173' : (import.meta.env.VITE_BASE_URL || window.location.origin);
  if (base.endsWith('/')) {
    base = base.slice(0, -1);
  }
  return base;
};

/**
 * Derive display status from verified + payment_status fields
 */
function getDisplayStatus(r) {
  if (r.verified) return 'verified'
  if (r.payment_status === 'matched') return 'matched'
  if (r.payment_status === 'amount_mismatch') return 'amount_mismatch'
  if (r.payment_status === 'not_found') return 'not_found'
  if (r.payment_status === 'duplicate_utr') return 'duplicate_utr'
  return 'pending'
}

const STATUS_BADGE_MAP = {
  verified:        { className: 'badge--verified',        label: 'Verified' },
  matched:         { className: 'badge--matched',         label: 'Matched' },
  amount_mismatch: { className: 'badge--amount-mismatch', label: 'Amt Mismatch' },
  not_found:       { className: 'badge--not-found',       label: 'Not Found' },
  duplicate_utr:   { className: 'badge--duplicate',       label: 'Duplicate' },
  pending:         { className: 'badge--pending',         label: 'Pending' },
}

function Admin() {
  const [loggedIn, setLoggedIn] = useState(false)
  const [password, setPassword] = useState('')
  const [loginError, setLoginError] = useState('')
  const [loggingIn, setLoggingIn] = useState(false)
  const [activeSection, setActiveSection] = useState('registrations')
  const [copiedTeam, setCopiedTeam] = useState(null)
  const [activeTeamFilter, setActiveTeamFilter] = useState('all')
  const [slugs, setSlugs] = useState({})

  const [registrations, setRegistrations] = useState([])
  const [qrUrl, setQrUrl] = useState(null)

  const [statementFile, setStatementFile] = useState(null)
  const [statementFileName, setStatementFileName] = useState('')
  const [statementResult, setStatementResult] = useState(null)
  const [statementLoading, setStatementLoading] = useState(false)
  const fileInputRef = useRef(null)

  const [smsText, setSmsText] = useState('')
  const [smsResult, setSmsResult] = useState(null)
  const [smsLoading, setSmsLoading] = useState(false)

  const [activeFilter, setActiveFilter] = useState('all')
  const [searchQuery, setSearchQuery] = useState('')

  const [registrationFee, setRegistrationFee] = useState(349)
  const [feeInput, setFeeInput] = useState('')
  const [feeSaving, setFeeSaving] = useState(false)

  const [qrIntact, setQrIntact] = useState(true)
  const [qrAuditLogs, setQrAuditLogs] = useState([])
  const [showQRConfirm, setShowQRConfirm] = useState(false)
  const [pendingQRFile, setPendingQRFile] = useState(null)
  const [qrUploading, setQrUploading] = useState(false)

  const apiFetch = useCallback(async (url, options = {}) => {
    const res = await fetch(url, { ...options, credentials: 'include' })
    if (res.status === 401) {
      setLoggedIn(false)
      setLoginError('Session expired. Please log in again.')
      throw new Error('Unauthorized')
    }
    return res
  }, [])

  // Auth
  async function handleLogin(e) {
    e.preventDefault()
    setLoginError('')
    setLoggingIn(true)
    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ password })
      })
      const data = await res.json()
      if (data.success) { setLoggedIn(true); setPassword('') }
      else { setLoginError(data.error || 'Incorrect password') }
    } catch { setLoginError('Network error') }
    finally { setLoggingIn(false) }
  }

  async function handleLogout() {
    try { await fetch('/api/admin/logout', { method: 'POST', credentials: 'include' }) } catch {}
    setLoggedIn(false)
    setRegistrations([])
    setQrUrl(null)
  }

  function handleCopy(slug) {
    const uniqueSlug = slugs[slug] || slug
    const url = `${getBaseUrl()}/register/${uniqueSlug}`
    navigator.clipboard.writeText(url)
      .then(() => {
        setCopiedTeam(slug)
        setTimeout(() => setCopiedTeam(null), 2000)
      })
      .catch(() => {})
  }

  // Data
  const loadRegistrations = useCallback(async () => {
    try {
      const res = await apiFetch('/api/admin/registrations')
      setRegistrations(await res.json())
    } catch {}
  }, [apiFetch])

  const loadQR = useCallback(async () => {
    try {
      const res = await fetch('/api/settings/qr')
      const data = await res.json()
      setQrUrl(data.qr_url)
    } catch {}
  }, [])

  const loadSlugs = useCallback(async () => {
    try {
      const res = await apiFetch('/api/admin/teams/slugs')
      setSlugs(await res.json())
    } catch {}
  }, [apiFetch])

  async function handleRegenerateSlug(slug) {
    if (!window.confirm(`Are you sure you want to regenerate the unique link for ${TEAM_LABELS[slug]}? The old link will stop working immediately!`)) {
      return
    }
    try {
      const res = await apiFetch('/api/admin/teams/slugs/regenerate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ team: slug })
      })
      const data = await res.json()
      if (data.success) {
        setSlugs(prev => ({ ...prev, [slug]: data.slug }))
      }
    } catch {}
  }

  const loadFee = useCallback(async () => {
    try {
      const res = await apiFetch('/api/admin/settings/fee')
      const data = await res.json()
      setRegistrationFee(data.fee)
      setFeeInput(String(data.fee))
    } catch {}
  }, [apiFetch])

  const loadQRIntegrity = useCallback(async () => {
    try {
      const res = await apiFetch('/api/admin/qr/verify')
      const data = await res.json()
      setQrIntact(data.intact)
    } catch {}
  }, [apiFetch])

  const loadQRAuditLogs = useCallback(async () => {
    try {
      const res = await apiFetch('/api/admin/qr/audit')
      const data = await res.json()
      setQrAuditLogs(data)
    } catch {}
  }, [apiFetch])

  useEffect(() => {
    if (loggedIn) { loadRegistrations(); loadQR(); loadFee(); loadSlugs() }
  }, [loggedIn, loadRegistrations, loadQR, loadFee, loadSlugs])

  useEffect(() => {
    if (loggedIn && activeSection === 'qr') {
      loadQRIntegrity()
      loadQRAuditLogs()
    }
    if (loggedIn && activeSection === 'team-links') {
      loadSlugs()
    }
  }, [loggedIn, activeSection, loadQRIntegrity, loadQRAuditLogs, loadSlugs])

  // QR
  function handleQRFileSelect(e) {
    const file = e.target.files[0]
    if (!file) return
    setPendingQRFile(file)
    setShowQRConfirm(true)
    e.target.value = ''
  }

  async function confirmQRUpload() {
    if (!pendingQRFile) return
    setQrUploading(true)
    const fd = new FormData()
    fd.append('qr_image', pendingQRFile)
    fd.append('confirm_change', 'YES_CHANGE_QR')
    try {
      const res = await apiFetch('/api/admin/settings/qr', { method: 'POST', body: fd })
      const data = await res.json()
      if (data.success) {
        setQrUrl(data.qr_url)
        loadQRIntegrity()
        loadQRAuditLogs()
      } else {
        alert(data.error || 'Failed to upload QR')
      }
    } catch {
      alert('Network error during upload')
    } finally {
      setQrUploading(false)
      setShowQRConfirm(false)
      setPendingQRFile(null)
    }
  }

  function cancelQRUpload() {
    setShowQRConfirm(false)
    setPendingQRFile(null)
  }

  // Fee
  async function handleFeeSave() {
    const val = parseInt(feeInput, 10)
    if (isNaN(val) || val <= 0) return
    setFeeSaving(true)
    try {
      const res = await apiFetch('/api/admin/settings/fee', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fee: val })
      })
      const data = await res.json()
      if (data.success) setRegistrationFee(data.fee)
    } catch {}
    finally { setFeeSaving(false) }
  }

  // Statement
  function handleFileSelect(e) {
    const file = e.target.files[0]
    if (file) {
      setStatementFile(file)
      setStatementFileName(file.name)
    }
  }

  async function handleStatementUpload() {
    if (!statementFile) return
    setStatementLoading(true)
    setStatementResult(null)
    const fd = new FormData()
    fd.append('statement', statementFile)
    try {
      const res = await apiFetch('/api/admin/verify/statement', { method: 'POST', body: fd })
      const data = await res.json()
      setStatementResult(data)
      // Refresh registrations to pick up payment_status + flagged updates
      loadRegistrations()
    } catch {}
    finally { setStatementLoading(false) }
  }

  async function handleBulkApprove(ids) {
    if (!ids || ids.length === 0) return
    try {
      const res = await apiFetch('/api/admin/verify/bulk-approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids })
      })
      const data = await res.json()
      if (data.success) {
        loadRegistrations()
      }
    } catch {}
  }

  // SMS
  async function handleSmsVerify() {
    if (!smsText.trim()) return
    setSmsLoading(true)
    setSmsResult(null)
    try {
      const res = await apiFetch('/api/admin/verify/sms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sms_text: smsText })
      })
      const data = await res.json()
      setSmsResult(data)
      if (data.success) loadRegistrations()
    } catch {}
    finally { setSmsLoading(false) }
  }

  // Actions
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

  // Filter registrations
  const filtered = registrations.filter(r => {
    const status = getDisplayStatus(r)

    if (activeFilter === 'verified' && status !== 'verified') return false
    if (activeFilter === 'pending' && status !== 'pending') return false
    if (activeFilter === 'flagged' && !r.flagged) return false
    if (activeFilter === 'duplicate' && status !== 'duplicate_utr') return false

    if (activeTeamFilter !== 'all') {
      const teamVal = r.team_selected || 'General';
      if (teamVal !== activeTeamFilter) return false;
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      return (r.name && r.name.toLowerCase().includes(q)) || (r.utr_number && r.utr_number.includes(q))
    }
    return true
  })

  // Counts for stats
  const verifiedCount = registrations.filter(r => r.verified).length
  const pendingCount = registrations.filter(r => !r.verified).length
  const flaggedCount = registrations.filter(r => r.flagged).length

  // Matched rows (for Approve All Matched button)
  const matchedRows = registrations.filter(r => getDisplayStatus(r) === 'matched')

  // Statement result summary counts
  const stMatchedCount = statementResult?.results?.filter(r => r.status === 'matched').length || 0
  const stMismatchCount = statementResult?.results?.filter(r => r.status === 'amount_mismatch').length || 0
  const stNotFoundCount = statementResult?.results?.filter(r => r.status === 'not_found').length || 0
  const stDuplicateCount = statementResult?.results?.filter(r => r.status === 'duplicate_utr').length || 0

  // Build duplicate lookup from registrations data (for inline warnings in table)
  const utrDuplicateMap = {}
  registrations.forEach(r => {
    if (r.payment_status === 'duplicate_utr' && r.utr_number) {
      const utr = r.utr_number.trim()
      if (!utrDuplicateMap[utr]) utrDuplicateMap[utr] = []
      utrDuplicateMap[utr].push({ id: r.id, name: r.name })
    }
  })

  // ════════════════════════════════════
  //  LOGIN
  // ════════════════════════════════════
  if (!loggedIn) {
    return (
      <div className="login-screen">
        <div className="login-card">
          <div className="login-card__logos">
            <img src="/seds_logo.png" alt="SEDS CUSAT Logo" className="login-card__logo-seds" />
            <div className="login-card__logo-divider"></div>
            <img src="/ires_logo.png" alt="IRES Logo" className="login-card__logo-ires" />
          </div>
          <h2>Admin Access</h2>
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
              {loggingIn ? <><span className="spinner" /> Entering...</> : 'Enter'}
            </button>
          </form>
        </div>
      </div>
    )
  }

  // ════════════════════════════════════
  //  DASHBOARD
  // ════════════════════════════════════
  return (
    <div className="admin-layout">
      {/* Sidebar */}
      <aside className="sidebar">
        <div className="sidebar__logos">
          <img src="/seds_logo.png" alt="SEDS CUSAT Logo" className="sidebar__logo-seds" />
          <div className="sidebar__logo-divider"></div>
          <img src="/ires_logo.png" alt="IRES Logo" className="sidebar__logo-ires" />
        </div>
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
          <button className="btn btn--outline" style={{ width: '100%', fontSize: 12 }} onClick={handleLogout}>
            Logout
          </button>
        </div>
      </aside>

      {/* Main */}
      <main className="admin-main">
        <div className="admin-header">
          <div>
            <h1>Dashboard</h1>
            <p className="admin-header__stats">
              {registrations.length} registrations &middot; {verifiedCount} verified &middot; {pendingCount} pending
              {flaggedCount > 0 && (
                <> &middot; <span style={{ color: '#DC2626' }}>{flaggedCount} flagged</span></>
              )}
            </p>
          </div>
        </div>

        {/* ── Registrations ── */}
        {activeSection === 'registrations' && (
          <div className="section">
            {/* Section header with Export CSV + Approve All Matched */}
            <div className="section-header">
              <h2>Registrations</h2>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                {matchedRows.length > 0 && (
                  <button
                    className="btn btn--action"
                    style={{ background: '#DCFCE7', color: '#15803D', borderColor: '#86EFAC', padding: '7px 14px', fontSize: 12 }}
                    onClick={() => handleBulkApprove(matchedRows.map(r => r.id))}
                  >
                    Approve All Matched ({matchedRows.length})
                  </button>
                )}
                <button className="btn btn--primary btn--export" onClick={handleExportCSV}>
                  Export CSV
                </button>
              </div>
            </div>

            {/* Statement Upload Strip */}
            <div className="statement-strip">
              <input
                type="file"
                ref={fileInputRef}
                accept=".csv,.xlsx,.xls"
                style={{ display: 'none' }}
                onChange={handleFileSelect}
              />
              <button
                className="statement-strip__file-btn"
                onClick={() => fileInputRef.current?.click()}
              >
                📄 Choose Statement
              </button>
              <span className="statement-strip__filename">
                {statementFileName || 'No file selected'}
              </span>
              <button
                className="btn btn--primary"
                onClick={handleStatementUpload}
                disabled={!statementFile || statementLoading}
              >
                {statementLoading ? <><span className="spinner" /> Processing...</> : 'Upload & Verify'}
              </button>

              {/* Inline result summary after upload */}
              {statementResult && (
                <div className="statement-strip__summary">
                  {stMatchedCount > 0 && (
                    <span className="statement-strip__summary-item" style={{ color: '#15803D' }}>
                      {stMatchedCount} matched
                    </span>
                  )}
                  {stMismatchCount > 0 && (
                    <span className="statement-strip__summary-item" style={{ color: '#92400E' }}>
                      {stMismatchCount} mismatched
                    </span>
                  )}
                  {stNotFoundCount > 0 && (
                    <span className="statement-strip__summary-item" style={{ color: '#991B1B' }}>
                      {stNotFoundCount} not found
                    </span>
                  )}
                  {stDuplicateCount > 0 && (
                    <span className="statement-strip__summary-item" style={{ color: '#5B21B6' }}>
                      {stDuplicateCount} duplicate
                    </span>
                  )}
                </div>
              )}
            </div>

            {/* Filter Bar */}
            <div className="filter-bar">
              <input
                type="text"
                className="filter-bar__search"
                placeholder="Search by name or UTR..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
              />
              <div className="filter-toggle">
                {['all', 'verified', 'pending', 'flagged', 'duplicate'].map(v => (
                  <button
                    key={v}
                    className={`filter-toggle__btn ${activeFilter === v ? 'filter-toggle__btn--active' : ''}`}
                    onClick={() => setActiveFilter(v)}
                  >
                    {v.charAt(0).toUpperCase() + v.slice(1)}
                  </button>
                ))}
              </div>
              <select
                value={activeTeamFilter}
                onChange={e => setActiveTeamFilter(e.target.value)}
                style={{ width: 180, padding: '8px 12px', fontSize: 13, height: 38 }}
              >
                <option value="all">All Teams</option>
                <option value="General">General (No Link)</option>
                {VALID_TEAMS.map(t => (
                  <option key={t} value={TEAM_LABELS[t]}>{TEAM_LABELS[t]}</option>
                ))}
              </select>
            </div>

            {/* Registrations Table */}
            <div className="table-wrapper">
              <table>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Dept</th>
                    <th>Team</th>
                    <th>Year</th>
                    <th>UTR</th>
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

                      // Get duplicate names for inline warning
                      let duplicateNames = []
                      if (displayStatus === 'duplicate_utr' && r.utr_number) {
                        const utr = r.utr_number.trim()
                        const dupes = utrDuplicateMap[utr] || []
                        duplicateNames = dupes.filter(d => d.id !== r.id).map(d => d.name)
                      }

                      return (
                        <tr key={r.id} style={displayStatus === 'duplicate_utr' ? { background: '#FAF5FF' } : undefined}>
                          <td style={{ fontWeight: 500 }}>
                            {r.name}
                            {r.flagged && (
                              <span className="flag-indicator" title="Flagged — UTR not found in statement">⚑</span>
                            )}
                          </td>
                          <td>{r.department}</td>
                          <td style={{ fontWeight: 500 }}>{r.team_selected || 'General'}</td>
                          <td>{r.year}</td>
                          <td style={{ fontFamily: "'Courier New', monospace", fontSize: 12, letterSpacing: '0.02em' }}>{r.utr_number}</td>
                          <td>
                            <span className={`badge ${badgeInfo.className}`}>
                              {badgeInfo.label}
                            </span>
                          </td>
                          <td style={{ whiteSpace: 'nowrap', fontSize: 12, color: 'var(--text-muted)' }}>
                            {r.submitted_at ? new Date(r.submitted_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: '2-digit' }) : '\u2014'}
                          </td>
                          <td>
                            <div className="actions">
                              {displayStatus === 'matched' && (
                                <button
                                  className="btn btn--action"
                                  style={{ background: '#F0FDF4', color: '#15803D', borderColor: '#86EFAC' }}
                                  onClick={() => handleBulkApprove([r.id])}
                                >
                                  Approve
                                </button>
                              )}
                              {displayStatus === 'verified' && (
                                <button className="btn btn--action" onClick={() => handleUnverify(r.id)}>Unverify</button>
                              )}
                              {(displayStatus === 'pending' || displayStatus === 'not_found' || displayStatus === 'amount_mismatch') && (
                                <button className="btn btn--action" onClick={() => handleVerify(r.id)}>Verify</button>
                              )}
                              {displayStatus === 'duplicate_utr' && (
                                <button className="btn btn--action" onClick={() => handleVerify(r.id)}>Verify</button>
                              )}
                              <button className="btn btn--danger-action" onClick={() => handleDelete(r.id)}>Delete</button>
                              {r.screenshot_url && (
                                <a href={r.screenshot_url} target="_blank" rel="noopener noreferrer" className="btn btn--action">View</a>
                              )}
                              {displayStatus === 'duplicate_utr' && duplicateNames.length > 0 && (
                                <span style={{ fontSize: 11, color: '#5B21B6', fontStyle: 'italic', marginLeft: 2 }}>
                                  Dup w/ {duplicateNames.join(', ')}
                                </span>
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

        {activeSection === 'team-links' && (
          <div className="section">
            <div className="section-header">
              <h2>Team Links &amp; Security Settings</h2>
            </div>
            <div className="table-wrapper">
              <table>
                <thead>
                  <tr>
                    <th>Team</th>
                    <th>Registration URL</th>
                    <th style={{ width: 220 }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {VALID_TEAMS.map(slug => {
                    const label = TEAM_LABELS[slug]
                    const uniqueSlug = slugs[slug] || slug
                    const url = `${getBaseUrl()}/register/${uniqueSlug}`
                    return (
                      <tr key={slug}>
                        <td style={{ fontWeight: 500 }}>{label}</td>
                        <td style={{ fontFamily: 'monospace', fontSize: 13, color: 'var(--text-muted)' }}>
                          {url}
                        </td>
                        <td>
                          <div style={{ display: 'flex', gap: 8 }}>
                            <button
                              className="btn btn--action"
                              style={{ minWidth: 80 }}
                              onClick={() => handleCopy(slug)}
                            >
                              {copiedTeam === slug ? 'Copied!' : 'Copy Link'}
                            </button>
                            <button
                              className="btn btn--action"
                              style={{ border: '1px solid var(--error-light)', color: 'var(--error)' }}
                              onClick={() => handleRegenerateSlug(slug)}
                            >
                              Regenerate Link
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── QR Manager ── */}
        {activeSection === 'qr' && (
          <div className="section">
            {!qrIntact && (
              <div className="alert alert--error alert--warning-banner" style={{ marginBottom: 24, fontSize: 14 }}>
                <strong>WARNING:</strong> QR file integrity check failed. The file may have been tampered with. Re-upload immediately.
              </div>
            )}
            <div className="admin-card">
              <h3 className="admin-card__heading">QR Code Manager</h3>
              <div className="qr-admin-row">
                <div className="qr-admin-row__preview">
                  {qrUrl ? (
                    <img src={qrUrl + '?t=' + Date.now()} alt="Payment QR" />
                  ) : (
                    <div className="qr-admin-row__placeholder">No QR</div>
                  )}
                </div>
                <div className="qr-admin-row__upload">
                  <label htmlFor="qr-upload">Upload New QR Code</label>
                  <input type="file" id="qr-upload" accept="image/*" onChange={handleQRFileSelect} />
                  <p className="helper-text" style={{ marginTop: 8 }}>
                    This QR will be shown on the registration page for students to scan and pay.
                  </p>
                </div>
              </div>
            </div>

            <div className="admin-card">
              <h3 className="admin-card__heading">Registration Fee</h3>
              <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: 140 }}>
                  <label htmlFor="fee-input">Fee Amount (₹)</label>
                  <input
                    type="number"
                    id="fee-input"
                    value={feeInput}
                    onChange={e => setFeeInput(e.target.value)}
                    placeholder="349"
                    min="1"
                    style={{ width: '100%' }}
                  />
                  <p className="helper-text" style={{ marginTop: 4 }}>
                    This amount is used to verify payments in statement uploads. Current: ₹{registrationFee}
                  </p>
                </div>
                <button
                  className="btn btn--primary"
                  style={{ width: 'auto', padding: '10px 24px', marginBottom: 28 }}
                  onClick={handleFeeSave}
                  disabled={feeSaving || !feeInput || parseInt(feeInput, 10) === registrationFee}
                >
                  {feeSaving ? <><span className="spinner" /> Saving...</> : 'Save Fee'}
                </button>
              </div>
            </div>

            <div className="admin-card" style={{ marginTop: 24 }}>
              <h3 className="admin-card__heading">QR Code Change Audit Log</h3>
              <div className="table-container">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>IP Address</th>
                      <th>Previous File</th>
                      <th>New File</th>
                    </tr>
                  </thead>
                  <tbody>
                    {qrAuditLogs.length === 0 ? (
                      <tr>
                        <td colSpan="4" style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
                          No changes recorded yet.
                        </td>
                      </tr>
                    ) : (
                      qrAuditLogs.map(log => (
                        <tr key={log.id}>
                          <td>{new Date(log.changed_at).toLocaleString()}</td>
                          <td><code>{log.ip_address}</code></td>
                          <td style={{ color: 'var(--text-muted)', fontSize: 13 }}>
                            {log.previous_filename || 'Initial Upload'}
                          </td>
                          <td style={{ fontWeight: 500, fontSize: 13 }}>
                            {log.new_filename}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ── SMS ── */}
        {activeSection === 'sms' && (
          <div className="section">
            <div className="admin-card">
              <h3 className="admin-card__heading">SMS Verification</h3>
              <div className="form-group">
                <label htmlFor="sms-text">Paste SMS Text</label>
                <textarea
                  id="sms-text"
                  value={smsText}
                  onChange={e => setSmsText(e.target.value)}
                  placeholder="Paste the full SMS text containing the UTR or UPI Ref No..."
                />
              </div>
              <button
                className="btn btn--primary"
                style={{ width: 'auto', padding: '10px 24px' }}
                onClick={handleSmsVerify}
                disabled={!smsText.trim() || smsLoading}
              >
                {smsLoading ? <><span className="spinner" /> Verifying...</> : 'Verify from SMS'}
              </button>
              {smsResult && (
                <div className={`alert ${smsResult.success ? 'alert--success' : 'alert--error'}`} style={{ marginTop: 16 }}>
                  {smsResult.success
                    ? `Verified: ${smsResult.matched_name}`
                    : smsResult.error || 'Verification failed'}
                </div>
              )}
            </div>
          </div>
        )}
      </main>

      {showQRConfirm && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h4>Confirm QR Code Change</h4>
            <p>You are about to change the payment QR code. All future payments will go to the new UPI ID. Are you sure?</p>
            <div className="modal-actions">
              <button className="btn btn--outline" onClick={cancelQRUpload} disabled={qrUploading}>
                Cancel
              </button>
              <button className="btn btn--primary" onClick={confirmQRUpload} disabled={qrUploading}>
                {qrUploading ? 'Uploading...' : 'Yes, Change QR'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default Admin
