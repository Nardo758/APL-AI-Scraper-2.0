/**
 * Scraper Manager - Orchestrates all apartment-specific scrapers
 * Manages execution, scheduling, and coordination of multiple scrapers
 */

const HighlandSweetwaterScraper = require('./highland-sweetwater-scraper');
const AltaNortherlyScraper = require('./alta-northerly-scraper');
const ArdenOakwoodScraper = require('./arden-oakwood-scraper');
const { createClient } = require('@supabase/supabase-js');
const EventEmitter = require('events');

class ScraperManager extends EventEmitter {
  constructor(options = {}) {
    super();
    
    this.supabase = options.supabase || createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_KEY
    );

    this.config = {
      // Execution configuration
      maxConcurrentScrapers: options.maxConcurrentScrapers || 2,
      scraperTimeout: options.scraperTimeout || 300000, // 5 minutes
      retryAttempts: options.retryAttempts || 2,
      retryDelay: options.retryDelay || 30000, // 30 seconds
      
      // Scheduling configuration
      autoSchedule: options.autoSchedule !== false,
      scheduleInterval: options.scheduleInterval || 3600000, // 1 hour
      
      // AI configuration for all scrapers
      aiConfig: {
        enableVisualAnalysis: options.enableVisualAnalysis !== false,
        enableAIAssistance: options.enableAIAssistance !== false,
        ...options.aiConfig
      },
      
      ...options.config
    };

    // Initialize scrapers
    this.scrapers = new Map();
    this.initializeScrapers();

