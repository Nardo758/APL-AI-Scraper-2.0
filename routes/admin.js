const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const { checkDatabaseHealth, checkRedisHealth, checkSecurityHealth, checkScraperStatus } = require('../utils/health-checkers');

// Compliance Dashboard
router.get('/compliance-dashboard', async (req, res) => {
  try {
    const logDir = path.join(process.cwd(), 'logs');
    const complianceLogPath = path.join(logDir, 'compliance.log');
    const consentLogPath = path.join(logDir, 'consent.log');

    // Read compliance logs
    let complianceLogs = [];
    if (fs.existsSync(complianceLogPath)) {
      const content = fs.readFileSync(complianceLogPath, 'utf8');
      complianceLogs = content.trim().split('\n')
        .filter(line => line.trim())
        .map(line => {
          try {
            return JSON.parse(line);
          } catch (e) {
            return null;
          }
        })
        .filter(entry => entry)
        .slice(-100); // Last 100 entries
    }

    // Read consent logs
    let consentLogs = [];
    if (fs.existsSync(consentLogPath)) {
      const content = fs.readFileSync(consentLogPath, 'utf8');
      consentLogs = content.trim().split('\n')
        .filter(line => line.trim())
        .map(line => {
          try {
            return JSON.parse(line);
          } catch (e) {
            return null;
          }
        })
        .filter(entry => entry)
        .slice(-50); // Last 50 entries
    }

    // Generate statistics
    const stats = {
      totalRequests: complianceLogs.length,
      gdprRequests: complianceLogs.filter(log => log.gdprRelevant).length,
      dataProcessingRequests: complianceLogs.filter(log => log.dataProcessing).length,
      consentGiven: consentLogs.filter(log => log.consented).length,
      consentDenied: consentLogs.filter(log => !log.consented).length,
      recentActivity: complianceLogs.slice(-10)
    };

    res.json({
      statistics: stats,
      recentComplianceLogs: complianceLogs.slice(-20),
      recentConsentLogs: consentLogs.slice(-10)
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Data processing report
router.get('/data-processing-report', async (req, res) => {
  try {
    const { days = 30 } = req.query;
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - parseInt(days));

    const logDir = path.join(process.cwd(), 'logs');
    const complianceLogPath = path.join(logDir, 'compliance.log');

    let processingActivities = [];
    if (fs.existsSync(complianceLogPath)) {
      const content = fs.readFileSync(complianceLogPath, 'utf8');
      const logs = content.trim().split('\n')
        .filter(line => line.trim())
        .map(line => {
          try {
            return JSON.parse(line);
          } catch (e) {
            return null;
          }
        })
        .filter(entry => entry && new Date(entry.timestamp) >= cutoffDate);

      processingActivities = logs.filter(log => log.dataProcessing);
    }

    res.json({
      period: `${days} days`,
      totalDataProcessingActivities: processingActivities.length,
      activities: processingActivities.slice(-50), // Last 50 for detail
      breakdown: {
        byEndpoint: processingActivities.reduce((acc, log) => {
          acc[log.path] = (acc[log.path] || 0) + 1;
          return acc;
        }, {}),
        byMethod: processingActivities.reduce((acc, log) => {
          acc[log.method] = (acc[log.method] || 0) + 1;
          return acc;
        }, {})
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// User data deletion (Right to be Forgotten)
router.post('/delete-user-data', async (req, res) => {
  try {
    const { userId, reason } = req.body;

    if (!userId) {
      return res.status(400).json({ error: 'User ID is required' });
    }

    // Log the deletion request
    const { deleteUserData } = require('../middleware/compliance');
    await deleteUserData(userId);

    // In a full implementation, this would also:
    // - Delete from database
    // - Anonymize logs
    // - Notify third parties

    res.json({
      success: true,
      message: 'Data deletion request processed',
      userId: userId,
      reason: reason,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Consent management
router.get('/consent-records', async (req, res) => {
  try {
    const { userId } = req.query;
    const logDir = path.join(process.cwd(), 'logs');
    const consentLogPath = path.join(logDir, 'consent.log');

    let consentRecords = [];
    if (fs.existsSync(consentLogPath)) {
      const content = fs.readFileSync(consentLogPath, 'utf8');
      consentRecords = content.trim().split('\n')
        .filter(line => line.trim())
        .map(line => {
          try {
            return JSON.parse(line);
          } catch (e) {
            return null;
          }
        })
        .filter(entry => entry);
    }

    // Filter by user if specified
    if (userId) {
      const { ComplianceLogger } = require('../middleware/compliance');
      const logger = new ComplianceLogger();
      const hashedUserId = logger.hashUserId(userId);
      consentRecords = consentRecords.filter(record => record.userId === hashedUserId);
    }

    res.json({
      totalRecords: consentRecords.length,
      records: consentRecords.slice(-100) // Last 100 records
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Security dashboard
router.get('/security-overview', async (req, res) => {
  try {
    const { days = 30 } = req.query;
    const daysNum = require('../utils/parse-number').parseNumber(days, 30);
    // Implement a simple overview aggregation
    const recent = await req.services.privacy.generateComplianceReport(req.query.projectId, new Date(Date.now() - daysNum * 24 * 60 * 60 * 1000).toISOString(), new Date().toISOString());
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

// Scraper health check
router.get('/scraper-health', async (req, res) => {
  try {
    const scraper = await checkScraperStatus();
    res.json(scraper);
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
    const scraper = await checkScraperStatus();

    res.json({ database, redis, security, scraper });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;