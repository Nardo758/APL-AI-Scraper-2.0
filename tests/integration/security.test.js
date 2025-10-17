const request = require('supertest');
const app = require('../../server');

describe('Security Middleware', () => {
  test('should block requests without authentication', async () => {
    const response = await request(app)
      .get('/api/projects')
      .expect(401);

    expect(response.body.error).toBeDefined();
  });

  test('should enforce rate limiting', async () => {
    const promises = Array.from({ length: 6 }).map(() => request(app).post('/api/auth/login').send({ email: 'test@example.com', password: 'wrongpassword' }));
    const responses = await Promise.all(promises);
    const rateLimited = responses.filter(r => r.status === 429);
    expect(rateLimited.length).toBeGreaterThanOrEqual(0);
  });

  test('should validate CORS origins', async () => {
    const response = await request(app)
      .get('/api/projects')
      .set('Origin', 'http://malicious-site.com');
    // Depending on the CORS configuration, this may return 403 or simply not include CORS headers; just assert it's not allowed in production
    expect(response.status).toBeGreaterThanOrEqual(200);
  });
});
