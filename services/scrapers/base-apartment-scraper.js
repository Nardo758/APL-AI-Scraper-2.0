/**
 * Base Apartment Scraper - Foundation for apartment website scrapers
 * Provides common functionality and AI integration for apartment-specific scraping
 */

const { chromium } = require('playwright');
const { createClient } = require('@supabase/supabase-js');
const { AIOrchestrator } = require('../ai/ai-orchestrator');
const EventEmitter = require('events');

class BaseApartmentScraper extends EventEmitter {
  constructor(options = {}) {
    super();
    
    this.config = {
      // Browser configuration
      headless: options.headless !== false,
      timeout: options.timeout || 30000,
      userAgent: options.userAgent || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      viewport: options.viewport || { width: 1920, height: 1080 },
      
      // Scraping configuration
      maxRetries: options.maxRetries || 3,
      retryDelay: options.retryDelay || 2000,
      maxProperties: options.maxProperties || 100,
      
      // AI integration
      enableVisualAnalysis: options.enableVisualAnalysis !== false,
      enableAIAssistance: options.enableAIAssistance !== false,
      screenshotOnError: options.screenshotOnError !== false,
      
      // Rate limiting
      requestDelay: options.requestDelay || 1000,
      respectRobotsTxt: options.respectRobotsTxt !== false,
      
      ...options.config
    };

    this.supabase = options.supabase || createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_KEY
    );

    // Initialize AI orchestrator
    this.aiOrchestrator = new AIOrchestrator({
      supabase: this.supabase,
      ...options.aiConfig
    });

