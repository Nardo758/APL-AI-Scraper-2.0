// tests/global-setup.js
const fs = require('fs');
const path = require('path');

module.exports = async () => {
  // Create test result directories if they don't exist
  const testResultsDir = path.join(__dirname, '..', 'test-results');
  const junitDir = path.join(testResultsDir, 'junit');
  const eslintDir = path.join(testResultsDir, 'eslint');

  // Create directories recursively
  fs.mkdirSync(junitDir, { recursive: true });
  fs.mkdirSync(eslintDir, { recursive: true });

  console.log('Test directories created successfully');
};