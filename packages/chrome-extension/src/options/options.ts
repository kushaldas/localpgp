/**
 * Options page script for LocalPGP Chrome Extension
 */

// Make this a module to avoid name collisions with other files
export {};

// Built-in allowed origins (always allowed)
const BUILTIN_ORIGINS = [
  'http://localhost',
  'http://127.0.0.1',
  'https://localhost',
  'https://127.0.0.1',
];

interface Key {
  fingerprint: string;
  keyId: string;
  userIds: Array<{ uid: string; name: string; email: string }>;
  hasSecret: boolean;
  isExpired: boolean;
  isRevoked: boolean;
  canEncrypt: boolean;
  canSign: boolean;
}

interface MessageResponse {
  success: boolean;
  data?: unknown;
  error?: string;
}

/**
 * Send message to background script
 */
const sendMessage = async (message: { action: string; [key: string]: unknown }): Promise<MessageResponse> => {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(message, (response: MessageResponse) => {
      resolve(response || { success: false, error: 'No response' });
    });
  });
};

/**
 * Update connection status
 */
const updateStatus = (connected: boolean, message: string): void => {
  const dot = document.getElementById('status-dot')!;
  const text = document.getElementById('status-text')!;
  
  dot.className = `status-dot ${connected ? 'connected' : 'disconnected'}`;
  text.textContent = message;
};

/**
 * Render keys list
 */
const renderKeys = (keys: Key[]): void => {
  const list = document.getElementById('keys-list')!;
  
  if (keys.length === 0) {
    list.innerHTML = '<li>No keys found in keyring</li>';
    return;
  }
  
  list.innerHTML = keys.map(key => {
    const userId = key.userIds[0];
    const badges: string[] = [];
    
    if (key.hasSecret) badges.push('<span class="badge badge-secret">Secret</span>');
    if (key.isExpired) badges.push('<span class="badge badge-expired">Expired</span>');
    if (key.isRevoked) badges.push('<span class="badge badge-revoked">Revoked</span>');
    
    return `
      <li>
        <div class="key-userid">${userId?.name || 'Unknown'} &lt;${userId?.email || 'unknown'}&gt;</div>
        <div class="key-fingerprint">${formatFingerprint(key.fingerprint)}</div>
        <div class="key-badges">${badges.join('')}</div>
      </li>
    `;
  }).join('');
};

/**
 * Format fingerprint with spaces
 */
const formatFingerprint = (fpr: string): string => {
  return fpr.match(/.{1,4}/g)?.join(' ') || fpr;
};

/**
 * Load and display keys
 */
const loadKeys = async (): Promise<void> => {
  const list = document.getElementById('keys-list')!;
  list.innerHTML = '<li>Loading keys...</li>';
  
  const response = await sendMessage({
    action: 'getKeys',
    prepareSync: true,
  });
  
  if (response.success) {
    renderKeys(response.data as Key[]);
  } else {
    list.innerHTML = `<li>Error loading keys: ${response.error}</li>`;
  }
};

/**
 * Initialize options page
 */
const init = async (): Promise<void> => {
  // Check connection
  const connectResponse = await sendMessage({ action: 'connect' });
  
  if (connectResponse.success) {
    const { status } = connectResponse.data as { status: string; error?: string };
    
    if (status === 'connected') {
      updateStatus(true, 'Connected to GnuPG');
      await loadKeys();
    } else {
      updateStatus(false, 'Not connected - make sure gpgme-json is installed');
    }
  } else {
    updateStatus(false, connectResponse.error || 'Connection failed');
  }
  
  // Load allowed origins
  await loadOrigins();
  await loadPendingRequests();
  
  // Refresh keys button
  document.getElementById('refresh-keys')?.addEventListener('click', loadKeys);
  
  // Add origin button
  document.getElementById('add-origin')?.addEventListener('click', addOrigin);
  
  // Allow Enter key to add origin
  document.getElementById('new-origin')?.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      addOrigin();
    }
  });
};

/**
 * Load and display allowed origins
 */