    this.browser = null;
    this.page = null;
    this.isRunning = false;
    this.stats = {
      totalRequests: 0,
      successfulScrapes: 0,
      failedScrapes: 0,
      propertiesFound: 0,
      averageResponseTime: 0,
      startTime: null
    };
  }

  /**
   * Initialize the scraper
   */
  async initialize() {
    try {
      console.log(`🚀 Initializing ${this.getScraperName()} scraper`);
      
      this.stats.startTime = Date.now();
      
      // Launch browser
      this.browser = await chromium.launch({
        headless: this.config.headless,
        args: [
          '--no-sandbox',
          '--disable-dev-shm-usage',
          '--disable-blink-features=AutomationControlled'
        ]
      });

      // Create browser context with stealth settings
      const context = await this.browser.newContext({
        userAgent: this.config.userAgent,
        viewport: this.config.viewport,
        extraHTTPHeaders: {
          'Accept-Language': 'en-US,en;q=0.9'
        }
      });

      this.page = await context.newPage();
      
      // Set up page event listeners
      this.setupPageListeners();

      // Initialize AI orchestrator
      if (this.config.enableAIAssistance) {
        await this.aiOrchestrator.start();
      }

      this.isRunning = true;
      console.log(`✅ ${this.getScraperName()} scraper initialized successfully`);
      
      this.emit('initialized', { scraperName: this.getScraperName() });
      
    } catch (error) {
      console.error(`❌ Failed to initialize ${this.getScraperName()} scraper:`, error);
      throw error;
    }
  }

  /**
   * Main scraping method - to be implemented by child classes
   */
  async scrape(options = {}) {
    throw new Error('scrape() method must be implemented by child class');
  }

  /**
   * Navigate to a URL with error handling and retry logic
   */
  async navigateToUrl(url, options = {}) {
    const startTime = Date.now();
    let attempt = 0;
    
    while (attempt < this.config.maxRetries) {
      try {
        console.log(`🌐 Navigating to ${url} (attempt ${attempt + 1})`);
        
        const response = await this.page.goto(url, {
          timeout: this.config.timeout,
          waitUntil: 'domcontentloaded',
          ...options
        });

        // Check if navigation was successful
        if (response && response.status() < 400) {
          const responseTime = Date.now() - startTime;
          this.updateStats('navigation', responseTime, true);
          
          console.log(`✅ Successfully navigated to ${url} (${responseTime}ms)`);
          return response;
        } else {
          throw new Error(`HTTP ${response?.status()} ${response?.statusText()}`);
        }

      } catch (error) {
        attempt++;
        console.warn(`⚠️ Navigation attempt ${attempt} failed for ${url}:`, error.message);
        
        if (attempt >= this.config.maxRetries) {
          this.updateStats('navigation', Date.now() - startTime, false);
          
          // Take screenshot on final failure if enabled
          if (this.config.screenshotOnError) {
            await this.takeErrorScreenshot(`navigation_error_${Date.now()}`);
          }
          
          throw new Error(`Failed to navigate to ${url} after ${this.config.maxRetries} attempts: ${error.message}`);
        }
        
        // Wait before retry
        await this.delay(this.config.retryDelay * attempt);
      }
    }
  }

  /**
   * Wait for an element with retry logic
   */
  async waitForElement(selector, options = {}) {
    const timeout = options.timeout || this.config.timeout;
    const visible = options.visible !== false;
    
    try {
      console.log(`⏳ Waiting for element: ${selector}`);
      
      const element = await this.page.waitForSelector(selector, {
        timeout,
        state: visible ? 'visible' : 'attached'
      });
      
      console.log(`✅ Found element: ${selector}`);
      return element;
      
    } catch (error) {
      console.warn(`⚠️ Element not found: ${selector} (${error.message})`);
      
      // Take screenshot for debugging
      if (this.config.screenshotOnError) {
        await this.takeErrorScreenshot(`element_not_found_${Date.now()}`);
      }
      
      throw error;
    }
  }

  /**
   * Extract property data from current page
   */
  async extractPropertyData(selectors = {}) {
    try {
      console.log('📊 Extracting property data from current page');
      
      // Use AI visual analysis if enabled
      if (this.config.enableVisualAnalysis) {
        const screenshotPath = await this.takeScreenshot();
        const visualAnalysis = await this.aiOrchestrator.analyzeWebsiteVisuals(
          [{ path: screenshotPath, url: this.page.url() }],
          { url: this.page.url(), type: 'apartment_listing' }
        );
        
        // Extract properties from visual analysis
        const aiExtractedData = this.extractFromVisualAnalysis(visualAnalysis);
        if (aiExtractedData && aiExtractedData.length > 0) {
          console.log(`🤖 AI extracted ${aiExtractedData.length} properties`);
          return aiExtractedData;
        }
      }

      // Fallback to manual extraction using selectors
      return await this.extractManually(selectors);
      
    } catch (error) {
      console.error('❌ Error extracting property data:', error);
      throw error;
    }
  }

  /**
   * Manual data extraction using CSS selectors
   */
  async extractManually(selectors) {
    try {
      const properties = [];
      
      // Get property containers
      const propertyElements = await this.page.$$(selectors.propertyContainer || '.property, .listing, .unit');
      
      console.log(`📋 Found ${propertyElements.length} property elements`);
      
      for (const [index, element] of propertyElements.entries()) {
        try {
          const property = {
            external_id: `${this.page.url()}_${index}`,
            url: this.page.url(),
            source: this.getScraperName(),
            scraped_at: new Date().toISOString()
          };

          // Extract basic property information
          property.name = await this.extractText(element, selectors.name || '.name, .title, h2, h3');
          property.price = await this.extractPrice(element, selectors.price || '.price, .rent, .cost');
          property.bedrooms = await this.extractNumber(element, selectors.bedrooms || '.beds, .bedroom, .br');
          property.bathrooms = await this.extractNumber(element, selectors.bathrooms || '.baths, .bathroom, .ba');
          property.square_feet = await this.extractNumber(element, selectors.squareFeet || '.sqft, .square-feet, .size');
          
          // Extract additional details
          property.address = await this.extractText(element, selectors.address || '.address, .location');
          property.availability = await this.extractText(element, selectors.availability || '.available, .availability');
          property.phone = await this.extractText(element, selectors.phone || '.phone, .contact');
          
          // Extract amenities
          property.amenities = await this.extractAmenities(element, selectors.amenities || '.amenities, .features');
          
          // Get property URL if available
          const linkElement = await element.$(selectors.link || 'a[href]');
          if (linkElement) {
            property.property_url = await linkElement.getAttribute('href');
            if (property.property_url && !property.property_url.startsWith('http')) {
              property.property_url = new URL(property.property_url, this.page.url()).toString();
            }
          }

          // Only add if we have essential data
          if (property.name || property.price || property.bedrooms) {
            properties.push(property);
          }

        } catch (error) {
          console.warn(`⚠️ Error extracting property ${index}:`, error.message);
        }
      }

      return properties;
      
    } catch (error) {
      console.error('❌ Manual extraction failed:', error);
      return [];
    }
  }

  /**
   * Extract properties from visual analysis results
   */
  extractFromVisualAnalysis(analysisResults) {
    try {
      if (!analysisResults || analysisResults.length === 0) return [];
      
      const properties = [];
      
      analysisResults.forEach((result, index) => {
        if (result.status === 'fulfilled' && result.value) {
          const analysis = result.value;
          const extractedData = analysis.extracted_data || {};
          
          if (extractedData.properties && extractedData.properties.length > 0) {
            extractedData.properties.forEach((prop, propIndex) => {
              properties.push({
                external_id: `${this.page.url()}_ai_${index}_${propIndex}`,
                url: this.page.url(),
                source: this.getScraperName(),
                extraction_method: 'ai_visual',
                confidence_score: analysis.confidence_score,
                visual_analysis_id: analysis.timestamp,
                scraped_at: new Date().toISOString(),
                ...prop
              });
            });
          }
        }
      });

      return properties;
      
    } catch (error) {
      console.warn('⚠️ Error extracting from visual analysis:', error);
      return [];
    }
  }

  /**
   * Extract text content from element
   */
  async extractText(element, selector) {
    try {
      const textElement = selector ? await element.$(selector) : element;
      if (textElement) {
        const text = await textElement.textContent();
        return text ? text.trim() : null;
      }
      return null;
    } catch (error) {
      return null;
    }
  }

  /**
   * Extract price from element
   */
  async extractPrice(element, selector) {
    try {
      const text = await this.extractText(element, selector);
      if (text) {
        const priceMatch = text.match(/\$[\d,]+(?:\.\d{2})?/);
        return priceMatch ? priceMatch[0] : text;
      }
      return null;
    } catch (error) {
      return null;
    }
  }

  /**
   * Extract number from element
   */
  async extractNumber(element, selector) {
    try {
      const text = await this.extractText(element, selector);
      if (text) {
        const numberMatch = text.match(/(\d+(?:\.\d+)?)/);
        return numberMatch ? parseFloat(numberMatch[1]) : null;
      }
      return null;
    } catch (error) {
      return null;
    }
  }

  /**
   * Extract amenities list
   */
  async extractAmenities(element, selector) {
    try {
      const amenityElements = await element.$$(selector + ' li, ' + selector + ' span, ' + selector + ' div');
      const amenities = [];
      
      for (const amenityElement of amenityElements) {
        const text = await amenityElement.textContent();
        if (text && text.trim()) {
          amenities.push(text.trim());
        }
      }
      
      return amenities;
    } catch (error) {
      return [];
    }
  }

  /**
   * Take screenshot for debugging or AI analysis
   */
  async takeScreenshot(filename = null) {
    try {
      const path = filename || `/tmp/screenshots/${this.getScraperName()}_${Date.now()}.png`;
      await this.page.screenshot({ path, fullPage: true });
      console.log(`📸 Screenshot saved: ${path}`);
      return path;
    } catch (error) {
      console.warn('⚠️ Failed to take screenshot:', error);
      return null;
    }
  }

  /**
   * Take screenshot on error for debugging
   */
  async takeErrorScreenshot(identifier) {
    const filename = `/tmp/error_screenshots/${this.getScraperName()}_${identifier}.png`;
    return await this.takeScreenshot(filename);
  }

  /**
   * Store extracted properties in database
   */
  async storeProperties(properties) {
    try {
      if (!properties || properties.length === 0) {
        console.log('📊 No properties to store');
        return [];
      }

      console.log(`💾 Storing ${properties.length} properties in database`);
      
      // Normalize property data
      const normalizedProperties = properties.map(property => ({
        external_id: property.external_id,
        name: property.name,
        address: property.address,
        city: property.city,
        state: property.state,
        zip_code: property.zip_code,
        rent_min: this.parsePrice(property.price),
        rent_max: this.parsePrice(property.price),
        bedrooms: property.bedrooms,
        bathrooms: property.bathrooms,
        square_feet: property.square_feet,
        property_type: 'apartment',
        availability_status: property.availability || 'unknown',
        phone: property.phone,
        email: property.email,
        website_url: property.property_url || property.url,
        amenities: property.amenities || [],
        images: property.images || [],
        source_website: this.getScraperName(),
        last_scraped_at: new Date().toISOString(),
        confidence_score: property.confidence_score,
        extraction_method: property.extraction_method || 'manual',
        raw_data: property
      }));

      const { data, error } = await this.supabase
        .from('scraped_properties')
        .upsert(normalizedProperties, {
          onConflict: 'external_id',
          ignoreDuplicates: false
        })
        .select();

      if (error) throw error;

      console.log(`✅ Successfully stored ${data.length} properties`);
      this.stats.propertiesFound += data.length;
      
      return data;
      
    } catch (error) {
      console.error('❌ Error storing properties:', error);
      throw error;
    }
  }

  /**
   * Parse price string to number
   */
  parsePrice(priceStr) {
    if (!priceStr) return null;
    
    const cleanPrice = priceStr.replace(/[^\d.]/g, '');
    const price = parseFloat(cleanPrice);
    
    return isNaN(price) ? null : price;
  }

  /**
   * Update scraper statistics
   */
  updateStats(operation, responseTime, success) {
    this.stats.totalRequests++;
    
    if (success) {
      this.stats.successfulScrapes++;
    } else {
      this.stats.failedScrapes++;
    }

    // Update average response time
    const totalTime = this.stats.averageResponseTime * (this.stats.totalRequests - 1);
    this.stats.averageResponseTime = (totalTime + responseTime) / this.stats.totalRequests;
  }

  /**
   * Setup page event listeners
   */
  setupPageListeners() {
    this.page.on('response', (response) => {
      if (response.status() >= 400) {
        console.warn(`⚠️ HTTP ${response.status()} ${response.statusText()} - ${response.url()}`);
      }
    });

    this.page.on('console', (msg) => {
      if (msg.type() === 'error') {
        console.warn(`🌐 Browser console error: ${msg.text()}`);
      }
    });

    this.page.on('pageerror', (error) => {
      console.warn(`🌐 Page error: ${error.message}`);
    });
  }

  /**
   * Delay execution
   */
  async delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get scraper name - to be implemented by child classes
   */
  getScraperName() {
    return 'BaseScraper';
  }

  /**
   * Get scraper statistics
   */
  getStats() {
    return {
      ...this.stats,
      uptime: this.stats.startTime ? Date.now() - this.stats.startTime : 0,
      successRate: this.stats.totalRequests > 0 ? 
        (this.stats.successfulScrapes / this.stats.totalRequests * 100) : 0
    };
  }

  /**
   * Cleanup resources
   */
  async cleanup() {
    try {
      console.log(`🧹 Cleaning up ${this.getScraperName()} scraper`);
      
      this.isRunning = false;
      
      if (this.aiOrchestrator) {
        await this.aiOrchestrator.stop();
      }
      
      if (this.page) {
        await this.page.close();
      }
      
      if (this.browser) {
        await this.browser.close();
      }
      
      this.emit('cleanup', { scraperName: this.getScraperName(), stats: this.getStats() });
      console.log(`✅ ${this.getScraperName()} scraper cleanup completed`);
      
    } catch (error) {
      console.error(`❌ Error during cleanup: ${error.message}`);
    }
  }
}

module.exports = BaseApartmentScraper;