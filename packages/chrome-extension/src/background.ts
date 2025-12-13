/**
 * Chrome Extension Background Service Worker
 * 
 * Handles communication between popup/content scripts and gpgme-json
 */

import { init, type TinyOpenPGP } from 'tinyopgp';

let pgpInstance: TinyOpenPGP | null = null;
let connectionStatus: 'disconnected' | 'connecting' | 'connected' | 'error' = 'disconnected';
let connectionError: string | null = null;

// Built-in allowed origins (always allowed)
const BUILTIN_ORIGINS = [
  'http://localhost',
  'http://127.0.0.1',
  'https://localhost',
  'https://127.0.0.1',
];

/**
 * Check if an origin is allowed
 */
async function isOriginAllowed(origin: string): Promise<boolean> {
  // Check built-in origins
  for (const builtin of BUILTIN_ORIGINS) {
    if (origin.startsWith(builtin)) {
      return true;
    }
  }
  
  // Check user-added origins
  const result = await chrome.storage.local.get(['allowedOrigins']);
  const userOrigins: string[] = result.allowedOrigins || [];
  
  return userOrigins.some(allowed => origin.startsWith(allowed) || origin === allowed);
}

/**
 * Add origin to pending requests
 */
async function addPendingOrigin(origin: string): Promise<void> {
  const result = await chrome.storage.local.get(['pendingOrigins', 'allowedOrigins']);
  const pendingOrigins: string[] = result.pendingOrigins || [];
  const allowedOrigins: string[] = result.allowedOrigins || [];
  
  // Don't add if already pending or allowed
  if (pendingOrigins.includes(origin) || allowedOrigins.includes(origin)) {
    return;
  }
  
  // Check built-in origins
  for (const builtin of BUILTIN_ORIGINS) {
    if (origin.startsWith(builtin)) {
      return;
    }
  }
  
  pendingOrigins.push(origin);
  await chrome.storage.local.set({ pendingOrigins });
}

/**
 * Initialize the PGP backend
 */
async function initializePGP(): Promise<boolean> {
  if (pgpInstance) {
    return true;
  }

  connectionStatus = 'connecting';
  connectionError = null;

  try {
    pgpInstance = await init({ timeout: 5000 });
    connectionStatus = 'connected';
    console.log('LocalPGP: Connected to gpgme-json');
    return true;
  } catch (e) {
    connectionStatus = 'error';
    connectionError = e instanceof Error ? e.message : 'Unknown error';
    console.error('LocalPGP: Failed to connect to gpgme-json:', connectionError);
    return false;
  }
}

/**
 * Get connection status
 */
function getStatus() {
  return {
    status: connectionStatus,
    error: connectionError,
  };
}

/**
 * Message handler for extension communication
 */
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  handleMessage(message)
    .then(sendResponse)
    .catch(error => {
      sendResponse({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    });
  
  // Return true to indicate we'll respond asynchronously
  return true;
});

/**
 * External message handler for web pages
 * Allows websites to communicate with the extension
 */
