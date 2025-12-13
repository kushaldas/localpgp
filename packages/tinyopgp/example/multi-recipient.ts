/**
 * Example demonstrating multi-recipient encryption with gpgme-json.
 * 
 * When encrypting to multiple recipients, the message is encrypted with a 
 * symmetric session key, which is then encrypted to each recipient's public key.
 * Any recipient can decrypt the message with their private key.
 * 
 * Run with: npx tsx example/multi-recipient.ts
 */

import { spawn, type ChildProcess } from 'child_process';

// Test keys - you need both public keys in your keyring
const RECIPIENT_1 = '5286C32E7C71E14C4C82F9AE0B207108925CB162'; // Good Person2
const RECIPIENT_2 = 'AE94F29D7C4994844EAC79F46C91003E4D90ED30'; // YubiKey key (if available)

const TEST_MESSAGE = 'This secret message can be decrypted by ANY of the recipients!';

const GPGME_JSON_PATH = '/usr/bin/gpgme-json';

interface GpgmeKeyResult {
  keys?: Array<{
    fingerprint: string;
    uids?: Array<{ name: string; email: string }>;
    can_encrypt: boolean;
    secret: boolean;
  }>;
}

interface GpgmeEncryptResult {
  data?: string;
  base64?: boolean;
}

interface GpgmeDecryptResult {
  data?: string;
  base64?: boolean;
  info?: {
    recipients?: Array<{ keyid: string }>;
  };
}

/**
 * Simple gpgme-json connection for Node.js
 */
class GpgmeJsonConnection {
  private process: ChildProcess | null = null;
  private responseBuffer = Buffer.alloc(0);
  private pendingResolve: ((value: unknown) => void) | null = null;
  private pendingReject: ((reason: Error) => void) | null = null;

  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.process = spawn(GPGME_JSON_PATH, [], {
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      this.process.stdout?.on('data', (data: Buffer) => {
        this.handleData(data);
      });

      this.process.stderr?.on('data', (data: Buffer) => {
        console.error('gpgme-json stderr:', data.toString());
      });

      this.process.on('error', (err) => {
        reject(new Error(`Failed to start gpgme-json: ${err.message}`));
      });

      this.process.on('exit', (code) => {
        if (this.pendingReject) {
          this.pendingReject(new Error(`gpgme-json exited with code ${code}`));
        }
      });

      setTimeout(resolve, 100);
    });
  }

  private handleData(data: Buffer): void {
    this.responseBuffer = Buffer.concat([this.responseBuffer, data]);

    while (this.responseBuffer.length >= 4) {
      const length = this.responseBuffer.readUInt32LE(0);
      
      if (this.responseBuffer.length >= 4 + length) {
        const jsonData = this.responseBuffer.subarray(4, 4 + length).toString('utf8');
        this.responseBuffer = this.responseBuffer.subarray(4 + length);

        try {
          const response = JSON.parse(jsonData);
          if (this.pendingResolve) {
            this.pendingResolve(response);
            this.pendingResolve = null;
            this.pendingReject = null;
          }
        } catch (e) {
          if (this.pendingReject) {
            this.pendingReject(new Error(`Invalid JSON response: ${e}`));
            this.pendingResolve = null;
            this.pendingReject = null;
          }
        }
      } else {
        break;
      }
    }
  }

  async send(message: Record<string, unknown>): Promise<Record<string, unknown>> {
    if (!this.process?.stdin) {
      throw new Error('Not connected');
    }

    return new Promise((resolve, reject) => {
      this.pendingResolve = resolve as (value: unknown) => void;
      this.pendingReject = reject;

      const json = JSON.stringify(message);
      const buffer = Buffer.alloc(4 + json.length);
      buffer.writeUInt32LE(json.length, 0);
      buffer.write(json, 4);

      this.process!.stdin!.write(buffer);
    });
  }

  disconnect(): void {
    if (this.process) {
      this.process.kill();
      this.process = null;
    }
  }
}

