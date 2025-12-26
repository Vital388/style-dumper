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

  if (request.action === 'captureFullPage') {
    captureFullPage(request.tabId)
      .then(dataUrl => sendResponse({ dataUrl }))
      .catch(error => sendResponse({ error: error.message }));
    return true;
  }
});

// Capture full page screenshot using Chrome Debugger API
// Same approach as Chrome DevTools "Capture full size screenshot"
async function captureFullPage(tabId) {
  const debuggee = { tabId };
  
  try {
    // Attach debugger
    await new Promise((resolve, reject) => {
      chrome.debugger.attach(debuggee, '1.3', () => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve();
        }
      });
    });

    // Enable Page domain (required for layout metrics)
    await sendDebuggerCommand(debuggee, 'Page.enable');

    // Store original scroll position
    const originalScroll = await sendDebuggerCommand(debuggee, 'Runtime.evaluate', {
      expression: '({ x: window.scrollX, y: window.scrollY })',
      returnByValue: true
    });

    // Scroll to top-left corner first for consistent capture
    await sendDebuggerCommand(debuggee, 'Runtime.evaluate', {
      expression: 'window.scrollTo(0, 0)',
      awaitPromise: false
    });

    // Small delay to let scroll complete
    await new Promise(r => setTimeout(r, 100));

    // Get page layout metrics to determine full page size
    const layoutMetrics = await sendDebuggerCommand(debuggee, 'Page.getLayoutMetrics');
    
    // Use cssContentSize for accurate dimensions
    const contentWidth = Math.ceil(layoutMetrics.cssContentSize.width);
    const contentHeight = Math.ceil(layoutMetrics.cssContentSize.height);

    // Force the viewport to match the full content size
    // Include screenWidth/screenHeight to ensure proper rendering
    await sendDebuggerCommand(debuggee, 'Emulation.setDeviceMetricsOverride', {
      width: contentWidth,
      height: contentHeight,
      deviceScaleFactor: 1,
      mobile: false,
      screenWidth: contentWidth,
      screenHeight: contentHeight
    });

    // Force a layout/repaint cycle using requestAnimationFrame
    // This ensures Chrome actually renders the full page before capture
    await sendDebuggerCommand(debuggee, 'Runtime.evaluate', {
      expression: `new Promise(resolve => {
        requestAnimationFrame(() => {
          requestAnimationFrame(resolve);
        });
      })`,
      awaitPromise: true
    });

    // Additional wait for rendering to complete (critical for complex pages)
    await new Promise(r => setTimeout(r, 300));

    // Capture the screenshot with fromSurface for proper capture
    const result = await sendDebuggerCommand(debuggee, 'Page.captureScreenshot', {
      format: 'png',
      captureBeyondViewport: true,
      fromSurface: true
    });

    // Reset the viewport
    await sendDebuggerCommand(debuggee, 'Emulation.clearDeviceMetricsOverride');

    // Restore original scroll position
    if (originalScroll.result && originalScroll.result.value) {
      const { x, y } = originalScroll.result.value;
      await sendDebuggerCommand(debuggee, 'Runtime.evaluate', {
        expression: `window.scrollTo(${x}, ${y})`,
        awaitPromise: false
      });
    }

    // Detach debugger
    await new Promise((resolve) => {
      chrome.debugger.detach(debuggee, resolve);
    });

    return 'data:image/png;base64,' + result.data;

  } catch (error) {
    // Make sure to detach debugger on error
    try {
      await sendDebuggerCommand(debuggee, 'Emulation.clearDeviceMetricsOverride').catch(() => {});
      await new Promise((resolve) => {
        chrome.debugger.detach(debuggee, resolve);
      });
    } catch (e) {
      // Ignore detach errors
    }
    throw error;
  }
}

function sendDebuggerCommand(debuggee, method, params = {}) {
  return new Promise((resolve, reject) => {
    chrome.debugger.sendCommand(debuggee, method, params, (result) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve(result);
      }
    });
  });
}
