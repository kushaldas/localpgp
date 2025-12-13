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
  
  // Key info section
  const keyInfo = document.createElement('div');
  keyInfo.className = 'key-info';
  
  // Badges
  const badges = document.createElement('div');
  badges.className = 'key-badges';
  if (key.hasSecret) {
    const badge = document.createElement('span');
    badge.className = 'badge secret';
    badge.textContent = 'Secret Key';
    badges.appendChild(badge);
  }
  if (key.expired) {
    const badge = document.createElement('span');
    badge.className = 'badge expired';
    badge.textContent = 'Expired';
    badges.appendChild(badge);
  }
  if (key.revoked) {
    const badge = document.createElement('span');
    badge.className = 'badge revoked';
    badge.textContent = 'Revoked';
    badges.appendChild(badge);
  }
  keyInfo.appendChild(badges);
  
  // Name
  const nameDiv = document.createElement('div');
  nameDiv.className = 'key-name';
  nameDiv.textContent = name;
  keyInfo.appendChild(nameDiv);
  
  // Email
  if (email) {
    const emailDiv = document.createElement('div');
    emailDiv.className = 'key-email';
    emailDiv.textContent = email;
    keyInfo.appendChild(emailDiv);
  }
  
  // Fingerprint
  const fpDiv = document.createElement('div');
  fpDiv.className = 'key-fingerprint';
  fpDiv.textContent = formatFingerprint(key.fingerprint);
  keyInfo.appendChild(fpDiv);
  
  item.appendChild(keyInfo);
  
  // Actions section
  const actions = document.createElement('div');
  actions.className = 'key-actions';
  
  const exportBtn = document.createElement('button');
  exportBtn.className = 'export-btn';
  exportBtn.dataset.fingerprint = key.fingerprint;
  exportBtn.textContent = 'Export';
  actions.appendChild(exportBtn);
  
  const deleteBtn = document.createElement('button');
  deleteBtn.className = 'danger delete-btn';
  deleteBtn.dataset.fingerprint = key.fingerprint;
  if (key.hasSecret) {
    deleteBtn.dataset.hasSecret = 'true';
  }
  deleteBtn.textContent = 'Delete';
  actions.appendChild(deleteBtn);
  
  item.appendChild(actions);
  
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
  
  // Clear existing content
  originsList.textContent = '';
  
  if (origins.length === 0) {
    const emptyLi = document.createElement('li');
    emptyLi.style.color = '#999';
    emptyLi.textContent = 'No custom origins added';
    originsList.appendChild(emptyLi);
    return;
  }
  
  origins.forEach(origin => {
    const li = document.createElement('li');
    li.style.cssText = 'display: flex; justify-content: space-between; align-items: center; padding: 8px 0;';
    
    const span = document.createElement('span');
    span.style.cssText = 'font-family: monospace; font-size: 13px;';
    span.textContent = origin;
    li.appendChild(span);
    
    const btn = document.createElement('button');
    btn.className = 'remove-origin';
    btn.dataset.origin = origin;
    btn.style.cssText = 'padding: 4px 8px; background: #dc3545; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 12px;';
    btn.textContent = 'Remove';
    btn.addEventListener('click', async () => {
      await removeOrigin(origin);
    });
    li.appendChild(btn);
    
    originsList.appendChild(li);
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
