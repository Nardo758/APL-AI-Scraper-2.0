// APL AI Scraper 2.0 - Code Generation Engine
const { AIService } = require('./ai-service');
const fs = require('fs').promises;
const path = require('path');

class CodeGenerator {
  constructor() {
    this.aiService = new AIService();
    this.templates = new Map();
    this.loadTemplates();
  }

  async loadTemplates() {
    try {
      const templatesDir = path.join(__dirname, '..', 'templates');
      await this.ensureDirectoryExists(templatesDir);
      
      this.templates.set('playwright_basic', this.getPlaywrightBasicTemplate());
      this.templates.set('playwright_advanced', this.getPlaywrightAdvancedTemplate());
      this.templates.set('playwright_ecommerce', this.getPlaywrightEcommerceTemplate());
      
      console.log('ðŸ“ Code generation templates loaded');
    } catch (error) {
      console.error('Failed to load templates:', error);
    }
  }

  async generateScrapingCode(analysis, actions, options = {}) {
    console.log('ðŸ—ï¸ Starting code generation process');
    
    const {
      framework = 'playwright',
      includeComments = true,
      includeErrorHandling = true,
      outputFormat = 'javascript',
      optimizeSelectors = true
    } = options;

    try {
      // Build comprehensive context for AI code generation
      const context = this.buildCodeGenerationContext(analysis, actions);
      
      // Select appropriate template
      const templateType = this.selectTemplate(analysis, context);
      
      // Generate code using AI
      const generatedCode = await this.generateWithAI(context, templateType, {
        framework,
        includeComments,
        includeErrorHandling,
        outputFormat
      });
      
      // Post-process and optimize the generated code
      const optimizedCode = await this.optimizeGeneratedCode(generatedCode, analysis, {
        optimizeSelectors,
        includeComments,
        includeErrorHandling
      });

      // Validate the generated code
      const validationResult = this.validateGeneratedCode(optimizedCode);
      
      const result = {
        code: optimizedCode,
        template: templateType,
        context: context,
        validation: validationResult,
        metadata: {
          generatedAt: new Date().toISOString(),
          framework: framework,
          elementCount: analysis.identifiedElements?.length || 0,
          dataFieldCount: analysis.dataFields?.length || 0,
          actionCount: actions?.length || 0,
          confidence: analysis.confidence || 0
        }
      };

      console.log('âœ… Code generation completed successfully');
      return result;

    } catch (error) {
      console.error('âŒ Code generation failed:', error);
      throw new Error(`Code generation failed: ${error.message}`);
    }
  }

  buildCodeGenerationContext(analysis, actions) {
    const context = {
      pageInfo: this.extractPageInfo(actions),
      userFlow: this.extractUserFlow(actions),
      dataTargets: this.extractDataTargets(analysis),
      interactionElements: this.extractInteractionElements(analysis),
      navigationFlow: analysis.navigationFlow || [],
      pageStructure: analysis.pageStructure || {},
      patterns: analysis.actionPatterns || [],
      recommendations: analysis.recommendations || []
    };

    // Enrich context with inferred behaviors
    context.scrapingStrategy = this.inferScrapingStrategy(context);
    context.complexity = this.assessComplexity(context);
    context.requirements = this.extractRequirements(context);

    return context;
  }

  extractPageInfo(actions) {
    const initialState = actions?.find(a => a.type === 'initial_state');
    const navigationActions = actions?.filter(a => a.type === 'navigation') || [];
    
    const urls = [
      initialState?.data?.url,
      ...navigationActions.map(nav => nav.to)
    ].filter(Boolean);

    return {
      startUrl: initialState?.data?.url || 'https://example.com',
      title: initialState?.data?.title || 'Unknown Page',
      visitedUrls: [...new Set(urls)],
      isMultiPage: urls.length > 1,
      viewport: initialState?.data?.viewport || { width: 1920, height: 1080 }
    };
  }

  extractUserFlow(actions) {
    if (!actions || actions.length === 0) return [];

    return actions
      .filter(action => ['click', 'input', 'scroll', 'navigation', 'submit'].includes(action.type))
      .map((action, index) => ({
        step: index + 1,
        action: action.type,
        target: action.target || action.selector,
        value: action.value,
        timestamp: action.timestamp,
        description: this.generateActionDescription(action),
        waitAfter: this.calculateWaitTime(action, actions[index + 1])
      }));
  }

