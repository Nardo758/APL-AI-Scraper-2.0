/**
 * Cluster Manager - Distributed Architecture Management for APL AI Scraper 2.0
 * Manages worker nodes, load balancing, and distributed job processing
 */

const EventEmitter = require('events');
const os = require('os');
const { v4: uuidv4 } = require('uuid');
const logger = require('../core/logger');
const { supabase } = require('../core/supabase');
const { createClient } = require('redis');

class ClusterManager extends EventEmitter {
  constructor(options = {}) {
    super();
        
    this.workerId = options.workerId || this.generateWorkerId();
    this.nodeName = options.nodeName || os.hostname();
    this.capabilities = options.capabilities || this.detectCapabilities();
    this.maxConcurrentJobs = options.maxConcurrentJobs || os.cpus().length * 2;
    this.heartbeatInterval = options.heartbeatInterval || 30000; // 30 seconds
    this.healthCheckInterval = options.healthCheckInterval || 60000; // 1 minute
        
    this.status = 'starting';
    this.currentJobs = new Map();
    this.totalJobs = 0;
    this.startTime = Date.now();
        
    this.redis = null;
    this.heartbeatTimer = null;
    this.healthCheckTimer = null;
        
    // Bind methods to preserve context
    this.handleJobRequest = this.handleJobRequest.bind(this);
    this.processJob = this.processJob.bind(this);
    this.sendHeartbeat = this.sendHeartbeat.bind(this);
    this.performHealthCheck = this.performHealthCheck.bind(this);
  }

  /**
     * Initialize the cluster manager
     */
  async initialize() {
    try {
      logger.info('Initializing Cluster Manager', { 
        workerId: this.workerId, 
        nodeName: this.nodeName 
      });

      // Connect to Redis for distributed coordination
      await this.connectToRedis();
            
      // Register this worker node
      await this.registerWorkerNode();
            
      // Start heartbeat and health monitoring
      this.startHeartbeat();
      this.startHealthMonitoring();
            
      // Set up job listeners
      this.setupJobListeners();
            
      this.status = 'ready';
      this.emit('ready');
            
      logger.info('Cluster Manager initialized successfully', { 
        workerId: this.workerId 
      });

    } catch (error) {
      logger.error('Failed to initialize Cluster Manager', { 
        error: error.message,
        workerId: this.workerId
      });
      throw error;
    }
  }

  /**
     * Connect to Redis for distributed coordination
     */
  async connectToRedis() {
    try {
      this.redis = createClient({
        url: process.env.REDIS_URL || 'redis://localhost:6379'
      });

      this.redis.on('error', (err) => {
        logger.error('Redis connection error', { error: err.message });
      });

      this.redis.on('connect', () => {
        logger.info('Connected to Redis for cluster coordination');
      });

      await this.redis.connect();

    } catch (error) {
      logger.error('Failed to connect to Redis', { error: error.message });
      throw error;
    }
  }

  /**
     * Register this worker node in the database
     */
  async registerWorkerNode() {
    try {
      const nodeData = {
        worker_id: this.workerId,
        node_name: this.nodeName,
        status: this.status,
        capabilities: this.capabilities,
        current_jobs: this.currentJobs.size,
        total_jobs: this.totalJobs,
        memory_usage: this.getMemoryUsage(),
        cpu_usage: await this.getCpuUsage(),
        started_at: new Date().toISOString()
      };

      const { error } = await supabase
        .from('worker_nodes')
        .upsert(nodeData, { 
          onConflict: 'worker_id',
          ignoreDuplicates: false 
        });

      if (error) {
        throw new Error(`Failed to register worker node: ${error.message}`);
      }

      logger.info('Worker node registered successfully', { 
        workerId: this.workerId,
        capabilities: this.capabilities
      });

    } catch (error) {
      logger.error('Failed to register worker node', { 
        error: error.message,
        workerId: this.workerId
      });
      throw error;
    }
  }

