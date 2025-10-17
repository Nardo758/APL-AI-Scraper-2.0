/**
 * Cache Manager - Multi-Layer Caching System for APL AI Scraper 2.0
 * Implements local memory, Redis, and database caching with intelligent strategies
 */

const EventEmitter = require('events');
const NodeCache = require('node-cache');
const { createClient } = require('redis');
const crypto = require('crypto');
const logger = require('../core/logger');
const { supabase } = require('../core/supabase');

class CacheManager extends EventEmitter {
  constructor(options = {}) {
    super();
        
    // Configuration
    this.localTtl = options.localTtl || 300; // 5 minutes for local cache
    this.redisTtl = options.redisTtl || 3600; // 1 hour for Redis cache
    this.dbTtl = options.dbTtl || 86400; // 24 hours for database cache
    this.maxLocalSize = options.maxLocalSize || 1000; // Max items in local cache
    this.compressionThreshold = options.compressionThreshold || 10240; // 10KB
    this.enableCompression = options.enableCompression !== false;
    this.enableMetrics = options.enableMetrics !== false;
        
    // Cache layers
    this.localCache = new NodeCache({
      stdTTL: this.localTtl,
      maxKeys: this.maxLocalSize,
      useClones: false,
      deleteOnExpire: true
    });
        
    this.redis = null;
    this.isRedisConnected = false;
        
    // Metrics tracking
    this.metrics = {
      hits: { local: 0, redis: 0, database: 0 },
      misses: { local: 0, redis: 0, database: 0 },
      sets: { local: 0, redis: 0, database: 0 },
      deletes: { local: 0, redis: 0, database: 0 },
      errors: { local: 0, redis: 0, database: 0 }
    };

    // Acknowledge crypto to avoid unused-assignment lint when not used in all runtime paths
    void crypto;
        
    // Cache strategies
    this.strategies = {
      'template': { layers: ['local', 'redis', 'database'], ttl: { local: 600, redis: 3600, db: 86400 } },
      'scraped_data': { layers: ['redis', 'database'], ttl: { redis: 1800, db: 86400 } },
      'ai_analysis': { layers: ['local', 'redis'], ttl: { local: 300, redis: 1800 } },
      'user_session': { layers: ['local', 'redis'], ttl: { local: 300, redis: 1800 } },
      'api_response': { layers: ['local'], ttl: { local: 60 } },
      'page_content': { layers: ['redis', 'database'], ttl: { redis: 3600, db: 604800 } }, // 7 days in DB
      'training_data': { layers: ['database'], ttl: { db: 2592000 } }, // 30 days
      'export_data': { layers: ['local', 'redis'], ttl: { local: 300, redis: 1800 } }
    };
        
    // Bind methods
    this.cleanupExpired = this.cleanupExpired.bind(this);
    this.recordMetrics = this.recordMetrics.bind(this);
        
    // Start cleanup interval
    this.cleanupInterval = setInterval(this.cleanupExpired, 300000); // 5 minutes
        
    // Metrics reporting interval
    if (this.enableMetrics) {
      this.metricsInterval = setInterval(this.recordMetrics, 60000); // 1 minute
    }
  }

  /**
     * Initialize the cache manager
     */
  async initialize() {
    try {
      logger.info('Initializing Cache Manager');
            
      // Connect to Redis
      await this.connectToRedis();
            
      // Set up event listeners
      this.setupEventListeners();
            
      // Warm up caches if configured
      await this.warmUpCaches();
            
      logger.info('Cache Manager initialized successfully');
      this.emit('ready');

    } catch (error) {
      logger.error('Failed to initialize Cache Manager', { error: error.message });
      throw error;
    }
  }

  /**
     * Connect to Redis
     */
  async connectToRedis() {
    try {
      this.redis = createClient({
        url: process.env.REDIS_URL || 'redis://localhost:6379',
        retry_delay_on_failure: 1000,
        max_attempts: 3
      });

      this.redis.on('error', (err) => {
        logger.error('Redis connection error', { error: err.message });
        this.isRedisConnected = false;
        this.emit('redis_error', err);
      });

      this.redis.on('connect', () => {
        logger.info('Connected to Redis for caching');
        this.isRedisConnected = true;
        this.emit('redis_connected');
      });

      this.redis.on('ready', () => {
        logger.info('Redis client ready');
        this.isRedisConnected = true;
      });

      this.redis.on('end', () => {
        logger.warn('Redis connection closed');
        this.isRedisConnected = false;
      });

      await this.redis.connect();

    } catch (error) {
      logger.warn('Failed to connect to Redis, continuing without Redis cache', { 
        error: error.message 
      });
      this.isRedisConnected = false;
    }
  }

