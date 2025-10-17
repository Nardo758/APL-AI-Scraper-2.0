const express = require('express');
const router = express.Router();
const { checkDatabaseHealth, checkRedisHealth, checkSecurityHealth } = require('../utils/health-checkers');

// Security dashboard
router.get('/security-overview', async (req, res) => {
  try {
    const { days = 30 } = req.query;
    // Implement a simple overview aggregation
    const recent = await req.services.privacy.generateComplianceReport(req.query.projectId, new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString(), new Date().toISOString());
    res.json({ days, recent });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Force credential rotation
router.post('/rotate-credentials', async (req, res) => {
  try {
    const { userId, service } = req.body;
    await req.services.auth.forceCredentialRotation(userId, service);
    res.json({ success: true, message: 'Credentials rotated successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// System health check
router.get('/system-health', async (req, res) => {
  try {
    const database = await checkDatabaseHealth();
    const redis = await checkRedisHealth();
    const security = await checkSecurityHealth();

    res.json({ database, redis, security });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;