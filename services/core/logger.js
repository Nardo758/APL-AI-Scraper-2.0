// services/core/logger.js
const logger = {
  info: (message, meta) => console.log(`[INFO] ${message}`, meta || ''),
  warn: (message, meta) => console.warn(`[WARN] ${message}`, meta || ''),
  error: (message, meta) => console.error(`[ERROR] ${message}`, meta || ''),
  debug: (message, meta) => console.debug(`[DEBUG] ${message}`, meta || '')
};

module.exports = logger;
const info = (msg, meta) => console.log('[INFO]', msg, meta || '');
const warn = (msg, meta) => console.warn('[WARN]', msg, meta || '');
const error = (msg, meta) => console.error('[ERROR]', msg, meta || '');
const debug = (msg, meta) => console.debug('[DEBUG]', msg, meta || '');

module.exports = { info, warn, error, debug };