  /**
     * Set up event listeners for cache events
     */
  setupEventListeners() {
    this.localCache.on('set', (key) => {
      this.updateMetrics('sets', 'local');
      logger.debug('Local cache set', { key: this.maskKey(key) });
    });

    this.localCache.on('del', (key) => {
      this.updateMetrics('deletes', 'local');
      logger.debug('Local cache delete', { key: this.maskKey(key) });
    });

    this.localCache.on('expired', (key) => {
      logger.debug('Local cache expired', { key: this.maskKey(key) });
    });
  }

  /**
     * Get value from cache with multi-layer strategy
     */
  async get(key, type = 'default') {
    const strategy = this.strategies[type] || this.strategies['template'];
    const layers = strategy.layers;

    logger.debug('Cache get request', { key: this.maskKey(key), type, layers });

    try {
      // Try each layer in order
      for (const layer of layers) {
        const value = await this.getFromLayer(key, layer);
        if (value !== null && value !== undefined) {
          this.updateMetrics('hits', layer);
                    
          // Backfill previous layers for faster future access
          await this.backfillLayers(key, value, layers, layer, strategy);
                    
          logger.debug('Cache hit', { 
            key: this.maskKey(key), 
            layer, 
            type 
          });
                    
          return this.deserializeValue(value);
        }
        this.updateMetrics('misses', layer);
      }

      logger.debug('Cache miss (all layers)', { key: this.maskKey(key), type });
      return null;

    } catch (error) {
      logger.error('Cache get error', { 
        error: error.message, 
        key: this.maskKey(key), 
        type 
      });
      return null;
    }
  }

  /**
     * Set value in cache with multi-layer strategy
     */
  async set(key, value, type = 'default', ttlOverride = null) {
    const strategy = this.strategies[type] || this.strategies['template'];
    const layers = strategy.layers;

    logger.debug('Cache set request', { 
      key: this.maskKey(key), 
      type, 
      layers,
      valueSize: this.getValueSize(value)
    });

    try {
      const serializedValue = this.serializeValue(value);
      const promises = [];

      // Set in all configured layers
      for (const layer of layers) {
        const ttl = ttlOverride || strategy.ttl[layer] || this.getDefaultTtl(layer);
        promises.push(this.setInLayer(key, serializedValue, layer, ttl));
      }

      await Promise.allSettled(promises);
            
      logger.debug('Cache set completed', { 
        key: this.maskKey(key), 
        type,
        layers: layers.length
      });

      return true;

    } catch (error) {
      logger.error('Cache set error', { 
        error: error.message, 
        key: this.maskKey(key), 
        type 
      });
      return false;
    }
  }

  /**
     * Delete value from all cache layers
     */
  async delete(key) {
    logger.debug('Cache delete request', { key: this.maskKey(key) });

    try {
      const promises = [
        this.deleteFromLayer(key, 'local'),
        this.deleteFromLayer(key, 'redis'),
        this.deleteFromLayer(key, 'database')
      ];

      await Promise.allSettled(promises);
            
      logger.debug('Cache delete completed', { key: this.maskKey(key) });
      return true;

    } catch (error) {
      logger.error('Cache delete error', { 
        error: error.message, 
        key: this.maskKey(key) 
      });
      return false;
    }
  }

