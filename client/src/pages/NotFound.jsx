import { Link } from 'react-router-dom'

function NotFound() {
  return (
    <div className="page-bg page-bg--center">
      <div className="form-card" style={{ textAlign: 'center', padding: '48px 32px' }}>
        <div className="card-header">
          <p className="card-header__eyebrow">SPACEUP VOL 8</p>
        </div>
        
        <div style={{ marginTop: '16px', marginBottom: '32px' }}>
          <h1 style={{ 
            fontFamily: 'var(--font-pixel)', 
            fontSize: '44px', 
            color: 'var(--accent-orange)',
            lineHeight: 1,
            marginBottom: '16px'
          }}>404</h1>
          <h2 style={{ 
            fontFamily: 'var(--font-pixel)', 
            fontSize: '16px', 
            color: 'var(--accent-tan)',
            marginBottom: '12px' 
          }}>PAGE NOT FOUND</h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '14px', lineHeight: '1.5', marginBottom: '24px' }}>
            The page you're looking for doesn't exist or has been moved.
          </p>
          <Link to="/register" className="btn btn--primary" style={{ width: 'auto', padding: '12px 32px', display: 'inline-flex' }}>
            [ REGISTER ]
          </Link>
        </div>
      </div>
    </div>
  )
}

export default NotFound
