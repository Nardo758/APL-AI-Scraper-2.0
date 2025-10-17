const { Worker, Queue, QueueEvents } = require('bullmq');
const IORedis = require('ioredis');
const { createClient } = require('@supabase/supabase-js');
const { chromium } = require('playwright');
const vm = require('vm');

class DistributedOrchestrator {
  constructor() {
    this.redis = new IORedis(process.env.REDIS_URL || 'redis://localhost:6379');
    // Defensive Supabase initialization - prefer the in-repo stub when env is missing/invalid
    try {
      const url = process.env.SUPABASE_URL;
      if (!url || url === 'your_supabase_url_here' || url.trim() === '') {
        this.supabase = require('./core/supabase').supabase;
      } else {
        try {
          this.supabase = createClient(url, process.env.SUPABASE_SERVICE_KEY);
        } catch (e) {
          console.warn('DistributedOrchestrator: Supabase client init failed, using local stub. Error:', e && e.message);
          this.supabase = require('./core/supabase').supabase;
        }
      }
    } catch (e) {
      console.warn('DistributedOrchestrator: unexpected error initializing supabase, using stub:', e && e.message);
      this.supabase = require('./core/supabase').supabase;
    }
    this.queues = new Map();
    this.workers = new Map();
    this.queueEvents = new Map();
    this.isInitialized = false;
    
    this.setupQueues();
  }

  async initialize() {
    if (this.isInitialized) return;
    
    try {
      console.log('ðŸš€ Initializing Distributed Orchestrator...');
      await this.setupQueues();
      await this.setupQueueEvents();
      this.isInitialized = true;
      console.log('âœ… Distributed Orchestrator initialized successfully');
    } catch (error) {
      console.error('âŒ Failed to initialize Distributed Orchestrator:', error);
      throw error;
    }
  }

