const express = require('express');
const router = express.Router();

// Simple public health/info endpoints used in tests
router.get('/info', (req, res) => {
  res.json({ name: 'APL AI Scraper', version: '2.0.0' });
});

router.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

module.exports = router;