  /**
     * Start sending regular heartbeats
     */
  startHeartbeat() {
    this.heartbeatTimer = setInterval(this.sendHeartbeat, this.heartbeatInterval);
    logger.info('Heartbeat started', { 
      interval: this.heartbeatInterval,
      workerId: this.workerId
    });
  }

  /**
     * Send heartbeat to update node status
     */
  async sendHeartbeat() {
    try {
      const updateData = {
        status: this.status,
        current_jobs: this.currentJobs.size,
        total_jobs: this.totalJobs,
        memory_usage: this.getMemoryUsage(),
        cpu_usage: await this.getCpuUsage(),
        last_heartbeat: new Date().toISOString()
      };

      const { error } = await supabase
        .from('worker_nodes')
        .update(updateData)
        .eq('worker_id', this.workerId);

      if (error) {
        logger.error('Failed to send heartbeat', { 
          error: error.message,
          workerId: this.workerId
        });
      }

      // Also update Redis for real-time coordination
      await this.redis.hSet(
        `worker:${this.workerId}`, 
        updateData
      );
      await this.redis.expire(`worker:${this.workerId}`, 120); // 2 minutes TTL

    } catch (error) {
      logger.error('Heartbeat failed', { 
        error: error.message,
        workerId: this.workerId
      });
    }
  }

  /**
     * Start health monitoring
     */
  startHealthMonitoring() {
    this.healthCheckTimer = setInterval(this.performHealthCheck, this.healthCheckInterval);
    logger.info('Health monitoring started', { 
      interval: this.healthCheckInterval,
      workerId: this.workerId
    });
  }

  /**
     * Perform comprehensive health check
     */
  async performHealthCheck() {
    try {
      const healthMetrics = {
        memory: this.getMemoryUsage(),
        cpu: await this.getCpuUsage(),
        jobs: this.currentJobs.size,
        uptime: Date.now() - this.startTime,
        redis: await this.checkRedisHealth(),
        database: await this.checkDatabaseHealth()
      };
      void healthMetrics; // acknowledged for linter; used in subsequent logic via methods

      // Determine overall health status
      let healthStatus = 'healthy';
      if (healthMetrics.memory > 90 || healthMetrics.cpu > 90) {
        healthStatus = 'warning';
      }
      if (healthMetrics.memory > 95 || healthMetrics.cpu > 95 || !healthMetrics.redis || !healthMetrics.database) {
        healthStatus = 'critical';
      }

      // Store health metrics
      await this.storeHealthMetrics(healthStatus, healthMetrics);

      // Emit health status
      this.emit('health', { status: healthStatus, metrics: healthMetrics });

      // Auto-scale based on health
      await this.handleAutoScaling(healthMetrics);

    } catch (error) {
      logger.error('Health check failed', { 
        error: error.message,
        workerId: this.workerId
      });
    }
  }

  /**
     * Set up job listeners for distributed processing
     */
  setupJobListeners() {
    // Listen for job assignments from Redis
    this.redis.subscribe(`jobs:${this.workerId}`, (message) => {
      const jobData = JSON.parse(message);
      this.handleJobRequest(jobData);
    });

    // Listen for cluster-wide broadcasts
    this.redis.subscribe('cluster:broadcast', (message) => {
      const broadcastData = JSON.parse(message);
      this.handleClusterBroadcast(broadcastData);
    });

    logger.info('Job listeners set up', { workerId: this.workerId });
  }

