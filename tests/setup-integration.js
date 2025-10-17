// tests/setup-integration.js
// Mock external dependencies for integration tests
jest.mock('redis');
jest.mock('ioredis');
jest.mock('bullmq');

process.env.NODE_ENV = 'test';
process.env.REDIS_URL = 'redis://localhost:6379'; // Mock URL
