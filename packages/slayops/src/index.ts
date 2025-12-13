/**
 * SlayOps - Simple JavaScript API for LocalPGP browser extension
 * 
 * Provides easy-to-use functions for OpenPGP operations via the LocalPGP
 * browser extension and gpgme-json native messaging.
 * 
 * @example
 * ```javascript
 * import { SlayOps } from 'slayops';
 * 
 * const pgp = new SlayOps();
 * await pgp.connect();
 * 
 * const keys = await pgp.getKeys();
 * const encrypted = await pgp.encrypt('Hello!', ['recipient@example.com']);
 * const decrypted = await pgp.decrypt(encrypted);
 * ```
 */

// ============================================================================
// Types
// ============================================================================

/** Browser types that SlayOps can detect and work with */
export type BrowserType = 
  | 'chrome'           // Chrome with extension API available
  | 'chrome-no-api'    // Chrome but extension not responding
  | 'firefox'          // Firefox web page (needs content script)
  | 'firefox-injected' // Firefox with injected client API
  | 'firefox-extension'// Running inside Firefox extension
  | 'chrome-extension' // Running inside Chrome extension
  | 'unknown';

/** Connection status */
export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

/** Key user ID information */
export interface KeyUserId {
  uid: string;
  name: string;
  email: string;
  comment?: string;
  isRevoked?: boolean;
  isInvalid?: boolean;
}

/** Subkey information */
export interface SubKey {
  keyId: string;
  fingerprint: string;
  created: string;
  expires?: string;
  isRevoked: boolean;
  isExpired: boolean;
  isDisabled: boolean;
  isInvalid: boolean;
  canEncrypt: boolean;
  canSign: boolean;
  canCertify: boolean;
  canAuthenticate: boolean;
  algorithm: string;
  length: number;
  curve?: string;
  isCardKey: boolean;
  cardNumber?: string;
}

/** OpenPGP key information */
export interface PGPKey {
  fingerprint: string;
  keyId: string;
  userIds: KeyUserId[];
  subkeys: SubKey[];
  hasSecret: boolean;
  canEncrypt: boolean;
  canSign: boolean;
  canCertify: boolean;
  canAuthenticate: boolean;
  isRevoked: boolean;
  isExpired: boolean;
  isDisabled: boolean;
  isInvalid: boolean;
  created: string;
  expires?: string;
}

/** Signature information from verification */
export interface Signature {
  fingerprint: string;
  valid: boolean;
  status?: string;
  created?: string;
  summary?: {
    valid: boolean;
    green: boolean;
    red: boolean;
    keyRevoked: boolean;
    keyExpired: boolean;
    sigExpired: boolean;
    keyMissing: boolean;
  };
}

/** Encrypt options */
export interface EncryptOptions {
  /** Data to encrypt */
  data: string;
  /** Recipient key fingerprints or emails */
  recipients: string[];
  /** Whether to output ASCII armored (default: true) */
  armor?: boolean;
  /** Whether to sign while encrypting */
  sign?: boolean;
  /** Signing key fingerprint (uses default if not specified) */
  signingKey?: string;
  /** Trust recipients without verification */
  alwaysTrust?: boolean;
}

/** Decrypt result */
export interface DecryptResult {
  /** Decrypted data */
  data: string;
  /** Signatures if message was signed */
  signatures?: Signature[];
  /** Whether the message was MIME formatted */
  isMime?: boolean;
}

/** Sign options */
export interface SignOptions {
  /** Data to sign */
  data: string;
  /** Signing key fingerprint (uses default if not specified) */
  signingKey?: string;
  /** Signature mode: 'clearsign' (default) or 'detached' */
  mode?: 'clearsign' | 'detached';
  /** Whether to output ASCII armored (default: true) */
  armor?: boolean;
}

/** Verify result */
export interface VerifyResult {
  /** Original data (for clearsigned messages) */
  data?: string;
  /** Whether the signature is valid */
  isValid: boolean;
  /** Signature information */
  signatures: Signature[];
  /** Whether the message was MIME formatted */
  isMime?: boolean;
}

/** Event types */
export type SlayOpsEventType = 'connected' | 'disconnected' | 'error' | 'ready';

/** Event handler */
export type SlayOpsEventHandler = (data?: unknown) => void;

/** Configuration options */
export interface SlayOpsConfig {
  /** Chrome extension ID (default: afaoooloeghgffoacafdcomoooejfgcf) */
  chromeExtensionId?: string;
  /** Firefox extension ID (default: localpgp@localpgp.org) */
  firefoxExtensionId?: string;
  /** Request timeout in milliseconds (default: 30000) */
  timeout?: number;
  /** Auto-connect on instantiation (default: false) */
  autoConnect?: boolean;
}

