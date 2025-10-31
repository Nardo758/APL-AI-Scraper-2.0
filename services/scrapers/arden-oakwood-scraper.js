/**
 * The Arden Oakwood Scraper
 * Specialized scraper for The Arden Oakwood apartment website
 */

const BaseApartmentScraper = require('./base-apartment-scraper');

class ArdenOakwoodScraper extends BaseApartmentScraper {
  constructor(options = {}) {
    super(options);
    
    this.websiteConfig = {
      baseUrl: 'https://www.theardenapartments.com',
      apartmentsUrl: 'https://www.theardenapartments.com/apartments',
      floorPlansUrl: 'https://www.theardenapartments.com/floor-plans',
      availabilityUrl: 'https://www.theardenapartments.com/availability',
      
      // Site-specific selectors for Arden Oakwood
      selectors: {
        propertyContainer: '.floor-plan-card, .unit-card, .apartment-card, .property-listing',
        name: '.plan-name, .unit-type, .apartment-name, h3, h4, .title',
        price: '.price, .rent, .rental-rate, .cost, .starting-at',
        bedrooms: '.beds, .bedrooms, .bed-count, .bedroom-info',
        bathrooms: '.baths, .bathrooms, .bath-count, .bathroom-info',
        squareFeet: '.sqft, .square-feet, .sq-ft, .area, .size',
        availability: '.availability, .available, .status, .move-in',
        amenities: '.amenities, .features, .included, .unit-amenities',
        link: 'a[href*="floor-plan"], a[href*="unit"], a[href*="apartment"], a[href*="view"]',
        
        // Navigation elements
        nextButton: '.next, .pagination-next, [aria-label="Next"], .slick-next',
        prevButton: '.prev, .pagination-prev, [aria-label="Previous"], .slick-prev', 
        viewAllButton: '.view-all, .show-all, .see-all-plans, .view-floor-plans',
        loadMoreButton: '.load-more, .show-more, .view-more',
        
        // Form and filter elements
        searchForm: '.search-form, #unit-search, .apartment-search',
        bedroomFilter: 'select[name*="bedroom"], #bedrooms, .bedroom-filter',
        bathroomFilter: 'select[name*="bathroom"], #bathrooms, .bathroom-filter',
        priceFilter: 'select[name*="price"], #price-range, .price-filter',
        moveInFilter: 'input[name*="move"], #move-in-date, .move-in-filter',
        submitButton: 'button[type="submit"], .search-btn, .apply-filters'
      },
      
      // Data extraction patterns for Arden properties
      patterns: {
        priceRange: /\$[\d,]+(?:\s*-\s*\$?[\d,]+)?/,
        bedroomPattern: /(\d+)\s*(?:bed|bedroom|br)\b/i,
        bathroomPattern: /(\d+(?:\.\d)?)\s*(?:bath|bathroom|ba)\b/i,
        sqftPattern: /(\d+(?:,\d+)?)\s*(?:sq\.?\s*ft\.?|square\s*feet)\b/i,
        availabilityPattern: /(available|now|immediate|\d{1,2}\/\d{1,2}\/\d{4}|\d{1,2}-\d{1,2}-\d{4})/i,
        phonePattern: /\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/
      }
    };
  }

  /**
   * Get scraper name
   */
  getScraperName() {
    return 'ArdenOakwood';
  }

