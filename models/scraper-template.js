const { createClient } = require('@supabase/supabase-js');

class ScraperTemplate {
  constructor(supabase) {
    this.supabase = supabase || createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_KEY
    );
  }

  async createTemplate(projectId, templateData) {
    try {
      console.log(`ðŸ“ Creating scraper template: ${templateData.name}`);

      const { data, error } = await this.supabase
        .from('scraper_templates')
        .insert([{
          project_id: projectId,
          name: templateData.name,
          description: templateData.description,
          code: templateData.code,
          config: templateData.config || {},
          version: '1.0.0',
          status: 'active'
        }])
        .select()
        .single();

      if (error) throw error;

      // Initialize metrics for new template
      await this.initializeMetrics(data.id);

      console.log(`âœ… Template created successfully: ${data.id}`);
      return data;
    } catch (error) {
      console.error('Error creating template:', error);
      throw error;
    }
  }

  async updateTemplate(templateId, updates) {
    try {
      console.log(`ðŸ”„ Updating template: ${templateId}`);

      // Get current template data
      const { data: current, error: fetchError } = await this.supabase
        .from('scraper_templates')
        .select('*')
        .eq('id', templateId)
        .single();

      if (fetchError) throw fetchError;

      // Archive current version if code is being updated
      if (updates.code && updates.code !== current.code) {
        const _reason = updates.changeReason || 'Template update';
        await this.archiveVersion(templateId, current, _reason);
      }

      // Increment version if code changed
      const newVersion = updates.code ? this.incrementVersion(current.version) : current.version;

      const updateData = {
        ...updates,
        version: newVersion,
        updated_at: new Date().toISOString()
      };

      const { data, error } = await this.supabase
        .from('scraper_templates')
        .update(updateData)
        .eq('id', templateId)
        .select()
        .single();

      if (error) throw error;

      console.log(`âœ… Template updated successfully: ${templateId} (v${newVersion})`);
      return data;
    } catch (error) {
      console.error('Error updating template:', error);
      throw error;
    }
  }

  async archiveVersion(templateId, currentTemplate, changeReason) {
    try {
      const { error } = await this.supabase
        .from('scraper_template_versions')
        .insert([{
          template_id: templateId,
          code: currentTemplate.code,
          config: currentTemplate.config,
          version: currentTemplate.version,
          change_reason: changeReason
        }]);

      if (error) throw error;
      console.log(`ðŸ“š Archived version ${currentTemplate.version} for template ${templateId}`);
    } catch (error) {
      console.error('Error archiving version:', error);
      throw error;
    }
  }

  incrementVersion(version) {
    const parts = version.split('.');
    const patch = parseInt(parts[2]) + 1;
    return `${parts[0]}.${parts[1]}.${patch}`;
  }

  async incrementMinorVersion(templateId, _reason) {
    try {
      void _reason;
      const { data: current } = await this.supabase
        .from('scraper_templates')
        .select('version')
        .eq('id', templateId)
        .single();

      const parts = current.version.split('.');
      const minor = parseInt(parts[1]) + 1;
      const newVersion = `${parts[0]}.${minor}.0`;

      await this.supabase
        .from('scraper_templates')
        .update({ version: newVersion })
        .eq('id', templateId);

      return newVersion;
    } catch (error) {
      console.error('Error incrementing minor version:', error);
      throw error;
    }
  }

  async detectChanges(templateId, currentResults) {
    try {
      console.log(`ðŸ” Analyzing changes for template: ${templateId}`);

      // Get previous successful results for comparison
      const { data: previousExecutions } = await this.supabase
        .from('scraping_executions')
        .select('processed_result, raw_result, created_at')
        .eq('template_id', templateId)
        .eq('status', 'completed')
        .not('processed_result', 'is', null)
        .order('created_at', { ascending: false })
        .limit(10);

      if (!previousExecutions || previousExecutions.length === 0) {
        console.log('No previous results to compare against');
        return { noComparisonData: true };
      }

      const changes = this.analyzeDataChanges(previousExecutions, currentResults);
      
      if (changes.significantChange) {
        await this.flagTemplateForReview(templateId, changes);
        console.log(`ðŸš¨ Significant changes detected for template ${templateId}`);
      }

      return changes;
    } catch (error) {
      console.error('Error detecting changes:', error);
      throw error;
    }
  }

  analyzeDataChanges(previousExecutions, currentResults) {
    const changes = {
      structuralChanges: [],
      contentChanges: [],
      selectorFailures: [],
      significantChange: false,
      confidence: 0
    };

    try {
      // Analyze structural changes
      const previousKeys = this.extractDataKeys(previousExecutions);
      const currentKeys = this.extractDataKeys([{ processed_result: currentResults }]);

      const addedKeys = currentKeys.filter(k => !previousKeys.includes(k));
      const removedKeys = previousKeys.filter(k => !currentKeys.includes(k));

      if (addedKeys.length > 0) {
        changes.structuralChanges.push({
          type: 'added_fields',
          fields: addedKeys,
          impact: 'medium'
        });
      }

      if (removedKeys.length > 0) {
        changes.structuralChanges.push({
          type: 'removed_fields',
          fields: removedKeys,
          impact: 'high'
        });
      }

      // Analyze content patterns
      const contentAnalysis = this.analyzeContentPatterns(previousExecutions, currentResults);
      changes.contentChanges = contentAnalysis;

      // Check for selector failures (empty/null values where there were values before)
      const selectorAnalysis = this.analyzeSelectorReliability(previousExecutions, currentResults);
      changes.selectorFailures = selectorAnalysis;

      // Determine significance
      const structuralWeight = changes.structuralChanges.length * 0.4;
      const contentWeight = changes.contentChanges.length * 0.3;
      const selectorWeight = changes.selectorFailures.length * 0.6;

      changes.confidence = Math.min((structuralWeight + contentWeight + selectorWeight) / 3, 1.0);
      changes.significantChange = changes.confidence > 0.3 || removedKeys.length > 0;

      return changes;
    } catch (error) {
      console.error('Error analyzing data changes:', error);
      return { error: error.message, significantChange: false };
    }
  }

  extractDataKeys(executions) {
    const allKeys = new Set();
    
    executions.forEach(execution => {
      const result = execution.processed_result || execution.raw_result;
      if (result && typeof result === 'object') {
        this.extractKeysRecursive(result, '', allKeys);
      }
    });

    return Array.from(allKeys);
  }

  extractKeysRecursive(obj, prefix, keySet) {
    Object.keys(obj).forEach(key => {
      const fullKey = prefix ? `${prefix}.${key}` : key;
      keySet.add(fullKey);
      
      if (obj[key] && typeof obj[key] === 'object' && !Array.isArray(obj[key])) {
        this.extractKeysRecursive(obj[key], fullKey, keySet);
      }
    });
  }

  analyzeContentPatterns(previousExecutions, currentResults) {
    const patterns = [];
    
    try {
      // Sample analysis - compare data types, lengths, formats
      const previousSample = previousExecutions[0]?.processed_result || {};
      const currentSample = currentResults || {};

      Object.keys(currentSample).forEach(key => {
        if (previousSample[key] !== undefined) {
          const prevType = typeof previousSample[key];
          const currType = typeof currentSample[key];
          
          if (prevType !== currType) {
            patterns.push({
              type: 'type_change',
              field: key,
              previous: prevType,
              current: currType,
              impact: 'medium'
            });
          }

          // Check for format changes in strings
          if (prevType === 'string' && currType === 'string') {
            const formatChange = this.detectFormatChange(previousSample[key], currentSample[key]);
            if (formatChange) {
              patterns.push({
                type: 'format_change',
                field: key,
                change: formatChange,
                impact: 'low'
              });
            }
          }
        }
      });

      return patterns;
    } catch (error) {
      console.error('Error analyzing content patterns:', error);
      return [];
    }
  }

  detectFormatChange(prevValue, currValue) {
    if (!prevValue || !currValue) return null;

    // Detect common format changes
    /* eslint-disable no-useless-escape */
    const prevIsPrice = /[$€£¥]\s*[\d,.]+|[\d,.]+\s*[$€£¥]/i.test(prevValue);
    const currIsPrice = /[$€£¥]\s*[\d,.]+|[\d,.]+\s*[$€£¥]/i.test(currValue);

    const prevIsDate = /\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4}|\d{4}[-\/]\d{1,2}[-\/]\d{1,2}/.test(prevValue);
    const currIsDate = /\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4}|\d{4}[-\/]\d{1,2}[-\/]\d{1,2}/.test(currValue);
    /* eslint-enable no-useless-escape */

    if (prevIsPrice !== currIsPrice) return 'price_format_change';
    if (prevIsDate !== currIsDate) return 'date_format_change';

    return null;
  }

  analyzeSelectorReliability(previousExecutions, currentResults) {
    const failures = [];
    
    try {
      const previousSample = previousExecutions[0]?.processed_result || {};
      const currentSample = currentResults || {};

      Object.keys(previousSample).forEach(key => {
        const prevValue = previousSample[key];
        const currValue = currentSample[key];

        // Check if previously successful field is now empty/null
        if (prevValue && (currValue === null || currValue === undefined || currValue === '')) {
          failures.push({
            type: 'selector_failure',
            field: key,
            previousValue: this.sanitizeValue(prevValue),
            impact: 'high',
            suggestion: 'Update selector or add fallback strategy'
          });
        }
      });

      return failures;
    } catch (error) {
      console.error('Error analyzing selector reliability:', error);
      return [];
    }
  }

  sanitizeValue(value) {
    if (typeof value === 'string' && value.length > 100) {
      return value.substring(0, 100) + '...';
    }
    return value;
  }

  async flagTemplateForReview(templateId, changes) {
    try {
      await this.supabase
        .from('scraper_templates')
        .update({
          status: 'needs_review',
          last_change_detected: new Date().toISOString(),
          change_details: changes
        })
        .eq('id', templateId);

      // Log change history
      await this.supabase
        .from('template_change_history')
        .insert([{
          template_id: templateId,
          change_type: changes.significantChange ? 'significant_change' : 'minor_change',
          change_description: this.generateChangeDescription(changes),
          confidence_score: changes.confidence,
          sample_data: changes,
          suggested_fix: this.generateSuggestedFix(changes)
        }]);

      console.log(`ðŸ”” Template ${templateId} flagged for review due to significant changes`);
    } catch (error) {
      console.error('Error flagging template for review:', error);
      throw error;
    }
  }

  generateChangeDescription(changes) {
    const descriptions = [];
    
    if (changes.structuralChanges.length > 0) {
      descriptions.push(`Structural changes: ${changes.structuralChanges.length} detected`);
    }
    
    if (changes.selectorFailures.length > 0) {
      descriptions.push(`Selector failures: ${changes.selectorFailures.length} fields affected`);
    }
    
    if (changes.contentChanges.length > 0) {
      descriptions.push(`Content pattern changes: ${changes.contentChanges.length} detected`);
    }

    return descriptions.join('; ') || 'Unknown changes detected';
  }

  generateSuggestedFix(changes) {
    const suggestions = [];
    
    if (changes.selectorFailures.length > 0) {
      suggestions.push('Review and update CSS selectors for failed fields');
    }
    
    if (changes.structuralChanges.some(c => c.type === 'removed_fields')) {
      suggestions.push('Check if removed fields moved to different locations');
    }
    
    if (changes.contentChanges.some(c => c.type === 'format_change')) {
      suggestions.push('Update data normalization rules for format changes');
    }

    return suggestions.join('; ') || 'Manual review recommended';
  }

  async initializeMetrics(templateId) {
    try {
      const { error } = await this.supabase
        .from('template_metrics')
        .insert([{
          template_id: templateId,
          total_runs: 0,
          successful_runs: 0,
          failed_runs: 0,
          success_rate: 0,
          average_duration: 0
        }]);

      if (error) throw error;
    } catch (error) {
      console.error('Error initializing metrics:', error);
      // Don't throw here as it's not critical for template creation
    }
  }

  async getTemplate(templateId) {
    try {
      const { data, error } = await this.supabase
        .from('scraper_templates')
        .select(`
          *,
          template_metrics(*),
          scraper_template_versions(*)
        `)
        .eq('id', templateId)
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Error fetching template:', error);
      throw error;
    }
  }

  async listTemplates(projectId, options = {}) {
    try {
      let query = this.supabase
        .from('scraper_templates')
        .select(`
          *,
          template_metrics(success_rate, total_runs, last_run)
        `)
        .order('created_at', { ascending: false });

      if (projectId) {
        query = query.eq('project_id', projectId);
      }

      if (options.status) {
        query = query.eq('status', options.status);
      }

      if (options.limit) {
        query = query.limit(options.limit);
      }

      const { data, error } = await query;
      if (error) throw error;

      return data;
    } catch (error) {
      console.error('Error listing templates:', error);
      throw error;
    }
  }

  async deleteTemplate(templateId) {
    try {
      const { error } = await this.supabase
        .from('scraper_templates')
        .delete()
        .eq('id', templateId);

      if (error) throw error;
      console.log(`ðŸ—‘ï¸ Template ${templateId} deleted successfully`);
    } catch (error) {
      console.error('Error deleting template:', error);
      throw error;
    }
  }

  async cloneTemplate(templateId, newName, projectId) {
    try {
      const template = await this.getTemplate(templateId);
      
      const clonedTemplate = await this.createTemplate(projectId || template.project_id, {
        name: newName,
        description: `Cloned from ${template.name}`,
        code: template.code,
        config: template.config
      });

      console.log(`ðŸ“‹ Template cloned: ${templateId} -> ${clonedTemplate.id}`);
      return clonedTemplate;
    } catch (error) {
      console.error('Error cloning template:', error);
      throw error;
    }
  }
}

module.exports = { ScraperTemplate };