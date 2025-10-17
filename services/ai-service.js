// APL AI Scraper 2.0 - AI Services Integration
const { OpenAI } = require('openai');
const Anthropic = require('@anthropic-ai/sdk');

class AIService {
  constructor() {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });
    
    this.anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY
    });

    console.log('ðŸ¤– AI Services initialized');
  }

  async analyzeWithGPT4V(imageBuffer, prompt = 'Analyze this screenshot and describe what you see in detail.') {
    try {
      console.log('ðŸ” Starting GPT-4V image analysis');

      const response = await this.openai.chat.completions.create({
        model: 'gpt-4-vision-preview',
        messages: [
          {
            role: 'system',
            content: 'You are an expert web scraper and UI analyst. Analyze screenshots of web pages and provide detailed insights about the structure, elements, and data extraction opportunities.'
          },
          {
            role: 'user',
            content: [
              { type: 'text', text: prompt },
              {
                type: 'image_url',
                image_url: {
                  url: `data:image/png;base64,${imageBuffer.toString('base64')}`,
                  detail: 'high'
                }
              }
            ]
          }
        ],
        max_tokens: 2000,
        temperature: 0.3
      });

      const analysis = response.choices[0].message.content;
      console.log('âœ… GPT-4V analysis completed');
      return analysis;
    } catch (error) {
      console.error('âŒ GPT-4V Error:', error.message);
      throw new Error(`GPT-4V analysis failed: ${error.message}`);
    }
  }

  async generateScrapingStrategy(url, requirements) {
    try {
      console.log('Generating scraping strategy for: ' + url);

      const prompt = `
        As an expert web scraper, analyze this URL and requirements to create a comprehensive scraping strategy.

        URL: ${url}
        Requirements: ${requirements}

        Please provide a JSON response with the following structure:
        {
          "strategy": "brief description of the approach",
          "selectors": [
            {
              "name": "field_name",
              "selector": "css_selector",
              "type": "text|html|attribute|href|src",
              "attribute": "attribute_name_if_applicable",
              "multiple": true/false,
              "description": "what this extracts"
            }
          ],
          "actions": [
            {
              "type": "click|type|scroll|wait",
              "selector": "css_selector",
              "value": "input_value_if_applicable",
              "delay": 1000,
              "description": "action description"
            }
          ],
          "waitConditions": [
            {
              "selector": "css_selector",
              "timeout": 5000,
              "description": "what to wait for"
            }
          ],
          "challenges": ["potential issues"],
          "recommendations": ["best practices for this site"]
        }
      `;

      const strategy = await this.queryClaude(prompt);
      
      try {
        return JSON.parse(strategy);
      } catch (parseError) {
        console.warn('âš ï¸ Strategy JSON parsing failed, returning raw text');
        return { strategy: strategy, error: 'Failed to parse JSON response' };
      }
    } catch (error) {
      console.error('âŒ Failed to generate scraping strategy:', error.message);
      throw error;
    }
  }

  async queryClaude(prompt, context = '', model = 'claude-3-sonnet-20240229') {
    try {
      console.log('ðŸ¤– Querying Claude AI');

      const message = await this.anthropic.messages.create({
        model: model,
        max_tokens: 4000,
        temperature: 0.3,
        system: 'You are an expert web scraper and data extraction specialist. Provide detailed, actionable responses focused on web scraping strategies and techniques.',
        messages: [{
          role: 'user',
          content: context ? `${context}\n\n${prompt}` : prompt
        }]
      });

      const response = message.content[0].text;
      console.log('âœ… Claude response received');
      return response;
    } catch (error) {
      console.error('âŒ Claude Error:', error.message);
      throw new Error(`Claude query failed: ${error.message}`);
    }
  }

  async discoverSitesWithAI(query, maxSites = 10) {
    try {
      console.log(`ðŸ” AI site discovery for query: ${query}`);

      const discoveryPrompt = `
        Based on the following search query, suggest ${maxSites} websites that would likely contain relevant information for web scraping.
        
        Query: "${query}"
        
        For each website, consider:
        - Data availability and quality
        - Scraping feasibility
        - Legal and ethical considerations
        - API availability
        
        Return a JSON array of objects with this structure:
        [
          {
            "url": "https://example.com",
            "name": "Site Name",
            "description": "What data/content this site offers",
            "confidence": 0.9,
            "scraping_difficulty": "easy|medium|hard",
            "data_types": ["products", "prices", "reviews"],
            "notes": "Any special considerations",
            "has_api": true/false,
            "requires_auth": true/false
          }
        ]
        
        Focus on legitimate, publicly accessible sites with valuable data related to the query.
      `;

      const result = await this.queryClaude(discoveryPrompt);
      
      try {
        const sites = JSON.parse(result);
        console.log(`âœ… Discovered ${sites.length} potential sites`);
        return Array.isArray(sites) ? sites : [sites];
      } catch (parseError) {
        console.warn('âš ï¸ Site discovery JSON parsing failed');
        return this.parseAIDiscoveryResult(result);
      }
    } catch (error) {
      console.error('âŒ AI site discovery failed:', error.message);
      return [];
    }
  }

  parseAIDiscoveryResult(text) {
    const sites = [];
    const lines = text.split('\n');
    
    for (const line of lines) {
      const urlMatch = line.match(/https?:\/\/[^\s]+/);
      if (urlMatch) {
        // Extract site name from line
        const nameMatch = line.match(/(?:^|\s)([A-Z][a-zA-Z\s]+?)(?:\s-|\s:|$)/);
        const name = nameMatch ? nameMatch[1].trim() : 'Unknown Site';
        
        sites.push({
          url: urlMatch[0],
          name: name,
          description: line.replace(urlMatch[0], '').trim(),
          confidence: 0.7,
          scraping_difficulty: 'medium',
          data_types: ['general'],
          notes: 'Parsed from AI response',
          has_api: false,
          requires_auth: false
        });
      }
    }
    
    return sites.slice(0, 10); // Limit to 10 sites
  }

  async analyzePageStructure(htmlContent, url) {
    try {
      console.log(`ðŸ“Š Analyzing page structure for: ${url}`);

      const prompt = `
        Analyze this HTML content and identify the best selectors for data extraction.
        
        URL: ${url}
        HTML Length: ${htmlContent.length} characters
        
        HTML Content (truncated):
        ${htmlContent.substring(0, 3000)}...
        
        Please identify:
        1. Main content areas
        2. Navigation elements
        3. Data-rich sections
        4. Form elements
        5. Dynamic content indicators
        
        Return a JSON object with recommended selectors for common data types:
        {
          "page_type": "e-commerce|blog|news|directory|other",
          "main_content": "css_selector",
          "title": "css_selector",
          "description": "css_selector",
          "images": "css_selector",
          "links": "css_selector",
          "data_sections": [
            {
              "name": "section_name",
              "selector": "css_selector",
              "type": "list|single|table",
              "description": "what this contains"
            }
          ],
          "pagination": "css_selector_or_null",
          "load_more": "css_selector_or_null",
          "forms": [
            {
              "selector": "css_selector",
              "purpose": "search|login|contact|other"
            }
          ]
        }
      `;

      const analysis = await this.queryClaude(prompt);
      
      try {
        return JSON.parse(analysis);
      } catch (parseError) {
        console.warn('âš ï¸ Page structure analysis JSON parsing failed');
        return { 
          page_type: 'unknown',
          error: 'Failed to parse analysis',
          raw_analysis: analysis 
        };
      }
    } catch (error) {
      console.error('âŒ Page structure analysis failed:', error.message);
      throw error;
    }
  }

  async optimizeSelectors(selectors, pageContent) {
    try {
      console.log('âš¡ Optimizing CSS selectors');

      const prompt = `
        Review and optimize these CSS selectors for better reliability and performance:
        
        Current Selectors:
        ${JSON.stringify(selectors, null, 2)}
        
        Page Content (sample):
        ${pageContent.substring(0, 2000)}...
        
        Please provide optimized selectors with:
        1. Better specificity
        2. Improved reliability
        3. Fallback options
        4. Performance considerations
        
        Return JSON with the same structure but optimized selectors and added fallback_selectors arrays.
      `;

      const optimized = await this.queryClaude(prompt);
      
      try {
        return JSON.parse(optimized);
      } catch (parseError) {
        console.warn('âš ï¸ Selector optimization JSON parsing failed');
        return selectors; // Return original selectors as fallback
      }
    } catch (error) {
      console.error('âŒ Selector optimization failed:', error.message);
      return selectors; // Return original selectors as fallback
    }
  }

  async generateCode(requirements, format = 'playwright') {
    try {
      console.log(`ðŸ—ï¸ Generating ${format} scraping code`);

      const prompt = `
        Generate production-ready web scraping code based on these requirements:
        
        Requirements:
        ${JSON.stringify(requirements, null, 2)}
        
        Format: ${format}
        
        Please generate:
        1. Complete, runnable code
        2. Error handling
        3. Rate limiting
        4. Data validation
        5. Export functionality
        
        Include comments explaining key parts of the code.
        Make the code modular and maintainable.
      `;

      const code = await this.queryClaude(prompt);
      console.log('âœ… Code generation completed');
      return code;
    } catch (error) {
      console.error('âŒ Code generation failed:', error.message);
      throw error;
    }
  }

  async detectAntiBot(pageContent, url) {
    try {
      console.log(`ðŸ›¡ï¸ Detecting anti-bot measures for: ${url}`);

      const prompt = `
        Analyze this page content for anti-bot protection mechanisms:
        
        URL: ${url}
        Content (sample): ${pageContent.substring(0, 2000)}...
        
        Look for:
        1. CAPTCHA systems
        2. Rate limiting indicators
        3. JavaScript challenges
        4. Cloudflare protection
        5. Bot detection scripts
        6. Unusual redirects
        
        Return JSON:
        {
          "has_protection": true/false,
          "protection_types": ["captcha", "rate_limit", "js_challenge"],
          "indicators": ["specific indicators found"],
          "bypass_suggestions": ["recommended approaches"],
          "risk_level": "low|medium|high"
        }
      `;

      const analysis = await this.queryClaude(prompt);
      
      try {
        return JSON.parse(analysis);
      } catch (parseError) {
        return {
          has_protection: false,
          protection_types: [],
          indicators: [],
          bypass_suggestions: [],
          risk_level: 'unknown'
        };
      }
    } catch (error) {
      console.error('âŒ Anti-bot detection failed:', error.message);
      return {
        has_protection: false,
        protection_types: [],
        indicators: [],
        bypass_suggestions: [],
        risk_level: 'unknown'
      };
    }
  }
}

module.exports = { AIService };