  /**
   * Main scraping method for The Arden Oakwood
   */
  async scrape(options = {}) {
    const startTime = Date.now();
    let allProperties = [];

    try {
      console.log('🏢 Starting The Arden Oakwood scraping...');
      
      // Initialize scraper
      await this.initialize();

      // Step 1: Scrape floor plans
      console.log('📋 Scraping floor plans...');
      const floorPlanProperties = await this.scrapeFloorPlans();
      allProperties.push(...floorPlanProperties);

      // Step 2: Scrape availability
      console.log('📅 Scraping availability...');
      const availabilityProperties = await this.scrapeAvailability();
      allProperties.push(...availabilityProperties);

      // Step 3: Scrape apartments page
      console.log('🏠 Scraping apartments page...');
      const apartmentProperties = await this.scrapeApartmentsPage();
      allProperties.push(...apartmentProperties);

      // Step 4: Try alternative pages if main pages don't yield results
      if (allProperties.length === 0) {
        console.log('🔍 Trying alternative extraction methods...');
        const alternativeProperties = await this.scrapeAlternativePages();
        allProperties.push(...alternativeProperties);
      }

      // Step 5: Merge and deduplicate
      const uniqueProperties = this.deduplicateProperties(allProperties);
      
      // Step 6: Store in database
      const storedProperties = await this.storeProperties(uniqueProperties);

      const processingTime = Date.now() - startTime;
      
      console.log(`✅ Arden Oakwood scraping completed: ${storedProperties.length} properties in ${processingTime}ms`);
      
      return {
        scraperName: this.getScraperName(),
        propertiesFound: storedProperties.length,
        processingTime,
        timestamp: new Date().toISOString(),
        properties: storedProperties
      };

    } catch (error) {
      console.error('❌ Arden Oakwood scraping failed:', error);
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
      
      // Handle any interactive elements
      await this.handleInteractiveElements();
      
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
   * Handle interactive elements on the page
   */
  async handleInteractiveElements() {
    try {
      console.log('🎮 Handling interactive elements...');
      
      // Look for and click view all buttons
      const viewAllButton = await this.page.$(this.websiteConfig.selectors.viewAllButton);
      if (viewAllButton) {
        console.log('👁️ Found view all button, clicking...');
        await viewAllButton.click();
        await this.delay(2000);
      }

      // Handle carousel/slider navigation
      await this.handleCarouselNavigation();
      
      // Handle accordion/collapsible sections
      await this.expandCollapsibleSections();
      
      // Handle load more functionality
      await this.handleLoadMore();
      
    } catch (error) {
      console.warn('⚠️ Error handling interactive elements:', error);
    }
  }

  /**
   * Handle carousel or slider navigation
   */
  async handleCarouselNavigation() {
    try {
      console.log('🎠 Checking for carousel navigation...');
      
      let navigationAttempts = 0;
      const maxAttempts = 10;
      
      while (navigationAttempts < maxAttempts) {
        const nextButton = await this.page.$(this.websiteConfig.selectors.nextButton);
        
        if (nextButton) {
          const isVisible = await nextButton.isVisible();
          const isEnabled = await nextButton.isEnabled();
          
          if (isVisible && isEnabled) {
            console.log(`➡️ Navigating carousel (attempt ${navigationAttempts + 1})...`);
            await nextButton.click();
            await this.delay(1500);
            navigationAttempts++;
          } else {
            break;
          }
        } else {
          break;
        }
      }
      
      if (navigationAttempts > 0) {
        console.log(`✅ Navigated through ${navigationAttempts} carousel slides`);
      }
      
    } catch (error) {
      console.warn('⚠️ Error handling carousel navigation:', error);
    }
  }

  /**
   * Expand collapsible sections
   */
  async expandCollapsibleSections() {
    try {
      console.log('📖 Expanding collapsible sections...');
      
      const expandableElements = await this.page.$$([
        '[aria-expanded="false"]',
        '.collapsed',
        '.accordion-header',
        '.expandable',
        '[data-toggle="collapse"]'
      ].join(', '));
      
      for (const element of expandableElements) {
        try {
          const isVisible = await element.isVisible();
          if (isVisible) {
            await element.click();
            await this.delay(800);
          }
        } catch (error) {
          // Element might not be clickable, continue
        }
      }
      
      if (expandableElements.length > 0) {
        console.log(`✅ Expanded ${expandableElements.length} collapsible sections`);
      }
      
    } catch (error) {
      console.warn('⚠️ Error expanding collapsible sections:', error);
    }
  }

  /**
   * Handle load more functionality
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
            console.log(`📄 Loading more content (attempt ${loadMoreAttempts + 1})...`);
            await loadMoreButton.click();
            await this.delay(3000);
            loadMoreAttempts++;
          } else {
            break;
          }
        } else {
          break;
        }
      }
      
      if (loadMoreAttempts > 0) {
        console.log(`✅ Loaded ${loadMoreAttempts} additional content sections`);
      }
      
    } catch (error) {
      console.warn('⚠️ Error handling load more:', error);
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
        '.floor-plan-card',
        '.plan-card',
        '.unit-card',
        '.apartment-card',
        '.property-card',
        '[data-floor-plan]',
        '.pricing-option'
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
            external_id: `arden_oakwood_plan_${index}`,
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
          const imageElements = await element.$$('img');
          if (imageElements.length > 0) {
            property.images = [];
            for (const img of imageElements) {
              const src = await img.getAttribute('src');
              if (src) {
                const fullSrc = src.startsWith('http') ? src : new URL(src, this.websiteConfig.baseUrl).toString();
                property.images.push(fullSrc);
              }
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

          // Extract contact information if present
          const elementText = await element.textContent();
          if (elementText) {
            const phoneMatch = elementText.match(this.websiteConfig.patterns.phonePattern);
            if (phoneMatch) {
              property.phone = phoneMatch[0];
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
      
      // Handle search filters
      await this.interactWithSearchFilters();
      
      // Extract available units
      const properties = await this.extractPropertyData(this.websiteConfig.selectors);
      
      return this.enhancePropertiesWithLocation(properties.map(prop => ({
        ...prop,
        external_id: `arden_oakwood_avail_${prop.external_id}`,
        property_type: 'available_unit'
      })));
      
    } catch (error) {
      console.error('❌ Error scraping availability:', error);
      return [];
    }
  }

  /**
   * Scrape apartments page
   */
  async scrapeApartmentsPage() {
    try {
      console.log('🏠 Navigating to apartments page...');
      await this.navigateToUrl(this.websiteConfig.apartmentsUrl);
      
      // Wait for content to load
      await this.delay(3000);
      
      // Handle interactive elements
      await this.handleInteractiveElements();
      
      // Extract property information
      const properties = await this.extractPropertyData(this.websiteConfig.selectors);
      
      return this.enhancePropertiesWithLocation(properties.map(prop => ({
        ...prop,
        external_id: `arden_oakwood_apt_${prop.external_id}`,
        property_type: 'apartment_listing'
      })));
      
    } catch (error) {
      console.error('❌ Error scraping apartments page:', error);
      return [];
    }
  }

  /**
   * Scrape alternative pages when main pages don't yield results
   */
  async scrapeAlternativePages() {
    try {
      console.log('🔍 Trying alternative extraction methods...');
      const properties = [];
      
      // Try the base URL
      console.log('🏠 Trying base URL...');
      await this.navigateToUrl(this.websiteConfig.baseUrl);
      await this.delay(3000);
      
      const baseProperties = await this.extractFromGenericContainers();
      properties.push(...baseProperties);
      
      // Try common apartment page URLs
      const alternativeUrls = [
        `${this.websiteConfig.baseUrl}/units`,
        `${this.websiteConfig.baseUrl}/leasing`,
        `${this.websiteConfig.baseUrl}/pricing`,
        `${this.websiteConfig.baseUrl}/contact`
      ];
      
      for (const url of alternativeUrls) {
        try {
          console.log(`🌐 Trying ${url}...`);
          await this.navigateToUrl(url);
          await this.delay(2000);
          
          const pageProperties = await this.extractFromGenericContainers();
          properties.push(...pageProperties);
          
        } catch (error) {
          console.warn(`⚠️ Could not scrape ${url}:`, error.message);
        }
      }
      
      return this.enhancePropertiesWithLocation(properties);
      
    } catch (error) {
      console.error('❌ Alternative scraping failed:', error);
      return [];
    }
  }

  /**
   * Interact with search filters
   */
  async interactWithSearchFilters() {
    try {
      console.log('🔍 Interacting with search filters...');
      
      // Try to find and interact with filters
      const filters = [
        { selector: this.websiteConfig.selectors.bedroomFilter, name: 'bedroom' },
        { selector: this.websiteConfig.selectors.bathroomFilter, name: 'bathroom' },
        { selector: this.websiteConfig.selectors.priceFilter, name: 'price' }
      ];

      for (const filter of filters) {
        try {
          const element = await this.page.$(filter.selector);
          if (element) {
            console.log(`🎛️ Found ${filter.name} filter`);
            // For now, just verify it exists
            // In a real implementation, you might interact with it
          }
        } catch (error) {
          // Filter not found, continue
        }
      }

      // Handle view all buttons
      const viewAllButton = await this.page.$(this.websiteConfig.selectors.viewAllButton);
      if (viewAllButton) {
        console.log('👁️ Clicking view all button...');
        await viewAllButton.click();
        await this.delay(2000);
      }
      
    } catch (error) {
      console.warn('⚠️ Error interacting with search filters:', error);
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
   * Extract from generic containers
   */
  async extractFromGenericContainers() {
    try {
      console.log('🔍 Trying generic container extraction...');
      
      const genericSelectors = [
        'div[class*="plan"]',
        'div[class*="unit"]', 
        'div[class*="apartment"]',
        'div[class*="pricing"]',
        'div[class*="floor"]',
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
              external_id: `arden_oakwood_generic_${index}`,
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
            property.phone = this.extractPhoneFromText(text);

            if (property.price || property.bedrooms || property.phone) {
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
      'apartment', 'unit', 'floor plan', 'available',
      'lease', 'move in', 'pricing'
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
   * Extract phone number from text
   */
  extractPhoneFromText(text) {
    const match = text.match(this.websiteConfig.patterns.phonePattern);
    return match ? match[0] : null;
  }

  /**
   * Enhance properties with location information
   */
  enhancePropertiesWithLocation(properties) {
    return properties.map(property => ({
      ...property,
      address: property.address || '100 Arden Dr',
      city: property.city || 'Oakwood',
      state: property.state || 'GA',
      zip_code: property.zip_code || '30566'
    }));
  }

  /**
   * Deduplicate properties
   */
  deduplicateProperties(properties) {
    const seen = new Map();
    const unique = [];
    
    properties.forEach(property => {
      // Create a sophisticated key for Arden properties
      const key = `${property.bedrooms}_${property.bathrooms}_${property.price}_${property.name}_${property.square_feet}`;
      
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

module.exports = ArdenOakwoodScraper;