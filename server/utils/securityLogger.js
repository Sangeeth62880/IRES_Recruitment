/**
 * Security Event Logger
 * Strictly logs only event name, timestamp, client IP, and safe non-sensitive metadata.
 * 
 * SENSITIVITY REVIEW:
 * - NO passwords or credentials
 * - NO UTR numbers
 * - NO bank account or IFSC numbers
 * - NO session IDs or CSRF tokens
 * - NO file contents, buffers, or image data
 */

function logSecurityEvent(eventType, req, details = '') {
  const ip = (req && (req.ip || (req.socket && req.socket.remoteAddress))) || 'unknown';
  const timestamp = new Date().toISOString();
  const safeDetails = details ? ` - ${details}` : '';
  console.warn(`[SECURITY] [${timestamp}] [${eventType}] IP: ${ip}${safeDetails}`);
}

module.exports = { logSecurityEvent };
