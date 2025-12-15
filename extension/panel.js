const $ = sel => {
  try {
    return document.querySelector(sel);
  } catch (e) {
    console.error("Invalid selector:", sel);
    return null;
  }
};

console.log('Panel script loaded');

// Wait for DOM to be ready
document.addEventListener('DOMContentLoaded', () => {
  console.log('DOM ready');
  console.log('Dump button found:', !!$('#dump'));
  console.log('Use$0 button found:', !!$('#use-dollar-zero'));
  console.log('Output element found:', !!$('#output'));
  
  // Attach event listeners after DOM is ready
  initializeEventListeners();
});

function pageEval(fn, arg) {
  return new Promise((resolve) => {
    const expr = `(${fn.toString()})(${JSON.stringify(arg)})`;
    chrome.devtools.inspectedWindow.eval(expr, (res, err) => {
      if (err && (err.isException || err.isError)) {
        console.warn('Eval error:', err);
        resolve({ error: err.description || (err.value && err.value.message) || 'Eval error' });
        return;
      }
      resolve(res);
    });
  });
}

// Inject SD helper once
pageEval(function(){
  if (!window.SD) {
    window.SD = {};
  }
});

async function ensureDumperSource() {
  try {
    // Bust extension cache so edits to dumper.js are picked up without reopening DevTools
    const url = chrome.runtime.getURL('dumper.js') + `?t=${Date.now()}`;
    const resp = await fetch(url, { cache: 'no-store' });
    return await resp.text();
  } catch (e) {
    console.error('Failed to load dumper.js', e);
    return null;
  }
}

async function runDump(params) {
  console.log('runDump called with params:', params);
  const dumperSrc = await ensureDumperSource();
  if (!dumperSrc) {
    return { error: 'Failed to load dumper source' };
  }
  const dumperInvocation = `\n;window.__STYLE_DUMPER__(${JSON.stringify(params)})`;
  const codeToEval = dumperSrc + dumperInvocation;
  return new Promise((resolve) => {
    console.log('About to eval dumper code');
    chrome.devtools.inspectedWindow.eval(codeToEval, (res, err) => {
      console.log('Eval completed. Result:', res, 'Error:', err);
      if (err && (err.isException || err.isError)) {
        console.warn('Exception:', err.value);
        console.warn('Error:', err.description);
        resolve({ error: err.description || (err.value && err.value.message) || 'Unknown eval error' });
        return;
      }
      resolve(res);
    });
  });
}

