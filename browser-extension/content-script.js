// APL AI Scraper 2.0 - Browser Extension Content Script
class RecordingSession {
  constructor() {
    this.isRecording = false;
    this.recordedActions = [];
    this.startTime = null;
    this.screenshots = [];
    this.currentProject = null;
    this.serverUrl = 'http://localhost:3000';
    this.init();
  }

  async init() {
    await this.loadSettings();
    this.injectRecorderUI();
    this.setupEventListeners();
    this.setupMessageListener();
    console.log('ðŸŽ¬ APL AI Scraper Recorder initialized');
  }

  async loadSettings() {
    try {
      const result = await chrome.storage.sync.get(['serverUrl', 'projectId']);
      if (result.serverUrl) this.serverUrl = result.serverUrl;
      if (result.projectId) this.currentProject = result.projectId;
    } catch (error) {
      console.warn('Failed to load settings:', error);
    }
  }

  injectRecorderUI() {
    // Remove existing overlay if present
    const existingOverlay = document.getElementById('apl-scraper-recorder-overlay');
    if (existingOverlay) {
      existingOverlay.remove();
    }

    const overlay = document.createElement('div');
    overlay.id = 'apl-scraper-recorder-overlay';
    overlay.className = 'apl-recorder-overlay';
    overlay.innerHTML = `
      <div class="apl-recorder-panel">
        <div class="apl-recorder-header">
          <span class="apl-recorder-logo">ðŸ¤–</span>
          <span class="apl-recorder-title">APL AI Scraper</span>
          <button class="apl-recorder-minimize" title="Minimize">âˆ’</button>
        </div>
        <div class="apl-recorder-content">
          <div class="apl-recorder-status">
            <span id="apl-recording-status" class="status-indicator">âš« Not Recording</span>
          </div>
          <div class="apl-recorder-controls">
            <button id="apl-start-recording" class="apl-btn apl-btn-start">
              ðŸ”´ Start Recording
            </button>
            <button id="apl-stop-recording" class="apl-btn apl-btn-stop" disabled>
              â¹ï¸ Stop Recording
            </button>
            <button id="apl-take-screenshot" class="apl-btn apl-btn-screenshot">
              ðŸ“¸ Screenshot
            </button>
          </div>
          <div class="apl-recorder-info">
            <div class="info-item">
              <span class="info-label">Actions:</span>
              <span id="apl-action-count">0</span>
            </div>
            <div class="info-item">
              <span class="info-label">Screenshots:</span>
              <span id="apl-screenshot-count">0</span>
            </div>
            <div class="info-item">
              <span class="info-label">Duration:</span>
              <span id="apl-duration">00:00</span>
            </div>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);
    this.attachEventListeners();
    this.makeOverlayDraggable();
  }

  attachEventListeners() {
    const startBtn = document.getElementById('apl-start-recording');
    const stopBtn = document.getElementById('apl-stop-recording');
    const screenshotBtn = document.getElementById('apl-take-screenshot');
    const minimizeBtn = document.querySelector('.apl-recorder-minimize');

    startBtn?.addEventListener('click', () => this.startRecording());
    stopBtn?.addEventListener('click', () => this.stopRecording());
    screenshotBtn?.addEventListener('click', () => this.captureScreenshot());
    minimizeBtn?.addEventListener('click', () => this.toggleMinimize());
  }

  makeOverlayDraggable() {
    const header = document.querySelector('.apl-recorder-header');
    const overlay = document.getElementById('apl-scraper-recorder-overlay');
    let isDragging = false;
    let dragOffset = { x: 0, y: 0 };

    header?.addEventListener('mousedown', (e) => {
      isDragging = true;
      dragOffset.x = e.clientX - overlay.offsetLeft;
      dragOffset.y = e.clientY - overlay.offsetTop;
      overlay.style.cursor = 'grabbing';
    });

    document.addEventListener('mousemove', (e) => {
      if (!isDragging) return;
      
      const newX = e.clientX - dragOffset.x;
      const newY = e.clientY - dragOffset.y;
      
      overlay.style.left = `${Math.max(0, Math.min(newX, window.innerWidth - overlay.offsetWidth))}px`;
      overlay.style.top = `${Math.max(0, Math.min(newY, window.innerHeight - overlay.offsetHeight))}px`;
    });

    document.addEventListener('mouseup', () => {
      isDragging = false;
      overlay.style.cursor = 'default';
    });
  }

  toggleMinimize() {
    const content = document.querySelector('.apl-recorder-content');
    const overlay = document.getElementById('apl-scraper-recorder-overlay');
    
    if (content.style.display === 'none') {
      content.style.display = 'block';
      overlay.classList.remove('minimized');
    } else {
      content.style.display = 'none';
      overlay.classList.add('minimized');
    }
  }

  async startRecording() {
    this.isRecording = true;
    this.startTime = Date.now();
    this.recordedActions = [];
    this.screenshots = [];
    
    this.updateUI({
      status: 'ðŸ”´ Recording...',
      startDisabled: true,
      stopDisabled: false
    });

    this.startDurationTimer();
    await this.captureInitialState();
    
    console.log('ðŸŽ¬ Recording started');
  }

  async stopRecording() {
    this.isRecording = false;
    
    this.updateUI({
      status: 'â³ Processing...',
      startDisabled: false,
      stopDisabled: true
    });

    clearInterval(this.durationTimer);
    
    try {
      await this.saveRecordingSession();
      this.updateUI({
        status: 'âœ… Recording Saved',
        startDisabled: false,
        stopDisabled: true
      });
    } catch (error) {
      console.error('Failed to save recording:', error);
      this.updateUI({
        status: 'âŒ Save Failed',
        startDisabled: false,
        stopDisabled: true
      });
    }
    
    console.log('â¹ï¸ Recording stopped');
  }

  updateUI(options) {
    const statusEl = document.getElementById('apl-recording-status');
    const startBtn = document.getElementById('apl-start-recording');
    const stopBtn = document.getElementById('apl-stop-recording');
    const actionCount = document.getElementById('apl-action-count');
    const screenshotCount = document.getElementById('apl-screenshot-count');

    if (options.status && statusEl) statusEl.textContent = options.status;
    if (startBtn) startBtn.disabled = options.startDisabled;
    if (stopBtn) stopBtn.disabled = options.stopDisabled;
    if (actionCount) actionCount.textContent = this.recordedActions.length;
    if (screenshotCount) screenshotCount.textContent = this.screenshots.length;
  }

  startDurationTimer() {
    this.durationTimer = setInterval(() => {
      const duration = Math.floor((Date.now() - this.startTime) / 1000);
      const minutes = Math.floor(duration / 60).toString().padStart(2, '0');
      const seconds = (duration % 60).toString().padStart(2, '0');
      
      const durationEl = document.getElementById('apl-duration');
      if (durationEl) durationEl.textContent = `${minutes}:${seconds}`;
    }, 1000);
  }

  setupEventListeners() {
    // Track clicks with detailed information
    document.addEventListener('click', (e) => {
      if (!this.isRecording || this.isRecorderElement(e.target)) return;

      const action = {
        type: 'click',
        timestamp: Date.now() - this.startTime,
        target: this.getElementSelector(e.target),
        position: { x: e.clientX, y: e.clientY },
        url: window.location.href,
        viewport: { width: window.innerWidth, height: window.innerHeight },
        elementInfo: this.getElementInfo(e.target),
        pageContext: this.getPageContext()
      };

      this.recordedActions.push(action);
      this.updateUI({});
      console.log('ðŸ‘† Click recorded:', action.target);
    });

    // Track form inputs
    document.addEventListener('input', (e) => {
      if (!this.isRecording || this.isRecorderElement(e.target)) return;

      const action = {
        type: 'input',
        timestamp: Date.now() - this.startTime,
        target: this.getElementSelector(e.target),
        value: e.target.value,
        inputType: e.target.type || 'text',
        placeholder: e.target.placeholder || '',
        url: window.location.href,
        elementInfo: this.getElementInfo(e.target)
      };

      this.recordedActions.push(action);
      this.updateUI({});
      console.log('âŒ¨ï¸ Input recorded:', action.target);
    });

    // Track form submissions
    document.addEventListener('submit', (e) => {
      if (!this.isRecording) return;

      const action = {
        type: 'submit',
        timestamp: Date.now() - this.startTime,
        target: this.getElementSelector(e.target),
        url: window.location.href,
        formData: this.getFormData(e.target)
      };

      this.recordedActions.push(action);
      this.updateUI({});
      console.log('ðŸ“¤ Form submission recorded');
    });

    // Track scrolling with throttling
    let scrollTimeout;
    window.addEventListener('scroll', () => {
      if (!this.isRecording) return;

      clearTimeout(scrollTimeout);
      scrollTimeout = setTimeout(() => {
        const action = {
          type: 'scroll',
          timestamp: Date.now() - this.startTime,
          position: { x: window.scrollX, y: window.scrollY },
          url: window.location.href,
          viewport: { width: window.innerWidth, height: window.innerHeight }
        };

        this.recordedActions.push(action);
        this.updateUI({});
      }, 200);
    });

    // Track navigation changes
    this.setupNavigationTracking();
  }

  setupNavigationTracking() {
    let lastUrl = window.location.href;
    
    const checkUrlChange = () => {
      if (window.location.href !== lastUrl) {
        if (this.isRecording) {
          const action = {
            type: 'navigation',
            timestamp: Date.now() - this.startTime,
            from: lastUrl,
            to: window.location.href,
            trigger: 'url_change'
          };
          
          this.recordedActions.push(action);
          this.updateUI({});
          console.log('ðŸ§­ Navigation recorded:', action.to);
        }
        lastUrl = window.location.href;
      }
    };

    // Check for URL changes periodically
    setInterval(checkUrlChange, 500);

    // Also listen for popstate events
    window.addEventListener('popstate', checkUrlChange);
  }

  setupMessageListener() {
    // Listen for messages from popup or background script
    chrome.runtime?.onMessage?.addListener((request, sender, sendResponse) => {
      switch (request.action) {
      case 'startRecording':
        this.startRecording();
        sendResponse({ success: true });
        break;
      case 'stopRecording':
        this.stopRecording();
        sendResponse({ success: true });
        break;
      case 'takeScreenshot':
        this.captureScreenshot();
        sendResponse({ success: true });
        break;
      case 'getStatus':
        sendResponse({
          isRecording: this.isRecording,
          actionCount: this.recordedActions.length,
          screenshotCount: this.screenshots.length
        });
        break;
      }
    });
  }

  isRecorderElement(element) {
    return element.closest('#apl-scraper-recorder-overlay') !== null;
  }

  getElementSelector(element) {
    const path = [];
    let current = element;
    
    while (current && current.nodeType === Node.ELEMENT_NODE) {
      let selector = current.nodeName.toLowerCase();
      
      // Use ID if available
      if (current.id) {
        selector += `#${current.id}`;
        path.unshift(selector);
        break;
      }
      
