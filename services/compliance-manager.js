let parseRobots;
let fetch;
let Redis;
let RateLimiterRedis;
try {
  parseRobots = require('robots-parser').parse;
} catch (e) {
  parseRobots = null;
}

try {
  fetch = require('node-fetch');
} catch (e) {
  fetch = null;
}

try {
  Redis = require('redis');
  ({ RateLimiterRedis } = require('rate-limiter-flexible'));
} catch (e) {
  Redis = null;
  RateLimiterRedis = null;
}
const logger = require('../core/logger');
const { supabase } = require('../core/supabase');
const { parseNumber } = require('../utils/parse-number');

class ComplianceManager {
  constructor() {
    this.robotsCache = new Map();
    // Initialize Redis client if available, otherwise provide a lightweight in-memory stub
    if (Redis && typeof Redis.createClient === 'function') {
      try {
        this.redis = Redis.createClient({ url: process.env.REDIS_URL || 'redis://localhost:6379' });
        // Support both promise-returning connect() and mocked sync connect() in tests
        // Prefer calling connect() if available and handle promise rejection safely
        if (this.redis && this.redis.connect) {
          this.redis.connect().catch(e => console.warn('Redis connect failed', e));
        }
      } catch (e) {
        console.warn('Redis initialization failed, using in-memory stub', e && e.message);
        this.redis = null;
      }
    }

    if (!this.redis) {
      // simple in-memory Redis-like stub for tests and environments without redis
      this._inMemoryStore = new Map();
      this.redis = {
        connect: async () => {},
        quit: async () => {},
        on: () => {},
        get: async (k) => this._inMemoryStore.has(k) ? this._inMemoryStore.get(k) : null,
        set: async (k, v) => { this._inMemoryStore.set(k, v); return 'OK'; },
        setex: async (k, ttl, v) => { this._inMemoryStore.set(k, v); return 'OK'; },
        del: async (k) => this._inMemoryStore.delete(k) ? 1 : 0,
        exists: async (k) => this._inMemoryStore.has(k) ? 1 : 0,
        llen: async () => 0,
        keys: async () => Array.from(this._inMemoryStore.keys()),
        ping: async () => 'PONG'
      };
    }

    this.setupRateLimiters();
  }

  setupRateLimiters() {
    // If RateLimiterRedis is available, use it; otherwise provide no-op limiters
    if (RateLimiterRedis) {
      this.domainLimiter = new RateLimiterRedis({
        storeClient: this.redis,
        points: 10,
        duration: 60,
        blockDuration: 300
      });

      this.ipLimiter = new RateLimiterRedis({
        storeClient: this.redis,
        points: 100,
        duration: 900,
        blockDuration: 1800
      });
    } else {
      // noop limiters that always allow
      const noop = { consume: async () => {} };
      this.domainLimiter = noop;
      this.ipLimiter = noop;
    }
  }

  extractDomain(url) {
    try {
      const hostname = new URL(url).hostname.replace(/^www\./, '');
      const parts = hostname.split('.');
      if (parts.length >= 3) {
        const last = parts[parts.length - 1];
        // Heuristic: if TLD looks like a ccTLD (2 letters), include one more label (e.g., domain.co.uk)
        if (last.length === 2 && parts.length >= 3) {
          return parts.slice(-3).join('.');
        }
        return parts.slice(-2).join('.');
      }
      return hostname;
    } catch (err) {
      return url;
    }
  }

  async getRobotsTxt(domain) {
    if (this.robotsCache.has(domain)) return this.robotsCache.get(domain);
    try {
      const robotsUrl = `https://${domain}/robots.txt`;
      const res = await fetch(robotsUrl, { headers: { 'User-Agent': 'APL-AI-Scraper-Compliance/1.0' }, timeout: 10000 });
      if (res.status === 200) {
        const txt = await res.text();
        const parsed = parseRobots ? parseRobots(robotsUrl, txt) : null;
        this.robotsCache.set(domain, parsed);
        setTimeout(() => this.robotsCache.delete(domain), 24 * 60 * 60 * 1000);
        return parsed;
      }
      this.robotsCache.set(domain, null);
      setTimeout(() => this.robotsCache.delete(domain), 24 * 60 * 60 * 1000);
      return null;
    } catch (err) {
      logger.warn('getRobotsTxt failed', { domain, error: err.message });
      return null;
    }
  }