// ============================================================================
// Internal Types
// ============================================================================

interface ExtensionResponse {
  success: boolean;
  data?: unknown;
  error?: {
    code?: string;
    message?: string;
  } | string;
  code?: string;
}

interface PendingRequest {
  resolve: (value: ExtensionResponse) => void;
  reject: (error: Error) => void;
}

// ============================================================================
// SlayOps Class
// ============================================================================

/**
 * SlayOps - Main class for interacting with LocalPGP extension
 */
export class SlayOps {
  private chromeExtensionId: string;
  private firefoxExtensionId: string;
  private timeout: number;
  private browserType: BrowserType = 'unknown';
  private connectionStatus: ConnectionStatus = 'disconnected';
  private firefoxCallbacks: Map<string, PendingRequest> = new Map();
  private firefoxExtensionReady = false;
  private eventHandlers: Map<SlayOpsEventType, Set<SlayOpsEventHandler>> = new Map();
  private initialized = false;

  constructor(config: SlayOpsConfig = {}) {
    this.chromeExtensionId = config.chromeExtensionId || 'afaoooloeghgffoacafdcomoooejfgcf';
    this.firefoxExtensionId = config.firefoxExtensionId || 'localpgp@localpgp.org';
    this.timeout = config.timeout || 30000;

    this.init();

    if (config.autoConnect) {
      this.connect().catch(() => {});
    }
  }

  // ==========================================================================
  // Initialization
  // ==========================================================================

  private init(): void {
    if (this.initialized) return;
    this.initialized = true;

    // Setup Firefox message listener
    if (typeof window !== 'undefined') {
      window.addEventListener('message', this.handleWindowMessage.bind(this));
      
      // Listen for Firefox extension ready event
      window.addEventListener('localpgp-ready', () => {
        this.firefoxExtensionReady = true;
        this.browserType = 'firefox-injected';
        this.emit('ready');
      });

      // Check if already injected
      if ((window as unknown as { localpgp?: unknown }).localpgp) {
        this.firefoxExtensionReady = true;
      }
    }

    // Detect browser type
    this.browserType = this.detectBrowser();
  }

  private handleWindowMessage(event: MessageEvent): void {
    if (event.source !== window) return;
    if (!event.data || !event.data.localpgp_extension) return;

    const data = event.data;

    // Handle ready event
    if (data.event === 'ready') {
      this.firefoxExtensionReady = true;
      this.browserType = 'firefox-injected';
      this.emit('ready');
      return;
    }

    // Handle reply
    if (data._reply && this.firefoxCallbacks.has(data._reply)) {
      const { resolve, reject } = this.firefoxCallbacks.get(data._reply)!;
      this.firefoxCallbacks.delete(data._reply);

      if (data.success === false) {
        reject(new Error(data.error?.message || data.error || 'Operation failed'));
      } else {
        resolve(data);
      }
    }
  }

  // ==========================================================================
  // Browser Detection
  // ==========================================================================

  /**
   * Detect the current browser type
   */
  detectBrowser(): BrowserType {
    if (typeof window === 'undefined') {
      return 'unknown';
    }

    // Check if running inside extension context
    if (window.location.protocol === 'moz-extension:') {
      return 'firefox-extension';
    }
    if (window.location.protocol === 'chrome-extension:') {
      return 'chrome-extension';
    }

    // For regular web pages, detect browser from user agent
    const ua = navigator.userAgent.toLowerCase();
    
    if (ua.includes('firefox')) {
      // Check if localpgp API was injected
      if ((window as unknown as { localpgp?: unknown }).localpgp || this.firefoxExtensionReady) {
        return 'firefox-injected';
      }
      return 'firefox';
    } else if (ua.includes('chrome') || ua.includes('chromium')) {
      // Check if Chrome extension API is available
      if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
        return 'chrome';
      }
      return 'chrome-no-api';
    }

