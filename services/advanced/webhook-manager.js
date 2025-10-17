// Comprehensive Webhook Management System
const crypto = require('crypto');

class WebhookManager {
  constructor() {
    this.webhooks = new Map();
    this.deliveryQueue = [];
    this.retryQueue = [];
    this.supabase = null; // Will be injected
    this.isProcessing = false;
    
    this.setupProcessing();
  }

  setSupabase(supabase) {
    this.supabase = supabase;
    this.loadWebhooks();
  }

  async loadWebhooks() {
    if (!this.supabase) return;

    try {
      const { data } = await this.supabase
        .from('webhook_configs')
        .select('*')
        .eq('active', true);

      this.webhooks.clear();
      for (const webhook of data || []) {
        this.webhooks.set(webhook.id, webhook);
      }

      console.log(`ðŸ“¡ Loaded ${this.webhooks.size} active webhooks`);
    } catch (error) {
      console.error('Error loading webhooks:', error);
    }
  }

  setupProcessing() {
    // Process delivery queue every 5 seconds
    setInterval(() => {
      this.processDeliveryQueue();
    }, 5000);

    // Process retry queue every 30 seconds
    setInterval(() => {
      this.processRetryQueue();
    }, 30000);
  }

  async processDeliveryQueue() {
    if (this.isProcessing || this.deliveryQueue.length === 0) return;

    this.isProcessing = true;
    const batch = this.deliveryQueue.splice(0, 10); // Process 10 at a time

    try {
      const deliveryPromises = batch.map(item => this.deliverWebhook(item));
      await Promise.allSettled(deliveryPromises);
    } catch (error) {
      console.error('Error processing webhook delivery queue:', error);
    } finally {
      this.isProcessing = false;
    }
  }

  async processRetryQueue() {
    if (this.retryQueue.length === 0) return;

    const now = Date.now();
    const readyToRetry = this.retryQueue.filter(item => item.scheduledFor <= now);
    
    if (readyToRetry.length === 0) return;

    console.log(`ðŸ”„ Processing ${readyToRetry.length} webhook retries`);

    for (const retryItem of readyToRetry) {
      try {
        await this.deliverWebhook(retryItem.deliveryItem);
        // Remove from retry queue on success
        this.retryQueue = this.retryQueue.filter(item => item.id !== retryItem.id);
      } catch (error) {
        // Will be handled by deliverWebhook and potentially re-queued
        console.error(`Retry failed for webhook ${retryItem.deliveryItem.webhookId}:`, error.message);
      }
    }
  }

  async triggerWebhook(eventType, data, options = {}) {
    const relevantWebhooks = Array.from(this.webhooks.values())
      .filter(webhook => 
        webhook.events.includes(eventType) || 
        webhook.events.includes('*')
      );

    if (relevantWebhooks.length === 0) {
      console.log(`ðŸ“¡ No webhooks configured for event: ${eventType}`);
      return [];
    }

    console.log(`ðŸ“¡ Triggering ${relevantWebhooks.length} webhooks for event: ${eventType}`);

    const deliveryItems = relevantWebhooks.map(webhook => ({
      webhookId: webhook.id,
      webhook: webhook,
      eventType: eventType,
      data: data,
      priority: options.priority || 'normal',
      createdAt: Date.now()
    }));

    // Add to delivery queue
    this.deliveryQueue.push(...deliveryItems);

    return deliveryItems.map(item => ({
      webhookId: item.webhookId,
      status: 'queued'
    }));
  }

