/**
 * Claude AI Queue Management System
 * Intelligent batching, priority scoring, and queue processing for apartment scraping
 */

const { createClient } = require('@supabase/supabase-js');
const { v4: uuidv4 } = require('uuid');

class ClaudeQueueManager {
  constructor(options = {}) {
    this.supabase = options.supabase || createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_KEY
    );
    
    this.config = {
      batchSize: options.batchSize || 25,
      maxConcurrentBatches: options.maxConcurrentBatches || 3,
      priorityThreshold: options.priorityThreshold || 70,
      retryAttempts: options.retryAttempts || 3,
      retryDelay: options.retryDelay || 5000,
      claudeModel: options.claudeModel || 'claude-3-haiku-20240307',
      ...options.config
    };

    this.activeBatches = new Map();
    this.isProcessing = false;
  }

  /**
   * Add items to the scraping queue with intelligent prioritization
   */
  async enqueueProperties(properties, options = {}) {
    try {
      console.log(`🔄 Enqueuing ${properties.length} properties for Claude AI processing`);

      const queueItems = await Promise.all(properties.map(async (property) => {
        const priorityScore = await this.calculatePriorityScore(property);
        
        return {
          external_id: property.external_id || property.property_id,
          url: property.url,
          source: property.source || 'unknown',
          property_id: property.property_id,
          priority_score: priorityScore,
          preferred_ai_model: property.ai_model || this.config.claudeModel,
          metadata: {
            website_type: property.website_type,
            estimated_complexity: property.complexity || 'medium',
            retry_count: 0,
            enqueued_at: new Date().toISOString(),
            ...property.metadata
          },
          status: 'pending'
        };
      }));

      const { data, error } = await this.supabase
        .from('scraping_queue')
        .insert(queueItems)
        .select();

      if (error) throw error;

      console.log(`✅ Successfully enqueued ${data.length} properties`);
      return data;
    } catch (error) {
      console.error('❌ Error enqueuing properties:', error);
      throw error;
    }
  }

  /**
   * Calculate intelligent priority score for properties
   */
  async calculatePriorityScore(property) {
    try {
      // Base score calculation using enhanced function
      const { data, error } = await this.supabase
        .rpc('calculate_enhanced_priority_score', {
          p_property_id: property.property_id || property.external_id,
          p_days_since_last_scrape: property.days_since_last_scrape || 1,
          p_volatility_score: property.volatility_score || 50,
          p_success_rate: property.success_rate || 1.0,
          p_scrape_attempts: property.scrape_attempts || 0,
          p_market_demand: property.market_demand || 1.0
        });

      if (error) {
        console.warn('⚠️ Error calculating priority score, using default:', error);
        return 50; // Default priority
      }

      return Math.min(Math.max(data || 50, 0), 100); // Clamp between 0-100
    } catch (error) {
      console.warn('⚠️ Priority calculation failed, using default score:', error);
      return 50;
    }
  }

  /**
   * Process the queue with intelligent batching
   */
  async processQueue() {
    if (this.isProcessing) {
      console.log('⏳ Queue processing already in progress');
      return;
    }

    try {
      this.isProcessing = true;
      console.log('🚀 Starting Claude AI queue processing');

      while (this.activeBatches.size < this.config.maxConcurrentBatches) {
        const batch = await this.getNextBatch();
        
        if (!batch || batch.length === 0) {
          console.log('📭 No more items in queue');
          break;
        }

        await this.processBatch(batch);
      }

    } catch (error) {
      console.error('❌ Error processing queue:', error);
    } finally {
      this.isProcessing = false;
      console.log('🏁 Queue processing completed');
    }
  }

  /**
   * Get next batch of items prioritized by score
   */
  async getNextBatch() {
    try {
      const { data, error } = await this.supabase
        .rpc('get_next_scraping_batch', {
          batch_size: this.config.batchSize
        });

      if (error) throw error;

      return data || [];
    } catch (error) {
      console.error('❌ Error getting next batch:', error);
      return [];
    }
  }

  /**
   * Process a batch of scraping items
   */
  async processBatch(batchItems) {
    const batchId = uuidv4();
    console.log(`📦 Processing batch ${batchId} with ${batchItems.length} items`);

    try {
      // Create batch record
      const { data: batchRecord } = await this.supabase
        .from('ai_processing_batches')
        .insert({
          id: batchId,
          batch_type: 'claude_queue',
          status: 'processing',
          total_items: batchItems.length,
          ai_model: this.config.claudeModel,
          configuration: {
            priority_threshold: this.config.priorityThreshold,
            batch_size: this.config.batchSize
          },
          started_at: new Date().toISOString()
        })
        .select()
        .single();

      this.activeBatches.set(batchId, {
        items: batchItems,
        startedAt: Date.now(),
        processedCount: 0
      });

      // Update queue items with batch ID
      await this.supabase
        .from('scraping_queue')
        .update({ 
          batch_id: batchId,
          status: 'processing',
          started_at: new Date().toISOString()
        })
        .in('id', batchItems.map(item => item.queue_id));

      // Process items in parallel with controlled concurrency
      const results = await this.processItemsConcurrently(batchItems, batchId);

      // Update batch completion
      const completedItems = results.filter(r => r.success).length;
      const failedItems = results.filter(r => !r.success).length;

      await this.supabase
        .from('ai_processing_batches')
        .update({
          status: failedItems === 0 ? 'completed' : 'completed_with_errors',
          processed_items: completedItems,
          failed_items: failedItems,
          completed_at: new Date().toISOString()
        })
        .eq('id', batchId);

      this.activeBatches.delete(batchId);
      
      console.log(`✅ Batch ${batchId} completed: ${completedItems} successful, ${failedItems} failed`);
      return results;

    } catch (error) {
      console.error(`❌ Error processing batch ${batchId}:`, error);
      
      // Mark batch as failed
      await this.supabase
        .from('ai_processing_batches')
        .update({
          status: 'failed',
          completed_at: new Date().toISOString()
        })
        .eq('id', batchId);

      this.activeBatches.delete(batchId);
      throw error;
    }
  }

  /**
   * Process items with controlled concurrency
   */
  async processItemsConcurrently(items, batchId) {
    const results = [];
    const maxConcurrency = 3; // Limit concurrent Claude API calls
    
    for (let i = 0; i < items.length; i += maxConcurrency) {
      const chunk = items.slice(i, i + maxConcurrency);
      
      const chunkResults = await Promise.allSettled(
        chunk.map(item => this.processItem(item, batchId))
      );

      results.push(...chunkResults.map((result, index) => ({
        item: chunk[index],
        success: result.status === 'fulfilled',
        result: result.status === 'fulfilled' ? result.value : null,
        error: result.status === 'rejected' ? result.reason : null
      })));

      // Small delay between chunks to avoid rate limiting
      if (i + maxConcurrency < items.length) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    return results;
  }

  /**
   * Process individual scraping item
   */
  async processItem(item, batchId) {
    const startTime = Date.now();
    
    try {
      console.log(`🔍 Processing item: ${item.external_id} (Priority: ${item.priority_score})`);

      // This would call your actual scraping logic
      // For now, we'll simulate the process
      const scrapingResult = await this.performScraping(item);

      const processingTime = Date.now() - startTime;

      // Update queue item status
      await this.supabase
        .from('scraping_queue')
        .update({
          status: 'completed',
          completed_at: new Date().toISOString(),
          processing_duration_ms: processingTime,
          last_successful_scrape: new Date().toISOString()
        })
        .eq('id', item.queue_id);

      // Update batch progress
      const batch = this.activeBatches.get(batchId);
      if (batch) {
        batch.processedCount++;
      }

      console.log(`✅ Completed item: ${item.external_id} (${processingTime}ms)`);
      return scrapingResult;

    } catch (error) {
      const processingTime = Date.now() - startTime;
      
      console.error(`❌ Failed to process item: ${item.external_id}`, error);

      // Determine error category
      const errorCategory = this.categorizeError(error);

      // Update queue item with error
      await this.supabase
        .from('scraping_queue')
        .update({
          status: 'failed',
          error_message: error.message,
          error_category: errorCategory,
          processing_duration_ms: processingTime,
          scrape_attempts: (item.scrape_attempts || 0) + 1
        })
        .eq('id', item.queue_id);

      // Determine if item should be retried
      if (this.shouldRetry(item, error)) {
        await this.scheduleRetry(item);
      }

      throw error;
    }
  }

  /**
   * Placeholder for actual scraping logic
   * This should be replaced with your scraping implementation
   */
  async performScraping(item) {
    // Simulate Claude AI processing
    await new Promise(resolve => setTimeout(resolve, Math.random() * 2000 + 1000));
    
    // Simulate success/failure
    if (Math.random() > 0.1) { // 90% success rate
      return {
        external_id: item.external_id,
        data: {
          // Simulated scraped data
          name: `Property ${item.external_id}`,
          price: Math.floor(Math.random() * 2000) + 1000,
          bedrooms: Math.floor(Math.random() * 4) + 1,
          bathrooms: Math.floor(Math.random() * 3) + 1
        },
        ai_analysis: {
          confidence: Math.random() * 0.3 + 0.7,
          model: item.preferred_ai_model
        }
      };
    } else {
      throw new Error('Simulated scraping failure');
    }
  }

  /**
   * Categorize errors for better handling
   */
  categorizeError(error) {
    const message = error.message?.toLowerCase() || '';
    
    if (message.includes('rate limit') || message.includes('too many requests')) {
      return 'rate_limit';
    } else if (message.includes('network') || message.includes('timeout')) {
      return 'network';
    } else if (message.includes('parse') || message.includes('selector')) {
      return 'parsing';
    } else if (message.includes('ai') || message.includes('claude')) {
      return 'ai_analysis';
    } else {
      return 'unknown';
    }
  }

  /**
   * Determine if an item should be retried
   */
  shouldRetry(item, error) {
    const attempts = (item.scrape_attempts || 0) + 1;
    const errorCategory = this.categorizeError(error);
    
    // Don't retry if max attempts reached
    if (attempts >= this.config.retryAttempts) {
      return false;
    }

    // Don't retry parsing errors (usually permanent)
    if (errorCategory === 'parsing') {
      return false;
    }

    // Retry network and rate limit errors
    return ['network', 'rate_limit', 'unknown'].includes(errorCategory);
  }

  /**
   * Schedule item for retry
   */
  async scheduleRetry(item) {
    const attempts = (item.scrape_attempts || 0) + 1;
    const delay = this.config.retryDelay * Math.pow(2, attempts - 1); // Exponential backoff
    const retryAt = new Date(Date.now() + delay);

    await this.supabase
      .from('scraping_queue')
      .update({
        status: 'pending',
        scheduled_for: retryAt.toISOString(),
        scrape_attempts: attempts
      })
      .eq('id', item.queue_id);

    console.log(`🔄 Scheduled retry for ${item.external_id} in ${delay}ms (attempt ${attempts})`);
  }

  /**
   * Get queue statistics
   */
  async getQueueStats() {
    try {
      const { data, error } = await this.supabase
        .from('scraping_queue')
        .select('status')
        .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());

      if (error) throw error;

      const stats = data.reduce((acc, item) => {
        acc[item.status] = (acc[item.status] || 0) + 1;
        return acc;
      }, {});

      return {
        total: data.length,
        pending: stats.pending || 0,
        processing: stats.processing || 0,
        completed: stats.completed || 0,
        failed: stats.failed || 0,
        activeBatches: this.activeBatches.size,
        ...stats
      };
    } catch (error) {
      console.error('❌ Error getting queue stats:', error);
      return {};
    }
  }

  /**
   * Clear completed items from queue (cleanup)
   */
  async cleanupQueue(olderThanHours = 24) {
    try {
      const cutoffDate = new Date(Date.now() - olderThanHours * 60 * 60 * 1000);

      const { data, error } = await this.supabase
        .from('scraping_queue')
        .delete()
        .in('status', ['completed', 'failed'])
        .lt('completed_at', cutoffDate.toISOString());

      if (error) throw error;

      console.log(`🧹 Cleaned up ${data?.length || 0} old queue items`);
      return data?.length || 0;
    } catch (error) {
      console.error('❌ Error cleaning up queue:', error);
      return 0;
    }
  }

  /**
   * Stop processing and cleanup
   */
  async stop() {
    console.log('🛑 Stopping Claude Queue Manager');
    this.isProcessing = false;
    
    // Wait for active batches to complete
    while (this.activeBatches.size > 0) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    console.log('✅ Claude Queue Manager stopped');
  }
}

module.exports = { ClaudeQueueManager };