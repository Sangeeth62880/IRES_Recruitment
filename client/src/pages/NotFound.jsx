import { Link } from 'react-router-dom'

function NotFound() {
  return (
    <div className="page-bg page-bg--center">
      <div className="form-card" style={{ textAlign: 'center', padding: '48px 32px' }}>
        <div className="card-header">
          <div className="card-header__logos" style={{ justifyContent: 'center', marginBottom: '16px' }}>
            <img src="/seds_logo.png" alt="SEDS CUSAT Logo" className="logo-seds" />
            <div className="logo-divider"></div>
            <img src="/ires_logo.png" alt="IRES Logo" className="logo-ires" />
          </div>
        </div>
        
        <div style={{ marginTop: '32px', marginBottom: '32px' }}>
          <h1 style={{ 
            fontSize: '72px', 
            margin: 0, 
            fontWeight: 800, 
            background: 'linear-gradient(135deg, var(--blue), var(--blue-dark))',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            lineHeight: 1
          }}>404</h1>
          <h2 style={{ fontSize: '20px', fontWeight: 600, marginTop: '16px', color: 'var(--text)' }}>Page Not Found</h2>
          <p style={{ color: 'var(--text-muted)', marginTop: '8px', fontSize: '14px', lineHeight: '1.5' }}>
            This page is invalid, expired, or doesn't exist. Please request a valid, unique recruitment link from your team coordinator.
          </p>
        </div>
      </div>
    </div>
  )
}

export default NotFound
