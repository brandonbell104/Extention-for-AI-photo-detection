// Load saved settings
chrome.storage.sync.get(['enabled', 'analysisType', 'sensitivity', 'colorMap', 'opacity', 'gaussianSigma', 'showDebug'], (data) => {
  document.getElementById('toggleAnalysis').checked = data.enabled || false;
  document.getElementById('analysisType').value = data.analysisType || 'noise';
  document.getElementById('sensitivity').value = data.sensitivity || 3;
  document.getElementById('colorMap').value = data.colorMap || 'grayscale';
  document.getElementById('opacity').value = data.opacity || 100;
  document.getElementById('gaussianSigma').value = data.gaussianSigma || 12;
  document.getElementById('showDebug').checked = data.showDebug || false;
  document.getElementById('sensValue').textContent = `${data.sensitivity || 3}x`;
  document.getElementById('opacityValue').textContent = `${data.opacity || 100}%`;
  document.getElementById('sigmaValue').textContent = ((data.gaussianSigma || 12) / 10).toFixed(1);
  
  // Show/hide FFT controls
  document.getElementById('fftControls').style.display = 
    data.analysisType === 'fft' ? 'block' : 'none';
});

// Debounce function to prevent too many storage writes
function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

// Toggle analysis
document.getElementById('toggleAnalysis').addEventListener('change', (e) => {
  const enabled = e.target.checked;
  chrome.storage.sync.set({ enabled });
  
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    chrome.tabs.sendMessage(tabs[0].id, { 
      action: 'toggle', 
      enabled 
    });
  });
});

// Analysis type change
document.getElementById('analysisType').addEventListener('change', (e) => {
  const analysisType = e.target.value;
  chrome.storage.sync.set({ analysisType });
  
  // Show/hide FFT controls
  document.getElementById('fftControls').style.display = 
    analysisType === 'fft' ? 'block' : 'none';
  
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    chrome.tabs.sendMessage(tabs[0].id, { 
      action: 'updateSettings',
      settings: { analysisType }
    });
  });
});

// Debounced save and send for sliders
const debouncedSave = debounce((key, value) => {
  chrome.storage.sync.set({ [key]: value });
}, 300);

const sendUpdate = (settings) => {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs[0]) {
      chrome.tabs.sendMessage(tabs[0].id, { 
        action: 'updateSettings',
        settings
      });
    }
  });
};

// Sensitivity change
document.getElementById('sensitivity').addEventListener('input', (e) => {
  const sensitivity = parseInt(e.target.value);
  document.getElementById('sensValue').textContent = `${sensitivity}x`;
  debouncedSave('sensitivity', sensitivity);
  sendUpdate({ sensitivity });
});

// Opacity change
document.getElementById('opacity').addEventListener('input', (e) => {
  const opacity = parseInt(e.target.value);
  document.getElementById('opacityValue').textContent = `${opacity}%`;
  debouncedSave('opacity', opacity);
  sendUpdate({ opacity });
});

// Color map change
document.getElementById('colorMap').addEventListener('change', (e) => {
  const colorMap = e.target.value;
  chrome.storage.sync.set({ colorMap });
  
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    chrome.tabs.sendMessage(tabs[0].id, { 
      action: 'updateSettings',
      settings: { colorMap }
    });
  });
});

// Gaussian sigma change (for FFT mode)
document.getElementById('gaussianSigma').addEventListener('input', (e) => {
  const gaussianSigma = parseInt(e.target.value);
  document.getElementById('sigmaValue').textContent = (gaussianSigma / 10).toFixed(1);
  debouncedSave('gaussianSigma', gaussianSigma);
  sendUpdate({ gaussianSigma });
});

// Debug mode toggle
document.getElementById('showDebug').addEventListener('change', (e) => {
  const showDebug = e.target.checked;
  chrome.storage.sync.set({ showDebug });
  sendUpdate({ showDebug });
});