  /**
     * Handle incoming job requests
     */
  async handleJobRequest(jobData) {
    try {
      // Check if we can accept the job
      if (this.currentJobs.size >= this.maxConcurrentJobs) {
        logger.warn('Job rejected - at capacity', { 
          workerId: this.workerId,
          currentJobs: this.currentJobs.size,
          maxJobs: this.maxConcurrentJobs,
          jobId: jobData.id
        });
                
        // Publish rejection back to coordinator
        await this.redis.publish('job:rejected', JSON.stringify({
          jobId: jobData.id,
          workerId: this.workerId,
          reason: 'at_capacity'
        }));
        return;
      }

      // Accept and process the job
      logger.info('Job accepted for processing', { 
        workerId: this.workerId,
        jobId: jobData.id,
        type: jobData.type
      });

      this.currentJobs.set(jobData.id, {
        ...jobData,
        startTime: Date.now(),
        status: 'processing'
      });

      // Acknowledge job acceptance
      await this.redis.publish('job:accepted', JSON.stringify({
        jobId: jobData.id,
        workerId: this.workerId
      }));

      // Process the job asynchronously
      this.processJob(jobData).catch(error => {
        logger.error('Job processing failed', { 
          error: error.message,
          jobId: jobData.id,
          workerId: this.workerId
        });
      });

    } catch (error) {
      logger.error('Failed to handle job request', { 
        error: error.message,
        jobId: jobData?.id,
        workerId: this.workerId
      });
    }
  }

  /**
     * Process a job
     */
  async processJob(jobData) {
    const startTime = Date.now();
    let jobResult = null;

    try {
      logger.info('Starting job processing', { 
        jobId: jobData.id,
        type: jobData.type,
        workerId: this.workerId
      });

      // Update job status
      this.currentJobs.set(jobData.id, {
        ...this.currentJobs.get(jobData.id),
        status: 'processing'
      });

      // Process based on job type
      switch (jobData.type) {
      case 'scraping':
        jobResult = await this.processScrapeJob(jobData);
        break;
      case 'training':
        jobResult = await this.processTrainingJob(jobData);
        break;
      case 'export':
        jobResult = await this.processExportJob(jobData);
        break;
      default:
        throw new Error(`Unknown job type: ${jobData.type}`);
      }

      // Mark job as completed
      this.currentJobs.delete(jobData.id);
      this.totalJobs++;

      const duration = Date.now() - startTime;
      logger.info('Job completed successfully', { 
        jobId: jobData.id,
        workerId: this.workerId,
        duration
      });

      // Publish completion
      await this.redis.publish('job:completed', JSON.stringify({
        jobId: jobData.id,
        workerId: this.workerId,
        result: jobResult,
        duration
      }));

    } catch (error) {
      // Mark job as failed
      this.currentJobs.delete(jobData.id);
            
      const duration = Date.now() - startTime;
      logger.error('Job processing failed', { 
        error: error.message,
        jobId: jobData.id,
        workerId: this.workerId,
        duration
      });

      // Publish failure
      await this.redis.publish('job:failed', JSON.stringify({
        jobId: jobData.id,
        workerId: this.workerId,
        error: error.message,
        duration
      }));

      throw error;
    }
  }

  /**
     * Process scraping job
     */
  async processScrapeJob(jobData) {
    // This would integrate with your existing scraping engine
    const ScrapingEngine = require('../core/scraping-engine');
    const engine = new ScrapingEngine();
        
    return await engine.executeJob(jobData);
  }

  /**
     * Process training job
     */
  async processTrainingJob(jobData) {
    // This would integrate with your visual training system
    const VisualTrainer = require('../ai/visual-trainer');
    const trainer = new VisualTrainer();
        
    return await trainer.processTrainingJob(jobData);
  }

  /**
     * Process export job
     */
  async processExportJob(jobData) {
    // This would integrate with your data export system
    const DataExporter = require('../services/data-exporter');
    const exporter = new DataExporter();
        
    return await exporter.processExportJob(jobData);
  }

  /**
     * Handle cluster-wide broadcasts
     */
  async handleClusterBroadcast(broadcastData) {
    try {
      switch (broadcastData.type) {
      case 'shutdown':
        logger.info('Received shutdown broadcast');
        await this.gracefulShutdown();
        break;
      case 'scale_down':
        logger.info('Received scale down broadcast');
        await this.handleScaleDown();
        break;
      case 'health_check':
        logger.info('Received health check broadcast');
        await this.performHealthCheck();
        break;
      default:
        logger.debug('Unknown broadcast type', { type: broadcastData.type });
      }
    } catch (error) {
      logger.error('Failed to handle cluster broadcast', { 
        error: error.message,
        broadcastType: broadcastData.type
      });
    }
  }

