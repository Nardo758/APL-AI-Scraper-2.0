const { AIService } = require('./ai-service');
const { createClient } = require('@supabase/supabase-js');

class CaptchaHandler {
  constructor() {
    this.aiService = new AIService();
    try {
      const url = process.env.SUPABASE_URL;
      if (!url || url === 'your_supabase_url_here' || url.trim() === '') {
        this.supabase = require('../core/supabase').supabase;
      } else {
        try {
          this.supabase = createClient(url, process.env.SUPABASE_SERVICE_KEY);
        } catch (e) {
          console.warn('CaptchaHandler: Supabase init failed, using stub', e && e.message);
          this.supabase = require('../core/supabase').supabase;
        }
      }
    } catch (e) {
      console.warn('CaptchaHandler: unexpected supabase init error, using stub', e && e.message);
      this.supabase = require('../core/supabase').supabase;
    }
    this.captchaServices = new Map();
    this.setupCaptchaServices();
  }

  setupCaptchaServices() {
    // Integration with captcha solving services
    if (process.env.TWO_CAPTCHA_API_KEY) {
      this.captchaServices.set('2captcha', {
        name: '2captcha',
        apiKey: process.env.TWO_CAPTCHA_API_KEY,
        solve: this.solveWith2Captcha.bind(this),
        baseUrl: 'http://2captcha.com',
        supportedTypes: ['recaptcha', 'hcaptcha', 'image', 'text']
      });
    }
    
    if (process.env.ANTI_CAPTCHA_API_KEY) {
      this.captchaServices.set('anticaptcha', {
        name: 'anticaptcha',
        apiKey: process.env.ANTI_CAPTCHA_API_KEY,
        solve: this.solveWithAntiCaptcha.bind(this),
        baseUrl: 'https://api.anti-captcha.com',
        supportedTypes: ['recaptcha', 'hcaptcha', 'image']
      });
    }

    console.log(`ðŸ” Initialized ${this.captchaServices.size} CAPTCHA solving services`);
  }

  async detectCaptcha(page, _executionId = null) {
    const startTime = Date.now();
    let detectionMethod = 'dom_selector';
    
    try {
      console.log('ðŸ” Detecting CAPTCHA on page...');

      // Check for common CAPTCHA indicators via DOM selectors
      const captchaIndicators = [
        { selector: 'iframe[src*="recaptcha"]', type: 'recaptcha' },
        { selector: 'iframe[src*="hcaptcha"]', type: 'hcaptcha' },
        { selector: '.g-recaptcha', type: 'recaptcha' },
        { selector: '.h-captcha', type: 'hcaptcha' },
        { selector: 'div[class*="captcha"]', type: 'generic_captcha' },
        { selector: 'img[src*="captcha"]', type: 'image_captcha' },
        { selector: 'input[name*="captcha"]', type: 'text_captcha' },
        { selector: '[data-sitekey]', type: 'recaptcha' },
        { selector: '.cf-turnstile', type: 'turnstile' }
      ];

      for (const indicator of captchaIndicators) {
        const element = await page.$(indicator.selector);
        if (element) {
          const boundingBox = await element.boundingBox();
          const isVisible = boundingBox && boundingBox.width > 0 && boundingBox.height > 0;
          
          if (isVisible) {
            console.log(`âœ… CAPTCHA detected via DOM: ${indicator.type}`);
            
            if (_executionId) {
              await this.logCaptchaDetection(_executionId, indicator.type, detectionMethod, true, Date.now() - startTime);
            }
            
            return { 
              detected: true, 
              type: indicator.type,
              method: detectionMethod,
              element: element,
              confidence: 0.9 
            };
          }
        }
      }

      // Use AI to detect CAPTCHA in screenshots if DOM detection fails
      console.log('ðŸ¤– Using AI vision for CAPTCHA detection...');
      detectionMethod = 'ai_vision';
      
      const screenshot = await page.screenshot({ 
        type: 'png',
        clip: { x: 0, y: 0, width: 1200, height: 800 } // Focus on main content area
      });
      
      const aiDetection = await this.detectCaptchaWithAI(screenshot);
      
      if (_executionId) {
        await this.logCaptchaDetection(_executionId, aiDetection.type, detectionMethod, aiDetection.detected, Date.now() - startTime);
      }
      
      return {
        ...aiDetection,
        method: detectionMethod
      };

    } catch (error) {
      console.error('âŒ Error detecting CAPTCHA:', error);
      
      if (_executionId) {
        await this.logCaptchaDetection(_executionId, 'unknown', detectionMethod, false, Date.now() - startTime, error.message);
      }
      
      return { detected: false, type: 'unknown', confidence: 0, error: error.message };
    }
  }

