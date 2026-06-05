import { useState, useEffect } from 'react'

const TEAMS = ['Technical', 'Design', 'Management', 'Content', 'Outreach']
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
  const [qrUrl, setQrUrl] = useState(null)
  const [fee, setFee] = useState(349)
  const [formData, setFormData] = useState({
    name: '',
    department: '',
    year: '',
    utr_number: ''
  })
  const [screenshot, setScreenshot] = useState(null)
  const [previewUrl, setPreviewUrl] = useState(null)
  const [errors, setErrors] = useState({})
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [serverError, setServerError] = useState('')

  useEffect(() => {
    fetch('/api/settings/qr')
      .then(r => r.json())
      .then(data => { if (data.qr_url) setQrUrl(data.qr_url) })
      .catch(() => {})

    fetch('/api/settings/fee')
      .then(r => r.json())
      .then(data => { if (data.fee !== undefined) setFee(data.fee) })
      .catch(() => {})
  }, [])

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
    if (!formData.year) errs.year = 'Select your year'
    if (!formData.utr_number.trim()) {
      errs.utr_number = 'UTR number is required'
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
    Object.entries(formData).forEach(([key, val]) => fd.append(key, val.trim()))
    if (screenshot) fd.append('screenshot', screenshot)

    try {
      const res = await fetch('/api/register', { method: 'POST', body: fd })
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

        {/* QR */}
        <div className="qr-section">
          <p className="qr-section__label">Registration Fee</p>
          {qrUrl ? (
            <>
              <div className="qr-section__frame">
                <img src={qrUrl} alt="Payment QR Code" className="qr-section__image" />
              </div>
              <p className="qr-section__amount">&#8377;{fee}</p>
            </>
          ) : (
            <div className="qr-section__placeholder">QR not set</div>
          )}
        </div>

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
            <p className="helper-text">Find this in GPay &rarr; tap the transaction &rarr; UPI Ref No</p>
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
