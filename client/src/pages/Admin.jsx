import { useState, useEffect, useCallback } from 'react'
import constants from '../../../shared/constants.json'
const { VALID_TEAMS, TEAM_LABELS } = constants

const NAV_ITEMS = [
  { id: 'registrations', label: 'Registrations' },
  { id: 'team-links', label: 'Team Links' }
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
    if (loggedIn) { loadRegistrations(); loadSlugs() }
  }, [loggedIn, loadRegistrations, loadSlugs])

  useEffect(() => {
    if (loggedIn && activeSection === 'team-links') {
      loadSlugs()
    }
  }, [loggedIn, activeSection, loadSlugs])

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
      </main>
    </div>
  )
}

export default Admin
