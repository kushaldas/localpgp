/**
 * LocalPGP Firefox Extension - Popup Script
 * Manages allowed sites and shows connection status
 */

// Make this a module to avoid name collisions
export {};

interface MessageResponse {
  success: boolean;
  data?: unknown;
  error?: {
    code: string;
    message: string;
  };
}

// Storage key for allowed origins
const ALLOWED_ORIGINS_KEY = 'allowedOrigins';

// DOM Elements
const statusDot = document.getElementById('statusDot') as HTMLDivElement;
const statusText = document.getElementById('statusText') as HTMLSpanElement;
const currentOrigin = document.getElementById('currentOrigin') as HTMLDivElement;
const currentStatus = document.getElementById('currentStatus') as HTMLDivElement;
const siteIcon = document.getElementById('siteIcon') as HTMLDivElement;
const toggleBtn = document.getElementById('toggleBtn') as HTMLButtonElement;
const sitesList = document.getElementById('sitesList') as HTMLDivElement;
const sitesCount = document.getElementById('sitesCount') as HTMLSpanElement;
const newOriginInput = document.getElementById('newOriginInput') as HTMLInputElement;
const addOriginBtn = document.getElementById('addOriginBtn') as HTMLButtonElement;
const optionsLink = document.getElementById('optionsLink') as HTMLAnchorElement;
const errorToast = document.getElementById('errorToast') as HTMLDivElement;
const successToast = document.getElementById('successToast') as HTMLDivElement;

// Current tab's origin
let currentTabOrigin: string | null = null;
let allowedOrigins: string[] = [];

// Send message to background script
async function sendMessage(action: string, data?: Record<string, unknown>): Promise<MessageResponse> {
  return browser.runtime.sendMessage({ action, ...data });
}

// Show toast message
function showError(message: string): void {
  errorToast.textContent = message;
  errorToast.classList.add('visible');
  setTimeout(() => errorToast.classList.remove('visible'), 3000);
}

function showSuccess(message: string): void {
  successToast.textContent = message;
  successToast.classList.add('visible');
  setTimeout(() => successToast.classList.remove('visible'), 2000);
}

// Check connection status
async function checkConnection(): Promise<boolean> {
  try {
    const response = await sendMessage('getKeys');
    if (response.success) {
      const keys = response.data as Array<unknown>;
      statusDot.classList.add('connected');
      statusText.textContent = `Connected - ${keys.length} keys`;
      return true;
    } else {
      throw new Error(response.error?.message || 'Connection failed');
    }
  } catch (error) {
    statusDot.classList.remove('connected');
    statusText.textContent = 'Not connected';
    return false;
  }
}

// Get allowed origins from storage
async function loadAllowedOrigins(): Promise<void> {
  try {
    const result = await browser.storage.local.get(ALLOWED_ORIGINS_KEY);
    allowedOrigins = result[ALLOWED_ORIGINS_KEY] || [];
    renderSitesList();
    updateCurrentSiteStatus();
  } catch (error) {
    console.error('Failed to load allowed origins:', error);
    allowedOrigins = [];
  }
}

// Save allowed origins to storage
async function saveAllowedOrigins(): Promise<void> {
  await browser.storage.local.set({ [ALLOWED_ORIGINS_KEY]: allowedOrigins });
}

// Get current tab's origin
async function getCurrentTabOrigin(): Promise<void> {
  try {
    const tabs = await browser.tabs.query({ active: true, currentWindow: true });
    if (tabs[0]?.url) {
      const url = new URL(tabs[0].url);
      // Only allow http/https origins
      if (url.protocol === 'http:' || url.protocol === 'https:') {
        currentTabOrigin = url.origin;
        currentOrigin.textContent = currentTabOrigin;
        
        // Set favicon
        try {
          const hostname = url.hostname;
          siteIcon.innerHTML = hostname.charAt(0).toUpperCase();
        } catch {
          siteIcon.innerHTML = '🌐';
        }
      } else {
        currentTabOrigin = null;
        currentOrigin.textContent = 'Not a web page';
        currentStatus.textContent = 'Only web pages can be allowed';
        currentStatus.className = 'site-status not-allowed';
        toggleBtn.disabled = true;
        toggleBtn.textContent = 'N/A';
        toggleBtn.className = 'toggle-btn';
      }
    }
  } catch (error) {
    console.error('Failed to get current tab:', error);
    currentOrigin.textContent = 'Unknown';
  }
}

