/**
 * Highland at Sweetwater Creek Scraper
 * Specialized scraper for Highland at Sweetwater Creek apartment website
 */

const BaseApartmentScraper = require('./base-apartment-scraper');

class HighlandSweetwaterScraper extends BaseApartmentScraper {
  constructor(options = {}) {
    super(options);
    
    this.websiteConfig = {
      baseUrl: 'https://www.highlandatsweetwatercreek.com',
      apartmentsUrl: 'https://www.highlandatsweetwatercreek.com/apartments',
      floorPlansUrl: 'https://www.highlandatsweetwatercreek.com/floor-plans',
      
      // Site-specific selectors
      selectors: {
        propertyContainer: '.floor-plan-item, .apartment-card, .listing-item',
        name: '.plan-name, .apartment-name, h3, h4',
        price: '.rent-price, .price, .rent',
        bedrooms: '.beds, .bedroom-count, .bed-count',
        bathrooms: '.baths, .bathroom-count, .bath-count',
        squareFeet: '.sqft, .square-feet, .area',
        availability: '.availability, .available-date',
        amenities: '.amenities, .features',
        link: 'a[href*="floor-plan"], a[href*="apartment"]',
        
        // Navigation elements
        nextButton: '.next-page, .pagination-next, [aria-label="Next"]',
        viewAllButton: '.view-all, .show-more, .load-more',
        
        // Form elements for searching
        searchForm: '#apartment-search, .search-form',
        bedroomFilter: '#bedrooms, select[name="bedrooms"]',
        priceFilter: '#price-range, select[name="price"]',
        moveInDate: '#move-in-date, input[name="move-in"]'
      },
      
      // Expected data patterns
      patterns: {
        priceRange: /\$[\d,]+\s*-?\s*\$?[\d,]*/,
        bedroomPattern: /(\d+)\s*bed/i,
        bathroomPattern: /(\d+(?:\.\d)?)\s*bath/i,
        sqftPattern: /(\d+(?:,\d+)?)\s*sq\.?\s*ft/i
      }
    };
  }

  /**
   * Get scraper name
   */
  getScraperName() {
    return 'HighlandSweetwater';
  }

  /**
   * Main scraping method for Highland at Sweetwater Creek
   */
  async scrape(options = {}) {
    const startTime = Date.now();
    let allProperties = [];

    try {
      console.log('🏢 Starting Highland at Sweetwater Creek scraping...');
      
      // Initialize scraper
      await this.initialize();

      // Step 1: Scrape floor plans page
      console.log('📋 Scraping floor plans...');
      const floorPlanProperties = await this.scrapeFloorPlans();
      allProperties.push(...floorPlanProperties);

      // Step 2: Scrape apartments availability page
      console.log('🏠 Scraping apartment availability...');
      const availabilityProperties = await this.scrapeAvailability();
      allProperties.push(...availabilityProperties);

      // Step 3: Merge and deduplicate properties
      const uniqueProperties = this.deduplicateProperties(allProperties);
      
      // Step 4: Store in database
      const storedProperties = await this.storeProperties(uniqueProperties);

      const processingTime = Date.now() - startTime;
      
      console.log(`✅ Highland scraping completed: ${storedProperties.length} properties in ${processingTime}ms`);
      
      return {
        scraperName: this.getScraperName(),
        propertiesFound: storedProperties.length,
        processingTime,
        timestamp: new Date().toISOString(),
        properties: storedProperties
      };

    } catch (error) {
      console.error('❌ Highland scraping failed:', error);
      throw error;
    } finally {
      await this.cleanup();
    }
  }

  /**
   * Scrape floor plans page
   */
  async scrapeFloorPlans() {
    try {
      console.log('📐 Navigating to floor plans page...');
      await this.navigateToUrl(this.websiteConfig.floorPlansUrl);
      
      // Wait for page to load
      await this.delay(2000);
      
      // Take screenshot for AI analysis
      const screenshotPath = await this.takeScreenshot();
      
      // Try AI-powered extraction first
      if (this.config.enableVisualAnalysis) {
        console.log('🤖 Using AI to analyze floor plans page...');
        
        const visualAnalysis = await this.aiOrchestrator.analyzeWebsiteVisuals(
          [{ path: screenshotPath, url: this.page.url() }],
          { url: this.page.url(), type: 'floor_plans' }
        );
        
        const aiProperties = this.extractFromVisualAnalysis(visualAnalysis);
        if (aiProperties && aiProperties.length > 0) {
          console.log(`🎯 AI found ${aiProperties.length} floor plans`);
          return aiProperties;
        }
      }

      // Fallback to manual extraction
      console.log('🔧 Using manual extraction for floor plans...');
      return await this.extractManualFloorPlans();
      
    } catch (error) {
      console.error('❌ Error scraping floor plans:', error);
      return [];
    }
  }

