/**
 * Alta Northerly Scraper
 * Specialized scraper for Alta Northerly apartment website
 */

const { BaseApartmentScraper } = require('./base-apartment-scraper');

class AltaNortherlyScraper extends BaseApartmentScraper {
  constructor(options = {}) {
    super(options);
    
    this.websiteConfig = {
      baseUrl: 'https://www.altanortherly.com',
      apartmentsUrl: 'https://www.altanortherly.com/apartments',
      floorPlansUrl: 'https://www.altanortherly.com/floor-plans',
      availabilityUrl: 'https://www.altanortherly.com/availability',
      
      // Site-specific selectors
      selectors: {
        propertyContainer: '.floor-plan, .unit-card, .apartment-listing, .property-item',
        name: '.floor-plan-name, .unit-name, .plan-title, h3, h4',
        price: '.rent, .price, .rental-price, .starting-at',
        bedrooms: '.beds, .bedrooms, .bed-count',
        bathrooms: '.baths, .bathrooms, .bath-count', 
        squareFeet: '.sqft, .square-feet, .sq-ft, .area',
        availability: '.availability, .available, .status',
        amenities: '.amenities, .features, .unit-features',
        link: 'a[href*="floor-plan"], a[href*="unit"], a[href*="apartment"]',
        
        // Navigation and interaction elements
        nextButton: '.next, .pagination-next, [aria-label="Next"]',
        prevButton: '.prev, .pagination-prev, [aria-label="Previous"]',
        viewAllButton: '.view-all, .show-all, .see-all',
        loadMoreButton: '.load-more, .show-more',
        
        // Form elements
        searchForm: '.search-form, #apartment-search',
        bedroomFilter: 'select[name*="bedroom"], #bedrooms',
        bathroomFilter: 'select[name*="bathroom"], #bathrooms', 
        priceFilter: 'select[name*="price"], #price-range',
        moveInFilter: 'input[name*="move"], #move-in-date',
        submitButton: 'button[type="submit"], .search-button'
      },
      
      // Expected data patterns for Alta properties
      patterns: {
        priceRange: /\$[\d,]+(?:\s*-\s*\$?[\d,]+)?/,
        bedroomPattern: /(\d+)\s*(?:bed|bedroom|br)/i,
        bathroomPattern: /(\d+(?:\.\d)?)\s*(?:bath|bathroom|ba)/i,
        sqftPattern: /(\d+(?:,\d+)?)\s*(?:sq\.?\s*ft\.?|square\s*feet)/i,
        availabilityPattern: /(available|now|immediate|\d+\/\d+\/\d+)/i
      }
    };
  }

  /**
   * Get scraper name
   */
  getScraperName() {
    return 'AltaNortherly';
  }