// Update current site status
function updateCurrentSiteStatus(): void {
  if (!currentTabOrigin) return;
  
  const isAllowed = allowedOrigins.includes(currentTabOrigin);
  
  if (isAllowed) {
    currentStatus.textContent = '✓ Allowed to use LocalPGP';
    currentStatus.className = 'site-status allowed';
    toggleBtn.textContent = 'Revoke Access';
    toggleBtn.className = 'toggle-btn revoke';
  } else {
    currentStatus.textContent = '✗ Not allowed';
    currentStatus.className = 'site-status not-allowed';
    toggleBtn.textContent = 'Allow This Site';
    toggleBtn.className = 'toggle-btn allow';
  }
  
  toggleBtn.disabled = false;
}

// Render sites list
function renderSitesList(): void {
  sitesCount.textContent = String(allowedOrigins.length);
  
  if (allowedOrigins.length === 0) {
    sitesList.innerHTML = `
      <div class="empty-state">
        <span>🔒</span>
        No sites allowed yet
      </div>
    `;
    return;
  }
  
  sitesList.innerHTML = allowedOrigins
    .map(origin => `
      <div class="site-item" data-origin="${escapeHtml(origin)}">
        <span class="site-item-origin">${escapeHtml(origin)}</span>
        <button class="remove-btn" title="Remove">×</button>
      </div>
    `)
    .join('');
  
  // Add remove handlers
  sitesList.querySelectorAll('.remove-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const item = (e.target as HTMLElement).closest('.site-item') as HTMLElement;
      const origin = item.dataset.origin;
      if (origin) {
        await removeOrigin(origin);
      }
    });
  });
}

// Add origin
async function addOrigin(origin: string): Promise<void> {
  try {
    // Validate URL
    const url = new URL(origin);
    const normalizedOrigin = url.origin;
    
    if (allowedOrigins.includes(normalizedOrigin)) {
      showError('Site already allowed');
      return;
    }
    
    allowedOrigins.push(normalizedOrigin);
    await saveAllowedOrigins();
    renderSitesList();
    updateCurrentSiteStatus();
    showSuccess(`Added ${normalizedOrigin}`);
  } catch {
    showError('Invalid URL format');
  }
}

// Remove origin
async function removeOrigin(origin: string): Promise<void> {
  allowedOrigins = allowedOrigins.filter(o => o !== origin);
  await saveAllowedOrigins();
  renderSitesList();
  updateCurrentSiteStatus();
  showSuccess(`Removed ${origin}`);
}

// Toggle current site
async function toggleCurrentSite(): Promise<void> {
  if (!currentTabOrigin) return;
  
  const isAllowed = allowedOrigins.includes(currentTabOrigin);
  
  if (isAllowed) {
    await removeOrigin(currentTabOrigin);
  } else {
    await addOrigin(currentTabOrigin);
  }
}

// Escape HTML
function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Event Listeners
toggleBtn.addEventListener('click', toggleCurrentSite);

addOriginBtn.addEventListener('click', () => {
  const value = newOriginInput.value.trim();
  if (value) {
    addOrigin(value);
    newOriginInput.value = '';
  }
});

newOriginInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') {
    const value = newOriginInput.value.trim();
    if (value) {
      addOrigin(value);
      newOriginInput.value = '';
    }
  }
});

optionsLink.addEventListener('click', (e) => {
  e.preventDefault();
  browser.runtime.openOptionsPage();
});

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
  await Promise.all([
    checkConnection(),
    getCurrentTabOrigin()
  ]);
  await loadAllowedOrigins();
});
