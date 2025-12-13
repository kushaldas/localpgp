/**
 * LocalPGP Client API
 * 
 * This script is injected into web pages to provide a LocalPGP API.
 * It communicates with the content script via window.postMessage.
 */

(function() {
  'use strict';

  // Prevent multiple injections
  if (window.localpgp) {
    return;
  }

  const callbacks = {};
  let connected = false;

  function getUUID() {
    if (crypto.randomUUID) {
      return crypto.randomUUID().replace(/-/g, '');
    }
    let result = '';
    const buf = new Uint8Array(16);
    crypto.getRandomValues(buf);
    for (let i = 0; i < buf.length; i++) {
      result += buf[i].toString(16).padStart(2, '0');
    }
    return result;
  }

  function send(action, data = {}) {
    return new Promise((resolve, reject) => {
      const replyId = getUUID();
      callbacks[replyId] = { resolve, reject };
      
      window.postMessage({
        localpgp_client: true,
        action,
        _reply: replyId,
        ...data
      }, '*');

      // Timeout after 30 seconds
      setTimeout(() => {
        if (callbacks[replyId]) {
          delete callbacks[replyId];
          reject(new Error('Request timed out'));
        }
      }, 30000);
    });
  }

  function handleMessage(event) {
    if (event.source !== window) {
      return;
    }

    if (!event.data || !event.data.localpgp_extension) {
      return;
    }

    const data = event.data;

    // Handle ready event
    if (data.event === 'ready') {
      connected = true;
      window.dispatchEvent(new CustomEvent('localpgp-ready', { detail: window.localpgp }));
      return;
    }

    // Handle reply
    if (data._reply && callbacks[data._reply]) {
      const { resolve, reject } = callbacks[data._reply];
      delete callbacks[data._reply];

      if (data.success === false) {
        const error = new Error(data.error?.message || 'Operation failed');
        error.code = data.error?.code || 'UNKNOWN_ERROR';
        reject(error);
      } else {
        resolve(data);
      }
    }
  }

  // LocalPGP API object
  const localpgp = {
    /**
     * Check if the extension is connected
     */
    isConnected() {
      return connected;
    },

    /**
     * Connect to gpgme-json backend
     */
    connect() {
      return send('connect');
    },

    /**
     * Get connection status
     */
    getStatus() {
      return send('getStatus');
    },

    /**
     * Get keys from keyring
     * @param {Object} options - { pattern?: string, secret?: boolean }
     */
    getKeys(options = {}) {
      return send('getKeys', options);
    },

    /**
     * Get the default signing key
     */
    getDefaultKey() {
      return send('getDefaultKey');
    },

    /**
     * Import a key
     * @param {string} armored - Armored key data
     */
    importKey(armored) {
      return send('importKey', { armored });
    },

    /**
     * Encrypt data
     * @param {Object} options - { data: string, publicKeys: string[], armor?: boolean, alwaysTrust?: boolean }
     */
    encrypt(options) {
      return send('encrypt', {
        data: options.data,
        publicKeys: options.publicKeys,
        armor: options.armor !== false,
        always_trust: options.alwaysTrust
      });
    },

    /**
     * Decrypt data
     * @param {Object} options - { data: string, base64?: boolean }
     */
    decrypt(options) {
      return send('decrypt', {
        data: options.data,
        base64: options.base64
      });
    },

    /**
     * Sign data
     * @param {Object} options - { data: string, keys?: string[], mode?: 'clearsign' | 'detached', armor?: boolean }
     */
    sign(options) {
      return send('sign', {
        data: options.data,
        keys: options.keys,
        mode: options.mode || 'clearsign',
        armor: options.armor !== false
      });
    },

    /**
     * Verify signed data
     * @param {Object} options - { data: string, signature?: string }
     */
    verify(options) {
      return send('verify', {
        data: options.data,
        signature: options.signature
      });
    }
  };

  // Listen for messages from content script
  window.addEventListener('message', handleMessage);

  // Expose API
  window.localpgp = localpgp;

  // Dispatch event to notify page that API is available
  window.dispatchEvent(new CustomEvent('localpgp', { detail: localpgp }));
})();
