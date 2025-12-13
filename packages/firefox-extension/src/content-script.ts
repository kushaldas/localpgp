/**
 * LocalPGP Firefox Extension - Content Script
 * 
 * This content script acts as a bridge between web pages and the extension.
 * It injects the client API script and relays messages via window.postMessage.
 */

// Inject the client API script into the page
function injectClientAPI() {
  // Check if already injected
  if (document.getElementById('localpgp-api')) {
    return;
  }

  const script = document.createElement('script');
  script.id = 'localpgp-api';
  script.src = browser.runtime.getURL('localpgp-client-api.js');
  (document.head || document.documentElement).appendChild(script);
}

// Handle messages from the web page (via window.postMessage)
function handlePageMessage(event: MessageEvent) {
  // Only accept messages from the same window
  if (event.source !== window) {
    return;
  }

  // Only accept messages meant for the extension
  if (!event.data || !event.data.localpgp_client) {
    return;
  }

  const { localpgp_client, ...data } = event.data;

  // Forward to background script
  browser.runtime.sendMessage(data)
    .then(response => {
      // Send response back to page
      window.postMessage({
        localpgp_extension: true,
        _reply: data._reply,
        ...response
      }, '*');
    })
    .catch(error => {
      // Send error back to page
      window.postMessage({
        localpgp_extension: true,
        _reply: data._reply,
        success: false,
        error: {
          code: 'EXTENSION_ERROR',
          message: error.message || String(error)
        }
      }, '*');
    });
}

// Initialize
window.addEventListener('message', handlePageMessage);
injectClientAPI();

// Notify page that extension is ready
window.postMessage({ localpgp_extension: true, event: 'ready' }, '*');
