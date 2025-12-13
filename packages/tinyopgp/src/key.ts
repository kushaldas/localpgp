/**
 * Key representation for tinyopgp
 */

import type { Key, KeyWithMethods, UserId, SubKey } from './types';
import { createMessage } from './message';
import { GpgmeError, ErrorCodes } from './errors';
import { isFingerprint, timestampToDate } from './helpers';

/**
 * Raw key data from gpgme-json
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
  last_update?: number;
  origin?: number;
  subkeys?: RawSubKey[];
  userids?: RawUserId[];
}

interface RawSubKey {
  keyid?: string;
  fingerprint?: string;
  timestamp?: number;
  expires?: number;
  revoked?: boolean;
  expired?: boolean;
  disabled?: boolean;
  invalid?: boolean;
  can_encrypt?: boolean;
  can_sign?: boolean;
  can_certify?: boolean;
  can_authenticate?: boolean;
  pubkey_algo_name?: string;
  length?: number;
  curve?: string;
  is_cardkey?: boolean;
  card_number?: string;
}

interface RawUserId {
  uid?: string;
  name?: string;
  email?: string;
  comment?: string;
  revoked?: boolean;
  invalid?: boolean;
}

/**
 * Valid key properties that can be accessed
 */
export const validKeyProperties = [
  'fingerprint',
  'revoked',
  'expired',
  'disabled',
  'invalid',
  'can_encrypt',
  'can_sign',
  'can_certify',
  'can_authenticate',
  'secret',
  'subkeys',
  'userids',
  'last_update',
  'origin',
] as const;

/**
 * Create a Key object from raw gpgme data
 */
export function createKey(fingerprint: string, data?: RawKeyData): Key {
  if (!isFingerprint(fingerprint)) {
    throw new GpgmeError(ErrorCodes.KEY_INVALID, `Invalid fingerprint: ${fingerprint}`);
  }

  const normalizedFpr = fingerprint.toUpperCase();

  // Use provided data or create minimal key
  const keyData: RawKeyData = data?.fingerprint?.toUpperCase() === normalizedFpr
    ? data
    : { fingerprint: normalizedFpr };

  // Parse subkeys
  const subkeys: SubKey[] = (keyData.subkeys || []).map(parseSubKey);

  // Parse user IDs
  const userIds: UserId[] = (keyData.userids || []).map(parseUserId);

  // Get creation date from first subkey (primary key)
  const primarySubkey = subkeys[0];
  const created = primarySubkey?.created || new Date(0);

  // Get expiration from primary key
  const expires = primarySubkey?.expires;

  const key: Key = {
    fingerprint: normalizedFpr,
    keyId: normalizedFpr.slice(-16),
    userIds,
    subkeys,
    hasSecret: keyData.secret ?? false,
    canEncrypt: keyData.can_encrypt ?? subkeys.some(s => s.canEncrypt),
    canSign: keyData.can_sign ?? subkeys.some(s => s.canSign),
    canCertify: keyData.can_certify ?? subkeys.some(s => s.canCertify),
    canAuthenticate: keyData.can_authenticate ?? subkeys.some(s => s.canAuthenticate),
    isRevoked: keyData.revoked ?? false,
    isExpired: keyData.expired ?? false,
    isDisabled: keyData.disabled ?? false,
    isInvalid: keyData.invalid ?? false,
    created,
    expires,
  };

  return key;
}

/**
 * Create a Key with methods (getArmor, delete, refresh)
 */
export function createKeyWithMethods(fingerprint: string, data?: RawKeyData): KeyWithMethods {
  const key = createKey(fingerprint, data);

  const keyWithMethods: KeyWithMethods = {
    ...key,

    async getArmor(): Promise<string> {
      const msg = createMessage('export');
      msg.setParameter('armor', true);
      msg.setParameter('keys', this.fingerprint);
      
      const result = await msg.post();
      return result.data as string || '';
    },

    async delete(): Promise<boolean> {
      const msg = createMessage('delete');
      msg.setParameter('key', this.fingerprint);
      
      const result = await msg.post();
      return result.success === true;
    },

    async refresh(): Promise<Key> {
      // Re-fetch key data from keyring
      const msg = createMessage('keylist');
      msg.setParameter('keys', this.fingerprint);
      msg.setParameter('sigs', true);
      
      const result = await msg.post();
      const keys = result.keys as RawKeyData[] | undefined;
      
      if (!keys || keys.length === 0) {
        throw new GpgmeError(ErrorCodes.KEY_NOKEY, `Key not found: ${this.fingerprint}`);
      }

      // Return updated key (preserving methods through prototype)
      const refreshedKey = createKey(this.fingerprint, keys[0]);
      Object.assign(this, refreshedKey);
      return this;
    },
  };

  return keyWithMethods;
}

/**
 * Parse a subkey from raw data
 */
function parseSubKey(raw: RawSubKey): SubKey {
  return {
    keyId: raw.keyid?.toUpperCase() ?? '',
    fingerprint: raw.fingerprint?.toUpperCase() ?? '',
    created: raw.timestamp ? timestampToDate(raw.timestamp) : new Date(0),
    expires: raw.expires && raw.expires > 0 ? timestampToDate(raw.expires) : undefined,
    isRevoked: raw.revoked ?? false,
    isExpired: raw.expired ?? false,
    isDisabled: raw.disabled ?? false,
    isInvalid: raw.invalid ?? false,
    canEncrypt: raw.can_encrypt ?? false,
    canSign: raw.can_sign ?? false,
    canCertify: raw.can_certify ?? false,
    canAuthenticate: raw.can_authenticate ?? false,
    algorithm: raw.pubkey_algo_name ?? '',
    length: raw.length ?? 0,
    curve: raw.curve,
    isCardKey: raw.is_cardkey ?? false,
    cardNumber: raw.card_number,
  };
}

/**
 * Parse a user ID from raw data
 */
function parseUserId(raw: RawUserId): UserId {
  return {
    uid: raw.uid ?? '',
    name: raw.name ?? '',
    email: raw.email ?? '',
    comment: raw.comment,
    isRevoked: raw.revoked ?? false,
    isInvalid: raw.invalid ?? false,
  };
}
