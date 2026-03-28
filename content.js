let isEnabled = false;
let settings = {
  analysisType: 'noise',
  sensitivity: 3,
  colorMap: 'grayscale',
  opacity: 100,
  gaussianSigma: 1.2,
  showDebug: false
};
let currentImageData = null;
let currentDisplayElement = null;

// Load settings
chrome.storage.sync.get(['enabled', 'analysisType', 'sensitivity', 'colorMap', 'opacity', 'gaussianSigma', 'showDebug'], (data) => {
  isEnabled = data.enabled ?? false;
  settings.analysisType = data.analysisType ?? 'noise';
  settings.sensitivity = data.sensitivity ?? 3;
  settings.colorMap = data.colorMap ?? 'grayscale';
  settings.opacity = data.opacity ?? 100;
  settings.gaussianSigma = (data.gaussianSigma ?? 12) / 10; // Convert back to 0.5-3.0 range
  settings.showDebug = data.showDebug ?? false;
  
  if (isEnabled) {
    enableAnalysis();
  }
});

// Listen for messages from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'toggle') {
    isEnabled = request.enabled;
    if (isEnabled) {
      enableAnalysis();
    } else {
      disableAnalysis();
    }
  } else if (request.action === 'updateSettings') {
    const incoming = { ...request.settings };
    // Convert gaussianSigma from slider value (5-30) to actual sigma (0.5-3.0)
    if (incoming.gaussianSigma !== undefined) {
      incoming.gaussianSigma = incoming.gaussianSigma / 10;
    }
    settings = { ...settings, ...incoming };
    // Reprocess the current image if one is being displayed
    if (currentImageData && currentDisplayElement) {
      reprocessCurrentImage();
    }
  }
});

function enableAnalysis() {
  document.body.style.cursor = 'crosshair';
  document.addEventListener('click', handleImageClick, true);
  
  // Add hover effect to make it clear which images are clickable
  document.addEventListener('mouseover', highlightImage, true);
  document.addEventListener('mouseout', unhighlightImage, true);
}

function disableAnalysis() {
  document.body.style.cursor = '';
  document.removeEventListener('click', handleImageClick, true);
  document.removeEventListener('mouseover', highlightImage, true);
  document.removeEventListener('mouseout', unhighlightImage, true);
  removeOverlay();
  
  // Clear stored image data
  currentImageData = null;
  currentDisplayElement = null;
  
  // Remove any remaining highlights
  document.querySelectorAll('.noise-analysis-highlight').forEach(el => {
    el.classList.remove('noise-analysis-highlight');
  });
}

function highlightImage(e) {
  const img = findImageElement(e.target);
  if (img) {
    img.classList.add('noise-analysis-highlight');
  }
}

function unhighlightImage(e) {
  const img = findImageElement(e.target);
  if (img) {
    img.classList.remove('noise-analysis-highlight');
  }
}

function findImageElement(element) {
  // Check if the element itself is an image
  if (element.tagName === 'IMG') {
    return element;
  }
  
  // Check if element has a background image
  if (element.style && element.style.backgroundImage && 
      element.style.backgroundImage !== 'none') {
    return element;
  }
  
  // Check computed style for background image
  const computed = window.getComputedStyle(element);
  if (computed.backgroundImage && computed.backgroundImage !== 'none') {
    return element;
  }
  
  return null;
}

function handleImageClick(e) {
  // Don't process clicks inside our own overlay
  if (e.target.closest('#noise-analysis-overlay')) return;

  const imgElement = findImageElement(e.target);

  // Only handle if we found an image element
  if (imgElement) {
    e.preventDefault();
    e.stopPropagation();

    if (imgElement.tagName === 'IMG') {
      analyzeImage(imgElement);
    } else {
      // Handle background images
      analyzeBackgroundImage(imgElement);
    }

    return false;
  }

  // If not an image, let the click pass through normally
  return true;
}

function analyzeBackgroundImage(element) {
  const computed = window.getComputedStyle(element);
  const bgImage = computed.backgroundImage || element.style.backgroundImage;
  
  if (!bgImage || bgImage === 'none') return;
  
  // Extract URL from background-image
  const urlMatch = bgImage.match(/url\(['"]?([^'"()]+)['"]?\)/);
  if (!urlMatch) return;
  
  loadImageViaBackground(urlMatch[1], element);
}

