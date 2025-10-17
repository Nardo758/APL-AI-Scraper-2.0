// utils/env-detector.js
// Detects available services and returns appropriate environment hints
class EnvDetector {
  static hasSupabase() {
    return !!(process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY);
  }

  static hasRedis() {
    return !!process.env.REDIS_URL;
  }

  static isTest() {
    return process.env.NODE_ENV === 'test';
  }

  static isCI() {
    return process.env.CI === 'true' || process.env.CI === '1';
  }

  static getEnvironment() {
    if (this.isTest() && !this.hasSupabase()) {
      return 'test-stubbed';
    }
    if (this.isTest() && this.hasSupabase()) {
      return 'test-integration';
    }
    if (this.hasSupabase() && this.hasRedis()) {
      return 'production-ready';
    }
    return 'development';
  }
}

module.exports = EnvDetector;
