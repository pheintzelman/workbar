// content.js

const DEBUG_PREFIX = 'Workbar: ';

// State to prevent recursive event loops during spoofing
let isSpoofing = false;

const handleDragEvents = (e) => {
  if (isSpoofing) return;

  const hasWorkbarImage = e.dataTransfer?.types.includes('application/x-workbar-image');
  
  if (hasWorkbarImage) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';

    // 1. Spoof "Files" type to wake up standard drag-and-drop UIs (like Google Lens)
    // We dispatch a secondary event that looks like a real file drag.
    // We target the window and document as many global overlays listen there.
    if ((e.type === 'dragenter' || e.type === 'dragover') && !e.dataTransfer.types.includes('Files')) {
      isSpoofing = true;
      try {
        const dt = new DataTransfer();
        // Add a dummy file to ensure 'Files' is in the types list
        dt.items.add(new File([], "image.png", { type: "image/png" }));
        
        const spoofEvent = new DragEvent(e.type, {
          bubbles: true,
          cancelable: true,
          dataTransfer: dt,
          clientX: e.clientX,
          clientY: e.clientY,
          composed: true
        });
        
        // Dispatch to the target to let local listeners react
        e.target.dispatchEvent(spoofEvent);
        
        // Also dispatch to window if we are at the top level to trigger global overlays
        if (e.target === document.body || e.target === document.documentElement) {
          window.dispatchEvent(spoofEvent);
        }
      } catch (err) {
        console.error(DEBUG_PREFIX + 'Failed to spoof drag event:', err);
      } finally {
        isSpoofing = false;
      }
    }
  }
};

document.addEventListener('dragover', handleDragEvents, true);
document.addEventListener('dragenter', handleDragEvents, true);

document.addEventListener('drop', async (e) => {
  const payload = e.dataTransfer?.getData('application/x-workbar-image');
  if (!payload) return;

  e.preventDefault();
  e.stopPropagation();
  e.stopImmediatePropagation();

  // Try to get the actual target even if it's behind a shadow boundary
  const target = e.composedPath?.()[0] || e.target;
  if (!target) return;

  try {
    const data = JSON.parse(payload);
    console.log(DEBUG_PREFIX + 'Intercepted drop for:', data.name);

    let finalDataUrl = data.url;

    // If we have a dragId, it means the data was too large for the payload 
    // and is stored in the background cache
    if (data.dragId) {
      if (!chrome.runtime?.id) {
        console.error(DEBUG_PREFIX + 'Extension context invalidated. Please refresh the page.');
        return;
      }

      const response = await chrome.runtime.sendMessage({ 
        type: 'retrieve-drag-data', 
        dragId: data.dragId 
      });
      if (response?.dataUrl) {
        finalDataUrl = response.dataUrl;
      } else {
        throw new Error('Could not retrieve drag data from background cache');
      }
    }

    // 1. Convert Data URL to a real File object
    const response = await fetch(finalDataUrl);
    const blob = await response.blob();

    // Determine extension from payload mimeType or blob type
    const actualMimeType = data.mimeType || blob.type;
    const getExt = (m) => {
      if (m === 'image/jpeg') return 'jpg';
      if (m === 'image/png') return 'png';
      if (m === 'image/webp') return 'webp';
      if (m === 'image/gif') return 'gif';
      return 'png';
    };

    const ext = getExt(actualMimeType);
    const baseName = data.name.replace(/\.[^/.]+$/, "") || 'image';
    const fileName = `${baseName}.${ext}`;
    const file = new File([blob], fileName, { type: actualMimeType });

    // 3. Handle file input injection
    // If the target is a file input, or inside a label/container for one, 
    // we can try to inject the file directly.
    let fileInput = null;
    if (target.tagName === 'INPUT' && target.type === 'file') {
      fileInput = target;
    } else {
      // Look for a file input in the vicinity (common for "click to upload" areas)
      const container = target.closest('label, div, section');
      if (container) {
        fileInput = container.querySelector('input[type="file"]');
      }
    }

    if (fileInput) {
      console.log(DEBUG_PREFIX + 'Injecting file into input:', fileInput);
      const dataTransfer = new DataTransfer();
      dataTransfer.items.add(file);
      fileInput.files = dataTransfer.files;
      
      // Dispatch change event so the site reacts
      fileInput.dispatchEvent(new Event('change', { bubbles: true }));
      fileInput.dispatchEvent(new Event('input', { bubbles: true }));
      console.log(DEBUG_PREFIX + 'File injection complete.');
      return; // Stop here if we successfully handled it as an input
    }

    // 4. Fallback: Prepare the synthetic DataTransfer for standard drop zones
    const dt = new DataTransfer();
    dt.items.add(file);
    
    // Ensure effectAllowed and dropEffect are set correctly
    const eventOptions = {
      bubbles: true,
      cancelable: true,
      clientX: e.clientX,
      clientY: e.clientY,
      dataTransfer: dt,
      view: window,
      composed: true // Essential for shadow DOM
    };

    console.log(DEBUG_PREFIX + 'Dispatching synthetic events to:', target);

    // Dispatch the event sequence
    const enterEvt = new DragEvent('dragenter', eventOptions);
    const overEvt = new DragEvent('dragover', eventOptions);
    const dropEvt = new DragEvent('drop', eventOptions);

    target.dispatchEvent(enterEvt);
    target.dispatchEvent(overEvt);
    target.dispatchEvent(dropEvt);

    console.log(DEBUG_PREFIX + 'Synthetic drop complete.');
  } catch (err) {
    console.error(DEBUG_PREFIX + "Error during synthetic drop:", err);
  }
}, true);
