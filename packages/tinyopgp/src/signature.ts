/**
 * Signature handling for tinyopgp
 */

import type { SignatureInfo, SignatureSummary } from './types';
import { GpgmeError, ErrorCodes } from './errors';
import { timestampToDate } from './helpers';

/**
 * Raw signature object from gpgme-json
 */
export interface RawSignature {
  fingerprint?: string;
  timestamp?: number;
  exp_timestamp?: number;
  wrong_key_usage?: boolean;
  chain_model?: boolean;
  summary?: RawSummary;
  validity?: number;
  validity_reason?: number;
  status_code?: number;
  status_string?: string;
  notations?: RawNotation[];
}

interface RawSummary {
  valid?: boolean;
  green?: boolean;
  red?: boolean;
  keyRevoked?: boolean;
  keyExpired?: boolean;
  sigExpired?: boolean;
  keyMissing?: boolean;
  crlMissing?: boolean;
  crlTooOld?: boolean;
  badPolicy?: boolean;
  sysError?: boolean;
  sigsum?: number;
}

interface RawNotation {
  name?: string;
  value?: string;
  human_readable?: boolean;
  critical?: boolean;
}

/**
 * Expected types for signature validation
 */
const expectedKeys: Record<string, string> = {
  'wrong_key_usage': 'boolean',
  'chain_model': 'boolean',
  'summary': 'object',
  'validity': 'number',
  'validity_reason': 'number',
  'fingerprint': 'string',
  'timestamp': 'number',
  'exp_timestamp': 'number',
  'status_code': 'number',
  'notations': 'object',
};

const expectedSummary: Record<string, string> = {
  'valid': 'boolean',
  'green': 'boolean',
  'red': 'boolean',
  'keyRevoked': 'boolean',
  'keyExpired': 'boolean',
  'sigExpired': 'boolean',
  'keyMissing': 'boolean',
  'crlMissing': 'boolean',
  'crlTooOld': 'boolean',
  'badPolicy': 'boolean',
  'sysError': 'boolean',
  'sigsum': 'number',
};

/**
 * Validate and parse a signature object from gpgme-json
 */
export function createSignature(sigObject: RawSignature): SignatureInfo {
  // Validate required fields
  if (!sigObject || typeof sigObject !== 'object') {
    throw new GpgmeError(ErrorCodes.SIG_WRONG, 'Invalid signature object');
  }

  // Validate known fields
  for (const key of Object.keys(sigObject)) {
    if (key in expectedKeys) {
      const expectedType = expectedKeys[key];
      const actualType = typeof (sigObject as Record<string, unknown>)[key];
      if (actualType !== expectedType && actualType !== 'undefined') {
        // Type mismatch - log but don't fail
        console.warn(`Signature field ${key} has unexpected type: ${actualType}, expected ${expectedType}`);
      }
    }
  }

  // Validate summary if present
  if (sigObject.summary) {
    for (const key of Object.keys(sigObject.summary)) {
      if (key in expectedSummary) {
        const expectedType = expectedSummary[key];
        const actualType = typeof (sigObject.summary as Record<string, unknown>)[key];
        if (actualType !== expectedType && actualType !== 'undefined') {
          console.warn(`Signature summary field ${key} has unexpected type: ${actualType}, expected ${expectedType}`);
        }
      }
    }
  }

  // Build normalized signature info
  const summary: SignatureSummary = {
    valid: sigObject.summary?.valid ?? false,
    green: sigObject.summary?.green ?? false,
    red: sigObject.summary?.red ?? false,
    keyRevoked: sigObject.summary?.keyRevoked ?? false,
    keyExpired: sigObject.summary?.keyExpired ?? false,
    sigExpired: sigObject.summary?.sigExpired ?? false,
    keyMissing: sigObject.summary?.keyMissing ?? false,
    crlMissing: sigObject.summary?.crlMissing ?? false,
    crlTooOld: sigObject.summary?.crlTooOld ?? false,
    badPolicy: sigObject.summary?.badPolicy ?? false,
    sysError: sigObject.summary?.sysError ?? false,
  };

  const signatureInfo: SignatureInfo = {
    fingerprint: sigObject.fingerprint?.toUpperCase() ?? '',
    // Valid if status_code is 0 (success) OR summary.valid is true, and not red flagged
    valid: (sigObject.status_code === 0 || summary.valid) && !summary.red,
    summary,
    _rawSigObject: sigObject,
  };

  // Add status string if available
  if (sigObject.status_string) {
    signatureInfo.status = sigObject.status_string;
  }

  if (sigObject.timestamp) {
    signatureInfo.created = timestampToDate(sigObject.timestamp);
  }

  if (sigObject.exp_timestamp && sigObject.exp_timestamp > 0) {
    signatureInfo.expires = timestampToDate(sigObject.exp_timestamp);
  }

  return signatureInfo;
}

/**
 * Collect and validate signatures from gpgme response
 */
export function collectSignatures(
  signaturesData: { good?: RawSignature[]; bad?: RawSignature[] } | RawSignature[]
): SignatureInfo[] {
  const signatures: SignatureInfo[] = [];

  if (Array.isArray(signaturesData)) {
    // Simple array of signatures
    for (const sig of signaturesData) {
      try {
        signatures.push(createSignature(sig));
      } catch (e) {
        console.warn('Failed to parse signature:', e);
      }
    }
  } else if (signaturesData && typeof signaturesData === 'object') {
    // Object with good/bad arrays
    if (Array.isArray(signaturesData.good)) {
      for (const sig of signaturesData.good) {
        try {
          const parsed = createSignature(sig);
          parsed.valid = true;
          signatures.push(parsed);
        } catch (e) {
          console.warn('Failed to parse good signature:', e);
        }
      }
    }

    if (Array.isArray(signaturesData.bad)) {
      for (const sig of signaturesData.bad) {
        try {
          const parsed = createSignature(sig);
          // Determine validity from status
          if (parsed.summary.keyMissing || sig.status_code === 9) {
            parsed.valid = false; // Key missing, can't verify
          } else if (sig.status_code === 0 && sig.validity === 3) {
            // Status success but marginal trust - treat as valid
            parsed.valid = true;
          } else {
            parsed.valid = false;
          }
          signatures.push(parsed);
        } catch (e) {
          console.warn('Failed to parse bad signature:', e);
        }
      }
    }
  }

  return signatures;
}

/**
 * Check if all signatures are valid
 */
export function allSignaturesValid(signatures: SignatureInfo[]): boolean {
  if (signatures.length === 0) {
    return false;
  }
  return signatures.every(sig => sig.valid);
}
