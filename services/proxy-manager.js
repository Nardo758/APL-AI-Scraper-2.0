const { createClient } = require('@supabase/supabase-js');

/**
 * @typedef {Object} ProxyRecord
 * @property {string|number} id
 * @property {string} host
 * @property {number} port
 * @property {string} [username]
 * @property {string} [password]
 * @property {string} [type]
 * @property {string} [country]
 * @property {string} [provider]
 * @property {number} [success_rate]
 * @property {number} [total_requests]
 * @property {number} [successful_requests]
 * @property {number} [failed_requests]
 * @property {number} [response_time_ms]
 * @property {string} [status]
 */

/**
 * @typedef {Object} ProxyConfig
 * @property {string} server
 * @property {string} [username]
 * @property {string} [password]
 */

/**
 * ProxyManager - manages proxy list, health checks and selection logic
 */
class ProxyManager {
  constructor() {
    try {
      const url = process.env.SUPABASE_URL;
      if (!url || url === 'your_supabase_url_here' || url.trim() === '') {
        this.supabase = require('../core/supabase').supabase;
      } else {
        try {
          this.supabase = createClient(url, process.env.SUPABASE_SERVICE_KEY);
        } catch (e) {
          console.warn('ProxyManager: Supabase init failed, using stub', e && e.message);
          this.supabase = require('../core/supabase').supabase;
        }
      }
    } catch (e) {
      console.warn('ProxyManager: unexpected supabase init error, using stub', e && e.message);
      this.supabase = require('../core/supabase').supabase;
    }
    this.proxies = [];
    this.currentIndex = 0;
    this.failedProxies = new Set();
    this.healthCheckInterval = null;
    this.isInitialized = false;
    
    this.init();
  }

  /**
   * Initialize the proxy manager: load proxies and start health checks
   * @returns {Promise<void>}
   */
  async init() {
    try {
      await this.loadProxies();
      this.setupHealthChecks();
      this.isInitialized = true;
      console.log('ðŸŒ ProxyManager initialized successfully');
    } catch (error) {
      console.error('âŒ Failed to initialize ProxyManager:', error);
    }
  }

  /**
   * Load active proxies from the supabase table `proxy_list`.
   * @returns {Promise<ProxyRecord[]>}
   */
  async loadProxies() {
    try {
      const { data, error } = await this.supabase
        .from('proxy_list')
        .select('*')
        .eq('status', 'active')
        .order('success_rate', { ascending: false });

      if (error) throw error;

      this.proxies = data || [];
      console.log(`ðŸ“‹ Loaded ${this.proxies.length} active proxies`);
      
      // Reset failed proxies list when reloading
      this.failedProxies.clear();
      
      return this.proxies;
    } catch (error) {
      console.error('âŒ Error loading proxies:', error);
      this.proxies = [];
      return [];
    }
  }

  /**
   * Select the next available proxy, skipping failed or excluded countries.
   * @param {string[]} [excludeCountries]
   * @returns {ProxyRecord|null}
   */
  getNextProxy(excludeCountries = []) {
    if (this.proxies.length === 0) {
      console.log('âš ï¸ No proxies available');
      return null;
    }

    let attempts = 0;
    const maxAttempts = this.proxies.length * 2; // Allow cycling through all proxies twice

    while (attempts < maxAttempts) {
      this.currentIndex = (this.currentIndex + 1) % this.proxies.length;
      const proxy = this.proxies[this.currentIndex];
      
      // Skip failed proxies
      if (this.failedProxies.has(proxy.id)) {
        attempts++;
        continue;
      }

      // Skip excluded countries
      if (excludeCountries.includes(proxy.country)) {
        attempts++;
        continue;
      }

      // Skip proxies with very low success rate
      if (proxy.success_rate < 0.5 && proxy.total_requests > 10) {
        attempts++;
        continue;
      }

      console.log(`✔ Selected proxy: ${proxy.host}:${proxy.port} (${proxy.country}, ${(proxy.success_rate * 100).toFixed(1)}% success)`);
      return proxy;
    }

    // If all proxies are failed, reset and try the best available
    if (this.failedProxies.size === this.proxies.length) {
      console.log('ðŸ”„ All proxies failed, resetting failed list');
      this.failedProxies.clear();
      
      // Return the proxy with highest success rate
      const bestProxy = this.proxies.reduce((best, current) => 
        current.success_rate > best.success_rate ? current : best
      );
      
      return bestProxy;
    }

    return null;
  }

  /**
   * Return the best performing proxy for a given country code.
   * @param {string} countryCode
   * @returns {ProxyRecord|null}
   */
  getProxyByCountry(countryCode) {
    const countryProxies = this.proxies.filter(p => 
      p.country === countryCode && !this.failedProxies.has(p.id)
    );

    if (countryProxies.length === 0) {
      console.log('No available proxies for country: ' + countryCode);
      return null;
    }

    // Return the best performing proxy for the country
    return countryProxies.reduce((best, current) => 
      current.success_rate > best.success_rate ? current : best
    );
  }

