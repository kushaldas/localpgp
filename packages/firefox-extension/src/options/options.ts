/**
 * LocalPGP Firefox Extension - Options Script
 */

// Make this a module to avoid name collisions
export {};

interface Key {
  fingerprint: string;
  userIds: Array<{ userId: string; email: string; name?: string }>;
  hasSecret: boolean;
  expired?: boolean;
  revoked?: boolean;
  disabled?: boolean;
}

interface MessageResponse {
  success: boolean;
  data?: unknown;
  error?: {
    code: string;
    message: string;
  };
}

// Send message to background script
async function sendMessage(action: string, data?: Record<string, unknown>): Promise<MessageResponse> {
  return browser.runtime.sendMessage({ action, ...data });
}

// DOM Elements
const statusBadge = document.getElementById('statusBadge') as HTMLSpanElement;
const alertBox = document.getElementById('alertBox') as HTMLDivElement;
const keyList = document.getElementById('keyList') as HTMLDivElement;
const importKeyArmor = document.getElementById('importKeyArmor') as HTMLTextAreaElement;
const importBtn = document.getElementById('importBtn') as HTMLButtonElement;
const genName = document.getElementById('genName') as HTMLInputElement;
const genEmail = document.getElementById('genEmail') as HTMLInputElement;
const generateBtn = document.getElementById('generateBtn') as HTMLButtonElement;
const alwaysTrust = document.getElementById('alwaysTrust') as HTMLInputElement;
const armorOutput = document.getElementById('armorOutput') as HTMLInputElement;
const saveSettingsBtn = document.getElementById('saveSettingsBtn') as HTMLButtonElement;
const openDemoBtn = document.getElementById('openDemoBtn') as HTMLButtonElement;
const originsList = document.getElementById('originsList') as HTMLUListElement;
const newOriginInput = document.getElementById('newOrigin') as HTMLInputElement;
const addOriginBtn = document.getElementById('addOriginBtn') as HTMLButtonElement;

// Tab handling
const tabs = document.querySelectorAll('.tab');
const tabContents = document.querySelectorAll('.tab-content');

tabs.forEach(tab => {
  tab.addEventListener('click', () => {
    const tabId = (tab as HTMLElement).dataset.tab;
    
    tabs.forEach(t => t.classList.remove('active'));
    tabContents.forEach(tc => tc.classList.remove('active'));
    
    tab.classList.add('active');
    document.getElementById(`${tabId}-tab`)?.classList.add('active');
  });
});

// Show alert
function showAlert(message: string, type: 'success' | 'error'): void {
  alertBox.textContent = message;
  alertBox.className = `alert visible ${type}`;
  
  setTimeout(() => {
    alertBox.classList.remove('visible');
  }, 5000);
}

// Update status
function updateStatus(connected: boolean): void {
  statusBadge.textContent = connected ? 'Connected' : 'Disconnected';
  statusBadge.className = `status-badge ${connected ? 'connected' : 'disconnected'}`;
}

// Format fingerprint with spaces
function formatFingerprint(fp: string): string {
  return fp.replace(/(.{4})/g, '$1 ').trim();
}

// Create key item element
function createKeyItem(key: Key): HTMLDivElement {
  const item = document.createElement('div');
  item.className = 'key-item';
  
  const userId = key.userIds[0];
  const name = userId?.name || userId?.userId || 'Unknown';
  const email = userId?.email || '';
  
  item.innerHTML = `
    <div class="key-info">
      <div class="key-badges">
        ${key.hasSecret ? '<span class="badge secret">Secret Key</span>' : ''}
        ${key.expired ? '<span class="badge expired">Expired</span>' : ''}
        ${key.revoked ? '<span class="badge revoked">Revoked</span>' : ''}
      </div>
      <div class="key-name">${escapeHtml(name)}</div>
      ${email ? `<div class="key-email">${escapeHtml(email)}</div>` : ''}
      <div class="key-fingerprint">${formatFingerprint(key.fingerprint)}</div>
    </div>
    <div class="key-actions">
      <button class="export-btn" data-fingerprint="${key.fingerprint}">Export</button>
      <button class="danger delete-btn" data-fingerprint="${key.fingerprint}" ${key.hasSecret ? 'data-has-secret="true"' : ''}>Delete</button>
    </div>
  `;
  
  return item;
}

