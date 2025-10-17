// APL AI Scraper 2.0 - Browser Extension Popup Script
class PopupController {
  constructor() {
    this.currentTab = null;
    this.init();
  }

  async init() {
    await this.getCurrentTab();
    await this.loadSettings();
    this.setupEventListeners();
    await this.updateStatus();
    console.log('ðŸŽ® Popup controller initialized');
  }

  async getCurrentTab() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      this.currentTab = tab;
    } catch (error) {
      console.error('Failed to get current tab:', error);
    }
  }

  async loadSettings() {
    try {
      const result = await chrome.storage.sync.get(['serverUrl', 'projectId']);
      
      const serverUrlInput = document.getElementById('server-url');
      const projectIdInput = document.getElementById('project-id');
      
      if (serverUrlInput) {
        serverUrlInput.value = result.serverUrl || 'http://localhost:3000';
      }
      
      if (projectIdInput) {
        projectIdInput.value = result.projectId || '';
      }
    } catch (error) {
      console.error('Failed to load settings:', error);
    }
  }

  setupEventListeners() {
    // Control buttons
    const startBtn = document.getElementById('start-btn');
    const stopBtn = document.getElementById('stop-btn');
    const screenshotBtn = document.getElementById('screenshot-btn');
    const saveSettingsBtn = document.getElementById('save-settings-btn');

    startBtn?.addEventListener('click', () => this.startRecording());
    stopBtn?.addEventListener('click', () => this.stopRecording());
    screenshotBtn?.addEventListener('click', () => this.takeScreenshot());
    saveSettingsBtn?.addEventListener('click', () => this.saveSettings());

    // Auto-save settings on input change
    const serverUrlInput = document.getElementById('server-url');
    const projectIdInput = document.getElementById('project-id');

    serverUrlInput?.addEventListener('blur', () => this.saveSettings());
    projectIdInput?.addEventListener('blur', () => this.saveSettings());
  }

  async startRecording() {
    try {
      if (!this.currentTab) {
        this.showError('No active tab found');
        return;
      }

      // Send message to content script
      await chrome.tabs.sendMessage(this.currentTab.id, { 
        action: 'startRecording' 
      });

      // Update UI
      this.updateButtons(true);
      this.updateStatusText('ðŸ”´ Recording...', 'Recording user interactions');
      
      // Start polling for status updates
      this.startStatusPolling();

    } catch (error) {
      console.error('Failed to start recording:', error);
      this.showError('Failed to start recording. Make sure you\'re on a valid webpage.');
    }
  }

  async stopRecording() {
    try {
      if (!this.currentTab) {
        this.showError('No active tab found');
        return;
      }

      // Send message to content script
      await chrome.tabs.sendMessage(this.currentTab.id, { 
        action: 'stopRecording' 
      });

      // Update UI
      this.updateButtons(false);
      this.updateStatusText('â³ Processing...', 'Saving recording session');
      
      // Stop polling
      this.stopStatusPolling();

      // Update status after a delay to show completion
      setTimeout(() => {
        this.updateStatusText('âœ… Recording Complete', 'Session saved successfully');
      }, 2000);

    } catch (error) {
      console.error('Failed to stop recording:', error);
      this.showError('Failed to stop recording');
    }
  }

  async takeScreenshot() {
    try {
      if (!this.currentTab) {
        this.showError('No active tab found');
        return;
      }

      // Send message to content script
      await chrome.tabs.sendMessage(this.currentTab.id, { 
        action: 'takeScreenshot' 
      });

      // Show brief feedback
      const screenshotBtn = document.getElementById('screenshot-btn');
      if (screenshotBtn) {
        const originalText = screenshotBtn.textContent;
        screenshotBtn.textContent = 'âœ… Captured';
        setTimeout(() => {
          screenshotBtn.textContent = originalText;
        }, 1000);
      }

      await this.updateStatus();

    } catch (error) {
      console.error('Failed to take screenshot:', error);
      this.showError('Failed to take screenshot');
    }
  }

  async saveSettings() {
    try {
      const serverUrl = document.getElementById('server-url')?.value || 'http://localhost:3000';
      const projectId = document.getElementById('project-id')?.value || '';

      await chrome.storage.sync.set({
        serverUrl: serverUrl.trim(),
        projectId: projectId.trim()
      });

      // Show brief feedback
      const saveBtn = document.getElementById('save-settings-btn');
      if (saveBtn) {
        const originalText = saveBtn.textContent;
        saveBtn.textContent = 'âœ… Saved';
        setTimeout(() => {
          saveBtn.textContent = originalText;
        }, 1000);
      }

      console.log('Settings saved successfully');

    } catch (error) {
      console.error('Failed to save settings:', error);
      this.showError('Failed to save settings');
    }
  }

  async updateStatus() {
    try {
      if (!this.currentTab) return;

      const response = await chrome.tabs.sendMessage(this.currentTab.id, { 
        action: 'getStatus' 
      });

      if (response) {
        this.updateButtons(response.isRecording);
        this.updateCounts(response.actionCount || 0, response.screenshotCount || 0);
        
        if (response.isRecording) {
          this.updateStatusText('ðŸ”´ Recording...', 'Recording user interactions');
        } else {
          this.updateStatusText('âš« Not Recording', 'Ready to start recording');
        }
      }

    } catch (error) {
      // Content script might not be loaded yet
      console.log('Content script not available, using default status');
      this.updateButtons(false);
      this.updateCounts(0, 0);
      this.updateStatusText('âš« Not Recording', 'Ready to start recording');
    }
  }

  updateButtons(isRecording) {
    const startBtn = document.getElementById('start-btn');
    const stopBtn = document.getElementById('stop-btn');

    if (startBtn) startBtn.disabled = isRecording;
    if (stopBtn) stopBtn.disabled = !isRecording;
  }

  updateStatusText(status, details) {
    const statusText = document.getElementById('status-text');
    const statusDetails = document.getElementById('status-details');

    if (statusText) statusText.textContent = status;
    if (statusDetails) statusDetails.textContent = details;
  }

  updateCounts(actions, screenshots) {
    const actionCount = document.getElementById('action-count');
    const screenshotCount = document.getElementById('screenshot-count');

    if (actionCount) actionCount.textContent = actions;
    if (screenshotCount) screenshotCount.textContent = screenshots;
  }

  startStatusPolling() {
    this.statusInterval = setInterval(() => {
      this.updateStatus();
    }, 1000);
  }

  stopStatusPolling() {
    if (this.statusInterval) {
      clearInterval(this.statusInterval);
      this.statusInterval = null;
    }
  }

  showError(message) {
    this.updateStatusText('âŒ Error', message);
    console.error('Popup error:', message);
  }
}

// Initialize popup when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  new PopupController();
});

// Handle popup close
window.addEventListener('beforeunload', () => {
  if (window.popupController && window.popupController.statusInterval) {
    clearInterval(window.popupController.statusInterval);
  }
});