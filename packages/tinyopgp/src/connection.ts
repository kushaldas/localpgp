/**
 * Connection handling for gpgme-json native messaging
 */

import type { GpgmeMessage, GpgmeResponse } from './types';
import { GpgmeError, ErrorCodes } from './errors';
import { DEFAULT_CHUNKSIZE, DEFAULT_TIMEOUT } from './helpers';

/**
 * Native messaging port interface (subset of chrome.runtime.Port)
 */
interface NativePort {
  postMessage(message: unknown): void;
  disconnect(): void;
  onMessage: {
    addListener(callback: (message: unknown) => void): void;
    removeListener(callback: (message: unknown) => void): void;
  };
  onDisconnect: {
    addListener(callback: () => void): void;
  };
}

/**
 * Declare chrome API types for native messaging
 */
declare const chrome: {
  runtime: {
    connectNative(application: string): NativePort;
    lastError?: { message: string };
  };
};

/**
 * Connection class handles communication with gpgme-json via native messaging
 */
export class Connection {
  private port: NativePort | null = null;
  private connectionError: string | null = null;
  private isNativeHostUnknown = false;

  constructor() {
    this.connect();
  }

  /**
   * Connect to the native messaging host
   */
  private connect(): void {
    try {
      this.port = chrome.runtime.connectNative('gpgmejson');
      
      this.port.onDisconnect.addListener(() => {
        if (chrome.runtime.lastError) {
          this.connectionError = chrome.runtime.lastError.message;
          // Check if native host is not found
          if (this.connectionError.includes('not found') || 
              this.connectionError.includes('Native host has exited')) {
            this.isNativeHostUnknown = true;
          }
        } else {
          this.connectionError = 'Disconnected without error message';
        }
        this.port = null;
      });
    } catch (e) {
      this.connectionError = e instanceof Error ? e.message : 'Unknown connection error';
      this.port = null;
    }
  }

  /**
   * Disconnect from the native messaging host
   */
  disconnect(): void {
    if (this.port) {
      this.port.disconnect();
      this.port = null;
      this.connectionError = 'Disconnect requested by client';
    }
  }

  /**
   * Check if connection is available
   */
  get isConnected(): boolean {
    return this.port !== null;
  }

  /**
   * Check connection health
   */
  async checkConnection(timeout = DEFAULT_TIMEOUT): Promise<boolean> {
    return new Promise((resolve) => {
      const startTime = Date.now();
      
      const check = (): void => {
        if (this.connectionError) {
          resolve(false);
          return;
        }
        
        if (this.port) {
          resolve(true);
          return;
        }
        
        if (Date.now() - startTime > timeout) {
          resolve(false);
          return;
        }
        
        setTimeout(check, 25);
      };
      
      check();
    });
  }

  /**
   * Get connection error details
   */
  getConnectionError(): GpgmeError {
    if (this.isNativeHostUnknown) {
      return new GpgmeError(ErrorCodes.CONN_NO_CONFIG);
    }
    return new GpgmeError(
      ErrorCodes.CONN_NATIVEMESSAGE,
      this.connectionError || undefined
    );
  }

  /**
   * Post a message and wait for response
   */
  async post(message: GpgmeMessage): Promise<GpgmeResponse> {
    if (!this.port) {
      this.disconnect();
      throw this.getConnectionError();
    }

    return new Promise((resolve, reject) => {
      let responseB64 = '';

      const handleMessage = (msg: unknown): void => {
        const rawResponse = msg as { response?: string; more?: boolean; type?: string; msg?: string };
        
        // Check for empty response
        if (!rawResponse) {
          cleanup();
          reject(new GpgmeError(ErrorCodes.CONN_UNEXPECTED_ANSWER));
          return;
        }

        // Collect base64 response chunks
        if (rawResponse.response) {
          responseB64 += rawResponse.response;
        }

        // Check if there's more data coming
        if (rawResponse.more === true) {
          // Request next chunk
          this.port?.postMessage({
            op: 'getmore',
            chunksize: message.chunksize || DEFAULT_CHUNKSIZE
          });
          return;
        }

        // Complete response received - decode and parse
        cleanup();

        try {
          // Decode base64 response to JSON
          const decodedStr = atob(responseB64);
          const decoded = JSON.parse(decodedStr) as GpgmeResponse;
          
          // Check for error in decoded response
          if (decoded.type === 'error') {
            reject(new GpgmeError(
              ErrorCodes.GNUPG_ERROR,
              decoded.msg as string | undefined
            ));
            return;
          }
          
          resolve(decoded);
        } catch (e) {
          reject(new GpgmeError(
            ErrorCodes.CONN_UNEXPECTED_ANSWER,
            e instanceof Error ? e.message : 'Failed to decode response'
          ));
        }
      };

      const handleDisconnect = (): void => {
        cleanup();
        reject(this.getConnectionError());
      };

      const cleanup = (): void => {
        if (this.port) {
          this.port.onMessage.removeListener(handleMessage);
        }
      };

      // Set up listeners
      this.port.onMessage.addListener(handleMessage);
      this.port.onDisconnect.addListener(handleDisconnect);
      
      // Check for connection errors shortly after sending
      setTimeout(() => {
        if (this.connectionError) {
          cleanup();
          if (this.isNativeHostUnknown) {
            reject(new GpgmeError(ErrorCodes.CONN_NO_CONFIG));
          } else {
            reject(new GpgmeError(ErrorCodes.CONN_NO_CONNECT, this.connectionError));
          }
        }
      }, 25);

      // Send message
      try {
        this.port.postMessage(message);
      } catch (e) {
        cleanup();
        reject(new GpgmeError(
          ErrorCodes.CONN_NO_CONNECT,
          e instanceof Error ? e.message : undefined
        ));
      }
    });
  }
}

/**
 * Create a new connection to gpgme-json
 */
export function createConnection(): Connection {
  return new Connection();
}
