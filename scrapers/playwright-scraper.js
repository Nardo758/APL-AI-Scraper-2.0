// APL AI Scraper 2.0 - Playwright Scraper Engine
const { chromium } = require('playwright');

class PlaywrightScraper {
  constructor() {
    this.browser = null;
    this.contexts = new Map();
  }

  async init() {
    try {
      this.browser = await chromium.launch({
        headless: process.env.NODE_ENV === 'production',
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-web-security',
          '--disable-features=IsolateOrigins,site-per-process',
          '--disable-blink-features=AutomationControlled',
          '--no-first-run',
          '--disable-background-timer-throttling',
          '--disable-backgrounding-occluded-windows',
          '--disable-renderer-backgrounding'
        ]
      });
      console.log('âœ… Playwright browser initialized');
    } catch (error) {
      console.error('âŒ Failed to initialize Playwright browser:', error);
      throw error;
    }
  }

  async scrape(jobConfig) {
    const { url, waitFor, actions, extractors, timeout = 30000 } = jobConfig;
    
    if (!this.browser) {
      await this.init();
    }

    const context = await this.createStealthContext();
    const page = await context.newPage();

    try {
      console.log(`ðŸŒ Starting scrape for: ${url}`);

      // Set realistic viewport and user agent
      await page.setViewportSize({ width: 1920, height: 1080 });

      // Navigate with realistic delays and error handling
      await page.goto(url, {
        waitUntil: 'networkidle',
        timeout: timeout
      });

      console.log(`ðŸ“„ Page loaded: ${url}`);

      // Execute pre-scraping actions if specified
      if (actions && actions.length > 0) {
        console.log(`ðŸŽ¯ Executing ${actions.length} actions`);
        for (const action of actions) {
          await this.executeAction(page, action);
        }
      }

      // Wait for specified elements if needed
      if (waitFor) {
        console.log(`â³ Waiting for selector: ${waitFor}`);
        await page.waitForSelector(waitFor, { timeout: 10000 });
      }

      // Extract data based on extractors or default extraction
      const data = {};
      if (extractors && extractors.length > 0) {
        console.log(`ðŸ“Š Extracting data using ${extractors.length} extractors`);
        for (const extractor of extractors) {
          try {
            data[extractor.name] = await this.extractData(page, extractor);
          } catch (extractError) {
            console.warn(`âš ï¸ Extraction failed for ${extractor.name}:`, extractError.message);
            data[extractor.name] = null;
          }
        }
      } else {
        // Default extraction strategies
        data.title = await page.title();
        data.url = page.url();
        data.content = await this.extractDefaultContent(page);
        data.links = await this.extractLinks(page);
        data.images = await this.extractImages(page);
      }

      // Take screenshot if requested
      if (jobConfig.takeScreenshot) {
        data.screenshot = await page.screenshot({ 
          fullPage: true,
          type: 'png'
        });
      }

      await context.close();
      console.log(`âœ… Scraping completed successfully for: ${url}`);
      return { success: true, data };

    } catch (error) {
      console.error(`âŒ Scraping failed for ${url}:`, error.message);
      await context.close();
      return { success: false, error: error.message };
    }
  }

  async createStealthContext() {
    const context = await this.browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      viewport: { width: 1920, height: 1080 },
      locale: 'en-US',
      timezoneId: 'America/New_York',
      permissions: ['geolocation'],
      geolocation: { latitude: 40.7128, longitude: -74.0060 }, // NYC
      extraHTTPHeaders: {
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Accept-Encoding': 'gzip, deflate, br',
        'DNT': '1',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1'
      }
    });

    // Add stealth scripts to hide automation
    await context.addInitScript(() => {
      // Remove webdriver property
      Object.defineProperty(navigator, 'webdriver', {
        get: () => undefined,
      });

      // Mock plugins
      Object.defineProperty(navigator, 'plugins', {
        get: () => [1, 2, 3, 4, 5],
      });

      // Mock languages
      Object.defineProperty(navigator, 'languages', {
        get: () => ['en-US', 'en'],
      });

      // Remove automation indicators (use globalThis to avoid type complaints)
      (globalThis).chrome = {
        runtime: {},
      };

      // Mock permissions: return a PermissionStatus-like object cast to any so
      // our check-js/type-checking environment does not complain about missing
      // DOM types.
      const originalQuery = window.navigator.permissions.query;
      window.navigator.permissions.query = (parameters) => (
        parameters.name === 'notifications' ?
          Promise.resolve(/** @type {any} */ ({ state: Notification.permission })) :
          originalQuery(parameters)
      );
    });

    return context;
  }

  async executeAction(page, action) {
    const { type, selector, value, delay = 0, waitTime = 1000 } = action;

    console.log(`ðŸŽ¯ Executing action: ${type} on ${selector}`);

    // Pre-action delay
    if (delay) {
      await page.waitForTimeout(delay);
    }

    try {
      switch (type) {
      case 'click':
        await page.waitForSelector(selector, { timeout: 5000 });
        await page.click(selector);
        break;

      case 'type':
        await page.waitForSelector(selector, { timeout: 5000 });
        await page.fill(selector, value);
        break;

      case 'typeHuman':
        await page.waitForSelector(selector, { timeout: 5000 });
        await page.type(selector, value, { delay: 100 });
        break;

      case 'scroll':
        if (selector) {
          await page.evaluate((sel) => {
            const element = document.querySelector(sel);
            if (element) {
              element.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
          }, selector);
        } else {
          await page.evaluate(() => {
            window.scrollBy(0, window.innerHeight);
          });
        }
        break;

      case 'scrollToBottom':
        await page.evaluate(() => {
          window.scrollTo(0, document.body.scrollHeight);
        });
        break;

      case 'wait':
        await page.waitForSelector(selector, { timeout: waitTime });
        break;

      case 'waitAndClick':
        await page.waitForSelector(selector, { timeout: 5000 });
        await page.click(selector);
        break;

      case 'hover':
        await page.waitForSelector(selector, { timeout: 5000 });
        await page.hover(selector);
        break;

      case 'select':
        await page.waitForSelector(selector, { timeout: 5000 });
        await page.selectOption(selector, value);
        break;

      case 'keyPress':
        await page.keyboard.press(value);
        break;

      case 'waitForNavigation':
        await page.waitForNavigation({ waitUntil: 'networkidle' });
        break;

      default:
        console.warn(`âš ï¸ Unknown action type: ${type}`);
      }

      // Random delay between actions to appear more human
      const humanDelay = Math.random() * 1000 + 500;
      await page.waitForTimeout(humanDelay);

    } catch (error) {
      console.warn(`âš ï¸ Action failed: ${type} on ${selector} - ${error.message}`);
      throw error;
    }
  }

  async extractData(page, extractor) {
    const { type, selector, attribute, multiple = false, transform } = extractor;

    try {
      let result;

      switch (type) {
      case 'text':
        if (multiple) {
          result = await page.$$eval(selector, (elements) => 
            elements.map(el => el.textContent?.trim() || '').filter(text => text.length > 0)
          );
        } else {
          result = await page.$eval(selector, el => el.textContent?.trim() || '');
        }
        break;

      case 'html':
        if (multiple) {
          result = await page.$$eval(selector, (elements) => 
            elements.map(el => el.innerHTML)
          );
        } else {
          result = await page.$eval(selector, el => el.innerHTML);
        }
        break;

      case 'attribute':
        if (multiple) {
          result = await page.$$eval(selector, (elements, attr) => 
            elements.map(el => el.getAttribute(attr)).filter(val => val !== null), 
          attribute
          );
        } else {
          result = await page.$eval(selector, (el, attr) => el.getAttribute(attr), attribute);
        }
        break;

      case 'href':
        if (multiple) {
          result = await page.$$eval(selector, (elements) => 
            elements.map(el => el.href).filter(href => href && href.startsWith('http'))
          );
        } else {
          result = await page.$eval(selector, el => el.href);
        }
        break;

      case 'src':
        if (multiple) {
          result = await page.$$eval(selector, (elements) => 
            elements.map(el => el.src).filter(src => src && src.startsWith('http'))
          );
        } else {
          result = await page.$eval(selector, el => el.src);
        }
        break;

      case 'count':
        result = await page.$$eval(selector, elements => elements.length);
        break;

      case 'exists':
        result = await page.$(selector) !== null;
        break;

      default:
        result = await page.$eval(selector, el => el.textContent?.trim() || '');
      }

      // Apply transformation if specified
      if (transform && result) {
        switch (transform) {
        case 'lowercase':
          result = Array.isArray(result) ? result.map(r => r.toLowerCase()) : result.toLowerCase();
          break;
        case 'uppercase':
          result = Array.isArray(result) ? result.map(r => r.toUpperCase()) : result.toUpperCase();
          break;
        case 'trim':
          result = Array.isArray(result) ? result.map(r => r.trim()) : result.trim();
          break;
        case 'number':
          result = Array.isArray(result) ? result.map(r => parseFloat(r) || 0) : parseFloat(result) || 0;
          break;
        }
      }

      return result;

    } catch (error) {
      console.warn(`âš ï¸ Extraction failed for selector ${selector}:`, error.message);
      return multiple ? [] : null;
    }
  }

  async extractDefaultContent(page) {
    try {
      // Extract main content areas
      const contentSelectors = [
        'main',
        '[role="main"]',
        '.main-content',
        '#main-content',
        '.content',
        '#content',
        'article',
        '.article',
        '.post-content',
        '.entry-content'
      ];

      for (const selector of contentSelectors) {
        try {
          const content = await page.$eval(selector, el => el.textContent?.trim());
          if (content && content.length > 100) {
            return content;
          }
        } catch (e) {
          // Continue to next selector
        }
      }

      // Fallback to body text
      return await page.$eval('body', el => el.textContent?.trim() || '');
    } catch (error) {
      return '';
    }
  }

  async extractLinks(page) {
    try {
      return await page.$$eval('a[href]', links => 
        links
          .map(link => ({
            text: link.textContent?.trim() || '',
            href: link.href,
            title: link.title || ''
          }))
          .filter(link => link.href && link.href.startsWith('http'))
          .slice(0, 50) // Limit to first 50 links
      );
    } catch (error) {
      return [];
    }
  }

  async extractImages(page) {
    try {
      return await page.$$eval('img[src]', images => 
        images
          .map(img => ({
            src: img.src,
            alt: img.alt || '',
            title: img.title || '',
            width: img.width || 0,
            height: img.height || 0
          }))
          .filter(img => img.src && img.src.startsWith('http'))
          .slice(0, 20) // Limit to first 20 images
      );
    } catch (error) {
      return [];
    }
  }

  async close() {
    try {
      if (this.browser) {
        await this.browser.close();
        console.log('ðŸ”’ Playwright browser closed');
      }
    } catch (error) {
      console.error('âŒ Error closing browser:', error);
    }
  }
}

module.exports = { PlaywrightScraper };