  async detectCaptchaWithAI(imageBuffer) {
    try {
      const prompt = `
        Analyze this web page screenshot and determine if there's a CAPTCHA present.
        Look for:
        - reCAPTCHA checkboxes ("I'm not a robot")
        - hCaptcha challenges
        - Image selection CAPTCHAs ("Select all traffic lights")
        - Text-based CAPTCHAs
        - Cloudflare Turnstile
        - Any other bot verification challenges
        
        Return JSON format only:
        {
          "detected": boolean,
          "type": "recaptcha|hcaptcha|image_captcha|text_captcha|turnstile|unknown",
          "confidence": number (0-1),
          "description": "brief description of what you see"
        }
      `;

      const analysis = await this.aiService.analyzeWithGPT4V(imageBuffer, prompt);
      
      try {
        const result = JSON.parse(analysis);
        console.log(`ðŸ¤– AI CAPTCHA detection: ${result.detected ? 'DETECTED' : 'NOT DETECTED'} (${result.confidence * 100}% confidence)`);
        return result;
      } catch (parseError) {
        console.error('âŒ Failed to parse AI CAPTCHA detection response:', analysis);
        return { detected: false, type: 'unknown', confidence: 0 };
      }
    } catch (error) {
      console.error('âŒ AI CAPTCHA detection failed:', error);
      return { detected: false, type: 'unknown', confidence: 0, error: error.message };
    }
  }

  async handleCaptcha(page, captchaInfo, _executionId = null) {
    const startTime = Date.now();
    
    try {
      console.log(`ðŸ” Handling ${captchaInfo.type} CAPTCHA...`);

      let result;
      switch (captchaInfo.type) {
      case 'recaptcha':
        result = await this.solveRecaptcha(page, _executionId);
        break;
      case 'hcaptcha':
        result = await this.solveHCaptcha(page, _executionId);
        break;
      case 'image_captcha':
        result = await this.solveImageCaptcha(page, _executionId);
        break;
      case 'text_captcha':
        result = await this.solveTextCaptcha(page, _executionId);
        break;
      case 'turnstile':
        result = await this.solveTurnstile(page, _executionId);
        break;
      default:
        result = await this.solveGenericCaptcha(page, _executionId);
      }

      if (_executionId) {
        await this.logCaptchaSolving(_executionId, captchaInfo.type, result.method, Date.now() - startTime, result.success, result.cost, result.error);
      }

      return result;

    } catch (error) {
      console.error(`âŒ CAPTCHA handling failed: ${error.message}`);
      
      if (_executionId) {
        await this.logCaptchaSolving(_executionId, captchaInfo.type, 'error', Date.now() - startTime, false, 0, error.message);
      }
      
      return { success: false, method: 'error', error: error.message };
    }
  }

  async solveRecaptcha(page, _executionId = null) {
    void _executionId;
    try {
      console.log('ðŸ”„ Attempting reCAPTCHA bypass...');

      // First, try automated bypass techniques
      const bypassResult = await this.bypassRecaptchaAutomatically(page);
      if (bypassResult.success) {
        return bypassResult;
      }

      // If automated bypass fails, use solving service
      console.log('ðŸ”§ Using CAPTCHA solving service for reCAPTCHA...');
      return await this.solveWithCaptchaService(page, 'recaptcha');

    } catch (error) {
      console.error('âŒ reCAPTCHA solving failed:', error);
      return { success: false, method: 'service_error', error: error.message };
    }
  }