function analyzeImage(img) {
  // Handle images that might not be fully loaded
  if (!img.complete || img.naturalWidth === 0) {
    loadImageViaBackground(img.src, img);
    return;
  }
  
  // Try direct analysis first
  analyzeImageData(img, img);
}

function loadImageViaBackground(url, displayElement) {
  // Show loading indicator
  const loader = document.createElement('div');
  loader.className = 'noise-loading';
  loader.textContent = 'Analyzing...';
  loader.style.position = 'fixed';
  loader.style.top = '50%';
  loader.style.left = '50%';
  loader.style.transform = 'translate(-50%, -50%)';
  loader.style.background = 'rgba(33, 150, 243, 0.9)';
  loader.style.color = 'white';
  loader.style.padding = '20px 40px';
  loader.style.borderRadius = '8px';
  loader.style.zIndex = '9999999';
  loader.style.fontSize = '16px';
  loader.style.fontFamily = 'Arial, sans-serif';
  document.body.appendChild(loader);
  
  // Fetch image through background script to bypass CORS
  chrome.runtime.sendMessage(
    { action: 'fetchImage', url: url },
    (response) => {
      loader.remove();
      
      if (response.success) {
        const img = new Image();
        img.onload = function() {
          analyzeImageData(img, displayElement);
        };
        img.src = response.data;
      } else {
        alert('Unable to analyze this image: ' + response.error);
      }
    }
  );
}

function analyzeImageData(sourceImg, displayElement) {
  removeOverlay();
  
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  
  canvas.width = sourceImg.naturalWidth || sourceImg.width;
  canvas.height = sourceImg.naturalHeight || sourceImg.height;
  
  // Handle CORS issues
  try {
    ctx.drawImage(sourceImg, 0, 0, canvas.width, canvas.height);
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    
    // Store the original image data for dynamic updates
    currentImageData = imageData;
    currentDisplayElement = displayElement;
    
    const analyzed = performAnalysis(imageData);
    
    ctx.putImageData(analyzed, 0, 0);
    createOverlay(displayElement, canvas.toDataURL());
  } catch (err) {
    // If direct analysis fails, try fetching through background
    if (sourceImg.src) {
      loadImageViaBackground(sourceImg.src, displayElement);
    } else {
      alert('Unable to analyze this image. It may be blocked by security policies.');
    }
  }
}

function reprocessCurrentImage() {
  if (!currentImageData || !currentDisplayElement) return;
  
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  
  canvas.width = currentImageData.width;
  canvas.height = currentImageData.height;
  
  const analyzed = performAnalysis(currentImageData);
  ctx.putImageData(analyzed, 0, 0);
  
  // Update the overlay image
  const overlay = document.getElementById('noise-analysis-overlay');
  if (overlay) {
    const images = overlay.querySelectorAll('img');
    const analysisImg = images[images.length - 1]; // Get the analysis layer (last img)
    const label = overlay.querySelector('.analysis-label');
    if (analysisImg) {
      analysisImg.src = canvas.toDataURL();
      analysisImg.style.opacity = settings.opacity / 100;
      analysisImg.style.objectFit = 'contain';
    }
    if (label) {
      label.textContent = `${settings.analysisType.toUpperCase()} Analysis (${settings.sensitivity}x)`;
    }
  }
}