  /**
     * Handle auto-scaling based on health metrics
     */
  async handleAutoScaling(healthMetrics) {
    void healthMetrics; // acknowledged for linter; logic uses internal metrics retrieval
    try {
      // Get cluster-wide metrics
      const clusterMetrics = await this.getClusterMetrics();
            
      // Scale up conditions
      if (clusterMetrics.avgCpuUsage > 80 && clusterMetrics.totalQueueSize > 100) {
        await this.requestScaleUp();
      }
            
      // Scale down conditions
      if (clusterMetrics.avgCpuUsage < 30 && clusterMetrics.totalQueueSize < 10) {
        await this.requestScaleDown();
      }

    } catch (error) {
      logger.error('Auto-scaling handling failed', { 
        error: error.message,
        workerId: this.workerId
      });
    }
  }

  /**
     * Get cluster-wide metrics
     */
  async getClusterMetrics() {
    try {
      const { data: workers } = await supabase
        .from('worker_nodes')
        .select('*')
        .eq('status', 'ready');

      const totalWorkers = workers?.length || 0;
      const avgCpuUsage = workers?.reduce((sum, w) => sum + (w.cpu_usage || 0), 0) / totalWorkers || 0;
      const avgMemoryUsage = workers?.reduce((sum, w) => sum + (w.memory_usage || 0), 0) / totalWorkers || 0;
      const totalCurrentJobs = workers?.reduce((sum, w) => sum + (w.current_jobs || 0), 0) || 0;

      // Get queue statistics
      const { data: queueStats } = await supabase
        .from('job_queue_stats')
        .select('*')
        .order('recorded_at', { ascending: false })
        .limit(1);

      const totalQueueSize = queueStats?.[0]?.pending_jobs || 0;

      return {
        totalWorkers,
        avgCpuUsage,
        avgMemoryUsage,
        totalCurrentJobs,
        totalQueueSize
      };

    } catch (error) {
      logger.error('Failed to get cluster metrics', { error: error.message });
      return {
        totalWorkers: 1,
        avgCpuUsage: 0,
        avgMemoryUsage: 0,
        totalCurrentJobs: 0,
        totalQueueSize: 0
      };
    }
  }

  /**
     * Request cluster scale up
     */
  async requestScaleUp() {
    try {
      logger.info('Requesting cluster scale up', { workerId: this.workerId });
            
      await this.redis.publish('cluster:scale_request', JSON.stringify({
        type: 'scale_up',
        requestedBy: this.workerId,
        timestamp: Date.now()
      }));

    } catch (error) {
      logger.error('Failed to request scale up', { error: error.message });
    }
  }

  /**
     * Request cluster scale down
     */
  async requestScaleDown() {
    try {
      logger.info('Requesting cluster scale down', { workerId: this.workerId });
            
      await this.redis.publish('cluster:scale_request', JSON.stringify({
        type: 'scale_down',
        requestedBy: this.workerId,
        timestamp: Date.now()
      }));

    } catch (error) {
      logger.error('Failed to request scale down', { error: error.message });
    }
  }

  /**
     * Handle scale down request
     */
  async handleScaleDown() {
    if (this.currentJobs.size === 0) {
      logger.info('Worker eligible for scale down - no active jobs');
      await this.gracefulShutdown();
    } else {
      logger.info('Worker not eligible for scale down - has active jobs', { 
        activeJobs: this.currentJobs.size 
      });
    }
  }

  /**
     * Store health metrics in database
     */
  async storeHealthMetrics(status, metrics) {
    try {
      const { error } = await supabase
        .from('system_health')
        .insert({
          component: `worker:${this.workerId}`,
          status,
          metrics,
          details: {
            node_name: this.nodeName,
            capabilities: this.capabilities
          }
        });

      if (error) {
        throw error;
      }

    } catch (error) {
      logger.error('Failed to store health metrics', { 
        error: error.message,
        workerId: this.workerId
      });
    }
  }