// Escape HTML
function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Load keys
async function loadKeys(): Promise<void> {
  try {
    const response = await sendMessage('getKeys');
    
    if (response.success && Array.isArray(response.data)) {
      const keys = response.data as Key[];
      
      updateStatus(true);
      
      if (keys.length === 0) {
        keyList.innerHTML = `
          <div class="empty-state">
            <p>No keys found in your GnuPG keyring.</p>
            <p>Import a key or generate a new one to get started.</p>
          </div>
        `;
      } else {
        keyList.innerHTML = '';
        keys.forEach(key => {
          keyList.appendChild(createKeyItem(key));
        });
        
        // Add event listeners for buttons
        keyList.querySelectorAll('.export-btn').forEach(btn => {
          btn.addEventListener('click', handleExport);
        });
        
        keyList.querySelectorAll('.delete-btn').forEach(btn => {
          btn.addEventListener('click', handleDelete);
        });
      }
    } else {
      throw new Error(response.error?.message || 'Failed to load keys');
    }
  } catch (error) {
    console.error('Failed to load keys:', error);
    updateStatus(false);
    keyList.innerHTML = `
      <div class="empty-state">
        <p>Failed to connect to GnuPG.</p>
        <p>Make sure the native messaging host is installed.</p>
      </div>
    `;
  }
}

// Handle export
async function handleExport(e: Event): Promise<void> {
  const btn = e.target as HTMLButtonElement;
  const fingerprint = btn.dataset.fingerprint;
  
  if (!fingerprint) return;
  
  try {
    btn.disabled = true;
    
    const response = await sendMessage('getKeysArmored', {
      data: fingerprint
    });
    
    if (response.success) {
      const result = response.data as { armored: string };
      
      // Copy to clipboard
      await navigator.clipboard.writeText(result.armored);
      showAlert('Public key copied to clipboard!', 'success');
    } else {
      throw new Error(response.error?.message || 'Export failed');
    }
  } catch (error) {
    showAlert(`Export failed: ${error}`, 'error');
  } finally {
    btn.disabled = false;
  }
}

// Handle delete
async function handleDelete(e: Event): Promise<void> {
  const btn = e.target as HTMLButtonElement;
  const fingerprint = btn.dataset.fingerprint;
  const hasSecret = btn.dataset.hasSecret === 'true';
  
  if (!fingerprint) return;
  
  const confirmMsg = hasSecret 
    ? 'This key has a secret key. Are you sure you want to delete it? This cannot be undone!'
    : 'Are you sure you want to delete this key?';
  
  if (!confirm(confirmMsg)) return;
  
  try {
    btn.disabled = true;
    
    const response = await sendMessage('deleteKey', {
      fingerprint,
      options: { base64: hasSecret } // reusing for secret flag
    });
    
    if (response.success) {
      showAlert('Key deleted successfully', 'success');
      loadKeys();
    } else {
      throw new Error(response.error?.message || 'Delete failed');
    }
  } catch (error) {
    showAlert(`Delete failed: ${error}`, 'error');
    btn.disabled = false;
  }
}

// Import key handler
importBtn.addEventListener('click', async () => {
  const armor = importKeyArmor.value.trim();
  
  if (!armor) {
    showAlert('Please paste a key to import', 'error');
    return;
  }
  
  try {
    importBtn.disabled = true;
    
    const response = await sendMessage('importKey', {
      data: armor
    });
    
    if (response.success) {
      showAlert('Key imported successfully!', 'success');
      importKeyArmor.value = '';
      
      // Switch to keys tab and reload
      (tabs[0] as HTMLButtonElement).click();
      loadKeys();
    } else {
      throw new Error(response.error?.message || 'Import failed');
    }
  } catch (error) {
    showAlert(`Import failed: ${error}`, 'error');
  } finally {
    importBtn.disabled = false;
  }
});

