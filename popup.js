// ============================================================================
// Filter help descriptions
// ============================================================================
const FILTER_HELP = {
  noise: {
    title: 'Sensor Noise Analysis',
    bestFor: 'AI-generated images',
    description: 'Extracts high-frequency noise using a 3x3 convolution kernel. Real cameras produce unique random sensor noise. AI generators produce unnaturally smooth or patterned noise.',
    howTo: 'Real photos show fine random static. AI images appear smoother with uniform patches or repeating micro-patterns. Pasted regions have visibly different noise texture.',
    suspicious: 'Uniform smooth patches, seams between regions, repeating grid texture.'
  },
  periodic: {
    title: 'AI Artifact Detection',
    bestFor: 'GAN images & AI upscaling',
    description: 'Searches for repeating patterns at 8/16px intervals via autocorrelation. GANs and AI upscalers produce subtle grid artifacts from their convolutional layers.',
    howTo: 'Bright areas = repeating patterns. Real photos show random variation (dark gray). GAN images show bright grids, especially in smooth areas like skin or sky.',
    suspicious: 'Bright grid lines, checkerboard patterns, regularly-spaced bright spots.'
  },
  fft: {
    title: 'Frequency Forensics (Farid Method)',
    bestFor: 'Most thorough AI detection',
    description: 'Gold standard forensic technique. Extracts noise residual then applies 2D FFT to reveal frequency-domain patterns. Based on Hany Farid\'s research.',
    howTo: 'Natural photos produce a smooth circular center that fades outward. AI images produce cross/star patterns or grid structures radiating from center.',
    suspicious: 'Cross patterns, bright dots in a grid, non-circular structures. Adjust sigma to tune.'
  },
  ela: {
    title: 'Splice Detection (ELA)',
    bestFor: 'Photoshop edits & splicing',
    description: 'Simulates JPEG recompression error. Pasted regions from different sources have different compression error levels than the original.',
    howTo: 'Unedited photos show uniform brightness. Pasted or cloned regions stand out as brighter or darker. Better for edits than pure AI detection.',
    suspicious: 'Regions much brighter or darker than surroundings, especially following object outlines.'
  },
  gradient: {
    title: 'Edge Anomaly Detection',
    bestFor: 'Supplementary - finding edit boundaries',
    description: 'Computes intensity change magnitude between pixels (edge detection). Not diagnostic for AI alone but can reveal unnatural edge artifacts from compositing.',
    howTo: 'Shows all edges. Use as a supplement - look for unnaturally sharp or blurred boundaries that don\'t match the rest of the image.',
    suspicious: 'Unnaturally sharp/smooth edges, visible halos around pasted objects.'
  }
};

// Filters that use the sensitivity slider (FFT uses gaussianSigma instead)
const FILTERS_WITH_SENSITIVITY = ['noise', 'periodic', 'ela', 'gradient'];

// Online checker services
const CHECKER_SERVICES = {
  c2pa: { url: 'https://contentcredentials.org/verify' },
  synthid: { url: 'https://hivemoderation.com/ai-generated-content-detection' },
  hive: { url: 'https://hivemoderation.com/ai-generated-content-detection' },
  aiornot: { url: 'https://aiornot.com' },
  illuminarty: { url: 'https://app.illuminarty.ai' },
  sightengine: { url: 'https://sightengine.com/detect-ai-generated-images' }
};

let currentAnalyzedImageUrl = null;

// ============================================================================
// Theme system
// ============================================================================

function setTheme(theme) {
  if (theme === 'light') {
    document.documentElement.removeAttribute('data-theme');
  } else {
    document.documentElement.setAttribute('data-theme', theme);
  }

  document.querySelectorAll('.theme-btn').forEach(btn => btn.classList.remove('active'));
  const activeId = { light: 'themeLight', dark: 'themeDark', retro: 'themeRetro' }[theme];
  const btn = document.getElementById(activeId);
  if (btn) btn.classList.add('active');

  chrome.storage.sync.set({ theme });

  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs[0]) {
      chrome.tabs.sendMessage(tabs[0].id, { action: 'updateTheme', theme });
    }
  });
}

