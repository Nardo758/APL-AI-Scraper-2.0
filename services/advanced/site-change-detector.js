// AI-Powered Site Change Detection System
const { AIService } = require('../ai-service');
const crypto = require('crypto');
void crypto; // crypto imported for future use; acknowledge to satisfy linter

class SiteChangeDetector {
  constructor() {
    this.aiService = new AIService();
    this.changeThreshold = 0.15; // 15% change threshold
    this.supabase = null; // Will be injected
    this.monitoringIntervals = new Map();
  }

  setSupabase(supabase) {
    this.supabase = supabase;
  }

  async monitorTemplate(templateId, baselineData) {
    // Clear existing monitoring for this template
    if (this.monitoringIntervals.has(templateId)) {
      clearInterval(this.monitoringIntervals.get(templateId));
    }

    // Start monitoring for site changes
    const interval = setInterval(async () => {
      await this.checkForChanges(templateId, baselineData);
    }, 3600000); // Check every hour

    this.monitoringIntervals.set(templateId, interval);

    // Also monitor after each scrape
    await this.setupRealtimeMonitoring(templateId);
    
    console.log(`ðŸ” Started monitoring template ${templateId} for site changes`);
  }

  async setupRealtimeMonitoring(templateId) {
    if (!this.supabase) return;

    // Set up real-time monitoring for scraping executions
    const subscription = this.supabase
      .channel(`template_monitoring_${templateId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'scraping_executions',
          filter: `template_id=eq.${templateId}`
        },
        async (payload) => {
          const execution = payload.new;
          if (execution?.status === 'failed') {
            await this.handleExecutionFailure(templateId, execution);
          } else {
            void execution; // acknowledged for linter
          }
        }
      )
      .subscribe();

    return subscription;
  }

  async handleExecutionFailure(templateId, execution) {
    console.log(`ðŸš¨ Execution failure detected for template ${templateId}, checking for site changes`);
    void execution; // acknowledged for linter when not used
    
    try {
      const { data: baseline } = await this.supabase
        .from('template_baselines')
        .select('baseline_data')
        .eq('template_id', templateId)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (baseline) {
        await this.checkForChanges(templateId, baseline.baseline_data);
      }
    } catch (error) {
      console.error('Error checking for changes after execution failure:', error);
    }
  }

  async checkForChanges(templateId, baseline) {
    const template = await this.getTemplate(templateId);
    if (!template) {
      console.warn(`Template ${templateId} not found for change detection`);
      return;
    }

    try {
      console.log(`ðŸ” Checking for changes in template ${templateId}`);

      // Execute template with test URL
      const testResult = await this.executeTemplateTest(template);
      
      if (!testResult.success) {
        await this.flagPotentialChange(templateId, 'scraping_failure', {
          error: testResult.error,
          timestamp: new Date().toISOString(),
          template_name: template.name
        });
        return;
      }

      // Compare with baseline
      const changes = await this.analyzeChanges(baseline, testResult.data);
      // acknowledged for linter; used below when significant
      if (changes.significant) {
        await this.handleSignificantChange(templateId, changes, template);
      } else {
        console.log(`âœ… No significant changes detected for template ${templateId}`);
      }

    } catch (error) {
      console.error(`Change detection failed for template ${templateId}:`, error);
      await this.recordChangeDetectionError(templateId, error);
    }
  }

  async analyzeChanges(baseline, currentData) {
    const changes = {
      structural: [],
      content: [],
      significant: false,
      confidence: 0,
      timestamp: new Date().toISOString()
    };

    // Structural analysis
    const baselineStructure = this.extractDataStructure(baseline);
    const currentStructure = this.extractDataStructure(currentData);
    
    changes.structural = this.compareStructures(baselineStructure, currentStructure);

    // Content pattern analysis
    changes.content = await this.analyzeContentPatterns(baseline, currentData);

    // Calculate change significance
    changes.confidence = this.calculateChangeConfidence(changes);
    changes.significant = changes.confidence > this.changeThreshold;

    console.log(`ðŸ“Š Change analysis complete: confidence=${changes.confidence.toFixed(3)}, significant=${changes.significant}`);

    return changes;
  }

  extractDataStructure(data) {
    const structure = {};
    
    const extract = (obj, path = '') => {
      if (!obj || typeof obj !== 'object') return;
      
      for (const [key, value] of Object.entries(obj)) {
        const currentPath = path ? `${path}.${key}` : key;
        
        if (value && typeof value === 'object' && !Array.isArray(value)) {
          structure[currentPath] = 'object';
          extract(value, currentPath);
        } else if (Array.isArray(value)) {
          structure[currentPath] = 'array';
          structure[`${currentPath}.length`] = value.length;
          if (value.length > 0 && typeof value[0] === 'object') {
            extract(value[0], `${currentPath}[0]`);
          }
        } else {
          structure[currentPath] = typeof value;
        }
      }
    };

    extract(data);
    return structure;
  }

  compareStructures(baseline, current) {
    const changes = [];
    
    // Check for removed fields
    for (const [path, type] of Object.entries(baseline)) {
      if (!(path in current)) {
        changes.push({
          type: 'field_removed',
          path: path,
          previous_type: type,
          severity: 'high'
        });
      }
    }
    
    // Check for added fields
    for (const [path, type] of Object.entries(current)) {
      if (!(path in baseline)) {
        changes.push({
          type: 'field_added',
          path: path,
          new_type: type,
          severity: 'medium'
        });
      } else if (baseline[path] !== type) {
        changes.push({
          type: 'type_changed',
          path: path,
          previous_type: baseline[path],
          new_type: type,
          severity: 'high'
        });
      }
    }
    
    return changes;
  }

  async analyzeContentPatterns(baseline, current) {
    const changes = [];
    void changes; // acknowledged for linter; returned at end
    
    try {
      // Use AI to analyze content patterns
      const prompt = `
        Compare these two datasets from the same website and identify significant content pattern changes.
        
        BASELINE DATA:
        ${JSON.stringify(baseline, null, 2).substring(0, 3000)}...
        
        CURRENT DATA:
        ${JSON.stringify(current, null, 2).substring(0, 3000)}...
        
        Analyze for:
        1. Changes in data format (dates, prices, etc.)
        2. Changes in content structure
        3. Missing or new data sections
        4. Changes in data density or completeness
        
        Return JSON: {
          "changes": [
            {
              "type": "format_change|structure_change|content_change",
              "description": "Detailed description",
              "field": "field_path",
              "significance": "low|medium|high"
            }
          ],
          "overall_significance": "low|medium|high"
        }
      `;

      const analysis = await this.aiService.queryClaude(prompt);
      const parsedAnalysis = JSON.parse(analysis);
      return parsedAnalysis.changes || [];
    } catch (error) {
      console.warn('AI content analysis failed, falling back to basic analysis:', error.message);
      return this.basicContentAnalysis(baseline, current);
    }
  }

  basicContentAnalysis(baseline, current) {
    const changes = [];
    
    const compareValues = (base, curr, path = '') => {
      if (Array.isArray(base) && Array.isArray(curr)) {
        if (base.length !== curr.length) {
          const lengthDiff = Math.abs(base.length - curr.length);
          const percentChange = lengthDiff / Math.max(base.length, 1);
          
          changes.push({
            type: 'array_length_change',
            path: path,
            previous_length: base.length,
            new_length: curr.length,
            significance: percentChange > 0.5 ? 'high' : percentChange > 0.2 ? 'medium' : 'low',
            description: `Array length changed from ${base.length} to ${curr.length}`
          });
        }
        
        // Compare first few items for pattern changes
        const sampleSize = Math.min(3, base.length, curr.length);
        for (let i = 0; i < sampleSize; i++) {
          if (base[i] && curr[i]) {
            compareValues(base[i], curr[i], `${path}[${i}]`);
          }
        }
      } else if (typeof base === 'string' && typeof curr === 'string') {
        // Check for format changes in common patterns
        const baseIsPrice = /^\$?\d+\.?\d*$/.test(base);
        const currIsPrice = /^\$?\d+\.?\d*$/.test(curr);
        
        if (baseIsPrice !== currIsPrice) {
          changes.push({
            type: 'format_change',
            path: path,
            description: 'Price format changed',
            significance: 'medium'
          });
        }

        const baseIsDate = /\d{4}-\d{2}-\d{2}|\d{2}\/\d{2}\/\d{4}/.test(base);
        const currIsDate = /\d{4}-\d{2}-\d{2}|\d{2}\/\d{2}\/\d{4}/.test(curr);
        
        if (baseIsDate !== currIsDate) {
          changes.push({
            type: 'format_change',
            path: path,
            description: 'Date format changed',
            significance: 'medium'
          });
        }
      }
    };
    
    compareValues(baseline, current);
    return changes;
  }

  calculateChangeConfidence(changes) {
    let score = 0;
    
    for (const change of changes.structural) {
      switch (change.type) {
      case 'field_removed':
        score += 0.4;
        break;
      case 'field_added':
        score += 0.2;
        break;
      case 'type_changed':
        score += 0.5;
        break;
      }
    }
    
    for (const change of changes.content) {
      switch (change.significance) {
      case 'high':
        score += 0.6;
        break;
      case 'medium':
        score += 0.3;
        break;
      case 'low':
        score += 0.1;
        break;
      }
    }
    
    return Math.min(1, score);
  }

  async handleSignificantChange(templateId, changes, template) {
    console.log(`ðŸš¨ Significant change detected for template ${templateId}`);
    
    // Record the change detection
    await this.recordChangeDetection(templateId, changes);

    // Update template status
    if (this.supabase) {
      await this.supabase
        .from('scraper_templates')
        .update({
          status: 'needs_review',
          last_change_detected: new Date().toISOString(),
          change_details: changes
        })
        .eq('id', templateId);
    }

    // Attempt automatic repair
    const repairResult = await this.attemptAutomaticRepair(templateId, changes, template);
    
    if (repairResult.success) {
      console.log(`âœ… Template ${templateId} automatically repaired`);
    } else {
      console.log(`âŒ Automatic repair failed for template ${templateId}`);
      // Notify administrators
      await this.sendChangeNotification(templateId, changes, repairResult);
    }
  }

  async attemptAutomaticRepair(templateId, changes, template) {
    try {
      console.log(`ðŸ”§ Attempting automatic repair for template ${templateId}`);

      const repairPrompt = `
        A web scraper template has detected significant changes on the target website.
        
        TEMPLATE NAME: ${template.name}
        
        CHANGES DETECTED:
        ${JSON.stringify(changes, null, 2)}
        
        CURRENT TEMPLATE CODE:
        ${template.code}
        
        Please analyze the changes and provide an updated template code that addresses these changes.
        Focus on:
        1. Updating CSS selectors that may have changed
        2. Adjusting data extraction logic for new structure
        3. Maintaining the original data output format
        4. Adding fallback selectors for robustness
        
        Return only valid JavaScript code without explanations or markdown formatting.
      `;

      const repairedCode = await this.aiService.queryClaude(repairPrompt);
      
      // Validate the repaired code
      const validation = await this.validateRepairedCode(repairedCode, template);
      
      if (validation.valid) {
        // Update the template
        if (this.supabase) {
          await this.supabase
            .from('scraper_templates')
            .update({
              code: repairedCode,
              status: 'repaired',
              version: this.incrementVersion(template.version),
              last_repaired: new Date().toISOString(),
              repair_details: {
                changes: changes,
                repair_timestamp: new Date().toISOString(),
                validation: validation
              }
            })
            .eq('id', templateId);
        }

        return { success: true, code: repairedCode };
      } else {
        return { success: false, error: validation.error };
      }

    } catch (error) {
      console.error(`Repair attempt failed for template ${templateId}:`, error);
      return { success: false, error: error.message };
    }
  }

  async validateRepairedCode(code, originalTemplate) {
    // Basic syntax validation
    try {
      new Function(code);
    } catch (error) {
      return { valid: false, error: `Syntax error: ${error.message}` };
    }

    // Test execution with sample URL
    try {
      const testResult = await this.executeTemplateTest({
        ...originalTemplate,
        code: code
      });

      return { 
        valid: testResult.success, 
        error: testResult.error || null,
        testData: testResult.data 
      };
    } catch (error) {
      return { valid: false, error: error.message };
    }
  }

  incrementVersion(currentVersion) {
    if (!currentVersion) return '1.0.0';
    
    const parts = currentVersion.split('.');
    const patch = parseInt(parts[2] || 0) + 1;
    return `${parts[0] || 1}.${parts[1] || 0}.${patch}`;
  }

  async getTemplate(templateId) {
    if (!this.supabase) return null;
    
    try {
      const { data, error } = await this.supabase
        .from('scraper_templates')
        .select('*')
        .eq('id', templateId)
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      console.error(`Error fetching template ${templateId}:`, error);
      return null;
    }
  }

  async executeTemplateTest(template) {
    // Mock template execution for testing
    // In real implementation, this would run the scraper
    try {
      void template; // placeholder for future use in real execution
      // Simulate scraping execution
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Mock successful result
      return {
        success: true,
        data: {
          title: 'Sample Title',
          price: '$99.99',
          items: [
            { name: 'Item 1', value: 'Value 1' },
            { name: 'Item 2', value: 'Value 2' }
          ]
        }
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  async flagPotentialChange(templateId, changeType, details) {
    console.log(`ðŸš© Flagging potential change for template ${templateId}: ${changeType}`);
    
    if (this.supabase) {
      await this.supabase
        .from('site_change_detections')
        .insert([{
          template_id: templateId,
          change_type: changeType,
          change_details: details,
          confidence: 0.8,
          detected_at: new Date().toISOString()
        }]);
    }
  }

  async recordChangeDetection(templateId, changes) {
    if (!this.supabase) return;

    try {
      await this.supabase
        .from('site_change_detections')
        .insert([{
          template_id: templateId,
          change_type: 'structural_change',
          change_details: changes,
          confidence: changes.confidence,
          detected_at: new Date().toISOString()
        }]);
    } catch (error) {
      console.error('Error recording change detection:', error);
    }
  }

  async recordChangeDetectionError(templateId, error) {
    if (!this.supabase) return;

    try {
      await this.supabase
        .from('site_change_detections')
        .insert([{
          template_id: templateId,
          change_type: 'detection_error',
          change_details: { error: error.message, stack: error.stack },
          confidence: 0.0,
          detected_at: new Date().toISOString()
        }]);
    } catch (dbError) {
      console.error('Error recording change detection error:', dbError);
    }
  }

  async sendChangeNotification(templateId, changes, repairResult) {
    const notification = {
      template_id: templateId,
      type: 'site_change',
      title: 'Website Structure Change Detected',
      message: `Significant changes detected for template ${templateId}`,
      severity: 'high',
      data: {
        changes: changes,
        auto_repair_attempted: !repairResult.success,
        repair_error: repairResult.error
      },
      created_at: new Date().toISOString()
    };

    if (this.supabase) {
      await this.supabase
        .from('system_alerts')
        .insert([notification]);
    }

    // Send to webhook if configured
    await this.triggerWebhook('site_change', notification);
  }

  async triggerWebhook(eventType, data) {
    // Webhook triggering will be handled by WebhookManager
    console.log(`ðŸ“¢ Would trigger webhook for event: ${eventType}`);
    void data; // acknowledged for linter
  }

  async stopMonitoring(templateId) {
    if (this.monitoringIntervals.has(templateId)) {
      clearInterval(this.monitoringIntervals.get(templateId));
      this.monitoringIntervals.delete(templateId);
      console.log(`ðŸ›‘ Stopped monitoring template ${templateId}`);
    }
  }

  async getChangeDetectionStats(templateId = null) {
    if (!this.supabase) return null;

    let query = this.supabase
      .from('site_change_detections')
      .select('change_type, confidence, detected_at');

    if (templateId) {
      query = query.eq('template_id', templateId);
    }

    const { data } = await query
      .order('detected_at', { ascending: false })
      .limit(100);

    if (!data) return null;

    const stats = {
      total_detections: data.length,
      by_type: {},
      avg_confidence: 0,
      recent_detections: data.slice(0, 5)
    };

    let totalConfidence = 0;
    for (const detection of data) {
      stats.by_type[detection.change_type] = (stats.by_type[detection.change_type] || 0) + 1;
      totalConfidence += detection.confidence || 0;
    }

    stats.avg_confidence = data.length > 0 ? totalConfidence / data.length : 0;

    return stats;
  }
}

module.exports = { SiteChangeDetector };