function performAnalysis(imageData) {
  const data = imageData.data;
  const width = imageData.width;
  const height = imageData.height;
  const output = new ImageData(width, height);
  
  if (settings.analysisType === 'fft') {
    // FFT NOISE ANALYSIS PIPELINE (Hany Farid Method)
    return performFFTAnalysis(imageData);
  } else if (settings.analysisType === 'noise') {
    // High-pass filter to extract noise
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const idx = (y * width + x) * 4;
        
        // 3x3 high-pass filter kernel
        let r = 0, g = 0, b = 0;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const i = ((y + dy) * width + (x + dx)) * 4;
            const weight = (dx === 0 && dy === 0) ? 8 : -1;
            r += data[i] * weight;
            g += data[i + 1] * weight;
            b += data[i + 2] * weight;
          }
        }
        
        // Amplify and normalize
        const magnitude = Math.sqrt(r * r + g * g + b * b) * settings.sensitivity;
        const val = Math.min(255, Math.max(0, magnitude + 128));
        
        applyColorMap(output.data, idx, val);
      }
    }
  } else if (settings.analysisType === 'periodic') {
    // Detect periodic patterns using autocorrelation-like analysis
    // This reveals geometric patterns from AI upscaling and generation
    const blockSize = 8; // Check for 8x8 patterns (common in JPEG/AI)
    const avgValues = new Float32Array(width * height);
    
    // First pass: compute local variance to find repeating patterns
    for (let y = blockSize; y < height - blockSize; y++) {
      for (let x = blockSize; x < width - blockSize; x++) {
        const idx = y * width + x;
        
        // Compare current pixel region with offset regions
        let patternScore = 0;
        const centerIdx = (y * width + x) * 4;
        const centerVal = (data[centerIdx] + data[centerIdx + 1] + data[centerIdx + 2]) / 3;
        
        // Check for repeating patterns at common AI generation intervals
        const offsets = [
          [blockSize, 0], [0, blockSize], [blockSize, blockSize],
          [blockSize * 2, 0], [0, blockSize * 2]
        ];
        
        for (const [dx, dy] of offsets) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < width && ny < height) {
            const nIdx = (ny * width + nx) * 4;
            const nVal = (data[nIdx] + data[nIdx + 1] + data[nIdx + 2]) / 3;
            
            // Look for correlation in the high-frequency component
            const hfCenter = Math.abs(centerVal - getLocalAverage(data, width, x, y, 3));
            const hfNeighbor = Math.abs(nVal - getLocalAverage(data, width, nx, ny, 3));
            
            patternScore += Math.abs(hfCenter - hfNeighbor);
          }
        }
        
        avgValues[idx] = patternScore;
      }
    }
    
    // Second pass: enhance and normalize the pattern detection
    let maxScore = 0;
    for (let i = 0; i < avgValues.length; i++) {
      if (avgValues[i] > maxScore) maxScore = avgValues[i];
    }
    
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = (y * width + x) * 4;
        const score = avgValues[y * width + x];
        
        // Invert so regular patterns show as bright
        const val = Math.min(255, (1 - (score / maxScore)) * 255 * settings.sensitivity * 0.5);
        
        applyColorMap(output.data, idx, val);
      }
    }
  } else if (settings.analysisType === 'ela') {
    // Error Level Analysis simulation
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      
      // Simulate compression error
      const error = Math.abs(r - Math.round(r / 8) * 8) +
                   Math.abs(g - Math.round(g / 8) * 8) +
                   Math.abs(b - Math.round(b / 8) * 8);
      
      const val = Math.min(255, error * settings.sensitivity * 2);
      applyColorMap(output.data, i, val);
    }
  } else if (settings.analysisType === 'gradient') {
    // Gradient magnitude
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const idx = (y * width + x) * 4;
        
        const left = data[((y) * width + (x - 1)) * 4];
        const right = data[((y) * width + (x + 1)) * 4];
        const top = data[((y - 1) * width + (x)) * 4];
        const bottom = data[((y + 1) * width + (x)) * 4];
        
        const gx = right - left;
        const gy = bottom - top;
        const magnitude = Math.sqrt(gx * gx + gy * gy) * settings.sensitivity;
        
        const val = Math.min(255, magnitude);
        applyColorMap(output.data, idx, val);
      }
    }
  }
  
  return output;
}

// Helper function to get local average
function getLocalAverage(data, width, x, y, radius) {
  let sum = 0;
  let count = 0;
  
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      const idx = ((y + dy) * width + (x + dx)) * 4;
      if (idx >= 0 && idx < data.length) {
        sum += (data[idx] + data[idx + 1] + data[idx + 2]) / 3;
        count++;
      }
    }
  }
  
  return count > 0 ? sum / count : 0;
}

// ============================================================================
// FFT NOISE ANALYSIS PIPELINE (Hany Farid Method)
// ============================================================================

/**
 * COMPLETE FORENSIC NOISE-RESIDUAL + FOURIER ANALYSIS PIPELINE
 * 
 * This implements Hany Farid's approach for detecting AI-generated images:
 * 1. Extract noise residual from image (high-frequency components)
 * 2. Apply 2D FFT to the residual
 * 3. Visualize frequency domain magnitude
 * 
 * WHY THIS WORKS:
 * - Natural photos have random sensor noise → smooth radial FFT patterns
 * - AI images have structured artifacts → grid/star patterns in FFT
 * - The residual isolates these patterns by removing image content
 */

