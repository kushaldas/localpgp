/**
 * Type definitions for tinyopgp
 */

// ============================================================================
// Initialization
// ============================================================================

export interface InitOptions {
  /** Connection timeout in milliseconds (default: 1000) */
  timeout?: number;
}

// ============================================================================
// Encrypt
// ============================================================================

export interface EncryptOptions {
  /** Data to encrypt */
  data: string;
  /** Fingerprints or key IDs of recipients */
  publicKeys: string | string[];
  /** Fingerprints or key IDs of signing keys (optional, for sign+encrypt) */
  secretKeys?: string | string[];
  /** Input data is base64 encoded (default: false) */
  base64?: boolean;
  /** Output as armored ASCII (default: true) */
  armor?: boolean;
  /** Trust keys without verification (default: true) */
  alwaysTrust?: boolean;
  /** Expected output format when armor is false */
  expect?: 'base64' | 'uint8';
  /** Additional options to pass to gpgme */
  additional?: Record<string, unknown>;
}

export interface EncryptResult {
  /** Encrypted data */
  data: string | Uint8Array;
  /** Output format */
  format?: 'armored' | 'base64' | 'uint8';
}

// ============================================================================
// Decrypt
// ============================================================================

export interface DecryptOptions {
  /** Encrypted data */
  data: string;
  /** Input data is base64 encoded (default: false) */
  base64?: boolean;
  /** Expected output format */
  expect?: 'string' | 'base64' | 'uint8';
}

export interface DecryptResult {
  /** Decrypted data */
  data: string | Uint8Array;
  /** How the data was converted after decryption */
  format: 'ascii' | 'string' | 'base64' | 'uint8' | null;
  /** Whether the data claims to be MIME */
  isMime?: boolean;
  /** Original filename if available */
  fileName: string | null;
  /** Signature verification results */
  signatures?: SignatureInfo[];
}

// ============================================================================
// Sign
// ============================================================================

export interface SignOptions {
  /** Data to sign */
  data: string;
  /** Fingerprints or key IDs of signing keys */
  keys?: string | string[];
  /** Signing mode (default: 'clearsign') */
  mode?: 'clearsign' | 'detached';
  /** Input data is base64 encoded (default: false) */
  base64?: boolean;
  /** Output as armored ASCII (default: true) */
  armor?: boolean;
}

export interface SignResult {
  /** Signed data (for clearsign) or original data (for detached) */
  data: string;
  /** Detached signature (only for detached mode) */
  signature?: string;
}

// ============================================================================
// Verify
// ============================================================================

export interface VerifyOptions {
  /** Signed data or data to verify */
  data: string;
  /** Detached signature (for detached signature verification) */
  signature?: string;
  /** Input data is base64 encoded (default: false) */
  base64?: boolean;
}

export interface VerifyResult {
  /** Verified data */
  data: string;
  /** Whether all signatures are valid */
  isValid: boolean;
  /** Whether the data claims to be MIME */
  isMime?: boolean;
  /** Original filename if available */
  fileName?: string;
  /** Signature details */
  signatures: SignatureInfo[];
}

// ============================================================================
// Signatures
// ============================================================================

export interface SignatureInfo {
  /** Key fingerprint */
  fingerprint: string;
  /** Whether signature is valid */
  valid: boolean;
  /** Signature creation time */
  created?: Date;
  /** Signature expiration time */
  expires?: Date;
  /** Status string from gpgme (e.g., "Success", "Bad signature") */
  status?: string;
  /** Validity summary */
  summary: SignatureSummary;
  /** Raw signature object from gpgme */
  _rawSigObject?: unknown;
}

export interface SignatureSummary {
  valid: boolean;
  green: boolean;
  red: boolean;
  keyRevoked: boolean;
  keyExpired: boolean;
  sigExpired: boolean;
  keyMissing: boolean;
  crlMissing: boolean;
  crlTooOld: boolean;
  badPolicy: boolean;
  sysError: boolean;
}

// ============================================================================
// Keys
// ============================================================================

export interface Key {
  /** Full fingerprint */
  fingerprint: string;
  /** Short key ID (last 16 hex chars of fingerprint) */
  keyId: string;
  /** User IDs associated with this key */
  userIds: UserId[];
  /** Subkeys */
  subkeys: SubKey[];
  /** Whether this key has a secret/private part */
  hasSecret: boolean;
  /** Can be used for encryption */
  canEncrypt: boolean;
  /** Can be used for signing */
  canSign: boolean;
  /** Can be used for certification */
  canCertify: boolean;
  /** Can be used for authentication */
  canAuthenticate: boolean;
  /** Key is revoked */
  isRevoked: boolean;
  /** Key is expired */
  isExpired: boolean;
  /** Key is disabled */
  isDisabled: boolean;
  /** Key is invalid */
  isInvalid: boolean;
  /** Key creation date */
  created: Date;
  /** Key expiration date (undefined = never expires) */
  expires?: Date;
}

export interface KeyWithMethods extends Key {
  /** Get armored public key */
  getArmor(): Promise<string>;
  /** Delete key from keyring */
  delete(): Promise<boolean>;
  /** Refresh key data from keyring */
  refresh(): Promise<Key>;
}

