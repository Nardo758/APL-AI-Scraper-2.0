/**
 * GPT-4V Visual Analysis Engine
 * Advanced visual element detection, form analysis, and pattern recognition for apartment websites
 */

const OpenAI = require('openai');
const { createClient } = require('@supabase/supabase-js');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs').promises;
const path = require('path');

class GPT4VVisualAnalyzer {
  constructor(options = {}) {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });
    
    this.supabase = options.supabase || createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_KEY
    );

    this.config = {
      model: options.model || 'gpt-4-vision-preview',
      maxTokens: options.maxTokens || 4096,
      temperature: options.temperature || 0.1,
      maxImages: options.maxImages || 10,
      retryAttempts: options.retryAttempts || 3,
      retryDelay: options.retryDelay || 2000,
      confidenceThreshold: options.confidenceThreshold || 0.7,
      ...options.config
    };

    this.patterns = new Map(); // Store learned patterns
    this.cache = new Map(); // Analysis result cache
  }

  /**
   * Analyze a webpage screenshot for apartment-specific visual elements
   */
  async analyzeWebpageScreenshot(screenshotPath, websiteInfo, options = {}) {
    try {
      console.log(`🔍 Starting GPT-4V analysis of ${websiteInfo.url}`);

      const analysisId = uuidv4();
      const startTime = Date.now();

      // Convert screenshot to base64
      const imageBase64 = await this.convertImageToBase64(screenshotPath);

      // Create analysis record
      await this.createAnalysisRecord(analysisId, websiteInfo, 'webpage_screenshot');

      // Perform comprehensive visual analysis
      const analysis = await this.performVisualAnalysis(imageBase64, websiteInfo, options);

      // Store results in database
      await this.storeAnalysisResults(analysisId, analysis, Date.now() - startTime);

      // Update pattern learning
      await this.updatePatternLearning(websiteInfo, analysis);

      console.log(`✅ GPT-4V analysis completed for ${websiteInfo.url} (${Date.now() - startTime}ms)`);
      return analysis;

    } catch (error) {
      console.error(`❌ GPT-4V analysis failed for ${websiteInfo.url}:`, error);
      throw error;
    }
  }

  /**
   * Perform comprehensive visual analysis using GPT-4V
   */
  async performVisualAnalysis(imageBase64, websiteInfo, options = {}) {
    const prompts = this.buildAnalysisPrompts(websiteInfo, options);
    const results = {};

    // Run different analysis types
    for (const [analysisType, prompt] of Object.entries(prompts)) {
      try {
        console.log(`📋 Running ${analysisType} analysis...`);
        
        const response = await this.callGPT4V(imageBase64, prompt);
        results[analysisType] = this.parseAnalysisResponse(response, analysisType);
        
        // Small delay between calls to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 500));
        
      } catch (error) {
        console.warn(`⚠️ ${analysisType} analysis failed:`, error);
        results[analysisType] = { error: error.message, confidence: 0 };
      }
    }

    return {
      timestamp: new Date().toISOString(),
      website_url: websiteInfo.url,
      website_type: websiteInfo.type,
      model_used: this.config.model,
      confidence_score: this.calculateOverallConfidence(results),
      analysis_results: results,
      extracted_data: this.extractStructuredData(results),
      visual_elements: this.identifyVisualElements(results),
      recommendations: this.generateRecommendations(results, websiteInfo)
    };
  }

  /**
   * Build specialized prompts for different analysis types
   */
  buildAnalysisPrompts(websiteInfo, options = {}) {
    const baseContext = `
This is a screenshot of ${websiteInfo.url}, an apartment rental website.
Website type: ${websiteInfo.type || 'apartment_listing'}
Target: Extract apartment rental information and analyze website structure.
`;

    return {
      property_detection: baseContext + `
TASK: Identify and extract apartment property information from this screenshot.

Look for:
1. Property names/titles
2. Rental prices (monthly rent, fees, deposits)
3. Unit details (bedrooms, bathrooms, square footage)
4. Availability status
5. Contact information
6. Address/location details
7. Amenities and features
8. Images of apartments/amenities

Return as JSON with fields: properties[], pricing{}, contact{}, location{}, amenities[]
Confidence score 0-1 for each extracted element.`,

      form_analysis: baseContext + `
TASK: Analyze forms, buttons, and interactive elements for automated interaction.

Identify:
1. Search/filter forms (price range, bedrooms, move-in date)
2. Contact/inquiry forms
3. Application forms
4. Navigation elements
5. Interactive buttons and links
6. Input field types and labels
7. Dropdown menus and options
8. Pagination controls

Return as JSON with: forms[], buttons[], inputs[], navigation{}
Include CSS selectors, element types, and required/optional fields.`,

      layout_pattern: baseContext + `
TASK: Analyze website layout and visual patterns for scraping optimization.

Examine:
1. Overall page structure and layout
2. Content organization patterns
3. Repeated elements (property cards, listings)
4. Navigation structure
5. Header/footer elements
6. Sidebar content
7. Grid vs list layouts
8. Mobile/responsive indicators

Return as JSON with: layout{}, patterns[], structure{}, navigation{}
Identify reusable patterns for efficient scraping.`,

      visual_content: baseContext + `
TASK: Catalog visual content and media elements.

Find:
1. Property photos and galleries
2. Floor plans and layouts
3. Amenity images
4. Virtual tours or videos
5. Maps and location views
6. Logos and branding
7. Background images
8. Icons and graphics

Return as JSON with: images[], videos[], maps[], graphics[]
Include image types, quality assessment, and relevance scores.`,

      data_extraction: baseContext + `
TASK: Extract all text-based apartment data visible on screen.

Extract:
1. All visible rental prices and fees
2. Property specifications (bed/bath/sqft)
3. Address and location data
4. Contact information (phone, email, office hours)
5. Lease terms and policies
6. Available amenities
7. Pet policies
8. Parking information

Return as structured JSON with confidence scores.
Flag any unclear or partially visible information.`
    };
  }

  /**
   * Call GPT-4V API with image and prompt
   */
  async callGPT4V(imageBase64, prompt, retryCount = 0) {
    try {
      const response = await this.openai.chat.completions.create({
        model: this.config.model,
        max_tokens: this.config.maxTokens,
        temperature: this.config.temperature,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: prompt
              },
              {
                type: 'image_url',
                image_url: {
                  url: `data:image/jpeg;base64,${imageBase64}`,
                  detail: 'high'
                }
              }
            ]
          }
        ]
      });

      return response.choices[0].message.content;

    } catch (error) {
      if (retryCount < this.config.retryAttempts) {
        console.warn(`⚠️ GPT-4V API call failed, retrying... (${retryCount + 1}/${this.config.retryAttempts})`);
        await new Promise(resolve => setTimeout(resolve, this.config.retryDelay * Math.pow(2, retryCount)));
        return this.callGPT4V(imageBase64, prompt, retryCount + 1);
      }
      throw error;
    }
  }

  /**
   * Parse and structure GPT-4V response
   */
  parseAnalysisResponse(response, analysisType) {
    try {
      // Try to extract JSON from response
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          raw_response: response,
          structured_data: parsed,
          confidence: this.assessResponseConfidence(response, analysisType),
          timestamp: new Date().toISOString()
        };
      } else {
        // Fallback for non-JSON responses
        return {
          raw_response: response,
          structured_data: this.extractDataFromText(response, analysisType),
          confidence: 0.5, // Lower confidence for unstructured responses
          timestamp: new Date().toISOString()
        };
      }
    } catch (error) {
      console.warn(`⚠️ Failed to parse ${analysisType} response:`, error);
      return {
        raw_response: response,
        structured_data: {},
        confidence: 0.2,
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * Extract structured data from analysis results
   */
  extractStructuredData(results) {
    const extracted = {
      properties: [],
      pricing: {},
      contact: {},
      amenities: [],
      forms: [],
      navigation: {}
    };

    // Combine data from different analysis types
    Object.values(results).forEach(result => {
      if (result.structured_data) {
        const data = result.structured_data;
        
        if (data.properties) extracted.properties.push(...data.properties);
        if (data.pricing) extracted.pricing = { ...extracted.pricing, ...data.pricing };
        if (data.contact) extracted.contact = { ...extracted.contact, ...data.contact };
        if (data.amenities) extracted.amenities.push(...data.amenities);
        if (data.forms) extracted.forms.push(...data.forms);
        if (data.navigation) extracted.navigation = { ...extracted.navigation, ...data.navigation };
      }
    });

    return extracted;
  }

  /**
   * Identify visual elements for UI automation
   */
  identifyVisualElements(results) {
    const elements = {
      buttons: [],
      forms: [],
      images: [],
      navigation: [],
      content_blocks: []
    };

    Object.values(results).forEach(result => {
      if (result.structured_data) {
        const data = result.structured_data;
        
        if (data.buttons) elements.buttons.push(...data.buttons);
        if (data.forms) elements.forms.push(...data.forms);
        if (data.images) elements.images.push(...data.images);
        if (data.navigation) elements.navigation.push(...data.navigation);
      }
    });

    return elements;
  }

  /**
   * Generate scraping recommendations based on analysis
   */
  generateRecommendations(results, websiteInfo) {
    const recommendations = {
      scraping_strategy: 'standard',
      priority_elements: [],
      automation_approach: [],
      potential_challenges: [],
      confidence_assessment: 'medium'
    };

    const overallConfidence = this.calculateOverallConfidence(results);

    if (overallConfidence > 0.8) {
      recommendations.scraping_strategy = 'direct';
      recommendations.confidence_assessment = 'high';
      recommendations.automation_approach.push('automated_form_filling');
    } else if (overallConfidence > 0.5) {
      recommendations.scraping_strategy = 'guided';
      recommendations.confidence_assessment = 'medium';
      recommendations.automation_approach.push('semi_automated');
    } else {
      recommendations.scraping_strategy = 'manual_assisted';
      recommendations.confidence_assessment = 'low';
      recommendations.potential_challenges.push('low_confidence_analysis');
    }

    // Add specific recommendations based on detected elements
    if (results.form_analysis?.structured_data?.forms?.length > 0) {
      recommendations.automation_approach.push('form_automation');
    }

    if (results.layout_pattern?.structured_data?.patterns?.length > 0) {
      recommendations.automation_approach.push('pattern_based_extraction');
    }

    return recommendations;
  }

  /**
   * Calculate overall confidence score
   */
  calculateOverallConfidence(results) {
    const confidenceScores = Object.values(results)
      .map(result => result.confidence || 0)
      .filter(score => score > 0);

    if (confidenceScores.length === 0) return 0;

    return confidenceScores.reduce((sum, score) => sum + score, 0) / confidenceScores.length;
  }

  /**
   * Assess confidence of individual response
   */
  assessResponseConfidence(response, analysisType) {
    let confidence = 0.5; // Base confidence

    // Increase confidence for structured responses
    if (response.includes('{') && response.includes('}')) {
      confidence += 0.2;
    }

    // Increase confidence for detailed responses
    if (response.length > 500) {
      confidence += 0.1;
    }

    // Increase confidence for specific apartment-related terms
    const apartmentTerms = ['bedroom', 'bathroom', 'rent', 'lease', 'apartment', 'unit', 'amenity'];
    const termCount = apartmentTerms.filter(term => 
      response.toLowerCase().includes(term)
    ).length;
    
    confidence += Math.min(termCount * 0.05, 0.2);

    return Math.min(confidence, 1.0);
  }

  /**
   * Extract data from unstructured text responses
   */
  extractDataFromText(response, analysisType) {
    const extracted = {};

    // Basic regex patterns for common apartment data
    const patterns = {
      prices: /\$[\d,]+(?:\.\d{2})?/g,
      bedrooms: /(\d+)\s*(?:bed|bedroom|br)/gi,
      bathrooms: /(\d+(?:\.\d)?)\s*(?:bath|bathroom|ba)/gi,
      sqft: /(\d+(?:,\d+)?)\s*(?:sq\.?\s*ft\.?|square\s*feet)/gi,
      phone: /\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g,
      email: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g
    };

    Object.entries(patterns).forEach(([key, pattern]) => {
      const matches = response.match(pattern);
      if (matches) {
        extracted[key] = matches;
      }
    });

    return extracted;
  }

  /**
   * Convert image file to base64
   */
  async convertImageToBase64(imagePath) {
    try {
      const imageBuffer = await fs.readFile(imagePath);
      return imageBuffer.toString('base64');
    } catch (error) {
      throw new Error(`Failed to read image file: ${error.message}`);
    }
  }

  /**
   * Create analysis record in database
   */
  async createAnalysisRecord(analysisId, websiteInfo, analysisType) {
    try {
      const { error } = await this.supabase
        .from('visual_analysis_results')
        .insert({
          id: analysisId,
          url: websiteInfo.url,
          website_type: websiteInfo.type || 'apartment_listing',
          analysis_type: analysisType,
          ai_model: this.config.model,
          status: 'processing',
          started_at: new Date().toISOString()
        });

      if (error) throw error;
    } catch (error) {
      console.warn('⚠️ Failed to create analysis record:', error);
    }
  }

  /**
   * Store analysis results in database
   */
  async storeAnalysisResults(analysisId, analysis, processingTime) {
    try {
      const { error } = await this.supabase
        .from('visual_analysis_results')
        .update({
          status: 'completed',
          confidence_score: analysis.confidence_score,
          analysis_results: analysis.analysis_results,
          extracted_data: analysis.extracted_data,
          visual_elements: analysis.visual_elements,
          recommendations: analysis.recommendations,
          processing_duration_ms: processingTime,
          completed_at: new Date().toISOString()
        })
        .eq('id', analysisId);

      if (error) throw error;
    } catch (error) {
      console.warn('⚠️ Failed to store analysis results:', error);
    }
  }

  /**
   * Update pattern learning system
   */
  async updatePatternLearning(websiteInfo, analysis) {
    try {
      const patternKey = `${websiteInfo.type}_${new URL(websiteInfo.url).hostname}`;
      
      // Store or update pattern in local cache
      this.patterns.set(patternKey, {
        url_pattern: websiteInfo.url,
        layout_patterns: analysis.analysis_results.layout_pattern?.structured_data || {},
        form_patterns: analysis.analysis_results.form_analysis?.structured_data || {},
        confidence: analysis.confidence_score,
        last_updated: new Date().toISOString(),
        success_count: (this.patterns.get(patternKey)?.success_count || 0) + 1
      });

      // Also store in database for persistence
      await this.supabase
        .from('website_patterns')
        .upsert({
          website_domain: new URL(websiteInfo.url).hostname,
          website_type: websiteInfo.type || 'apartment_listing',
          layout_patterns: analysis.analysis_results.layout_pattern?.structured_data || {},
          form_patterns: analysis.analysis_results.form_analysis?.structured_data || {},
          confidence_score: analysis.confidence_score,
          last_updated: new Date().toISOString()
        }, {
          onConflict: 'website_domain,website_type'
        });

    } catch (error) {
      console.warn('⚠️ Failed to update pattern learning:', error);
    }
  }

  /**
   * Get learned patterns for a website
   */
  async getLearnedPatterns(websiteUrl, websiteType) {
    try {
      const domain = new URL(websiteUrl).hostname;
      
      // First check local cache
      const cacheKey = `${websiteType}_${domain}`;
      if (this.patterns.has(cacheKey)) {
        return this.patterns.get(cacheKey);
      }

      // Check database
      const { data, error } = await this.supabase
        .from('website_patterns')
        .select('*')
        .eq('website_domain', domain)
        .eq('website_type', websiteType)
        .single();

      if (error || !data) return null;

      // Cache for future use
      this.patterns.set(cacheKey, data);
      return data;

    } catch (error) {
      console.warn('⚠️ Failed to get learned patterns:', error);
      return null;
    }
  }

  /**
   * Analyze multiple screenshots in batch
   */
  async analyzeBatch(screenshots, websiteInfo, options = {}) {
    console.log(`📦 Starting batch analysis of ${screenshots.length} screenshots`);
    
    const results = [];
    const batchId = uuidv4();

    // Create batch record
    await this.supabase
      .from('ai_processing_batches')
      .insert({
        id: batchId,
        batch_type: 'gpt4v_visual',
        status: 'processing',
        total_items: screenshots.length,
        ai_model: this.config.model,
        started_at: new Date().toISOString()
      });

    try {
      // Process with controlled concurrency
      const concurrencyLimit = 2; // Limit concurrent GPT-4V calls
      
      for (let i = 0; i < screenshots.length; i += concurrencyLimit) {
        const batch = screenshots.slice(i, i + concurrencyLimit);
        
        const batchResults = await Promise.allSettled(
          batch.map(screenshot => 
            this.analyzeWebpageScreenshot(screenshot.path, {
              ...websiteInfo,
              url: screenshot.url || websiteInfo.url
            }, options)
          )
        );

        results.push(...batchResults);
        
        // Small delay between batches
        if (i + concurrencyLimit < screenshots.length) {
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      }

      // Update batch completion
      const successful = results.filter(r => r.status === 'fulfilled').length;
      const failed = results.filter(r => r.status === 'rejected').length;

      await this.supabase
        .from('ai_processing_batches')
        .update({
          status: failed === 0 ? 'completed' : 'completed_with_errors',
          processed_items: successful,
          failed_items: failed,
          completed_at: new Date().toISOString()
        })
        .eq('id', batchId);

      console.log(`✅ Batch analysis completed: ${successful} successful, ${failed} failed`);
      return results;

    } catch (error) {
      await this.supabase
        .from('ai_processing_batches')
        .update({
          status: 'failed',
          completed_at: new Date().toISOString()
        })
        .eq('id', batchId);

      throw error;
    }
  }

  /**
   * Get analysis statistics
   */
  async getAnalysisStats(timeframe = '24h') {
    try {
      const cutoffDate = new Date();
      const hours = timeframe === '24h' ? 24 : timeframe === '7d' ? 168 : 1;
      cutoffDate.setHours(cutoffDate.getHours() - hours);

      const { data, error } = await this.supabase
        .from('visual_analysis_results')
        .select('status, confidence_score, processing_duration_ms')
        .gte('started_at', cutoffDate.toISOString());

      if (error) throw error;

      const stats = data.reduce((acc, item) => {
        acc.total++;
        acc[item.status] = (acc[item.status] || 0) + 1;
        acc.totalProcessingTime += item.processing_duration_ms || 0;
        acc.confidenceSum += item.confidence_score || 0;
        return acc;
      }, { total: 0, totalProcessingTime: 0, confidenceSum: 0 });

      return {
        total: stats.total,
        completed: stats.completed || 0,
        failed: stats.failed || 0,
        processing: stats.processing || 0,
        averageProcessingTime: stats.total > 0 ? stats.totalProcessingTime / stats.total : 0,
        averageConfidence: stats.total > 0 ? stats.confidenceSum / stats.total : 0,
        successRate: stats.total > 0 ? ((stats.completed || 0) / stats.total * 100) : 0
      };
    } catch (error) {
      console.error('❌ Error getting analysis stats:', error);
      return {};
    }
  }
}

module.exports = { GPT4VVisualAnalyzer };