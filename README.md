# LocalPGP

Browser extensions for OpenPGP operations using your local GnuPG installation via Native Messaging.

## Overview

LocalPGP provides browser extensions for Chrome and Firefox that allow you to perform OpenPGP operations (encrypt, decrypt, sign, verify) using your system's GnuPG installation. This means you can use your existing GPG keyring, including hardware security keys like Yubikey, directly from your browser.

## Features

- **Encrypt** - Encrypt messages for one or more recipients
- **Decrypt** - Decrypt messages using your private keys
- **Sign** - Create clearsign or detached signatures
- **Verify** - Verify signatures on messages
- **Key Management** - List, import, and manage keys via your GPG keyring
- **Hardware Key Support** - Full support for Yubikey and other OpenPGP cards

## Project Structure

```
localpgp/
├── packages/
│   ├── tinyopgp/             # TypeScript library wrapping gpgme-json
│   ├── chrome-extension/      # Chrome Manifest V3 extension
│   └── firefox-extension/     # Firefox extension
├── native-messaging-host/     # Native messaging setup scripts
└── docs/                      # Documentation
```

## Requirements

- **GnuPG** with `gpgme-json` support
- **Node.js** >= 18.0.0
- **pnpm** >= 8.0.0
- Chrome or Firefox browser

### Installing gpgme-json

**Debian/Ubuntu:**
```bash
sudo apt install gpgme-json
```

**Fedora:**
```bash
sudo dnf install gpgme
```

**Arch Linux:**
```bash
sudo pacman -S gpgme
```

Verify installation:
```bash
which gpgme-json
# Should output: /usr/bin/gpgme-json
```

## Installation

### 1. Clone and Build

```bash
git clone https://github.com/kushaldas/localpgp.git
cd localpgp
pnpm install
pnpm build
```

Or using just:
```bash
just build
```

### 2. Install Native Messaging Host

Native messaging allows the browser extension to communicate with `gpgme-json` on your system.

#### Chrome/Chromium

Create the configuration file at `~/.config/chromium/NativeMessagingHosts/gpgmejson.json` (for Chromium) or `~/.config/google-chrome/NativeMessagingHosts/gpgmejson.json` (for Chrome):

```bash
mkdir -p ~/.config/chromium/NativeMessagingHosts/
cat > ~/.config/chromium/NativeMessagingHosts/gpgmejson.json << 'EOF'
{
  "name": "gpgmejson",
  "description": "Integration with GnuPG",
  "path": "/usr/bin/gpgme-json",
  "type": "stdio",
  "allowed_origins": [
    "chrome-extension://ckgehekhpgcaaikpadklkkjgdgoebdnh/"
  ]
}
EOF
```

> **Note:** The extension ID `ckgehekhpgcaaikpadklkkjgdgoebdnh` is the Chrome Web Store production ID. If you're loading an unpacked extension for development, you'll need to find its ID from `chrome://extensions` and add it to the `allowed_origins` array.

#### Firefox

Create the configuration file at `~/.mozilla/native-messaging-hosts/gpgmejson.json`:

```bash
mkdir -p ~/.mozilla/native-messaging-hosts/
cat > ~/.mozilla/native-messaging-hosts/gpgmejson.json << 'EOF'
{
  "name": "gpgmejson",
  "description": "Integration with GnuPG",
  "path": "/usr/bin/gpgme-json",
  "type": "stdio",
  "allowed_extensions": ["localpgp@localpgp.org"]
}
EOF
```

### 3. Load the Extension

**Chrome:**
1. Go to `chrome://extensions`
2. Enable "Developer mode"
3. Click "Load unpacked"
4. Select `packages/chrome-extension/dist`

**Firefox:**
1. Go to `about:debugging#/runtime/this-firefox`
2. Click "Load Temporary Add-on..."
3. Select `packages/firefox-extension/dist/manifest.json`

Alternatively, for Firefox development, you can use web-ext:
```bash
cd packages/firefox-extension
pnpm web-ext
```

## Development

### Building

```bash
# Build all packages
just build

# Build specific package
just build-lib      # tinyopgp
just build-chrome   # Chrome extension
just build-firefox  # Firefox extension
```

### Development Mode

```bash
# Chrome extension with hot reload
just dev-chrome

# Firefox extension with hot reload
just dev-firefox
```

### Testing

```bash
just test
```

## API (tinyopgp)

The core library provides a simple API for PGP operations:

```typescript
import { init } from 'tinyopgp';

// Initialize connection to gpgme-json
const pgp = await init({ timeout: 2000 });

// Encrypt
const encrypted = await pgp.encrypt({
  data: 'Hello, World!',
  publicKeys: ['FINGERPRINT'],
  armor: true
});

// Decrypt
const decrypted = await pgp.decrypt({
  data: encrypted.data
});

// Sign
const signed = await pgp.sign({
  data: 'Message to sign',
  keys: ['FINGERPRINT'],
  mode: 'clearsign'
});

// Verify
const verified = await pgp.verify({
  data: signed.data
});

// Keyring operations
const keys = await pgp.Keyring.getKeys();
const defaultKey = await pgp.Keyring.getDefaultKey();
```

## Security

- All cryptographic operations are performed by your local GnuPG installation
- Private keys never leave your system
- Hardware key operations are handled by gpg-agent (pinentry will prompt for PIN)
- The extension only communicates with the local `gpgme-json` process via Native Messaging

## License

- `slayops` as `MIT`
- `tinyopgp` and the Browser extensions as `LGPL-3.0-or-later` 

## Contributing

Contributions are welcome! Please read our contributing guidelines before submitting PRs.

## Acknowledgments

- [gpgmejs](https://github.com/mailvelope/gpgmejs) - JavaScript library for GPGME
- [Mailvelope](https://github.com/mailvelope/mailvelope) - Inspiration for architecture patterns
- [GnuPG](https://gnupg.org/) - The underlying cryptographic engine