  async deliverWebhook(deliveryItem) {
    const { webhook, eventType, data } = deliveryItem;
    
    const payload = {
      event: eventType,
      timestamp: new Date().toISOString(),
      data: data,
      webhook_id: webhook.id,
      delivery_id: crypto.randomUUID()
    };

    const headers = {
      'Content-Type': 'application/json',
      'User-Agent': 'APL-AI-Scraper-Webhook/2.0',
      'X-Webhook-Event': eventType,
      'X-Webhook-Delivery': payload.delivery_id
    };

    // Add signature if secret is configured
    if (webhook.secret) {
      const signature = this.createSignature(payload, webhook.secret);
      headers['X-Scraper-Signature'] = `sha256=${signature}`;
      headers['X-Scraper-Signature-256'] = `sha256=${signature}`;
    }

    // Add custom headers
    if (webhook.headers && typeof webhook.headers === 'object') {
      Object.assign(headers, webhook.headers);
    }

    try {
      console.log(`ðŸ“¤ Delivering webhook ${webhook.id} for event ${eventType}`);

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout

      const response = await fetch(webhook.url, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify(payload),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      const responseBody = await response.text().catch(() => 'Unable to read response');

      await this.recordWebhookDelivery(webhook.id, eventType, {
        delivery_id: payload.delivery_id,
        status: response.status,
        success: response.ok,
        response: responseBody.substring(0, 1000), // Limit response size
        duration_ms: Date.now() - deliveryItem.createdAt
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      console.log(`âœ… Webhook delivery successful: ${webhook.id}`);
      return { success: true, webhookId: webhook.id, status: response.status };

    } catch (error) {
      console.error(`âŒ Webhook delivery failed: ${webhook.id} - ${error.message}`);

      await this.recordWebhookDelivery(webhook.id, eventType, {
        delivery_id: payload.delivery_id,
        success: false,
        error: error.message,
        duration_ms: Date.now() - deliveryItem.createdAt
      });

      // Implement retry logic for failed webhooks
      await this.scheduleWebhookRetry(deliveryItem, error);
      throw error;
    }
  }

  createSignature(payload, secret) {
    const hmac = crypto.createHmac('sha256', secret);
    hmac.update(JSON.stringify(payload));
    return hmac.digest('hex');
  }

  async recordWebhookDelivery(webhookId, eventType, result) {
    if (!this.supabase) return;

    try {
      await this.supabase
        .from('webhook_deliveries')
        .insert([{
          webhook_id: webhookId,
          event_type: eventType,
          delivery_id: result.delivery_id,
          success: result.success,
          status_code: result.status,
          response_body: result.response,
          error_message: result.error,
          duration_ms: result.duration_ms,
          delivered_at: new Date().toISOString()
        }]);
    } catch (error) {
      console.error('Error recording webhook delivery:', error);
    }
  }

  async scheduleWebhookRetry(deliveryItem, error) {
    const { webhook } = deliveryItem;
    const retryConfig = webhook.retry_config || {
      max_attempts: 3,
      backoff_multiplier: 2,
      initial_delay: 5000,
      max_delay: 300000 // 5 minutes max
    };

    try {
      // Get existing retry attempts
      const { data: existingRetries } = await this.supabase
        .from('webhook_retries')
        .select('attempt_count')
        .eq('webhook_id', webhook.id)
        .eq('event_type', deliveryItem.eventType)
        .eq('payload_hash', this.hashPayload(deliveryItem.data))
        .order('created_at', { ascending: false })
        .limit(1);

      const attemptCount = existingRetries?.[0]?.attempt_count || 0;

      if (attemptCount >= retryConfig.max_attempts) {
        console.log(`ðŸš« Max retry attempts (${retryConfig.max_attempts}) reached for webhook ${webhook.id}`);
        return;
      }

      const delay = Math.min(
        retryConfig.initial_delay * Math.pow(retryConfig.backoff_multiplier, attemptCount),
        retryConfig.max_delay
      );

      const scheduledFor = Date.now() + delay;
      const retryId = crypto.randomUUID();

      // Add to retry queue
      this.retryQueue.push({
        id: retryId,
        deliveryItem: deliveryItem,
        scheduledFor: scheduledFor,
        attemptCount: attemptCount + 1
      });

      // Record retry in database
      if (this.supabase) {
        await this.supabase
          .from('webhook_retries')
          .insert([{
            id: retryId,
            webhook_id: webhook.id,
            event_type: deliveryItem.eventType,
            payload: deliveryItem.data,
            payload_hash: this.hashPayload(deliveryItem.data),
            attempt_count: attemptCount + 1,
            scheduled_for: new Date(scheduledFor).toISOString(),
            error_message: error.message,
            created_at: new Date().toISOString()
          }]);
      }

      console.log(`â° Scheduled retry ${attemptCount + 1}/${retryConfig.max_attempts} for webhook ${webhook.id} in ${delay}ms`);

    } catch (retryError) {
      console.error('Error scheduling webhook retry:', retryError);
    }
  }

  hashPayload(payload) {
    return crypto.createHash('md5').update(JSON.stringify(payload)).digest('hex');
  }

  // Event-specific webhook triggers
  async onJobCompleted(job, result) {
    return this.triggerWebhook('job.completed', {
      job_id: job.id,
      project_id: job.project_id,
      template_id: job.template_id,
      url: job.url,
      status: 'completed',
      result: {
        records_scraped: result.records_scraped,
        execution_time: result.execution_time,
        data_size: result.data_size
      },
      completed_at: new Date().toISOString()
    }, { priority: 'normal' });
  }

  async onJobFailed(job, error) {
    return this.triggerWebhook('job.failed', {
      job_id: job.id,
      project_id: job.project_id,
      template_id: job.template_id,
      url: job.url,
      status: 'failed',
      error: {
        message: error.message,
        type: error.name || 'ScrapingError'
      },
      failed_at: new Date().toISOString(),
      attempts: job.attempts || 1
    }, { priority: 'high' });
  }

  async onTemplateUpdated(template, changes) {
    return this.triggerWebhook('template.updated', {
      template_id: template.id,
      template_name: template.name,
      project_id: template.project_id,
      version: template.version,
      changes: changes,
      updated_at: new Date().toISOString(),
      status: template.status
    }, { priority: 'normal' });
  }

  async onDataExported(exportJob, recordCount) {
    return this.triggerWebhook('data.exported', {
      export_id: exportJob.id,
      project_id: exportJob.project_id,
      format: exportJob.format,
      record_count: recordCount,
      file_size: exportJob.file_size,
      exported_at: new Date().toISOString(),
      download_url: exportJob.download_url,
      expires_at: exportJob.expires_at
    }, { priority: 'normal' });
  }

  async onSiteChangeDetected(templateId, changes) {
    return this.triggerWebhook('site.change_detected', {
      template_id: templateId,
      change_type: changes.type || 'structural',
      confidence: changes.confidence,
      changes: changes,
      detected_at: new Date().toISOString(),
      auto_repair_attempted: changes.auto_repair_attempted || false
    }, { priority: 'high' });
  }

  async onHealingAttempted(jobId, strategy, success, result) {
    return this.triggerWebhook('scraper.healing_attempted', {
      job_id: jobId,
      healing_strategy: strategy,
      success: success,
      result: result,
      attempted_at: new Date().toISOString()
    }, { priority: 'normal' });
  }

  async onSystemAlert(alert) {
    return this.triggerWebhook('system.alert', {
      alert_id: alert.id,
      alert_type: alert.type,
      severity: alert.severity,
      title: alert.title,
      message: alert.message,
      data: alert.data,
      created_at: new Date().toISOString()
    }, { priority: 'high' });
  }

  // Webhook management methods
  async createWebhook(config) {
    if (!this.supabase) throw new Error('Supabase not configured');

    const webhookData = {
      name: config.name,
      url: config.url,
      events: config.events || ['*'],
      secret: config.secret || null,
      headers: config.headers || {},
      retry_config: config.retry_config || {
        max_attempts: 3,
        backoff_multiplier: 2,
        initial_delay: 5000
      },
      active: config.active !== false,
      user_id: config.user_id
    };

    const { data, error } = await this.supabase
      .from('webhook_configs')
      .insert([webhookData])
      .select()
      .single();

    if (error) throw error;

    // Add to active webhooks
    if (data.active) {
      this.webhooks.set(data.id, data);
    }

    console.log(`ðŸ“¡ Created webhook: ${data.name} (${data.id})`);
    return data;
  }

  async updateWebhook(webhookId, updates) {
    if (!this.supabase) throw new Error('Supabase not configured');

    const { data, error } = await this.supabase
      .from('webhook_configs')
      .update(updates)
      .eq('id', webhookId)
      .select()
      .single();

    if (error) throw error;

    // Update in memory
    if (data.active) {
      this.webhooks.set(data.id, data);
    } else {
      this.webhooks.delete(data.id);
    }

    console.log(`ðŸ“¡ Updated webhook: ${data.name} (${data.id})`);
    return data;
  }

  async deleteWebhook(webhookId) {
    if (!this.supabase) throw new Error('Supabase not configured');

    const { error } = await this.supabase
      .from('webhook_configs')
      .delete()
      .eq('id', webhookId);

    if (error) throw error;

    // Remove from memory
    this.webhooks.delete(webhookId);

    console.log(`ðŸ“¡ Deleted webhook: ${webhookId}`);
  }

  async testWebhook(webhookId) {
    const webhook = this.webhooks.get(webhookId);
    if (!webhook) {
      throw new Error(`Webhook ${webhookId} not found`);
    }

    const testData = {
      message: 'This is a test webhook delivery',
      timestamp: new Date().toISOString(),
      webhook_id: webhookId
    };

    try {
      await this.deliverWebhook({
        webhookId: webhook.id,
        webhook: webhook,
        eventType: 'webhook.test',
        data: testData,
        createdAt: Date.now()
      });

      return { success: true, message: 'Test webhook delivered successfully' };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async getWebhookStats(webhookId = null, days = 7) {
    if (!this.supabase) return null;

    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
    
    let query = this.supabase
      .from('webhook_deliveries')
      .select('success, status_code, duration_ms, delivered_at, event_type')
      .gte('delivered_at', startDate);

    if (webhookId) {
      query = query.eq('webhook_id', webhookId);
    }

    const { data } = await query.order('delivered_at', { ascending: false });

    if (!data) return null;

    const stats = {
      total_deliveries: data.length,
      successful_deliveries: data.filter(d => d.success).length,
      failed_deliveries: data.filter(d => !d.success).length,
      success_rate: 0,
      avg_duration: 0,
      by_event_type: {},
      by_status_code: {},
      recent_deliveries: data.slice(0, 10)
    };

    stats.success_rate = stats.total_deliveries > 0 ? stats.successful_deliveries / stats.total_deliveries : 0;

    // Calculate average duration
    const durations = data.filter(d => d.duration_ms).map(d => d.duration_ms);
    stats.avg_duration = durations.length > 0 ? durations.reduce((a, b) => a + b, 0) / durations.length : 0;

    // Group by event type
    for (const delivery of data) {
      const eventType = delivery.event_type;
      if (!stats.by_event_type[eventType]) {
        stats.by_event_type[eventType] = { count: 0, success_rate: 0 };
      }
      stats.by_event_type[eventType].count++;
    }

    // Calculate success rates by event type
    for (const [eventType, eventStats] of Object.entries(stats.by_event_type)) {
      const eventDeliveries = data.filter(d => d.event_type === eventType);
      const eventSuccesses = eventDeliveries.filter(d => d.success).length;
      eventStats.success_rate = eventSuccesses / eventDeliveries.length;
    }

    return stats;
  }

  getQueueStats() {
    return {
      delivery_queue_size: this.deliveryQueue.length,
      retry_queue_size: this.retryQueue.length,
      active_webhooks: this.webhooks.size,
      is_processing: this.isProcessing
    };
  }
}

module.exports = { WebhookManager };