  /**
   * Main scraping method for Alta Northerly
   */
  async scrape(options = {}) {
    const startTime = Date.now();
    let allProperties = [];

    try {
      console.log('🏢 Starting Alta Northerly scraping...');
      
      // Initialize scraper
      await this.initialize();

      // Step 1: Scrape floor plans
      console.log('📋 Scraping floor plans...');
      const floorPlanProperties = await this.scrapeFloorPlans();
      allProperties.push(...floorPlanProperties);

      // Step 2: Scrape current availability
      console.log('📅 Scraping availability...');
      const availabilityProperties = await this.scrapeAvailability();
      allProperties.push(...availabilityProperties);

      // Step 3: Scrape general apartments page
      console.log('🏠 Scraping apartments page...');
      const apartmentProperties = await this.scrapeApartmentsPage();
      allProperties.push(...apartmentProperties);

      // Step 4: Merge and deduplicate
      const uniqueProperties = this.deduplicateProperties(allProperties);
      
      // Step 5: Store in database
      const storedProperties = await this.storeProperties(uniqueProperties);

      const processingTime = Date.now() - startTime;
      
      console.log(`✅ Alta Northerly scraping completed: ${storedProperties.length} properties in ${processingTime}ms`);
      
      return {
        scraperName: this.getScraperName(),
        propertiesFound: storedProperties.length,
        processingTime,
        timestamp: new Date().toISOString(),
        properties: storedProperties
      };

    } catch (error) {
      console.error('❌ Alta Northerly scraping failed:', error);
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
      
      // Wait for content to load
      await this.delay(3000);
      
      // Take screenshot for AI analysis
      const screenshotPath = await this.takeScreenshot();
      
      // Try AI-powered extraction first
      if (this.config.enableVisualAnalysis) {
        console.log('🤖 Using AI to analyze floor plans...');
        
        const visualAnalysis = await this.aiOrchestrator.analyzeWebsiteVisuals(
          [{ path: screenshotPath, url: this.page.url() }],
          { url: this.page.url(), type: 'floor_plans' }
        );
        
        const aiProperties = this.extractFromVisualAnalysis(visualAnalysis);
        if (aiProperties && aiProperties.length > 0) {
          console.log(`🎯 AI found ${aiProperties.length} floor plans`);
          return this.enhancePropertiesWithLocation(aiProperties);
        }
      }

      // Fallback to manual extraction
      console.log('🔧 Using manual extraction...');
      const manualProperties = await this.extractManualFloorPlans();
      return this.enhancePropertiesWithLocation(manualProperties);
      
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
      
      // Try multiple selectors for floor plan containers
      const floorPlanSelectors = [
        '.floor-plan',
        '.plan-card',
        '.unit-type',
        '.apartment-type',
        '[data-plan]',
        '.pricing-card'
      ];
      
      let elements = await this.findElementsWithSelectors(floorPlanSelectors);
      
      if (elements.length === 0) {
        console.log('🔍 No specific floor plan elements found, trying generic extraction...');
        return await this.extractFromGenericContainers();
      }

      console.log(`📋 Found ${elements.length} floor plan elements`);

      for (const [index, element] of elements.entries()) {
        try {
          const property = {
            external_id: `alta_northerly_plan_${index}`,
            source: this.getScraperName(),
            property_type: 'floor_plan',
            scraped_at: new Date().toISOString()
          };

          // Extract basic information
          property.name = await this.extractText(element, this.websiteConfig.selectors.name);
          property.price = await this.extractPrice(element, this.websiteConfig.selectors.price);
          property.bedrooms = await this.extractNumber(element, this.websiteConfig.selectors.bedrooms);
          property.bathrooms = await this.extractNumber(element, this.websiteConfig.selectors.bathrooms);
          property.square_feet = await this.extractNumber(element, this.websiteConfig.selectors.squareFeet);

          // Extract additional details
          property.availability = await this.extractText(element, this.websiteConfig.selectors.availability);
          property.amenities = await this.extractAmenities(element, this.websiteConfig.selectors.amenities);

          // Get images
          const imageElement = await element.$('img');
          if (imageElement) {
            property.floor_plan_image = await imageElement.getAttribute('src');
            if (property.floor_plan_image && !property.floor_plan_image.startsWith('http')) {
              property.floor_plan_image = new URL(property.floor_plan_image, this.websiteConfig.baseUrl).toString();
            }
          }

          // Get detail link
          const linkElement = await element.$(this.websiteConfig.selectors.link);
          if (linkElement) {
            property.detail_url = await linkElement.getAttribute('href');
            if (property.detail_url && !property.detail_url.startsWith('http')) {
              property.detail_url = new URL(property.detail_url, this.websiteConfig.baseUrl).toString();
            }
          }

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
   * Scrape availability page
   */
  async scrapeAvailability() {
    try {
      console.log('📅 Navigating to availability page...');
      await this.navigateToUrl(this.websiteConfig.availabilityUrl);
      
      // Wait for content to load
      await this.delay(3000);
      
      // Handle any search forms or filters
      await this.interactWithAvailabilityFilters();
      
      // Extract available units
      const properties = await this.extractPropertyData(this.websiteConfig.selectors);
      
      return this.enhancePropertiesWithLocation(properties.map(prop => ({
        ...prop,
        external_id: `alta_northerly_avail_${prop.external_id}`,
        property_type: 'available_unit'
      })));
      
    } catch (error) {
      console.error('❌ Error scraping availability:', error);
      return [];
    }
  }

  /**
   * Scrape general apartments page
   */
  async scrapeApartmentsPage() {
    try {
      console.log('🏠 Navigating to apartments page...');
      await this.navigateToUrl(this.websiteConfig.apartmentsUrl);
      
      // Wait for content to load
      await this.delay(3000);
      
      // Try to expand all content
      await this.expandAllContent();
      
      // Extract property information
      const properties = await this.extractPropertyData(this.websiteConfig.selectors);
      
      return this.enhancePropertiesWithLocation(properties.map(prop => ({
        ...prop,
        external_id: `alta_northerly_apt_${prop.external_id}`,
        property_type: 'apartment_listing'
      })));
      
    } catch (error) {
      console.error('❌ Error scraping apartments page:', error);
      return [];
    }
  }

  /**
   * Interact with availability filters
   */
  async interactWithAvailabilityFilters() {
    try {
      console.log('🔍 Looking for availability filters...');
      
      // Try to find and use filters to show all available units
      const filters = [
        this.websiteConfig.selectors.bedroomFilter,
        this.websiteConfig.selectors.bathroomFilter,
        this.websiteConfig.selectors.priceFilter
      ];

      for (const filterSelector of filters) {
        try {
          const filter = await this.page.$(filterSelector);
          if (filter) {
            console.log(`🎛️ Found filter: ${filterSelector}`);
            // For now, we'll just verify it exists
            // In a real implementation, you might interact with it
          }
        } catch (error) {
          // Filter not found, continue
        }
      }

      // Look for "View All" type buttons
      const viewAllButton = await this.page.$(this.websiteConfig.selectors.viewAllButton);
      if (viewAllButton) {
        console.log('👁️ Found view all button, clicking...');
        await viewAllButton.click();
        await this.delay(2000);
      }

      // Handle load more buttons
      await this.handleLoadMore();
      
    } catch (error) {
      console.warn('⚠️ Error interacting with availability filters:', error);
    }
  }

  /**
   * Expand all content on the page
   */
  async expandAllContent() {
    try {
      console.log('📖 Expanding all content...');
      
      // Look for and click "Load More" or "Show More" buttons
      await this.handleLoadMore();
      
      // Look for expandable sections
      const expandButtons = await this.page.$$('[aria-expanded="false"], .expand, .show-more');
      
      for (const button of expandButtons) {
        try {
          const isVisible = await button.isVisible();
          if (isVisible) {
            await button.click();
            await this.delay(1000);
          }
        } catch (error) {
          // Button might not be clickable, continue
        }
      }
      
    } catch (error) {
      console.warn('⚠️ Error expanding content:', error);
    }
  }

  /**
   * Handle load more buttons
   */
  async handleLoadMore() {
    try {
      let loadMoreAttempts = 0;
      const maxAttempts = 5;
      
      while (loadMoreAttempts < maxAttempts) {
        const loadMoreButton = await this.page.$(this.websiteConfig.selectors.loadMoreButton);
        
        if (loadMoreButton) {
          const isVisible = await loadMoreButton.isVisible();
          const isEnabled = await loadMoreButton.isEnabled();
          
          if (isVisible && isEnabled) {
            console.log(`📄 Clicking load more button (attempt ${loadMoreAttempts + 1})...`);
            await loadMoreButton.click();
            await this.delay(3000); // Wait for content to load
            loadMoreAttempts++;
          } else {
            break;
          }
        } else {
          break;
        }
      }
      
      if (loadMoreAttempts > 0) {
        console.log(`✅ Successfully loaded ${loadMoreAttempts} additional sections`);
      }
      
    } catch (error) {
      console.warn('⚠️ Error handling load more:', error);
    }
  }

  /**
   * Find elements using multiple selectors
   */
  async findElementsWithSelectors(selectors) {
    for (const selector of selectors) {
      try {
        const elements = await this.page.$$(selector);
        if (elements.length > 0) {
          console.log(`📋 Found ${elements.length} elements using selector: ${selector}`);
          return elements;
        }
      } catch (error) {
        // Selector failed, try next one
      }
    }
    return [];
  }

  /**
   * Extract from generic containers when specific selectors fail
   */
  async extractFromGenericContainers() {
    try {
      console.log('🔍 Trying generic container extraction...');
      
      const genericSelectors = [
        'div[class*="plan"]',
        'div[class*="unit"]', 
        'div[class*="apartment"]',
        'div[class*="pricing"]',
        '.card',
        '.item',
        'article',
        'section'
      ];

      const elements = await this.findElementsWithSelectors(genericSelectors);
      
      if (elements.length === 0) {
        console.log('⚠️ No generic containers found');
        return [];
      }

      const properties = [];
      
      // Filter elements that contain apartment-related content
      const relevantElements = [];
      for (const element of elements) {
        try {
          const text = await element.textContent();
          if (text && this.containsApartmentData(text)) {
            relevantElements.push(element);
          }
        } catch (error) {
          // Skip this element
        }
      }

      console.log(`📋 Found ${relevantElements.length} relevant containers`);

      for (const [index, element] of relevantElements.entries()) {
        try {
          const text = await element.textContent();
          
          if (text) {
            const property = {
              external_id: `alta_northerly_generic_${index}`,
              source: this.getScraperName(),
              scraped_at: new Date().toISOString(),
              raw_text: text.trim()
            };

            // Extract using regex patterns
            property.price = this.extractPriceFromText(text);
            property.bedrooms = this.extractBedroomsFromText(text);
            property.bathrooms = this.extractBathroomsFromText(text);
            property.square_feet = this.extractSqftFromText(text);
            property.availability = this.extractAvailabilityFromText(text);

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
   * Check if text contains apartment-related data
   */
  containsApartmentData(text) {
    const apartmentKeywords = [
      'bed', 'bath', 'sqft', 'sq ft', 'rent', '$', 
      'apartment', 'unit', 'floor plan', 'available'
    ];
    
    const lowerText = text.toLowerCase();
    return apartmentKeywords.some(keyword => lowerText.includes(keyword));
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
   * Extract availability from text
   */
  extractAvailabilityFromText(text) {
    const match = text.match(this.websiteConfig.patterns.availabilityPattern);
    return match ? match[0] : null;
  }

  /**
   * Enhance properties with location information
   */
  enhancePropertiesWithLocation(properties) {
    return properties.map(property => ({
      ...property,
      address: property.address || '1001 Northside Dr NW',
      city: property.city || 'Atlanta',
      state: property.state || 'GA',
      zip_code: property.zip_code || '30309'
    }));
  }

  /**
   * Deduplicate properties
   */
  deduplicateProperties(properties) {
    const seen = new Map();
    const unique = [];
    
    properties.forEach(property => {
      // Create a more sophisticated key for Alta properties
      const key = `${property.bedrooms}_${property.bathrooms}_${property.price}_${property.name}`;
      
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

module.exports = { AltaNortherlyScraper };