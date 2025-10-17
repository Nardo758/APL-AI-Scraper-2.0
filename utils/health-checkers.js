const { createClient } = require('@supabase/supabase-js');
const Redis = require('ioredis');

async function checkDatabaseHealth() {
  const start = Date.now();
  try {
    let supabase;
    try {
      const url = process.env.SUPABASE_URL;
      if (!url || url === 'your_supabase_url_here' || url.trim() === '') {
        supabase = require('../core/supabase').supabase;
      } else {
        supabase = createClient(url, process.env.SUPABASE_SERVICE_KEY);
      }
    } catch (e) {
      supabase = require('../core/supabase').supabase;
    }
    const { data, error } = await supabase.from('health_check').select('*').limit(1);
    return {
      status: error ? 'unhealthy' : 'healthy',
      responseTime: Date.now() - start,
      error: error?.message
    };
  } catch (error) {
    return { status: 'unhealthy', error: error.message };
  }
}

async function checkRedisHealth() {
  try {
    const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');
    const start = Date.now();
    await redis.ping();
    const responseTime = Date.now() - start;
    await redis.quit();
    return { status: 'healthy', responseTime };
  } catch (error) {
    return { status: 'unhealthy', error: error.message };
  }
}

async function checkSecurityHealth() {
  try {
    const checks = {
      https_enforced: process.env.NODE_ENV === 'production',
      cors_configured: !!process.env.ALLOWED_ORIGINS,
      rate_limiting_enabled: !!process.env.REDIS_URL,
      encryption_configured: !!process.env.ENCRYPTION_KEY
    };

    const allHealthy = Object.values(checks).every(Boolean);
    return { status: allHealthy ? 'healthy' : 'degraded', checks };
  } catch (error) {
    return { status: 'unhealthy', error: error.message };
  }
}

module.exports = { checkDatabaseHealth, checkRedisHealth, checkSecurityHealth };
