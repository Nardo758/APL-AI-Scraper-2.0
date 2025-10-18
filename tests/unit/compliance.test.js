const fs = require('fs');
const path = require('path');
const express = require('express');
const request = require('supertest');

const { requestLogger, compliancePolicy } = require('../../middleware/compliance');

describe('compliance middleware', () => {
  const logDir = path.join(process.cwd(), 'logs');
  beforeEach(() => {
    if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });
    // clear log file
    const lf = path.join(logDir, 'requests.log');
    if (fs.existsSync(lf)) fs.unlinkSync(lf);
  });

  test('requestLogger writes a log entry', async () => {
    const app = express();
    app.use(requestLogger);
    app.get('/ok', (req, res) => res.json({ ok: true }));

    const res = await request(app).get('/ok');
    expect(res.status).toBe(200);
    const lf = path.join(logDir, 'requests.log');
    const content = fs.readFileSync(lf, 'utf8');
    expect(content).toMatch(/"method":"GET"/);
  });

  test('compliancePolicy blocks /admin without header', async () => {
    const app = express();
    app.use(compliancePolicy);
    app.get('/admin/secret', (req, res) => res.json({ ok: true }));

    const res = await request(app).get('/admin/secret');
    expect(res.status).toBe(403);
  });

  test('compliancePolicy allows /admin with header', async () => {
    const app = express();
    app.use(compliancePolicy);
    app.get('/admin/secret', (req, res) => res.json({ ok: true }));

    const res = await request(app).get('/admin/secret').set('X-Admin', 'true');
    expect(res.status).toBe(200);
  });
});