function performFFTAnalysis(imageData) {
  const width = imageData.width;
  const height = imageData.height;
  
  console.log('[FFT Analysis] Starting pipeline...');
  console.log(`Image size: ${width}x${height}`);
  
  // STEP 1: Convert to grayscale and normalize to [0,1]
  const grayscale = rgbaToGrayscale(imageData);
  
  if (settings.showDebug) {
    window.debugData = window.debugData || {};
    window.debugData.grayscale = grayscale;
  }
  
  // STEP 2: Apply Gaussian blur to create denoised version
  // WHY: We need a "clean" version to subtract from the original
  // This isolates the high-frequency noise component
  const sigma = settings.gaussianSigma;
  console.log(`[FFT Analysis] Applying Gaussian blur (σ=${sigma.toFixed(2)})`);
  const denoised = gaussianBlur(grayscale, width, height, sigma);
  
  if (settings.showDebug) {
    window.debugData.denoised = denoised;
  }
  
  // STEP 3: Extract noise residual
  // residual = original - denoised
  // WHY: This is the HIGH-PASS filter that reveals noise patterns
  console.log('[FFT Analysis] Extracting noise residual');
  const residual = new Float32Array(width * height);
  for (let i = 0; i < residual.length; i++) {
    residual[i] = grayscale[i] - denoised[i];
  }
  
  if (settings.showDebug) {
    window.debugData.residual = residual;
  }
  
  // STEP 4: Prepare square image for FFT (required for efficiency)
  // Find next power of 2 that fits both dimensions
  const maxDim = Math.max(width, height);
  const fftSize = nextPowerOf2(Math.min(maxDim, 1024)); // Cap at 1024 for performance
  
  const squareResidual = new Float32Array(fftSize * fftSize);
  
  // Center-crop the residual
  const offsetX = Math.floor((width - fftSize) / 2);
  const offsetY = Math.floor((height - fftSize) / 2);
  
  for (let y = 0; y < fftSize; y++) {
    for (let x = 0; x < fftSize; x++) {
      const srcX = Math.max(0, Math.min(width - 1, x + offsetX));
      const srcY = Math.max(0, Math.min(height - 1, y + offsetY));
      const srcIdx = srcY * width + srcX;
      const dstIdx = y * fftSize + x;
      squareResidual[dstIdx] = residual[srcIdx];
    }
  }
  
  // STEP 5: Compute 2D FFT
  // WHY: FFT reveals periodic patterns that are invisible in spatial domain
  // Natural sensor noise → random → smooth circular pattern
  // AI artifacts → periodic → grid/star spikes
  console.log(`[FFT Analysis] Computing 2D FFT (${fftSize}x${fftSize})`);
  const fftResult = fft2D(squareResidual, fftSize);
  
  // STEP 6: Compute magnitude and apply fftshift
  // fftshift centers the DC component (zero frequency)
  // WHY: Makes patterns symmetric and easier to interpret
  console.log('[FFT Analysis] Computing magnitude spectrum');
  const magnitude = new Float32Array(fftSize * fftSize);
  
  for (let i = 0; i < fftSize * fftSize; i++) {
    const real = fftResult.real[i];
    const imag = fftResult.imag[i];
    magnitude[i] = Math.sqrt(real * real + imag * imag);
  }
  
  // Apply fftshift
  const shifted = fftshift(magnitude, fftSize);
  
  if (settings.showDebug) {
    window.debugData.fftMagnitude = shifted;
  }
  
  // STEP 7: Apply log scaling for visualization
  // WHY: FFT magnitudes have huge dynamic range (10^6+)
  // Log scaling compresses this to visible range while preserving structure
  console.log('[FFT Analysis] Applying log scaling');
  const logScaled = new Float32Array(fftSize * fftSize);
  let maxLog = 0;
  
  for (let i = 0; i < fftSize * fftSize; i++) {
    logScaled[i] = Math.log(1 + shifted[i]);
    if (logScaled[i] > maxLog) maxLog = logScaled[i];
  }
  
  // STEP 8: Resize to original dimensions and normalize to [0, 255] for display
  console.log('[FFT Analysis] Resizing to original dimensions');
  const output = new ImageData(width, height);
  
  // Bilinear interpolation to resize from fftSize to original dimensions
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      // Map to FFT coordinates
      const fx = (x / width) * fftSize;
      const fy = (y / height) * fftSize;
      
      // Bilinear interpolation
      const x0 = Math.floor(fx);
      const x1 = Math.min(x0 + 1, fftSize - 1);
      const y0 = Math.floor(fy);
      const y1 = Math.min(y0 + 1, fftSize - 1);
      
      const dx = fx - x0;
      const dy = fy - y0;
      
      const v00 = logScaled[y0 * fftSize + x0];
      const v10 = logScaled[y0 * fftSize + x1];
      const v01 = logScaled[y1 * fftSize + x0];
      const v11 = logScaled[y1 * fftSize + x1];
      
      const v0 = v00 * (1 - dx) + v10 * dx;
      const v1 = v01 * (1 - dx) + v11 * dx;
      const value = v0 * (1 - dy) + v1 * dy;
      
      const normalized = (value / maxLog) * 255;
      const idx = (y * width + x) * 4;
      output.data[idx] = normalized;
      output.data[idx + 1] = normalized;
      output.data[idx + 2] = normalized;
      output.data[idx + 3] = 255;
    }
  }
  
  console.log('[FFT Analysis] Pipeline complete!');
  
  if (settings.showDebug) {
    console.log('Debug data available in window.debugData');
    console.log('Inspect: grayscale, denoised, residual, fftMagnitude');
  }
  
  return output;
}

