// Self-Healing Scraper Engine
const { AIService } = require('../ai-service');

class SelfHealingEngine {
  constructor() {
    this.aiService = new AIService();
    this.supabase = null; // Will be injected
    this.retryStrategies = [
      { name: 'selector_variation', weight: 0.8, priority: 1 },
      { name: 'xpath_fallback', weight: 0.7, priority: 2 },
      { name: 'text_content_matching', weight: 0.6, priority: 3 },
      { name: 'ai_selector_generation', weight: 0.9, priority: 4 }
    ];
  }

  setSupabase(supabase) {
    this.supabase = supabase;
  }

  async handleScrapingFailure(job, error, page) {
    console.log(`ðŸ”§ Attempting self-healing for job ${job.id}: ${error.message}`);
    
    const context = await this.analyzeFailureContext(job, error, page);
    const healingStrategies = this.getHealingStrategies(context);
    
    // Try different healing strategies in order of effectiveness
    for (const strategy of healingStrategies) {
      console.log(`ðŸŽ¯ Trying healing strategy: ${strategy.name} (priority: ${strategy.priority})`);
      
      try {
        const result = await strategy.apply(context);
        
        if (result.success) {
          await this.recordHealingSuccess(job, strategy, result);
          console.log(`âœ… Self-healing successful with strategy: ${strategy.name}`);
          return result;
        } else {
          console.log(`âŒ Strategy ${strategy.name} failed: ${result.reason || 'Unknown reason'}`);
        }
      } catch (strategyError) {
        console.error(`Strategy ${strategy.name} threw error:`, strategyError.message);
      }
    }
    
    // All strategies failed
    await this.recordHealingFailure(job, context);
    throw new Error(`Self-healing failed for job ${job.id} - all strategies exhausted`);
  }

  async analyzeFailureContext(job, error, page) {
    console.log(`ðŸ” Analyzing failure context for job ${job.id}`);
    
    let screenshot = null;
    let htmlContent = null;
    let pageTitle = 'Unknown';
    let pageUrl = 'Unknown';

    try {
      screenshot = await page.screenshot({ encoding: 'base64', fullPage: false });
      htmlContent = await page.content();
      pageTitle = await page.title();
      pageUrl = page.url();
    } catch (pageError) {
      console.warn('Could not capture page context:', pageError.message);
    }
    
    return {
      job: job,
      error: error.message,
      errorStack: error.stack,
      url: pageUrl,
      screenshot: screenshot,
      html: htmlContent,
      timestamp: new Date().toISOString(),
      selectors: this.extractSelectorsFromError(error),
      pageTitle: pageTitle,
      page: page // Include page reference for strategy execution
    };
  }

  extractSelectorsFromError(error) {
    const selectorRegex = /selector[^'"`]*['"`]([^'"`]+)['"`]/g;
    const xpathRegex = /xpath[^'"`]*['"`]([^'"`]+)['"`]/g;
    const matches = [];
    let match;
    
    // Extract CSS selectors
    while ((match = selectorRegex.exec(error.message)) !== null) {
      matches.push({ type: 'css', selector: match[1] });
    }
    
    // Extract XPath expressions
    while ((match = xpathRegex.exec(error.message)) !== null) {
      matches.push({ type: 'xpath', selector: match[1] });
    }
    
    // Also check error stack for additional selectors
    if (error.stack) {
      while ((match = selectorRegex.exec(error.stack)) !== null) {
        matches.push({ type: 'css', selector: match[1] });
      }
    }
    
    return matches;
  }

  getHealingStrategies(context) {
    return this.retryStrategies
      .sort((a, b) => a.priority - b.priority) // Sort by priority (lower number = higher priority)
      .map(strategy => ({
        ...strategy,
        apply: this[`apply${this.camelCase(strategy.name)}`].bind(this)
      }));
  }

  async applySelectorVariation(context) {
    console.log('ðŸ”„ Applying selector variation strategy');
    
    const failedSelectors = context.selectors.filter(s => s.type === 'css');
    
    for (const selectorInfo of failedSelectors) {
      const variations = this.generateSelectorVariations(selectorInfo.selector);
      
      for (const variation of variations) {
        try {
          const element = await context.page.$(variation);
          if (element) {
            // Verify element is visible and has content
            const isVisible = await element.isVisible().catch(() => false);
            const hasContent = await element.textContent().then(text => text.trim().length > 0).catch(() => false);
            
            if (isVisible || hasContent) {
              return {
                success: true,
                strategy: 'selector_variation',
                newSelector: variation,
                originalSelector: selectorInfo.selector,
                confidence: 0.8
              };
            }
          }
        } catch (error) {
          // Continue to next variation
          console.log(`Selector variation failed: ${variation} - ${error.message}`);
        }
      }
    }
    
    return { success: false, reason: 'No working selector variations found' };
  }

