/**
 * Main entry point for tinyopgp
 * 
 * Provides the GpgME class with encrypt, decrypt, sign, verify operations
 * and keyring access via gpgme-json native messaging.
 */

import type {
  InitOptions,
  EncryptOptions,
  EncryptResult,
  DecryptOptions,
  DecryptResult,
  SignOptions,
  SignResult,
  VerifyOptions,
  VerifyResult,
  Keyring,
} from './types';
import { Connection } from './connection';
import { createMessage } from './message';
import { createKeyring } from './keyring';
import { collectSignatures, allSignaturesValid, type RawSignature } from './signature';
import { GpgmeError, ErrorCodes } from './errors';
import { toKeyIdArray, base64ToUint8Array, base64ToString, DEFAULT_TIMEOUT } from './helpers';

/**
 * TinyOpenPGP interface - the main API for PGP operations
 */
export interface TinyOpenPGP {
  /**
   * Encrypt data for recipients, optionally signing
   */
  encrypt(options: EncryptOptions): Promise<EncryptResult>;

  /**
   * Decrypt encrypted data
   */
  decrypt(options: DecryptOptions): Promise<DecryptResult>;

  /**
   * Sign data with clearsign or detached signature
   */
  sign(options: SignOptions): Promise<SignResult>;

  /**
   * Verify signed data
   */
  verify(options: VerifyOptions): Promise<VerifyResult>;

  /**
   * Access to the keyring for key management
   */
  Keyring: Keyring;
}

/**
 * GpgME class - implements TinyOpenPGP interface
 */
class GpgME implements TinyOpenPGP {
  private _keyring: Keyring | null = null;

  /**
   * Get the keyring instance
   */
  get Keyring(): Keyring {
    if (!this._keyring) {
      this._keyring = createKeyring();
    }
    return this._keyring;
  }

  /**
   * Set a custom keyring (for testing)
   */
  set Keyring(keyring: Keyring) {
    if (keyring && typeof keyring.getKeys === 'function') {
      this._keyring = keyring;
    }
  }

  /**
   * Encrypt data for one or more recipients
   */
  async encrypt(options: EncryptOptions): Promise<EncryptResult> {
    const {
      data,
      publicKeys,
      secretKeys,
      base64 = false,
      armor = true,
      alwaysTrust = true,
      expect = 'base64',
      additional = {},
    } = options;

    if (!data) {
      throw new GpgmeError(ErrorCodes.MSG_EMPTY);
    }

    const keys = toKeyIdArray(publicKeys);
    if (keys.length === 0) {
      throw new GpgmeError(ErrorCodes.MSG_NO_KEYS);
    }

    const msg = createMessage('encrypt');
    
    // Set armor mode
    msg.setParameter('armor', armor);
    
    // Set expected output format for non-armored
    if (!armor) {
      if (expect === 'uint8' || expect === 'base64') {
        msg.expected = expect;
      } else {
        throw new GpgmeError(ErrorCodes.PARAM_WRONG, 'expect must be "uint8" or "base64" when armor is false');
      }
    }

    // Set base64 input
    if (base64) {
      msg.setParameter('base64', true);
    }

    // Set trust mode
    if (alwaysTrust) {
      msg.setParameter('always-trust', true);
    }

    // Set encryption keys
    msg.setParameter('keys', keys);

    // Set signing keys if provided
    const signingKeys = toKeyIdArray(secretKeys);
    if (signingKeys.length > 0) {
      msg.setParameter('signing_keys', signingKeys);
    }

    // Set data
    msg.setParameter('data', data);

    // Apply additional options
    for (const [key, value] of Object.entries(additional)) {
      msg.setParameter(key, value);
    }

    const result = await msg.post();

    // Get raw data
    let rawData = result.data as string || '';
    
    // Decode base64 if needed (gpgme-json returns base64-encoded data)
    if (result.base64 === true && rawData && msg.expected !== 'base64') {
      rawData = base64ToString(rawData);
    }

    const encryptResult: EncryptResult = {
      data: rawData,
    };

    if (armor) {
      encryptResult.format = 'armored';
    } else if (msg.expected === 'uint8') {
      encryptResult.data = base64ToUint8Array(result.data as string);
      encryptResult.format = 'uint8';
    } else {
      encryptResult.format = 'base64';
    }

    return encryptResult;
  }