  /**
     * Check Redis health
     */
  async checkRedisHealth() {
    try {
      const pong = await this.redis.ping();
      return pong === 'PONG';
    } catch (error) {
      return false;
    }
  }

  /**
     * Check database health
     */
  async checkDatabaseHealth() {
    try {
      const { error } = await supabase
        .from('worker_nodes')
        .select('id')
        .limit(1);

      return !error;
    } catch (error) {
      return false;
    }
  }

  /**
     * Get memory usage percentage
     */
  getMemoryUsage() {
    const usage = process.memoryUsage();
    const totalMemory = os.totalmem();
    return Math.round((usage.rss / totalMemory) * 100);
  }

  /**
     * Get CPU usage percentage
     */
  async getCpuUsage() {
    return new Promise((resolve) => {
      const startUsage = process.cpuUsage();
      const startTime = process.hrtime();

      setTimeout(() => {
        const currentUsage = process.cpuUsage(startUsage);
        const currentTime = process.hrtime(startTime);
                
        const totalTime = currentTime[0] * 1000000 + currentTime[1] / 1000;
        const cpuTime = (currentUsage.user + currentUsage.system);
        const cpuPercent = Math.round((cpuTime / totalTime) * 100);
                
        resolve(Math.min(cpuPercent, 100));
      }, 100);
    });
  }

  /**
     * Detect worker capabilities
     */
  detectCapabilities() {
    return {
      cpu_cores: os.cpus().length,
      memory_gb: Math.round(os.totalmem() / (1024 * 1024 * 1024)),
      platform: os.platform(),
      arch: os.arch(),
      node_version: process.version,
      supports_headless: true, // Assume Playwright support
      max_concurrent_jobs: this.maxConcurrentJobs
    };
  }

  /**
     * Generate unique worker ID
     */
  generateWorkerId() {
    return `worker-${this.nodeName}-${uuidv4().substring(0, 8)}`;
  }

  /**
     * Graceful shutdown
     */
  async gracefulShutdown() {
    try {
      logger.info('Starting graceful shutdown', { workerId: this.workerId });
            
      this.status = 'shutting_down';
            
      // Stop accepting new jobs
      if (this.heartbeatTimer) {
        clearInterval(this.heartbeatTimer);
        this.heartbeatTimer = null;
      }
            
      if (this.healthCheckTimer) {
        clearInterval(this.healthCheckTimer);
        this.healthCheckTimer = null;
      }
            
      // Wait for current jobs to complete
      const maxWaitTime = 300000; // 5 minutes
      const startTime = Date.now();
            
      while (this.currentJobs.size > 0 && (Date.now() - startTime) < maxWaitTime) {
        logger.info('Waiting for jobs to complete', { 
          remainingJobs: this.currentJobs.size,
          workerId: this.workerId
        });
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
            
      // Force stop any remaining jobs
      if (this.currentJobs.size > 0) {
        logger.warn('Force stopping remaining jobs', { 
          remainingJobs: this.currentJobs.size,
          workerId: this.workerId
        });
        this.currentJobs.clear();
      }
            
      // Update node status to offline
      await supabase
        .from('worker_nodes')
        .update({ status: 'offline' })
        .eq('worker_id', this.workerId);
            
      // Close Redis connection
      if (this.redis) {
        await this.redis.disconnect();
      }
            
      this.status = 'offline';
      this.emit('shutdown');
            
      logger.info('Graceful shutdown completed', { workerId: this.workerId });

    } catch (error) {
      logger.error('Error during graceful shutdown', { 
        error: error.message,
        workerId: this.workerId
      });
      throw error;
    }
  }

  /**
     * Get worker status
     */
  getStatus() {
    return {
      workerId: this.workerId,
      nodeName: this.nodeName,
      status: this.status,
      currentJobs: this.currentJobs.size,
      totalJobs: this.totalJobs,
      capabilities: this.capabilities,
      uptime: Date.now() - this.startTime,
      memoryUsage: this.getMemoryUsage()
    };
  }
}

module.exports = ClusterManager;