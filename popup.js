// ============================================================================
// Filter help descriptions — shown in the side panel when a filter is selected
// ============================================================================
const FILTER_HELP = {
  noise: {
    title: 'Noise Pattern Analysis (High-pass Filter)',
    bestFor: 'AI-generated images',
    description: 'Extracts the high-frequency noise from an image using a 3x3 convolution kernel. Every real camera sensor produces a unique pattern of random electronic noise. AI generators don\'t simulate this — they produce unnaturally smooth or uniformly patterned noise.',
    howTo: 'Look at the overall texture of the result. A real photo will show fine, random static that looks like TV snow. An AI image will appear smoother with large uniform patches or repeating micro-patterns. Edited/pasted regions will have a visibly different noise texture than the surrounding area.',
    suspicious: 'Uniform smooth patches, visible seams between regions with different noise levels, or repeating grid-like texture.'
  },
  periodic: {
    title: 'Periodic Pattern Detection',
    bestFor: 'GAN-generated images & AI upscaling',
    description: 'Searches for repeating patterns at fixed intervals (8px, 16px blocks) using autocorrelation analysis. GAN architectures (StyleGAN, ProGAN) and AI upscalers often produce subtle grid-like artifacts at regular intervals due to their convolutional layers.',
    howTo: 'Bright areas indicate regions where patterns repeat at regular intervals. A real photo should show mostly random variation (dark/medium gray). Older GAN-generated images will show bright grid patterns, especially in smooth areas like skin or sky.',
    suspicious: 'Bright grid lines, checkerboard patterns, or regularly-spaced bright spots. These indicate artificial periodic structure that doesn\'t occur in natural photographs.'
  },
  fft: {
    title: 'FFT Noise Analysis (Hany Farid Method)',
    bestFor: 'Most thorough AI detection',
    description: 'The gold standard forensic technique. Extracts the noise residual (original minus Gaussian blur), then applies a 2D Fast Fourier Transform to reveal frequency-domain patterns. Based on the peer-reviewed research of Hany Farid at UC Berkeley.',
    howTo: 'Look at the center of the FFT output. A natural photo produces a smooth, roughly circular bright spot that fades gradually outward. AI-generated images produce cross/star patterns, bright spots at regular intervals, or grid-like structures radiating from the center.',
    suspicious: 'Cross or plus-sign patterns, bright dots arranged in a grid, or any non-circular symmetric structure. These indicate periodic artifacts in the noise that are hallmarks of AI generation. Adjust the Gaussian sigma to tune — lower sigma catches fine AI artifacts, higher sigma catches broader manipulation.'
  },
  ela: {
    title: 'Error Level Analysis (ELA)',
    bestFor: 'Photoshop edits & image splicing',
    description: 'Simulates JPEG recompression error. When a JPEG is saved, every 8x8 block reaches a similar error level. If part of the image was pasted from a different source (saved at different quality), those blocks will have a noticeably different error level than the rest.',
    howTo: 'A genuine, unedited photo should show relatively uniform brightness across the entire image. Pasted or cloned regions will stand out as significantly brighter or darker than surrounding areas because they were compressed at a different quality level.',
    suspicious: 'Regions that are much brighter or darker than surrounding areas, especially if they follow the outline of an object. Note: this is better for detecting Photoshop edits than AI-generated images, since AI images are generated whole rather than spliced.'
  },
  gradient: {
    title: 'Gradient Magnitude (Edge Detection)',
    bestFor: 'Supplementary — finding edit boundaries',
    description: 'Computes the magnitude of intensity changes between neighboring pixels (Sobel-like operator). This highlights edges and boundaries. While not specifically diagnostic for AI or manipulation, it can reveal unnatural edge artifacts.',
    howTo: 'This shows all edges in the image. By itself it won\'t tell you if an image is AI-generated. Use it as a supplementary tool — if you suspect a region was pasted in, the gradient view can reveal unnaturally sharp or blurred boundaries that don\'t match the rest of the image.',
    suspicious: 'Edges that are unnaturally sharp or smooth compared to surrounding detail, or visible halos around pasted objects. Most useful when combined with other filters.'
  }
};

