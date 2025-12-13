/**
 * LocalPGP Firefox Extension - Background Script
 * 
 * Handles communication between the extension UI and the gpgme-json native messaging host.
 * Uses tinyopgp library for all cryptographic operations.
 */

import { init, type TinyOpenPGP, GpgmeError, ErrorCodes } from 'tinyopgp';

// TinyOpenPGP instance for cryptographic operations
let pgpInstance: TinyOpenPGP | null = null;

// Initialize the connection
async function initializeGpgME(): Promise<void> {
  if (!pgpInstance) {
    pgpInstance = await init();
    console.log('GpgME initialized successfully');
  }
}

// Handle messages from popup and options pages
browser.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  // Handle async response
  handleMessage(message)
    .then(sendResponse)
    .catch((error) => {
      console.error('Message handler error:', error);
      sendResponse({
        success: false,
        error: error instanceof GpgmeError 
          ? { code: error.code, message: error.message }
          : { code: ErrorCodes.GNUPG_ERROR, message: String(error) }
      });
    });
  
  // Return true to indicate async response
  return true;
});

interface MessageRequest {
  action: string;
  data?: string;
  keys?: string[];
  publicKeys?: string[];  // Alias used by client API
  keyId?: string;
  fingerprint?: string;
  armor?: boolean;
  armored?: string;  // Alias used by client API for importKey
  pattern?: string;
  secret?: boolean;
  signature?: string;  // For detached verify
  options?: {
    armor?: boolean;
    alwaysTrust?: boolean;
    always_trust?: boolean;  // Alias used by client API
    base64?: boolean;
    mode?: 'clearsign' | 'detached';
  };
}

interface MessageResponse {
  success: boolean;
  data?: unknown;
  error?: {
    code: string;
    message: string;
  };
}

async function handleMessage(message: MessageRequest): Promise<MessageResponse> {
  try {
    await initializeGpgME();
    
    if (!pgpInstance) {
      throw new GpgmeError(ErrorCodes.CONN_NO_CONNECT, 'GpgME not initialized');
    }

    switch (message.action) {
      // Connection status
      case 'connect':
      case 'getStatus':
      case 'status': {
        return { success: true, data: { connected: true, version: '1.0.0' } };
      }

      // Key management
      case 'getKeys': {
        const keysOpts: { pattern?: string; secret?: boolean } = {};
        if (message.pattern || message.data) {
          keysOpts.pattern = message.pattern || message.data;
        }
        if (typeof message.secret === 'boolean') {
          keysOpts.secret = message.secret;
        }
        const keys = await pgpInstance.Keyring.getKeys(keysOpts);
        return { success: true, data: keys };
      }

      case 'getKeysArmored': {
        const armor = await pgpInstance.Keyring.getKeysArmored({
          pattern: message.data ? [message.data] : undefined,
        });
        return { success: true, data: armor };
      }

      case 'importKey': {
        const keyData = message.data || message.armored || '';
        const result = await pgpInstance.Keyring.importKey(keyData);
        return { success: true, data: result };
      }

      case 'deleteKey': {
        if (!message.fingerprint) {
          throw new GpgmeError(ErrorCodes.MSG_EMPTY, 'Fingerprint required');
        }
        await pgpInstance.Keyring.deleteKey(message.fingerprint);
        return { success: true };
      }

      case 'generateKey': {
        const key = await pgpInstance.Keyring.generateKey({
          userId: message.data || '',
        });
        return { success: true, data: key };
      }

      case 'getDefaultKey': {
        // Get the first key with a secret key (can be used for signing)
        const keys = await pgpInstance.Keyring.getKeys({ secret: true });
        if (keys && keys.length > 0) {
          return { success: true, data: keys[0] };
        }
        return { success: true, data: null };
      }

      // Cryptographic operations
      case 'encrypt': {
        const encryptKeys = message.keys || message.publicKeys;
        if (!message.data || !encryptKeys?.length) {
          throw new GpgmeError(ErrorCodes.MSG_EMPTY, 'Data and keys required');
        }
        const alwaysTrust = message.options?.alwaysTrust ?? message.options?.always_trust;
        const encrypted = await pgpInstance.encrypt({
          data: message.data,
          publicKeys: encryptKeys,
          armor: message.options?.armor ?? true,
          alwaysTrust: alwaysTrust,
        });
        return { success: true, data: encrypted };
      }

      case 'decrypt': {
        if (!message.data) {
          throw new GpgmeError(ErrorCodes.MSG_EMPTY, 'Data required');
        }
        const decryptOpts: { data: string; base64?: boolean } = { data: message.data };
        if (typeof message.options?.base64 === 'boolean') {
          decryptOpts.base64 = message.options.base64;
        }
        const decrypted = await pgpInstance.decrypt(decryptOpts);
        return { success: true, data: decrypted };
      }

      case 'sign': {
        if (!message.data) {
          throw new GpgmeError(ErrorCodes.MSG_EMPTY, 'Data required');
        }
        const signOpts: { data: string; keys?: string[]; mode?: 'clearsign' | 'detached'; armor?: boolean } = {
          data: message.data,
          mode: message.options?.mode || 'clearsign',
          armor: message.options?.armor ?? true,
        };
        if (message.keys) {
          signOpts.keys = message.keys;
        }
        const signed = await pgpInstance.sign(signOpts);
        return { success: true, data: signed };
      }

      case 'verify': {
        if (!message.data) {
          throw new GpgmeError(ErrorCodes.MSG_EMPTY, 'Data required');
        }
        const verifyOpts: { data: string; signature?: string } = { data: message.data };
        // Support detached signature via signature param or options.mode
        if (message.signature) {
          verifyOpts.signature = message.signature;
        } else if (message.options?.mode === 'detached' && message.keys?.[0]) {
          verifyOpts.signature = message.keys[0];
        }
        const verified = await pgpInstance.verify(verifyOpts);
        return { success: true, data: verified };
      }

      default:
        throw new GpgmeError(ErrorCodes.MSG_UNEXPECTED, `Unknown action: ${message.action}`);
    }
  } catch (error) {
    console.error('GpgME operation failed:', error);
    throw error;
  }
}