  extractDataTargets(analysis) {
    const dataFields = analysis.dataFields || [];
    const elements = analysis.identifiedElements || [];
    
    // Group data fields by context/purpose
    const grouped = {};
    
    dataFields.forEach(field => {
      const context = field.context || 'general';
      if (!grouped[context]) {
        grouped[context] = [];
      }
      grouped[context].push({
        name: field.name,
        selector: field.selector,
        type: field.type,
        multiple: field.multiple,
        confidence: field.confidence,
        sampleValue: field.sampleValue
      });
    });

    // Add navigation and interaction targets
    const interactionTargets = elements
      .filter(el => ['button', 'link', 'input'].includes(el.type))
      .map(el => ({
        name: el.purpose || `${el.type}_element`,
        selector: el.selector,
        type: el.type,
        interaction: el.interactionType || 'click',
        confidence: el.confidence
      }));

    return {
      dataGroups: grouped,
      interactionTargets: interactionTargets,
      totalFields: dataFields.length,
      highConfidenceFields: dataFields.filter(f => f.confidence > 0.8).length
    };
  }

  extractInteractionElements(analysis) {
    const elements = analysis.identifiedElements || [];
    
    return elements
      .filter(el => el.confidence > 0.6)
      .map(el => ({
        type: el.type,
        purpose: el.purpose,
        selector: el.selector,
        interaction: el.interactionType || 'click',
        confidence: el.confidence,
        position: el.position,
        isRepeatable: this.isRepeatableElement(el)
      }))
      .sort((a, b) => b.confidence - a.confidence);
  }

  inferScrapingStrategy(context) {
    const { pageStructure, userFlow, dataTargets } = context;
    
    let strategy = 'simple';
    
    if (context.pageInfo.isMultiPage || pageStructure.hasPagination) {
      strategy = 'multi_page';
    } else if (userFlow.some(step => step.action === 'input')) {
      strategy = 'interactive';
    } else if (dataTargets.totalFields > 10) {
      strategy = 'bulk_extraction';
    }
    
    return {
      type: strategy,
      needsPagination: pageStructure.hasPagination,
      needsInteraction: userFlow.some(step => ['click', 'input'].includes(step.action)),
      needsWaiting: userFlow.some(step => step.waitAfter > 1000),
      isDataHeavy: dataTargets.totalFields > 5
    };
  }

  assessComplexity(context) {
    let score = 0;
    
    // Factor in various complexity indicators
    score += context.userFlow.length * 0.1;
    score += context.dataTargets.totalFields * 0.2;
    score += context.navigationFlow.length * 0.3;
    score += context.patterns.length * 0.1;
    
    if (context.pageInfo.isMultiPage) score += 1;
    if (context.pageStructure.hasPagination) score += 1.5;
    if (context.scrapingStrategy.needsInteraction) score += 1;
    
    if (score < 2) return 'simple';
    if (score < 5) return 'medium';
    return 'complex';
  }

  extractRequirements(context) {
    const requirements = [];
    
    if (context.scrapingStrategy.needsPagination) {
      requirements.push('pagination_handling');
    }
    
    if (context.scrapingStrategy.needsInteraction) {
      requirements.push('user_interaction');
    }
    
    if (context.scrapingStrategy.needsWaiting) {
      requirements.push('dynamic_content_waiting');
    }
    
    if (context.pageStructure.hasSearch) {
      requirements.push('search_functionality');
    }
    
    if (context.dataTargets.totalFields > 10) {
      requirements.push('bulk_data_extraction');
    }
    
    return requirements;
  }

  selectTemplate(analysis, context) {
    const { pageStructure, complexity, scrapingStrategy } = context;
    
    if (pageStructure.pageType === 'ecommerce') {
      return 'playwright_ecommerce';
    } else if (complexity === 'complex' || scrapingStrategy.type === 'multi_page') {
      return 'playwright_advanced';
    } else {
      return 'playwright_basic';
    }
  }