  /**
   * Mark a proxy as failed locally and update remote stats.
   * @param {string|number} proxyId
   * @param {string} reason
   * @param {Object} [errorDetails]
   * @returns {Promise<void>}
   */
  async markProxyFailed(proxyId, reason, errorDetails = {}) {
    try {
      this.failedProxies.add(proxyId);
      console.log(`âŒ Marking proxy ${proxyId} as failed: ${reason}`);
      
      await this.updateProxyReliability(proxyId, false, errorDetails);
      
      // Schedule health check for failed proxy in 5 minutes
      setTimeout(() => {
        this.checkProxyHealth(proxyId);
      }, 300000);

    } catch (error) {
      console.error('Error marking proxy as failed:', error);
    }
  }

  /**
   * Mark a proxy as successful and update remote stats.
   * @param {string|number} proxyId
   * @param {number} [responseTimeMs]
   * @returns {Promise<void>}
   */
  async markProxySuccess(proxyId, responseTimeMs = 0) {
    try {
      // Remove from failed list if present
      this.failedProxies.delete(proxyId);
      
      await this.updateProxyReliability(proxyId, true, { responseTime: responseTimeMs });
      
    } catch (error) {
      console.error('Error marking proxy as successful:', error);
    }
  }

  /**
   * Update proxy reliability stats in the backend table.
   * @param {string|number} proxyId
   * @param {boolean} success
   * @param {Object} [metadata]
   * @returns {Promise<void>}
   */
  async updateProxyReliability(proxyId, success, metadata = {}) {
    try {
      const { data: proxy, error: fetchError } = await this.supabase
        .from('proxy_list')
        .select('*')
        .eq('id', proxyId)
        .single();

      if (fetchError) {
        console.error('Error fetching proxy for update:', fetchError);
        return;
      }

      const newStats = {
        total_requests: proxy.total_requests + 1,
        successful_requests: proxy.successful_requests + (success ? 1 : 0),
        failed_requests: proxy.failed_requests + (success ? 0 : 1),
        last_used: new Date().toISOString(),
        last_status: success ? 'success' : 'failed'
      };

      // Calculate new success rate
      newStats.success_rate = newStats.successful_requests / newStats.total_requests;

      // Update response time if provided
      if (metadata.responseTime) {
        const currentTotalTime = proxy.response_time_ms * proxy.total_requests;
        newStats.response_time_ms = (currentTotalTime + metadata.responseTime) / newStats.total_requests;
      }

      // Auto-disable proxy if success rate falls below threshold
      if (newStats.success_rate < 0.1 && newStats.total_requests > 20) {
        newStats.status = 'disabled';
        console.log(`ðŸš« Auto-disabling proxy ${proxyId} due to low success rate`);
      }

      const { error: updateError } = await this.supabase
        .from('proxy_list')
        .update(newStats)
        .eq('id', proxyId);

      if (updateError) {
        console.error('Error updating proxy stats:', updateError);
      } else {
        console.log(`ðŸ“Š Updated proxy ${proxyId} stats: ${(newStats.success_rate * 100).toFixed(1)}% success rate`);
      }

    } catch (error) {
      console.error('Error updating proxy reliability:', error);
    }
  }

  /**
   * Start periodic health checks for proxies.
   * @returns {void}
   */
  setupHealthChecks() {
    // Clear existing interval if any
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }

    // Check proxy health every 10 minutes
    this.healthCheckInterval = setInterval(async () => {
      console.log('ðŸ¥ Running proxy health checks...');
      
      // Check a few random proxies each time to avoid overwhelming
      const proxySubset = this.proxies
        .sort(() => Math.random() - 0.5)
        .slice(0, Math.min(5, this.proxies.length));

      for (const proxy of proxySubset) {
        await this.checkProxyHealth(proxy.id);
      }
    }, 600000); // 10 minutes