  /**
     * Clear cache by pattern
     */
  async clear(pattern = null, layers = ['local', 'redis', 'database']) {
    logger.info('Cache clear request', { pattern, layers });

    try {
      const promises = [];

      if (layers.includes('local')) {
        if (pattern) {
          // Clear by pattern in local cache
          const keys = this.localCache.keys().filter(key => 
            key.includes(pattern) || key.match(new RegExp(pattern))
          );
          keys.forEach(key => this.localCache.del(key));
        } else {
          // Clear all local cache
          this.localCache.flushAll();
        }
      }

      if (layers.includes('redis') && this.isRedisConnected) {
        if (pattern) {
          // Clear by pattern in Redis
          promises.push(this.clearRedisPattern(pattern));
        } else {
          // Clear all Redis cache
          promises.push(this.redis.flushDb());
        }
      }

      if (layers.includes('database')) {
        promises.push(this.clearDatabaseCache(pattern));
      }

      await Promise.allSettled(promises);
            
      logger.info('Cache clear completed', { pattern, layers });
      return true;

    } catch (error) {
      logger.error('Cache clear error', { 
        error: error.message, 
        pattern, 
        layers 
      });
      return false;
    }
  }

  /**
     * Get value from specific cache layer
     */
  async getFromLayer(key, layer) {
    try {
      switch (layer) {
      case 'local':
        return this.localCache.get(key);

      case 'redis':
        if (!this.isRedisConnected) return null;
        return await this.redis.get(key);

      case 'database':
        return await this.getFromDatabase(key);

      default:
        throw new Error(`Unknown cache layer: ${layer}`);
      }
    } catch (error) {
      this.updateMetrics('errors', layer);
      logger.error(`Cache get error from ${layer}`, { 
        error: error.message, 
        key: this.maskKey(key) 
      });
      return null;
    }
  }

  /**
     * Set value in specific cache layer
     */
  async setInLayer(key, value, layer, ttl) {
    try {
      switch (layer) {
      case 'local':
        this.localCache.set(key, value, ttl);
        this.updateMetrics('sets', 'local');
        break;

      case 'redis':
        if (!this.isRedisConnected) return false;
        await this.redis.setEx(key, ttl, value);
        this.updateMetrics('sets', 'redis');
        break;

      case 'database':
        await this.setInDatabase(key, value, ttl);
        this.updateMetrics('sets', 'database');
        break;

      default:
        throw new Error(`Unknown cache layer: ${layer}`);
      }
      return true;
    } catch (error) {
      this.updateMetrics('errors', layer);
      logger.error(`Cache set error in ${layer}`, { 
        error: error.message, 
        key: this.maskKey(key) 
      });
      return false;
    }
  }

  /**
     * Delete value from specific cache layer
     */
  async deleteFromLayer(key, layer) {
    try {
      switch (layer) {
      case 'local':
        this.localCache.del(key);
        this.updateMetrics('deletes', 'local');
        break;

      case 'redis':
        if (!this.isRedisConnected) return false;
        await this.redis.del(key);
        this.updateMetrics('deletes', 'redis');
        break;

      case 'database':
        await this.deleteFromDatabase(key);
        this.updateMetrics('deletes', 'database');
        break;
      }
      return true;
    } catch (error) {
      this.updateMetrics('errors', layer);
      logger.error(`Cache delete error from ${layer}`, { 
        error: error.message, 
        key: this.maskKey(key) 
      });
      return false;
    }
  }

  /**
     * Get value from database cache
     */
  async getFromDatabase(key) {
    try {
      const { data, error } = await supabase
        .from('cache_store')
        .select('value, expires_at')
        .eq('key', key)
        .single();

      if (error || !data) return null;

      // Check if expired
      if (data.expires_at && new Date(data.expires_at) < new Date()) {
        // Delete expired entry
        await this.deleteFromDatabase(key);
        return null;
      }

      // Update access tracking
      await supabase
        .from('cache_store')
        .update({
          access_count: supabase.sql`access_count + 1`,
          last_accessed: new Date().toISOString()
        })
        .eq('key', key);

      return data.value;

    } catch (error) {
      logger.error('Database cache get error', { 
        error: error.message, 
        key: this.maskKey(key) 
      });
      return null;
    }
  }

  /**
     * Set value in database cache
     */
  async setInDatabase(key, value, ttl) {
    try {
      const expiresAt = ttl ? new Date(Date.now() + ttl * 1000).toISOString() : null;
            
      const { error } = await supabase
        .from('cache_store')
        .upsert({
          key,
          value,
          expires_at: expiresAt,
          cache_type: 'general',
          access_count: 1,
          last_accessed: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }, { 
          onConflict: 'key' 
        });

      if (error) {
        throw error;
      }

      return true;

    } catch (error) {
      logger.error('Database cache set error', { 
        error: error.message, 
        key: this.maskKey(key) 
      });
      return false;
    }
  }