/**
 * Find next power of 2
 */
function nextPowerOf2(n) {
  let power = 1;
  while (power < n) {
    power *= 2;
  }
  return power;
}

/**
 * Convert RGBA ImageData to grayscale float array [0,1]
 */
function rgbaToGrayscale(imageData) {
  const data = imageData.data;
  const grayscale = new Float32Array(imageData.width * imageData.height);
  
  for (let i = 0; i < grayscale.length; i++) {
    const idx = i * 4;
    // Standard luminance conversion
    const r = data[idx] / 255;
    const g = data[idx + 1] / 255;
    const b = data[idx + 2] / 255;
    grayscale[i] = 0.299 * r + 0.587 * g + 0.114 * b;
  }
  
  return grayscale;
}

/**
 * Gaussian blur for denoising
 * WHY: Removes noise while preserving structure
 * This creates our "clean" reference image
 */
function gaussianBlur(data, width, height, sigma) {
  // Create 1D Gaussian kernel
  const kernelSize = Math.ceil(sigma * 6) | 1; // Ensure odd
  const kernel = new Float32Array(kernelSize);
  const center = Math.floor(kernelSize / 2);
  let sum = 0;
  
  for (let i = 0; i < kernelSize; i++) {
    const x = i - center;
    kernel[i] = Math.exp(-(x * x) / (2 * sigma * sigma));
    sum += kernel[i];
  }
  
  // Normalize kernel
  for (let i = 0; i < kernelSize; i++) {
    kernel[i] /= sum;
  }
  
  // Separable convolution (horizontal then vertical)
  const temp = new Float32Array(width * height);
  const output = new Float32Array(width * height);
  
  // Horizontal pass
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let sum = 0;
      for (let k = 0; k < kernelSize; k++) {
        const xx = x + k - center;
        if (xx >= 0 && xx < width) {
          sum += data[y * width + xx] * kernel[k];
        }
      }
      temp[y * width + x] = sum;
    }
  }
  
  // Vertical pass
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let sum = 0;
      for (let k = 0; k < kernelSize; k++) {
        const yy = y + k - center;
        if (yy >= 0 && yy < height) {
          sum += temp[yy * width + x] * kernel[k];
        }
      }
      output[y * width + x] = sum;
    }
  }
  
  return output;
}

/**
 * 2D FFT implementation using Cooley-Tukey algorithm
 * Returns {real, imag} arrays
 */