    console.log('ðŸ¥ Proxy health monitoring started');
  }

  /**
   * Perform an on-demand health check for a specific proxy id.
   * @param {string|number} proxyId
   * @returns {Promise<void>}
   */
  async checkProxyHealth(proxyId) {
    const proxy = this.proxies.find(p => p.id === proxyId);
    if (!proxy) return;

    const startTime = Date.now();

    try {
      console.log(`ðŸ” Health checking proxy ${proxy.host}:${proxy.port}`);

      // Use a simple HTTP request to test proxy
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);

      const testUrl = 'https://httpbin.org/ip';
      const proxyUrl = `http://${proxy.username ? `${proxy.username}:${proxy.password}@` : ''}${proxy.host}:${proxy.port}`;

      const response = await fetch(testUrl, /** @type {any} */ ({
        signal: controller.signal,
        method: 'GET',
        agent: proxy.type === 'socks5' ? 
          /** @type {any} */ (new (require('socks-proxy-agent'))(proxyUrl)) :
          /** @type {any} */ (new (require('http-proxy-agent'))(proxyUrl))
      }));

      clearTimeout(timeoutId);
      const responseTime = Date.now() - startTime;

      if (response.ok) {
        this.failedProxies.delete(proxyId);
        await this.markProxySuccess(proxyId, responseTime);
        console.log(`âœ… Proxy ${proxy.host}:${proxy.port} is healthy (${responseTime}ms)`);
      } else {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

    } catch (error) {
      const responseTime = Date.now() - startTime;
      await this.markProxyFailed(proxyId, `Health check failed: ${error.message}`, {
        responseTime: responseTime,
        healthCheck: true
      });
      console.log(`âŒ Proxy ${proxy.host}:${proxy.port} health check failed: ${error.message}`);
    }
  }

  /**
   * Create a runtime proxy configuration object for HTTP clients.
   * @param {ProxyRecord|null} proxy
   * @returns {ProxyConfig|null}
   */
  getProxyConfig(proxy) {
    if (!proxy) return null;

    const config = {
      server: `${proxy.type}://${proxy.host}:${proxy.port}`
    };

    if (proxy.username && proxy.password) {
      config.username = proxy.username;
      config.password = proxy.password;
    }

    return config;
  }

  /**
   * Create a Playwright-friendly proxy config.
   * @param {ProxyRecord|null} proxy
   * @returns {ProxyConfig|null}
   */
  getPlaywrightProxyConfig(proxy) {
    if (!proxy) return null;

    const config = {
      server: `${proxy.type}://${proxy.host}:${proxy.port}`
    };

    if (proxy.username && proxy.password) {
      config.username = proxy.username;
      config.password = proxy.password;
    }

    return config;
  }

  /**
   * Add a new proxy to the backend and local cache.
   * @param {Partial<ProxyRecord>} proxyData
   * @returns {Promise<ProxyRecord>}
   */
  async addProxy(proxyData) {
    try {
      const { data, error } = await this.supabase
        .from('proxy_list')
        .insert([{
          host: proxyData.host,
          port: proxyData.port,
          username: proxyData.username,
          password: proxyData.password,
          type: proxyData.type || 'http',
          country: proxyData.country,
          provider: proxyData.provider,
          status: 'active'
        }])
        .select()
        .single();

      if (error) throw error;

      // Add to local cache
      this.proxies.push(data);
      console.log(`âž• Added new proxy: ${data.host}:${data.port}`);

      return data;
    } catch (error) {
      console.error('Error adding proxy:', error);
      throw error;
    }
  }

  /**
   * Remove a proxy from backend and local cache.
   * @param {string|number} proxyId
   * @returns {Promise<void>}
   */
  async removeProxy(proxyId) {
    try {
      const { error } = await this.supabase
        .from('proxy_list')
        .delete()
        .eq('id', proxyId);

      if (error) throw error;

      // Remove from local cache
      this.proxies = this.proxies.filter(p => p.id !== proxyId);
      this.failedProxies.delete(proxyId);

      console.log(`ðŸ—‘ï¸ Removed proxy: ${proxyId}`);
    } catch (error) {
      console.error('Error removing proxy:', error);
      throw error;
    }
  }

  /**
   * Aggregate proxy statistics from backend rows.
   * @returns {Promise<any>} stats
   */
  async getProxyStats() {
    try {
      const { data, error } = await this.supabase
        .from('proxy_list')
        .select(`
          status,
          country,
          type,
          success_rate,
          total_requests,
          response_time_ms
        `);

      if (error) throw error;

      const stats = {
        total: data.length,
        active: data.filter(p => p.status === 'active').length,
        disabled: data.filter(p => p.status === 'disabled').length,
        failed: this.failedProxies.size,
        avgSuccessRate: data.reduce((sum, p) => sum + p.success_rate, 0) / data.length,
        avgResponseTime: data.reduce((sum, p) => sum + (p.response_time_ms || 0), 0) / data.length,
        byCountry: {},
        byType: {}
      };

      // Group by country
      data.forEach(proxy => {
        stats.byCountry[proxy.country] = (stats.byCountry[proxy.country] || 0) + 1;
      });

      // Group by type
      data.forEach(proxy => {
        stats.byType[proxy.type] = (stats.byType[proxy.type] || 0) + 1;
      });

      return stats;
    } catch (error) {
      console.error('Error getting proxy stats:', error);
      throw error;
    }
  }

  /**
   * Reload the proxy list from backend.
   * @returns {Promise<number>} number of proxies loaded
   */
  async refreshProxyList() {
    console.log('ðŸ”„ Refreshing proxy list...');
    await this.loadProxies();
    return this.proxies.length;
  }

  /**
   * Number of available proxies (excluding failed ones).
   * @returns {number}
   */
  getAvailableProxyCount() {
    return this.proxies.length - this.failedProxies.size;
  }

  /**
   * Cleanup any running intervals or resources.
   * @returns {void}
   */
  cleanup() {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }
    console.log('ðŸ§¹ ProxyManager cleanup completed');
  }
}

module.exports = { ProxyManager };