// APL AI Scraper 2.0 - Main Server
const express = require('express');
// Note: explicit `cors`/`helmet` packages are available but we use our middleware wrappers
const { createClient } = require('@supabase/supabase-js');
// PlaywrightScraper import removed (not used here); keep scraper module standalone
const { AIService } = require('./services/ai-service');
const { JobQueue } = require('./services/job-queue');
let VisualAnalysisEngine;
try {
  // attempt to load the visual analysis engine (may depend on native libs like sharp)
  VisualAnalysisEngine = require('./services/visual-analysis-engine').VisualAnalysisEngine;
} catch (err) {
  // Provide a lightweight stub so tests and environments without native deps won't fail
  VisualAnalysisEngine = class {
    constructor() { this.isInitialized = false; }
    async analyzeRecordingSession(_recordingData) {
      // return a minimal analysis shape expected by downstream code
      // _recordingData intentionally unused in the stub
      // Acknowledge parameter to satisfy linter
      void _recordingData;
      return {
        interactiveElements: [],
        dataFields: [],
        patterns: [],
        confidence: 0
      };
    }
  };
  console.warn('VisualAnalysisEngine not available; using stub. Error:', err.message);
}
const { CodeGenerator } = require('./services/code-generator');
const { ScraperTemplate } = require('./models/scraper-template');
const { DistributedOrchestrator } = require('./services/distributed-orchestrator');
const { ProxyManager } = require('./services/proxy-manager');
const { CaptchaHandler } = require('./services/captcha-handler');
const { DataProcessor } = require('./services/data-processor');

require('dotenv').config();

const app = express();

// Security middleware (helmet/CORS/rate-limiting provided by our middleware module)
const { securityHeaders, corsMiddleware, createRateLimiter, authenticate } = require('./middleware/security-middleware');
const { AuthService } = require('./services/auth/auth-service');
const { ComplianceManager } = require('./services/compliance-manager');
const { PrivacyManager } = require('./services/privacy-manager');
// logger intentionally omitted here; use console.* for lightweight environments

app.use(securityHeaders());
app.use(corsMiddleware());
app.use(createRateLimiter());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Compliance middleware (request logging and minimal policy enforcement)
const { requestLogger, compliancePolicy } = require('./middleware/compliance');

// Log every request to logs/requests.log for auditability
app.use(requestLogger);


// Initialize services
let supabase;
// Initialize Supabase client defensively. If SUPABASE_URL is missing, empty,
// a placeholder, or createClient throws, fall back to the in-repo test stub so
// integration tests remain hermetic on local environments.
try {
  const url = process.env.SUPABASE_URL;
  if (!url || url === 'your_supabase_url_here' || url.trim() === '') {
    supabase = require('./services/core/supabase').supabase;
  } else {
    try {
      supabase = createClient(url, process.env.SUPABASE_ANON_KEY);
    } catch (e) {
      console.warn('Supabase client initialization failed, using local stub. Error:', e.message);
      supabase = require('./services/core/supabase').supabase;
    }
  }
} catch (e) {
  // Extremely defensive: ensure tests don't fail when loading server module
  console.warn('Error during supabase initialization, using local stub:', e && e.message);
  supabase = require('./services/core/supabase').supabase;
}

const aiService = new AIService();
const jobQueue = new JobQueue(supabase);
const visualAnalysisEngine = new VisualAnalysisEngine();
const codeGenerator = new CodeGenerator();
const scraperTemplate = new ScraperTemplate(supabase);
const distributedOrchestrator = new DistributedOrchestrator();
const proxyManager = new ProxyManager();
const captchaHandler = new CaptchaHandler();
const dataProcessor = new DataProcessor();

// Security/Compliance services
const authService = new AuthService();
const complianceManager = new ComplianceManager();
const privacyManager = new PrivacyManager();

// Health route (mounted from routes/health.js)
app.use('/', require('./routes/health'));

// Request context middleware - attach services for route handlers
app.use((req, res, next) => {
  req.services = {
    supabase,
    ai: aiService,
    jobQueue,
    visualAnalysisEngine,
    codeGenerator,
    orchestrator: distributedOrchestrator,
    proxyManager,
    captchaHandler,
    dataProcessor,
    auth: authService,
    compliance: complianceManager,
    privacy: privacyManager
  };
  next();
});

// Public routes (no authentication required)
app.use('/api/auth', require('./routes/auth'));
app.use('/api/public', require('./routes/public'));

// Minimal admin area protection using compliancePolicy middleware
app.use('/admin', compliancePolicy, (req, res, next) => next());

