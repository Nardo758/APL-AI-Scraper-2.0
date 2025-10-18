const express = require('express');

function buildTestApp() {
  const app = express();
  app.use(express.json());

  // Mount compliance middleware and health route from the project
  const { requestLogger, compliancePolicy } = require('../../middleware/compliance');
  app.use(requestLogger);
  // Provide a simple admin handler so tests receive a real response after the policy
  app.use('/admin', compliancePolicy);
  app.get('/admin', (req, res) => res.json({ admin: true }));

  app.use('/', require('../../routes/health'));

  return app;
}

module.exports = { buildTestApp };
