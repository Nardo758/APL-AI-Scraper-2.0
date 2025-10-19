const request = require('supertest');
const app = require('../../server');

describe('GET /health', () => {
  it('returns overall health status and checks', async () => {
    const res = await request(app).get('/health');
    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty('status');
    expect(res.body).toHaveProperty('checks');
    expect(res.body.checks).toHaveProperty('database');
    expect(res.body.checks).toHaveProperty('redis');
    expect(res.body.checks).toHaveProperty('security');
  }, 10000);
});
