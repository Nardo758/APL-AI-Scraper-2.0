const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const { AuthService } = require('../services/auth/auth-service');
const logger = require('../services/core/logger');

const authService = new AuthService();

function securityHeaders() {
  return helmet({
    contentSecurityPolicy: false
  });
}

function corsMiddleware() {
  const origin = process.env.FRONTEND_URL || '*';
  return cors({ origin, optionsSuccessStatus: 200 });
}

function createRateLimiter(options = {}) {
  return rateLimit({ windowMs: options.windowMs || 15 * 60 * 1000, max: options.max || 100, standardHeaders: true, legacyHeaders: false });
}

async function authenticate(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ error: 'missing_authorization' });
    const parts = authHeader.split(' ');
    if (parts.length !== 2 || parts[0] !== 'Bearer') return res.status(401).json({ error: 'invalid_authorization_format' });
    const token = parts[1];
    const payload = await authService.verifyToken(token, 'access');
    req.user = payload;
    next();
  } catch (err) {
    logger.warn('authenticate failed', { error: err.message });
    return res.status(401).json({ error: 'invalid_token' });
  }
}

function authorizeRole(requiredRole) {
  return (req, res, next) => {
    const user = req.user;
    if (!user) return res.status(401).json({ error: 'not_authenticated' });
    if (!user.roles || !user.roles.includes(requiredRole)) return res.status(403).json({ error: 'insufficient_permissions' });
    next();
  };
}

module.exports = { securityHeaders, corsMiddleware, createRateLimiter, authenticate, authorizeRole };