  /**
   * Decrypt encrypted data
   */
  async decrypt(options: DecryptOptions): Promise<DecryptResult> {
    const {
      data,
      base64 = false,
      expect,
    } = options;

    if (!data) {
      throw new GpgmeError(ErrorCodes.MSG_EMPTY);
    }

    const msg = createMessage('decrypt');
    
    if (base64) {
      msg.setParameter('base64', true);
    }

    if (expect === 'base64' || expect === 'uint8') {
      msg.expected = expect;
    }

    msg.setParameter('data', data);

    const result = await msg.post();

    // Get raw data
    let rawData = result.data as string || '';
    
    // Decode base64 if needed (gpgme-json returns base64-encoded data)
    if (result.base64 === true && rawData && msg.expected !== 'base64') {
      rawData = base64ToString(rawData);
    }

    const decryptResult: DecryptResult = {
      data: rawData,
      format: (result['format'] as DecryptResult['format']) || null,
      fileName: null,
    };

    // Handle binary output
    if (msg.expected === 'uint8') {
      decryptResult.data = base64ToUint8Array(result.data as string);
      decryptResult.format = 'uint8';
    }

    // Extract decryption info
    const decInfo = result['dec_info'] as { is_mime?: boolean; file_name?: string } | undefined;
    if (decInfo) {
      decryptResult.isMime = decInfo.is_mime ?? false;
      decryptResult.fileName = decInfo.file_name || null;
    }

    // Extract signatures if present
    const info = result['info'] as { signatures?: RawSignature[] } | undefined;
    if (info?.signatures && Array.isArray(info.signatures)) {
      decryptResult.signatures = collectSignatures(info.signatures);
    }

    return decryptResult;
  }

  /**
   * Sign data
   */
  async sign(options: SignOptions): Promise<SignResult> {
    const {
      data,
      keys,
      mode = 'clearsign',
      base64 = false,
    } = options;

    if (!data) {
      throw new GpgmeError(ErrorCodes.MSG_EMPTY);
    }

    const signingKeys = toKeyIdArray(keys);
    if (signingKeys.length === 0) {
      throw new GpgmeError(ErrorCodes.MSG_NO_KEYS);
    }

    const msg = createMessage('sign');
    
    msg.setParameter('keys', signingKeys);
    msg.setParameter('mode', mode);
    
    if (base64) {
      msg.setParameter('base64', true);
    }

    msg.setParameter('data', data);

    const result = await msg.post();

    // Get raw data
    let rawData = result.data as string || '';
    
    // Decode base64 if needed (gpgme-json returns base64-encoded data)
    if (result.base64 === true && rawData) {
      rawData = base64ToString(rawData);
    }

    if (mode === 'clearsign') {
      return {
        data: rawData,
      };
    } else {
      // Detached mode returns signature separately
      return {
        data,
        signature: rawData,
      };
    }
  }

  /**
   * Verify signed data
   */
  async verify(options: VerifyOptions): Promise<VerifyResult> {
    const {
      data,
      signature,
      base64 = false,
    } = options;

    if (!data) {
      throw new GpgmeError(ErrorCodes.PARAM_WRONG, 'data is required');
    }

    const msg = createMessage('verify');
    
    msg.setParameter('data', data);

    if (signature) {
      msg.setParameter('signature', signature);
    }

    if (base64) {
      msg.setParameter('base64', true);
    }

    const result = await msg.post();

    const info = result['info'] as {
      signatures?: RawSignature[];
      is_mime?: boolean;
      filename?: string;
    } | undefined;

    if (!info?.signatures) {
      throw new GpgmeError(ErrorCodes.SIG_NO_SIGS);
    }

    const signatures = collectSignatures(info.signatures);

    // Get raw data
    let rawData = result.data as string || data;
    
    // Decode base64 if needed (gpgme-json returns base64-encoded data)
    if (result.base64 === true && rawData && typeof rawData === 'string') {
      rawData = base64ToString(rawData);
    }

    const verifyResult: VerifyResult = {
      data: rawData,
      isValid: allSignaturesValid(signatures),
      signatures,
    };

    if (info.is_mime !== undefined) {
      verifyResult.isMime = info.is_mime;
    }

    if (info.filename) {
      verifyResult.fileName = info.filename;
    }

    return verifyResult;
  }
}

/**
 * Initialize the TinyOpenPGP library
 * 
 * Tests the native messaging connection and returns a GpgME instance if successful.
 * 
 * @param options - Initialization options
 * @param options.timeout - Connection timeout in milliseconds (default: 1000)
 * @returns Promise resolving to TinyOpenPGP instance
 * @throws GpgmeError if connection fails
 * 
 * @example
 * ```typescript
 * import { init } from 'tinyopgp';
 * 
 * const pgp = await init({ timeout: 2000 });
 * 
 * // Encrypt
 * const encrypted = await pgp.encrypt({
 *   data: 'Hello, World!',
 *   publicKeys: ['FINGERPRINT'],
 * });
 * 
 * // Decrypt
 * const decrypted = await pgp.decrypt({
 *   data: encrypted.data,
 * });
 * ```
 */
export async function init(options: InitOptions = {}): Promise<TinyOpenPGP> {
  const { timeout = DEFAULT_TIMEOUT } = options;

  const connection = new Connection();
  const isConnected = await connection.checkConnection(timeout);

  if (!isConnected) {
    const error = connection.getConnectionError();
    connection.disconnect();
    throw error;
  }

  // Connection successful, disconnect test connection
  connection.disconnect();

  return new GpgME();
}
