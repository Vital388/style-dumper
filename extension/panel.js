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

let __dumperSource = null;
async function ensureDumperSource() {
  if (__dumperSource) return __dumperSource;
  try {
    const resp = await fetch(chrome.runtime.getURL('dumper.js'));
    __dumperSource = await resp.text();
  } catch (e) {
    console.error('Failed to load dumper.js', e);
    __dumperSource = null;
  }
  return __dumperSource;
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
    
    const textArea = document.createElement('textarea');
    textArea.value = text;
    document.body.appendChild(textArea);
    textArea.select();
    try {
      document.execCommand('copy');
      showFeedback($('#copy'), 'Copied!');
    } catch (err) {
      console.error('Copy failed:', err);
      showFeedback($('#copy'), 'Copy failed', true);
    }
    document.body.removeChild(textArea);
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