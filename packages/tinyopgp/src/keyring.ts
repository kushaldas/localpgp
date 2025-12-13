/**
 * Keyring operations for tinyopgp
 */

import type {
  Keyring,
  Key,
  GetKeysOptions,
  GetKeysArmoredOptions,
  ArmoredKeysResult,
  ImportResult,
  ImportedKey,
  ImportSummary,
  GenerateKeyOptions,
  KeyAlgorithm,
} from './types';
import { createMessage } from './message';
import { createKey, createKeyWithMethods } from './key';
import { GpgmeError, ErrorCodes } from './errors';
import { isFingerprint, toKeyIdArray } from './helpers';

/**
 * Supported algorithms for key generation
 */
const supportedKeyAlgos: KeyAlgorithm[] = [
  'default', 'future-default',
  'rsa', 'rsa2048', 'rsa3072', 'rsa4096',
  'dsa', 'dsa2048', 'dsa3072', 'dsa4096',
  'elg', 'elg2048', 'elg3072', 'elg4096',
  'ed25519', 'cv25519',
  'brainpoolP256r1', 'brainpoolP384r1', 'brainpoolP512r1',
  'NIST P-256', 'NIST P-384', 'NIST P-521',
];

/**
 * Feedback values from key import
 */
const importFeedbackValues = [
  'considered', 'no_user_id', 'imported', 'imported_rsa', 'unchanged',
  'new_user_ids', 'new_sub_keys', 'new_signatures', 'new_revocations',
  'secret_read', 'secret_imported', 'secret_unchanged', 'skipped_new_keys',
  'not_imported', 'skipped_v3_keys',
] as const;

/**
 * Raw key data from gpgme-json keylist
 */
interface RawKeyData {
  fingerprint: string;
  revoked?: boolean;
  expired?: boolean;
  disabled?: boolean;
  invalid?: boolean;
  can_encrypt?: boolean;
  can_sign?: boolean;
  can_certify?: boolean;
  can_authenticate?: boolean;
  secret?: boolean;
  subkeys?: unknown[];
  userids?: unknown[];
}

/**
 * Raw import result from gpgme-json
 */
interface RawImportResult {
  imports?: Array<{
    fingerprint: string;
    status: number;
  }>;
  [key: string]: unknown;
}

/**
 * GPGME Keyring implementation
 */
export class GPGMEKeyring implements Keyring {
  /**
   * Get keys from the keyring
   */
  async getKeys(options: GetKeysOptions = {}): Promise<Key[]> {
    const { pattern, prepareSync = false, search = false } = options;

    const msg = createMessage('keylist');
    
    if (pattern) {
      msg.setParameter('keys', toKeyIdArray(pattern));
    }
    msg.setParameter('sigs', true);
    
    if (search) {
      msg.setParameter('locate', true);
    }

    const result = await msg.post();
    const rawKeys = result.keys as RawKeyData[] | undefined;

    if (!rawKeys || rawKeys.length === 0) {
      return [];
    }

    // If prepareSync, fetch secret key info as well
    if (prepareSync) {
      const msg2 = createMessage('keylist');
      if (pattern) {
        msg2.setParameter('keys', toKeyIdArray(pattern));
      }
      msg2.setParameter('secret', true);
      msg2.setParameter('sigs', true);
      
      const secretResult = await msg2.post();
      const secretKeys = secretResult.keys as RawKeyData[] | undefined;
      
      // Merge secret key info
      if (secretKeys) {
        const secretFprs = new Set(secretKeys.map(k => k.fingerprint.toUpperCase()));
        for (const key of rawKeys) {
          if (secretFprs.has(key.fingerprint.toUpperCase())) {
            key.secret = true;
          }
        }
      }
    }

    return rawKeys.map(keyData => 
      prepareSync 
        ? createKeyWithMethods(keyData.fingerprint, keyData)
        : createKey(keyData.fingerprint, keyData)
    );
  }

  /**
   * Get armored keys
   */
  async getKeysArmored(options: GetKeysArmoredOptions = {}): Promise<ArmoredKeysResult> {
    const { pattern, withSecretFpr = false } = options;

    const msg = createMessage('export');
    msg.setParameter('armor', true);
    
    if (withSecretFpr) {
      msg.setParameter('with-sec-fprs', true);
    }
    
    if (pattern) {
      msg.setParameter('keys', toKeyIdArray(pattern));
    }

    const result = await msg.post();

    const armoredResult: ArmoredKeysResult = {
      armored: result.data as string || '',
    };

    if (withSecretFpr) {
      const secFprs = result['sec-fprs'] as string[] | undefined;
      armoredResult.secretFprs = secFprs || [];
    }

    return armoredResult;
  }

