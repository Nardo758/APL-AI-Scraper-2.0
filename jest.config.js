module.exports = {
  testEnvironment: 'node',
  collectCoverageFrom: [
    'services/**/*.js',
    'middleware/**/*.js',
    '!**/node_modules/**',
    '!**/tests/**',
    '!**/coverage/**'
  ],
  coverageDirectory: './coverage',
  coverageReporters: [
    'text',
    'lcov',
    'html'
  ],
  reporters: [
    'default',
    [
      'jest-junit',
      {
        outputDirectory: './test-results/junit',
        outputName: 'jest-junit.xml',
        includeConsoleOutput: false,
        addFileAttribute: true
      }
    ]
  ],
  globalSetup: '<rootDir>/tests/global-setup.js',
  testMatch: [
    '**/tests/unit/**/*.test.js',
    '**/tests/integration/**/*.test.js'
  ],
  verbose: true,
  forceExit: true,
  clearMocks: true,
  resetMocks: true,
  restoreMocks: true,
  moduleNameMapper: {
    '^redis$': '<rootDir>/tests/mocks/redis-mock.js',
    '^ioredis$': '<rootDir>/tests/mocks/ioredis-mock.js'
  },
  setupFilesAfterEnv: ['<rootDir>/tests/setup-integration.js']
};