// Compliance check for all scraping requests
app.use('/api/scrape', async (req, res, next) => {
  try {
    const url = (req.body && req.body.url) || (req.query && req.query.url);
    const compliance = await complianceManager.checkCompliance(url, 'AI-Scraper-Service');
    if (!compliance.allowed) {
      await complianceManager.logComplianceEvent({ project_id: (req.body && req.body.projectId) || null, domain: new URL(url).hostname, url, allowed: false, reason: compliance.reason, timestamp: new Date().toISOString() });
      return res.status(429).json({ error: 'Compliance violation', reason: compliance.reason, retryAfter: compliance.retryAfter });
    }

    if (compliance.crawlDelay) await complianceManager.respectCrawlDelay(new URL(url).hostname, compliance.crawlDelay);

    next();
  } catch (error) {
    next(error);
  }
});

// Projects endpoints
app.post('/api/projects', authenticate, async (req, res) => {
  try {
    const { name, description, user_id } = req.body;
    
    if (!name || !user_id) {
      return res.status(400).json({ error: 'Name and user_id are required' });
    }

    const { data, error } = await supabase
      .from('projects')
      .insert([{ name, description, user_id }])
      .select()
      .single();

    if (error) throw error;
    res.json(data);
  } catch (error) {
    console.error('Error creating project:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/projects', authenticate, async (req, res) => {
  try {
    const { user_id } = req.query;
    
    if (!user_id) {
      return res.status(400).json({ error: 'user_id is required' });
    }

    const { data, error } = await supabase
      .from('projects')
      .select('*')
      .eq('user_id', user_id)
      .order('created_at', { ascending: false });

    if (error) throw error;
    res.json(data);
  } catch (error) {
    console.error('Error fetching projects:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/projects/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const { data, error } = await supabase
      .from('projects')
      .select('*')
      .eq('id', id)
      .single();

    if (error) throw error;
    res.json(data);
  } catch (error) {
    console.error('Error fetching project:', error);
    res.status(500).json({ error: error.message });
  }
});

// Scraping jobs endpoints
app.post('/api/jobs', async (req, res) => {
  try {
    const { project_id, url, config } = req.body;
    
    if (!project_id || !url) {
      return res.status(400).json({ error: 'project_id and url are required' });
    }

    const { data, error } = await supabase
      .from('scraping_jobs')
      .insert([{ project_id, url, config: config || {} }])
      .select()
      .single();

    if (error) throw error;
    
    // Add to processing queue
    await jobQueue.addJob(data.id);
    
    res.json(data);
  } catch (error) {
    console.error('Error creating job:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/jobs/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { data, error } = await supabase
      .from('scraping_jobs')
      .select(`
        *,
        scraped_data(*)
      `)
      .eq('id', id)
      .single();

    if (error) throw error;
    res.json(data);
  } catch (error) {
    console.error('Error fetching job:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/projects/:projectId/jobs', async (req, res) => {
  try {
    const { projectId } = req.params;
    const { status, limit = 50, offset = 0 } = req.query;

    let query = supabase
      .from('scraping_jobs')
      .select('*')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false })
      .range(require('./utils/parse-number').parseNumber(offset, 0), require('./utils/parse-number').parseNumber(offset, 0) + require('./utils/parse-number').parseNumber(limit, 0) - 1);

    if (status) {
      query = query.eq('status', status);
    }

    const { data, error } = await query;

    if (error) throw error;
    res.json(data);
  } catch (error) {
    console.error('Error fetching jobs:', error);
    res.status(500).json({ error: error.message });
  }
});

// AI endpoints
app.post('/api/ai/discover-sites', async (req, res) => {
  try {
    const { query } = req.body;
    
    if (!query) {
      return res.status(400).json({ error: 'Query is required' });
    }

    const sites = await aiService.discoverSitesWithAI(query);
    res.json(sites);
  } catch (error) {
    console.error('Error discovering sites:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/ai/analyze-screenshot', async (req, res) => {
  try {
    const { imageBase64, prompt } = req.body;
    
    if (!imageBase64 || !prompt) {
      return res.status(400).json({ error: 'Image and prompt are required' });
    }

    const imageBuffer = Buffer.from(imageBase64, 'base64');
    const analysis = await aiService.analyzeWithGPT4V(imageBuffer, prompt);
    res.json({ analysis });
  } catch (error) {
    console.error('Error analyzing screenshot:', error);
    res.status(500).json({ error: error.message });
  }
});

// Training sessions endpoints
app.post('/api/training-sessions', async (req, res) => {
  try {
    const { project_id, recording_data, screenshots, metadata } = req.body;
    
    if (!recording_data || !recording_data.actions) {
      return res.status(400).json({ error: 'Recording data with actions is required' });
    }

    const screenshotCount = recording_data.screenshots ? recording_data.screenshots.length : 0;
    console.log(`ðŸ“ Creating training session with ${recording_data.actions.length} actions and ${screenshotCount} screenshots`);

    const { data: session, error } = await supabase
      .from('training_sessions')
      .insert([{ 
        project_id,
        recording_data: { 
          actions: recording_data.actions,
          screenshots: recording_data.screenshots || screenshots || [],
          metadata: recording_data.metadata || metadata || {}
        },
        status: 'analyzing'
      }])
      .select()
      .single();

    if (error) throw error;

    // Start background analysis
    analyzeTrainingSession(session.id, recording_data);

    res.json(session);
  } catch (error) {
    console.error('Error creating training session:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/training-sessions/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { data, error } = await supabase
      .from('training_sessions')
      .select('*')
      .eq('id', id)
      .single();

    if (error) throw error;
    res.json(data);
  } catch (error) {
    console.error('Error fetching training session:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/training-sessions', async (req, res) => {
  try {
    const { project_id, status, limit = 50, offset = 0 } = req.query;

    let query = supabase
      .from('training_sessions')
      .select('id, project_id, status, created_at, recording_data')
      .order('created_at', { ascending: false })
      .range(require('./utils/parse-number').parseNumber(offset, 0), require('./utils/parse-number').parseNumber(offset, 0) + require('./utils/parse-number').parseNumber(limit, 0) - 1);

    if (project_id) {
      query = query.eq('project_id', project_id);
    }

    if (status) {
      query = query.eq('status', status);
    }

    const { data, error } = await query;

    if (error) throw error;
    
    // Add summary statistics to each session
    const sessionsWithStats = data.map(session => ({
      ...session,
      stats: {
        actionCount: session.recording_data && session.recording_data.actions ? session.recording_data.actions.length : 0,
        screenshotCount: session.recording_data && session.recording_data.screenshots ? session.recording_data.screenshots.length : 0,
        duration: session.recording_data && session.recording_data.metadata ? session.recording_data.metadata.duration || 0 : 0
      }
    }));

    res.json(sessionsWithStats);
  } catch (error) {
    console.error('Error fetching training sessions:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/training-sessions/:id/analyze', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Get session data
    const { data: session, error } = await supabase
      .from('training_sessions')
      .select('*')
      .eq('id', id)
      .single();

    if (error) throw error;
    
    if (!session.recording_data) {
      return res.status(400).json({ error: 'No recording data found' });
    }

    // Update status to analyzing
    await supabase
      .from('training_sessions')
      .update({ status: 'analyzing' })
      .eq('id', id);

    // Start analysis
    analyzeTrainingSession(id, session.recording_data);

    res.json({ message: 'Analysis started', sessionId: id });
  } catch (error) {
    console.error('Error starting analysis:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/training-sessions/:id/generate-code', async (req, res) => {
  try {
    const { id } = req.params;
    const { options = {} } = req.body;

    // Get session data
    const { data: session, error } = await supabase
      .from('training_sessions')
      .select('*')
      .eq('id', id)
      .single();

    if (error) throw error;

    if (session.status !== 'analyzed' && session.status !== 'completed') {
      return res.status(400).json({ 
        error: 'Session must be analyzed before generating code',
        currentStatus: session.status
      });
    }

    const recordingData = session.recording_data;
    const analysis = recordingData.analysis;

    if (!analysis) {
      return res.status(400).json({ error: 'No analysis data found' });
    }

    console.log(`ðŸ—ï¸ Generating code for session ${id}`);

    const codeResult = await codeGenerator.generateScrapingCode(
      analysis, 
      recordingData.actions,
      options
    );

    // Update session with generated code
    await supabase
      .from('training_sessions')
      .update({ 
        generated_code: codeResult.code,
        status: 'code_generated',
        recording_data: {
          ...recordingData,
          codeGeneration: {
            ...codeResult,
            generatedAt: new Date().toISOString()
          }
        }
      })
      .eq('id', id);

    res.json({
      sessionId: id,
      code: codeResult.code,
      metadata: codeResult.metadata,
      validation: codeResult.validation
    });

  } catch (error) {
    console.error('Error generating code:', error);
    
    // Update session status to reflect error
    await supabase
      .from('training_sessions')
      .update({ 
        status: 'code_generation_failed',
        recording_data: {
          ...req.body,
          error: error.message
        }
      })
      .eq('id', req.params.id);

    res.status(500).json({ error: error.message });
  }
});

app.get('/api/training-sessions/:id/code', async (req, res) => {
  try {
    const { id } = req.params;
    const { data: session, error } = await supabase
      .from('training_sessions')
      .select('generated_code, status, recording_data')
      .eq('id', id)
      .single();

    if (error) throw error;

    if (!session.generated_code) {
      return res.status(404).json({ error: 'No generated code found for this session' });
    }

    const codeGeneration = session.recording_data && session.recording_data.codeGeneration ? session.recording_data.codeGeneration : {};

    res.json({
      sessionId: id,
      code: session.generated_code,
      status: session.status,
      metadata: codeGeneration.metadata,
      validation: codeGeneration.validation,
      generatedAt: codeGeneration.generatedAt
    });

  } catch (error) {
    console.error('Error fetching generated code:', error);
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/training-sessions/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { error } = await supabase
      .from('training_sessions')
      .delete()
      .eq('id', id);

    if (error) throw error;

    res.json({ message: 'Training session deleted successfully' });
  } catch (error) {
    console.error('Error deleting training session:', error);
    res.status(500).json({ error: error.message });
  }
});

// Error handling middleware
app.use((err, req, res, _next) => {
  // Keep the next parameter for Express signature compatibility
  void _next;
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// ================================
// PHASE 3: SCRAPER MANAGEMENT & EXECUTION
// ================================

// Scraper Templates API
app.post('/api/templates', async (req, res) => {
  try {
    const { project_id, name, description, code, config } = req.body;

    if (!project_id || !name || !code) {
      return res.status(400).json({ 
        error: 'project_id, name, and code are required' 
      });
    }

    const template = await scraperTemplate.createTemplate(project_id, {
      name,
      description,
      code,
      config: config || {}
    });

    res.json(template);
  } catch (error) {
    console.error('Error creating template:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/templates', async (req, res) => {
  try {
    const { project_id, status, limit } = req.query;
    
    const templates = await scraperTemplate.listTemplates(project_id, {
      status,
      limit: require('./utils/parse-number').parseNumber(limit) || undefined
    });

    res.json(templates);
  } catch (error) {
    console.error('Error listing templates:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/templates/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const template = await scraperTemplate.getTemplate(id);
    
    if (!template) {
      return res.status(404).json({ error: 'Template not found' });
    }

    res.json(template);
  } catch (error) {
    console.error('Error fetching template:', error);
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/templates/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    const updatedTemplate = await scraperTemplate.updateTemplate(id, updates);
    res.json(updatedTemplate);
  } catch (error) {
    console.error('Error updating template:', error);
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/templates/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await scraperTemplate.deleteTemplate(id);
    res.json({ message: 'Template deleted successfully' });
  } catch (error) {
    console.error('Error deleting template:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/templates/:id/clone', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, project_id } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'name is required for cloning' });
    }

    const clonedTemplate = await scraperTemplate.cloneTemplate(id, name, project_id);
    res.json(clonedTemplate);
  } catch (error) {
    console.error('Error cloning template:', error);
    res.status(500).json({ error: error.message });
  }
});

// Distributed Execution API
app.post('/api/execution/schedule', async (req, res) => {
  try {
    const { template_id, urls, options = {} } = req.body;

    if (!template_id || !urls || !Array.isArray(urls)) {
      return res.status(400).json({ 
        error: 'template_id and urls array are required' 
      });
    }

    // Get template
    const template = await scraperTemplate.getTemplate(template_id);
    if (!template) {
      return res.status(404).json({ error: 'Template not found' });
    }

    // Initialize orchestrator if needed
    if (!distributedOrchestrator.isInitialized) {
      await distributedOrchestrator.initialize();
    }

    // Schedule jobs
    const result = await distributedOrchestrator.scheduleJob(template, urls, options);
    
    res.json({
      message: `Scheduled ${result.jobs.length} scraping jobs`,
      batchId: result.batchId,
      jobs: result.jobs,
      queueName: result.queueName
    });

  } catch (error) {
    console.error('Error scheduling execution:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/execution/queue/stats', async (req, res) => {
  try {
    const stats = await distributedOrchestrator.getQueueStats();
    res.json(stats);
  } catch (error) {
    console.error('Error getting queue stats:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/execution/workers/start', async (req, res) => {
  try {
    const { configs } = req.body;
    await distributedOrchestrator.startWorkers(configs);
    res.json({ message: 'Workers started successfully' });
  } catch (error) {
    console.error('Error starting workers:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/execution/queue/:name/pause', async (req, res) => {
  try {
    const { name } = req.params;
    await distributedOrchestrator.pauseQueue(name);
    res.json({ message: `Queue ${name} paused` });
  } catch (error) {
    console.error('Error pausing queue:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/execution/queue/:name/resume', async (req, res) => {
  try {
    const { name } = req.params;
    await distributedOrchestrator.resumeQueue(name);
    res.json({ message: `Queue ${name} resumed` });
  } catch (error) {
    console.error('Error resuming queue:', error);
    res.status(500).json({ error: error.message });
  }
});

// Scraping Executions API
app.get('/api/executions', async (req, res) => {
  try {
    const { template_id, status, limit = 50, offset = 0 } = req.query;

    let query = supabase
      .from('scraping_executions')
      .select(`
        *,
        scraper_templates(name, version)
      `)
      .order('created_at', { ascending: false })
      .range(require('./utils/parse-number').parseNumber(offset, 0), require('./utils/parse-number').parseNumber(offset, 0) + require('./utils/parse-number').parseNumber(limit, 0) - 1);

    if (template_id) {
      query = query.eq('template_id', template_id);
    }

    if (status) {
      query = query.eq('status', status);
    }

    const { data, error } = await query;

    if (error) throw error;
    res.json(data);
  } catch (error) {
    console.error('Error fetching executions:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/executions/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const { data, error } = await supabase
      .from('scraping_executions')
      .select(`
        *,
        scraper_templates(name, version, config),
        captcha_logs(*)
      `)
      .eq('id', id)
      .single();

    if (error) throw error;
    
    if (!data) {
      return res.status(404).json({ error: 'Execution not found' });
    }

    res.json(data);
  } catch (error) {
    console.error('Error fetching execution:', error);
    res.status(500).json({ error: error.message });
  }
});

// Proxy Management API
app.get('/api/proxies', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('proxy_list')
      .select('*')
      .order('success_rate', { ascending: false });

    if (error) throw error;
    res.json(data);
  } catch (error) {
    console.error('Error fetching proxies:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/proxies', async (req, res) => {
  try {
    const proxyData = req.body;
    const proxy = await proxyManager.addProxy(proxyData);
    res.json(proxy);
  } catch (error) {
    console.error('Error adding proxy:', error);
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/proxies/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await proxyManager.removeProxy(id);
    res.json({ message: 'Proxy removed successfully' });
  } catch (error) {
    console.error('Error removing proxy:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/proxies/stats', async (req, res) => {
  try {
    const stats = await proxyManager.getProxyStats();
    res.json(stats);
  } catch (error) {
    console.error('Error getting proxy stats:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/proxies/refresh', async (req, res) => {
  try {
    const count = await proxyManager.refreshProxyList();
    res.json({ message: `Refreshed ${count} proxies` });
  } catch (error) {
    console.error('Error refreshing proxies:', error);
    res.status(500).json({ error: error.message });
  }
});

// Data Schemas API
app.get('/api/schemas', async (req, res) => {
  try {
    const { project_id } = req.query;

    let query = supabase
      .from('data_schemas')
      .select('*')
      .order('created_at', { ascending: false });

    if (project_id) {
      query = query.eq('project_id', project_id);
    }

    const { data, error } = await query;

    if (error) throw error;
    res.json(data);
  } catch (error) {
    console.error('Error fetching schemas:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/schemas', async (req, res) => {
  try {
    const { project_id, name, schema_def, validation_rules, transformation_rules } = req.body;

    if (!project_id || !name || !schema_def) {
      return res.status(400).json({ 
        error: 'project_id, name, and schema_def are required' 
      });
    }

    const { data, error } = await supabase
      .from('data_schemas')
      .insert([{
        project_id,
        name,
        schema_def,
        validation_rules: validation_rules || {},
        transformation_rules: transformation_rules || {}
      }])
      .select()
      .single();

    if (error) throw error;
    res.json(data);
  } catch (error) {
    console.error('Error creating schema:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/schemas/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const { data, error } = await supabase
      .from('data_schemas')
      .select('*')
      .eq('id', id)
      .single();

    if (error) throw error;
    
    if (!data) {
      return res.status(404).json({ error: 'Schema not found' });
    }

    res.json(data);
  } catch (error) {
    console.error('Error fetching schema:', error);
    res.status(500).json({ error: error.message });
  }
});

// Data Processing API
app.post('/api/data/process', async (req, res) => {
  try {
    const { raw_data, schema_id, options = {} } = req.body;

    if (!raw_data || !schema_id) {
      return res.status(400).json({ 
        error: 'raw_data and schema_id are required' 
      });
    }

    // Get schema
    const { data: schema, error: schemaError } = await supabase
      .from('data_schemas')
      .select('*')
      .eq('id', schema_id)
      .single();

    if (schemaError) throw schemaError;

    if (!schema) {
      return res.status(404).json({ error: 'Schema not found' });
    }

    // Process data
    const result = await dataProcessor.processScrapedData(raw_data, schema.schema_def, options);

    res.json({
      processed_data: result.data,
      quality_metrics: result.qualityMetrics,
      errors: result.errors,
      warnings: result.warnings,
      transformations: result.transformations,
      valid: result.valid,
      processing_time: result.processingTime
    });

  } catch (error) {
    console.error('Error processing data:', error);
    res.status(500).json({ error: error.message });
  }
});

// CAPTCHA Analytics API
app.get('/api/analytics/captcha', async (req, res) => {
  try {
    const { template_id, days = 7 } = req.query;
    const stats = await captchaHandler.getCaptchaStats(template_id, require('./utils/parse-number').parseNumber(days));
    res.json(stats);
  } catch (error) {
    console.error('Error getting CAPTCHA analytics:', error);
    res.status(500).json({ error: error.message });
  }
});

// Template Analytics API
app.get('/api/analytics/templates/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { days = 30 } = req.query;
    const daysNum = require('./utils/parse-number').parseNumber(days, 30);

    // Get template metrics
    const { data: metrics, error: metricsError } = await supabase
      .from('template_metrics')
      .select('*')
      .eq('template_id', id)
      .single();

    if (metricsError && metricsError.code !== 'PGRST116') {
      throw metricsError;
    }

    // Get recent executions
    const { data: executions, error: executionsError } = await supabase
      .from('scraping_executions')
      .select('status, execution_duration_ms, created_at')
      .eq('template_id', id)
      .gte('created_at', new Date(Date.now() - daysNum * 24 * 60 * 60 * 1000).toISOString())
      .order('created_at', { ascending: false });

    if (executionsError) throw executionsError;

    // Get quality metrics
    const { data: qualityMetrics, error: qualityError } = await supabase
      .from('data_quality_metrics')
      .select('*')
      .eq('template_id', id)
      .gte('execution_date', new Date(Date.now() - daysNum * 24 * 60 * 60 * 1000).toISOString().split('T')[0])
      .order('execution_date', { ascending: false });

    if (qualityError) throw qualityError;

    res.json({
      template_id: id,
      metrics: metrics || {},
      recent_executions: executions || [],
      quality_metrics: qualityMetrics || [],
      period_days: days
    });

  } catch (error) {
    console.error('Error getting template analytics:', error);
    res.status(500).json({ error: error.message });
  }
});

// Real-time activity feed
app.get('/api/activity', async (req, res) => {
  try {
    const { limit = 50, offset = 0, type } = req.query;

    // Create activity entries from multiple sources
    const activities = [];

    // Get recent executions
    const { data: executions } = await supabase
      .from('scraping_executions')
      .select('id, status, created_at, template_name, records_scraped, error_message')
      .order('created_at', { ascending: false })
      .limit(20);

    if (executions && executions.forEach) {
      executions.forEach(exec => {
        activities.push({
          id: `exec-${exec.id}`,
          type: 'execution',
          title: `Scraping job ${exec.status}`,
          description: `Template: ${exec.template_name} • ${exec.records_scraped || 0} records`,
          status: exec.status,
          timestamp: exec.created_at,
          metadata: {
            execution_id: exec.id,
            template_name: exec.template_name,
            records_scraped: exec.records_scraped,
            error_message: exec.error_message
          }
        });
      });
    }

    // Get recent training sessions
    const { data: trainingSessions } = await supabase
      .from('training_sessions')
      .select('id, status, created_at, recording_data')
      .order('created_at', { ascending: false })
      .limit(10);

    if (trainingSessions && trainingSessions.forEach) {
      trainingSessions.forEach(session => {
        const sessionName = (session.recording_data && session.recording_data.metadata && session.recording_data.metadata.sessionName) || 'Training Session';
        const interactionCount = session.recording_data && session.recording_data.actions ? session.recording_data.actions.length : 0;
        
        activities.push({
          id: `training-${session.id}`,
          type: 'training',
          title: `Training session ${session.status}`,
          description: `${sessionName} â€¢ ${interactionCount} interactions`,
          status: session.status,
          timestamp: session.created_at,
          metadata: {
            session_id: session.id,
            interaction_count: interactionCount
          }
        });
      });
    }

    // Get recent template changes
    const { data: templates } = await supabase
      .from('scraper_templates')
      .select('id, name, created_at, updated_at, status')
      .order('updated_at', { ascending: false })
      .limit(10);

    if (templates && templates.forEach) {
      templates.forEach(template => {
        const isNew = new Date(template.created_at).getTime() === new Date(template.updated_at).getTime();
        activities.push({
          id: `template-${template.id}`,
          type: 'template',
          title: isNew ? 'New template created' : 'Template updated',
          description: template.name,
          status: template.status,
          timestamp: template.updated_at,
          metadata: {
            template_id: template.id,
            template_name: template.name,
            is_new: isNew
          }
        });
      });
    }

    // Sort all activities by timestamp (use numeric getTime to avoid type complaints)
    activities.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    // Apply filtering
    let filteredActivities = activities;
    if (type) {
      filteredActivities = activities.filter(activity => activity.type === type);
    }

    // Apply pagination
    const offsetNum = require('./utils/parse-number').parseNumber(offset, 0);
    const limitNum = require('./utils/parse-number').parseNumber(limit, 50);
    const paginatedActivities = filteredActivities.slice(offsetNum, offsetNum + limitNum);

    res.json({
      activities: paginatedActivities,
      total: filteredActivities.length,
      limit: limitNum,
      offset: offsetNum
    });

  } catch (error) {
    console.error('Error fetching activity feed:', error);
    res.status(500).json({ error: error.message });
  }
});

// System alerts
app.get('/api/alerts', async (req, res) => {
  try {
    const { resolved = false, severity, limit = 20, offset = 0 } = req.query;

    // Get system alerts from database (if table exists)
    let systemAlerts = [];
    try {
      const { data, error } = await supabase
        .from('system_alerts')
        .select('*')
        .eq('resolved', resolved === 'true')
        .order('created_at', { ascending: false })
        .limit(require('./utils/parse-number').parseNumber(limit));

      if (!error) {
        systemAlerts = data || [];
      }
    } catch (dbError) {
      console.log('System alerts table not found, generating synthetic alerts');
    }

    // Generate alerts from system analysis
    const generatedAlerts = [];

    // Check for recent job failures
    const { data: recentFailures } = await supabase
      .from('scraping_executions')
      .select('id, error_message, created_at, template_name')
      .eq('status', 'failed')
      .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
      .limit(5);

    recentFailures?.forEach(failure => {
      generatedAlerts.push({
        id: `failure-${failure.id}`,
        type: 'error',
        severity: 'high',
        title: 'Scraping Job Failed',
        message: `Template "${failure.template_name}": ${failure.error_message}`,
        created_at: failure.created_at,
        resolved: false,
        source: 'Scraper',
        metadata: {
          execution_id: failure.id,
          template_name: failure.template_name
        }
      });
    });

    // Check proxy health
    const { data: proxies } = await supabase
      .from('proxy_list')
      .select('id, url, status, success_rate, last_used');

    const failedProxies = proxies?.filter(p => 
      p.status === 'failed' || p.success_rate < 0.5
    ) || [];

    if (failedProxies.length > 0) {
      generatedAlerts.push({
        id: 'proxy-health',
        type: 'warning',
        severity: 'medium',
        title: 'Proxy Health Issues',
        message: `${failedProxies.length} proxies are failing or have low success rates`,
        created_at: new Date().toISOString(),
        resolved: false,
        source: 'Proxy Manager',
        metadata: {
          failed_proxies: failedProxies.length,
          proxy_details: failedProxies.map(p => ({
            url: p.url,
            success_rate: p.success_rate
          }))
        }
      });
    }

    // Check queue backlog
    try {
      const queueStats = await distributedOrchestrator.getQueueStats();
      const totalPending = Object.values(queueStats).reduce((acc, queue) => acc + (queue.waiting || 0), 0);
      
      if (totalPending > 100) {
        generatedAlerts.push({
          id: 'queue-backlog',
          type: 'warning',
          severity: 'medium',
          title: 'Job Queue Backlog',
          message: `${totalPending} jobs are pending execution`,
          created_at: new Date().toISOString(),
          resolved: false,
          source: 'Job Queue',
          metadata: {
            pending_jobs: totalPending,
            queue_stats: queueStats
          }
        });
      }
    } catch (queueError) {
      console.log('Could not get queue stats for alerts:', queueError.message);
    }

    // Combine system and generated alerts
    const allAlerts = [...systemAlerts, ...generatedAlerts];

    // Apply severity filter
    let filteredAlerts = allAlerts;
    if (severity) {
      filteredAlerts = allAlerts.filter(alert => alert.severity === severity);
    }

    // Sort by creation date (use numeric getTime())
    filteredAlerts.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    // Apply pagination
    const offsetNumAlerts = require('./utils/parse-number').parseNumber(offset, 0);
    const limitNumAlerts = require('./utils/parse-number').parseNumber(limit, 50);
    const paginatedAlerts = filteredAlerts.slice(offsetNumAlerts, offsetNumAlerts + limitNumAlerts);

    res.json({
      alerts: paginatedAlerts,
      total: filteredAlerts.length,
      limit: limitNumAlerts,
      offset: offsetNumAlerts,
      summary: {
        critical: filteredAlerts.filter(a => a.severity === 'critical').length,
        high: filteredAlerts.filter(a => a.severity === 'high').length,
        medium: filteredAlerts.filter(a => a.severity === 'medium').length,
        low: filteredAlerts.filter(a => a.severity === 'low').length
      }
    });

  } catch (error) {
    console.error('Error fetching alerts:', error);
    res.status(500).json({ error: error.message });
  }
});

// Dashboard metrics endpoint
app.get('/api/dashboard/metrics', async (req, res) => {
  try {
    const { days = 1 } = req.query;
    const startDate = new Date(Date.now() - Number(days) * 24 * 60 * 60 * 1000).toISOString();

    // Get execution metrics
    const { data: executions } = await supabase
      .from('scraping_executions')
      .select('status, execution_time_ms, records_scraped, created_at')
      .gte('created_at', startDate);

    const totalJobs = executions ? executions.length : 0;
    const completedJobs = executions ? (executions.filter(e => e.status === 'completed').length) : 0;
    const failedJobs = executions ? (executions.filter(e => e.status === 'failed').length) : 0;
    const runningJobs = executions ? (executions.filter(e => e.status === 'running').length) : 0;

    const successRate = totalJobs > 0 ? completedJobs / totalJobs : 0;
    
    const avgResponseTime = executions?.length > 0 
      ? executions.reduce((acc, e) => acc + (e.execution_time_ms || 0), 0) / executions.length / 1000
      : 0;

    const jobsPerHour = totalJobs / (Number(days) * 24);
    const totalRecords = executions?.reduce((acc, e) => acc + (e.records_scraped || 0), 0) || 0;

    // Get template and proxy counts
    const { data: templates } = await supabase
      .from('scraper_templates')
      .select('status');

    const { data: proxies } = await supabase
      .from('proxy_list')
      .select('status');

    const activeTemplates = templates?.filter(t => t.status === 'active').length || 0;
    const totalProxies = proxies?.length || 0;
    const activeProxies = proxies?.filter(p => p.status === 'active').length || 0;

    res.json({
      period: {
        days: Number(days),
        start_date: startDate,
        end_date: new Date().toISOString()
      },
      execution_metrics: {
        total_jobs: totalJobs,
        completed_jobs: completedJobs,
        failed_jobs: failedJobs,
        running_jobs: runningJobs,
        success_rate: successRate,
        avg_response_time: avgResponseTime,
        jobs_per_hour: jobsPerHour,
        total_records: totalRecords
      },
      system_metrics: {
        active_templates: activeTemplates,
        total_templates: templates?.length || 0,
        total_proxies: totalProxies,
        active_proxies: activeProxies,
        proxy_success_rate: totalProxies > 0 ? activeProxies / totalProxies : 0
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error fetching dashboard metrics:', error);
    res.status(500).json({ error: error.message });
  }
});

// System Status API
app.get('/api/system/status', async (req, res) => {
  try {
    const queueStats = await distributedOrchestrator.getQueueStats();
    const proxyStats = await proxyManager.getProxyStats();
    
    // Get recent execution stats
    const { data: recentExecutions } = await supabase
      .from('scraping_executions')
      .select('status')
      .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());

    const executionStats = {
      total: recentExecutions?.length || 0,
      completed: recentExecutions?.filter(e => e.status === 'completed').length || 0,
      failed: recentExecutions?.filter(e => e.status === 'failed').length || 0,
      running: recentExecutions?.filter(e => e.status === 'running').length || 0
    };

    res.json({
      timestamp: new Date().toISOString(),
      queues: queueStats,
      proxies: proxyStats,
      executions_24h: executionStats,
      services: {
        orchestrator: distributedOrchestrator.isInitialized,
        proxy_manager: proxyManager.isInitialized,
        captcha_handler: true,
        data_processor: true
      }
    });

  } catch (error) {
    console.error('Error getting system status:', error);
    res.status(500).json({ error: error.message });
  }
});

// Background analysis function
async function analyzeTrainingSession(sessionId, recordingData) {
  try {
    console.log(`ðŸ” Starting analysis for session ${sessionId}`);

    // Analyze with visual analysis engine
    const analysis = await visualAnalysisEngine.analyzeRecordingSession(recordingData);

    // Update session with analysis results
    await supabase
      .from('training_sessions')
      .update({
        status: 'analyzed',
        recording_data: {
          ...recordingData,
          analysis: analysis,
          analyzedAt: new Date().toISOString()
        }
      })
      .eq('id', sessionId);

    console.log(`âœ… Analysis completed for session ${sessionId}`);

    // Log analysis summary
    const summary = {
      interactiveElements: analysis.interactiveElements?.length || 0,
      dataFields: analysis.dataFields?.length || 0,
      patterns: analysis.patterns?.length || 0,
      confidence: analysis.confidence
    };

    console.log(`ðŸ“Š Analysis summary for session ${sessionId}:`, summary);

  } catch (error) {
    console.error(`âŒ Analysis failed for session ${sessionId}:`, error);

    // Update session to reflect analysis failure
    await supabase
      .from('training_sessions')
      .update({
        status: 'analysis_failed',
        recording_data: {
          ...recordingData,
          analysisError: error.message,
          failedAt: new Date().toISOString()
        }
      })
      .eq('id', sessionId);
  }
}

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Start server only when run directly; export app for tests
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`ðŸš€ APL AI Scraper 2.0 Server running on port ${PORT}`);
    console.log(`ðŸ“Š Health check: http://localhost:${PORT}/health`);
  });
}

module.exports = app;