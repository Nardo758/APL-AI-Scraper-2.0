const { createClient } = require('@supabase/supabase-js');
const Redis = require('ioredis');
const fs = require('fs');

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

    // Check database connectivity using existing scrape_jobs table
    const { data, error } = await supabase
      .from('scrape_jobs')
      .select('id')
      .limit(1);

    // Additional health metrics
    const metrics = {
      connectionTime: Date.now() - start,
      tablesAccessible: !error,
      recordCount: data ? data.length : 0
    };

    return {
      status: error ? 'unhealthy' : 'healthy',
      responseTime: Date.now() - start,
      metrics,
      error: error?.message,
      lastChecked: new Date().toISOString()
    };
  } catch (error) {
    return {
      status: 'unhealthy',
      error: error.message,
      lastChecked: new Date().toISOString()
    };
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

async function checkScraperStatus() {
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

    // Get job statistics from scrape_jobs table
    const { data: jobs, error } = await supabase
      .from('scrape_jobs')
      .select('status, created_at, updated_at')
      .order('created_at', { ascending: false })
      .limit(100);

    if (error) throw error;

    const now = new Date();
    const last24Hours = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    // Calculate metrics
    const totalJobs = jobs.length;
    const recentJobs = jobs.filter(job => new Date(job.created_at) > last24Hours);
    const statusCounts = jobs.reduce((acc, job) => {
      acc[job.status] = (acc[job.status] || 0) + 1;
      return acc;
    }, {});

    const successRate = totalJobs > 0 ? (statusCounts.completed || 0) / totalJobs : 0;
    const errorRate = totalJobs > 0 ? (statusCounts.failed || 0) / totalJobs : 0;

    // Check for stuck jobs (jobs that haven't been updated in the last hour)
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    const stuckJobs = jobs.filter(job =>
      job.status === 'processing' && new Date(job.updated_at) < oneHourAgo
    );

    const metrics = {
      totalJobs,
      jobsLast24Hours: recentJobs.length,
      successRate: Math.round(successRate * 100),
      errorRate: Math.round(errorRate * 100),
      stuckJobs: stuckJobs.length,
      statusBreakdown: statusCounts
    };

    return {
      status: stuckJobs.length > 5 ? 'warning' : 'healthy',
      responseTime: Date.now() - start,
      metrics,
      lastChecked: new Date().toISOString()
    };
  } catch (error) {
    return {
      status: 'unhealthy',
      error: error.message,
      lastChecked: new Date().toISOString()
    };
  }
}

async function checkSecurityHealth() {
  try {
    const issues = [];

    // Check environment variables
    const requiredEnvVars = ['SUPABASE_URL', 'SUPABASE_SERVICE_KEY', 'ENCRYPTION_KEY'];
    for (const envVar of requiredEnvVars) {
      if (!process.env[envVar] || process.env[envVar] === 'your_' + envVar.toLowerCase() + '_here') {
        issues.push(`Missing or placeholder ${envVar}`);
      }
    }

    // Check file permissions (basic check)
    const sensitiveFiles = ['.env', 'config/database.js'];
    for (const file of sensitiveFiles) {
      try {
        const stats = fs.statSync(file);
        if (stats.mode & 0o077) {
          issues.push(`${file} has overly permissive permissions`);
        }
      } catch (e) {
        // File doesn't exist, skip
      }
    }

    return {
      status: issues.length > 0 ? 'warning' : 'healthy',
      issues,
      lastChecked: new Date().toISOString()
    };
  } catch (error) {
    return { status: 'unhealthy', error: error.message };
  }
}

module.exports = { checkDatabaseHealth, checkRedisHealth, checkSecurityHealth, checkScraperStatus };
