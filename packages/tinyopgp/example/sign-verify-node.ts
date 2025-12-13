/**
 * Local Node.js example demonstrating signing and verification
 * by directly communicating with gpgme-json binary.
 * 
 * Uses key: 5286C32E7C71E14C4C82F9AE0B207108925CB162 (Good Person2)
 * 
 * Run with: npx tsx example/sign-verify-node.ts
 */

import { spawn, type ChildProcess } from 'child_process';

const TEST_KEY = '5286C32E7C71E14C4C82F9AE0B207108925CB162';
const TEST_MESSAGE = 'Hello, this is a test message for signing and verification!';

// Find gpgme-json binary
const GPGME_JSON_PATH = '/usr/bin/gpgme-json';

interface GpgmeSignature {
  fingerprint: string;
  status_string: string;
  status_code: number;
  validity_string: string;
  summary: {
    valid: boolean;
    green: boolean;
    red: boolean;
    key_missing?: boolean;
    'key-missing'?: boolean;
  };
}

interface GpgmeVerifyResult {
  info?: {
    signatures?: GpgmeSignature[];
  };
  data?: string;
  base64?: boolean;
}

interface GpgmeKeyResult {
  keys?: Array<{
    fingerprint: string;
    uids?: Array<{ name: string; email: string }>;
  }>;
}

interface GpgmeSignResult {
  data?: string;
  base64?: boolean;
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

      // Give it a moment to start
      setTimeout(resolve, 100);
    });
  }

  private handleData(data: Buffer): void {
    this.responseBuffer = Buffer.concat([this.responseBuffer, data]);

    // Check if we have a complete message (4-byte length prefix + JSON)
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

/**
 * Decode base64 string to UTF-8
 */
function base64ToString(base64: string): string {
  return Buffer.from(base64, 'base64').toString('utf8');
}

/**
 * Check if a signature is valid based on gpgme-json response
 */
function isSignatureValid(sig: GpgmeSignature): boolean {
  // status_code 0 means success, status_string "Success" also indicates success
  return sig.status_code === 0 || sig.status_string === 'Success';
}

async function main() {
  console.log('=== tinyopgp Sign & Verify Example (Node.js) ===\n');

  const connection = new GpgmeJsonConnection();

  try {
    // Connect to gpgme-json
    console.log('Connecting to gpgme-json...');
    await connection.connect();
    console.log('✓ Connected\n');

    // First, verify the key exists
    console.log(`Looking up key: ${TEST_KEY}`);
    const keylistResult = await connection.send({
      op: 'keylist',
      keys: [TEST_KEY],
      sigs: true,
    }) as GpgmeKeyResult;

    if (!keylistResult.keys || keylistResult.keys.length === 0) {
      console.error('✗ Key not found! Make sure the key is imported in your GnuPG keyring.');
      process.exit(1);
    }

    const key = keylistResult.keys[0];
    const userId = key.uids?.[0];
    console.log(`✓ Found key: ${userId?.name || 'Unknown'} <${userId?.email || 'unknown'}>`);
    console.log(`  Fingerprint: ${key.fingerprint}\n`);

    // Test 1: Clearsign
    console.log('--- Test 1: Clearsign ---');
    console.log(`Message: "${TEST_MESSAGE}"`);

    const signResult = await connection.send({
      op: 'sign',
      keys: [TEST_KEY],
      mode: 'clearsign',
      data: Buffer.from(TEST_MESSAGE).toString('base64'),
      base64: true,
      armor: true,
    }) as GpgmeSignResult;

    let signedData = signResult.data || '';
    if (signResult.base64 && signedData) {
      signedData = base64ToString(signedData);
    }

    console.log('\nClearsigned output:');
    console.log('─'.repeat(60));
    console.log(signedData);
    console.log('─'.repeat(60));

    // Verify the clearsigned message
    console.log('\nVerifying clearsigned message...');
    const verifyResult1 = await connection.send({
      op: 'verify',
      data: Buffer.from(signedData).toString('base64'),
      base64: true,
    }) as GpgmeVerifyResult;

    const sigs1 = verifyResult1.info?.signatures || [];
    const isValid1 = sigs1.length > 0 && sigs1.every(isSignatureValid);
    
    console.log(`✓ Verification result: ${isValid1 ? 'VALID ✅' : 'INVALID ❌'}`);
    if (sigs1.length > 0) {
      const sig = sigs1[0];
      console.log(`  Signed by: ${sig.fingerprint}`);
      console.log(`  Status: ${sig.status_string} (code: ${sig.status_code})`);
      console.log(`  Validity: ${sig.validity_string}`);
    }

    // Test 2: Detached signature
    console.log('\n--- Test 2: Detached Signature ---');
    console.log(`Message: "${TEST_MESSAGE}"`);

    const detachedResult = await connection.send({
      op: 'sign',
      keys: [TEST_KEY],
      mode: 'detach',
      data: Buffer.from(TEST_MESSAGE).toString('base64'),
      base64: true,
      armor: true,
    }) as GpgmeSignResult;

    let detachedSig = detachedResult.data || '';
    if (detachedResult.base64 && detachedSig) {
      detachedSig = base64ToString(detachedSig);
    }

    console.log('\nDetached signature:');
    console.log('─'.repeat(60));
    console.log(detachedSig);
    console.log('─'.repeat(60));

    // Verify the detached signature
    console.log('\nVerifying detached signature...');
    const verifyResult2 = await connection.send({
      op: 'verify',
      data: Buffer.from(TEST_MESSAGE).toString('base64'),
      signature: Buffer.from(detachedSig).toString('base64'),
      base64: true,
    }) as GpgmeVerifyResult;

    const sigs2 = verifyResult2.info?.signatures || [];
    const isValid2 = sigs2.length > 0 && sigs2.every(isSignatureValid);

    console.log(`✓ Verification result: ${isValid2 ? 'VALID ✅' : 'INVALID ❌'}`);
    if (sigs2.length > 0) {
      const sig = sigs2[0];
      console.log(`  Signed by: ${sig.fingerprint}`);
      console.log(`  Status: ${sig.status_string} (code: ${sig.status_code})`);
      console.log(`  Validity: ${sig.validity_string}`);
    }

    // Test 3: Verify tampered message fails
    console.log('\n--- Test 3: Tampered Message Detection ---');
    const tamperedMessage = TEST_MESSAGE + ' (tampered)';
    console.log(`Tampered message: "${tamperedMessage}"`);

    const verifyResult3 = await connection.send({
      op: 'verify',
      data: Buffer.from(tamperedMessage).toString('base64'),
      signature: Buffer.from(detachedSig).toString('base64'),
      base64: true,
    }) as GpgmeVerifyResult;

    const sigs3 = verifyResult3.info?.signatures || [];
    const isValid3 = sigs3.length > 0 && sigs3.every(isSignatureValid);

    if (!isValid3) {
      console.log('✓ Correctly detected tampered message as INVALID ✅');
      if (sigs3.length > 0) {
        console.log(`  Status: ${sigs3[0].status_string} (code: ${sigs3[0].status_code})`);
      }
    } else {
      console.log('✗ ERROR: Tampered message was incorrectly marked as valid!');
    }

    console.log('\n=== All tests completed successfully! ===');

  } finally {
    connection.disconnect();
  }
}

main().catch((error) => {
  console.error('Error:', error);
  process.exit(1);
});
