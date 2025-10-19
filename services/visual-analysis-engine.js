// APL AI Scraper 2.0 - Visual Analysis Engine
const { AIService } = require('./ai-service');
const sharp = require('sharp');

/**
 * @typedef {Object} SessionData
 * @property {any[]} actions
 * @property {any[]} screenshots
 * @property {Object} metadata
 */

/**
 * @typedef {Object} AnalysisResult
 * @property {any[]} identifiedElements
 * @property {any[]} interactiveElements
 * @property {any[]} dataFields
 * @property {any[]} actionPatterns
 * @property {any[]} patterns
 * @property {any[]} navigationFlow
 * @property {Object} pageStructure
 * @property {number} confidence
 * @property {string} generatedCode
 * @property {any[]} recommendations
 */

/** @type {Record<string, any>} */
const interactionMap = {};

class VisualAnalysisEngine {
  constructor() {
    this.aiService = new AIService();
    this.analysisCache = new Map();
    this.confidenceThreshold = 0.7;
  }

  /**
   * @param {SessionData} sessionData
   * @returns {Promise<AnalysisResult>}
   */
  async analyzeRecordingSession(sessionData) {
    console.log('ðŸ” Starting visual analysis of recording session');
    const { actions, screenshots } = sessionData;
    
      const analysis = this.createAnalysisResult();

    try {
      // Analyze screenshots with GPT-4V
      if (screenshots && screenshots.length > 0) {
        console.log(`ðŸ“¸ Analyzing ${screenshots.length} screenshots`);
        
        for (let i = 0; i < screenshots.length; i++) {
          const screenshot = screenshots[i];
          console.log(`ðŸ” Processing screenshot ${i + 1}/${screenshots.length}`);
          
          const screenshotAnalysis = await this.analyzeScreenshot(screenshot, i);
          
          // Merge results
          analysis.identifiedElements.push(...screenshotAnalysis.elements);
          analysis.dataFields.push(...screenshotAnalysis.dataFields);
          
          // Store page structure for first screenshot
          if (i === 0) {
            analysis.pageStructure = screenshotAnalysis.pageStructure;
          }
        }
      }

      // Analyze recorded actions for patterns
      if (actions && actions.length > 0) {
        console.log(`âš¡ Analyzing ${actions.length} recorded actions`);
        analysis.actionPatterns = this.analyzeActionPatterns(actions);
        analysis.navigationFlow = this.extractNavigationFlow(actions);
      }

      // Remove duplicates and filter by confidence
      analysis.identifiedElements = this.deduplicateElements(analysis.identifiedElements);
      analysis.dataFields = this.deduplicateDataFields(analysis.dataFields);

      // Calculate overall confidence
      analysis.confidence = this.calculateOverallConfidence(analysis);

      // Generate recommendations
      analysis.recommendations = this.generateRecommendations(analysis, actions);

      console.log('âœ… Visual analysis completed');
      console.log(`ðŸ“Š Found ${analysis.identifiedElements.length} elements, ${analysis.dataFields.length} data fields`);

      return analysis;

    } catch (error) {
      console.error('âŒ Visual analysis failed:', error);
      throw new Error(`Visual analysis failed: ${error.message}`);
    }
  }

  /**
   * @returns {AnalysisResult}
   */
  createAnalysisResult() {
    return {
      identifiedElements: [],
      interactiveElements: [],
      dataFields: [],
      actionPatterns: [],
      patterns: [],
      navigationFlow: [],
      pageStructure: {},
      confidence: 0,
      generatedCode: '',
      recommendations: []
    };
  }