  /**
   * Get the default signing key
   */
  async getDefaultKey(): Promise<Key> {
    // First try to get the configured default key
    const configMsg = createMessage('config_opt');
    configMsg.setParameter('component', 'gpg');
    configMsg.setParameter('option', 'default-key');

    try {
      const configResult = await configMsg.post();
      const option = configResult.option as { value?: Array<{ string?: string }> } | undefined;
      
      if (option?.value?.[0]?.string) {
        const keys = await this.getKeys({
          pattern: option.value[0].string,
          prepareSync: true,
        });
        
        if (keys.length === 1) {
          return keys[0]!;
        }
      }
    } catch {
      // Config option not set, fall through to find first secret key
    }

    // No configured default key, find first valid secret key
    const msg = createMessage('keylist');
    msg.setParameter('secret', true);
    msg.setParameter('sigs', true);

    const result = await msg.post();
    const rawKeys = result.keys as RawKeyData[] | undefined;

    if (!rawKeys || rawKeys.length === 0) {
      throw new GpgmeError(ErrorCodes.KEY_NO_DEFAULT);
    }

    // Find first valid key that can sign
    for (const keyData of rawKeys) {
      if (!keyData.invalid && !keyData.expired && !keyData.revoked && keyData.can_sign) {
        return createKeyWithMethods(keyData.fingerprint, { ...keyData, secret: true });
      }
    }

    throw new GpgmeError(ErrorCodes.KEY_NO_DEFAULT);
  }

  /**
   * Import armored keys
   */
  async importKey(armored: string, prepareSync = false): Promise<ImportResult> {
    if (!armored || typeof armored !== 'string') {
      throw new GpgmeError(ErrorCodes.PARAM_WRONG, 'Armored key data is required');
    }

    const msg = createMessage('import');
    msg.setParameter('data', armored);

    const response = await msg.post() as RawImportResult;

    // Build summary
    const summary: ImportSummary = {
      considered: 0,
      imported: 0,
      unchanged: 0,
      newUserIds: 0,
      newSubKeys: 0,
      newSignatures: 0,
      newRevocations: 0,
      secretRead: 0,
      secretImported: 0,
      secretUnchanged: 0,
      notImported: 0,
    };

    for (const key of importFeedbackValues) {
      const responseKey = key.replace(/_/g, '_');
      if (responseKey in response) {
        const camelKey = key.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase()) as keyof ImportSummary;
        summary[camelKey] = response[responseKey] as number;
      }
    }

    // Process imported keys
    const imports = response.imports || [];
    if (imports.length === 0) {
      return { Keys: [], summary };
    }

    const importedKeys: ImportedKey[] = [];
    const fingerprints: string[] = [];
    const importInfos: Map<string, { status: string; changes: ImportedKey['changes'] }> = new Map();

    for (const imp of imports) {
      const fpr = imp.fingerprint.toUpperCase();
      fingerprints.push(fpr);

      // Determine status
      let status: ImportedKey['status'];
      if (imp.status === 0) {
        status = 'nochange';
      } else if ((imp.status & 1) === 1) {
        status = 'newkey';
      } else {
        status = 'change';
      }

      // Determine what changed
      const changes: ImportedKey['changes'] = {
        userId: (imp.status & 2) === 2,
        signature: (imp.status & 4) === 4,
        subkey: (imp.status & 8) === 8,
      };

      importInfos.set(fpr, { status, changes });
    }

    // Fetch full key data if requested
    if (prepareSync) {
      const keys = await this.getKeys({ pattern: fingerprints, prepareSync: true });
      
      for (const key of keys) {
        const info = importInfos.get(key.fingerprint);
        if (info) {
          importedKeys.push({
            key,
            status: info.status,
            changes: info.changes,
          });
        }
      }
    } else {
      for (const fpr of fingerprints) {
        const info = importInfos.get(fpr);
        if (info) {
          importedKeys.push({
            key: createKey(fpr),
            status: info.status,
            changes: info.changes,
          });
        }
      }
    }

    return { Keys: importedKeys, summary };
  }

  /**
   * Delete a key
   */
  async deleteKey(fingerprint: string): Promise<boolean> {
    if (!isFingerprint(fingerprint)) {
      throw new GpgmeError(ErrorCodes.KEY_INVALID, `Invalid fingerprint: ${fingerprint}`);
    }

    const key = createKeyWithMethods(fingerprint);
    return key.delete();
  }

  /**
   * Generate a new key pair
   */
  async generateKey(options: GenerateKeyOptions): Promise<Key[]> {
    const { userId, algo = 'default', expires = 0 } = options;

    if (typeof userId !== 'string' || !userId) {
      throw new GpgmeError(ErrorCodes.PARAM_WRONG, 'userId is required');
    }

    if (algo && !supportedKeyAlgos.includes(algo)) {
      throw new GpgmeError(ErrorCodes.KEY_UNSUPP_ALGO, `Unsupported algorithm: ${algo}`);
    }

    if (!Number.isInteger(expires) || expires < 0) {
      throw new GpgmeError(ErrorCodes.PARAM_WRONG, 'expires must be a non-negative integer');
    }

    const msg = createMessage('createkey');
    msg.setParameter('userid', userId);
    msg.setParameter('algo', algo);
    msg.setParameter('expires', expires);

    const response = await msg.post();
    const fingerprint = response.fingerprint as string | undefined;

    if (!fingerprint) {
      throw new GpgmeError(ErrorCodes.GNUPG_ERROR, 'Key generation failed');
    }

    // Fetch the newly created key
    return this.getKeys({ pattern: fingerprint, prepareSync: true });
  }
}

/**
 * Create a new keyring instance
 */
export function createKeyring(): Keyring {
  return new GPGMEKeyring();
}
