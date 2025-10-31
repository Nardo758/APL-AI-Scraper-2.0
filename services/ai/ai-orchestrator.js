/**
 * AI Orchestrator - Coordinates Claude Queue Manager and GPT-4V Visual Analyzer
 * Provides unified interface for apartment scraping AI operations
 */

const { ClaudeQueueManager } = require('./claude-queue-manager');
const { GPT4VVisualAnalyzer } = require('./gpt4v-visual-analyzer');
const { createClient } = require('@supabase/supabase-js');
const EventEmitter = require('events');

class AIOrchestrator extends EventEmitter {
  constructor(options = {}) {
    super();
    
    this.supabase = options.supabase || createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_KEY
    );

    // Initialize AI engines
    this.claudeQueue = new ClaudeQueueManager({ 
      supabase: this.supabase,
      ...options.claude 
    });
    
    this.gpt4vAnalyzer = new GPT4VVisualAnalyzer({ 
      supabase: this.supabase,
      ...options.gpt4v 
    });

    this.config = {
      enableVisualAnalysis: options.enableVisualAnalysis !== false,
      enableClaudeQueue: options.enableClaudeQueue !== false,
      screenshotTimeout: options.screenshotTimeout || 30000,
      maxConcurrentAnalysis: options.maxConcurrentAnalysis || 2,
      ...options.config
    };