export interface UserId {
  /** Full user ID string */
  uid: string;
  /** Name component */
  name: string;
  /** Email component */
  email: string;
  /** Comment component */
  comment?: string;
  /** User ID is revoked */
  isRevoked: boolean;
  /** User ID is invalid */
  isInvalid: boolean;
}

export interface SubKey {
  /** Key ID */
  keyId: string;
  /** Full fingerprint */
  fingerprint: string;
  /** Creation date */
  created: Date;
  /** Expiration date */
  expires?: Date;
  /** Subkey is revoked */
  isRevoked: boolean;
  /** Subkey is expired */
  isExpired: boolean;
  /** Subkey is disabled */
  isDisabled: boolean;
  /** Subkey is invalid */
  isInvalid: boolean;
  /** Can be used for encryption */
  canEncrypt: boolean;
  /** Can be used for signing */
  canSign: boolean;
  /** Can be used for certification */
  canCertify: boolean;
  /** Can be used for authentication */
  canAuthenticate: boolean;
  /** Algorithm name */
  algorithm: string;
  /** Key length in bits */
  length: number;
  /** Curve name for ECC keys */
  curve?: string;
  /** Key is stored on a smartcard */
  isCardKey: boolean;
  /** Smartcard serial number */
  cardNumber?: string;
}

// ============================================================================
// Keyring
// ============================================================================

export interface Keyring {
  /** Get keys from keyring */
  getKeys(options?: GetKeysOptions): Promise<Key[]>;
  /** Get armored keys */
  getKeysArmored(options?: GetKeysArmoredOptions): Promise<ArmoredKeysResult>;
  /** Get default signing key */
  getDefaultKey(): Promise<Key>;
  /** Import armored keys */
  importKey(armored: string, prepareSync?: boolean): Promise<ImportResult>;
  /** Delete key by fingerprint */
  deleteKey(fingerprint: string): Promise<boolean>;
  /** Generate new key pair */
  generateKey(options: GenerateKeyOptions): Promise<Key[]>;
}

export interface GetKeysOptions {
  /** Pattern to filter keys (fingerprint, key ID, or email) */
  pattern?: string | string[];
  /** Only return keys with secret/private parts */
  secret?: boolean;
  /** Cache key data for synchronous access (default: false) */
  prepareSync?: boolean;
  /** Search external servers (WKD/HKP) */
  search?: boolean;
}

export interface GetKeysArmoredOptions {
  /** Pattern to filter keys */
  pattern?: string | string[];
  /** Include fingerprints of keys with secret parts */
  withSecretFpr?: boolean;
}

export interface ArmoredKeysResult {
  /** Armored key block containing all matching keys */
  armored: string;
  /** Fingerprints of keys that have secret parts */
  secretFprs?: string[];
}

export interface ImportResult {
  /** Imported keys with details */
  Keys: ImportedKey[];
  /** Import summary statistics */
  summary: ImportSummary;
}

export interface ImportedKey {
  /** The imported key */
  key: Key;
  /** Import status */
  status: 'newkey' | 'change' | 'nochange';
  /** What changed */
  changes: {
    userId: boolean;
    signature: boolean;
    subkey: boolean;
  };
}

export interface ImportSummary {
  considered: number;
  imported: number;
  unchanged: number;
  newUserIds: number;
  newSubKeys: number;
  newSignatures: number;
  newRevocations: number;
  secretRead: number;
  secretImported: number;
  secretUnchanged: number;
  notImported: number;
  noUserId?: number;
  importedRsa?: number;
  skippedNewKeys?: number;
  skippedV3Keys?: number;
}

export interface GenerateKeyOptions {
  /** User ID (e.g., "Name <email@example.com>") */
  userId: string;
  /** Algorithm (default: 'default') */
  algo?: KeyAlgorithm;
  /** Expiration in seconds from now (0 = never) */
  expires?: number;
}

export type KeyAlgorithm =
  | 'default'
  | 'future-default'
  | 'rsa'
  | 'rsa2048'
  | 'rsa3072'
  | 'rsa4096'
  | 'dsa'
  | 'dsa2048'
  | 'dsa3072'
  | 'dsa4096'
  | 'elg'
  | 'elg2048'
  | 'elg3072'
  | 'elg4096'
  | 'ed25519'
  | 'cv25519'
  | 'brainpoolP256r1'
  | 'brainpoolP384r1'
  | 'brainpoolP512r1'
  | 'NIST P-256'
  | 'NIST P-384'
  | 'NIST P-521';

// ============================================================================
// Internal Protocol Types
// ============================================================================

/** Base message sent to gpgme-json */
export interface GpgmeMessage {
  op: string;
  chunksize: number;
  [key: string]: unknown;
}

/** Response from gpgme-json */
export interface GpgmeResponse {
  type?: string;
  more?: boolean;
  data?: string;
  base64?: boolean;
  [key: string]: unknown;
}

/** Permitted operations and their parameters */
export type GpgmeOperation =
  | 'encrypt'
  | 'decrypt'
  | 'sign'
  | 'verify'
  | 'keylist'
  | 'export'
  | 'import'
  | 'delete'
  | 'createkey'
  | 'version'
  | 'config_opt'
  | 'getmore';
