/**
 * Local TypeScript example demonstrating signing and verification
 * using tinyopgp library with gpgme-json native messaging.
 * 
 * Uses key: 5286C32E7C71E14C4C82F9AE0B207108925CB162 (Good Person2)
 * 
 * Run with: npx tsx example/sign-verify.ts
 */

import { init } from '../src/index';

const TEST_KEY = '5286C32E7C71E14C4C82F9AE0B207108925CB162';
const TEST_MESSAGE = 'Hello, this is a test message for signing and verification!';

async function main() {
  console.log('=== tinyopgp Sign & Verify Example ===\n');

  // Initialize the library
  console.log('Initializing tinyopgp...');
  const pgp = await init({ timeout: 10000 });
  console.log('✓ Connected to gpgme-json\n');

  // First, verify the key exists
  console.log(`Looking up key: ${TEST_KEY}`);
  const keys = await pgp.Keyring.getKeys({ pattern: TEST_KEY });
  
  if (keys.length === 0) {
    console.error('✗ Key not found! Make sure the key is imported in your GnuPG keyring.');
    process.exit(1);
  }

  const key = keys[0];
  const userId = key.userIds?.[0];
  console.log(`✓ Found key: ${userId?.name} <${userId?.email}>`);
  console.log(`  Fingerprint: ${key.fingerprint}`);
  console.log(`  Can Sign: ${key.canSign}`);
  console.log(`  Has Secret: ${key.hasSecret}\n`);

  // Test 1: Clearsign
  console.log('--- Test 1: Clearsign ---');
  console.log(`Message: "${TEST_MESSAGE}"`);
  
  const clearsignResult = await pgp.sign({
    data: TEST_MESSAGE,
    keys: [TEST_KEY],
    mode: 'clearsign',
    armor: true,
  });

  console.log('\nClearsigned output:');
  console.log('─'.repeat(60));
  console.log(clearsignResult.data);
  console.log('─'.repeat(60));

  // Verify the clearsigned message
  console.log('\nVerifying clearsigned message...');
  const verifyResult1 = await pgp.verify({
    data: clearsignResult.data as string,
  });

  console.log(`✓ Verification result: ${verifyResult1.isValid ? 'VALID' : 'INVALID'}`);
  if (verifyResult1.signatures.length > 0) {
    const sig = verifyResult1.signatures[0];
    console.log(`  Signed by: ${sig.fingerprint}`);
    console.log(`  Valid: ${sig.valid}`);
    console.log(`  Status: ${sig.status}`);
  }

  // Test 2: Detached signature
  console.log('\n--- Test 2: Detached Signature ---');
  console.log(`Message: "${TEST_MESSAGE}"`);

  const detachedResult = await pgp.sign({
    data: TEST_MESSAGE,
    keys: [TEST_KEY],
    mode: 'detached',
    armor: true,
  });

  console.log('\nDetached signature:');
  console.log('─'.repeat(60));
  console.log(detachedResult.data);
  console.log('─'.repeat(60));

  // Verify the detached signature
  console.log('\nVerifying detached signature...');
  const verifyResult2 = await pgp.verify({
    data: TEST_MESSAGE,
    signature: detachedResult.data as string,
  });

  console.log(`✓ Verification result: ${verifyResult2.isValid ? 'VALID' : 'INVALID'}`);
  if (verifyResult2.signatures.length > 0) {
    const sig = verifyResult2.signatures[0];
    console.log(`  Signed by: ${sig.fingerprint}`);
    console.log(`  Valid: ${sig.valid}`);
    console.log(`  Status: ${sig.status}`);
  }

  // Test 3: Verify tampered message fails
  console.log('\n--- Test 3: Tampered Message Detection ---');
  const tamperedMessage = TEST_MESSAGE + ' (tampered)';
  console.log(`Tampered message: "${tamperedMessage}"`);

  try {
    const verifyResult3 = await pgp.verify({
      data: tamperedMessage,
      signature: detachedResult.data as string,
    });

    if (!verifyResult3.isValid) {
      console.log('✓ Correctly detected tampered message as INVALID');
      if (verifyResult3.signatures.length > 0) {
        console.log(`  Status: ${verifyResult3.signatures[0].status}`);
      }
    } else {
      console.log('✗ ERROR: Tampered message was incorrectly marked as valid!');
    }
  } catch (error) {
    console.log('✓ Verification correctly failed for tampered message');
    console.log(`  Error: ${error instanceof Error ? error.message : error}`);
  }

  console.log('\n=== All tests completed! ===');
}

main().catch((error) => {
  console.error('Error:', error);
  process.exit(1);
});