  /**
     * Delete value from database cache
     */
  async deleteFromDatabase(key) {
    try {
      const { error } = await supabase
        .from('cache_store')
        .delete()
        .eq('key', key);

      if (error) {
        throw error;
      }

      return true;

    } catch (error) {
      logger.error('Database cache delete error', { 
        error: error.message, 
        key: this.maskKey(key) 
      });
      return false;
    }
  }

  /**
     * Clear database cache by pattern
     */
  async clearDatabaseCache(pattern = null) {
    try {
      let query = supabase.from('cache_store').delete();
            
      if (pattern) {
        query = query.like('key', `%${pattern}%`);
      } else {
        query = query.neq('key', ''); // Delete all
      }

      const { error } = await query;
            
      if (error) {
        throw error;
      }

      return true;

    } catch (error) {
      logger.error('Database cache clear error', { error: error.message, pattern });
      return false;
    }
  }

  /**
     * Clear Redis cache by pattern
     */
  async clearRedisPattern(pattern) {
    try {
      const keys = await this.redis.keys(`*${pattern}*`);
      if (keys.length > 0) {
        await this.redis.del(keys);
      }
      return true;

    } catch (error) {
      logger.error('Redis cache clear error', { error: error.message, pattern });
      return false;
    }
  }

  /**
     * Backfill previous cache layers
     */
  async backfillLayers(key, value, layers, hitLayer, strategy) {
    try {
      const hitIndex = layers.indexOf(hitLayer);
      if (hitIndex <= 0) return; // No previous layers to backfill

      const backfillLayers = layers.slice(0, hitIndex);
      const promises = [];

      for (const layer of backfillLayers) {
        const ttl = strategy.ttl[layer] || this.getDefaultTtl(layer);
        promises.push(this.setInLayer(key, value, layer, ttl));
      }

      await Promise.allSettled(promises);

    } catch (error) {
      logger.error('Cache backfill error', { 
        error: error.message, 
        key: this.maskKey(key) 
      });
    }
  }

  /**
     * Serialize value for storage
     */
  serializeValue(value) {
    try {
      if (typeof value === 'string') {
        return value;
      }

      const serialized = JSON.stringify(value);
            
      // Compress large values if compression is enabled
      if (this.enableCompression && serialized.length > this.compressionThreshold) {
        const zlib = require('zlib');
        return `compressed:${zlib.gzipSync(serialized).toString('base64')}`;
      }

      return serialized;

    } catch (error) {
      logger.error('Value serialization error', { error: error.message });
      return null;
    }
  }

  /**
     * Deserialize value from storage
     */
  deserializeValue(value) {
    try {
      if (typeof value !== 'string') {
        return value;
      }

      // Handle compressed values
      if (value.startsWith('compressed:')) {
        const zlib = require('zlib');
        const compressed = value.substring(11); // Remove 'compressed:' prefix
        const decompressed = zlib.gunzipSync(Buffer.from(compressed, 'base64')).toString();
        return JSON.parse(decompressed);
      }

      // Try to parse as JSON, return as string if it fails
      try {
        return JSON.parse(value);
      } catch {
        return value;
      }

    } catch (error) {
      logger.error('Value deserialization error', { error: error.message });
      return null;
    }
  }

  /**
     * Get default TTL for cache layer
     */
  getDefaultTtl(layer) {
    switch (layer) {
    case 'local':
      return this.localTtl;
    case 'redis':
      return this.redisTtl;
    case 'database':
      return this.dbTtl;
    default:
      return 3600; // 1 hour default
    }
  }

  /**
     * Update metrics
     */
  updateMetrics(type, layer) {
    if (this.enableMetrics && this.metrics[type] && this.metrics[type][layer] !== undefined) {
      this.metrics[type][layer]++;
    }
  }

