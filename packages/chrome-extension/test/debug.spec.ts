import { test, chromium } from '@playwright/test';
import * as path from 'path';
import * as os from 'os';

const extensionPath = path.join(__dirname, '..', 'dist');
const userDataDir = path.join(os.tmpdir(), 'playwright-chrome-debug2');

test('Debug getKeys', async () => {
  test.setTimeout(30000);  // 30 second timeout
  console.log('Launching browser...');
  
  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    args: [
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`,
      '--no-sandbox',
    ],
  });

  // Wait for service worker
  let background: any;
  const serviceWorkers = context.serviceWorkers();
  if (serviceWorkers.length > 0) {
    background = serviceWorkers[0];
  } else {
    background = await context.waitForEvent('serviceworker');
  }

  const workerUrl = background.url();
  const match = workerUrl.match(/chrome-extension:\/\/([^/]+)/);
  const extensionId = match![1];
  console.log('Extension ID:', extensionId);

  // Capture console messages from the service worker
  background.on('console', (msg: any) => {
    console.log('SERVICE WORKER:', msg.type(), msg.text());
  });

  // Create a page in the extension context
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/popup/popup.html`);

  // Wait a bit for connection
  await new Promise(r => setTimeout(r, 2000));

  // First connect
  console.log('\n=== Sending connect message ===');
  const connectResult = await page.evaluate(async () => {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({ action: 'connect' }, (response: unknown) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(response);
        }
      });
    });
  });
  console.log('Connect result:', JSON.stringify(connectResult, null, 2));

  await new Promise(r => setTimeout(r, 1000));

  // Send getKeys message  
  console.log('\n=== Sending getKeys message ===');
  const result = await page.evaluate(async (pattern) => {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({
        action: 'getKeys',
        pattern: pattern
      }, (response: unknown) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(response);
        }
      });
    });
  }, '5286C32E7C71E14C4C82F9AE0B207108925CB162');

  console.log('GetKeys Result:', JSON.stringify(result, null, 2));

  // Give time to see logs
  await new Promise(r => setTimeout(r, 3000));

  await context.close();
});
