// Background service worker for Style Dumper extension
// Handles screenshot capture requests from DevTools panel

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'captureVisibleTab') {
    chrome.tabs.captureVisibleTab(null, { format: 'png' }, (dataUrl) => {
      if (chrome.runtime.lastError) {
        sendResponse({ error: chrome.runtime.lastError.message });
      } else {
        sendResponse({ dataUrl });
      }
    });
    return true; // Keep the message channel open for async response
  }
  
  if (request.action === 'captureElement') {
    // First capture the visible tab
    chrome.tabs.captureVisibleTab(null, { format: 'png' }, (dataUrl) => {
      if (chrome.runtime.lastError) {
        sendResponse({ error: chrome.runtime.lastError.message });
      } else {
        sendResponse({ 
          dataUrl,
          bounds: request.bounds,
          devicePixelRatio: request.devicePixelRatio
        });
      }
    });
    return true;
  }
});