chrome.runtime.onMessageExternal.addListener((message, sender, sendResponse) => {
  const origin = sender.origin || (sender.url ? new URL(sender.url).origin : '');
  
  // Handle permission request action specially
  if (message.action === 'requestPermission') {
    handlePermissionRequest(origin)
      .then(sendResponse)
      .catch(error => {
        sendResponse({
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      });
    return true;
  }
  
  // Check if origin is allowed for other actions
  isOriginAllowed(origin)
    .then(async (allowed) => {
      if (!allowed) {
        // Add to pending and return error
        await addPendingOrigin(origin);
        sendResponse({
          success: false,
          error: 'Origin not allowed. Please request permission first by calling with action: "requestPermission", then approve in extension options.',
          code: 'ORIGIN_NOT_ALLOWED',
        });
        return;
      }
      
      // Origin is allowed, handle the message
      return handleMessage(message);
    })
    .then(response => {
      if (response) sendResponse(response);
    })
    .catch(error => {
      sendResponse({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    });
  
  // Return true to indicate we'll respond asynchronously
  return true;
});

/**
 * Handle permission request from external page
 */
async function handlePermissionRequest(origin: string): Promise<{ success: boolean; allowed?: boolean; pending?: boolean; message?: string }> {
  // Check if already allowed
  const allowed = await isOriginAllowed(origin);
  if (allowed) {
    return { success: true, allowed: true, message: 'Origin is already allowed' };
  }
  
  // Add to pending
  await addPendingOrigin(origin);
  
  return { 
    success: true, 
    allowed: false, 
    pending: true,
    message: 'Permission request submitted. Please open the LocalPGP extension options to approve.' 
  };
}

/**
 * Handle incoming messages
 */
async function handleMessage(message: Record<string, unknown>) {
  const action = message.action as string;

  switch (action) {
    case 'getStatus':
    case 'status':
      return { success: true, data: getStatus() };

    case 'connect': {
      const connected = await initializePGP();
      return { success: connected, data: getStatus() };
    }

    case 'encrypt': {
      if (!pgpInstance) {
        return { success: false, error: 'Not connected' };
      }
      const result = await pgpInstance.encrypt({
        data: message.data as string,
        publicKeys: message.publicKeys as string[],
        armor: (message.armor as boolean) ?? true,
        alwaysTrust: message.always_trust as boolean | undefined,
      });
      return { success: true, data: result };
    }

    case 'decrypt': {
      if (!pgpInstance) {
        return { success: false, error: 'Not connected' };
      }
      const decryptOpts: { data: string; base64?: boolean } = {
        data: message.data as string,
      };
      if (typeof message.base64 === 'boolean') {
        decryptOpts.base64 = message.base64;
      }
      const result = await pgpInstance.decrypt(decryptOpts);
      return { success: true, data: result };
    }

    case 'sign': {
      if (!pgpInstance) {
        return { success: false, error: 'Not connected' };
      }
      const signOpts: { data: string; keys?: string | string[]; mode?: 'clearsign' | 'detached'; armor?: boolean } = {
        data: message.data as string,
        mode: ((message.mode as string) === 'detached') ? 'detached' : 'clearsign',
        armor: (message.armor as boolean) ?? true,
      };
      // Support both 'keys' and 'secretKeys' parameter names
      if (message.keys) {
        signOpts.keys = message.keys as string[];
      } else if (message.secretKeys) {
        signOpts.keys = message.secretKeys as string[];
      }
      const result = await pgpInstance.sign(signOpts);
      return { success: true, data: result };
    }

    case 'verify': {
      if (!pgpInstance) {
        return { success: false, error: 'Not connected' };
      }
      const verifyOpts: { data: string; signature?: string } = {
        data: message.data as string,
      };
      if (typeof message.signature === 'string') {
        verifyOpts.signature = message.signature;
      }
      const result = await pgpInstance.verify(verifyOpts);
      return { success: true, data: result };
    }

    case 'getKeys': {
      if (!pgpInstance) {
        return { success: false, error: 'Not connected' };
      }
      const keysOpts: { pattern?: string; secret?: boolean } = {};
      if (message.pattern) {
        keysOpts.pattern = message.pattern as string;
      }
      if (typeof message.secret === 'boolean') {
        keysOpts.secret = message.secret;
      }
      const keys = await pgpInstance.Keyring.getKeys(keysOpts);
      return { success: true, data: keys };
    }

    case 'getDefaultKey': {
      if (!pgpInstance) {
        return { success: false, error: 'Not connected' };
      }
      const key = await pgpInstance.Keyring.getDefaultKey();
      return { success: true, data: key };
    }

    case 'importKey': {
      if (!pgpInstance) {
        return { success: false, error: 'Not connected' };
      }
      const result = await pgpInstance.Keyring.importKey(
        message.armored as string,
        message.prepareSync as boolean | undefined
      );
      return { success: true, data: result };
    }

    default:
      return { success: false, error: `Unknown action: ${action}` };
  }
}

// Try to initialize on startup
initializePGP().catch(console.error);
