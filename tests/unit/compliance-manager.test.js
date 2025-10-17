// tests/unit/compliance-manager.test.js
const { ComplianceManager } = require('../../services/compliance-manager');

// Mock Redis
jest.mock('redis', () => ({
  createClient: jest.fn(() => ({
    connect: jest.fn(),
    quit: jest.fn(),
    on: jest.fn()
  }))
}));

jest.mock('rate-limiter-flexible');
jest.mock('../../core/logger');
jest.mock('../../core/supabase');

describe('ComplianceManager - Unit Tests', () => {
  let complianceManager;

  beforeEach(() => {
    complianceManager = new ComplianceManager();
  });

  test('should initialize without errors', () => {
    expect(complianceManager).toBeInstanceOf(ComplianceManager);
  });

  test('should extract domain from URL correctly', () => {
    expect(complianceManager.extractDomain('https://example.com/path')).toBe('example.com');
    expect(complianceManager.extractDomain('http://www.example.com')).toBe('example.com');
    expect(complianceManager.extractDomain('https://sub.domain.co.uk/page')).toBe('domain.co.uk');
  });

  test('should group compliance events by domain', () => {
    const events = [
      { domain: 'example.com', allowed: true },
      { domain: 'example.com', allowed: false },
      { domain: 'test.com', allowed: true },
      { domain: 'example.com', allowed: true }
    ];

    const grouped = complianceManager.groupByDomain(events);
    
    expect(grouped['example.com']).toEqual({
      total: 3,
      allowed: 2,
      blocked: 1
    });
    expect(grouped['test.com']).toEqual({
      total: 1,
      allowed: 1,
      blocked: 0
    });
  });

  test('should generate compliance recommendations', () => {
    const events = [
      { domain: 'example.com', allowed: false, reason: 'Disallowed by robots.txt' },
      { domain: 'example.com', allowed: false, reason: 'Rate limit exceeded' },
      { domain: 'test.com', allowed: true }
    ];

    const recommendations = complianceManager.generateRecommendations(events);
    
    expect(recommendations).toContainEqual(
      expect.objectContaining({
        type: 'robots_txt_violation',
        severity: 'high'
      })
    );
    
    expect(recommendations).toContainEqual(
      expect.objectContaining({
        type: 'rate_limiting', 
        severity: 'medium'
      })
    );
  });
});