// Generate key handler
generateBtn.addEventListener('click', async () => {
  const name = genName.value.trim();
  const email = genEmail.value.trim();
  
  if (!name || !email) {
    showAlert('Please enter both name and email', 'error');
    return;
  }
  
  try {
    generateBtn.disabled = true;
    generateBtn.textContent = 'Generating...';
    
    const response = await sendMessage('generateKey', {
      data: `${name} <${email}>`
    });
    
    if (response.success) {
      showAlert('Key generated successfully!', 'success');
      genName.value = '';
      genEmail.value = '';
      
      // Switch to keys tab and reload
      (tabs[0] as HTMLButtonElement).click();
      loadKeys();
    } else {
      throw new Error(response.error?.message || 'Generation failed');
    }
  } catch (error) {
    showAlert(`Generation failed: ${error}`, 'error');
  } finally {
    generateBtn.disabled = false;
    generateBtn.textContent = 'Generate Key';
  }
});

// Save settings handler
saveSettingsBtn.addEventListener('click', async () => {
  const settings = {
    alwaysTrust: alwaysTrust.checked,
    armorOutput: armorOutput.checked
  };
  
  await browser.storage.local.set({ settings });
  showAlert('Settings saved!', 'success');
});

// Open demo page handler
openDemoBtn.addEventListener('click', () => {
  browser.tabs.create({ url: browser.runtime.getURL('demo.html') });
});

// Load settings
async function loadSettings(): Promise<void> {
  const result = await browser.storage.local.get('settings');
  const settings = result.settings || {};
  
  alwaysTrust.checked = settings.alwaysTrust || false;
  armorOutput.checked = settings.armorOutput !== false; // default true
}

// Load and display allowed origins
async function loadOrigins(): Promise<void> {
  const result = await browser.storage.local.get(['allowedOrigins']);
  const origins: string[] = (result.allowedOrigins as string[]) || [];
  
  if (origins.length === 0) {
    originsList.innerHTML = '<li style="color: #999;">No custom origins added</li>';
    return;
  }
  
  originsList.innerHTML = origins.map(origin => `
    <li style="display: flex; justify-content: space-between; align-items: center; padding: 8px 0;">
      <span style="font-family: monospace; font-size: 13px;">${origin}</span>
      <button class="remove-origin" data-origin="${origin}" style="padding: 4px 8px; background: #dc3545; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 12px;">Remove</button>
    </li>
  `).join('');
  
  // Add click handlers for remove buttons
  originsList.querySelectorAll('.remove-origin').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const origin = (e.target as HTMLButtonElement).dataset.origin;
      if (origin) {
        await removeOrigin(origin);
      }
    });
  });
}

// Add a new origin
async function addOrigin(): Promise<void> {
  let origin = newOriginInput.value.trim();
  
  if (!origin) return;
  
  // Normalize the origin
  try {
    const url = new URL(origin);
    origin = url.origin;
  } catch {
    showAlert('Invalid URL. Please enter a valid URL like https://example.com', 'error');
    return;
  }
  
  const result = await browser.storage.local.get(['allowedOrigins']);
  const origins: string[] = (result.allowedOrigins as string[]) || [];
  
  if (origins.includes(origin)) {
    showAlert('This origin is already allowed', 'error');
    return;
  }
  
  origins.push(origin);
  await browser.storage.local.set({ allowedOrigins: origins });
  
  newOriginInput.value = '';
  showAlert(`Added ${origin}`, 'success');
  await loadOrigins();
}

// Remove an origin
async function removeOrigin(origin: string): Promise<void> {
  const result = await browser.storage.local.get(['allowedOrigins']);
  const origins: string[] = (result.allowedOrigins as string[]) || [];
  
  const newOrigins = origins.filter(o => o !== origin);
  await browser.storage.local.set({ allowedOrigins: newOrigins });
  
  showAlert(`Removed ${origin}`, 'success');
  await loadOrigins();
}

// Add origin button handler
addOriginBtn.addEventListener('click', addOrigin);

// Allow Enter key to add origin
newOriginInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') {
    addOrigin();
  }
});

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  loadKeys();
  loadSettings();
  loadOrigins();
});