    this.isRunning = false;
    this.scheduledJobs = new Map();
    this.activeJobs = new Map();
    this.stats = {
      totalRuns: 0,
      successfulRuns: 0,
      failedRuns: 0,
      totalPropertiesFound: 0,
      averageExecutionTime: 0,
      lastRun: null
    };
  }

  /**
   * Initialize all apartment scrapers
   */
  initializeScrapers() {
    console.log('🏗️ Initializing apartment scrapers...');

    // Highland at Sweetwater Creek
    this.scrapers.set('highland-sweetwater', {
      scraper: new HighlandSweetwaterScraper({
        supabase: this.supabase,
        ...this.config.aiConfig
      }),
      name: 'Highland at Sweetwater Creek',
      priority: 1,
      enabled: true,
      lastRun: null,
      successCount: 0,
      failureCount: 0
    });

    // Alta Northerly
    this.scrapers.set('alta-northerly', {
      scraper: new AltaNortherlyScraper({
        supabase: this.supabase,
        ...this.config.aiConfig
      }),
      name: 'Alta Northerly',
      priority: 2,
      enabled: true,
      lastRun: null,
      successCount: 0,
      failureCount: 0
    });

    // The Arden Oakwood
    this.scrapers.set('arden-oakwood', {
      scraper: new ArdenOakwoodScraper({
        supabase: this.supabase,
        ...this.config.aiConfig
      }),
      name: 'The Arden Oakwood',
      priority: 3,
      enabled: true,
      lastRun: null,
      successCount: 0,
      failureCount: 0
    });

    console.log(`✅ Initialized ${this.scrapers.size} apartment scrapers`);
  }

  /**
   * Start the scraper manager
   */
  async start() {
    try {
      console.log('🚀 Starting Scraper Manager...');
      
      this.isRunning = true;
      
      // Set up event listeners
      this.setupEventListeners();
      
      // Start auto-scheduling if enabled
      if (this.config.autoSchedule) {
        this.startAutoScheduling();
      }
      
      this.emit('started', {
        timestamp: new Date().toISOString(),
        scraperCount: this.scrapers.size
      });
      
      console.log('✅ Scraper Manager started successfully');
      
    } catch (error) {
      console.error('❌ Failed to start Scraper Manager:', error);
      throw error;
    }
  }

  /**
   * Stop the scraper manager
   */
  async stop() {
    try {
      console.log('🛑 Stopping Scraper Manager...');
      
      this.isRunning = false;
      
      // Stop all scheduled jobs
      this.scheduledJobs.forEach((job, id) => {
        clearInterval(job);
        this.scheduledJobs.delete(id);
      });
      
      // Wait for active jobs to complete or timeout
      await this.waitForActiveJobs();
      
      this.emit('stopped', {
        timestamp: new Date().toISOString(),
        finalStats: this.stats
      });
      
      console.log('✅ Scraper Manager stopped');
      
    } catch (error) {
      console.error('❌ Error stopping Scraper Manager:', error);
    }
  }

  /**
   * Run all enabled scrapers
   */
  async runAllScrapers(options = {}) {
    const startTime = Date.now();
    
    try {
      console.log('🏢 Starting full apartment scraping run...');
      
      const results = {
        totalScrapers: 0,
        successfulScrapers: 0,
        failedScrapers: 0,
        totalProperties: 0,
        scraperResults: [],
        executionTime: 0,
        timestamp: new Date().toISOString()
      };

      // Get enabled scrapers
      const enabledScrapers = Array.from(this.scrapers.entries())
        .filter(([_, config]) => config.enabled)
        .sort((a, b) => a[1].priority - b[1].priority);

      results.totalScrapers = enabledScrapers.length;
      
      if (enabledScrapers.length === 0) {
        console.log('⚠️ No enabled scrapers found');
        return results;
      }

      // Run scrapers with concurrency control
      const scraperResults = await this.executeScrapersWithConcurrency(
        enabledScrapers, 
        options
      );

      // Process results
      scraperResults.forEach(result => {
        results.scraperResults.push(result);
        
        if (result.success) {
          results.successfulScrapers++;
          results.totalProperties += result.propertiesFound || 0;
        } else {
          results.failedScrapers++;
        }
      });

      results.executionTime = Date.now() - startTime;
      
      // Update statistics
      this.updateStats(results);
      
      console.log(`✅ Scraping run completed: ${results.successfulScrapers}/${results.totalScrapers} successful, ${results.totalProperties} properties found`);
      
      this.emit('scrapingCompleted', results);
      return results;
      
    } catch (error) {
      console.error('❌ Error running scrapers:', error);
      this.emit('scrapingError', error);
      throw error;
    }
  }

  /**
   * Run a specific scraper by ID
   */
  async runScraper(scraperId, options = {}) {
    const startTime = Date.now();
    
    try {
      console.log(`🎯 Running scraper: ${scraperId}`);
      
      const scraperConfig = this.scrapers.get(scraperId);
      if (!scraperConfig) {
        throw new Error(`Scraper not found: ${scraperId}`);
      }
      
      if (!scraperConfig.enabled) {
        throw new Error(`Scraper is disabled: ${scraperId}`);
      }

      // Execute scraper
      const result = await this.executeScraper(scraperId, scraperConfig, options);
      
      result.executionTime = Date.now() - startTime;
      
      console.log(`✅ Scraper ${scraperId} completed: ${result.propertiesFound} properties in ${result.executionTime}ms`);
      
      this.emit('scraperCompleted', { scraperId, result });
      return result;
      
    } catch (error) {
      const executionTime = Date.now() - startTime;
      console.error(`❌ Scraper ${scraperId} failed:`, error);
      
      const errorResult = {
        scraperId,
        success: false,
        error: error.message,
        executionTime
      };
      
      this.emit('scraperFailed', { scraperId, error: errorResult });
      return errorResult;
    }
  }

  /**
   * Execute scrapers with concurrency control
   */
  async executeScrapersWithConcurrency(scrapers, options = {}) {
    const results = [];
    const maxConcurrency = options.maxConcurrency || this.config.maxConcurrentScrapers;
    
    console.log(`⚡ Executing ${scrapers.length} scrapers with max concurrency: ${maxConcurrency}`);
    
    for (let i = 0; i < scrapers.length; i += maxConcurrency) {
      const batch = scrapers.slice(i, i + maxConcurrency);
      
      console.log(`📦 Processing batch ${Math.floor(i / maxConcurrency) + 1}: ${batch.map(([id]) => id).join(', ')}`);
      
      const batchPromises = batch.map(([scraperId, config]) => 
        this.executeScraper(scraperId, config, options)
      );
      
      const batchResults = await Promise.allSettled(batchPromises);
      
      batchResults.forEach((result, index) => {
        const [scraperId] = batch[index];
        
        if (result.status === 'fulfilled') {
          results.push({
            scraperId,
            success: true,
            ...result.value
          });
        } else {
          results.push({
            scraperId,
            success: false,
            error: result.reason?.message || 'Unknown error'
          });
        }
      });
      
      // Small delay between batches
      if (i + maxConcurrency < scrapers.length) {
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }
    
    return results;
  }

  /**
   * Execute a single scraper
   */
  async executeScraper(scraperId, config, options = {}) {
    const jobId = `${scraperId}_${Date.now()}`;
    
    try {
      // Track active job
      this.activeJobs.set(jobId, {
        scraperId,
        startTime: Date.now(),
        timeout: setTimeout(() => {
          console.warn(`⏰ Scraper ${scraperId} timed out`);
          this.activeJobs.delete(jobId);
        }, this.config.scraperTimeout)
      });

      // Execute scraper with timeout
      const result = await Promise.race([
        config.scraper.scrape(options),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Scraper timeout')), this.config.scraperTimeout)
        )
      ]);

      // Clear timeout and remove from active jobs
      const job = this.activeJobs.get(jobId);
      if (job) {
        clearTimeout(job.timeout);
        this.activeJobs.delete(jobId);
      }

      // Update scraper config
      config.lastRun = new Date().toISOString();
      config.successCount++;

      return result;
      
    } catch (error) {
      // Clear timeout and remove from active jobs
      const job = this.activeJobs.get(jobId);
      if (job) {
        clearTimeout(job.timeout);
        this.activeJobs.delete(jobId);
      }

      // Update scraper config
      config.lastRun = new Date().toISOString();
      config.failureCount++;

      throw error;
    }
  }

  /**
   * Schedule scraper runs
   */
  scheduleScrapers(scheduleConfig = {}) {
    try {
      console.log('⏰ Setting up scraper scheduling...');
      
      const interval = scheduleConfig.interval || this.config.scheduleInterval;
      const enabledScrapers = scheduleConfig.scrapers || Array.from(this.scrapers.keys());
      
      const jobId = `scheduled_${Date.now()}`;
      
      const job = setInterval(async () => {
        if (this.isRunning && this.activeJobs.size === 0) {
          console.log('⏰ Running scheduled scraping...');
          try {
            await this.runAllScrapers({ scheduledRun: true });
          } catch (error) {
            console.error('❌ Scheduled scraping failed:', error);
          }
        } else {
          console.log('⏳ Skipping scheduled run - scrapers already active');
        }
      }, interval);
      
      this.scheduledJobs.set(jobId, job);
      
      console.log(`✅ Scheduled scraping every ${interval}ms`);
      return jobId;
      
    } catch (error) {
      console.error('❌ Error scheduling scrapers:', error);
      throw error;
    }
  }

  /**
   * Start auto-scheduling
   */
  startAutoScheduling() {
    return this.scheduleScrapers({
      interval: this.config.scheduleInterval
    });
  }

  /**
   * Get scraper statistics
   */
  getStats() {
    const scraperStats = {};
    
    this.scrapers.forEach((config, id) => {
      scraperStats[id] = {
        name: config.name,
        enabled: config.enabled,
        priority: config.priority,
        lastRun: config.lastRun,
        successCount: config.successCount,
        failureCount: config.failureCount,
        successRate: config.successCount + config.failureCount > 0 ? 
          (config.successCount / (config.successCount + config.failureCount) * 100) : 0
      };
    });

    return {
      manager: {
        isRunning: this.isRunning,
        activeJobs: this.activeJobs.size,
        scheduledJobs: this.scheduledJobs.size,
        ...this.stats
      },
      scrapers: scraperStats,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Enable/disable a scraper
   */
  setScraperEnabled(scraperId, enabled) {
    const config = this.scrapers.get(scraperId);
    if (!config) {
      throw new Error(`Scraper not found: ${scraperId}`);
    }
    
    config.enabled = enabled;
    console.log(`${enabled ? '✅ Enabled' : '❌ Disabled'} scraper: ${scraperId}`);
    
    this.emit('scraperToggled', { scraperId, enabled });
  }

  /**
   * Update scraper priority
   */
  setScraperPriority(scraperId, priority) {
    const config = this.scrapers.get(scraperId);
    if (!config) {
      throw new Error(`Scraper not found: ${scraperId}`);
    }
    
    config.priority = priority;
    console.log(`🔢 Set scraper ${scraperId} priority to ${priority}`);
    
    this.emit('scraperPriorityChanged', { scraperId, priority });
  }

  /**
   * Setup event listeners
   */
  setupEventListeners() {
    this.on('scrapingCompleted', (results) => {
      console.log(`📊 Scraping completed: ${results.totalProperties} properties found`);
    });

    this.on('scraperFailed', ({ scraperId, error }) => {
      console.error(`📊 Scraper ${scraperId} failed: ${error.error}`);
    });
  }

  /**
   * Update manager statistics
   */
  updateStats(results) {
    this.stats.totalRuns++;
    
    if (results.failedScrapers === 0) {
      this.stats.successfulRuns++;
    } else {
      this.stats.failedRuns++;
    }
    
    this.stats.totalPropertiesFound += results.totalProperties;
    this.stats.lastRun = results.timestamp;
    
    // Update average execution time
    const totalTime = this.stats.averageExecutionTime * (this.stats.totalRuns - 1);
    this.stats.averageExecutionTime = (totalTime + results.executionTime) / this.stats.totalRuns;
  }

  /**
   * Wait for active jobs to complete
   */
  async waitForActiveJobs(timeoutMs = 30000) {
    const startTime = Date.now();
    
    while (this.activeJobs.size > 0 && (Date.now() - startTime) < timeoutMs) {
      console.log(`⏳ Waiting for ${this.activeJobs.size} active jobs to complete...`);
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    if (this.activeJobs.size > 0) {
      console.warn(`⚠️ ${this.activeJobs.size} jobs still active after timeout`);
    }
  }

  /**
   * Health check for all scrapers
   */
  async healthCheck() {
    const health = {
      manager: {
        status: this.isRunning ? 'running' : 'stopped',
        activeJobs: this.activeJobs.size,
        scheduledJobs: this.scheduledJobs.size
      },
      scrapers: {},
      overall: 'healthy',
      timestamp: new Date().toISOString()
    };

    // Check each scraper
    this.scrapers.forEach((config, id) => {
      const recentFailures = config.failureCount;
      const totalRuns = config.successCount + config.failureCount;
      const successRate = totalRuns > 0 ? (config.successCount / totalRuns) : 1;
      
      let status = 'healthy';
      if (!config.enabled) {
        status = 'disabled';
      } else if (successRate < 0.5 && totalRuns > 2) {
        status = 'degraded';
      } else if (recentFailures > 5) {
        status = 'unhealthy';
      }
      
      health.scrapers[id] = {
        status,
        enabled: config.enabled,
        successRate: Math.round(successRate * 100),
        lastRun: config.lastRun
      };
    });

    // Determine overall health
    const scraperStatuses = Object.values(health.scrapers).map(s => s.status);
    if (scraperStatuses.some(s => s === 'unhealthy')) {
      health.overall = 'unhealthy';
    } else if (scraperStatuses.some(s => s === 'degraded')) {
      health.overall = 'degraded';
    }

    return health;
  }
}

module.exports = ScraperManager;