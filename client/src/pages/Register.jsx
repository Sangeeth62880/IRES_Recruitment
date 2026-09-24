import { useState, useEffect } from 'react'
import { API_URL } from '../config'
import SU26Logo from '../assets/SU26logo.png'

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

function UploadIcon() {
  return (
    <svg width="24" height="24" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
    </svg>
  )
}

function Register() {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    institution: '',
    utr_number: ''
  })
  const [errors, setErrors] = useState({})
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [serverError, setServerError] = useState('')

  const [fee, setFee] = useState(null)
  const [feeTier, setFeeTier] = useState('regular')
  const [paymentMode, setPaymentMode] = useState('bank')
  const [qrImageUrl, setQrImageUrl] = useState(null)
  const [bankDetails, setBankDetails] = useState(null)
  const [copiedField, setCopiedField] = useState(null)

  const [screenshot, setScreenshot] = useState(null)
  const [previewUrl, setPreviewUrl] = useState(null)

  useEffect(() => {
    fetch(`${API_URL}/api/settings/fee`)
      .then(r => r.json())
      .then(data => {
        if (data.fee !== undefined) setFee(data.fee)
        if (data.tier) setFeeTier(data.tier)
      })
      .catch(() => {})

    fetch(`${API_URL}/api/settings/payment`)
      .then(r => r.json())
      .then(data => {
        if (data.payment_display_mode) setPaymentMode(data.payment_display_mode)
        if (data.qr_image_url) {
          setQrImageUrl(data.qr_image_url.startsWith('http') ? data.qr_image_url : `${API_URL}${data.qr_image_url}`)
        }
      })
      .catch(() => {})

    fetch(`${API_URL}/api/settings/bank`)
      .then(r => r.json())
      .then(data => {
        if (data && data.bank_name && data.account_holder && data.account_number && data.ifsc_code) {
          setBankDetails(data)
        }
      })
      .catch(() => {})
  }, [])

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
    if (!formData.email.trim()) errs.email = 'Email is required'
    if (!formData.phone.trim()) errs.phone = 'Phone number is required'
    if (!formData.institution.trim()) errs.institution = 'Institution / organization is required'
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
    fd.append('email', formData.email.trim())
    fd.append('phone', formData.phone.trim())
    fd.append('institution', formData.institution.trim())
    fd.append('utr_number', formData.utr_number.trim())
    if (screenshot) fd.append('screenshot', screenshot)

    try {
      const res = await fetch(`${API_URL}/api/register`, {
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
        <div className="page-bg__glow-top" aria-hidden="true" />
        <div className="page-bg__glow-left" aria-hidden="true" />
        <div className="page-bg__glow-right" aria-hidden="true" />
        <div className="form-card">
          <div className="form-card__gradient-bar" />
          <div className="form-card__content">
            <div className="card-header">
              <img src={SU26Logo} alt="SpaceUp 26 Volume 8" className="card-header__logo" />
              <div className="card-header__badge">
                <span className="card-header__badge-text">India's Biggest Space Unconference</span>
              </div>
            </div>
            <div className="success-screen">
              <AnimatedCheck />
              <h2>REGISTRATION CONFIRMED</h2>
              <p>Your spot has been reserved. We'll verify your payment and send confirmation to your email.</p>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // ── Form ──
  return (
    <div className="page-bg">
      <div className="page-bg__glow-top" aria-hidden="true" />
      <div className="page-bg__glow-left" aria-hidden="true" />
      <div className="page-bg__glow-right" aria-hidden="true" />

      <div className="form-card">
        <div className="form-card__gradient-bar" />
        <div className="form-card__content">

          {/* Header */}
          <header className="card-header">
            <div className="card-header__badge">
              <span className="card-header__badge-text">India's Biggest Space Unconference</span>
            </div>
            <img src={SU26Logo} alt="SpaceUp 26 Volume 8" className="card-header__logo" />
            <p className="card-header__subtitle">
              Reserve your spot — complete the payment transfer and submit your confirmation below.
            </p>

            {/* Dynamic Fee Badge */}
            {fee !== null && (
              <div className="card-header__fee-badge">
                <div className="card-header__fee-badge-glow" />
                <div className="card-header__fee-badge-inner">
                  <span className="card-header__fee-tier">
                    {feeTier === 'early_bird' ? '⚡ EARLY BIRD' : '🎟️ STANDARD'}
                  </span>
                  <span className="card-header__fee-amount">₹{fee}</span>
                </div>
              </div>
            )}
          </header>

          {/* ── Section 01: Payment & Transfer Details ── */}
          {(() => {
            const showQr = (paymentMode === 'qr' || paymentMode === 'both') && qrImageUrl;
            const showBank = (paymentMode === 'bank' || paymentMode === 'both') && bankDetails;
            if (!showQr && !showBank) return null;

            return (
              <section className="section-step">
                <div className="section-step__header">
                  <div className="section-step__header-left">
                    <span className="section-step__number section-step__number--purple">01</span>
                    <h2 className="section-step__title">Payment & Transfer Details</h2>
                  </div>
                  <span className="section-step__hint">UPI & NEFT/IMPS ACCEPTED</span>
                </div>

                {showBank && (
                  <div className="bank-panel">
                    <div className="bank-panel__rows">
                      <div className="bank-row">
                        <span className="bank-row__label">Bank</span>
                        <span className="bank-row__value">{bankDetails.bank_name}</span>
                      </div>
                      <div className="bank-row">
                        <span className="bank-row__label">Account Name</span>
                        <span className="bank-row__value">{bankDetails.account_holder}</span>
                      </div>
                      <div className="bank-row">
                        <span className="bank-row__label">Account Number</span>
                        <div className="bank-row__copy-group">
                          <span className="bank-row__value bank-row__value--mono">{bankDetails.account_number}</span>
                          <button
                            type="button"
                            onClick={() => handleCopy(bankDetails.account_number, 'account_number')}
                            className={`copy-btn ${copiedField === 'account_number' ? 'copy-btn--copied' : ''}`}
                          >
                            {copiedField === 'account_number' ? 'COPIED!' : 'COPY'}
                          </button>
                        </div>
                      </div>
                      <div className="bank-row">
                        <span className="bank-row__label">IFSC Code</span>
                        <div className="bank-row__copy-group">
                          <span className="bank-row__value bank-row__value--mono">{bankDetails.ifsc_code}</span>
                          <button
                            type="button"
                            onClick={() => handleCopy(bankDetails.ifsc_code, 'ifsc_code')}
                            className={`copy-btn ${copiedField === 'ifsc_code' ? 'copy-btn--copied' : ''}`}
                          >
                            {copiedField === 'ifsc_code' ? 'COPIED!' : 'COPY'}
                          </button>
                        </div>
                      </div>
                      {bankDetails.branch_name && (
                        <div className="bank-row">
                          <span className="bank-row__label">Branch</span>
                          <span className="bank-row__value">{bankDetails.branch_name}</span>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {showQr && (
                  <div className="qr-payment-card" style={{ marginTop: showBank ? 20 : 0 }}>
                    <div style={{ textAlign: 'center', padding: 20, background: '#fff', borderRadius: 8, display: 'inline-block' }}>
                      <img src={qrImageUrl} alt="UPI Payment QR Code" style={{ maxWidth: 200, height: 'auto' }} />
                    </div>
                    <p style={{ textAlign: 'center', fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-muted)', marginTop: 8 }}>SCAN TO PAY VIA UPI</p>
                  </div>
                )}
              </section>
            );
          })()}

          {/* ── Section 02: Attendee Details ── */}
          <section className="section-step">
            <div className="section-step__header">
              <div className="section-step__header-left">
                <span className="section-step__number section-step__number--pink">02</span>
                <h2 className="section-step__title">Attendee Details</h2>
              </div>
              <span className="section-step__hint" style={{ color: 'var(--text-muted)' }}>* All fields required</span>
            </div>

            {serverError && <div className="alert alert--error">{serverError}</div>}

            <form onSubmit={handleSubmit} noValidate>
              {/* Full Name */}
              <div className="form-group">
                <label htmlFor="reg-name">Full Name <span className="required">*</span></label>
                <input type="text" id="reg-name" name="name" value={formData.name} onChange={handleChange} placeholder="e.g. Neil Armstrong" />
                {errors.name && <p className="error-text">{errors.name}</p>}
              </div>

              {/* Email & Phone */}
              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="reg-email">Email Address <span className="required">*</span></label>
                  <input type="email" id="reg-email" name="email" value={formData.email} onChange={handleChange} placeholder="you@example.com" />
                  {errors.email && <p className="error-text">{errors.email}</p>}
                </div>
                <div className="form-group">
                  <label htmlFor="reg-phone">Phone Number <span className="required">*</span></label>
                  <input type="tel" id="reg-phone" name="phone" value={formData.phone} onChange={handleChange} placeholder="10-digit mobile number" />
                  {errors.phone && <p className="error-text">{errors.phone}</p>}
                </div>
              </div>

              {/* Institution */}
              <div className="form-group">
                <label htmlFor="reg-institution">Institution / Organization <span className="required">*</span></label>
                <input type="text" id="reg-institution" name="institution" value={formData.institution} onChange={handleChange} placeholder="e.g. CUSAT, IIT Bombay, ISRO" />
                {errors.institution && <p className="error-text">{errors.institution}</p>}
              </div>

              {/* UTR */}
              <div className="form-group">
                <div className="utr-label-row">
                  <label htmlFor="reg-utr" style={{ marginBottom: 0 }}>UTR / UPI Reference Number <span className="required">*</span></label>
                  <span className="utr-label-hint">12-Digit Reference</span>
                </div>
                <input type="text" id="reg-utr" name="utr_number" className="utr-input" value={formData.utr_number} onChange={handleChange} placeholder="12-digit UTR number from receipt" maxLength={12} />
                <p className="helper-text">
                  Found on GPay, PhonePe, Paytm, or net banking confirmation (e.g. 423871928371).
                </p>
                {errors.utr_number && <p className="error-text">{errors.utr_number}</p>}
              </div>

              {/* Screenshot Upload */}
              <div className="form-group">
                <label>Payment Screenshot <span className="required">*</span></label>
                <div className="drop-zone">
                  <input type="file" className="drop-zone__input" accept="image/*" onChange={handleFileChange} id="reg-screenshot" />
                  {!previewUrl ? (
                    <>
                      <div className="drop-zone__icon">
                        <UploadIcon />
                      </div>
                      <p className="drop-zone__text">Upload payment screenshot</p>
                      <p className="drop-zone__helper">Required: PNG, JPG, or JPEG (up to 5MB)</p>
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

              {/* Submit */}
              <div style={{ paddingTop: 8 }}>
                <button type="submit" className="btn btn--primary" disabled={submitting}>
                  {submitting ? <><span className="spinner" /> SUBMITTING...</> : (
                    <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                      <span>[ CONFIRM REGISTRATION ]</span>
                      <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path d="M14 5l7 7m0 0l-7 7m7-7H3" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" />
                      </svg>
                    </span>
                  )}
                </button>
              </div>
            </form>
          </section>

        </div>

        {/* Bottom HUD bar */}
        <div className="form-hud-bar">
          <div className="form-hud-bar__status">
            <span className="form-hud-bar__dot" />
            <span>SYSTEM READY • SPACEUP 2026</span>
          </div>
          <div className="form-hud-bar__hosted">
            HOSTED BY SPACEUP VOL 8 ORGANIZING COMMITTEE
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="page-footer" style={{ position: 'absolute', bottom: 0, left: 0, right: 0 }}>
        <p>© 2026 SpaceUp Volume 8. All rights reserved.</p>
      </footer>
    </div>
  )
}

export default Register