function initThemeButtons() {
  const lightBtn = document.getElementById('themeLight');
  const darkBtn = document.getElementById('themeDark');
  const retroBtn = document.getElementById('themeRetro');
  if (lightBtn) lightBtn.addEventListener('click', () => setTheme('light'));
  if (darkBtn) darkBtn.addEventListener('click', () => setTheme('dark'));
  if (retroBtn) retroBtn.addEventListener('click', () => setTheme('retro'));
}

// ============================================================================
// Info panel toggles
// ============================================================================

function initInfoToggles() {
  const filterInfoBtn = document.getElementById('filterInfoBtn');
  if (filterInfoBtn) {
    filterInfoBtn.addEventListener('click', () => {
      const panel = document.getElementById('filterHelp');
      if (panel) panel.classList.toggle('open');
    });
  }

  const wmInfoBtn = document.getElementById('wmInfoBtn');
  if (wmInfoBtn) {
    wmInfoBtn.addEventListener('click', () => {
      const panel = document.getElementById('wmInfoPanel');
      if (panel) panel.classList.toggle('open');
    });
  }
}

// ============================================================================
// Filter help text
// ============================================================================

function updateFilterHelp(filterType) {
  const helpEl = document.getElementById('filterHelp');
  if (!helpEl) return;

  const info = FILTER_HELP[filterType];
  if (!info) { helpEl.innerHTML = ''; return; }

  helpEl.innerHTML = `
    <div class="info-tag">Best for: ${info.bestFor}</div>
    <div>${info.description}</div>
    <div class="info-section">
      <strong style="font-size: 12px;">How to read:</strong> ${info.howTo}
    </div>
    <div class="info-section">
      <span class="info-warn">Suspicious:</span> ${info.suspicious}
    </div>
  `;
}

// ============================================================================
// Sensitivity show/hide based on filter type
// ============================================================================

function updateSensitivityVisibility(analysisType) {
  const sensGroup = document.getElementById('sensitivityGroup');
  if (!sensGroup) return;
  sensGroup.style.display = FILTERS_WITH_SENSITIVITY.includes(analysisType) ? '' : 'none';
}

// ============================================================================
// Initialize
// ============================================================================

chrome.storage.sync.get(['enabled', 'analysisType', 'sensitivity', 'colorMap', 'opacity', 'gaussianSigma', 'showDebug', 'theme'], (data) => {
  const analysisType = data.analysisType ?? 'noise';

  document.getElementById('toggleAnalysis').checked = data.enabled ?? false;
  document.getElementById('analysisType').value = analysisType;
  document.getElementById('sensitivity').value = data.sensitivity ?? 3;
  document.getElementById('colorMap').value = data.colorMap ?? 'grayscale';
  document.getElementById('opacity').value = data.opacity ?? 100;
  document.getElementById('gaussianSigma').value = data.gaussianSigma ?? 12;
  document.getElementById('showDebug').checked = data.showDebug ?? false;
  document.getElementById('sensValue').textContent = `${data.sensitivity ?? 3}x`;
  document.getElementById('opacityValue').textContent = `${data.opacity ?? 100}%`;
  document.getElementById('sigmaValue').textContent = ((data.gaussianSigma ?? 12) / 10).toFixed(1);

  document.getElementById('fftControls').style.display =
    analysisType === 'fft' ? 'block' : 'none';

  updateSensitivityVisibility(analysisType);
  setTheme(data.theme ?? 'light');
  updateFilterHelp(analysisType);
});

// ============================================================================
// Event listeners
// ============================================================================

function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
}

document.getElementById('toggleAnalysis').addEventListener('change', (e) => {
  const enabled = e.target.checked;
  chrome.storage.sync.set({ enabled });
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    chrome.tabs.sendMessage(tabs[0].id, { action: 'toggle', enabled });
  });
});

