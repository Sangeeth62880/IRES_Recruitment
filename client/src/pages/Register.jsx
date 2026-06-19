import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import NotFound from './NotFound'
import constants from '../../../shared/constants.json'
const { VALID_TEAMS, TEAM_LABELS } = constants

const YEARS = ['1st', '2nd', '3rd', '4th']

function AnimatedCheck() {
  return (
    <div className="success-check">
      <svg viewBox="0 0 56 56">
        <circle cx="28" cy="28" r="26" />
        <polyline points="17 28 25 36 39 22" />
      </svg>
    </div>
  )
}

function Register() {
  const { team } = useParams()
  const [formData, setFormData] = useState({
    name: '',
    department: '',
    year: '',
    team_selected: '',
    utr_number: ''
  })
  const [isValidating, setIsValidating] = useState(false)
  const [isValidCode, setIsValidCode] = useState(true)
  const [errors, setErrors] = useState({})
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [serverError, setServerError] = useState('')

  const [fee, setFee] = useState(349)
  const [bankDetails, setBankDetails] = useState(null)
  const [copiedField, setCopiedField] = useState(null)

  const [screenshot, setScreenshot] = useState(null)
  const [previewUrl, setPreviewUrl] = useState(null)

  useEffect(() => {
    fetch('/api/settings/fee')
      .then(r => r.json())
      .then(data => { if (data.fee !== undefined) setFee(data.fee) })
      .catch(() => {})

    fetch('/api/settings/bank')
      .then(r => r.json())
      .then(data => {
        if (data && data.bank_name && data.account_holder && data.account_number && data.ifsc_code) {
          setBankDetails(data)
        }
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (team) {
      setIsValidating(true)
      fetch(`/api/register/verify-team?slug=${team}`)
        .then(r => r.json())
        .then(data => {
          if (data.success) {
            setIsValidCode(true)
            setFormData(prev => ({ ...prev, team_selected: data.label }))
          } else {
            setIsValidCode(false)
          }
        })
        .catch(() => {
          setIsValidCode(false)
        })
        .finally(() => {
          setIsValidating(false)
        })
    } else {
      setFormData(prev => ({ ...prev, team_selected: '' }))
      setIsValidCode(true)
    }
  }, [team])

  function handleCopy(text, field) {
    navigator.clipboard.writeText(text)
      .then(() => {
        setCopiedField(field)
        setTimeout(() => setCopiedField(null), 2000)
      })
      .catch(() => {})
  }

  function handleChange(e) {
    const { name, value } = e.target
    setFormData(prev => ({ ...prev, [name]: value }))
    if (errors[name]) {
      setErrors(prev => { const n = { ...prev }; delete n[name]; return n })
    }
  }

  function handleFileChange(e) {
    const file = e.target.files[0]
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        setErrors(prev => ({ ...prev, screenshot: 'File size exceeds the 5MB limit. Please upload a smaller image.' }))
        setScreenshot(null)
        setPreviewUrl(null)
        return
      }
      setScreenshot(file)
      setPreviewUrl(URL.createObjectURL(file))
      if (errors.screenshot) {
        setErrors(prev => { const n = { ...prev }; delete n.screenshot; return n })
      }
    } else {
      setScreenshot(null)
      setPreviewUrl(null)
    }
  }

  function validate() {
    const errs = {}
    if (!formData.name.trim()) errs.name = 'Full name is required'
    if (!formData.department.trim()) errs.department = 'Department is required'
    if (!formData.team_selected) errs.team_selected = 'Select your team'
    if (!formData.year) errs.year = 'Select your year'
    if (!formData.utr_number.trim()) {
      errs.utr_number = 'UTR / UPI Reference number is required'
    } else if (!/^\d{12}$/.test(formData.utr_number.trim())) {
      errs.utr_number = 'UTR must be exactly 12 digits'
    }
    if (!screenshot) {
      errs.screenshot = 'Payment screenshot is required'
    }
    return errs
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setServerError('')
    const errs = validate()
    if (Object.keys(errs).length > 0) { setErrors(errs); return }

    setSubmitting(true)
    const fd = new FormData()
    fd.append('name', formData.name.trim())
    fd.append('department', formData.department.trim())
    fd.append('year', formData.year.trim())
    fd.append('team_selected', formData.team_selected.trim())
    fd.append('utr_number', formData.utr_number.trim())
    if (screenshot) fd.append('screenshot', screenshot)

    try {
      const res = await fetch('/api/register', {
        method: 'POST',
        body: fd
      })
      const data = await res.json()
      if (data.success) {
        setSubmitted(true)
      } else {
        setServerError(data.error || 'Registration failed. Please try again.')
      }
    } catch {
      setServerError('Network error. Please check your connection.')
    } finally {
      setSubmitting(false)
    }
  }

  // ── Success ──
  if (submitted) {
    return (
      <div className="page-bg page-bg--center">
        <div className="form-card">
          <div className="card-header">
            <div className="card-header__logos">
              <img src="/seds_logo.png" alt="SEDS CUSAT Logo" className="logo-seds" />
              <div className="logo-divider"></div>
              <img src="/ires_logo.png" alt="IRES Logo" className="logo-ires" />
            </div>
          </div>
          <div className="success-screen">
            <AnimatedCheck />
            <h2>You're Registered</h2>
            <p>Your application has been submitted.</p>
          </div>
        </div>
      </div>
    )
  }

  // ── Loading state ──
  if (isValidating) {
    return (
      <div className="page-bg page-bg--center">
        <div className="form-card" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px' }}>
          <span className="spinner" style={{ width: '40px', height: '40px', border: '4px solid var(--blue-light)', borderTopColor: 'var(--blue)', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
          <p style={{ marginTop: '20px', color: 'var(--text-muted)', fontFamily: "'DM Sans', sans-serif" }}>Verifying registration link...</p>
        </div>
      </div>
    )
  }

  // ── Invalid Team link ──
  if (!isValidCode) {
    return <NotFound />
  }

  // ── Form ──
  return (
    <div className="page-bg">
      <div className="form-card">
        {/* Header */}
        <div className="card-header">
          <div className="card-header__logos">
            <img src="/seds_logo.png" alt="SEDS CUSAT Logo" className="logo-seds" />
            <div className="logo-divider"></div>
            <img src="/ires_logo.png" alt="IRES Logo" className="logo-ires" />
          </div>
          <h1 className="card-header__title">Recruitment 2026</h1>
          <p className="card-header__subtitle">Innovation Research and Exploration of Space</p>
          <hr className="card-header__rule" />
        </div>

        {/* Bank Transfer Details Section */}
        {bankDetails && (
          <div className="bank-details-card" style={{
            background: '#FFFFFF',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-lg)',
            padding: '20px',
            marginBottom: '24px',
            boxShadow: '0 4px 12px rgba(15, 23, 42, 0.03)',
            textAlign: 'left'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', borderBottom: '1px solid var(--blue-light)', paddingBottom: '12px' }}>
              <span style={{ fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-subtle)' }}>Payment Mode</span>
              <span style={{ fontSize: '18px', fontWeight: '850', color: 'var(--blue)' }}>&#8377;{fee}</span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Bank</span>
                <span style={{ fontSize: '14px', fontWeight: '600', color: 'var(--text)' }}>{bankDetails.bank_name}</span>
              </div>
              
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Account Name</span>
                <span style={{ fontSize: '14px', fontWeight: '600', color: 'var(--text)' }}>{bankDetails.account_holder}</span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Account Number</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '14px', fontFamily: "'Courier New', monospace", fontWeight: '700', color: 'var(--text)' }}>{bankDetails.account_number}</span>
                  <button
                    type="button"
                    onClick={() => handleCopy(bankDetails.account_number, 'account_number')}
                    style={{
                      padding: '4px 8px',
                      fontSize: '11px',
                      background: copiedField === 'account_number' ? 'var(--success)' : 'var(--blue-light)',
                      color: copiedField === 'account_number' ? '#FFFFFF' : 'var(--blue)',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      fontWeight: '600',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    {copiedField === 'account_number' ? 'Copied!' : 'Copy'}
                  </button>
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>IFSC Code</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '14px', fontFamily: "'Courier New', monospace", fontWeight: '700', color: 'var(--text)' }}>{bankDetails.ifsc_code}</span>
                  <button
                    type="button"
                    onClick={() => handleCopy(bankDetails.ifsc_code, 'ifsc_code')}
                    style={{
                      padding: '4px 8px',
                      fontSize: '11px',
                      background: copiedField === 'ifsc_code' ? 'var(--success)' : 'var(--blue-light)',
                      color: copiedField === 'ifsc_code' ? '#FFFFFF' : 'var(--blue)',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      fontWeight: '600',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    {copiedField === 'ifsc_code' ? 'Copied!' : 'Copy'}
                  </button>
                </div>
              </div>

              {bankDetails.branch_name && (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                  <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Branch</span>
                  <span style={{ fontSize: '14px', fontWeight: '500', color: 'var(--text)' }}>{bankDetails.branch_name}</span>
                </div>
              )}
            </div>
          </div>
        )}

        {serverError && <div className="alert alert--error">{serverError}</div>}

        <form onSubmit={handleSubmit} noValidate>
          <div className="form-group">
            <label htmlFor="reg-name">Full Name</label>
            <input type="text" id="reg-name" name="name" value={formData.name} onChange={handleChange} placeholder="Enter your full name" />
            {errors.name && <p className="error-text">{errors.name}</p>}
          </div>

          <div className="form-group">
            <label htmlFor="reg-department">Department</label>
            <input type="text" id="reg-department" name="department" value={formData.department} onChange={handleChange} placeholder="e.g. CSE, ECE, ME" />
            {errors.department && <p className="error-text">{errors.department}</p>}
          </div>

          {!team && (
            <div className="form-group">
              <label htmlFor="reg-team">Team</label>
              <select id="reg-team" name="team_selected" value={formData.team_selected} onChange={handleChange}>
                <option value="">Select team</option>
                {VALID_TEAMS.map(t => (
                  <option key={t} value={TEAM_LABELS[t]}>{TEAM_LABELS[t]}</option>
                ))}
              </select>
              {errors.team_selected && <p className="error-text">{errors.team_selected}</p>}
            </div>
          )}

          <div className="form-group">
            <label htmlFor="reg-year">Year</label>
            <select id="reg-year" name="year" value={formData.year} onChange={handleChange}>
              <option value="">Select year</option>
              {YEARS.map(y => <option key={y} value={y}>{y} Year</option>)}
            </select>
            {errors.year && <p className="error-text">{errors.year}</p>}
          </div>

          <div className="form-group">
            <label htmlFor="reg-utr">UTR / UPI Reference Number</label>
            <input type="text" id="reg-utr" name="utr_number" value={formData.utr_number} onChange={handleChange} placeholder="12-digit UTR number" maxLength={12} />
            <p className="helper-text">
              Enter the 12-digit UTR/UPI Reference number from your payment confirmation.
            </p>
            {errors.utr_number && <p className="error-text">{errors.utr_number}</p>}
          </div>

          <div className="form-group">
            <label>Payment Screenshot</label>
            <div className="drop-zone">
              <input type="file" className="drop-zone__input" accept="image/*" onChange={handleFileChange} id="reg-screenshot" />
              {!previewUrl ? (
                <>
                  <p className="drop-zone__text">Upload payment screenshot</p>
                  <p className="drop-zone__helper">Required (PNG, JPG, or JPEG up to 5MB)</p>
                </>
              ) : (
                <>
                  <div className="drop-zone__preview">
                    <img src={previewUrl} alt="Preview" />
                  </div>
                  <p className="drop-zone__filename">{screenshot?.name}</p>
                </>
              )}
            </div>
            {errors.screenshot && <p className="error-text">{errors.screenshot}</p>}
          </div>

          <button type="submit" className="btn btn--primary" disabled={submitting}>
            {submitting ? <><span className="spinner" /> Submitting...</> : 'Submit Registration'}
          </button>
        </form>
      </div>
    </div>
  )
}

export default Register
