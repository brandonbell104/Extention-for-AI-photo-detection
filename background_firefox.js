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

  if (request.action === 'downloadAndOpenChecker') {
    const imageUrl = request.imageUrl;
    const checkerUrl = request.checkerUrl;

    if (imageUrl && imageUrl !== '(screen capture)') {
      const urlPath = new URL(imageUrl).pathname;
      const ext = urlPath.split('.').pop().match(/^(jpg|jpeg|png|gif|webp|bmp|avif)$/i) ? urlPath.split('.').pop() : 'png';
      const filename = `image-check.${ext}`;

      browser.downloads.download({
        url: imageUrl,
        filename: filename,
        saveAs: false
      }).then(() => {
        browser.tabs.create({ url: checkerUrl });
      });
    } else if (request.dataUrl) {
      browser.downloads.download({
        url: request.dataUrl,
        filename: 'image-check.png',
        saveAs: false
      }).then(() => {
        browser.tabs.create({ url: checkerUrl });
      });
    } else {
      browser.tabs.create({ url: checkerUrl });
    }
    return;
  }

  if (request.action === 'captureTab') {
    return browser.tabs.captureVisibleTab(null, { format: 'png' })
      .then(dataUrl => ({ dataUrl }));
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
