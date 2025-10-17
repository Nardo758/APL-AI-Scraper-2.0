const { createClient } = require('@supabase/supabase-js');

class DataProcessor {
  constructor() {
    try {
      const url = process.env.SUPABASE_URL;
      if (!url || url === 'your_supabase_url_here' || url.trim() === '') {
        this.supabase = require('../core/supabase').supabase;
      } else {
        try {
          this.supabase = createClient(url, process.env.SUPABASE_SERVICE_KEY);
        } catch (e) {
          console.warn('DataProcessor: Supabase init failed, using stub', e && e.message);
          this.supabase = require('../core/supabase').supabase;
        }
      }
    } catch (e) {
      console.warn('DataProcessor: unexpected supabase init error, using stub', e && e.message);
      this.supabase = require('../core/supabase').supabase;
    }
    this.validators = new Map();
    this.normalizers = new Map();
    this.transformers = new Map();
    this.geocodeCache = new Map();
    
    this.setupDefaultProcessors();
  }

  setupDefaultProcessors() {
    // Price normalization and validation
    this.normalizers.set('price', this.normalizePrice.bind(this));
    this.validators.set('price', this.validatePrice.bind(this));
    
    // Date normalization and validation
    this.normalizers.set('date', this.normalizeDate.bind(this));
    this.validators.set('date', this.validateDate.bind(this));
    
    // Phone number normalization and validation
    this.normalizers.set('phone', this.normalizePhone.bind(this));
    this.validators.set('phone', this.validatePhone.bind(this));
    
    // Email validation and normalization
    this.validators.set('email', this.validateEmail.bind(this));
    this.normalizers.set('email', this.normalizeEmail.bind(this));
    
    // URL validation and normalization
    this.validators.set('url', this.validateUrl.bind(this));
    this.normalizers.set('url', this.normalizeUrl.bind(this));

    // Text processing
    this.normalizers.set('text', this.normalizeText.bind(this));
    this.validators.set('text', this.validateText.bind(this));

    // Number processing
    this.normalizers.set('number', this.normalizeNumber.bind(this));
    this.validators.set('number', this.validateNumber.bind(this));

    // Address processing
    this.normalizers.set('address', this.normalizeAddress.bind(this));
    this.transformers.set('geocode', this.geocodeAddress.bind(this));

    console.log('ðŸ“Š Data processors initialized successfully');
  }

  async processScrapedData(rawData, schema, options = {}) {
    const startTime = Date.now();
    
    try {
      console.log('ðŸ”„ Processing scraped data with schema validation...');

      const processed = {};
      const errors = [];
      const warnings = [];
      const transformations = [];

      // Process each field according to schema
      for (const [field, value] of Object.entries(rawData)) {
        try {
          const fieldConfig = schema.fields?.[field] || {};
          void fieldConfig; // acknowledged for linter; used dynamically in processing
          
          // Skip processing if field not in schema and strictMode is enabled
          if (options.strictMode && !fieldConfig.type) {
            warnings.push({
              field: field,
              warning: 'Field not defined in schema (skipped in strict mode)'
            });
            continue;
          }

          // Clean the value first
          let cleanedValue = this.cleanValue(value, fieldConfig);
          
          // Apply transformations
          if (fieldConfig.transforms) {
            for (const transform of fieldConfig.transforms) {
              cleanedValue = await this.applyTransform(cleanedValue, transform, fieldConfig);
              transformations.push({
                field: field,
                transform: transform.type,
                original: value,
                result: cleanedValue
              });
            }
          }

          // Validate if validator exists
          if (fieldConfig.type && this.validators.has(fieldConfig.type)) {
            const validator = this.validators.get(fieldConfig.type);
            const isValid = validator(cleanedValue, fieldConfig);
            
            if (!isValid) {
              throw new Error(`Validation failed for field '${field}' of type '${fieldConfig.type}'`);
            }
          }

          // Normalize if normalizer exists
          if (fieldConfig.type && this.normalizers.has(fieldConfig.type)) {
            const normalizer = this.normalizers.get(fieldConfig.type);
            cleanedValue = await normalizer(cleanedValue, fieldConfig);
          }

          processed[field] = cleanedValue;

        } catch (error) {
          errors.push({
            field: field,
            value: this.sanitizeValue(value),
            error: error.message,
            type: 'processing_error'
          });
          
          // Apply fallback if specified
          if (schema.fields?.[field]?.fallback !== undefined) {
            processed[field] = schema.fields[field].fallback;
            warnings.push({
              field: field,
              warning: `Using fallback value due to error: ${error.message}`
            });
          }
        }
      }

      // Check for required fields
      if (schema.required) {
        for (const requiredField of schema.required) {
          if (!(requiredField in processed) || processed[requiredField] === null || processed[requiredField] === undefined) {
            errors.push({
              field: requiredField,
              error: 'Required field is missing or null',
              type: 'required_field_error'
            });
          }
        }
      }

      // Remove duplicates if needed
      if (schema.deduplicate && options.deduplicate !== false) {
        const duplicateCheck = await this.checkForDuplicates(processed, schema.deduplicate);
        if (duplicateCheck.isDuplicate) {
          errors.push({
            field: schema.deduplicate.key,
            error: `Duplicate record found: ${duplicateCheck.duplicateValue}`,
            type: 'duplicate_error',
            existingId: duplicateCheck.existingId
          });
        }
      }

      // Calculate quality scores
      const qualityMetrics = this.calculateQualityMetrics(processed, rawData, schema, errors, warnings);

      const processingTime = Date.now() - startTime;

      const result = {
        data: processed,
        originalData: rawData,
        errors: errors,
        warnings: warnings,
        transformations: transformations,
        qualityMetrics: qualityMetrics,
        valid: errors.filter(e => e.type !== 'duplicate_error').length === 0,
        processingTime: processingTime,
        processedAt: new Date().toISOString()
      };

      console.log(`âœ… Data processing completed in ${processingTime}ms (Quality: ${(qualityMetrics.overall * 100).toFixed(1)}%)`);
      return result;

    } catch (error) {
      console.error('âŒ Data processing failed:', error);
      throw error;
    }
  }

