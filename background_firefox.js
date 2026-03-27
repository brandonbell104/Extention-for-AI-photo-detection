// Firefox background script
// Firefox uses sidebar_action which opens automatically via its own toolbar button.
// When the browser_action icon is clicked, toggle the sidebar.
browser.browserAction.onClicked.addListener(() => {
  browser.sidebarAction.toggle();
});

// Background script to fetch images and bypass CORS
browser.runtime.onMessage.addListener((request, sender) => {
  if (request.action === 'fetchImage') {
    return fetchImageAsBase64(request.url)
      .then(base64 => ({ success: true, data: base64 }))
      .catch(error => ({ success: false, error: error.message }));
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
