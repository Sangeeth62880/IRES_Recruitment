import { useState, useEffect, useCallback } from 'react'
import constants from '../../../shared/constants.json'
const { VALID_TEAMS, TEAM_LABELS } = constants

const NAV_ITEMS = [
  { id: 'registrations', label: 'Registrations' },
  { id: 'team-links', label: 'Team Links' },
  { id: 'bank-settings', label: 'Bank Settings' }
]

const getBaseUrl = () => {
  let base = import.meta.env.DEV ? 'http://localhost:5173' : (import.meta.env.VITE_BASE_URL || window.location.origin);
  if (base.endsWith('/')) {
    base = base.slice(0, -1);
  }
  return base;
};

function getDisplayStatus(r) {
  return r.verified ? 'verified' : 'pending'
}

const STATUS_BADGE_MAP = {
  verified: { className: 'badge--verified', label: 'Verified' },
  pending:  { className: 'badge--pending',  label: 'Pending' }
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
  const [activeFilter, setActiveFilter] = useState('all')
  const [searchQuery, setSearchQuery] = useState('')

  const [registrationFee, setRegistrationFee] = useState(349)
  const [feeInput, setFeeInput] = useState('')
  const [feeSaving, setFeeSaving] = useState(false)
  const [bankDetails, setBankDetails] = useState({
    bank_name: '',
    account_holder: '',
    account_number: '',
    ifsc_code: '',
    branch_name: ''
  })
  const [bankSaving, setBankSaving] = useState(false)
  const [bankStatus, setBankStatus] = useState({ type: '', message: '' })

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

  const loadSlugs = useCallback(async () => {
    try {
      const res = await apiFetch('/api/admin/teams/slugs')
      setSlugs(await res.json())
    } catch {}
  }, [apiFetch])

  const loadFee = useCallback(async () => {
    try {
      const res = await apiFetch('/api/admin/settings/fee')
      const data = await res.json()
      setRegistrationFee(data.fee)
      setFeeInput(String(data.fee))
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

  useEffect(() => {
    if (loggedIn) { loadRegistrations(); loadSlugs(); loadFee(); loadBankDetails() }
  }, [loggedIn, loadRegistrations, loadSlugs, loadFee, loadBankDetails])

  useEffect(() => {
    if (loggedIn && activeSection === 'bank-settings') {
      loadBankDetails()
      loadFee()
    }
    if (loggedIn && activeSection === 'team-links') {
      loadSlugs()
    }
  }, [loggedIn, activeSection, loadSlugs, loadBankDetails, loadFee])

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

  // Fee Save
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

  // Bank Save
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

  // Filter registrations
  const filtered = registrations.filter(r => {
    const status = getDisplayStatus(r)

    if (activeFilter === 'verified' && status !== 'verified') return false
    if (activeFilter === 'pending' && status !== 'pending') return false

    if (activeTeamFilter !== 'all') {
      const teamVal = r.team_selected || 'General';
      if (teamVal !== activeTeamFilter) return false;
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      return (r.name && r.name.toLowerCase().includes(q)) || 
             (r.department && r.department.toLowerCase().includes(q)) || 
             (r.utr_number && r.utr_number.includes(q))
    }
    return true
  })

  // ── Login Screen ──
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

  // ── Dashboard ──
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
                Export CSV
              </button>
            </div>

            {/* Filter Bar */}
            <div className="filter-bar">
              <input
                type="text"
                className="filter-bar__search"
                placeholder="Search by name, dept, UTR..."
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

                      return (
                        <tr key={r.id}>
                          <td style={{ fontWeight: 500 }}>{r.name}</td>
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
                              {displayStatus === 'verified' ? (
                                <button className="btn btn--action" onClick={() => handleUnverify(r.id)}>Unverify</button>
                              ) : (
                                <button className="btn btn--action" onClick={() => handleVerify(r.id)}>Verify</button>
                              )}
                              <button className="btn btn--danger-action" onClick={() => handleDelete(r.id)}>Delete</button>
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

        {/* ── Team Links ── */}
        {activeSection === 'team-links' && (
          <div className="section">
            <div className="section-header">
              <h2>Team Links</h2>
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

        {/* ── Bank Settings ── */}
        {activeSection === 'bank-settings' && (
          <div className="section">
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
                    Current: ₹{registrationFee}
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
              <h3 className="admin-card__heading">Bank Transfer Details</h3>
              <p className="helper-text" style={{ marginBottom: 16 }}>
                Provide the organization's bank details. Leave these fields empty to hide/disable the Bank Transfer option on the public registration portal.
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
                    <label htmlFor="account-holder">Account Holder Name</label>
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
                    {bankSaving ? <><span className="spinner" /> Saving...</> : 'Save Bank Details'}
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