document.getElementById('analysisType').addEventListener('change', (e) => {
  const analysisType = e.target.value;
  chrome.storage.sync.set({ analysisType });

  document.getElementById('fftControls').style.display =
    analysisType === 'fft' ? 'block' : 'none';

  updateSensitivityVisibility(analysisType);
  updateFilterHelp(analysisType);

  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    chrome.tabs.sendMessage(tabs[0].id, { action: 'updateSettings', settings: { analysisType } });
  });
});

const debouncedSave = debounce((key, value) => {
  chrome.storage.sync.set({ [key]: value });
}, 300);

const sendUpdate = (settings) => {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs[0]) {
      chrome.tabs.sendMessage(tabs[0].id, { action: 'updateSettings', settings });
    }
  });
};

document.getElementById('sensitivity').addEventListener('input', (e) => {
  const sensitivity = parseInt(e.target.value);
  document.getElementById('sensValue').textContent = `${sensitivity}x`;
  debouncedSave('sensitivity', sensitivity);
  sendUpdate({ sensitivity });
});

document.getElementById('opacity').addEventListener('input', (e) => {
  const opacity = parseInt(e.target.value);
  document.getElementById('opacityValue').textContent = `${opacity}%`;
  debouncedSave('opacity', opacity);
  sendUpdate({ opacity });
});

document.getElementById('colorMap').addEventListener('change', (e) => {
  const colorMap = e.target.value;
  chrome.storage.sync.set({ colorMap });
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    chrome.tabs.sendMessage(tabs[0].id, { action: 'updateSettings', settings: { colorMap } });
  });
});

document.getElementById('gaussianSigma').addEventListener('input', (e) => {
  const gaussianSigma = parseInt(e.target.value);
  document.getElementById('sigmaValue').textContent = (gaussianSigma / 10).toFixed(1);
  debouncedSave('gaussianSigma', gaussianSigma);
  sendUpdate({ gaussianSigma });
});

document.getElementById('showDebug').addEventListener('change', (e) => {
  const showDebug = e.target.checked;
  chrome.storage.sync.set({ showDebug });
  sendUpdate({ showDebug });
});

// ============================================================================
// Online checker / watermark buttons
// ============================================================================

// Services that accept file upload (auto-download helps the user)
const DOWNLOAD_FIRST_SERVICES = ['c2pa'];

function setupCheckerButton(buttonId, serviceKey) {
  const btn = document.getElementById(buttonId);
  if (!btn) return;
  btn.addEventListener('click', () => {
    const url = CHECKER_SERVICES[serviceKey].url;

    if (DOWNLOAD_FIRST_SERVICES.includes(serviceKey) && currentAnalyzedImageUrl) {
      // Auto-save image to downloads, then open the checker
      chrome.runtime.sendMessage({
        action: 'downloadAndOpenChecker',
        imageUrl: currentAnalyzedImageUrl,
        checkerUrl: url
      });
    } else {
      chrome.tabs.create({ url });
    }
  });
}

chrome.runtime.onMessage.addListener((request) => {
  if (request.action === 'imageAnalyzed') {
    currentAnalyzedImageUrl = request.imageUrl;
  } else if (request.action === 'overlayRemoved') {
    currentAnalyzedImageUrl = null;
  }
});

setupCheckerButton('checkC2PA', 'c2pa');
setupCheckerButton('checkSynthID', 'synthid');
setupCheckerButton('checkHive', 'hive');
setupCheckerButton('checkAIOrNot', 'aiornot');
setupCheckerButton('checkIlluminarty', 'illuminarty');
setupCheckerButton('checkSightEngine', 'sightengine');

// ============================================================================
// Screen region capture
// ============================================================================

const captureBtn = document.getElementById('captureRegionBtn');
if (captureBtn) {
  captureBtn.addEventListener('click', () => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        // Tell background to capture the tab, then tell content to enter crop mode
        chrome.runtime.sendMessage({ action: 'captureTab' }, (response) => {
          if (response && response.dataUrl) {
            chrome.tabs.sendMessage(tabs[0].id, {
              action: 'startCrop',
              screenshot: response.dataUrl
            });
          }
        });
      }
    });
  });
}

// ============================================================================
// Init
// ============================================================================

initThemeButtons();
initInfoToggles();