      // Use class names if available
      if (current.className && typeof current.className === 'string') {
        const classes = current.className.trim().split(/\s+/);
        if (classes.length > 0 && classes[0]) {
          selector += `.${classes[0]}`;
        }
      }
      
      // Add nth-child for specificity
      let sibling = current;
      let siblingCount = 1;
      
      while (sibling.previousElementSibling) {
        sibling = sibling.previousElementSibling;
        if (sibling.nodeName === current.nodeName) {
          siblingCount++;
        }
      }
      
      if (siblingCount > 1 || current.parentNode?.children.length > 1) {
        selector += `:nth-child(${siblingCount})`;
      }
      
      path.unshift(selector);
      current = current.parentNode;
      
      // Limit depth to prevent overly long selectors
      if (path.length >= 5) break;
    }
    
    return path.join(' > ');
  }

  getElementInfo(element) {
    return {
      tagName: element.tagName?.toLowerCase(),
      type: element.type || null,
      className: element.className || '',
      textContent: element.textContent?.trim().substring(0, 100) || '',
      attributes: this.getElementAttributes(element),
      boundingRect: element.getBoundingClientRect(),
      isVisible: this.isElementVisible(element)
    };
  }

  getElementAttributes(element) {
    const attrs = {};
    for (const attr of element.attributes || []) {
      attrs[attr.name] = attr.value;
    }
    return attrs;
  }

  isElementVisible(element) {
    const rect = element.getBoundingClientRect();
    const style = window.getComputedStyle(element);
    
    return (
      rect.width > 0 &&
      rect.height > 0 &&
      style.visibility !== 'hidden' &&
      style.display !== 'none' &&
      style.opacity !== '0'
    );
  }

  getPageContext() {
    return {
      title: document.title,
      url: window.location.href,
      viewport: { width: window.innerWidth, height: window.innerHeight },
      scrollPosition: { x: window.scrollX, y: window.scrollY },
      timestamp: Date.now()
    };
  }

  getFormData(form) {
    const formData = {};
    const elements = form.elements;
    
    for (let i = 0; i < elements.length; i++) {
      const element = elements[i];
      if (element.name && element.value) {
        formData[element.name] = element.value;
      }
    }
    
    return formData;
  }

  async captureScreenshot() {
    if (!window.html2canvas) {
      console.error('html2canvas library not loaded');
      return;
    }

    try {
      console.log('ðŸ“¸ Capturing screenshot...');
      
      const canvas = await html2canvas(document.body, {
        height: window.innerHeight,
        width: window.innerWidth,
        scrollX: 0,
        scrollY: 0,
        useCORS: true,
        allowTaint: true,
        scale: 0.5 // Reduce size for faster processing
      });
      
      const screenshotData = canvas.toDataURL('image/jpeg', 0.8);
      
      const screenshot = {
        timestamp: this.isRecording ? Date.now() - this.startTime : Date.now(),
        data: screenshotData,
        url: window.location.href,
        viewport: { width: window.innerWidth, height: window.innerHeight },
        scrollPosition: { x: window.scrollX, y: window.scrollY },
        pageTitle: document.title
      };

      this.screenshots.push(screenshot);
      this.updateUI({});
      
      if (this.isRecording) {
        this.recordedActions.push({
          type: 'screenshot',
          timestamp: screenshot.timestamp,
          screenshotIndex: this.screenshots.length - 1
        });
      }

      this.showScreenshotPreview(screenshotData);
      console.log('âœ… Screenshot captured');
      
    } catch (error) {
      console.error('âŒ Screenshot capture failed:', error);
    }
  }

  async captureInitialState() {
    const initialState = {
      url: window.location.href,
      title: document.title,
      html: document.documentElement.outerHTML.substring(0, 50000), // Limit size
      timestamp: 0,
      viewport: { width: window.innerWidth, height: window.innerHeight },
      userAgent: navigator.userAgent,
      cookies: document.cookie
    };

    this.recordedActions.push({
      type: 'initial_state',
      timestamp: 0,
      data: initialState
    });

    // Capture initial screenshot
    await this.captureScreenshot();
  }

  showScreenshotPreview(dataUrl) {
    const preview = document.createElement('div');
    preview.className = 'apl-screenshot-preview';
    preview.innerHTML = `
      <div class="preview-content">
        <div class="preview-header">
          <span>ðŸ“¸ Screenshot Captured</span>
          <button class="preview-close" onclick="this.closest('.apl-screenshot-preview').remove()">Ã—</button>
        </div>
        <img src="${dataUrl}" style="max-width: 300px; max-height: 200px; border-radius: 4px;">
        <div class="preview-footer">
          <small>Screenshot saved to session</small>
        </div>
      </div>
    `;
    
    document.body.appendChild(preview);
    
    // Auto-remove after 3 seconds
    setTimeout(() => {
      if (preview.parentNode) {
        preview.remove();
      }
    }, 3000);
  }

  async saveRecordingSession() {
    const sessionData = {
      project_id: this.currentProject,
      recording_data: {
        actions: this.recordedActions,
        screenshots: this.screenshots,
        metadata: {
          duration: Date.now() - this.startTime,
          startTime: new Date(this.startTime).toISOString(),
          endTime: new Date().toISOString(),
          userAgent: navigator.userAgent,
          url: window.location.href,
          title: document.title,
          actionCount: this.recordedActions.length,
          screenshotCount: this.screenshots.length
        }
      }
    };

    console.log('ðŸ’¾ Saving recording session...');
    
    try {
      const response = await fetch(`${this.serverUrl}/api/training-sessions`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify(sessionData)
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const result = await response.json();
      console.log('âœ… Recording saved successfully:', result.id);
      
      // Store session ID for future reference
      await chrome.storage.local.set({
        lastSessionId: result.id,
        lastSessionData: sessionData.metadata
      });

      this.showSaveSuccessMessage(result.id);
      
    } catch (error) {
      console.error('âŒ Failed to save recording:', error);
      this.showSaveErrorMessage(error.message);
      throw error;
    }
  }

  showSaveSuccessMessage(sessionId) {
    const message = document.createElement('div');
    message.className = 'apl-save-message apl-save-success';
    message.innerHTML = `
      <div class="message-content">
        <span class="message-icon">âœ…</span>
        <span class="message-text">Recording saved successfully!</span>
        <span class="message-id">Session ID: ${sessionId.substring(0, 8)}...</span>
        <button class="message-close" onclick="this.parentElement.parentElement.remove()">Ã—</button>
      </div>
    `;
    
    document.body.appendChild(message);
    setTimeout(() => message.remove(), 5000);
  }

  showSaveErrorMessage(error) {
    const message = document.createElement('div');
    message.className = 'apl-save-message apl-save-error';
    message.innerHTML = `
      <div class="message-content">
        <span class="message-icon">âŒ</span>
        <span class="message-text">Failed to save recording</span>
        <span class="message-error">${error}</span>
        <button class="message-close" onclick="this.parentElement.parentElement.remove()">Ã—</button>
      </div>
    `;
    
    document.body.appendChild(message);
    setTimeout(() => message.remove(), 8000);
  }
}

// Initialize recorder when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    new RecordingSession();
  });
} else {
  new RecordingSession();
}