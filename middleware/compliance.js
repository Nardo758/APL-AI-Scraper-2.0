const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const logDir = path.join(process.cwd(), 'logs');
if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });

// GDPR/CCPA Compliance Logger
class ComplianceLogger {
  constructor(options = {}) {
    this.retentionDays = options.retentionDays || 2555; // ~7 years for GDPR
    this.logFile = path.join(logDir, 'compliance.log');
    this.consentLogFile = path.join(logDir, 'consent.log');
    this.cleanupInterval = options.cleanupInterval || 24 * 60 * 60 * 1000; // Daily cleanup

    // Start automatic log cleanup
    this.startLogCleanup();
  }

  // Enhanced request logger with GDPR compliance
  requestLogger(req, res, next) {
    const startTime = Date.now();
    const requestId = crypto.randomUUID();

    // Capture request details (anonymized where possible)
    const entry = {
      requestId,
      timestamp: new Date().toISOString(),
      method: req.method,
      path: this.anonymizePath(req.originalUrl || req.url),
      ip: this.anonymizeIP(req.ip || req.connection?.remoteAddress),
      userAgent: req.get('User-Agent'),
      consentGiven: req.get('X-Consent-Given') === 'true',
      dataProcessing: this.detectDataProcessing(req),
      gdprRelevant: this.isGDPRRelevant(req)
    };

    // Log the request
    fs.appendFileSync(this.logFile, JSON.stringify(entry) + '\n');

    // Override res.end to capture response time
    const originalEnd = res.end;
    res.end = (...args) => {
      entry.responseTime = Date.now() - startTime;
      entry.statusCode = res.statusCode;

      // Update the log entry with response info
      this.updateLogEntry(requestId, { responseTime: entry.responseTime, statusCode: res.statusCode });

      originalEnd.apply(res, args);
    };

    // Add request ID to response headers for tracking
    res.set('X-Request-ID', requestId);

    next();
  }

  // Anonymize sensitive path information
  anonymizePath(path) {
    // Remove or hash sensitive parameters
    return path.replace(/\/users\/[^/]+/g, '/users/[USER_ID]')
               .replace(/\/api\/keys\/[^/]+/g, '/api/keys/[KEY_ID]')
               .replace(/email=[^&]*/g, 'email=[EMAIL]')
               .replace(/password=[^&]*/g, 'password=[REDACTED]');
  }

  // Anonymize IP addresses (GDPR requirement)
  anonymizeIP(ip) {
    if (!ip) return 'unknown';
    // For GDPR, we can truncate IPv4 to /24 or IPv6 to /48
    if (ip.includes('.')) {
      // IPv4: keep first 3 octets
      return ip.split('.').slice(0, 3).join('.') + '.0';
    } else if (ip.includes(':')) {
      // IPv6: keep first 4 segments
      return ip.split(':').slice(0, 4).join(':') + '::';
    }
    return ip;
  }

  // Detect if request involves personal data processing
  detectDataProcessing(req) {
    const dataIndicators = [
      'email', 'name', 'phone', 'address', 'ssn', 'credit', 'personal'
    ];

    const path = req.originalUrl || req.url;
    const body = req.body ? JSON.stringify(req.body) : '';

    return dataIndicators.some(indicator =>
      path.toLowerCase().includes(indicator) ||
      body.toLowerCase().includes(indicator)
    );
  }

  // Check if request is GDPR relevant
  isGDPRRelevant(req) {
    // EU country codes (simplified)
    const euCountries = ['AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR', 'HU', 'IE', 'IT', 'LV', 'LT', 'LU', 'MT', 'NL', 'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE', 'GB'];

    const country = req.get('CF-IPCountry') || req.get('X-Country') || 'unknown';
    return euCountries.includes(country.toUpperCase());
  }

  // Update existing log entry
  updateLogEntry(requestId, updates) {
    try {
      const content = fs.readFileSync(this.logFile, 'utf8');
      const lines = content.trim().split('\n');

      for (let i = 0; i < lines.length; i++) {
        const entry = JSON.parse(lines[i]);
        if (entry.requestId === requestId) {
          Object.assign(entry, updates);
          lines[i] = JSON.stringify(entry);
          break;
        }
      }

      fs.writeFileSync(this.logFile, lines.join('\n') + '\n');
    } catch (error) {
      console.error('Failed to update log entry:', error);
    }
  }

  // Log user consent
  logConsent(userId, consentType, consented, details = {}) {
    const entry = {
      timestamp: new Date().toISOString(),
      userId: this.hashUserId(userId), // Hash for privacy
      consentType, // 'data_processing', 'marketing', 'analytics', etc.
      consented,
      details,
      ip: 'logged_separately', // IP logged in request logs
      userAgent: 'logged_separately'
    };

    fs.appendFileSync(this.consentLogFile, JSON.stringify(entry) + '\n');
  }

  // Hash user IDs for privacy
  hashUserId(userId) {
    return crypto.createHash('sha256').update(userId + 'salt').digest('hex');
  }

  // Data retention: delete old logs
  cleanupOldLogs() {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - this.retentionDays);

    try {
      // Clean up request logs
      this.cleanupFile(this.logFile, cutoffDate);

      // Clean up consent logs (may have different retention requirements)
      const consentRetentionDays = 2555; // Same as GDPR for consent
      const consentCutoff = new Date();
      consentCutoff.setDate(consentCutoff.getDate() - consentRetentionDays);
      this.cleanupFile(this.consentLogFile, consentCutoff);

      console.log('🧹 Cleaned up old compliance logs');
    } catch (error) {
      console.error('Failed to cleanup logs:', error);
    }
  }

  // Helper to clean up a specific file
  cleanupFile(filePath, cutoffDate) {
    if (!fs.existsSync(filePath)) return;

    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.trim().split('\n');
    const validLines = [];

    for (const line of lines) {
      try {
        const entry = JSON.parse(line);
        const entryDate = new Date(entry.timestamp);
        if (entryDate >= cutoffDate) {
          validLines.push(line);
        }
      } catch (e) {
        // Keep malformed lines
        validLines.push(line);
      }
    }

    fs.writeFileSync(filePath, validLines.join('\n') + (validLines.length > 0 ? '\n' : ''));
  }

  // Start automatic cleanup
  startLogCleanup() {
    setInterval(() => this.cleanupOldLogs(), this.cleanupInterval);
  }

  // Manual data deletion (right to be forgotten)
  async deleteUserData(userId) {
    const hashedUserId = this.hashUserId(userId);

    // This would need to be implemented with database access
    // For now, we'll log the deletion request
    console.log(`🗑️ Data deletion requested for user: ${hashedUserId}`);

    // In a full implementation, this would:
    // 1. Delete user data from database
    // 2. Anonymize logs
    // 3. Notify data processors
    // 4. Log the deletion event

    return { success: true, message: 'Data deletion logged' };
  }
}

// Create singleton instance
const complianceLogger = new ComplianceLogger();

// Middleware functions
function requestLogger(req, res, next) {
  return complianceLogger.requestLogger(req, res, next);
}

function logConsent(userId, consentType, consented, details) {
  return complianceLogger.logConsent(userId, consentType, consented, details);
}

function deleteUserData(userId) {
  return complianceLogger.deleteUserData(userId);
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
  logConsent,
  deleteUserData,
  ComplianceLogger
};