function base64ToString(base64: string): string {
  return Buffer.from(base64, 'base64').toString('utf8');
}

async function main() {
  console.log('=== Multi-Recipient Encryption Example ===\n');

  const connection = new GpgmeJsonConnection();

  try {
    console.log('Connecting to gpgme-json...');
    await connection.connect();
    console.log('✓ Connected\n');

    // Find available encryption keys
    console.log('Looking for recipient keys...');
    const keylistResult = await connection.send({
      op: 'keylist',
      keys: [RECIPIENT_1, RECIPIENT_2],
    }) as GpgmeKeyResult;

    const availableKeys = keylistResult.keys?.filter(k => k.can_encrypt) || [];
    
    if (availableKeys.length === 0) {
      console.error('✗ No encryption keys found!');
      process.exit(1);
    }

    console.log(`\nFound ${availableKeys.length} recipient key(s):\n`);
    for (const key of availableKeys) {
      const uid = key.uids?.[0];
      console.log(`  📧 ${uid?.name || 'Unknown'} <${uid?.email || 'unknown'}>`);
      console.log(`     Fingerprint: ${key.fingerprint}`);
      console.log(`     Has Secret Key: ${key.secret ? 'Yes ✓' : 'No'}`);
      console.log();
    }

    // Encrypt to ALL available recipients
    const recipientFingerprints = availableKeys.map(k => k.fingerprint);
    
    console.log('─'.repeat(60));
    console.log(`\nEncrypting message to ${recipientFingerprints.length} recipient(s)...`);
    console.log(`Message: "${TEST_MESSAGE}"\n`);

    const encryptResult = await connection.send({
      op: 'encrypt',
      keys: recipientFingerprints,
      data: Buffer.from(TEST_MESSAGE).toString('base64'),
      base64: true,
      armor: true,
      'always-trust': true,
    }) as GpgmeEncryptResult;

    let encryptedData = encryptResult.data || '';
    if (encryptResult.base64 && encryptedData) {
      encryptedData = base64ToString(encryptedData);
    }

    console.log('Encrypted message:');
    console.log('─'.repeat(60));
    console.log(encryptedData);
    console.log('─'.repeat(60));

    // Show the key IDs in the encrypted message
    console.log('\n📋 This message can be decrypted by ANY of these keys:');
    for (const fp of recipientFingerprints) {
      console.log(`   • ${fp}`);
    }

    // Try to decrypt with any available secret key
    const keysWithSecret = availableKeys.filter(k => k.secret);
    
    if (keysWithSecret.length > 0) {
      console.log('\n─'.repeat(60));
      console.log('\nAttempting decryption (using available secret key)...\n');

      try {
        const decryptResult = await connection.send({
          op: 'decrypt',
          data: Buffer.from(encryptedData).toString('base64'),
          base64: true,
        }) as GpgmeDecryptResult;

        let decryptedData = decryptResult.data || '';
        if (decryptResult.base64 && decryptedData) {
          decryptedData = base64ToString(decryptedData);
        }

        console.log('✓ Decryption successful!');
        console.log(`Decrypted message: "${decryptedData}"`);
        
        if (decryptResult.info?.recipients) {
          console.log('\nRecipient key IDs in message:');
          for (const r of decryptResult.info.recipients) {
            console.log(`   • ${r.keyid}`);
          }
        }
      } catch (error) {
        console.log('✗ Decryption failed (might need smartcard PIN or key not available)');
        console.log(`  Error: ${error instanceof Error ? error.message : error}`);
      }
    } else {
      console.log('\n⚠️  No secret keys available for decryption test.');
      console.log('   The encrypted message above can be decrypted by any recipient');
      console.log('   who has their private key.');
    }

    console.log('\n=== Example completed! ===');
    console.log('\n💡 Key takeaway: PGP encrypts the session key separately for each');
    console.log('   recipient, so ANY recipient can decrypt the same message.');

  } finally {
    connection.disconnect();
  }
}

main().catch((error) => {
  console.error('Error:', error);
  process.exit(1);
});