  async bypassRecaptchaAutomatically(page) {
    try {
      // Method 1: Simulate natural human behavior
      await page.evaluate(() => {
        // Dispatch realistic mouse and keyboard events
        const events = ['mousemove', 'mousedown', 'mouseup', 'click'];
        events.forEach(eventType => {
          const event = new MouseEvent(eventType, {
            bubbles: true,
            cancelable: true,
            clientX: Math.random() * window.innerWidth,
            clientY: Math.random() * window.innerHeight
          });
          document.dispatchEvent(event);
        });

        // Focus and blur events
        window.dispatchEvent(new Event('focus'));
        setTimeout(() => window.dispatchEvent(new Event('blur')), 100);
      });

      // Method 2: Check for and click the reCAPTCHA checkbox
      const recaptchaFrame = await page.frameLocator('iframe[src*="recaptcha"]').first();
      const checkbox = recaptchaFrame.locator('#recaptcha-anchor');
      
      if (await checkbox.isVisible()) {
        // Simulate human-like clicking with random delay
        await page.waitForTimeout(Math.random() * 2000 + 1000);
        await checkbox.click();
        
        // Wait for verification
        await page.waitForTimeout(3000);
        
        // Check if bypass worked
        const stillPresent = await this.detectCaptcha(page);
        if (!stillPresent.detected) {
          console.log('âœ… reCAPTCHA bypassed automatically');
          return { success: true, method: 'automated_bypass', cost: 0 };
        }
      }

      return { success: false, method: 'automated_bypass' };

    } catch (error) {
      console.error('âŒ Automated reCAPTCHA bypass failed:', error);
      return { success: false, method: 'automated_bypass', error: error.message };
    }
  }

  async solveHCaptcha(page, _executionId = null) {
    void _executionId;
    try {
      console.log('ðŸ”§ Solving hCaptcha with service...');
      return await this.solveWithCaptchaService(page, 'hcaptcha');
    } catch (error) {
      return { success: false, method: 'service_error', error: error.message };
    }
  }

  async solveImageCaptcha(page, _executionId = null) {
    void _executionId;
    try {
      // Take screenshot of CAPTCHA image
      const captchaElement = await page.$('img[src*="captcha"], .captcha-image, [class*="captcha"] img');
      if (!captchaElement) {
        throw new Error('CAPTCHA image not found');
      }

      const screenshot = await captchaElement.screenshot();
      
      // Use AI to solve image CAPTCHA
      const solution = await this.solveImageCaptchaWithAI(screenshot);
      
      if (solution) {
        // Find input field and enter solution
        const inputField = await page.$('input[name*="captcha"], input[id*="captcha"], .captcha-input');
        if (inputField) {
          await inputField.fill(solution);
          console.log('âœ… Image CAPTCHA solved with AI');
          return { success: true, method: 'ai_ocr', cost: 0 };
        }
      }

      return { success: false, method: 'ai_ocr', error: 'Could not solve image CAPTCHA' };

    } catch (error) {
      return { success: false, method: 'ai_ocr', error: error.message };
    }
  }

  async solveImageCaptchaWithAI(imageBuffer) {
    try {
      const prompt = `
        This is a CAPTCHA image. Please read the text/numbers shown in the image.
        Return only the text/numbers you see, nothing else.
      `;

      const result = await this.aiService.analyzeWithGPT4V(imageBuffer, prompt);
      return result.trim();
    } catch (error) {
      console.error('âŒ AI image CAPTCHA solving failed:', error);
      return null;
    }
  }

  async solveTextCaptcha(page, _executionId = null) {
    void _executionId;
    try {
      // Similar to image CAPTCHA but for text-based challenges
      const textElement = await page.$('.captcha-question, [class*="captcha"] .question');
      if (textElement) {
        const question = await textElement.textContent();
        const answer = await this.solveTextCaptchaWithAI(question);
        
        if (answer) {
          const inputField = await page.$('input[name*="captcha"], input[id*="captcha"]');
          if (inputField) {
            await inputField.fill(answer);
            return { success: true, method: 'ai_text', cost: 0 };
          }
        }
      }

      return { success: false, method: 'ai_text', error: 'Could not solve text CAPTCHA' };
    } catch (error) {
      return { success: false, method: 'ai_text', error: error.message };
    }
  }

