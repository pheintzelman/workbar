// background.ts
chrome.runtime.onInstalled.addListener(() => {
  console.log('Workbar extension installed');
});

chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch((error: unknown) => console.error(error));

// Temporary cache for large image data during drags
const dragCache = new Map<string, string>();

// Handle messages
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'download-image') {
    chrome.downloads.download({
      url: message.url,
      filename: message.filename || 'workbar-image.png',
      saveAs: false
    }, (downloadId) => {
      sendResponse({ success: !!downloadId });
    });
    return true; 
  }

  if (message.type === 'get-file-data') {
    fetch(message.url)
      .then(response => response.blob())
      .then(blob => {
        const reader = new FileReader();
        reader.onloadend = () => sendResponse({ dataUrl: reader.result });
        reader.readAsDataURL(blob);
      })
      .catch(error => {
        console.error('Background fetch failed:', error);
        sendResponse({ error: error.message });
      });
    return true;
  }

  // Drag Cache Management
  if (message.type === 'store-drag-data') {
    const dragId = message.dragId || crypto.randomUUID();
    dragCache.set(dragId, message.dataUrl);
    // Auto-expire after 30 seconds to prevent memory leaks
    setTimeout(() => dragCache.delete(dragId), 30000);
    sendResponse({ dragId });
    return true;
  }

  if (message.type === 'retrieve-drag-data') {
    const dataUrl = dragCache.get(message.dragId);
    sendResponse({ dataUrl });
    // Keep it in cache for a few more seconds just in case of multiple drops
    setTimeout(() => dragCache.delete(message.dragId), 5000);
    return true;
  }
});

interface TabMappings {
  [tabId: string]: string | null;
}

// Cleanup tab mappings when tabs are closed
chrome.tabs.onRemoved.addListener((tabId) => {
  if (chrome.storage.session) {
    chrome.storage.session.get(['tab_mappings'], (res) => {
      const tabMappings = (res.tab_mappings || {}) as TabMappings;
      const tid = tabId.toString();
      if (tabMappings[tid] !== undefined) {
        const newMappings = { ...tabMappings };
        delete newMappings[tid];
        chrome.storage.session.set({ tab_mappings: newMappings });
      }
    });
  }
});