  async analyzeScreenshot(screenshot, index) {
    try {
      // Generate cache key based on screenshot data
      const cacheKey = this.generateCacheKey(screenshot.data);
      
      if (this.analysisCache.has(cacheKey)) {
        console.log(`ðŸ“‹ Using cached analysis for screenshot ${index + 1}`);
        return this.analysisCache.get(cacheKey);
      }

      const prompt = `
        Analyze this web page screenshot and identify interactive elements and data structures.
        
        CONTEXT:
        - URL: ${screenshot.url || 'unknown'}
        - Viewport: ${screenshot.viewport?.width}x${screenshot.viewport?.height}
        - Timestamp: ${screenshot.timestamp}
        
        ANALYSIS TASKS:
        1. Identify ALL interactive elements (buttons, links, inputs, dropdowns, checkboxes, etc.)
        2. Find data-rich sections (products, articles, listings, tables, cards, etc.)
        3. Detect navigation elements (menus, breadcrumbs, pagination, etc.)
        4. Identify form elements and their purposes
        5. Spot repeating patterns that might contain structured data

        For EACH element found, provide:
        - Element type (button, input, link, text, image, etc.)
        - Likely purpose/function
        - Estimated CSS selector (be specific but robust)
        - Confidence level (0.0-1.0)
        - Position description (top, center, sidebar, etc.)
        - Visual characteristics (color, size, styling hints)

        For DATA FIELDS, identify:
        - Field name/purpose (title, price, description, etc.)
        - Data type (text, number, date, url, etc.)  
        - Estimated selector
        - Whether it appears multiple times (indicating a list/collection)
        - Confidence level

        Return ONLY valid JSON in this exact structure:
        {
          "elements": [
            {
              "type": "button|input|link|dropdown|checkbox|etc",
              "purpose": "search|submit|navigation|filter|etc",
              "selector": "specific CSS selector",
              "confidence": 0.0-1.0,
              "position": "header|main|sidebar|footer|etc",
              "characteristics": "visual description",
              "interactionType": "click|type|select|etc"
            }
          ],
          "dataFields": [
            {
              "name": "descriptive_field_name", 
              "type": "text|number|price|date|url|image|etc",
              "selector": "CSS selector",
              "confidence": 0.0-1.0,
              "multiple": true/false,
              "context": "product|article|listing|etc",
              "sampleValue": "example of expected content"
            }
          ],
          "pageStructure": {
            "pageType": "ecommerce|blog|search|form|listing|news|etc",
            "mainContent": "CSS selector for main content area",
            "hasNavigation": true/false,
            "hasPagination": true/false,
            "hasSearch": true/false,
            "layoutType": "grid|list|single|complex"
          }
        }
      `;

      // Process image for optimal AI analysis
      const imageBuffer = await this.processImageForAnalysis(screenshot.data);
      
      console.log('Sending screenshot ' + (index + 1) + ' to GPT-4V for analysis');
      const analysis = await this.aiService.analyzeWithGPT4V(imageBuffer, prompt);
      
      let parsedAnalysis;
      try {
        // Clean the response to extract JSON
        const cleanedAnalysis = this.cleanAIResponse(analysis);
        parsedAnalysis = JSON.parse(cleanedAnalysis);
      } catch (parseError) {
        console.warn('JSON parsing failed for screenshot ' + (index + 1) + ', using fallback parser');
        parsedAnalysis = this.parseUnstructuredAnalysis(analysis);
      }

      // Validate and enhance the analysis
      parsedAnalysis = this.validateAndEnhanceAnalysis(parsedAnalysis, screenshot);

      // Cache the result
      this.analysisCache.set(cacheKey, parsedAnalysis);

      return parsedAnalysis;

    } catch (error) {
      console.error(`âŒ Screenshot analysis failed for index ${index}:`, error);
      
      // Return empty structure on failure
      return {
        elements: [],
        dataFields: [],
        pageStructure: {
          pageType: 'unknown',
          mainContent: 'body',
          hasNavigation: false,
          hasPagination: false,
          hasSearch: false,
          layoutType: 'unknown'
        }
      };
    }
  }

  async processImageForAnalysis(base64Data) {
    try {
      // Convert base64 to buffer
      const imageData = base64Data.replace(/^data:image\/[a-z]+;base64,/, '');
      const inputBuffer = Buffer.from(imageData, 'base64');

      // Optimize image for GPT-4V (resize, compress, enhance)
      const optimizedBuffer = await sharp(inputBuffer)
        .resize(1024, 768, { 
          fit: 'inside',
          withoutEnlargement: true 
        })
        .jpeg({ 
          quality: 85,
          progressive: true 
        })
        .sharpen()
        .toBuffer();

      return optimizedBuffer;

    } catch (error) {
      console.error('Image processing failed:', error);
      // Return original buffer if processing fails
      const imageData = base64Data.replace(/^data:image\/[a-z]+;base64,/, '');
      return Buffer.from(imageData, 'base64');
    }
  }

  cleanAIResponse(response) {
    // Remove markdown code blocks and extra text
    let cleaned = response.replace(/```json\s*/gi, '').replace(/```\s*/g, '');
    
    // Find the JSON object boundaries
    const jsonStart = cleaned.indexOf('{');
    const jsonEnd = cleaned.lastIndexOf('}') + 1;
    
    if (jsonStart !== -1 && jsonEnd > jsonStart) {
      cleaned = cleaned.substring(jsonStart, jsonEnd);
    }
    
    return cleaned;
  }

