import { useState, useEffect } from 'react'
import { API_URL } from '../config'

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
        <div className="page-bg__cosmos" aria-hidden="true" />
        <div className="page-bg__scanlines" aria-hidden="true" />
        <div className="form-card">
          <div className="card-header">
            <p className="card-header__eyebrow">INDIA'S BIGGEST SPACE UNCONFERENCE</p>
            <h1 className="card-header__title" style={{ fontSize: 'clamp(20px, 4.5vw, 30px)', marginBottom: '16px' }}>SPACEUP VOL 8</h1>
          </div>
          <div className="success-screen">
            <AnimatedCheck />
            <h2>REGISTRATION CONFIRMED</h2>
            <p>Your spot has been reserved. We'll verify your payment and send confirmation to your email.</p>
          </div>
        </div>
      </div>
    )
  }

  // ── Form ──
  return (
    <div className="page-bg">
      <div className="page-bg__cosmos" aria-hidden="true" />
      <div className="page-bg__scanlines" aria-hidden="true" />
      <div className="form-card">
        {/* Header */}
        <div className="card-header">
          <p className="card-header__eyebrow">INDIA'S BIGGEST SPACE UNCONFERENCE</p>
          <h1 className="card-header__title">SPACEUP VOL 8</h1>
          <p className="card-header__subtitle">Reserve your spot — complete payment and register below</p>
          <hr className="card-header__rule" />
        </div>

        {/* Pricing Badge */}
        {fee !== null && (
          <div style={{ textAlign: 'center', marginBottom: '24px' }}>
            <div className={`pricing-badge ${feeTier === 'early_bird' ? 'pricing-badge--early-bird' : ''}`}>
              {feeTier === 'early_bird' ? '// EARLY BIRD PRICING' : '// REGISTRATION FEE'}
              {' '}<span className="pricing-badge__amount">₹{fee}</span>
            </div>
          </div>
        )}

        {/* Payment Display (QR / Bank / Both) */}
        {(() => {
          const showQr = (paymentMode === 'qr' || paymentMode === 'both') && qrImageUrl;
          const showBank = (paymentMode === 'bank' || paymentMode === 'both') && bankDetails;

          if (!showQr && !showBank) return null;

          return (
            <div className={`payment-display-container ${showQr && showBank ? 'payment-display-container--both' : ''}`}>
              {showQr && (
                <div className="qr-payment-card">
                  <div className="qr-payment-card__header">
                    <span className="qr-payment-card__label">UPI Payment</span>
                    {fee !== null && <span className="qr-payment-card__amount">₹{fee}</span>}
                  </div>
                  <div className="qr-payment-card__frame">
                    <img src={qrImageUrl} alt="UPI Payment QR Code" className="qr-payment-card__image" />
                  </div>
                  <p className="qr-payment-card__instruction">SCAN TO PAY VIA UPI</p>
                  <p className="qr-payment-card__subtext">Use GPay, PhonePe, Paytm or any UPI app</p>
                </div>
              )}

              {showBank && (
                <div className="bank-details-card" style={{ marginBottom: 0 }}>
                  <div className="bank-details-card__header">
                    <span className="bank-details-card__label">Bank Transfer Details</span>
                    {fee !== null && <span className="bank-details-card__amount">₹{fee}</span>}
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
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
                      <span style={{ display: 'flex', alignItems: 'center' }}>
                        <span className="bank-row__value bank-row__value--mono">{bankDetails.account_number}</span>
                        <button
                          type="button"
                          onClick={() => handleCopy(bankDetails.account_number, 'account_number')}
                          className={`copy-btn ${copiedField === 'account_number' ? 'copy-btn--copied' : ''}`}
                        >
                          {copiedField === 'account_number' ? 'COPIED' : 'COPY'}
                        </button>
                      </span>
                    </div>

                    <div className="bank-row">
                      <span className="bank-row__label">IFSC Code</span>
                      <span style={{ display: 'flex', alignItems: 'center' }}>
                        <span className="bank-row__value bank-row__value--mono">{bankDetails.ifsc_code}</span>
                        <button
                          type="button"
                          onClick={() => handleCopy(bankDetails.ifsc_code, 'ifsc_code')}
                          className={`copy-btn ${copiedField === 'ifsc_code' ? 'copy-btn--copied' : ''}`}
                        >
                          {copiedField === 'ifsc_code' ? 'COPIED' : 'COPY'}
                        </button>
                      </span>
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
            </div>
          );
        })()}

        {serverError && <div className="alert alert--error">{serverError}</div>}

        <form onSubmit={handleSubmit} noValidate>
          <div className="form-group">
            <label htmlFor="reg-name">Full Name</label>
            <input type="text" id="reg-name" name="name" value={formData.name} onChange={handleChange} placeholder="Enter your full name" />
            {errors.name && <p className="error-text">{errors.name}</p>}
          </div>

          <div className="form-row">
            <div className="form-group">
              <label htmlFor="reg-email">Email</label>
              <input type="email" id="reg-email" name="email" value={formData.email} onChange={handleChange} placeholder="you@example.com" />
              {errors.email && <p className="error-text">{errors.email}</p>}
            </div>

            <div className="form-group">
              <label htmlFor="reg-phone">Phone</label>
              <input type="tel" id="reg-phone" name="phone" value={formData.phone} onChange={handleChange} placeholder="10-digit mobile" />
              {errors.phone && <p className="error-text">{errors.phone}</p>}
            </div>
          </div>

          <div className="form-group">
            <label htmlFor="reg-institution">Institution / Organization</label>
            <input type="text" id="reg-institution" name="institution" value={formData.institution} onChange={handleChange} placeholder="e.g. CUSAT, IIT Bombay, ISRO" />
            {errors.institution && <p className="error-text">{errors.institution}</p>}
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
            {submitting ? <><span className="spinner" /> SUBMITTING...</> : '[ CONFIRM REGISTRATION ]'}
          </button>
        </form>
      </div>
    </div>
  )
}

export default Register
