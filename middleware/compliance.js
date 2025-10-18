const fs = require('fs');
const path = require('path');

const logDir = path.join(process.cwd(), 'logs');
if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });

function requestLogger(req, res, next) {
  const entry = {
    time: new Date().toISOString(),
    method: req.method,
    path: req.originalUrl || req.url,
    ip: req.ip || req.connection.remoteAddress,
  };
  fs.appendFileSync(path.join(logDir, 'requests.log'), JSON.stringify(entry) + '\n');
  next();
}

// Minimal compliance policy: block requests to /admin unless header X-Admin=true
function compliancePolicy(req, res, next) {
  // Determine the full path taking into account mounting (baseUrl) and originalUrl
  const fullPath = (req.baseUrl || '') + (req.path || '');
  const original = req.originalUrl || '';
  if (fullPath.startsWith('/admin') || original.startsWith('/admin') || req.path.startsWith('/admin')) {
    if (req.get('X-Admin') !== 'true') {
      return res.status(403).json({ error: 'Forbidden by compliance policy' });
    }
  }
  return next();
}

module.exports = {
  requestLogger,
  compliancePolicy,
};