  async solveTextCaptchaWithAI(question) {
    try {
      const prompt = `
        Solve this CAPTCHA question: "${question}"
        This is typically a simple math problem or basic question.
        Return only the answer, nothing else.
      `;

      const result = await this.aiService.callClaude(prompt);
      return result.trim();
    } catch (error) {
      console.error('âŒ AI text CAPTCHA solving failed:', error);
      return null;
    }
  }

  async solveTurnstile(page, _executionId = null) {
    void _executionId;
    try {
      // Cloudflare Turnstile typically requires waiting
      console.log('â³ Waiting for Turnstile to complete...');
      
      await page.waitForTimeout(5000);
      
      // Check if Turnstile completed automatically
      const stillPresent = await this.detectCaptcha(page);
      if (!stillPresent.detected) {
        return { success: true, method: 'wait', cost: 0 };
      }

      return { success: false, method: 'wait', error: 'Turnstile did not complete automatically' };
    } catch (error) {
      return { success: false, method: 'wait', error: error.message };
    }
  }

  async solveGenericCaptcha(page, _executionId = null) {
    void _executionId;
    try {
      // Try multiple approaches for unknown CAPTCHA types
      const approaches = [
        () => this.bypassRecaptchaAutomatically(page),
        () => this.solveImageCaptcha(page, _executionId),
        () => this.solveTextCaptcha(page, _executionId)
      ];

      for (const approach of approaches) {
        const result = await approach();
        if (result.success) {
          return result;
        }
      }

      return { success: false, method: 'generic', error: 'All generic approaches failed' };
    } catch (error) {
      return { success: false, method: 'generic', error: error.message };
    }
  }

  async solveWithCaptchaService(page, captchaType) {
    // Get first available service that supports this CAPTCHA type
    const availableService = Array.from(this.captchaServices.values())
      .find(service => service.supportedTypes.includes(captchaType));

    if (!availableService) {
      throw new Error(`No CAPTCHA solving service available for type: ${captchaType}`);
    }

    try {
      console.log(`ðŸ”§ Using ${availableService.name} for ${captchaType}`);
      const solution = await availableService.solve(page, captchaType);
      
      if (solution.success) {
        console.log(`âœ… CAPTCHA solved using ${availableService.name}`);
        return solution;
      } else {
        throw new Error(`CAPTCHA solving failed: ${solution.error}`);
      }
    } catch (error) {
      throw new Error(`CAPTCHA service error: ${error.message}`);
    }
  }