  cleanValue(value, config = {}) {
    if (value === null || value === undefined) {
      return config.default !== undefined ? config.default : null;
    }

    // Convert to string for processing
    let cleaned = String(value).trim();

    // Remove extra whitespace
    if (config.collapseWhitespace !== false) {
      cleaned = cleaned.replace(/\s+/g, ' ');
    }

    // Strip HTML if requested
    if (config.stripHtml) {
      cleaned = cleaned.replace(/<[^>]*>/g, '');
      cleaned = cleaned.replace(/&[a-zA-Z0-9#]+;/g, ' '); // Remove HTML entities
    }

    // Remove special characters if requested
    if (config.removeSpecialChars) {
      cleaned = cleaned.replace(/[^\w\s]/g, '');
    }

    // Apply length limits
    if (config.maxLength && cleaned.length > config.maxLength) {
      cleaned = cleaned.substring(0, config.maxLength);
      if (config.truncateEllipsis) {
        cleaned = cleaned.substring(0, config.maxLength - 3) + '...';
      }
    }

    // Convert case
    if (config.case === 'lower') {
      cleaned = cleaned.toLowerCase();
    } else if (config.case === 'upper') {
      cleaned = cleaned.toUpperCase();
    } else if (config.case === 'title') {
      cleaned = cleaned.replace(/\w\S*/g, (txt) => 
        txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase()
      );
    }

    return cleaned;
  }

  // Price processing
  normalizePrice(price, config = {}) {
    if (!price || price === '') return null;

    // Extract numeric value from price strings
    const priceString = String(price).replace(/,/g, '.');
    const match = priceString.match(/([0-9]+[.]?[0-9]*)/);
    
    if (!match) return null;

    let value = parseFloat(match[1]);
    
    // Handle currency conversion if needed
    if (config.fromCurrency && config.toCurrency && config.exchangeRates) {
      const rate = config.exchangeRates[`${config.fromCurrency}_${config.toCurrency}`];
      if (rate) {
        value = value * rate;
      }
    }

    // Apply formatting
    if (config.format === 'integer') {
      value = Math.round(value);
    } else if (config.decimalPlaces !== undefined) {
      value = parseFloat(value.toFixed(config.decimalPlaces));
    }

    return value;
  }

  validatePrice(price, config = {}) {
    if (price === null && !config.required) return true;
    if (typeof price !== 'number' || isNaN(price)) return false;
    
    if (config.min !== undefined && price < config.min) return false;
    if (config.max !== undefined && price > config.max) return false;
    
    return price >= 0; // Prices should generally be positive
  }

  // Date processing
  normalizeDate(dateString, config = {}) {
    if (!dateString || dateString === '') return null;

    const formats = config.inputFormats || [
      'YYYY-MM-DD',
      'MM/DD/YYYY',
      'DD/MM/YYYY',
      'MMMM D, YYYY',
      'D MMMM YYYY',
      'YYYY-MM-DD HH:mm:ss',
      'MM/DD/YYYY HH:mm:ss'
    ];

    // Try to parse with various formats
    for (const format of formats) {
      const parsed = this.parseDate(dateString, format);
      if (parsed) {
        if (config.outputFormat) {
          return this.formatDate(parsed, config.outputFormat);
        }
        return parsed.toISOString();
      }
    }

    // Try native Date parsing as last resort
    const nativeDate = new Date(dateString);
    if (!isNaN(nativeDate.getTime())) {
      return nativeDate.toISOString();
    }

    throw new Error(`Unable to parse date: ${dateString}`);
  }

  parseDate(dateString, format) {
    void format; // acknowledged for linter; formats handled internally
    // Simple date parsing - could be enhanced with a proper date library
    try {
      const date = new Date(dateString);
      return isNaN(date.getTime()) ? null : date;
    } catch {
      return null;
    }
  }

  formatDate(date, format) {
    // Simple date formatting - could be enhanced with a proper date library
    if (format === 'ISO') return date.toISOString();
    if (format === 'YYYY-MM-DD') return date.toISOString().split('T')[0];
    return date.toISOString();
  }

  validateDate(date, config = {}) {
    if (date === null && !config.required) return true;
    
    const dateObj = typeof date === 'string' ? new Date(date) : date;
    if (!(dateObj instanceof Date) || isNaN(dateObj.getTime())) return false;

    if (config.minDate) {
      const minDate = new Date(config.minDate);
      if (dateObj < minDate) return false;
    }

    if (config.maxDate) {
      const maxDate = new Date(config.maxDate);
      if (dateObj > maxDate) return false;
    }

    return true;
  }

  // Phone number processing
  normalizePhone(phone, config = {}) {
    if (!phone || phone === '') return null;

    // Remove all non-digit characters
    const digits = String(phone).replace(/\D/g, '');

    if (digits.length === 0) return null;

    // Apply country-specific formatting
    if (config.countryCode) {
      return this.formatPhoneNumber(digits, config.countryCode);
    }

    // Default international format
    if (digits.length >= 10) {
      return `+${digits}`;
    }

    return digits;
  }

  formatPhoneNumber(digits, countryCode) {
    // Simple phone formatting - could be enhanced with proper phone library
    switch (countryCode.toUpperCase()) {
    case 'US':
    case 'CA':
      if (digits.length === 10) {
        return `+1${digits}`;
      } else if (digits.length === 11 && digits[0] === '1') {
        return `+${digits}`;
      }
      break;
    case 'UK':
      return `+44${digits}`;
    default:
      return `+${digits}`;
    }
    return digits;
  }

  validatePhone(phone, config = {}) {
    if (phone === null && !config.required) return true;
    if (typeof phone !== 'string') return false;

    const digits = phone.replace(/\D/g, '');
    return digits.length >= 7; // Minimum reasonable phone number length
  }

  // Email processing
  normalizeEmail(email, config = {}) {
    if (!email || email === '') return null;
    
    const normalized = String(email).toLowerCase().trim();
    
    // Remove dots from Gmail addresses (they're ignored)
    if (config.normalizeDots && normalized.includes('@gmail.')) {
      const [localPart, domain] = normalized.split('@');
      return localPart.replace(/\./g, '') + '@' + domain;
    }
    
    return normalized;
  }

  validateEmail(email, config = {}) {
    if (email === null && !config.required) return true;
    if (typeof email !== 'string') return false;
    
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  // URL processing
  normalizeUrl(url, config = {}) {
    if (!url || url === '') return null;
    
    let normalized = String(url).trim();
    
    // Add protocol if missing
    if (!normalized.match(/^https?:\/\//)) {
      normalized = 'https://' + normalized;
    }
    
    try {
      const urlObj = new URL(normalized);
      
      // Remove trailing slash if requested
      if (config.removeTrailingSlash && urlObj.pathname.endsWith('/')) {
        urlObj.pathname = urlObj.pathname.slice(0, -1);
      }
      
      // Remove query parameters if requested
      if (config.removeQuery) {
        urlObj.search = '';
      }
      
      // Remove hash fragment if requested
      if (config.removeHash) {
        urlObj.hash = '';
      }
      
      return urlObj.toString();
    } catch {
      return normalized; // Return as-is if URL parsing fails
    }
  }

  validateUrl(url, config = {}) {
    if (url === null && !config.required) return true;
    if (typeof url !== 'string') return false;
    
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  }

  // Text processing
  normalizeText(text, config = {}) {
    if (!text || text === '') return config.default || null;
    
    let normalized = this.cleanValue(text, config);
    
    // Remove excessive punctuation
    if (config.normalizePunctuation) {
      normalized = normalized.replace(/[.]{2,}/g, '...');
      normalized = normalized.replace(/[!]{2,}/g, '!');
      normalized = normalized.replace(/[?]{2,}/g, '?');
    }
    
    return normalized;
  }

  validateText(text, config = {}) {
    if (text === null && !config.required) return true;
    if (typeof text !== 'string') return false;
    
    if (config.minLength && text.length < config.minLength) return false;
    if (config.maxLength && text.length > config.maxLength) return false;
    if (config.pattern && !new RegExp(config.pattern).test(text)) return false;
    
    return true;
  }

  // Number processing
  normalizeNumber(number, config = {}) {
    if (number === null || number === undefined || number === '') return null;
    
    const num = parseFloat(String(number).replace(/[^\d.-]/g, ''));
    
    if (isNaN(num)) return null;
    
    if (config.round) {
      return Math.round(num);
    }
    
    if (config.decimalPlaces !== undefined) {
      return parseFloat(num.toFixed(config.decimalPlaces));
    }
    
    return num;
  }

  validateNumber(number, config = {}) {
    if (number === null && !config.required) return true;
    if (typeof number !== 'number' || isNaN(number)) return false;
    
    if (config.min !== undefined && number < config.min) return false;
    if (config.max !== undefined && number > config.max) return false;
    
    return true;
  }

  // Address processing
  normalizeAddress(address, config = {}) {
    void config; // acknowledged for linter; config currently unused but kept for API compatibility
    if (!address || address === '') return null;
    
    let normalized = this.cleanValue(address, { stripHtml: true, collapseWhitespace: true });
    
    // Basic address normalization
    normalized = normalized
      .replace(/\bSt\b/gi, 'Street')
      .replace(/\bAve\b/gi, 'Avenue')
      .replace(/\bRd\b/gi, 'Road')
      .replace(/\bBlvd\b/gi, 'Boulevard')
      .replace(/\bDr\b/gi, 'Drive');
    
    return normalized;
  }

  // Transform functions
  async applyTransform(value, transform, fieldConfig) {
    if (!transform || !transform.type) return value;
    void fieldConfig; // acknowledged for linter
    const transformFunction = this.transformers.get(transform.type);
    if (transformFunction) {
      return await transformFunction(value, transform.options || {});
    }
    
    // Built-in transforms
    switch (transform.type) {
    case 'uppercase':
      return typeof value === 'string' ? value.toUpperCase() : value;
    case 'lowercase':
      return typeof value === 'string' ? value.toLowerCase() : value;
    case 'trim':
      return typeof value === 'string' ? value.trim() : value;
    case 'multiply':
      return typeof value === 'number' ? value * (transform.factor || 1) : value;
    case 'prefix':
      return typeof value === 'string' ? (transform.prefix || '') + value : value;
    case 'suffix':
      return typeof value === 'string' ? value + (transform.suffix || '') : value;
    default:
      console.warn(`Unknown transform type: ${transform.type}`);
      return value;
    }
  }

  async geocodeAddress(address, options = {}) {
    if (!address || typeof address !== 'string') return null;
    
    // Check cache first
    const cacheKey = address.toLowerCase().trim();
    if (this.geocodeCache.has(cacheKey)) {
      return this.geocodeCache.get(cacheKey);
    }
    
    try {
      if (!process.env.GOOGLE_MAPS_API_KEY && !options.provider) {
        console.warn('No geocoding service configured');
        return null;
      }
      
      const provider = options.provider || 'google';
      let result = null;
      
      if (provider === 'google' && process.env.GOOGLE_MAPS_API_KEY) {
        result = await this.geocodeWithGoogle(address);
      }
      
      // Cache the result
      if (result) {
        this.geocodeCache.set(cacheKey, result);
      }
      
      return result;
      
    } catch (error) {
      console.error('Geocoding failed:', error);
      return null;
    }
  }

  async geocodeWithGoogle(address) {
    const response = await fetch(
      `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${process.env.GOOGLE_MAPS_API_KEY}`
    );
    
    const data = await response.json();
    
    if (data.results && data.results.length > 0) {
      const location = data.results[0].geometry.location;
      return {
        latitude: location.lat,
        longitude: location.lng,
        formatted_address: data.results[0].formatted_address,
        components: data.results[0].address_components
      };
    }
    
    return null;
  }

  async checkForDuplicates(data, deduplicateConfig) {
    try {
      const { key, table, scope } = deduplicateConfig;
      
      if (!key || !data[key]) {
        return { isDuplicate: false };
      }
      
      let query = this.supabase
        .from(table || 'scraped_data')
        .select('id')
        .eq(key, data[key]);
      
      // Add scope filters if specified
      if (scope) {
        Object.entries(scope).forEach(([field, value]) => {
          query = query.eq(field, value);
        });
      }
      
      const { data: existing, error } = await query.single();
      
      if (error && error.code !== 'PGRST116') { // PGRST116 = no rows found
        throw error;
      }
      
      return {
        isDuplicate: !!existing,
        duplicateValue: data[key],
        existingId: existing?.id
      };
      
    } catch (error) {
      console.error('Error checking for duplicates:', error);
      return { isDuplicate: false, error: error.message };
    }
  }

  calculateQualityMetrics(processedData, originalData, schema, errors, warnings) {
    const totalFields = Object.keys(originalData).length;
    const processedFields = Object.keys(processedData).length;
    const errorFields = new Set(errors.map(e => e.field)).size;
    const warningFields = new Set(warnings.map(w => w.field)).size;
    
    // Completeness: How many fields were successfully processed
    const completeness = totalFields > 0 ? processedFields / totalFields : 1;
    
    // Accuracy: How many fields processed without errors
    const accuracy = totalFields > 0 ? (totalFields - errorFields) / totalFields : 1;
    
    // Consistency: Based on data type consistency and format adherence
    const consistency = this.calculateConsistencyScore(processedData, schema);
    
    // Validation score: How many validations passed
    const validationScore = totalFields > 0 ? (totalFields - errorFields) / totalFields : 1;
    
    // Overall quality score (weighted average)
    const overall = (completeness * 0.3 + accuracy * 0.3 + consistency * 0.2 + validationScore * 0.2);
    
    return {
      completeness: Math.round(completeness * 100) / 100,
      accuracy: Math.round(accuracy * 100) / 100,
      consistency: Math.round(consistency * 100) / 100,
      validation: Math.round(validationScore * 100) / 100,
      overall: Math.round(overall * 100) / 100,
      fieldCounts: {
        total: totalFields,
        processed: processedFields,
        errors: errorFields,
        warnings: warningFields
      }
    };
  }

  calculateConsistencyScore(data, schema) {
    let consistentFields = 0;
    let totalFields = 0;
    
    Object.entries(data).forEach(([field, value]) => {
      totalFields++;
      const fieldConfig = schema.fields?.[field];
      
      if (!fieldConfig) {
        // No schema definition, assume consistent
        consistentFields++;
        return;
      }
      
      // Check type consistency
      const expectedType = fieldConfig.type;
      const actualType = this.getDataType(value);
      
      if (this.isTypeConsistent(actualType, expectedType)) {
        consistentFields++;
      }
    });
    
    return totalFields > 0 ? consistentFields / totalFields : 1;
  }

  getDataType(value) {
    if (value === null || value === undefined) return 'null';
    if (typeof value === 'number') return 'number';
    if (typeof value === 'boolean') return 'boolean';
    if (typeof value === 'string') {
      if (this.validateEmail(value)) return 'email';
      if (this.validateUrl(value)) return 'url';
      if (!isNaN(Date.parse(value))) return 'date';
      if (!isNaN(parseFloat(value))) return 'number';
      return 'text';
    }
    return 'unknown';
  }

  isTypeConsistent(actualType, expectedType) {
    const typeMapping = {
      'price': ['number'],
      'number': ['number'],
      'text': ['text', 'string'],
      'string': ['text', 'string'],
      'email': ['email', 'text'],
      'url': ['url', 'text'],
      'date': ['date', 'text'],
      'phone': ['text', 'string']
    };
    
    const allowedTypes = typeMapping[expectedType] || [expectedType];
    return allowedTypes.includes(actualType);
  }

  sanitizeValue(value) {
    if (typeof value === 'string' && value.length > 200) {
      return value.substring(0, 200) + '...';
    }
    return value;
  }

  // Utility method to register custom processors
  registerValidator(type, validatorFunction) {
    this.validators.set(type, validatorFunction);
  }

  registerNormalizer(type, normalizerFunction) {
    this.normalizers.set(type, normalizerFunction);
  }

  registerTransformer(type, transformerFunction) {
    this.transformers.set(type, transformerFunction);
  }

  clearCache() {
    this.geocodeCache.clear();
    console.log('ðŸ§¹ Data processor cache cleared');
  }
}

module.exports = { DataProcessor };