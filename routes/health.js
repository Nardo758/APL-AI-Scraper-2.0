const express = require('express');
const router = express.Router();
const { checkDatabaseHealth, checkRedisHealth, checkSecurityHealth } = require('../utils/health-checkers');

router.get('/health', async (req, res) => {
  try {
    const [db, redis, security] = await Promise.all([
      checkDatabaseHealth(),
      checkRedisHealth(),
      checkSecurityHealth()
    ]);

    const overall = [db, redis, security].every(s => s && s.status === 'healthy') ? 'healthy' : 'degraded';

    res.json({
      status: overall,
      checks: { database: db, redis, security },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({ status: 'unhealthy', error: error.message });
  }
});

module.exports = router;