const loadOrigins = async (): Promise<void> => {
  const list = document.getElementById('origins-list')!;
  
  const result = await chrome.storage.local.get(['allowedOrigins']);
  const userOrigins: string[] = result.allowedOrigins || [];
  
  const allOrigins = [...BUILTIN_ORIGINS, ...userOrigins];
  
  if (allOrigins.length === 0) {
    list.innerHTML = '<li>No origins configured</li>';
    return;
  }
  
  list.innerHTML = allOrigins.map((origin, index) => {
    const isBuiltin = BUILTIN_ORIGINS.includes(origin);
    return `
      <li class="origin-item">
        <span class="origin-url ${isBuiltin ? 'origin-builtin' : ''}">${origin}${isBuiltin ? ' (built-in)' : ''}</span>
        ${!isBuiltin ? `<button class="btn btn-danger" data-origin="${origin}">Remove</button>` : ''}
      </li>
    `;
  }).join('');
  
  // Add remove handlers
  list.querySelectorAll('.btn-danger').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const origin = (e.target as HTMLElement).dataset.origin;
      if (origin) {
        await removeOrigin(origin);
      }
    });
  });
};

/**
 * Add a new allowed origin
 */
const addOrigin = async (): Promise<void> => {
  const input = document.getElementById('new-origin') as HTMLInputElement;
  let origin = input.value.trim();
  
  if (!origin) return;
  
  // Normalize the origin (remove trailing slash and path)
  try {
    const url = new URL(origin);
    origin = url.origin;
  } catch {
    alert('Invalid URL. Please enter a valid URL like https://example.com');
    return;
  }
  
  // Check if already exists
  const result = await chrome.storage.local.get(['allowedOrigins']);
  const origins: string[] = result.allowedOrigins || [];
  
  if (origins.includes(origin) || BUILTIN_ORIGINS.includes(origin)) {
    alert('This origin is already allowed');
    return;
  }
  
  origins.push(origin);
  await chrome.storage.local.set({ allowedOrigins: origins });
  
  input.value = '';
  await loadOrigins();
};

/**
 * Remove an allowed origin
 */
const removeOrigin = async (origin: string): Promise<void> => {
  const result = await chrome.storage.local.get(['allowedOrigins']);
  const origins: string[] = result.allowedOrigins || [];
  
  const newOrigins = origins.filter(o => o !== origin);
  await chrome.storage.local.set({ allowedOrigins: newOrigins });
  
  await loadOrigins();
};

/**
 * Load and display pending permission requests
 */
const loadPendingRequests = async (): Promise<void> => {
  const card = document.getElementById('pending-requests-card')!;
  const list = document.getElementById('pending-list')!;
  
  const result = await chrome.storage.local.get(['pendingOrigins']);
  const pendingOrigins: string[] = result.pendingOrigins || [];
  
  if (pendingOrigins.length === 0) {
    card.style.display = 'none';
    return;
  }
  
  card.style.display = 'block';
  
  list.innerHTML = pendingOrigins.map(origin => `
    <li class="origin-item">
      <span class="origin-url">${origin}</span>
      <div style="display: flex; gap: 8px;">
        <button class="btn btn-success" data-origin="${origin}" data-action="approve">Allow</button>
        <button class="btn btn-danger" data-origin="${origin}" data-action="deny">Deny</button>
      </div>
    </li>
  `).join('');
  
  // Add handlers
  list.querySelectorAll('.btn-success').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const origin = (e.target as HTMLElement).dataset.origin;
      if (origin) {
        await approveOrigin(origin);
      }
    });
  });
  
  list.querySelectorAll('.btn-danger').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const origin = (e.target as HTMLElement).dataset.origin;
      if (origin) {
        await denyOrigin(origin);
      }
    });
  });
};

/**
 * Approve a pending origin request
 */
const approveOrigin = async (origin: string): Promise<void> => {
  // Add to allowed origins
  const result = await chrome.storage.local.get(['allowedOrigins', 'pendingOrigins']);
  const allowedOrigins: string[] = result.allowedOrigins || [];
  const pendingOrigins: string[] = result.pendingOrigins || [];
  
  if (!allowedOrigins.includes(origin)) {
    allowedOrigins.push(origin);
  }
  
  const newPending = pendingOrigins.filter(o => o !== origin);
  
  await chrome.storage.local.set({ 
    allowedOrigins,
    pendingOrigins: newPending 
  });
  
  await loadOrigins();
  await loadPendingRequests();
};

/**
 * Deny a pending origin request
 */
const denyOrigin = async (origin: string): Promise<void> => {
  const result = await chrome.storage.local.get(['pendingOrigins']);
  const pendingOrigins: string[] = result.pendingOrigins || [];
  
  const newPending = pendingOrigins.filter(o => o !== origin);
  await chrome.storage.local.set({ pendingOrigins: newPending });
  
  await loadPendingRequests();
};

document.addEventListener('DOMContentLoaded', init);