    this.isRunning = false;
    this.processingStats = {
      totalProcessed: 0,
      successfulScrapes: 0,
      failedScrapes: 0,
      visualAnalysisCount: 0,
      averageProcessingTime: 0
    };
  }

  /**
   * Start the AI orchestration system
   */
  async start() {
    if (this.isRunning) {
      console.log('⏳ AI Orchestrator already running');
      return;
    }

    try {
      this.isRunning = true;
      console.log('🚀 Starting AI Orchestrator');

      // Start periodic queue processing
      this.startQueueProcessor();
      
      // Set up event listeners
      this.setupEventListeners();

      // Emit startup event
      this.emit('started', {
        timestamp: new Date().toISOString(),
        enabledServices: {
          claudeQueue: this.config.enableClaudeQueue,
          visualAnalysis: this.config.enableVisualAnalysis
        }
      });

      console.log('✅ AI Orchestrator started successfully');
    } catch (error) {
      console.error('❌ Failed to start AI Orchestrator:', error);
      this.isRunning = false;
      throw error;
    }
  }

  /**
   * Stop the AI orchestration system
   */
  async stop() {
    console.log('🛑 Stopping AI Orchestrator');
    
    this.isRunning = false;
    
    if (this.queueProcessor) {
      clearInterval(this.queueProcessor);
    }

    // Stop Claude queue manager
    if (this.config.enableClaudeQueue) {
      await this.claudeQueue.stop();
    }

    this.emit('stopped', {
      timestamp: new Date().toISOString(),
      finalStats: this.processingStats
    });

    console.log('✅ AI Orchestrator stopped');
  }

  /**
   * Process apartment websites with AI analysis
   */
  async processApartmentWebsites(websites, options = {}) {
    const startTime = Date.now();
    
    try {
      console.log(`🏢 Processing ${websites.length} apartment websites`);

      const results = {
        websites: websites.length,
        visualAnalysisResults: [],
        queuedProperties: [],
        errors: [],
        processingTime: 0
      };

      // Step 1: Visual analysis (if enabled)
      if (this.config.enableVisualAnalysis && options.performVisualAnalysis !== false) {
        console.log('👁️ Starting visual analysis phase...');
        
        for (const website of websites) {
          try {
            // Take screenshot and analyze
            const screenshotPath = await this.captureWebsiteScreenshot(website);
            
            const visualAnalysis = await this.gpt4vAnalyzer.analyzeWebpageScreenshot(
              screenshotPath, 
              website,
              options.visualAnalysisOptions || {}
            );

            results.visualAnalysisResults.push({
              website: website.url,
              analysis: visualAnalysis,
              screenshotPath
            });

            // Extract properties from visual analysis
            const extractedProperties = this.extractPropertiesFromAnalysis(
              visualAnalysis, 
              website
            );

            // Step 2: Queue properties for scraping (if enabled)
            if (this.config.enableClaudeQueue && extractedProperties.length > 0) {
              const queuedItems = await this.claudeQueue.enqueueProperties(
                extractedProperties,
                options.queueOptions || {}
              );
              
              results.queuedProperties.push(...queuedItems);
            }

            this.processingStats.visualAnalysisCount++;

          } catch (error) {
            console.error(`❌ Error processing ${website.url}:`, error);
            results.errors.push({
              website: website.url,
              error: error.message,
              type: 'processing_error'
            });
          }
        }
      }

      // Step 3: Process queue if properties were added
      if (this.config.enableClaudeQueue && results.queuedProperties.length > 0) {
        console.log('🔄 Processing Claude AI queue...');
        await this.claudeQueue.processQueue();
      }

      results.processingTime = Date.now() - startTime;
      this.processingStats.totalProcessed += websites.length;

      console.log(`✅ Processed ${websites.length} websites in ${results.processingTime}ms`);
      
      this.emit('websitesProcessed', results);
      return results;

    } catch (error) {
      console.error('❌ Error processing apartment websites:', error);
      this.emit('processingError', error);
      throw error;
    }
  }

  /**
   * Add properties directly to Claude queue
   */
  async queuePropertiesForScraping(properties, options = {}) {
    if (!this.config.enableClaudeQueue) {
      throw new Error('Claude queue is disabled');
    }

    try {
      console.log(`📝 Queueing ${properties.length} properties for scraping`);
      
      const queuedItems = await this.claudeQueue.enqueueProperties(properties, options);
      
      // Start processing if orchestrator is running
      if (this.isRunning) {
        await this.claudeQueue.processQueue();
      }

      return queuedItems;
    } catch (error) {
      console.error('❌ Error queueing properties:', error);
      throw error;
    }
  }

  /**
   * Analyze website screenshots with GPT-4V
   */
  async analyzeWebsiteVisuals(screenshots, websiteInfo, options = {}) {
    if (!this.config.enableVisualAnalysis) {
      throw new Error('Visual analysis is disabled');
    }

    try {
      console.log(`🔍 Analyzing ${screenshots.length} screenshots`);
      
      const results = await this.gpt4vAnalyzer.analyzeBatch(
        screenshots, 
        websiteInfo, 
        options
      );

      this.processingStats.visualAnalysisCount += screenshots.length;
      return results;
    } catch (error) {
      console.error('❌ Error analyzing visuals:', error);
      throw error;
    }
  }

  /**
   * Get comprehensive system statistics
   */
  async getSystemStats() {
    try {
      const [claudeStats, gpt4vStats] = await Promise.all([
        this.config.enableClaudeQueue ? this.claudeQueue.getQueueStats() : {},
        this.config.enableVisualAnalysis ? this.gpt4vAnalyzer.getAnalysisStats() : {}
      ]);

      return {
        orchestrator: {
          isRunning: this.isRunning,
          ...this.processingStats,
          uptime: this.isRunning ? Date.now() - this.startTime : 0
        },
        claudeQueue: claudeStats,
        visualAnalysis: gpt4vStats,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      console.error('❌ Error getting system stats:', error);
      return { error: error.message };
    }
  }

  /**
   * Extract properties from GPT-4V analysis results
   */
  extractPropertiesFromAnalysis(analysis, website) {
    const properties = [];
    
    try {
      const extractedData = analysis.extracted_data || {};
      const websiteProperties = extractedData.properties || [];

      websiteProperties.forEach((property, index) => {
        properties.push({
          external_id: `${website.url}_${index}`,
          property_id: property.id || `${website.url}_${index}`,
          url: website.url,
          source: website.source || new URL(website.url).hostname,
          website_type: website.type || 'apartment_listing',
          name: property.name,
          price: property.price || property.rent,
          bedrooms: property.bedrooms,
          bathrooms: property.bathrooms,
          square_feet: property.sqft || property.square_feet,
          address: property.address || extractedData.location?.address,
          amenities: property.amenities || extractedData.amenities || [],
          contact_info: extractedData.contact || {},
          visual_analysis_id: analysis.timestamp,
          complexity: this.assessScrapingComplexity(analysis),
          metadata: {
            confidence_score: analysis.confidence_score,
            visual_elements: analysis.visual_elements,
            recommendations: analysis.recommendations,
            extracted_at: new Date().toISOString()
          }
        });
      });

      // If no specific properties found, create a general entry for the website
      if (properties.length === 0 && analysis.confidence_score > 0.3) {
        properties.push({
          external_id: website.url,
          property_id: website.url,
          url: website.url,
          source: website.source || new URL(website.url).hostname,
          website_type: website.type || 'apartment_listing',
          complexity: this.assessScrapingComplexity(analysis),
          visual_analysis_id: analysis.timestamp,
          metadata: {
            confidence_score: analysis.confidence_score,
            visual_elements: analysis.visual_elements,
            recommendations: analysis.recommendations,
            extracted_at: new Date().toISOString(),
            requires_full_scrape: true
          }
        });
      }

    } catch (error) {
      console.warn('⚠️ Error extracting properties from analysis:', error);
    }

    return properties;
  }

  /**
   * Assess scraping complexity based on visual analysis
   */
  assessScrapingComplexity(analysis) {
    try {
      const recommendations = analysis.recommendations || {};
      const confidence = analysis.confidence_score || 0;

      if (confidence > 0.8 && recommendations.scraping_strategy === 'direct') {
        return 'simple';
      } else if (confidence > 0.5 && recommendations.scraping_strategy === 'guided') {
        return 'medium';
      } else {
        return 'complex';
      }
    } catch (error) {
      return 'medium'; // Default fallback
    }
  }

  /**
   * Capture website screenshot for analysis
   */
  async captureWebsiteScreenshot(website) {
    try {
      // This would integrate with your existing screenshot capture system
      // For now, return a placeholder path
      console.log(`📸 Capturing screenshot for ${website.url}`);
      
      // TODO: Implement actual screenshot capture using Playwright/Puppeteer
      // const screenshotPath = await this.screenshotService.capture(website.url);
      
      return `/tmp/screenshots/${new URL(website.url).hostname}_${Date.now()}.png`;
    } catch (error) {
      console.error(`❌ Failed to capture screenshot for ${website.url}:`, error);
      throw error;
    }
  }

  /**
   * Start periodic queue processing
   */
  startQueueProcessor() {
    if (!this.config.enableClaudeQueue) return;

    this.queueProcessor = setInterval(async () => {
      try {
        if (this.isRunning) {
          await this.claudeQueue.processQueue();
        }
      } catch (error) {
        console.error('❌ Error in periodic queue processing:', error);
        this.emit('queueProcessingError', error);
      }
    }, 30000); // Process every 30 seconds

    console.log('⏰ Started periodic queue processor');
  }

  /**
   * Set up event listeners
   */
  setupEventListeners() {
    // Track processing statistics
    this.on('websitesProcessed', (results) => {
      this.processingStats.successfulScrapes += results.queuedProperties.length;
      this.processingStats.failedScrapes += results.errors.length;
      
      // Update average processing time
      const totalTime = this.processingStats.averageProcessingTime * this.processingStats.totalProcessed;
      this.processingStats.averageProcessingTime = 
        (totalTime + results.processingTime) / this.processingStats.totalProcessed;
    });

    // Log important events
    this.on('started', () => console.log('📡 AI Orchestrator event system active'));
    this.on('stopped', () => console.log('📡 AI Orchestrator event system stopped'));
    this.on('processingError', (error) => 
      console.error('📡 Processing error event:', error.message)
    );
  }

  /**
   * Health check for all AI services
   */
  async healthCheck() {
    const health = {
      orchestrator: { status: 'healthy', isRunning: this.isRunning },
      claudeQueue: { status: 'unknown' },
      visualAnalysis: { status: 'unknown' },
      timestamp: new Date().toISOString()
    };

    try {
      // Check Claude Queue health
      if (this.config.enableClaudeQueue) {
        const stats = await this.claudeQueue.getQueueStats();
        health.claudeQueue = {
          status: stats.total !== undefined ? 'healthy' : 'degraded',
          activeBatches: stats.activeBatches || 0,
          queueSize: stats.pending || 0
        };
      } else {
        health.claudeQueue.status = 'disabled';
      }

      // Check GPT-4V health
      if (this.config.enableVisualAnalysis) {
        const stats = await this.gpt4vAnalyzer.getAnalysisStats();
        health.visualAnalysis = {
          status: stats.total !== undefined ? 'healthy' : 'degraded',
          successRate: stats.successRate || 0,
          averageProcessingTime: stats.averageProcessingTime || 0
        };
      } else {
        health.visualAnalysis.status = 'disabled';
      }

      // Overall health
      const overallHealthy = Object.values(health).every(service => 
        service.status === 'healthy' || service.status === 'disabled'
      );
      
      health.overall = overallHealthy ? 'healthy' : 'degraded';

    } catch (error) {
      console.error('❌ Health check error:', error);
      health.overall = 'unhealthy';
      health.error = error.message;
    }

    return health;
  }
}

module.exports = { AIOrchestrator };