  async solveWith2Captcha(page, captchaType) {
    try {
      const siteKey = await this.extractSiteKey(page);
      const pageUrl = page.url();

      if (!siteKey) {
        throw new Error('Could not extract site key');
      }

      // Submit CAPTCHA to 2captcha
      const submitResponse = await fetch('http://2captcha.com/in.php', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          key: this.captchaServices.get('2captcha').apiKey,
          method: captchaType === 'hcaptcha' ? 'hcaptcha' : 'userrecaptcha',
          googlekey: siteKey,
          pageurl: pageUrl,
          json: 1
        })
      });

      const submitData = await submitResponse.json();
      
      if (submitData.status !== 1) {
        throw new Error(`2Captcha submission error: ${submitData.request}`);
      }

      const captchaId = submitData.request;
      
      // Poll for solution
      for (let i = 0; i < 30; i++) {
        await new Promise(resolve => setTimeout(resolve, 5000));
        
        const resultResponse = await fetch(
          `http://2captcha.com/res.php?key=${this.captchaServices.get('2captcha').apiKey}&action=get&id=${captchaId}&json=1`
        );
        
        const result = await resultResponse.json();
        
        if (result.status === 1) {
          // Submit the solution
          await page.evaluate((token, type) => {
            if (type === 'hcaptcha') {
              const textarea = document.querySelector('[name="h-captcha-response"]');
              if (textarea) {
                textarea.innerHTML = token;
                textarea.dispatchEvent(new Event('change'));
              }
            } else {
              const textarea = document.querySelector('[name="g-recaptcha-response"]');
              if (textarea) {
                textarea.innerHTML = token;
                textarea.dispatchEvent(new Event('change'));
              }
            }
          }, result.request, captchaType);
          
          return { 
            success: true, 
            token: result.request, 
            method: '2captcha',
            cost: 0.002 // Approximate cost
          };
        } else if (result.status === 0 && result.request !== 'CAPCHA_NOT_READY') {
          throw new Error(`2Captcha error: ${result.request}`);
        }
      }

      throw new Error('CAPTCHA solving timeout');

    } catch (error) {
      throw new Error(`2Captcha error: ${error.message}`);
    }
  }

  async solveWithAntiCaptcha(_page, _captchaType) {
    // Parameters intentionally unused until AntiCaptcha integration is implemented
    void _page; void _captchaType;
    // Similar implementation for AntiCaptcha service
    // This would follow AntiCaptcha's API specification
    throw new Error('AntiCaptcha integration not yet implemented');
  }

  async extractSiteKey(page) {
    return await page.evaluate(() => {
      // Look for reCAPTCHA site key
      const recaptchaDiv = document.querySelector('.g-recaptcha, [data-sitekey]');
      if (recaptchaDiv) {
        return recaptchaDiv.getAttribute('data-sitekey');
      }

      // Look for hCaptcha site key
      const hcaptchaDiv = document.querySelector('.h-captcha, [data-sitekey]');
      if (hcaptchaDiv) {
        return hcaptchaDiv.getAttribute('data-sitekey');
      }

      // Look in script tags
      const scripts = Array.from(document.querySelectorAll('script'));
      for (const script of scripts) {
        const content = script.textContent || script.innerHTML;
        const siteKeyMatch = content.match(/['"](6[0-9A-Za-z_-]{39})['"]/);
        if (siteKeyMatch) {
          return siteKeyMatch[1];
        }
      }

      return null;
    });
  }

  async logCaptchaDetection(executionId, captchaType, detectionMethod, success, duration, errorMessage = null) {
    try {
      await this.supabase
        .from('captcha_logs')
        .insert([{
          execution_id: executionId,
          captcha_type: captchaType,
          detection_method: detectionMethod,
          solving_method: null,
          solving_duration_ms: duration,
          success: success,
          cost_usd: 0,
          error_message: errorMessage,
          confidence_score: success ? 0.9 : 0.0
        }]);
    } catch (error) {
      console.error('Error logging CAPTCHA detection:', error);
    }
  }

  async logCaptchaSolving(executionId, captchaType, solvingMethod, duration, success, cost = 0, errorMessage = null) {
    try {
      await this.supabase
        .from('captcha_logs')
        .insert([{
          execution_id: executionId,
          captcha_type: captchaType,
          detection_method: 'logged_separately',
          solving_method: solvingMethod,
          solving_duration_ms: duration,
          success: success,
          cost_usd: cost,
          error_message: errorMessage,
          confidence_score: success ? 0.9 : 0.0
        }]);
    } catch (error) {
      console.error('Error logging CAPTCHA solving:', error);
    }
  }

  async getCaptchaStats(templateId = null, days = 7) {
    try {
      let query = this.supabase
        .from('captcha_logs')
        .select(`
          captcha_type,
          detection_method,
          solving_method,
          success,
          cost_usd,
          solving_duration_ms,
          created_at
        `)
        .gte('created_at', new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString());

      if (templateId) {
        query = query.eq('execution.template_id', templateId);
      }

      const { data, error } = await query;
      if (error) throw error;

      const stats = {
        total: data.length,
        successful: data.filter(log => log.success).length,
        failed: data.filter(log => !log.success).length,
        totalCost: data.reduce((sum, log) => sum + (log.cost_usd || 0), 0),
        avgSolvingTime: data.reduce((sum, log) => sum + (log.solving_duration_ms || 0), 0) / data.length,
        byType: {},
        byMethod: {}
      };

      // Group by type
      data.forEach(log => {
        stats.byType[log.captcha_type] = (stats.byType[log.captcha_type] || 0) + 1;
      });

      // Group by solving method
      data.forEach(log => {
        if (log.solving_method) {
          stats.byMethod[log.solving_method] = (stats.byMethod[log.solving_method] || 0) + 1;
        }
      });

      return stats;
    } catch (error) {
      console.error('Error getting CAPTCHA stats:', error);
      throw error;
    }
  }
}

module.exports = { CaptchaHandler };