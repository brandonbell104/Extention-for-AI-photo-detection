// Firefox background script
// Toggle the sidebar when the browser action icon is clicked
browser.browserAction.onClicked.addListener(() => {
  browser.sidebarAction.toggle();
});

// Handle messages from content script and sidebar
browser.runtime.onMessage.addListener((request, sender) => {
  if (request.action === 'fetchImage') {
    // Fetch images via background to bypass CORS
    return fetchImageAsBase64(request.url)
      .then(base64 => ({ success: true, data: base64 }))
      .catch(error => ({ success: false, error: error.message }));
  }

  if (request.action === 'openChecker') {
    browser.tabs.create({ url: request.url });
    return;
  }

  // Relay messages from content script to sidebar
  if (request.action === 'imageAnalyzed' || request.action === 'overlayRemoved') {
    browser.runtime.sendMessage(request).catch(() => {});
    return;
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