  async generateWithAI(context, templateType, options) {
    const template = this.templates.get(templateType);
    
    const prompt = `
      Generate a complete, production-ready Playwright web scraping script based on the following analysis.
      
      CONTEXT:
      ${JSON.stringify(context, null, 2)}
      
      TEMPLATE TYPE: ${templateType}
      FRAMEWORK: ${options.framework}
      
      REQUIREMENTS:
      1. Create a complete, runnable Playwright script
      2. Include proper error handling and retry logic
      3. Use robust selectors that can handle minor DOM changes
      4. Add appropriate wait conditions for dynamic content
      5. Extract all identified data fields efficiently
      6. Follow the user interaction flow accurately
      7. Include detailed comments explaining each step
      8. Handle pagination if detected
      9. Implement rate limiting and respectful scraping practices
      10. Return data in a structured JSON format
      
      TEMPLATE STRUCTURE TO FOLLOW:
      ${template}
      
      SPECIFIC INSTRUCTIONS:
      - Use the exact selectors provided in the analysis where possible
      - Add fallback selectors for critical elements  
      - Include proper TypeScript types if requested
      - Add performance optimizations for bulk data extraction
      - Implement proper cleanup and resource management
      - Add logging for debugging purposes
      
      Generate ONLY the JavaScript/TypeScript code without any markdown formatting or explanations.
      The code should be complete and ready to run.
    `;

    console.log('ðŸ¤– Generating code with AI assistance');
    const generatedCode = await this.aiService.queryClaude(prompt, this.getCodeGenerationContext());
    
    return generatedCode;
  }

  async optimizeGeneratedCode(code, analysis, options) {
    console.log('âš¡ Optimizing generated code');
    
    let optimizedCode = code;
    
    // Remove any markdown formatting
    optimizedCode = this.cleanCodeFromMarkdown(optimizedCode);
    
    // Optimize selectors if requested
    if (options.optimizeSelectors) {
      optimizedCode = this.optimizeSelectors(optimizedCode, analysis);
    }
    
    // Add error handling if missing
    if (options.includeErrorHandling) {
      optimizedCode = this.ensureErrorHandling(optimizedCode);
    }
    
    // Format and clean up the code
    optimizedCode = this.formatCode(optimizedCode);
    
    // Add performance optimizations
    optimizedCode = await this.addPerformanceOptimizations(optimizedCode, analysis);
    
    return optimizedCode;
  }

  cleanCodeFromMarkdown(code) {
    // Remove markdown code blocks
    let cleaned = code.replace(/```[\w]*\n/g, '').replace(/```/g, '');
    
    // Remove leading/trailing whitespace
    cleaned = cleaned.trim();
    
    // Ensure code starts properly
    if (!cleaned.includes('const') && !cleaned.includes('function') && !cleaned.includes('async')) {
      // Code might be truncated, add basic wrapper
      cleaned = `const { chromium } = require('playwright');\n\n${cleaned}`;
    }
    
    return cleaned;
  }

  optimizeSelectors(code, analysis) {
    // Replace basic selectors with more robust ones
    const elements = analysis.identifiedElements || [];
    
    elements.forEach(element => {
      if (element.confidence > 0.8 && element.selector) {
        const robustSelector = this.generateRobustSelector(element);
        if (robustSelector !== element.selector) {
          // Create regex to match selector usage in code
          const selectorRegex = new RegExp(`['"\`]${this.escapeRegex(element.selector)}['"\`]`, 'g');
          code = code.replace(selectorRegex, `'${robustSelector}'`);
        }
      }
    });
    
    return code;
  }

  generateRobustSelector(element) {
    const { selector, type, purpose } = element;
    
    // If selector already has ID or unique class, it's robust enough
    if (selector.includes('#') || selector.includes('[data-')) {
      return selector;
    }
    
    // Add data attributes or enhance selector for common element types
    const enhancements = [];
    
    if (type === 'button' && purpose) {
      enhancements.push(`[data-purpose="${purpose}"]`);
    }
    
    if (type === 'input' && purpose) {
      enhancements.push(`[placeholder*="${purpose}"], [name*="${purpose}"]`);
    }
    
    // Return enhanced selector or fallback to original
    return enhancements.length > 0 ? `${selector}${enhancements.join('')}` : selector;
  }

