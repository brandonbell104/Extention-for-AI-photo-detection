// Open side panel when extension icon is clicked
chrome.action.onClicked.addListener((tab) => {
  chrome.sidePanel.open({ windowId: tab.windowId });
});

// Background service worker handles messages from content script and side panel
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'fetchImage') {
    // Fetch images via background to bypass CORS
    fetchImageAsBase64(request.url)
      .then(base64 => sendResponse({ success: true, data: base64 }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true; // Keep channel open for async response
  }

  if (request.action === 'openChecker') {
    // Open an online checker service in a new tab
    chrome.tabs.create({ url: request.url });
    return false;
  }

  // Relay messages from content script to side panel (and vice versa)
  // This allows content.js to notify the side panel about image analysis
  if (request.action === 'imageAnalyzed' || request.action === 'overlayRemoved') {
    // Forward to all extension pages (side panel, popup)
    chrome.runtime.sendMessage(request).catch(() => {});
    return false;
  }
});

async function fetchImageAsBase64(url) {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const blob = await response.blob();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch (error) {
    throw new Error(`Failed to fetch image: ${error.message}`);
  }
}
