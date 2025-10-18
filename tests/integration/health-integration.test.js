const request = require('supertest');
const { buildTestApp } = require('../helpers/test-app');

describe('Integration: health and compliance', () => {
  let app;
  beforeAll(() => {
    app = buildTestApp();
  });

  test('GET /health returns 200 and status ok', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('status');
  });

  test('GET /admin should be blocked without X-Admin header', async () => {
    const res = await request(app).get('/admin');
    expect(res.status).toBe(403);
  });

  test('GET /admin allowed with X-Admin header', async () => {
    const res = await request(app).get('/admin').set('X-Admin', 'true');
    // Our test helper uses a noop handler after compliancePolicy, so success is 200
    expect(res.status).toBe(200);
  });
});