// Online checker services
const CHECKER_SERVICES = {
  c2pa: {
    name: 'Content Credentials (C2PA)',
    url: 'https://contentcredentials.org/verify',
    acceptsUrl: false
  },
  hive: {
    name: 'Hive AI Detector',
    url: 'https://hivemoderation.com/ai-generated-content-detection',
    acceptsUrl: false
  },
  aiornot: {
    name: 'AI or Not',
    url: 'https://aiornot.com',
    acceptsUrl: false
  },
  illuminarty: {
    name: 'Illuminarty',
    url: 'https://app.illuminarty.ai',
    acceptsUrl: false
  },
  sightengine: {
    name: 'SightEngine',
    url: 'https://sightengine.com/detect-ai-generated-images',
    acceptsUrl: false
  }
};

// Track the currently analyzed image URL
let currentAnalyzedImageUrl = null;

// ============================================================================
// Initialize UI
// ============================================================================

// Load saved settings
chrome.storage.sync.get(['enabled', 'analysisType', 'sensitivity', 'colorMap', 'opacity', 'gaussianSigma', 'showDebug'], (data) => {
  document.getElementById('toggleAnalysis').checked = data.enabled ?? false;
  document.getElementById('analysisType').value = data.analysisType ?? 'noise';
  document.getElementById('sensitivity').value = data.sensitivity ?? 3;
  document.getElementById('colorMap').value = data.colorMap ?? 'grayscale';
  document.getElementById('opacity').value = data.opacity ?? 100;
  document.getElementById('gaussianSigma').value = data.gaussianSigma ?? 12;
  document.getElementById('showDebug').checked = data.showDebug ?? false;
  document.getElementById('sensValue').textContent = `${data.sensitivity ?? 3}x`;
  document.getElementById('opacityValue').textContent = `${data.opacity ?? 100}%`;
  document.getElementById('sigmaValue').textContent = ((data.gaussianSigma ?? 12) / 10).toFixed(1);

  // Show/hide FFT controls
  document.getElementById('fftControls').style.display =
    data.analysisType === 'fft' ? 'block' : 'none';

  // Show filter help
  updateFilterHelp(data.analysisType ?? 'noise');
});

// ============================================================================
// Filter help text
// ============================================================================

function updateFilterHelp(filterType) {
  const helpEl = document.getElementById('filterHelp');
  if (!helpEl) return; // Not present in popup.html, only sidepanel.html

  const info = FILTER_HELP[filterType];
  if (!info) {
    helpEl.style.display = 'none';
    return;
  }

  helpEl.style.display = 'block';
  helpEl.innerHTML = `
    <strong>${info.title}</strong>
    <span class="best-for">Best for: ${info.bestFor}</span>
    <div>${info.description}</div>
    <div class="look-for">
      <strong style="display:inline; font-size:11px;">How to read:</strong> ${info.howTo}
    </div>
    <div class="look-for" style="border-top: 1px solid #eee; margin-top: 6px; padding-top: 6px;">
      <span>Suspicious signs:</span> ${info.suspicious}
    </div>
  `;
}

// ============================================================================
// Event listeners
// ============================================================================

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

  // Update help text
  updateFilterHelp(analysisType);

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

// ============================================================================
// Online checker buttons
// ============================================================================

function setupCheckerButton(buttonId, serviceKey) {
  const btn = document.getElementById(buttonId);
  if (!btn) return; // Not present in popup.html

  btn.addEventListener('click', () => {
    const service = CHECKER_SERVICES[serviceKey];
    // Open the checker service in a new tab
    chrome.tabs.create({ url: service.url });
  });
}

// Listen for image URL updates from content script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'imageAnalyzed') {
    currentAnalyzedImageUrl = request.imageUrl;
    updateCheckerStatus(true);
  } else if (request.action === 'overlayRemoved') {
    currentAnalyzedImageUrl = null;
    updateCheckerStatus(false);
  }
});

function updateCheckerStatus(hasImage) {
  const statusEl = document.getElementById('checkerStatus');
  if (!statusEl) return;

  if (hasImage) {
    statusEl.textContent = 'Image selected! Click a service below to check it online.';
    statusEl.style.color = '#2e7d32';
  } else {
    statusEl.textContent = 'Click an image on the page first, then use these buttons to check it with online AI detectors.';
    statusEl.style.color = '#999';
  }
}

// Initialize all checker buttons
setupCheckerButton('checkC2PA', 'c2pa');
setupCheckerButton('checkHive', 'hive');
setupCheckerButton('checkAIOrNot', 'aiornot');
setupCheckerButton('checkIlluminarty', 'illuminarty');
setupCheckerButton('checkSightEngine', 'sightengine');
