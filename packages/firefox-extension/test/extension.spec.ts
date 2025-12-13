/**
 * Firefox Extension E2E Tests using Playwright
 * 
 * Tests the LocalPGP Firefox extension with gpgme-json native messaging.
 * 
 * Prerequisites:
 * - Firefox browser installed
 * - gpgme-json native messaging host configured at ~/.mozilla/native-messaging-hosts/gpgmejson.json
 * - Test key 5286C32E7C71E14C4C82F9AE0B207108925CB162 imported in GnuPG keyring
 */

import { test, expect } from '@playwright/test';
import * as path from 'path';
import * as fs from 'fs';
import { execSync } from 'child_process';

const EXTENSION_PATH = path.join(__dirname, '..', 'dist');
const TEST_KEY_FINGERPRINT = '5286C32E7C71E14C4C82F9AE0B207108925CB162';

test.describe('LocalPGP Firefox Extension Tests', () => {
  test('Extension files exist', async () => {
    // Verify all required extension files
    expect(fs.existsSync(path.join(EXTENSION_PATH, 'manifest.json'))).toBe(true);
    expect(fs.existsSync(path.join(EXTENSION_PATH, 'background.js'))).toBe(true);
    expect(fs.existsSync(path.join(EXTENSION_PATH, 'popup/popup.html'))).toBe(true);
  });

  test('Manifest is valid', async () => {
    const manifestPath = path.join(EXTENSION_PATH, 'manifest.json');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
    
    expect(manifest.name).toBe('LocalPGP');
    expect(manifest.manifest_version).toBe(3);
    expect(manifest.browser_specific_settings?.gecko?.id).toBe('localpgp@localpgp.org');
  });

  test('Native messaging host is configured', async () => {
    const nmhPath = path.join(process.env.HOME || '', '.mozilla/native-messaging-hosts/gpgmejson.json');
    expect(fs.existsSync(nmhPath)).toBe(true);
    
    const config = JSON.parse(fs.readFileSync(nmhPath, 'utf-8'));
    
    expect(config.name).toBe('gpgmejson');
    expect(config.type).toBe('stdio');
    expect(config.allowed_extensions).toContain('localpgp@localpgp.org');
    expect(fs.existsSync(config.path)).toBe(true);
  });

  test('gpgme-json binary exists', async () => {
    const gpgmePath = '/usr/bin/gpgme-json';
    expect(fs.existsSync(gpgmePath)).toBe(true);
  });

  test('Test key is available in GnuPG', async () => {
    try {
      const output = execSync(`gpg --list-keys ${TEST_KEY_FINGERPRINT} 2>&1`, { encoding: 'utf-8' });
      expect(output).toContain(TEST_KEY_FINGERPRINT);
    } catch (e) {
      throw new Error(`Test key ${TEST_KEY_FINGERPRINT} not found in GnuPG keyring`);
    }
  });

  test('Icons exist', async () => {
    expect(fs.existsSync(path.join(EXTENSION_PATH, 'icons/icon16.png'))).toBe(true);
    expect(fs.existsSync(path.join(EXTENSION_PATH, 'icons/icon32.png'))).toBe(true);
    expect(fs.existsSync(path.join(EXTENSION_PATH, 'icons/icon48.png'))).toBe(true);
    expect(fs.existsSync(path.join(EXTENSION_PATH, 'icons/icon128.png'))).toBe(true);
  });
});

// Note: Full interactive testing with Firefox requires web-ext
// Run: pnpm web-ext
// This will launch Firefox with the extension loaded for manual testing
