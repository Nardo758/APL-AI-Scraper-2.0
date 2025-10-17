// APL AI Scraper 2.0 - Browser Extension Background Script
class BackgroundService {
  constructor() {
    this.init();
  }

  init() {
    this.setupInstallListener();
    this.setupTabListeners();
    this.setupMessageListener();
    this.setupContextMenu();
    console.log('ðŸ”§ Background service initialized');
  }

  setupInstallListener() {
    chrome.runtime.onInstalled.addListener((details) => {
      console.log('ðŸŽ‰ APL AI Scraper Recorder installed');
      
      // Set default settings
      chrome.storage.sync.set({
        serverUrl: 'http://localhost:3000',
        projectId: '',
        autoScreenshot: false,
        recordingEnabled: true
      });

      // Show welcome notification
      if (details.reason === 'install') {
        this.showWelcomeNotification();
      }
    });
  }

  setupTabListeners() {
    // Listen for tab updates to inject content script if needed
    chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
      if (changeInfo.status === 'complete' && tab.url && 
          (tab.url.startsWith('http://') || tab.url.startsWith('https://'))) {
        
        // Inject content script into new pages
        this.injectContentScript(tabId);
      }
    });
  }

  setupMessageListener() {
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      switch (request.action) {
      case 'saveRecording':
        this.saveRecording(request.data)
          .then(() => sendResponse({ success: true }))
          .catch(error => sendResponse({ success: false, error: error.message }));
        return true; // Indicates async response

      case 'getSettings':
        chrome.storage.sync.get(['serverUrl', 'projectId'], (result) => {
          sendResponse(result);
        });
        return true;

      case 'updateSettings':
        chrome.storage.sync.set(request.settings, () => {
          sendResponse({ success: true });
        });
        return true;

      case 'showNotification':
        this.showNotification(request.title, request.message, request.type);
        sendResponse({ success: true });
        break;

      default:
        console.log('Unknown message action:', request.action);
      }
    });
  }

  setupContextMenu() {
    // Add context menu items for easy access
    chrome.contextMenus.create({
      id: 'apl-start-recording',
      title: 'Start APL Recording',
      contexts: ['page']
    });

    chrome.contextMenus.create({
      id: 'apl-take-screenshot',
      title: 'Take Screenshot',
      contexts: ['page']
    });

    chrome.contextMenus.onClicked.addListener((info, tab) => {
      switch (info.menuItemId) {
      case 'apl-start-recording':
        this.sendMessageToTab(tab.id, { action: 'startRecording' });
        break;
      case 'apl-take-screenshot':
        this.sendMessageToTab(tab.id, { action: 'takeScreenshot' });
        break;
      }
    });
  }

  async injectContentScript(tabId) {
    try {
      // Check if content script is already injected
      const response = await chrome.tabs.sendMessage(tabId, { action: 'ping' });
      if (response && response.pong) {
        return; // Already injected
      }
    } catch (error) {
      // Content script not injected, proceed with injection
    }

    try {
      await chrome.scripting.executeScript({
        target: { tabId: tabId },
        files: ['libs/html2canvas.min.js', 'content-script.js']
      });

      await chrome.scripting.insertCSS({
        target: { tabId: tabId },
        files: ['recorder-ui.css']
      });

      console.log(`âœ… Content script injected into tab ${tabId}`);
    } catch (error) {
      console.error(`âŒ Failed to inject content script into tab ${tabId}:`, error);
    }
  }

  async sendMessageToTab(tabId, message) {
    try {
      await chrome.tabs.sendMessage(tabId, message);
    } catch (error) {
      console.error('Failed to send message to tab:', error);
      // Try injecting content script first
      await this.injectContentScript(tabId);
      
      // Wait a moment and try again
      setTimeout(async () => {
        try {
          await chrome.tabs.sendMessage(tabId, message);
        } catch (retryError) {
          console.error('Failed to send message after injection:', retryError);
        }
      }, 1000);
    }
  }

  async saveRecording(recordingData) {
    try {
      const settings = await chrome.storage.sync.get(['serverUrl']);
      const serverUrl = settings.serverUrl || 'http://localhost:3000';

      const response = await fetch(`${serverUrl}/api/training-sessions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(recordingData)
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const result = await response.json();
      
      // Store session info locally
      await chrome.storage.local.set({
        lastSessionId: result.id,
        lastSessionTime: Date.now()
      });

      this.showNotification(
        'Recording Saved',
        'Your browsing session has been saved successfully!',
        'success'
      );

      return result;
    } catch (error) {
      console.error('Failed to save recording:', error);
      
      this.showNotification(
        'Save Failed',
        `Failed to save recording: ${error.message}`,
        'error'
      );
      
      throw error;
    }
  }

  showWelcomeNotification() {
    this.showNotification(
      'APL AI Scraper Installed',
      'Click the extension icon to start recording your browsing sessions!',
      'info'
    );
  }

  showNotification(title, message, type = 'info') {
    // Create notification ID
    const notificationId = `apl-${Date.now()}`;
    
    const iconUrl = this.getIconForType(type);

    chrome.notifications.create(notificationId, {
      type: 'basic',
      iconUrl: iconUrl,
      title: title,
      message: message,
      priority: 1
    });

    // Auto-clear notification after 5 seconds
    setTimeout(() => {
      chrome.notifications.clear(notificationId);
    }, 5000);
  }

  getIconForType(type) {
    switch (type) {
    case 'success':
      return 'icons/icon-success-48.png';
    case 'error':
      return 'icons/icon-error-48.png';
    case 'warning':
      return 'icons/icon-warning-48.png';
    default:
      return 'icons/icon-48.png';
    }
  }
}

// Initialize background service
const backgroundService = new BackgroundService();
void backgroundService;