// Handle extension installation
browser.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    console.log('LocalPGP Firefox extension installed');
    // Open options page on first install
    browser.runtime.openOptionsPage();
  }
});

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
  const result = await browser.storage.local.get(['allowedOrigins']);
  const userOrigins: string[] = (result.allowedOrigins as string[]) || [];
  
  return userOrigins.some(allowed => origin.startsWith(allowed) || origin === allowed);
}

/**
 * Inject content script into a tab if the origin is allowed
 */
async function injectContentScript(tabId: number, url: string): Promise<void> {
  try {
    const origin = new URL(url).origin;
    const allowed = await isOriginAllowed(origin);
    
    if (allowed) {
      await browser.scripting.executeScript({
        target: { tabId },
        files: ['content-script.js']
      });
      console.log(`LocalPGP: Injected content script into ${origin}`);
    }
  } catch (error) {
    // Ignore errors (e.g., can't inject into about: pages)
    console.log('LocalPGP: Could not inject content script:', error);
  }
}

// Listen for tab navigation to inject content scripts
browser.webNavigation.onDOMContentLoaded.addListener(async (details) => {
  if (details.frameId === 0) { // Only main frame
    await injectContentScript(details.tabId, details.url);
  }
});

// Also handle already open tabs when extension loads
async function injectIntoExistingTabs(): Promise<void> {
  const tabs = await browser.tabs.query({});
  for (const tab of tabs) {
    if (tab.id && tab.url) {
      await injectContentScript(tab.id, tab.url);
    }
  }
}

// Inject into existing tabs on startup
injectIntoExistingTabs().catch(console.error);

// Listen for storage changes to inject content scripts when origins are added
browser.storage.onChanged.addListener(async (changes, areaName) => {
  if (areaName === 'local' && changes.allowedOrigins) {
    const oldOrigins: string[] = changes.allowedOrigins.oldValue || [];
    const newOrigins: string[] = changes.allowedOrigins.newValue || [];
    
    // Find newly added origins
    const addedOrigins = newOrigins.filter(o => !oldOrigins.includes(o));
    
    if (addedOrigins.length > 0) {
      console.log('LocalPGP: New origins added:', addedOrigins);
      
      // Inject content script into tabs that match the new origins
      const tabs = await browser.tabs.query({});
      for (const tab of tabs) {
        if (tab.id && tab.url) {
          try {
            const tabOrigin = new URL(tab.url).origin;
            if (addedOrigins.some(o => tabOrigin.startsWith(o) || tabOrigin === o)) {
              await browser.scripting.executeScript({
                target: { tabId: tab.id },
                files: ['content-script.js']
              });
              console.log(`LocalPGP: Injected content script into newly allowed tab: ${tabOrigin}`);
            }
          } catch (error) {
            console.log('LocalPGP: Could not inject into tab:', error);
          }
        }
      }
    }
  }
});

console.log('LocalPGP Firefox background script loaded');