  async checkCompliance(url, userAgent) {
    const domain = this.extractDomain(url);
    try {
      const robots = await this.getRobotsTxt(domain);
      if (!robots) return { allowed: true, reason: 'no robots' };
      const allowed = robots.isAllowed(url, userAgent);
      const crawlDelay = robots.getCrawlDelay(userAgent);
      return { allowed, crawlDelay };
    } catch (err) {
      logger.error('checkCompliance failed', { error: err.message, url });
      return { allowed: true, reason: 'error' };
    }
  }

  async respectCrawlDelay(domain, crawlDelay) {
    try {
      const key = `crawl_delay:${domain}`;
      const last = await this.redis.get(key);
      if (last) {
        const since = Date.now() - (parseNumber(last, 0) || 0);
        const needed = crawlDelay * 1000 - since;
        if (needed > 0) await new Promise(r => setTimeout(r, needed));
      }
      await this.redis.set(key, Date.now().toString());
    } catch (err) {
      logger.warn('respectCrawlDelay failed', { domain, error: err.message });
    }
  }

  async enforceRateLimits(domain, ip) {
    try {
      await this.domainLimiter.consume(domain);
      await this.ipLimiter.consume(ip);
      return { allowed: true };
    } catch (rejRes) {
      return { allowed: false, retryAfter: Math.ceil(rejRes.msBeforeNext / 1000) };
    }
  }

  async logComplianceEvent(event) {
    try {
      await supabase.from('compliance_events').insert([{ ...event, timestamp: new Date().toISOString() }]);
    } catch (err) {
      logger.error('logComplianceEvent failed', { error: err.message });
    }
  }

  async generateComplianceReport(projectId, startDate, endDate) {
    const { data: events } = await supabase.from('compliance_events').select('*').eq('project_id', projectId).gte('timestamp', startDate).lte('timestamp', endDate);
    const report = {
      summary: { total_requests: events.length, blocked_requests: events.filter(e => !e.allowed).length },
      by_domain: this.groupByDomain(events),
      violations: events.filter(e => !e.allowed)
    };
    return report;
  }

  groupByDomain(events) {
    const out = {};
    for (const e of events) {
      out[e.domain] = out[e.domain] || { total: 0, allowed: 0, blocked: 0 };
      out[e.domain].total++;
      if (e.allowed) out[e.domain].allowed++;
      else out[e.domain].blocked++;
    }
    return out;
  }

  async checkLegalCompliance(url, dataType) {
    if (dataType === 'personal_data') return this.checkGDPRCompliance(url);
    return { compliant: true };
  }

  async checkGDPRCompliance(url) {
    const domain = this.extractDomain(url);
    const isEU = await this.isEUDomain(domain);
    if (isEU) return { compliant: false, reason: 'GDPR may apply' };
    return { compliant: true };
  }

  async isEUDomain(domain) {
    const euTlds = ['.eu', '.de', '.fr', '.it', '.es', '.nl', '.be', '.pl'];
    return euTlds.some(t => domain.endsWith(t));
  }

  generateRecommendations(events) {
    const recs = [];
    // Detect robots.txt violations and rate-limiting issues
    for (const e of events) {
      if (e.reason && /robots/i.test(e.reason)) {
        recs.push({ type: 'robots_txt_violation', severity: 'high', domain: e.domain, reason: e.reason });
      }
      if (e.reason && /rate/i.test(e.reason)) {
        recs.push({ type: 'rate_limiting', severity: 'medium', domain: e.domain, reason: e.reason });
      }
      // if event explicitly marks blocked by rate limiter
      if (e.blockedBy && e.blockedBy === 'rate_limiter') {
        recs.push({ type: 'rate_limiting', severity: 'medium', domain: e.domain, reason: e.reason || 'Rate limiter triggered' });
      }
    }

    // Deduplicate by type+domain
    const seen = new Set();
    const out = [];
    for (const r of recs) {
      const key = `${r.type}:${r.domain}`;
      if (!seen.has(key)) {
        seen.add(key);
        out.push(r);
      }
    }
    return out;
  }
}

module.exports = { ComplianceManager };