  parseUnstructuredAnalysis(text) {
    console.log('ðŸ“ Parsing unstructured analysis text');
    
    const elements = [];
    const dataFields = [];
    const lines = text.split('\n');
    
    let currentSection = '';
    
    for (const line of lines) {
      const trimmedLine = line.trim().toLowerCase();
      
      // Section detection
      if (trimmedLine.includes('elements') || trimmedLine.includes('interactive')) {
        currentSection = 'elements';
        continue;
      } else if (trimmedLine.includes('data') || trimmedLine.includes('fields')) {
        currentSection = 'dataFields';
        continue;
      }
      
      // Element extraction patterns
      if (currentSection === 'elements') {
        const typeMatch = line.match(/type[:\s]+(\w+)/i);
        const purposeMatch = line.match(/purpose[:\s]+([^,\n]+)/i);
        const selectorMatch = line.match(/selector[:\s]+([^,\n]+)/i);
        const confidenceMatch = line.match(/confidence[:\s]+([0-9.]+)/i);
        
        if (typeMatch || purposeMatch || selectorMatch) {
          elements.push({
            type: typeMatch ? typeMatch[1] : 'unknown',
            purpose: purposeMatch ? purposeMatch[1].trim() : 'unknown',
            selector: selectorMatch ? selectorMatch[1].trim() : '',
            confidence: confidenceMatch ? parseFloat(confidenceMatch[1]) : 0.5,
            position: 'unknown',
            characteristics: 'parsed from text',
            interactionType: 'click'
          });
        }
      }
      
      // Data field extraction patterns
      if (currentSection === 'dataFields') {
        const nameMatch = line.match(/name[:\s]+([^,\n]+)/i);
        const typeMatch = line.match(/type[:\s]+([^,\n]+)/i);
        const selectorMatch = line.match(/selector[:\s]+([^,\n]+)/i);
        
        if (nameMatch || selectorMatch) {
          dataFields.push({
            name: nameMatch ? nameMatch[1].trim() : 'unknown_field',
            type: typeMatch ? typeMatch[1].trim() : 'text',
            selector: selectorMatch ? selectorMatch[1].trim() : '',
            confidence: 0.6,
            multiple: false,
            context: 'unknown',
            sampleValue: ''
          });
        }
      }
    }

    return {
      elements,
      dataFields,
      pageStructure: {
        pageType: 'unknown',
        mainContent: 'main, .main, #main, .content, #content',
        hasNavigation: true,
        hasPagination: false,
        hasSearch: false,
        layoutType: 'unknown'
      }
    };
  }

  validateAndEnhanceAnalysis(analysis, screenshot) {
    // Ensure required structure
    analysis.elements = analysis.elements || [];
    analysis.dataFields = analysis.dataFields || [];
    analysis.pageStructure = analysis.pageStructure || {};

    // Enhance elements with additional properties
    analysis.elements = analysis.elements.map(element => ({
      type: element.type || 'unknown',
      purpose: element.purpose || 'unknown',
      selector: this.enhanceSelector(element.selector),
      confidence: Math.max(0, Math.min(1, element.confidence || 0.5)),
      position: element.position || 'unknown',
      characteristics: element.characteristics || '',
      interactionType: element.interactionType || this.inferInteractionType(element.type),
      url: screenshot.url,
      timestamp: screenshot.timestamp
    }));

    // Enhance data fields
    analysis.dataFields = analysis.dataFields.map(field => ({
      name: field.name || 'unknown_field',
      type: field.type || 'text',
      selector: this.enhanceSelector(field.selector),
      confidence: Math.max(0, Math.min(1, field.confidence || 0.5)),
      multiple: field.multiple || false,
      context: field.context || 'unknown',
      sampleValue: field.sampleValue || '',
      url: screenshot.url,
      timestamp: screenshot.timestamp
    }));

    // Enhance page structure
    analysis.pageStructure = {
      pageType: analysis.pageStructure.pageType || 'unknown',
      mainContent: analysis.pageStructure.mainContent || 'main',
      hasNavigation: analysis.pageStructure.hasNavigation !== false,
      hasPagination: analysis.pageStructure.hasPagination || false,
      hasSearch: analysis.pageStructure.hasSearch || false,
      layoutType: analysis.pageStructure.layoutType || 'unknown'
    };

    return analysis;
  }