  generateSelectorVariations(selector) {
    const variations = [];
    
    // Original selector (for completeness)
    variations.push(selector);
    
    // Remove specificity levels
    if (selector.includes('.')) {
      // Try without specific classes
      const withoutClasses = selector.replace(/\.[\w-]+/g, '');
      if (withoutClasses.trim()) variations.push(withoutClasses.trim());
      
      // Try with different class combinations
      const classes = selector.match(/\.[\w-]+/g) || [];
      if (classes.length > 1) {
        // Try with just the first class
        const baseElement = selector.replace(/\.[\w-]+/g, '').trim();
        variations.push(`${baseElement}${classes[0]}`);
        
        // Try with just the last class
        variations.push(`${baseElement}${classes[classes.length - 1]}`);
        
        // Try all combinations of 2 classes
        for (let i = 0; i < classes.length - 1; i++) {
          for (let j = i + 1; j < classes.length; j++) {
            variations.push(`${baseElement}${classes[i]}${classes[j]}`);
          }
        }
      }
    }
    
    // Try attribute selectors
    if (selector.includes('[')) {
      const withoutAttributes = selector.replace(/\[[^\]]+\]/g, '');
      if (withoutAttributes.trim()) variations.push(withoutAttributes.trim());
    }
    
    // Try less specific parent-child relationships
    if (selector.includes('>')) {
      const withDescendant = selector.replace(/\s*>\s*/g, ' ');
      variations.push(withDescendant);
    }
    
    // Try with :first-child, :last-child variations
    if (!selector.includes(':')) {
      variations.push(`${selector}:first-child`);
      variations.push(`${selector}:last-child`);
      variations.push(`${selector}:nth-child(1)`);
    }
    