function initializeEventListeners() {
  console.log('Initializing event listeners');
  
  // Test basic eval functionality
  chrome.devtools.inspectedWindow.eval('2 + 2', (result, error) => {
    console.log('Basic eval test: 2 + 2 =', result, 'Error:', error);
  });

  // Handle target selection radio buttons
  document.querySelectorAll('input[name="target"]').forEach(radio => {
    radio.addEventListener('change', () => {
      const selectorInput = $('#selector');
      const pickerBtn = $('#picker');
      
      if (radio.value === 'selector') {
        selectorInput.focus();
      } else if (radio.value === 'picker') {
        pickerBtn.click();
      }
    });
  });

  // Extract button - main action
  $('#extract').addEventListener('click', async () => {
    console.log('Extract button clicked');
    await performExtraction();
  });

  // Picker functionality
  $('#picker').addEventListener('click', () => {
    console.log('Picker button clicked');
    chrome.devtools.inspectedWindow.eval("inspect(document.body)", (result, error) => {
      if (!error) {
        // Switch to selected element mode after picking
        document.querySelector('input[name="target"][value="selected"]').checked = true;
      }
    });
  });

  // Results actions
  $('#copy').addEventListener('click', () => {
    console.log('Copy button clicked');
    const text = $('#output').textContent;
    if (!text) return;
    // Use execCommand path only to avoid DevTools permissions policy block of Clipboard API
    const textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.setAttribute('readonly', '');
    textArea.style.position = 'fixed';
    textArea.style.top = '0';
    textArea.style.left = '0';
    textArea.style.opacity = '0';
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    let success = false;
    try {
      success = document.execCommand('copy');
    } catch (err) {
      success = false;
    }
    document.body.removeChild(textArea);
    if (success) {
      showFeedback($('#copy'), 'Copied!');
    } else {
      showFeedback($('#copy'), 'Copy failed', true);
    }
  });

  $('#download').addEventListener('click', () => {
    console.log('Download button clicked');
    const outputText = $('#output').textContent;
    if (!outputText) return;
    
    let result;
    try {
      result = JSON.parse(outputText);
    } catch (e) {
      // If output is not JSON, save as a .txt for debugging
      downloadFile(outputText, 'style-dump.txt', 'text/plain');
      return;
    }
    
    const isHtml = !!result.html;
    const content = isHtml ? result.html : outputText;
    const filename = isHtml ? 'style-dump.html' : 'style-dump.json';
    const type = isHtml ? 'text/html' : 'application/json';
    downloadFile(content, filename, type);
    showFeedback($('#download'), 'Downloaded!');
  });

  $('#clear').addEventListener('click', () => {
    console.log('Clear button clicked');
    clearResults();
  });

  // Screenshot functionality
  $('#screenshot-element').addEventListener('click', async () => {
    console.log('Screenshot element button clicked');
    await captureElementScreenshot();
  });

  $('#screenshot-page').addEventListener('click', async () => {
    console.log('Screenshot page button clicked');
    await capturePageScreenshot();
  });
}

async function performExtraction() {
  const extractBtn = $('#extract');
  const resultsSection = $('.results-section');
  const outputSection = $('.output-section');
  
  // Show loading state
  extractBtn.classList.add('loading');
  extractBtn.innerHTML = '<span class="btn-icon">⏳</span>Extracting...';
  
  try {
    // Get extraction parameters
    const params = getExtractionParams();
    console.log('Extraction params:', params);
    
    // Perform extraction
    const result = await runDump(params);
    console.log('Extraction result:', result);
    
    // Display results
    displayResults(result);
    
    // Show results section
    resultsSection.style.display = 'block';
    outputSection.style.display = 'block';
    
  } catch (error) {
    console.error('Extraction failed:', error);
    displayError('Extraction failed: ' + error.message);
  } finally {
    // Reset button state
    extractBtn.classList.remove('loading');
    extractBtn.innerHTML = '<span class="btn-icon">⚡</span>Extract Styles';
  }
}

function getExtractionParams() {
  const targetType = document.querySelector('input[name="target"]:checked').value;
  const selectorValue = $('#selector').value.trim();
  
  let params = {
    mode: document.querySelector('input[name="mode"]:checked').value,
    children: $('#children').checked,
    pseudo: $('#pseudo').checked,
    html: $('#html').checked
  };
  
  // Determine target
  switch (targetType) {
    case 'selected':
      params.use$0 = true;
      params.selector = null;
      break;
    case 'selector':
      if (!selectorValue) {
        throw new Error('Please enter a CSS selector');
      }
      params.use$0 = false;
      params.selector = selectorValue;
      break;
    case 'picker':
      params.use$0 = true;
      params.selector = null;
      break;
  }
  
  return params;
}

function displayResults(result) {
  const output = $('#output');
  const stats = $('#stats');
  
  if (result && result.error) {
    displayError(result.error);
    return;
  }
  
  try {
    // Format and display JSON
    const formatted = JSON.stringify(result || { error: 'No result from extraction' }, null, 2);
    output.textContent = formatted;
    
    // Display stats
    if (result && result.stats) {
      const nodeCount = result.stats.nodeCount || 0;
      const duration = result.stats.durationMs || 0;
      stats.textContent = `Extracted ${nodeCount} element(s) in ${duration}ms`;
    } else {
      stats.textContent = '';
    }
    
  } catch (e) {
    output.textContent = String(result);
    stats.textContent = 'Raw output (not JSON)';
  }
}