function fft2D(data, size) {
  // Must be power of 2
  const n = size;
  
  // Initialize complex arrays
  const real = new Float32Array(n * n);
  const imag = new Float32Array(n * n);
  
  // Copy input data
  for (let i = 0; i < n * n; i++) {
    real[i] = data[i];
    imag[i] = 0;
  }
  
  // FFT rows
  for (let y = 0; y < n; y++) {
    const rowReal = real.slice(y * n, (y + 1) * n);
    const rowImag = imag.slice(y * n, (y + 1) * n);
    const result = fft1D(rowReal, rowImag);
    real.set(result.real, y * n);
    imag.set(result.imag, y * n);
  }
  
  // FFT columns
  for (let x = 0; x < n; x++) {
    const colReal = new Float32Array(n);
    const colImag = new Float32Array(n);
    for (let y = 0; y < n; y++) {
      colReal[y] = real[y * n + x];
      colImag[y] = imag[y * n + x];
    }
    const result = fft1D(colReal, colImag);
    for (let y = 0; y < n; y++) {
      real[y * n + x] = result.real[y];
      imag[y * n + x] = result.imag[y];
    }
  }
  
  return { real, imag };
}

/**
 * 1D FFT (Cooley-Tukey radix-2)
 */
function fft1D(real, imag) {
  const n = real.length;
  
  // Bit reversal
  const bitReversed = bitReverse(n);
  const outReal = new Float32Array(n);
  const outImag = new Float32Array(n);
  
  for (let i = 0; i < n; i++) {
    outReal[i] = real[bitReversed[i]];
    outImag[i] = imag[bitReversed[i]];
  }
  
  // Cooley-Tukey
  for (let len = 2; len <= n; len *= 2) {
    const halfLen = len / 2;
    const angle = -2 * Math.PI / len;
    
    for (let i = 0; i < n; i += len) {
      for (let j = 0; j < halfLen; j++) {
        const idx1 = i + j;
        const idx2 = i + j + halfLen;
        
        const thetaReal = Math.cos(angle * j);
        const thetaImag = Math.sin(angle * j);
        
        const tReal = outReal[idx2] * thetaReal - outImag[idx2] * thetaImag;
        const tImag = outReal[idx2] * thetaImag + outImag[idx2] * thetaReal;
        
        outReal[idx2] = outReal[idx1] - tReal;
        outImag[idx2] = outImag[idx1] - tImag;
        outReal[idx1] = outReal[idx1] + tReal;
        outImag[idx1] = outImag[idx1] + tImag;
      }
    }
  }
  
  return { real: outReal, imag: outImag };
}

/**
 * Bit reversal permutation for FFT
 */
function bitReverse(n) {
  const bits = Math.log2(n);
  const reversed = new Uint32Array(n);
  
  for (let i = 0; i < n; i++) {
    let rev = 0;
    for (let b = 0; b < bits; b++) {
      if (i & (1 << b)) {
        rev |= 1 << (bits - 1 - b);
      }
    }
    reversed[i] = rev;
  }
  
  return reversed;
}

/**
 * FFT shift - moves zero frequency to center
 * WHY: Makes patterns symmetric and interpretable
 */
function fftshift(data, size) {
  const shifted = new Float32Array(size * size);
  const half = Math.floor(size / 2);
  
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const newY = (y + half) % size;
      const newX = (x + half) % size;
      shifted[newY * size + newX] = data[y * size + x];
    }
  }
  
  return shifted;
}

function applyColorMap(data, idx, val) {
  if (settings.colorMap === 'grayscale') {
    data[idx] = val;
    data[idx + 1] = val;
    data[idx + 2] = val;
  } else if (settings.colorMap === 'heat') {
    // Heat map: blue -> cyan -> green -> yellow -> red
    const t = val / 255;
    if (t < 0.25) {
      data[idx] = 0;
      data[idx + 1] = t * 4 * 255;
      data[idx + 2] = 255;
    } else if (t < 0.5) {
      data[idx] = 0;
      data[idx + 1] = 255;
      data[idx + 2] = (1 - (t - 0.25) * 4) * 255;
    } else if (t < 0.75) {
      data[idx] = (t - 0.5) * 4 * 255;
      data[idx + 1] = 255;
      data[idx + 2] = 0;
    } else {
      data[idx] = 255;
      data[idx + 1] = (1 - (t - 0.75) * 4) * 255;
      data[idx + 2] = 0;
    }
  } else if (settings.colorMap === 'rainbow') {
    const hue = (val / 255) * 300;
    const rgb = hslToRgb(hue / 360, 1, 0.5);
    data[idx] = rgb[0];
    data[idx + 1] = rgb[1];
    data[idx + 2] = rgb[2];
  }
  data[idx + 3] = 255;
}

