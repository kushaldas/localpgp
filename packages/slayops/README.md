# SlayOps

Simple JavaScript API for LocalPGP browser extension - encrypt, decrypt, sign, and verify with GnuPG.

## Installation

```bash
npm install slayops
# or
pnpm add slayops
```

Or include directly in your HTML:

```html
<script src="https://unpkg.com/slayops/dist/slayops.js"></script>
```

## Quick Start

```javascript
import { SlayOps } from 'slayops';

// Create instance
const pgp = new SlayOps();

// Connect to extension
await pgp.connect();

// Encrypt a message
const encrypted = await pgp.encrypt('Hello, World!', ['recipient@example.com']);

// Decrypt a message
const result = await pgp.decrypt(encrypted);
console.log(result.data); // 'Hello, World!'

// Sign a message
const signed = await pgp.sign('My message');

// Verify a signature
const verification = await pgp.verify(signed);
console.log(verification.isValid); // true
```

## API Reference

### Constructor

```javascript
const pgp = new SlayOps(config);
```

**Config options:**
- `chromeExtensionId` - Chrome extension ID (uses this ID only)
- `chromeExtensionIds` - Array of Chrome extension IDs to try (for dev + production)
- `firefoxExtensionId` - Firefox extension ID (default: 'localpgp@localpgp.org')
- `timeout` - Request timeout in ms (default: 30000)
- `autoConnect` - Auto-connect on creation (default: false)

**Default behavior:** Uses the production Chrome Web Store ID (`ckgehekhpgcaaikpadklkkjgdgoebdnh`).

**For local development:** Pass your dev extension ID:
```javascript
// Option 1: Single dev ID
const pgp = new SlayOps({ chromeExtensionId: 'your-local-dev-id' });

// Option 2: Try multiple IDs (production first, then dev)
const pgp = new SlayOps({ 
  chromeExtensionIds: [
    'ckgehekhpgcaaikpadklkkjgdgoebdnh',  // Production
    'your-local-dev-id'                    // Dev fallback
  ]
});
```

### Connection

```javascript
// Connect to extension
await pgp.connect();

// Check if connected
pgp.isConnected(); // boolean

// Get connection status
pgp.getStatus(); // 'disconnected' | 'connecting' | 'connected' | 'error'

// Check if extension is available
pgp.isExtensionAvailable(); // boolean

// Get human-readable status
pgp.getStatusMessage(); // string
```

### Key Management

```javascript
// Get all keys
const keys = await pgp.getKeys();

// Search for keys
const keys = await pgp.getKeys('alice@example.com');

// Get only secret keys
const secretKeys = await pgp.getKeys('', true);

// Get default signing key
const defaultKey = await pgp.getDefaultKey();

// Import a key
await pgp.importKey(armoredPublicKey);
```

### Encryption & Decryption

```javascript
// Encrypt
const encrypted = await pgp.encrypt('Secret message', ['recipient@example.com']);

// Encrypt with options
const encrypted = await pgp.encrypt('Secret message', ['recipient@example.com'], {
  sign: true,           // Sign while encrypting
  signingKey: 'FINGERPRINT',  // Specific signing key
  alwaysTrust: true     // Trust recipients without verification
});

// Decrypt
const result = await pgp.decrypt(encryptedMessage);
console.log(result.data);        // Decrypted message
console.log(result.signatures);  // Signature info if signed
```

### Signing & Verification

```javascript
// Clearsign (default)
const signed = await pgp.sign('My message');

// Detached signature
const signature = await pgp.sign('My message', { mode: 'detached' });

// Sign with specific key
const signed = await pgp.sign('My message', { signingKey: 'FINGERPRINT' });

// Verify clearsigned message
const result = await pgp.verify(clearsignedMessage);
console.log(result.isValid);     // true/false
console.log(result.signatures);  // Signer info

// Verify detached signature
const result = await pgp.verify(originalMessage, detachedSignature);
```

### Events

```javascript
pgp.on('connected', () => console.log('Connected!'));
pgp.on('disconnected', () => console.log('Disconnected'));
pgp.on('error', (err) => console.error('Error:', err));
pgp.on('ready', () => console.log('Extension ready'));

// Remove listener
pgp.off('connected', handler);
```

### Browser Detection

```javascript
// Get detected browser type
pgp.getBrowserType();
// Returns: 'chrome' | 'firefox' | 'firefox-injected' | 'chrome-no-api' | 'unknown'

// Detect browser manually
pgp.detectBrowser();
```

## Browser Support

- **Chrome**: Uses `externally_connectable` for direct messaging
- **Firefox**: Uses content script injection with `window.postMessage`

Both require the LocalPGP browser extension to be installed.

## License

MIT