    return [...new Set(variations)].filter(v => v && v !== selector);
  }

  async applyXpathFallback(context) {
    console.log('ðŸ”„ Applying XPath fallback strategy');
    
    const failedSelectors = context.selectors.filter(s => s.type === 'css');
    
    for (const selectorInfo of failedSelectors) {
      try {
        const xpath = this.cssToXPath(selectorInfo.selector);
        const elements = await context.page.$$(`xpath=${xpath}`);
        
        if (elements.length > 0) {
          // Test the first element
          const element = elements[0];
          const isVisible = await element.isVisible().catch(() => false);
          const hasContent = await element.textContent().then(text => text.trim().length > 0).catch(() => false);
          
          if (isVisible || hasContent) {
            return {
              success: true,
              strategy: 'xpath_fallback',
              xpath: xpath,
              originalSelector: selectorInfo.selector,
              elementsFound: elements.length,
              confidence: 0.7
            };
          }
        }
      } catch (error) {
        console.log(`XPath conversion failed for ${selectorInfo.selector}:`, error.message);
      }
    }
    
    return { success: false, reason: 'XPath fallback selectors not found' };
  }

  cssToXPath(selector) {
    // Enhanced CSS to XPath conversion
    let xpath = selector
      // Handle direct child combinator
      .replace(/\s*>\s*/g, '/')
      // Handle adjacent sibling combinator
      .replace(/\s*\+\s*/g, '/following-sibling::*[1]/')
      // Handle general sibling combinator
      .replace(/\s*~\s*/g, '/following-sibling::')
      // Handle descendant combinator
      .replace(/\s+/g, '//')
      // Handle class selectors
      .replace(/\.([a-zA-Z][\w-]*)/g, '[contains(concat(" ", @class, " "), " $1 ")]')
      // Handle ID selectors
      .replace(/#([a-zA-Z][\w-]*)/g, '[@id="$1"]')
      // Handle attribute selectors
      .replace(/\[([a-zA-Z][\w-]*)=(['"])([^'"]+)\2\]/g, '[@$1="$3"]')
      .replace(/\[([a-zA-Z][\w-]*)\]/g, '[@$1]')
      // Handle pseudo-selectors
      .replace(/:first-child/g, '[1]')
      .replace(/:last-child/g, '[last()]')
      .replace(/:nth-child\((\d+)\)/g, '[$1]');
    
    // Ensure XPath starts correctly
    if (!xpath.startsWith('/') && !xpath.startsWith('//')) {
      xpath = '//' + xpath;
    }
    
    return xpath;
  }

  async applyTextContentMatching(context) {
    console.log('ðŸ”„ Applying text content matching strategy');
    
    if (!context.screenshot) {
      return { success: false, reason: 'No screenshot available for analysis' };
    }

    try {
      // Use AI to find elements by their text content
      const prompt = `
        Analyze this webpage screenshot and find elements that match the scraping intent.
        
        FAILED SELECTORS: ${context.selectors.map(s => s.selector).join(', ')}
        ERROR: ${context.error}
        PAGE TITLE: ${context.pageTitle}
        
        Based on the error and typical web structures, suggest new CSS selectors that might work.
        Consider:
        1. Elements with similar text content or positioning
        2. Elements with similar structural relationships
        3. Alternative attribute combinations
        4. Common selector patterns for this type of content
        
        Return JSON: {
          "suggested_selectors": [
            {
              "selector": "css_selector",
              "confidence": 0.9,
              "reason": "Explanation for why this selector should work"
            }
          ]
        }
      `;

      const analysis = await this.aiService.analyzeWithGPT4V(
        Buffer.from(context.screenshot, 'base64'),
        prompt
      );

      const suggestions = JSON.parse(analysis).suggested_selectors || [];
      
      // Try suggested selectors by confidence order
      for (const suggestion of suggestions.sort((a, b) => b.confidence - a.confidence)) {
        try {
          const elements = await context.page.$$(suggestion.selector);
          if (elements.length > 0) {
            const element = elements[0];
            const isVisible = await element.isVisible().catch(() => false);
            const hasContent = await element.textContent().then(text => text.trim().length > 0).catch(() => false);
            
            if (isVisible || hasContent) {
              return {
                success: true,
                strategy: 'text_content_matching',
                newSelector: suggestion.selector,
                confidence: suggestion.confidence,
                reason: suggestion.reason,
                elementsFound: elements.length
              };
            }
          }
        } catch (error) {
          console.log(`AI suggested selector failed: ${suggestion.selector} - ${error.message}`);
        }
      }
    } catch (error) {
      console.error('AI-based text content matching failed:', error);
    }
    
    return { success: false, reason: 'AI text content analysis did not find working selectors' };
  }

  async applyAiSelectorGeneration(context) {
    console.log('ðŸ”„ Applying AI selector generation strategy');
    
    if (!context.html) {
      return { success: false, reason: 'No HTML content available for analysis' };
    }

    try {
      // Use AI to generate entirely new selectors based on page content
      const prompt = `
        Given this webpage HTML and the original scraping intent, generate new CSS selectors.
        
        ORIGINAL INTENT: Extract data that was previously selected by: ${context.selectors.map(s => s.selector).join(', ')}
        
        PAGE HTML STRUCTURE (key elements):
        ${this.extractRelevantHtml(context.html)}
        
        ERROR CONTEXT: ${context.error}
        
        Generate robust CSS selectors that are likely to survive minor DOM changes.
        Focus on:
        1. Semantic HTML elements (article, section, main, etc.)
        2. Data attributes (data-*, role, etc.)
        3. Structural relationships that are stable
        4. Content patterns and text-based matching
        
        Return JSON: {
          "generated_selectors": [
            {
              "selector": "css_selector",
              "type": "primary|fallback",
              "explanation": "Why this selector should work and be robust"
            }
          ]
        }
      `;

      const response = await this.aiService.queryClaude(prompt);
      const generated = JSON.parse(response).generated_selectors || [];
      
      for (const genSelector of generated) {
        try {
          const elements = await context.page.$$(genSelector.selector);
          if (elements.length > 0) {
            const element = elements[0];
            const isVisible = await element.isVisible().catch(() => false);
            const hasContent = await element.textContent().then(text => text.trim().length > 0).catch(() => false);
            
            if (isVisible || hasContent) {
              return {
                success: true,
                strategy: 'ai_selector_generation',
                newSelector: genSelector.selector,
                type: genSelector.type,
                explanation: genSelector.explanation,
                elementsFound: elements.length,
                confidence: 0.9
              };
            }
          }
        } catch (error) {
          console.log(`AI generated selector failed: ${genSelector.selector} - ${error.message}`);
        }
      }
    } catch (error) {
      console.error('AI selector generation failed:', error);
    }
    
    return { success: false, reason: 'AI selector generation did not produce working selectors' };
  }

  extractRelevantHtml(html) {
    // Extract key structural elements for AI analysis
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    
    const relevantElements = [];
    
    // Find semantic containers
    const semanticTags = ['main', 'article', 'section', 'nav', 'aside', 'header', 'footer'];
    semanticTags.forEach(tag => {
      const elements = doc.querySelectorAll(tag);
      elements.forEach(el => {
        relevantElements.push(`<${tag} ${this.getRelevantAttributes(el)}>`);
      });
    });
    
    // Find elements with data attributes
    const dataElements = doc.querySelectorAll('[data-*]');
    dataElements.forEach(el => {
      if (relevantElements.length < 20) { // Limit to avoid overwhelming AI
        relevantElements.push(`<${el.tagName.toLowerCase()} ${this.getRelevantAttributes(el)}>`);
      }
    });
    
    return relevantElements.join('\n').substring(0, 2000); // Limit size
  }

  getRelevantAttributes(element) {
    const attrs = [];
    if (element.id) attrs.push(`id="${element.id}"`);
    if (element.className) attrs.push(`class="${element.className}"`);
    
    // Include data attributes
    Array.from(element.attributes).forEach(attr => {
      if (attr.name.startsWith('data-') || attr.name === 'role' || attr.name === 'aria-label') {
        attrs.push(`${attr.name}="${attr.value}"`);
      }
    });
    
    return attrs.join(' ');
  }

  async recordHealingSuccess(job, strategy, result) {
    console.log(`âœ… Recording healing success for job ${job.id} with strategy ${strategy.name}`);
    
    if (this.supabase) {
      await this.supabase
        .from('healing_events')
        .insert([{
          job_id: job.id,
          strategy: strategy.name,
          success: true,
          original_error: job.error_message || 'Unknown error',
          healing_result: result,
          timestamp: new Date().toISOString()
        }]);
    }

    // Update template with learned improvements (may be optional)
    void result;
    await this.updateTemplateWithLearning(job.template_id, strategy, result);
  }

  async recordHealingFailure(job, context) {
    console.log(`âŒ Recording healing failure for job ${job.id}`);
    
    if (this.supabase) {
      await this.supabase
        .from('healing_events')
        .insert([{
          job_id: job.id,
          strategy: 'all_failed',
          success: false,
          original_error: context.error,
          healing_result: {
            attempted_strategies: this.retryStrategies.map(s => s.name),
            failure_context: {
              selectors_found: context.selectors,
              page_title: context.pageTitle,
              timestamp: context.timestamp
            }
          },
          timestamp: new Date().toISOString()
        }]);
    }
  }

  async updateTemplateWithLearning(templateId, strategy, result) {
    if (!this.supabase || !templateId) return;

    try {
      const { data: template } = await this.supabase
        .from('scraper_templates')
        .select('*')
        .eq('id', templateId)
        .single();

      if (!template) return;

      // Add fallback selectors to template configuration
      const updatedConfig = {
        ...template.config,
        fallback_selectors: [
          ...(template.config.fallback_selectors || []),
          {
            selector: result.newSelector || result.xpath,
            strategy: strategy.name,
            added_at: new Date().toISOString(),
            confidence: result.confidence || 0.8,
            original_failure: result.originalSelector,
            success_context: {
              elements_found: result.elementsFound,
              explanation: result.explanation || result.reason
            }
          }
        ].slice(-10) // Keep only last 10 fallback selectors
      };

      await this.supabase
        .from('scraper_templates')
        .update({ 
          config: updatedConfig,
          last_healed: new Date().toISOString()
        })
        .eq('id', templateId);

      console.log(`ðŸ“š Updated template ${templateId} with learned selector: ${result.newSelector || result.xpath}`);
    } catch (error) {
      console.error('Error updating template with learning:', error);
    }
  }

  async getHealingStats(templateId = null, days = 30) {
    if (!this.supabase) return null;

    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
    
    let query = this.supabase
      .from('healing_events')
      .select('strategy, success, timestamp')
      .gte('timestamp', startDate);

    if (templateId) {
      // Need to join with jobs to filter by template
      query = this.supabase
        .from('healing_events')
        .select(`
          strategy, 
          success, 
          timestamp,
          scraping_jobs!inner(template_id)
        `)
        .eq('scraping_jobs.template_id', templateId)
        .gte('timestamp', startDate);
    }

    const { data } = await query.order('timestamp', { ascending: false });

    if (!data) return null;

    const stats = {
      total_attempts: data.length,
      successful_healings: data.filter(e => e.success).length,
      success_rate: 0,
      by_strategy: {},
      recent_events: data.slice(0, 10)
    };

    stats.success_rate = stats.total_attempts > 0 ? stats.successful_healings / stats.total_attempts : 0;

    // Group by strategy
    for (const event of data) {
      if (!stats.by_strategy[event.strategy]) {
        stats.by_strategy[event.strategy] = { attempts: 0, successes: 0, success_rate: 0 };
      }
      
      stats.by_strategy[event.strategy].attempts++;
      if (event.success) {
        stats.by_strategy[event.strategy].successes++;
      }
      
      stats.by_strategy[event.strategy].success_rate = 
        stats.by_strategy[event.strategy].successes / stats.by_strategy[event.strategy].attempts;
    }

    return stats;
  }

  camelCase(str) {
    return str.replace(/_([a-z])/g, (g) => g[1].toUpperCase());
  }
}

module.exports = { SelfHealingEngine };