// APL AI Scraper 2.0 - Job Queue System
const { Queue, Worker } = require('bullmq');
const IORedis = require('ioredis');
const { PlaywrightScraper } = require('../scrapers/playwright-scraper');

class JobQueue {
  constructor(supabase) {
    this.supabase = supabase;
    this.connection = new IORedis(process.env.REDIS_URL || 'redis://localhost:6379', {
      maxRetriesPerRequest: 3,
      retryDelayOnFailover: 100,
      lazyConnect: true
    });

    // Initialize queue
    this.scrapingQueue = new Queue('scraping-queue', { 
      connection: this.connection,
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 2000,
        },
        removeOnComplete: 100,
        removeOnFail: 50
      }
    });

    this.startWorker();
    console.log('ðŸš€ Job Queue initialized');
  }

  async addJob(jobId, priority = 0) {
    try {
      await this.scrapingQueue.add(
        'scrape-job',
        { jobId },
        {
          priority,
          jobId: `job-${jobId}`, // Unique job ID
          delay: 0
        }
      );
      console.log(`âž• Job ${jobId} added to queue`);
    } catch (error) {
      console.error(`âŒ Failed to add job ${jobId} to queue:`, error);
      throw error;
    }
  }

  async addBulkJobs(jobs) {
    try {
      const jobData = jobs.map((job, index) => ({
        name: 'scrape-job',
        data: { jobId: job.id },
        opts: {
          priority: job.priority || 0,
          jobId: `job-${job.id}`,
          delay: index * 1000 // Stagger jobs by 1 second
        }
      }));

      await this.scrapingQueue.addBulk(jobData);
      console.log(`âž• ${jobs.length} jobs added to queue`);
    } catch (error) {
      console.error('âŒ Failed to add bulk jobs to queue:', error);
      throw error;
    }
  }

  startWorker() {
    this.worker = new Worker(
      'scraping-queue',
      async (job) => {
        return await this.processJob(job);
      },
      {
        connection: this.connection,
        concurrency: parseInt(process.env.WORKER_CONCURRENCY) || 3,
        limiter: {
          max: 10,
          duration: 60000 // 10 requests per minute
        }
      }
    );

    // Worker event handlers
    this.worker.on('completed', (job, result) => {
      void result; // acknowledged for linter
      console.log(`âœ… Job ${job.data.jobId} completed successfully`);
    });

    this.worker.on('failed', (job, err) => {
      console.error(`âŒ Job ${job.data.jobId} failed:`, err.message);
    });

    this.worker.on('error', (err) => {
      console.error('ðŸ”¥ Worker error:', err);
    });

    const concurrency = (this.worker?.opts?.concurrency ?? parseInt(process.env.WORKER_CONCURRENCY)) || 3;
    console.log('ðŸ‘· Worker started with concurrency:', concurrency);
  }

  async processJob(job) {
    const { jobId } = job.data;
    const startTime = Date.now();
    
    console.log(`ðŸ”„ Processing job ${jobId}`);

    // Update job status to running
    await this.updateJobStatus(jobId, 'running', {
      started_at: new Date().toISOString(),
      attempts: job.attemptsMade + 1
    });

    let scraper = null;

    try {
      // Get job details from database
      const { data: jobData, error } = await this.supabase
        .from('scraping_jobs')
        .select('*')
        .eq('id', jobId)
        .single();

      if (error) {
        throw new Error(`Failed to fetch job data: ${error.message}`);
      }

      console.log(`ðŸ“Š Job details: ${jobData.url}`);

      // Initialize scraper
      scraper = new PlaywrightScraper();
      await scraper.init();

      // Build scraping configuration
      const scrapingConfig = {
        url: jobData.url,
        ...jobData.config
      };

      // Execute scraping
      const result = await scraper.scrape(scrapingConfig);
      await scraper.close();

      if (result.success) {
        // Store scraped data
        const { error: insertError } = await this.supabase
          .from('scraped_data')
          .insert([{
            job_id: jobId,
            data: result.data,
            url: jobData.url,
            metadata: {
              scraped_at: new Date().toISOString(),
              processing_time: Date.now() - startTime,
              scraper_version: '2.0',
              config: scrapingConfig
            }
          }]);

        if (insertError) {
          throw new Error(`Failed to store scraped data: ${insertError.message}`);
        }

        // Update job as completed
        await this.updateJobStatus(jobId, 'completed', {
          completed_at: new Date().toISOString(),
          result: {
            success: true,
            data_size: JSON.stringify(result.data).length,
            processing_time: Date.now() - startTime
          }
        });

        console.log(`âœ… Job ${jobId} completed in ${Date.now() - startTime}ms`);
        return { success: true, jobId, processingTime: Date.now() - startTime };

      } else {
        throw new Error(result.error);
      }

    } catch (error) {
      console.error(`âŒ Job ${jobId} failed:`, error.message);

      // Close scraper if it was initialized
      if (scraper) {
        await scraper.close();
      }

      // Update job as failed
      await this.updateJobStatus(jobId, 'failed', {
        error_message: error.message,
        attempts: job.attemptsMade + 1
      });

      // Determine if we should retry
      const shouldRetry = job.attemptsMade < (job.opts.attempts || 3);
      
      if (!shouldRetry) {
        console.log(`ðŸ’€ Job ${jobId} exceeded max attempts`);
      }

      throw error;
    }
  }

  async updateJobStatus(jobId, status, additionalFields = {}) {
    try {
      const updateData = {
        status,
        ...additionalFields
      };

      const { error } = await this.supabase
        .from('scraping_jobs')
        .update(updateData)
        .eq('id', jobId);

      if (error) {
        console.error(`Failed to update job ${jobId} status:`, error);
        throw error;
      }
    } catch (error) {
      console.error(`Database update failed for job ${jobId}:`, error);
      // Don't throw here as it would cause the job to fail unnecessarily
    }
  }

  async getQueueStats() {
    try {
      const waiting = await this.scrapingQueue.getWaiting();
      const active = await this.scrapingQueue.getActive();
      const completed = await this.scrapingQueue.getCompleted();
      const failed = await this.scrapingQueue.getFailed();

      return {
        waiting: waiting.length,
        active: active.length,
        completed: completed.length,
        failed: failed.length,
        total: waiting.length + active.length + completed.length + failed.length
      };
    } catch (error) {
      console.error('Failed to get queue stats:', error);
      return {
        waiting: 0,
        active: 0,
        completed: 0,
        failed: 0,
        total: 0,
        error: error.message
      };
    }
  }

  async pauseQueue() {
    try {
      await this.scrapingQueue.pause();
      console.log('â¸ï¸ Queue paused');
    } catch (error) {
      console.error('Failed to pause queue:', error);
      throw error;
    }
  }

  async resumeQueue() {
    try {
      await this.scrapingQueue.resume();
      console.log('â–¶ï¸ Queue resumed');
    } catch (error) {
      console.error('Failed to resume queue:', error);
      throw error;
    }
  }

  async clearQueue() {
    try {
      await this.scrapingQueue.obliterate({ force: true });
      console.log('ðŸ§¹ Queue cleared');
    } catch (error) {
      console.error('Failed to clear queue:', error);
      throw error;
    }
  }

  async retryFailedJobs() {
    try {
      const failedJobs = await this.scrapingQueue.getFailed();
      let retriedCount = 0;

      for (const job of failedJobs) {
        try {
          await job.retry();
          retriedCount++;
        } catch (retryError) {
          console.warn(`Failed to retry job ${job.id}:`, retryError.message);
        }
      }

      console.log(`ðŸ”„ Retried ${retriedCount} failed jobs`);
      return retriedCount;
    } catch (error) {
      console.error('Failed to retry failed jobs:', error);
      throw error;
    }
  }

  async close() {
    try {
      await this.worker?.close();
      await this.scrapingQueue?.close();
      await this.connection?.disconnect();
      console.log('ðŸ”’ Job Queue closed');
    } catch (error) {
      console.error('âŒ Error closing Job Queue:', error);
    }
  }
}

module.exports = { JobQueue };