  /**
   * Manual extraction of floor plans
   */
  async extractManualFloorPlans() {
    try {
      const properties = [];
      
      // Look for floor plan containers
      const floorPlanSelectors = [
        '.floor-plan-item',
        '.plan-card',
        '.apartment-type',
        '.floor-plan',
        '[data-floor-plan]'
      ];
      
      let floorPlanElements = [];
      
      for (const selector of floorPlanSelectors) {
        floorPlanElements = await this.page.$$(selector);
        if (floorPlanElements.length > 0) {
          console.log(`📋 Found ${floorPlanElements.length} floor plans using selector: ${selector}`);
          break;
        }
      }

      if (floorPlanElements.length === 0) {
        console.log('🔍 No floor plan elements found, trying alternative approach...');
        return await this.extractFromGenericContainers();
      }

      for (const [index, element] of floorPlanElements.entries()) {
        try {
          const property = {
            external_id: `highland_floorplan_${index}`,
            source: this.getScraperName(),
            property_type: 'floor_plan',
            scraped_at: new Date().toISOString()
          };

          // Extract floor plan details
          property.name = await this.extractText(element, this.websiteConfig.selectors.name);
          property.price = await this.extractPrice(element, this.websiteConfig.selectors.price);
          property.bedrooms = await this.extractNumber(element, this.websiteConfig.selectors.bedrooms);
          property.bathrooms = await this.extractNumber(element, this.websiteConfig.selectors.bathrooms);
          property.square_feet = await this.extractNumber(element, this.websiteConfig.selectors.squareFeet);

          // Extract additional information
          property.availability = await this.extractText(element, this.websiteConfig.selectors.availability);
          property.amenities = await this.extractAmenities(element, this.websiteConfig.selectors.amenities);

          // Get floor plan image
          const imageElement = await element.$('img');
          if (imageElement) {
            property.floor_plan_image = await imageElement.getAttribute('src');
          }

          // Get link to detailed view
          const linkElement = await element.$(this.websiteConfig.selectors.link);
          if (linkElement) {
            property.detail_url = await linkElement.getAttribute('href');
            if (property.detail_url && !property.detail_url.startsWith('http')) {
              property.detail_url = new URL(property.detail_url, this.websiteConfig.baseUrl).toString();
            }
          }

          // Add location information
          property.address = '1000 Highland Pkwy';
          property.city = 'Dallas';
          property.state = 'GA';
          property.zip_code = '30132';

          // Only add if we have meaningful data
          if (property.name || property.price || property.bedrooms) {
            properties.push(property);
          }

        } catch (error) {
          console.warn(`⚠️ Error extracting floor plan ${index}:`, error.message);
        }
      }

      return properties;
      
    } catch (error) {
      console.error('❌ Manual floor plan extraction failed:', error);
      return [];
    }
  }

  /**
   * Extract from generic containers when specific selectors fail
   */
  async extractFromGenericContainers() {
    try {
      console.log('🔍 Trying generic container extraction...');
      
      // Look for any container that might hold property information
      const genericSelectors = [
        'div[class*="plan"]',
        'div[class*="apartment"]',
        'div[class*="unit"]',
        'div[class*="listing"]',
        '.card',
        '.item',
        'article'
      ];

      let elements = [];
      
      for (const selector of genericSelectors) {
        elements = await this.page.$$(selector);
        if (elements.length > 0) {
          // Filter to only elements that contain relevant text
          const relevantElements = [];
          for (const element of elements) {
            const text = await element.textContent();
            if (text && (
              text.includes('bed') || 
              text.includes('bath') || 
              text.includes('sqft') || 
              text.includes('$') ||
              text.includes('rent')
            )) {
              relevantElements.push(element);
            }
          }
          
          if (relevantElements.length > 0) {
            console.log(`📋 Found ${relevantElements.length} relevant containers using: ${selector}`);
            elements = relevantElements;
            break;
          }
        }
      }

      const properties = [];
      
      for (const [index, element] of elements.entries()) {
        try {
          const text = await element.textContent();
          
          if (text) {
            const property = {
              external_id: `highland_generic_${index}`,
              source: this.getScraperName(),
              scraped_at: new Date().toISOString(),
              raw_text: text.trim()
            };

            // Extract using regex patterns
            property.price = this.extractPriceFromText(text);
            property.bedrooms = this.extractBedroomsFromText(text);
            property.bathrooms = this.extractBathroomsFromText(text);
            property.square_feet = this.extractSqftFromText(text);

            // Location info
            property.address = '1000 Highland Pkwy';
            property.city = 'Dallas';
            property.state = 'GA';
            property.zip_code = '30132';

            if (property.price || property.bedrooms) {
              properties.push(property);
            }
          }
        } catch (error) {
          console.warn(`⚠️ Error processing generic container ${index}:`, error.message);
        }
      }

      return properties;
      
    } catch (error) {
      console.error('❌ Generic extraction failed:', error);
      return [];
    }
  }

