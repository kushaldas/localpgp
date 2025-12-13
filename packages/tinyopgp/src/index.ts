/**
 * tinyopgp - TypeScript library for OpenPGP operations via gpgme-json
 * 
 * This library provides a TypeScript interface to perform OpenPGP operations
 * (encrypt, decrypt, sign, verify) using the system's GnuPG installation
 * via the gpgme-json native messaging protocol.
 */

export * from './types';
export * from './errors';
export { init } from './gpgme';
export type { TinyOpenPGP } from './gpgme';