function displayError(errorMessage) {
  const output = $('#output');
  const stats = $('#stats');
  
  output.textContent = JSON.stringify({ error: errorMessage }, null, 2);
  stats.textContent = 'Error occurred during extraction';
  
  // Show results section even for errors
  $('.results-section').style.display = 'block';
  $('.output-section').style.display = 'block';
}

function clearResults() {
  $('#output').textContent = '';
  $('#stats').textContent = '';
  $('.results-section').style.display = 'none';
  $('.output-section').style.display = 'none';
}

function downloadFile(content, filename, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function showFeedback(button, message, isError = false) {
  const originalText = button.textContent;
  button.textContent = message;
  button.style.background = isError ? '#dc3545' : '#28a745';
  
  setTimeout(() => {
    button.textContent = originalText;
    button.style.background = '';
  }, 1500);
}

// Screenshot functionality
function setScreenshotStatus(message, isError = false) {
  const status = $('#screenshot-status');
  status.textContent = message;
  status.style.color = isError ? '#dc3545' : '#28a745';
  if (message) {
    setTimeout(() => {
      status.textContent = '';
    }, 3000);
  }
}

async function capturePageScreenshot() {
  const btn = $('#screenshot-page');
  const originalHTML = btn.innerHTML;
  btn.innerHTML = '<span class="btn-icon">⏳</span>Capturing...';
  btn.disabled = true;
  
  try {
    setScreenshotStatus('Capturing page...');
    
    // Get page title for filename
    const pageInfo = await new Promise((resolve) => {
      chrome.devtools.inspectedWindow.eval(
        `({ title: document.title, hostname: location.hostname })`,
        (result, err) => resolve(err ? {} : result)
      );
    });
    
    // Request screenshot from background script
    const response = await new Promise((resolve) => {
      chrome.runtime.sendMessage({ action: 'captureVisibleTab' }, resolve);
    });
    
    if (response.error) {
      throw new Error(response.error);
    }
    
    // Generate filename with timestamp
    const filename = generateFilename('page', pageInfo.hostname, pageInfo.title);
    
    // Download the screenshot
    downloadScreenshot(response.dataUrl, filename);
    setScreenshotStatus('Page screenshot saved!');
    
  } catch (error) {
    console.error('Page screenshot failed:', error);
    setScreenshotStatus('Failed: ' + error.message, true);
  } finally {
    btn.innerHTML = originalHTML;
    btn.disabled = false;
  }
}

async function captureElementScreenshot() {
  const btn = $('#screenshot-element');
  const originalHTML = btn.innerHTML;
  btn.innerHTML = '<span class="btn-icon">⏳</span>Capturing...';
  btn.disabled = true;
  
  try {
    setScreenshotStatus('Getting element bounds...');
    
    // Get the target element based on current selection
    const params = getExtractionParams();
    
    // Get element bounds and info from the page
    const boundsResult = await new Promise((resolve) => {
      const code = params.selector 
        ? `(function() {
            const el = document.querySelector(${JSON.stringify(params.selector)});
            if (!el) return { error: 'Element not found' };
            const rect = el.getBoundingClientRect();
            return {
              x: rect.x,
              y: rect.y,
              width: rect.width,
              height: rect.height,
              devicePixelRatio: window.devicePixelRatio || 1,
              scrollX: window.scrollX,
              scrollY: window.scrollY,
              tagName: el.tagName.toLowerCase(),
              id: el.id || '',
              className: el.className || '',
              hostname: location.hostname
            };
          })()`
        : `(function() {
            const el = $0;
            if (!el || !(el instanceof Element)) return { error: 'No element selected. Select an element in DevTools Elements panel first.' };
            const rect = el.getBoundingClientRect();
            return {
              x: rect.x,
              y: rect.y,
              width: rect.width,
              height: rect.height,
              devicePixelRatio: window.devicePixelRatio || 1,
              scrollX: window.scrollX,
              scrollY: window.scrollY,
              tagName: el.tagName.toLowerCase(),
              id: el.id || '',
              className: el.className || '',
              hostname: location.hostname
            };
          })()`;
      
      chrome.devtools.inspectedWindow.eval(code, (result, err) => {
        if (err) {
          resolve({ error: err.description || 'Failed to get element bounds' });
        } else {
          resolve(result);
        }
      });
    });
    
    if (boundsResult.error) {
      throw new Error(boundsResult.error);
    }
    
    if (boundsResult.width === 0 || boundsResult.height === 0) {
      throw new Error('Element has zero dimensions');
    }
    
    setScreenshotStatus('Capturing screenshot...');
    
    // Request screenshot from background script
    const response = await new Promise((resolve) => {
      chrome.runtime.sendMessage({ 
        action: 'captureElement',
        bounds: boundsResult,
        devicePixelRatio: boundsResult.devicePixelRatio
      }, resolve);
    });
    
    if (response.error) {
      throw new Error(response.error);
    }
    
    // Crop the screenshot to the element bounds
    const croppedDataUrl = await cropImage(
      response.dataUrl,
      boundsResult.x,
      boundsResult.y,
      boundsResult.width,
      boundsResult.height,
      boundsResult.devicePixelRatio
    );
    
    // Generate filename with element info
    const elementIdentifier = boundsResult.id || 
      (boundsResult.className ? boundsResult.className.split(' ')[0] : '') || 
      boundsResult.tagName;
    const filename = generateFilename('element', boundsResult.hostname, elementIdentifier);
    
    // Download the cropped screenshot
    downloadScreenshot(croppedDataUrl, filename);
    setScreenshotStatus('Element screenshot saved!');
    
  } catch (error) {
    console.error('Element screenshot failed:', error);
    setScreenshotStatus('Failed: ' + error.message, true);
  } finally {
    btn.innerHTML = originalHTML;
    btn.disabled = false;
  }
}

function cropImage(dataUrl, x, y, width, height, devicePixelRatio = 1) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      
      // Account for device pixel ratio
      const dpr = devicePixelRatio;
      const cropX = Math.max(0, x * dpr);
      const cropY = Math.max(0, y * dpr);
      const cropWidth = Math.min(width * dpr, img.width - cropX);
      const cropHeight = Math.min(height * dpr, img.height - cropY);
      
      canvas.width = cropWidth;
      canvas.height = cropHeight;
      
      ctx.drawImage(
        img,
        cropX, cropY, cropWidth, cropHeight,
        0, 0, cropWidth, cropHeight
      );
      
      resolve(canvas.toDataURL('image/png'));
    };
    img.onerror = () => reject(new Error('Failed to load image for cropping'));
    img.src = dataUrl;
  });
}

function downloadScreenshot(dataUrl, filename) {
  const link = document.createElement('a');
  link.href = dataUrl;
  link.download = filename;
  link.click();
}

function generateFilename(type, hostname, identifier) {
  // Clean hostname (remove www. and special chars)
  const cleanHost = (hostname || 'page')
    .replace(/^www\./, '')
    .replace(/[^a-zA-Z0-9.-]/g, '_')
    .substring(0, 30);
  
  // Clean identifier (remove special chars, limit length)
  const cleanId = (identifier || '')
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .replace(/_+/g, '_')
    .substring(0, 30);
  
  // Generate timestamp: YYYYMMDD-HHmmss
  const now = new Date();
  const timestamp = now.getFullYear().toString() +
    String(now.getMonth() + 1).padStart(2, '0') +
    String(now.getDate()).padStart(2, '0') + '-' +
    String(now.getHours()).padStart(2, '0') +
    String(now.getMinutes()).padStart(2, '0') +
    String(now.getSeconds()).padStart(2, '0');
  
  // Build filename: type_hostname_identifier_timestamp.png
  const parts = [type, cleanHost];
  if (cleanId) parts.push(cleanId);
  parts.push(timestamp);
  
  return parts.join('_') + '.png';
}