function hslToRgb(h, s, l) {
  let r, g, b;
  if (s === 0) {
    r = g = b = l;
  } else {
    const hue2rgb = (p, q, t) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1/6) return p + (q - p) * 6 * t;
      if (t < 1/2) return q;
      if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
      return p;
    };
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1/3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1/3);
  }
  return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
}

function createOverlay(targetElement, dataUrl) {
  const overlay = document.createElement('div');
  overlay.id = 'noise-analysis-overlay';
  overlay.className = 'noise-overlay';

  const rect = targetElement.getBoundingClientRect();
  overlay.style.left = rect.left + window.scrollX + 'px';
  overlay.style.top = rect.top + window.scrollY + 'px';
  overlay.style.width = rect.width + 'px';
  overlay.style.height = rect.height + 'px';

  // Original image (bottom layer)
  const originalImg = document.createElement('img');
  let sourceImageUrl = '';
  if (targetElement.tagName === 'IMG') {
    originalImg.src = targetElement.src;
    sourceImageUrl = targetElement.src;
  } else {
    // For background images, extract URL
    originalImg.style.display = 'none';
    const computed = window.getComputedStyle(targetElement);
    const bgImage = computed.backgroundImage || targetElement.style.backgroundImage;
    const urlMatch = bgImage && bgImage.match(/url\(['"]?([^'"()]+)['"]?\)/);
    if (urlMatch) sourceImageUrl = urlMatch[1];
  }
  originalImg.style.position = 'absolute';
  originalImg.style.top = '0';
  originalImg.style.left = '0';
  originalImg.style.width = '100%';
  originalImg.style.height = '100%';
  originalImg.style.objectFit = 'contain';

  // Analysis image (top layer with opacity)
  const analysisImg = document.createElement('img');
  analysisImg.src = dataUrl;
  analysisImg.style.position = 'absolute';
  analysisImg.style.top = '0';
  analysisImg.style.left = '0';
  analysisImg.style.width = '100%';
  analysisImg.style.height = '100%';
  analysisImg.style.objectFit = 'contain';
  analysisImg.style.opacity = settings.opacity / 100;

  const closeBtn = document.createElement('button');
  closeBtn.textContent = '\u00d7';
  closeBtn.className = 'close-btn';
  closeBtn.onclick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
    removeOverlay();
    return false;
  };

  const label = document.createElement('div');
  label.className = 'analysis-label';
  label.textContent = `${settings.analysisType.toUpperCase()} Analysis (${settings.sensitivity}x)`;

  // "Check Online" button on the overlay
  const checkBtn = document.createElement('button');
  checkBtn.textContent = 'Check Online';
  checkBtn.className = 'check-online-btn';
  checkBtn.onclick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    // Open C2PA Content Credentials verifier (the most useful public checker)
    chrome.runtime.sendMessage({
      action: 'openChecker',
      url: 'https://contentcredentials.org/verify'
    });
  };

  overlay.appendChild(originalImg);
  overlay.appendChild(analysisImg);
  overlay.appendChild(closeBtn);
  overlay.appendChild(checkBtn);
  overlay.appendChild(label);

  // Prevent clicks on overlay from propagating to page,
  // but let buttons handle their own clicks
  overlay.addEventListener('click', (e) => {
    if (e.target.closest('.close-btn') || e.target.closest('.check-online-btn')) return;
    e.stopPropagation();
    e.preventDefault();
  });

  document.body.appendChild(overlay);

  // Notify side panel that an image was analyzed
  chrome.runtime.sendMessage({
    action: 'imageAnalyzed',
    imageUrl: sourceImageUrl
  }).catch(() => {}); // Ignore if no listener
}

function removeOverlay() {
  const existing = document.getElementById('noise-analysis-overlay');
  if (existing) {
    existing.remove();
  }
  // Clear stored data when overlay is removed
  currentImageData = null;
  currentDisplayElement = null;

  // Notify side panel
  chrome.runtime.sendMessage({ action: 'overlayRemoved' }).catch(() => {});
}