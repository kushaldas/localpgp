/**
 * Message builder for gpgme-json protocol
 */

import type { GpgmeMessage, GpgmeOperation, GpgmeResponse } from './types';
import { GpgmeError, ErrorCodes } from './errors';
import { Connection } from './connection';
import { DEFAULT_CHUNKSIZE } from './helpers';

/**
 * Permitted operations and their required/optional parameters
 */
const permittedOperations: Record<GpgmeOperation, {
  required?: string[];
  optional?: string[];
  pinentry?: boolean;
}> = {
  encrypt: {
    required: ['data', 'keys'],
    optional: ['protocol', 'signing_keys', 'base64', 'mime', 'armor', 'always-trust', 'no-encrypt-to', 'no-compress', 'throw-keyids', 'wrap', 'want-address', 'file_name'],
    pinentry: true,
  },
  decrypt: {
    required: ['data'],
    optional: ['protocol', 'base64'],
    pinentry: true,
  },
  sign: {
    required: ['data', 'keys'],
    optional: ['protocol', 'sender', 'mode', 'base64'],
    pinentry: true,
  },
  verify: {
    required: ['data'],
    optional: ['protocol', 'signature', 'base64'],
  },
  keylist: {
    optional: ['keys', 'protocol', 'secret', 'extern', 'local', 'sigs', 'notations', 'tofu', 'ephemeral', 'validate', 'locate'],
  },
  export: {
    optional: ['protocol', 'keys', 'armor', 'extern', 'minimal', 'raw', 'pkcs12', 'with-sec-fprs', 'secret'],
  },
  import: {
    required: ['data'],
    optional: ['protocol', 'base64'],
  },
  delete: {
    required: ['key'],
    optional: ['protocol'],
  },
  createkey: {
    required: ['userid'],
    optional: ['algo', 'expires'],
    pinentry: true,
  },
  version: {},
  config_opt: {
    required: ['component', 'option'],
  },
  getmore: {},
};

/**
 * Message class for building and sending gpgme-json messages
 */
export class Message {
  private msg: GpgmeMessage;
  private _expected: 'uint8' | 'base64' | null = null;

  constructor(operation: GpgmeOperation) {
    if (!(operation in permittedOperations)) {
      throw new GpgmeError(ErrorCodes.MSG_UNEXPECTED, `Unknown operation: ${operation}`);
    }

    this.msg = {
      op: operation,
      chunksize: DEFAULT_CHUNKSIZE,
    };
  }

  /**
   * Get the operation type
   */
  get operation(): GpgmeOperation {
    return this.msg.op as GpgmeOperation;
  }

  /**
   * Set expected output format
   */
  set expected(value: 'uint8' | 'base64' | null) {
    if (value === 'uint8' || value === 'base64') {
      this._expected = value;
    }
  }

  get expected(): 'uint8' | 'base64' | null {
    return this._expected;
  }

  /**
   * Get/set chunk size
   */
  get chunksize(): number {
    return this.msg.chunksize;
  }

  set chunksize(value: number) {
    if (value >= 10 * 1024) {
      this.msg.chunksize = value;
    }
  }

  /**
   * Set a parameter on the message
   */
  setParameter(key: string, value: unknown): void {
    const opDef = permittedOperations[this.operation];
    const allowed = [...(opDef.required || []), ...(opDef.optional || [])];
    
    // Allow operation-specific parameters
    if (allowed.length > 0 && !allowed.includes(key)) {
      // Silently ignore unknown parameters (gpgme-json behavior)
      return;
    }

    if (value !== undefined && value !== null) {
      this.msg[key] = value;
    }
  }

  /**
   * Check if message has all required parameters
   */
  isComplete(): boolean {
    const opDef = permittedOperations[this.operation];
    if (!opDef.required) {
      return true;
    }
    return opDef.required.every(param => param in this.msg);
  }

  /**
   * Get missing required parameters
   */
  getMissingParams(): string[] {
    const opDef = permittedOperations[this.operation];
    if (!opDef.required) {
      return [];
    }
    return opDef.required.filter(param => !(param in this.msg));
  }

  /**
   * Check if operation requires pinentry
   */
  requiresPinentry(): boolean {
    return permittedOperations[this.operation].pinentry === true;
  }

  /**
   * Get the raw message object
   */
  toJSON(): GpgmeMessage {
    return { ...this.msg };
  }

  /**
   * Send this message via a connection
   */
  async post(connection?: Connection): Promise<GpgmeResponse> {
    if (!this.isComplete()) {
      throw new GpgmeError(
        ErrorCodes.MSG_INCOMPLETE,
        `Missing parameters: ${this.getMissingParams().join(', ')}`
      );
    }

    console.log('GPGME: Posting message:', JSON.stringify(this.msg));
    const conn = connection || new Connection();
    const result = await conn.post(this.msg);
    console.log('GPGME: Got result:', JSON.stringify(result).substring(0, 500));
    return result;
  }
}

/**
 * Create a new message for the specified operation
 */
export function createMessage(operation: GpgmeOperation): Message {
  return new Message(operation);
}