  ensureErrorHandling(code) {
    // Check if code already has comprehensive error handling
    if (code.includes('try') && code.includes('catch') && code.includes('finally')) {
      return code;
    }
    
    // Wrap main function with error handling if missing
    if (!code.includes('try {')) {
      const functionMatch = code.match(/(async function \w+\([^)]*\)\s*{)/);
      if (functionMatch) {
        const funcStart = functionMatch[0];
        const restOfCode = code.substring(code.indexOf(funcStart) + funcStart.length);
        
        code = code.replace(funcStart + restOfCode, 
          funcStart + '\n  try {\n' + 
          restOfCode.replace(/\n/g, '\n  ') + 
          '\n  } catch (error) {\n    console.error(\'Scraping failed:\', error);\n    throw error;\n  }'
        );
      }
    }
    
    return code;
  }

  formatCode(code) {
    // Basic code formatting
    return code
      .replace(/;\s*\n\s*\n/g, ';\n\n')  // Normalize line breaks
      .replace(/{\n\n+/g, '{\n')          // Remove extra lines after braces
      .replace(/\n\n+}/g, '\n}')          // Remove extra lines before closing braces
      .trim();
  }

  async addPerformanceOptimizations(code, analysis) {
    const optimizations = [];
    
    // Check if bulk data extraction is needed
    const dataFields = analysis.dataFields || [];
    if (dataFields.filter(f => f.multiple).length > 3) {
      optimizations.push('bulk_extraction');
    }
    
    // Check if pagination is detected
    if (analysis.pageStructure?.hasPagination) {
      optimizations.push('pagination_optimization');
    }
    
    if (optimizations.length === 0) return code;
    
    const optimizationPrompt = `
      Optimize this Playwright scraping code for better performance:
      
      ${code}
      
      Apply these optimizations:
      ${optimizations.join(', ')}
      
      Focus on:
      - Reducing DOM queries by batching selectors
      - Using parallel extraction where possible
      - Implementing efficient pagination handling
      - Adding proper wait conditions to avoid race conditions
      
      Return only the optimized code.
    `;
    
    console.log('ðŸš€ Applying AI-powered performance optimizations');
    
    try {
      const optimizedCode = await this.aiService.queryClaude(optimizationPrompt);
      return this.cleanCodeFromMarkdown(optimizedCode);
    } catch (error) {
      console.warn('Performance optimization failed, using original code:', error);
      return code;
    }
  }

  validateGeneratedCode(code) {
    const validation = {
      isValid: true,
      issues: [],
      suggestions: [],
      score: 100
    };

    // Check for required Playwright imports
    if (!code.includes('playwright') && !code.includes('chromium')) {
      validation.issues.push('Missing Playwright import');
      validation.score -= 20;
    }

    // Check for browser lifecycle management
    if (!code.includes('browser.close()') && !code.includes('await browser.close()')) {
      validation.issues.push('Missing browser cleanup');
      validation.score -= 15;
    }

    // Check for error handling
    if (!code.includes('try') || !code.includes('catch')) {
      validation.issues.push('Insufficient error handling');
      validation.score -= 10;
    }

    // Check for data extraction
    if (!code.includes('$$eval') && !code.includes('$eval') && !code.includes('textContent')) {
      validation.issues.push('No data extraction detected');
      validation.score -= 25;
    }

    // Check for navigation
    if (!code.includes('goto') && !code.includes('navigate')) {
      validation.issues.push('No page navigation detected');
      validation.score -= 20;
    }

    // Suggestions
    if (!code.includes('waitForSelector')) {
      validation.suggestions.push('Consider adding waitForSelector for better reliability');
      validation.score -= 5;
    }

    if (!code.includes('screenshot')) {
      validation.suggestions.push('Consider adding screenshots for debugging');
    }

    validation.isValid = validation.score >= 60;
    
    return validation;
  }

  generateActionDescription(action) {
    switch (action.type) {
    case 'click':
      return `Click on element: ${action.target}`;
    case 'input':
      return `Enter "${action.value}" into: ${action.target}`;
    case 'scroll':
      return `Scroll to position: ${action.position?.y || 0}`;
    case 'navigation':
      return `Navigate from ${action.from} to ${action.to}`;
    case 'submit':
      return `Submit form: ${action.target}`;
    default:
      return `Perform ${action.type} action`;
    }
  }

