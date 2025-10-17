// tests/setup.js
// Global test setup

// Set test environment
process.env.NODE_ENV = 'test';

// Increase timeout for CI environments
jest.setTimeout(30000);

// Global test utilities
global.testUser = {
  email: 'test@example.com',
  password: 'TestPass123!',
  firstName: 'Test',
  lastName: 'User'
};

// Console output suppression for cleaner test output in CI
console.warn = () => {};
console.info = () => {};