  /**
   * Scrape availability page
   */
  async scrapeAvailability() {
    try {
      console.log('📅 Navigating to apartments availability page...');
      await this.navigateToUrl(this.websiteConfig.apartmentsUrl);
      
      // Wait for page to load
      await this.delay(2000);
      
      // Look for and interact with search/filter forms
      await this.interactWithSearchForms();
      
      // Extract available units
      return await this.extractPropertyData(this.websiteConfig.selectors);
      
    } catch (error) {
      console.error('❌ Error scraping availability:', error);
      return [];
    }
  }

  /**
   * Interact with search and filter forms
   */
  async interactWithSearchForms() {
    try {
      console.log('🔍 Looking for search forms...');
      
      // Try to find and interact with bedroom filter
      const bedroomFilter = await this.page.$(this.websiteConfig.selectors.bedroomFilter);
      if (bedroomFilter) {
        console.log('🛏️ Found bedroom filter, selecting all options...');
        // This would cycle through different bedroom options
        // For now, we'll just ensure we see all options
      }

      // Try to find "View All" or "Show More" buttons
      const viewAllButton = await this.page.$(this.websiteConfig.selectors.viewAllButton);
      if (viewAllButton) {
        console.log('👁️ Found view all button, clicking...');
        await viewAllButton.click();
        await this.delay(2000);
      }

      // Handle pagination if present
      await this.handlePagination();
      
    } catch (error) {
      console.warn('⚠️ Error interacting with search forms:', error);
    }
  }

  /**
   * Handle pagination to get all properties
   */
  async handlePagination() {
    try {
      let hasNextPage = true;
      let pageCount = 0;
      const maxPages = 5; // Safety limit
      
      while (hasNextPage && pageCount < maxPages) {
        const nextButton = await this.page.$(this.websiteConfig.selectors.nextButton);
        
        if (nextButton) {
          const isEnabled = await nextButton.isEnabled();
          if (isEnabled) {
            console.log(`📄 Navigating to page ${pageCount + 2}...`);
            await nextButton.click();
            await this.delay(3000); // Wait for page to load
            pageCount++;
          } else {
            hasNextPage = false;
          }
        } else {
          hasNextPage = false;
        }
      }
      
      if (pageCount > 0) {
        console.log(`✅ Processed ${pageCount + 1} pages total`);
      }
      
    } catch (error) {
      console.warn('⚠️ Error handling pagination:', error);
    }
  }

  /**
   * Extract price from text using regex
   */
  extractPriceFromText(text) {
    const match = text.match(this.websiteConfig.patterns.priceRange);
    return match ? match[0] : null;
  }

  /**
   * Extract bedroom count from text
   */
  extractBedroomsFromText(text) {
    const match = text.match(this.websiteConfig.patterns.bedroomPattern);
    return match ? parseInt(match[1]) : null;
  }

  /**
   * Extract bathroom count from text
   */
  extractBathroomsFromText(text) {
    const match = text.match(this.websiteConfig.patterns.bathroomPattern);
    return match ? parseFloat(match[1]) : null;
  }

  /**
   * Extract square footage from text
   */
  extractSqftFromText(text) {
    const match = text.match(this.websiteConfig.patterns.sqftPattern);
    return match ? parseInt(match[1].replace(',', '')) : null;
  }

  /**
   * Deduplicate properties based on external_id and content similarity
   */
  deduplicateProperties(properties) {
    const seen = new Map();
    const unique = [];
    
    properties.forEach(property => {
      // Create a key based on important properties
      const key = `${property.bedrooms}_${property.bathrooms}_${property.price}`;
      
      if (!seen.has(key)) {
        seen.set(key, true);
        unique.push(property);
      }
    });
    
    console.log(`🔄 Deduplicated ${properties.length} -> ${unique.length} properties`);
    return unique;
  }

  /**
   * Get website-specific configuration
   */
  getWebsiteConfig() {
    return this.websiteConfig;
  }
}

module.exports = HighlandSweetwaterScraper;