  calculateWaitTime(currentAction, nextAction) {
    if (!nextAction) return 1000; // Default wait at end
    
    const timeDiff = nextAction.timestamp - currentAction.timestamp;
    
    // Convert to reasonable wait time (min 500ms, max 5000ms)
    return Math.max(500, Math.min(5000, timeDiff * 0.5));
  }

  isRepeatableElement(element) {
    const repeatableTypes = ['button', 'link'];
    const repeatablePurposes = ['pagination', 'load_more', 'next', 'previous'];
    
    return repeatableTypes.includes(element.type) && 
           repeatablePurposes.some(purpose => element.purpose?.includes(purpose));
  }

  escapeRegex(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  async ensureDirectoryExists(dirPath) {
    try {
      await fs.access(dirPath);
    } catch {
      await fs.mkdir(dirPath, { recursive: true });
    }
  }

  getCodeGenerationContext() {
    return `
      You are an expert web scraping developer specializing in Playwright automation.
      Your code should be:
      - Production-ready with proper error handling
      - Efficient and performant
      - Robust against minor DOM changes
      - Well-commented and maintainable
      - Respectful of websites (proper delays, rate limiting)
    `;
  }

  // Template definitions
  getPlaywrightBasicTemplate() {
    return `
// Basic Playwright scraper template
const { chromium } = require('playwright');

async function scrapeWebsite() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  try {
    // Navigate to target page
    await page.goto('URL_PLACEHOLDER');
    
    // Wait for content to load
    await page.waitForLoadState('networkidle');
    
    // Extract data
    const data = await page.evaluate(() => {
      // Data extraction logic here
      return {};
    });
    
    return data;
    
  } catch (error) {
    console.error('Scraping failed:', error);
    throw error;
  } finally {
    await browser.close();
  }
}

module.exports = { scrapeWebsite };
    `;
  }

  getPlaywrightAdvancedTemplate() {
    return `
// Advanced Playwright scraper with interactions and pagination
const { chromium } = require('playwright');

class AdvancedScraper {
  constructor(options = {}) {
    this.options = {
      headless: true,
      timeout: 30000,
      ...options
    };
    this.browser = null;
    this.page = null;
  }

  async initialize() {
    this.browser = await chromium.launch({ 
      headless: this.options.headless,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    this.page = await this.browser.newPage();
    await this.page.setDefaultTimeout(this.options.timeout);
  }

  async scrapeWithInteractions() {
    await this.initialize();
    
    try {
      // Multi-step scraping process
      await this.navigateToTarget();
      await this.performInteractions();
      const data = await this.extractAllData();
      return data;
      
    } catch (error) {
      console.error('Advanced scraping failed:', error);
      throw error;
    } finally {
      await this.cleanup();
    }
  }

  async navigateToTarget() {
    await this.page.goto('URL_PLACEHOLDER');
    await this.page.waitForLoadState('networkidle');
  }

  async performInteractions() {
    // User interaction logic here
  }

  async extractAllData() {
    // Advanced data extraction logic
    return {};
  }

  async cleanup() {
    if (this.browser) {
      await this.browser.close();
    }
  }
}

module.exports = { AdvancedScraper };
    `;
  }

  getPlaywrightEcommerceTemplate() {
    return `
// E-commerce specific Playwright scraper
const { chromium } = require('playwright');

class EcommerceScraper {
  constructor() {
    this.browser = null;
    this.page = null;
    this.products = [];
  }

  async scrapeProducts(searchTerm) {
    await this.initialize();
    
    try {
      await this.searchForProducts(searchTerm);
      await this.extractProductList();
      await this.handlePagination();
      
      return {
        searchTerm,
        totalProducts: this.products.length,
        products: this.products
      };
      
    } finally {
      await this.cleanup();
    }
  }

  async searchForProducts(searchTerm) {
    // Search functionality
  }

  async extractProductList() {
    // Product extraction logic
  }

  async handlePagination() {
    // Pagination handling
  }

  async initialize() {
    this.browser = await chromium.launch({ headless: true });
    this.page = await this.browser.newPage();
  }

  async cleanup() {
    if (this.browser) await this.browser.close();
  }
}

module.exports = { EcommerceScraper };
    `;
  }
}

module.exports = { CodeGenerator };