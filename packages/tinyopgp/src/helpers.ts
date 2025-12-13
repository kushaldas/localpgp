/**
 * Helper utility functions for tinyopgp
 */

/**
 * Check if a string is a valid fingerprint (40 hex characters)
 */
export function isFingerprint(value: string): boolean {
  return /^[0-9A-Fa-f]{40}$/.test(value);
}

/**
 * Check if a string is a valid long key ID (16 hex characters)
 */
export function isLongId(value: string): boolean {
  return /^[0-9A-Fa-f]{16}$/.test(value);
}

/**
 * Check if a string is a valid short key ID (8 hex characters)
 */
export function isShortId(value: string): boolean {
  return /^[0-9A-Fa-f]{8}$/.test(value);
}

/**
 * Check if a string is a valid key identifier (fingerprint or key ID)
 */
export function isKeyId(value: string): boolean {
  return isFingerprint(value) || isLongId(value) || isShortId(value);
}

/**
 * Normalize key identifiers to an array of uppercase strings
 */
export function toKeyIdArray(keys: string | string[] | undefined): string[] {
  if (!keys) {
    return [];
  }
  
  const keyArray = Array.isArray(keys) ? keys : [keys];
  return keyArray
    .filter((key): key is string => typeof key === 'string' && key.length > 0)
    .map(key => key.toUpperCase());
}

/**
 * Convert a base64 string to Uint8Array
 */
export function base64ToUint8Array(base64: string): Uint8Array {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

/**
 * Convert Uint8Array to base64 string
 */
export function uint8ArrayToBase64(bytes: Uint8Array): string {
  let binaryString = '';
  for (let i = 0; i < bytes.length; i++) {
    binaryString += String.fromCharCode(bytes[i]!);
  }
  return btoa(binaryString);
}

/**
 * Convert Uint8Array to UTF-8 string
 */
export function uint8ArrayToString(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes);
}

/**
 * Decode base64 string to UTF-8 string
 */
export function base64ToString(base64: string): string {
  const bytes = base64ToUint8Array(base64);
  return uint8ArrayToString(bytes);
}

/**
 * Convert string to Uint8Array
 */
export function stringToUint8Array(str: string): Uint8Array {
  return new TextEncoder().encode(str);
}

/**
 * Parse a Unix timestamp to Date
 */
export function timestampToDate(timestamp: number): Date {
  return new Date(timestamp * 1000);
}

/**
 * Extract text from an object that has a getText method, or return as string
 */
export function extractText(data: string | { getText(): string }): string {
  if (typeof data === 'string') {
    return data;
  }
  if (typeof data === 'object' && typeof data.getText === 'function') {
    return data.getText();
  }
  throw new Error('Data must be a string or have a getText() method');
}

/**
 * Default chunk size for gpgme messages (1023 KB)
 * gpgme-json can return up to 1MB per message, but uses slightly less for safety
 */
export const DEFAULT_CHUNKSIZE = 1023 * 1024;

/**
 * Default timeout for connection checks (milliseconds)
 */
export const DEFAULT_TIMEOUT = 1000;