    return 'unknown';
  }

  /**
   * Get the detected browser type
   */
  getBrowserType(): BrowserType {
    return this.browserType;
  }

  /**
   * Get current connection status
   */
  getStatus(): ConnectionStatus {
    return this.connectionStatus;
  }

  /**
   * Check if connected to the extension
   */
  isConnected(): boolean {
    return this.connectionStatus === 'connected';
  }

  // ==========================================================================
  // Event Handling
  // ==========================================================================

  /**
   * Add an event listener
   */
  on(event: SlayOpsEventType, handler: SlayOpsEventHandler): void {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, new Set());
    }
    this.eventHandlers.get(event)!.add(handler);
  }

  /**
   * Remove an event listener
   */
  off(event: SlayOpsEventType, handler: SlayOpsEventHandler): void {
    this.eventHandlers.get(event)?.delete(handler);
  }

  private emit(event: SlayOpsEventType, data?: unknown): void {
    this.eventHandlers.get(event)?.forEach(handler => handler(data));
  }

  // ==========================================================================
  // Extension Communication
  // ==========================================================================

  private generateId(): string {
    return Math.random().toString(36).substring(2) + Date.now().toString(36);
  }

  private async sendToExtension(action: string, data: Record<string, unknown> = {}): Promise<ExtensionResponse> {
    const browserType = this.browserType;

    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error('Request timed out'));
      }, this.timeout);

      const handleResponse = (response: ExtensionResponse | undefined) => {
        clearTimeout(timeoutId);
        if (!response) {
          reject(new Error('No response from extension'));
        } else if (response.success === false) {
          if (response.code === 'ORIGIN_NOT_ALLOWED') {
            reject(new Error('PERMISSION_REQUIRED: Please allow this site in LocalPGP extension options'));
          } else {
            const errorMsg = typeof response.error === 'string' 
              ? response.error 
              : response.error?.message || 'Operation failed';
            reject(new Error(errorMsg));
          }
        } else {
          resolve(response);
        }
      };

      try {
        if (browserType === 'chrome') {
          if (!chrome?.runtime?.sendMessage) {
            clearTimeout(timeoutId);
            reject(new Error('Chrome extension API not available'));
            return;
          }

          chrome.runtime.sendMessage(
            this.chromeExtensionId,
            { action, ...data },
            (response) => {
              if (chrome.runtime.lastError) {
                clearTimeout(timeoutId);
                reject(new Error(chrome.runtime.lastError.message));
              } else {
                handleResponse(response);
              }
            }
          );
        } else if (browserType === 'firefox-extension') {
          (window as unknown as { browser: typeof browser }).browser.runtime
            .sendMessage({ action, ...data })
            .then(handleResponse)
            .catch((err: Error) => {
              clearTimeout(timeoutId);
              reject(err);
            });
        } else if (browserType === 'chrome-extension') {
          chrome.runtime.sendMessage({ action, ...data }, (response) => {
            if (chrome.runtime.lastError) {
              clearTimeout(timeoutId);
              reject(new Error(chrome.runtime.lastError.message));
            } else {
              handleResponse(response);
            }
          });
        } else if (browserType === 'firefox-injected' || browserType === 'firefox') {
          const localpgp = (window as unknown as { localpgp?: { [key: string]: (data: unknown) => Promise<unknown> } }).localpgp;
          
          if (localpgp && typeof localpgp[action] === 'function') {
            // Use injected API directly
            localpgp[action](data)
              .then((result) => handleResponse({ success: true, data: result }))
              .catch((err: Error) => {
                clearTimeout(timeoutId);
                reject(err);
              });
          } else if (this.firefoxExtensionReady || browserType === 'firefox-injected') {
            // Use postMessage
            const replyId = this.generateId();
            this.firefoxCallbacks.set(replyId, {
              resolve: (resp) => {
                clearTimeout(timeoutId);
                resolve(resp);
              },
              reject: (err) => {
                clearTimeout(timeoutId);
                reject(err);
              }
            });

            window.postMessage({
              localpgp_client: true,
              action,
              _reply: replyId,
              ...data
            }, '*');
          } else {
            clearTimeout(timeoutId);
            reject(new Error('Firefox extension not detected. Add this site to Allowed Sites in extension options.'));
          }
        } else if (browserType === 'chrome-no-api') {
          clearTimeout(timeoutId);
          reject(new Error('Chrome extension not responding. Make sure LocalPGP is installed and this site is allowed.'));
        } else {
          clearTimeout(timeoutId);
          reject(new Error('No extension API available. Install the LocalPGP extension.'));
        }
      } catch (err) {
        clearTimeout(timeoutId);
        reject(err);
      }
    });
  }

  // ==========================================================================
  // Public API - Connection
  // ==========================================================================

  /**
   * Connect to the LocalPGP extension and gpgme-json backend
   * 
   * @throws Error if connection fails or permission is required
   * 
   * @example
   * ```javascript
   * const pgp = new SlayOps();
   * try {
   *   await pgp.connect();
   *   console.log('Connected!');
   * } catch (err) {
   *   if (err.message.includes('PERMISSION_REQUIRED')) {
   *     console.log('Please allow this site in extension options');
   *   }
   * }
   * ```
   */
  async connect(): Promise<void> {
    this.connectionStatus = 'connecting';
    
    try {
      await this.sendToExtension('connect');
      this.connectionStatus = 'connected';
      this.emit('connected');
    } catch (error) {
      this.connectionStatus = 'error';
      this.emit('error', error);
      throw error;
    }
  }

  /**
   * Request permission from the extension (Chrome only)
   * Opens the permission request flow
   */
  async requestPermission(): Promise<{ allowed: boolean; pending: boolean; message?: string }> {
    if (this.browserType !== 'chrome') {
      throw new Error('Permission request is only available for Chrome. For Firefox, add the site in extension options.');
    }

    const response = await this.sendToExtension('requestPermission');
    return response.data as { allowed: boolean; pending: boolean; message?: string };
  }

  // ==========================================================================
  // Public API - Key Management
  // ==========================================================================

  /**
   * Get keys from the GnuPG keyring
   * 
   * @param pattern - Optional search pattern (email, name, or fingerprint)
   * @param secretOnly - Only return keys with secret key available
   * 
   * @example
   * ```javascript
   * // Get all keys
   * const allKeys = await pgp.getKeys();
   * 
   * // Search for specific keys
   * const keys = await pgp.getKeys('alice@example.com');
   * 
   * // Get only secret keys
   * const secretKeys = await pgp.getKeys('', true);
   * ```
   */
  async getKeys(pattern?: string, secretOnly?: boolean): Promise<PGPKey[]> {
    const params: Record<string, unknown> = {};
    if (pattern) params.pattern = pattern;
    if (secretOnly) params.secret = true;

    const response = await this.sendToExtension('getKeys', params);
    return (response.data || []) as PGPKey[];
  }

  /**
   * Get the default signing key
   * 
   * @returns The default key or null if none configured
   */
  async getDefaultKey(): Promise<PGPKey | null> {
    const response = await this.sendToExtension('getDefaultKey');
    return (response.data as PGPKey) || null;
  }

  /**
   * Import a PGP key into the keyring
   * 
   * @param armoredKey - ASCII armored key data
   * @returns Import result with counts
   */
  async importKey(armoredKey: string): Promise<{ imported: number; unchanged: number }> {
    const response = await this.sendToExtension('importKey', { data: armoredKey, armored: armoredKey });
    return response.data as { imported: number; unchanged: number };
  }

  // ==========================================================================
  // Public API - Encryption & Decryption
  // ==========================================================================

  /**
   * Encrypt a message for one or more recipients
   * 
   * @param data - The message to encrypt
   * @param recipients - Array of recipient fingerprints or emails
   * @param options - Additional encryption options
   * @returns ASCII armored encrypted message
   * 
   * @example
   * ```javascript
   * // Simple encryption
   * const encrypted = await pgp.encrypt('Secret message', ['alice@example.com']);
   * 
   * // Encrypt and sign
   * const encrypted = await pgp.encrypt('Secret message', ['alice@example.com'], {
   *   sign: true
   * });
   * 
   * // Encrypt to multiple recipients
   * const encrypted = await pgp.encrypt('Secret', [
   *   'alice@example.com',
   *   'bob@example.com'
   * ]);
   * ```
   */
  async encrypt(
    data: string,
    recipients: string[],
    options: Partial<Omit<EncryptOptions, 'data' | 'recipients'>> = {}
  ): Promise<string> {
    const params: Record<string, unknown> = {
      data,
      publicKeys: recipients,
      keys: recipients,
      armor: options.armor !== false,
    };

    if (options.sign) params.sign = true;
    if (options.signingKey) params.signingKey = options.signingKey;
    if (options.alwaysTrust) params.always_trust = true;

    const response = await this.sendToExtension('encrypt', params);
    const result = response.data as { data?: string } | string;
    return typeof result === 'string' ? result : result?.data || '';
  }

  /**
   * Decrypt a PGP encrypted message
   * 
   * @param encryptedData - ASCII armored encrypted message
   * @returns Decrypted data and signature information
   * 
   * @example
   * ```javascript
   * const result = await pgp.decrypt(encryptedMessage);
   * console.log('Decrypted:', result.data);
   * 
   * if (result.signatures?.length > 0) {
   *   console.log('Signed by:', result.signatures[0].fingerprint);
   * }
   * ```
   */
  async decrypt(encryptedData: string): Promise<DecryptResult> {
    const response = await this.sendToExtension('decrypt', { data: encryptedData });
    const result = response.data as DecryptResult;
    return {
      data: result.data || '',
      signatures: result.signatures,
      isMime: result.isMime
    };
  }

  // ==========================================================================
  // Public API - Signing & Verification
  // ==========================================================================

  /**
   * Sign a message
   * 
   * @param data - The message to sign
   * @param options - Signing options
   * @returns Signed message (clearsign) or detached signature
   * 
   * @example
   * ```javascript
   * // Clearsign (message + signature together)
   * const signed = await pgp.sign('My message');
   * 
   * // Detached signature
   * const signature = await pgp.sign('My message', { mode: 'detached' });
   * 
   * // Sign with specific key
   * const signed = await pgp.sign('My message', {
   *   signingKey: '5286C32E7C71E14C4C82F9AE0B207108925CB162'
   * });
   * ```
   */
  async sign(
    data: string,
    options: Partial<Omit<SignOptions, 'data'>> = {}
  ): Promise<string> {
    const params: Record<string, unknown> = {
      data,
      mode: options.mode || 'clearsign',
      armor: options.armor !== false
    };

    if (options.signingKey) {
      params.keys = [options.signingKey];
      params.secretKeys = [options.signingKey];
    }

    const response = await this.sendToExtension('sign', params);
    const result = response.data as { data?: string } | string;
    return typeof result === 'string' ? result : result?.data || '';
  }

  /**
   * Verify a signed message
   * 
   * @param signedData - Clearsigned message or original data (for detached)
   * @param detachedSignature - Detached signature (if not clearsigned)
   * @returns Verification result with signature information
   * 
   * @example
   * ```javascript
   * // Verify clearsigned message
   * const result = await pgp.verify(clearsignedMessage);
   * console.log('Valid:', result.isValid);
   * 
   * // Verify detached signature
   * const result = await pgp.verify(originalMessage, detachedSignature);
   * ```
   */
  async verify(signedData: string, detachedSignature?: string): Promise<VerifyResult> {
    const params: Record<string, unknown> = { data: signedData };
    
    if (detachedSignature) {
      params.signature = detachedSignature;
    }

    const response = await this.sendToExtension('verify', params);
    const result = response.data as VerifyResult;
    
    return {
      data: result.data,
      isValid: result.isValid,
      signatures: result.signatures || [],
      isMime: result.isMime
    };
  }

  // ==========================================================================
  // Utility Methods
  // ==========================================================================

  /**
   * Check if the extension is available (not necessarily connected)
   */
  isExtensionAvailable(): boolean {
    const type = this.browserType;
    return type === 'chrome' || 
           type === 'firefox-injected' || 
           type === 'firefox-extension' || 
           type === 'chrome-extension' ||
           this.firefoxExtensionReady;
  }

  /**
   * Get a human-readable status message
   */
  getStatusMessage(): string {
    const browser = this.browserType;
    const status = this.connectionStatus;

    if (status === 'connected') {
      return 'Connected to LocalPGP';
    }

    switch (browser) {
      case 'chrome':
        return 'Ready - Click connect to start';
      case 'chrome-no-api':
        return 'Chrome extension not responding. Check if LocalPGP is installed.';
      case 'firefox-injected':
        return 'Ready - LocalPGP extension detected';
      case 'firefox':
        return 'Add this site to Allowed Sites in LocalPGP extension options, then reload.';
      case 'firefox-extension':
      case 'chrome-extension':
        return 'Running inside extension context';
      default:
        return 'Install the LocalPGP browser extension';
    }
  }
}

// ============================================================================
// Default Export & Factory Function
// ============================================================================

/**
 * Create a new SlayOps instance
 * 
 * @example
 * ```javascript
 * import { createSlayOps } from 'slayops';
 * 
 * const pgp = createSlayOps({ autoConnect: true });
 * ```
 */
export function createSlayOps(config?: SlayOpsConfig): SlayOps {
  return new SlayOps(config);
}

// Default instance for simple usage
let defaultInstance: SlayOps | null = null;

/**
 * Get or create the default SlayOps instance
 * 
 * @example
 * ```javascript
 * import { getSlayOps } from 'slayops';
 * 
 * const pgp = getSlayOps();
 * await pgp.connect();
 * ```
 */
export function getSlayOps(): SlayOps {
  if (!defaultInstance) {
    defaultInstance = new SlayOps();
  }
  return defaultInstance;
}

export default SlayOps;