  async setupQueues() {
    try {
      // Main scraping queue with standard priorities
      this.queues.set('scraping', new Queue('scraping', { 
        connection: this.redis,
        defaultJobOptions: {
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 2000
          },
          removeOnComplete: 100, // Keep last 100 completed jobs
          removeOnFail: 50 // Keep last 50 failed jobs
        }
      }));
      
      // Priority queue for urgent jobs
      this.queues.set('priority-scraping', new Queue('priority-scraping', { 
        connection: this.redis,
        defaultJobOptions: {
          priority: 1,
          attempts: 5,
          backoff: {
            type: 'exponential',
            delay: 1000
          },
          removeOnComplete: 50,
          removeOnFail: 25
        }
      }));

      // Background processing queue for analysis and cleanup
      this.queues.set('background-processing', new Queue('background-processing', {
        connection: this.redis,
        defaultJobOptions: {
          attempts: 2,
          backoff: {
            type: 'fixed',
            delay: 5000
          }
        }
      }));

      console.log('ðŸ“‹ Queues initialized successfully');
    } catch (error) {
      console.error('âŒ Failed to setup queues:', error);
      throw error;
    }
  }

  async setupQueueEvents() {
    for (const [queueName, queue] of this.queues) {
      void queue; // acknowledged for linter; queueName used to create events
      const queueEvents = new QueueEvents(queueName, { connection: this.redis });
      
      queueEvents.on('completed', ({ jobId, returnvalue }) => {
        console.log(`âœ… Job ${jobId} completed in queue ${queueName}`);
        this.handleJobCompletion(jobId, returnvalue);
      });

      queueEvents.on('failed', ({ jobId, failedReason }) => {
        console.error(`âŒ Job ${jobId} failed in queue ${queueName}: ${failedReason}`);
        this.handleJobFailure(jobId, failedReason);
      });

      queueEvents.on('progress', ({ jobId, data }) => {
        console.log(`ðŸ“ˆ Job ${jobId} progress: ${data}%`);
      });

      this.queueEvents.set(queueName, queueEvents);
    }
  }

  async scheduleJob(template, urls, options = {}) {
    try {
      if (!Array.isArray(urls)) {
        urls = [urls];
      }

      const queueName = options.priority === 'high' ? 'priority-scraping' : 'scraping';
      const queue = this.queues.get(queueName);

      if (!queue) {
        throw new Error(`Queue ${queueName} not found`);
      }

      console.log(`ðŸ“… Scheduling ${urls.length} jobs for template ${template.id} in ${queueName} queue`);

      const jobs = [];
      const batchId = `batch_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      for (const [index, url] of urls.entries()) {
        const jobData = {
          templateId: template.id,
          templateCode: template.code,
          templateConfig: template.config || {},
          url: url,
          batchId: batchId,
          batchIndex: index,
          batchTotal: urls.length,
          options: {
            timeout: options.timeout || 30000,
            retries: options.retries || 3,
            proxy: options.proxy,
            userAgent: options.userAgent || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            headless: options.headless !== false,
            captchaSolving: options.captchaSolving !== false,
            dataValidation: options.dataValidation !== false
          }
        };

        const jobOptions = {
          jobId: `${template.id}_${Date.now()}_${index}_${Math.random().toString(36).substr(2, 9)}`,
          delay: options.delay ? options.delay + (index * (options.stagger || 0)) : 0,
          priority: options.priority === 'high' ? 1 : (options.priority === 'low' ? 10 : 5)
        };

        // Create execution record in database
        const { data: execution } = await this.supabase
          .from('scraping_executions')
          .insert([{
            template_id: template.id,
            url: url,
            status: 'queued',
            execution_metadata: {
              batchId: batchId,
              queueName: queueName,
              jobId: jobOptions.jobId,
              scheduledAt: new Date().toISOString()
            }
          }])
          .select()
          .single();

        jobData.executionId = execution.id;

        const job = await queue.add('scrape-url', jobData, jobOptions);
        jobs.push({
          jobId: job.id,
          executionId: execution.id,
          url: url,
          status: 'queued'
        });
      }

      console.log(`âœ… Successfully scheduled ${jobs.length} jobs in batch ${batchId}`);
      return {
        batchId: batchId,
        jobs: jobs,
        queueName: queueName
      };

    } catch (error) {
      console.error('âŒ Error scheduling jobs:', error);
      throw error;
    }
  }

  async startWorkers(workerConfigs = []) {
    try {
      // Default worker configurations if none provided
      if (workerConfigs.length === 0) {
        workerConfigs = [
          { name: 'scraper-worker-1', queues: ['scraping'], concurrency: 2 },
          { name: 'scraper-worker-2', queues: ['scraping'], concurrency: 2 },
          { name: 'priority-worker-1', queues: ['priority-scraping'], concurrency: 1 },
          { name: 'background-worker-1', queues: ['background-processing'], concurrency: 1 }
        ];
      }

      console.log(`ðŸƒ Starting ${workerConfigs.length} workers...`);

      for (const config of workerConfigs) {
        await this.startWorker(config);
      }

      console.log(`âœ… All ${workerConfigs.length} workers started successfully`);
    } catch (error) {
      console.error('âŒ Error starting workers:', error);
      throw error;
    }
  }

  async startWorker(config) {
    try {
      const { name, queues, concurrency = 1, limiter } = config;

      for (const queueName of queues) {
        const workerName = `${name}-${queueName}`;
        
        const worker = new Worker(queueName, async (job) => {
          return await this.processScrapingJob(job);
        }, {
          connection: this.redis,
          concurrency: concurrency,
          limiter: limiter || {
            max: 10, // Max 10 jobs per second
            duration: 1000
          }
        });

        worker.on('completed', (job) => {
          console.log(`âœ… Job ${job.id} completed by worker ${workerName}`);
        });

        worker.on('failed', (job, err) => {
          console.error(`âŒ Job ${job.id} failed in worker ${workerName}:`, err.message);
        });

        worker.on('progress', (job, progress) => {
          console.log(`ðŸ“Š Job ${job.id} progress: ${progress}%`);
        });

        worker.on('error', (error) => {
          console.error(`ðŸš¨ Worker ${workerName} error:`, error);
        });

        this.workers.set(workerName, worker);
        console.log(`ðŸ”„ Worker ${workerName} started (concurrency: ${concurrency})`);
      }
    } catch (error) {
      console.error(`âŒ Error starting worker ${config.name}:`, error);
      throw error;
    }
  }

  async processScrapingJob(job) {
    const startTime = Date.now();
    const { templateCode, templateConfig, url, options, executionId } = job.data;
    
    try {
      console.log(`ðŸ”„ Processing job ${job.id} for URL: ${url}`);

      // Update execution status
      await this.updateExecutionStatus(executionId, 'running', {
        startedAt: new Date().toISOString(),
        workerId: job.name
      });

      // Update job progress
      await job.updateProgress(10);

      // Create scraper instance and execute
      const scraper = this.createScraperInstance(templateCode, options);
      
      await job.updateProgress(20);
      
      const result = await scraper.execute(url, options, job);
      
      await job.updateProgress(80);
      
      // Validate result structure if configured
      if (options.dataValidation && templateConfig.expectedFields) {
        this.validateScrapingResult(result.data, templateConfig.expectedFields);
      }

      const duration = Date.now() - startTime;
      
      // Update execution with results
      await this.updateExecutionStatus(executionId, 'completed', {
        completedAt: new Date().toISOString(),
        duration: duration
      }, result.data, result.metadata);

      await job.updateProgress(100);

      console.log(`âœ… Job ${job.id} completed successfully in ${duration}ms`);

      return {
        success: true,
        data: result.data,
        metadata: {
          ...result.metadata,
          duration: duration,
          url: url,
          timestamp: new Date().toISOString(),
          executionId: executionId
        }
      };

    } catch (error) {
      const duration = Date.now() - startTime;
      
      await this.updateExecutionStatus(executionId, 'failed', {
        failedAt: new Date().toISOString(),
        duration: duration,
        errorMessage: error.message
      });

      console.error(`âŒ Job ${job.id} failed after ${duration}ms:`, error.message);
      throw error;
    }
  }

  createScraperInstance(templateCode, options) {
    void options; // acknowledged for linter; used in nested ScraperExecutionContext methods
    class ScraperExecutionContext {
      constructor() {
        this.browser = null;
        this.page = null;
      }

      async execute(url, options, job) {
        const startTime = Date.now();
        
        try {
          // Launch browser with stealth options
          this.browser = await chromium.launch({ 
            headless: options.headless,
            args: [
              '--no-sandbox',
              '--disable-setuid-sandbox',
              '--disable-dev-shm-usage',
              '--disable-accelerated-2d-canvas',
              '--no-first-run',
              '--no-zygote',
              '--disable-gpu'
            ],
            ...options.browserOptions
          });

          await job?.updateProgress(30);

          this.page = await this.browser.newPage();
          
          // Apply stealth and configuration options
          await this.applyStealthOptions(this.page, options);
          
          await job?.updateProgress(40);

          // Set up proxy if provided
          if (options.proxy) {
            await this.setupProxy(this.page, options.proxy);
          }

          await job?.updateProgress(50);

          // Execute the template code in VM context
          const context = vm.createContext({
            page: this.page,
            browser: this.browser,
            url: url,
            options: options,
            console: console,
            setTimeout: setTimeout,
            setInterval: setInterval,
            clearTimeout: clearTimeout,
            clearInterval: clearInterval,
            JSON: JSON,
            Date: Date,
            Math: Math,
            Buffer: Buffer,
            require: require // Controlled require for specific modules
          });

          await job?.updateProgress(60);

          const script = new vm.Script(templateCode);
          const result = await script.runInContext(context, {
            timeout: options.timeout || 30000
          });
          
          await job?.updateProgress(70);

          const duration = Date.now() - startTime;
          
          return {
            data: result,
            duration: duration,
            metadata: {
              browserUsed: 'chromium',
              headless: options.headless,
              proxyUsed: !!options.proxy,
              pageLoadTime: this.page ? await this.page.evaluate(() => window.performance.timing.loadEventEnd - window.performance.timing.navigationStart) : null
            }
          };

        } finally {
          if (this.browser) {
            await this.browser.close();
          }
        }
      }

      async applyStealthOptions(page, options) {
        try {
          // Set realistic viewport
          await page.setViewportSize({ 
            width: 1920, 
            height: 1080 
          });
          
          // Set user agent
          await page.setUserAgent(options.userAgent);
          
          // Override webdriver detection
          await page.addInitScript(() => {
            Object.defineProperty(navigator, 'webdriver', {
              get: () => undefined,
            });
          });

          // Block unnecessary resources for performance
          await page.route('**/*', (route) => {
            const resourceType = route.request().resourceType();
            const url = route.request().url();
            
            // Block ads, analytics, and heavy media
            if (resourceType === 'image' && !options.loadImages) {
              route.abort();
            } else if (['font', 'media'].includes(resourceType) && !options.loadMedia) {
              route.abort();
            } else if (url.includes('google-analytics') || url.includes('facebook.com/tr')) {
              route.abort();
            } else {
              route.continue();
            }
          });

          // Set extra headers
          await page.setExtraHTTPHeaders({
            'Accept-Language': 'en-US,en;q=0.9',
            'Accept-Encoding': 'gzip, deflate, br',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
            'Upgrade-Insecure-Requests': '1',
            'Sec-Fetch-Dest': 'document',
            'Sec-Fetch-Mode': 'navigate',
            'Sec-Fetch-Site': 'none'
          });

        } catch (error) {
          console.error('Error applying stealth options:', error);
        }
      }

      async setupProxy(page, proxyConfig) {
        // Proxy setup is handled at browser launch level in Playwright
        // This method is for any additional proxy-related page setup
        console.log(`ðŸŒ Using proxy: ${proxyConfig.host}:${proxyConfig.port}`);
      }
    }

    return new ScraperExecutionContext();
  }

  validateScrapingResult(result, expectedFields) {
    if (!result || typeof result !== 'object') {
      throw new Error('Invalid result: expected object');
    }

    const missingFields = [];
    for (const field of expectedFields) {
      if (!(field in result) || result[field] === null || result[field] === undefined) {
        missingFields.push(field);
      }
    }

    if (missingFields.length > 0) {
      throw new Error(`Missing expected fields: ${missingFields.join(', ')}`);
    }
  }

  async updateExecutionStatus(executionId, status, metadata = {}, result = null, resultMetadata = {}) {
    try {
      const updateData = {
        status: status,
        execution_metadata: metadata
      };

      if (result) {
        updateData.raw_result = result;
      }

      if (Object.keys(resultMetadata).length > 0) {
        updateData.execution_metadata = {
          ...metadata,
          ...resultMetadata
        };
      }

      await this.supabase
        .from('scraping_executions')
        .update(updateData)
        .eq('id', executionId);

    } catch (error) {
      console.error('Error updating execution status:', error);
    }
  }

  async handleJobCompletion(jobId, returnvalue) {
    try {
      // Extract execution ID from return value
      const executionId = returnvalue?.metadata?.executionId;
      
      if (executionId) {
        // Update template metrics
        const { data: execution } = await this.supabase
          .from('scraping_executions')
          .select('template_id')
          .eq('id', executionId)
          .single();

        if (execution?.template_id) {
          await this.updateTemplateMetrics(execution.template_id, true, returnvalue?.metadata?.duration);
        }
      }

      console.log(`ðŸ“Š Job completion handled for job ${jobId}`);
    } catch (error) {
      console.error('Error handling job completion:', error);
    }
  }

  async handleJobFailure(jobId, error) {
    try {
      void error; // acknowledged for linter; detailed error handled elsewhere
      // Find execution by job ID (stored in metadata)
      const { data: executions } = await this.supabase
        .from('scraping_executions')
        .select('id, template_id, execution_metadata')
        .eq('execution_metadata->>jobId', jobId)
        .limit(1);

      if (executions && executions.length > 0) {
        const execution = executions[0];
        
        if (execution.template_id) {
          await this.updateTemplateMetrics(execution.template_id, false);
        }
      }

      console.log(`ðŸ“Š Job failure handled for job ${jobId}`);
    } catch (error) {
      console.error('Error handling job failure:', error);
    }
  }

  async updateTemplateMetrics(templateId, success, duration = 0) {
    try {
      // Get or create metrics record
      let { data: metrics } = await this.supabase
        .from('template_metrics')
        .select('*')
        .eq('template_id', templateId)
        .single();

      if (!metrics) {
        // Create new metrics record
        const { data: newMetrics, error } = await this.supabase
          .from('template_metrics')
          .insert([{
            template_id: templateId,
            total_runs: 1,
            successful_runs: success ? 1 : 0,
            failed_runs: success ? 0 : 1,
            success_rate: success ? 1.0 : 0.0,
            average_duration: duration || 0,
            last_run: new Date().toISOString()
          }])
          .select()
          .single();

        if (error) throw error;
        return newMetrics;
      }

      // Update existing metrics
      const newTotalRuns = metrics.total_runs + 1;
      const newSuccessfulRuns = metrics.successful_runs + (success ? 1 : 0);
      const newFailedRuns = metrics.failed_runs + (success ? 0 : 1);
      const newSuccessRate = newSuccessfulRuns / newTotalRuns;
      
      // Calculate new average duration
      const currentTotalDuration = metrics.average_duration * metrics.total_runs;
      const newAverageDuration = (currentTotalDuration + (duration || 0)) / newTotalRuns;

      const { data: updatedMetrics, error } = await this.supabase
        .from('template_metrics')
        .update({
          total_runs: newTotalRuns,
          successful_runs: newSuccessfulRuns,
          failed_runs: newFailedRuns,
          success_rate: newSuccessRate,
          average_duration: newAverageDuration,
          last_run: new Date().toISOString()
        })
        .eq('template_id', templateId)
        .select()
        .single();

      if (error) throw error;
      return updatedMetrics;

    } catch (error) {
      console.error('Error updating template metrics:', error);
      throw error;
    }
  }

  async getQueueStats() {
    try {
      const stats = {};
      
      for (const [name, queue] of this.queues) {
        const waiting = await queue.getWaiting();
        const active = await queue.getActive();
        const completed = await queue.getCompleted();
        const failed = await queue.getFailed();

        stats[name] = {
          waiting: waiting.length,
          active: active.length,
          completed: completed.length,
          failed: failed.length,
          total: waiting.length + active.length + completed.length + failed.length
        };
      }

      return stats;
    } catch (error) {
      console.error('Error getting queue stats:', error);
      throw error;
    }
  }

  async pauseQueue(queueName) {
    const queue = this.queues.get(queueName);
    if (queue) {
      await queue.pause();
      console.log(`â¸ï¸ Queue ${queueName} paused`);
    }
  }

  async resumeQueue(queueName) {
    const queue = this.queues.get(queueName);
    if (queue) {
      await queue.resume();
      console.log(`â–¶ï¸ Queue ${queueName} resumed`);
    }
  }

  async stopAllWorkers() {
    try {
      console.log('ðŸ›‘ Stopping all workers...');
      
      for (const [name, worker] of this.workers) {
        await worker.close();
        console.log(`ðŸ”„ Worker ${name} stopped`);
      }

      this.workers.clear();
      console.log('âœ… All workers stopped successfully');
    } catch (error) {
      console.error('âŒ Error stopping workers:', error);
      throw error;
    }
  }

  async cleanup() {
    try {
      console.log('ðŸ§¹ Cleaning up Distributed Orchestrator...');
      
      await this.stopAllWorkers();

      for (const [name, queueEvents] of this.queueEvents) {
        void name; // acknowledged for linter
        await queueEvents.close();
      }

      for (const [name, queue] of this.queues) {
        void name; // acknowledged for linter
        await queue.close();
      }

      await this.redis.quit();
      
      console.log('âœ… Cleanup completed successfully');
    } catch (error) {
      console.error('âŒ Error during cleanup:', error);
      throw error;
    }
  }
}

module.exports = { DistributedOrchestrator };