  /**
     * Record metrics to database
     */
  async recordMetrics() {
    if (!this.enableMetrics) return;

    try {
      const timestamp = new Date().toISOString();
      const metricsToRecord = [];

      // Record hit/miss ratios for each layer
      ['local', 'redis', 'database'].forEach(layer => {
        const hits = this.metrics.hits[layer];
        const misses = this.metrics.misses[layer];
        const total = hits + misses;

        if (total > 0) {
          metricsToRecord.push({
            cache_layer: layer,
            type: 'hit',
            timestamp
          });
        }
      });

      if (metricsToRecord.length > 0) {
        const { error } = await supabase
          .from('cache_metrics')
          .insert(metricsToRecord);

        if (error) {
          logger.error('Failed to record cache metrics', { error: error.message });
        }
      }

      // Reset metrics after recording
      this.resetMetrics();

    } catch (error) {
      logger.error('Cache metrics recording error', { error: error.message });
    }
  }

  /**
     * Reset metrics counters
     */
  resetMetrics() {
    this.metrics = {
      hits: { local: 0, redis: 0, database: 0 },
      misses: { local: 0, redis: 0, database: 0 },
      sets: { local: 0, redis: 0, database: 0 },
      deletes: { local: 0, redis: 0, database: 0 },
      errors: { local: 0, redis: 0, database: 0 }
    };
  }

  /**
     * Clean up expired cache entries
     */
  async cleanupExpired() {
    try {
      logger.debug('Starting cache cleanup');

      // Cleanup database cache
      const { error } = await supabase
        .from('cache_store')
        .delete()
        .lt('expires_at', new Date().toISOString());

      if (error) {
        logger.error('Database cache cleanup error', { error: error.message });
      }

      logger.debug('Cache cleanup completed');

    } catch (error) {
      logger.error('Cache cleanup error', { error: error.message });
    }
  }

  /**
     * Warm up caches with frequently accessed data
     */
  async warmUpCaches() {
    try {
      logger.info('Starting cache warm up');

      // Get frequently accessed cache entries
      const { data: frequentEntries } = await supabase
        .from('cache_store')
        .select('key, value, cache_type')
        .gt('access_count', 10)
        .order('access_count', { ascending: false })
        .limit(100);

      if (frequentEntries && frequentEntries.length > 0) {
        const promises = frequentEntries.map(entry => this.set(entry.key, entry.value, entry.cache_type));

        await Promise.allSettled(promises);
                
        logger.info('Cache warm up completed', { 
          entriesLoaded: frequentEntries.length 
        });
      }

    } catch (error) {
      logger.error('Cache warm up error', { error: error.message });
    }
  }

  /**
     * Get cache statistics
     */
  getCacheStats() {
    return {
      metrics: this.metrics,
      localCache: {
        keys: this.localCache.keys().length,
        maxKeys: this.maxLocalSize,
        hits: this.localCache.getStats().hits,
        misses: this.localCache.getStats().misses
      },
      redis: {
        connected: this.isRedisConnected
      },
      strategies: Object.keys(this.strategies)
    };
  }

  /**
     * Get value size for metrics
     */
  getValueSize(value) {
    try {
      return JSON.stringify(value).length;
    } catch {
      return 0;
    }
  }

  /**
     * Mask key for logging (security)
     */
  maskKey(key) {
    if (!key || key.length <= 8) return key;
    return `${key.substring(0, 4)}***${key.substring(key.length - 4)}`;
  }

  /**
     * Shutdown cache manager
     */
  async shutdown() {
    try {
      logger.info('Shutting down Cache Manager');

      // Clear intervals
      if (this.cleanupInterval) {
        clearInterval(this.cleanupInterval);
      }
            
      if (this.metricsInterval) {
        clearInterval(this.metricsInterval);
      }

      // Record final metrics
      if (this.enableMetrics) {
        await this.recordMetrics();
      }

      // Close Redis connection
      if (this.redis && this.isRedisConnected) {
        await this.redis.disconnect();
      }

      // Clear local cache
      this.localCache.flushAll();

      logger.info('Cache Manager shutdown completed');
      this.emit('shutdown');

    } catch (error) {
      logger.error('Cache Manager shutdown error', { error: error.message });
      throw error;
    }
  }
}

module.exports = CacheManager;