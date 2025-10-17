const express = require('express');
const router = express.Router();

// Data subject access request
router.post('/access-request', async (req, res) => {
  try {
    const result = await req.services.privacy.exportUserData(req.user.userId);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Data deletion request
router.post('/deletion-request', async (req, res) => {
  try {
    const { anonymize = false } = req.body;
    const result = await req.services.privacy.deleteUserData(req.user.userId, { anonymize, requester: req.user.userId });
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Compliance report
router.get('/compliance-report', async (req, res) => {
  try {
    const { startDate, endDate, projectId } = req.query;
    const result = await req.services.compliance.generateComplianceReport(projectId, startDate, endDate);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;