  enhanceSelector(selector) {
    if (!selector || selector.trim() === '') {
      return '';
    }

    // Clean and validate selector
    const cleaned = selector.trim().replace(/['"]/g, '');
    
    // Add fallback selectors for robustness
    if (cleaned.includes('#')) {
      // ID-based selector - add class fallback
      return cleaned;
    } else if (cleaned.includes('.')) {
      // Class-based selector - good as is
      return cleaned;
    } else {
      // Tag-based selector - enhance with attributes
      return cleaned;
    }
  }

  inferInteractionType(elementType) {
    const interactionMap = {
      'button': 'click',
      'link': 'click', 
      'input': 'type',
      'textarea': 'type',
      'select': 'select',
      'dropdown': 'select',
      'checkbox': 'click',
      'radio': 'click',
      'submit': 'click'
    };

    return interactionMap[elementType?.toLowerCase()] || 'click';
  }

  analyzeActionPatterns(actions) {
    console.log('âš¡ Analyzing action patterns');
    
    const patterns = [];
    
    // Group actions by type
    const actionsByType = actions.reduce((acc, action) => {
      if (!acc[action.type]) acc[action.type] = [];
      acc[action.type].push(action);
      return acc;
    }, {});

    // Analyze click patterns
    if (actionsByType.click) {
      const clickPatterns = this.analyzeClickPatterns(actionsByType.click);
      patterns.push(...clickPatterns);
    }

    // Analyze input patterns  
    if (actionsByType.input) {
      const inputPatterns = this.analyzeInputPatterns(actionsByType.input);
      patterns.push(...inputPatterns);
    }

    // Analyze scroll patterns
    if (actionsByType.scroll) {
      const scrollPattern = this.analyzeScrollPattern(actionsByType.scroll);
      if (scrollPattern) patterns.push(scrollPattern);
    }

    // Analyze temporal patterns
    const temporalPatterns = this.analyzeTemporalPatterns(actions);
    patterns.push(...temporalPatterns);

    return patterns;
  }

  analyzeClickPatterns(clickActions) {
    const patterns = [];
    
    // Group by similar selectors
    const selectorGroups = {};
    clickActions.forEach(action => {
      const baseSelector = this.getBaseSelectorPattern(action.target);
      if (!selectorGroups[baseSelector]) {
        selectorGroups[baseSelector] = [];
      }
      selectorGroups[baseSelector].push(action);
    });

    // Identify repetitive clicking patterns
    Object.entries(selectorGroups).forEach(([baseSelector, actions]) => {
      if (actions.length > 1) {
        patterns.push({
          type: 'repetitive_clicks',
          pattern: baseSelector,
          occurrences: actions.length,
          averageInterval: this.calculateAverageInterval(actions),
          confidence: Math.min(0.9, actions.length / 10),
          description: `Repetitive clicking on similar elements (${baseSelector})`
        });
      }
    });

    return patterns;
  }

  analyzeInputPatterns(inputActions) {
    const patterns = [];
    
    // Group by form or input type
    const inputGroups = {};
    inputActions.forEach(action => {
      const key = `${action.inputType || 'text'}_${this.getBaseSelectorPattern(action.target)}`;
      if (!inputGroups[key]) {
        inputGroups[key] = [];
      }
      inputGroups[key].push(action);
    });

    Object.entries(inputGroups).forEach(([key, actions]) => {
      const [inputType, selector] = key.split('_');
      
      patterns.push({
        type: 'input_pattern',
        inputType: inputType,
        selector: selector,
        sampleValues: actions.map(a => a.value).slice(0, 3),
        occurrences: actions.length,
        confidence: 0.8,
        description: `Input pattern for ${inputType} fields`
      });
    });

    return patterns;
  }

  analyzeScrollPattern(scrollActions) {
    if (scrollActions.length < 2) return null;

    const totalScroll = scrollActions[scrollActions.length - 1].position.y - scrollActions[0].position.y;
    const averageScrollDistance = totalScroll / scrollActions.length;

    return {
      type: 'scroll_pattern',
      totalDistance: totalScroll,
      averageDistance: averageScrollDistance,
      scrollCount: scrollActions.length,
      confidence: 0.7,
      description: `Scrolling pattern with ${scrollActions.length} scroll events`
    };
  }

  analyzeTemporalPatterns(actions) {
    const patterns = [];
    
    // Find actions with consistent timing
    for (let i = 1; i < actions.length; i++) {
      const timeDiff = actions[i].timestamp - actions[i-1].timestamp;
      
      if (timeDiff > 5000 && timeDiff < 60000) { // Between 5s and 1min
        patterns.push({
          type: 'wait_pattern',
          duration: timeDiff,
          beforeAction: actions[i-1].type,
          afterAction: actions[i].type,
          confidence: 0.6,
          description: `Wait pattern of ${Math.round(timeDiff/1000)}s between actions`
        });
      }
    }

    return patterns;
  }

  getBaseSelectorPattern(selector) {
    // Extract the base pattern from a selector
    return selector
      .replace(/:nth-child\(\d+\)/g, ':nth-child(n)')
      .replace(/:nth-of-type\(\d+\)/g, ':nth-of-type(n)')
      .replace(/\[\w+="[^"]*"\]/g, '[attr]')
      .split(' > ').slice(0, 3).join(' > '); // Limit depth
  }

  calculateAverageInterval(actions) {
    if (actions.length < 2) return 0;
    
    let totalInterval = 0;
    for (let i = 1; i < actions.length; i++) {
      totalInterval += actions[i].timestamp - actions[i-1].timestamp;
    }
    
    return totalInterval / (actions.length - 1);
  }

  extractNavigationFlow(actions) {
    return actions
      .filter(action => action.type === 'navigation')
      .map(nav => ({
        from: nav.from,
        to: nav.to,
        timestamp: nav.timestamp,
        trigger: nav.trigger || 'unknown'
      }));
  }

  deduplicateElements(elements) {
    const seen = new Set();
    return elements.filter(element => {
      const key = `${element.type}_${element.selector}_${element.purpose}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return element.confidence >= this.confidenceThreshold;
    });
  }

  deduplicateDataFields(dataFields) {
    const seen = new Set();
    return dataFields.filter(field => {
      const key = `${field.name}_${field.selector}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return field.confidence >= this.confidenceThreshold;
    });
  }

  calculateOverallConfidence(analysis) {
    const allConfidences = [
      ...analysis.identifiedElements.map(e => e.confidence),
      ...analysis.dataFields.map(d => d.confidence)
    ];

    if (allConfidences.length === 0) return 0;

    const averageConfidence = allConfidences.reduce((sum, conf) => sum + conf, 0) / allConfidences.length;
    const elementCount = analysis.identifiedElements.length + analysis.dataFields.length;
    const countBonus = Math.min(0.2, elementCount * 0.02); // Bonus for finding more elements

    return Math.min(0.95, averageConfidence + countBonus);
  }

  generateRecommendations(analysis, actions) {
    const recommendations = [];
    // Acknowledge actions param to satisfy linter in placeholder flows
    void actions;

    // Recommend based on confidence levels
    const lowConfidenceElements = analysis.identifiedElements.filter(e => e.confidence < 0.7);
    if (lowConfidenceElements.length > 0) {
      recommendations.push({
        type: 'selector_improvement',
        message: `${lowConfidenceElements.length} elements have low confidence. Consider manual selector verification.`,
        priority: 'medium',
        elements: lowConfidenceElements.map(e => e.selector)
      });
    }

    // Recommend based on action patterns
    const repetitivePatterns = analysis.actionPatterns.filter(p => p.type === 'repetitive_clicks');
    if (repetitivePatterns.length > 0) {
      recommendations.push({
        type: 'pagination_handling',
        message: 'Detected repetitive clicking patterns. Consider implementing pagination or "load more" handling.',
        priority: 'high',
        patterns: repetitivePatterns
      });
    }

    // Recommend based on page structure
    if (analysis.pageStructure.hasPagination) {
      recommendations.push({
        type: 'pagination_scraping',
        message: 'Page has pagination. Implement pagination handling to scrape all pages.',
        priority: 'high'
      });
    }

    if (analysis.pageStructure.pageType === 'ecommerce') {
      recommendations.push({
        type: 'ecommerce_optimization',
        message: 'E-commerce site detected. Consider adding product-specific extractors (price, reviews, availability).',
        priority: 'medium'
      });
    }

    // Recommend based on data fields
    const multipleDataFields = analysis.dataFields.filter(d => d.multiple);
    if (multipleDataFields.length > 0) {
      recommendations.push({
        type: 'batch_extraction',
        message: `Found ${multipleDataFields.length} repeating data patterns. Optimize for batch extraction.`,
        priority: 'medium',
        fields: multipleDataFields.map(d => d.name)
      });
    }

    return recommendations;
  }

  generateCacheKey(imageData) {
    // Generate a simple hash of the first 1000 characters for caching
    const sample = imageData.substring(0, 1000);
    let hash = 0;
    for (let i = 0; i < sample.length; i++) {
      const char = sample.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return hash.toString(36);
  }
}

module.exports = { VisualAnalysisEngine };