/**
 * Error types and error handling for tinyopgp
 */

/** Error codes used by gpgme-json and tinyopgp */
export const ErrorCodes = {
  // Connection errors
  CONN_NO_CONFIG: 'CONN_NO_CONFIG',
  CONN_NO_CONNECT: 'CONN_NO_CONNECT',
  CONN_NATIVEMESSAGE: 'CONN_NATIVEMESSAGE',
  CONN_TIMEOUT: 'CONN_TIMEOUT',
  CONN_UNEXPECTED_ANSWER: 'CONN_UNEXPECTED_ANSWER',
  CONN_ALREADY_CONNECTED: 'CONN_ALREADY_CONNECTED',
  
  // Parameter errors
  PARAM_WRONG: 'PARAM_WRONG',
  PARAM_IGNORED: 'PARAM_IGNORED',
  
  // Message errors
  MSG_INCOMPLETE: 'MSG_INCOMPLETE',
  MSG_EMPTY: 'MSG_EMPTY',
  MSG_OP_PENDING: 'MSG_OP_PENDING',
  MSG_NO_KEYS: 'MSG_NO_KEYS',
  MSG_OP_BLOCKED: 'MSG_OP_BLOCKED',
  MSG_NOT_A_FPR: 'MSG_NOT_A_FPR',
  MSG_UNEXPECTED: 'MSG_UNEXPECTED',
  
  // Key errors
  KEY_INVALID: 'KEY_INVALID',
  KEY_NOKEY: 'KEY_NOKEY',
  KEY_NO_DEFAULT: 'KEY_NO_DEFAULT',
  KEY_UNSUPP_ALGO: 'KEY_UNSUPP_ALGO',
  KEY_NO_USERID: 'KEY_NO_USERID',
  
  // Signature errors
  SIG_NO_SIGS: 'SIG_NO_SIGS',
  SIG_WRONG: 'SIG_WRONG',
  
  // GNUPG errors
  GNUPG_ERROR: 'GNUPG_ERROR',
} as const;

export type ErrorCode = typeof ErrorCodes[keyof typeof ErrorCodes];

/** Error messages for each error code */
const ErrorMessages: Record<ErrorCode, string> = {
  [ErrorCodes.CONN_NO_CONFIG]: 'Native messaging host not configured. Please install gpgme-json.',
  [ErrorCodes.CONN_NO_CONNECT]: 'Could not establish connection to gpgme-json.',
  [ErrorCodes.CONN_NATIVEMESSAGE]: 'Native messaging error.',
  [ErrorCodes.CONN_TIMEOUT]: 'Connection timeout. gpgme-json did not respond in time.',
  [ErrorCodes.CONN_UNEXPECTED_ANSWER]: 'Unexpected response from gpgme-json.',
  [ErrorCodes.CONN_ALREADY_CONNECTED]: 'Already connected to gpgme-json.',
  
  [ErrorCodes.PARAM_WRONG]: 'Invalid parameter provided.',
  [ErrorCodes.PARAM_IGNORED]: 'Parameter was ignored.',
  
  [ErrorCodes.MSG_INCOMPLETE]: 'Message is incomplete. Required parameters are missing.',
  [ErrorCodes.MSG_EMPTY]: 'No data provided.',
  [ErrorCodes.MSG_OP_PENDING]: 'Operation already in progress.',
  [ErrorCodes.MSG_NO_KEYS]: 'No keys specified for operation.',
  [ErrorCodes.MSG_OP_BLOCKED]: 'Operation blocked.',
  [ErrorCodes.MSG_NOT_A_FPR]: 'Value is not a valid fingerprint.',
  [ErrorCodes.MSG_UNEXPECTED]: 'Unexpected message format.',
  
  [ErrorCodes.KEY_INVALID]: 'Invalid key.',
  [ErrorCodes.KEY_NOKEY]: 'Key not found.',
  [ErrorCodes.KEY_NO_DEFAULT]: 'No default key configured in GnuPG.',
  [ErrorCodes.KEY_UNSUPP_ALGO]: 'Unsupported key algorithm.',
  [ErrorCodes.KEY_NO_USERID]: 'Key has no user ID.',
  
  [ErrorCodes.SIG_NO_SIGS]: 'No signatures found.',
  [ErrorCodes.SIG_WRONG]: 'Invalid signature format.',
  
  [ErrorCodes.GNUPG_ERROR]: 'GnuPG error.',
};

/**
 * Custom error class for gpgme operations
 */
export class GpgmeError extends Error {
  public readonly code: ErrorCode;
  public readonly details?: string | undefined;

  constructor(code: ErrorCode, details?: string) {
    const baseMessage = ErrorMessages[code] || `Unknown error: ${code}`;
    const fullMessage = details ? `${baseMessage} ${details}` : baseMessage;
    
    super(fullMessage);
    
    this.name = 'GpgmeError';
    this.code = code;
    this.details = details;
    
    // Maintain proper stack trace (V8 specific)
    if ('captureStackTrace' in Error && typeof (Error as { captureStackTrace?: Function }).captureStackTrace === 'function') {
      (Error as { captureStackTrace: Function }).captureStackTrace(this, GpgmeError);
    }
  }

  /**
   * Create a GpgmeError from an error code string
   */
  static fromCode(code: string, details?: string): GpgmeError {
    const validCode = Object.values(ErrorCodes).includes(code as ErrorCode)
      ? (code as ErrorCode)
      : ErrorCodes.GNUPG_ERROR;
    return new GpgmeError(validCode, details || (code !== validCode ? code : undefined));
  }

  /**
   * Check if an error is a connection-related error
   */
  isConnectionError(): boolean {
    return this.code.startsWith('CONN_');
  }

  /**
   * Check if an error is a key-related error
   */
  isKeyError(): boolean {
    return this.code.startsWith('KEY_');
  }

  /**
   * Check if an error is a message/parameter error
   */
  isParameterError(): boolean {
    return this.code.startsWith('PARAM_') || this.code.startsWith('MSG_');
  }
}

/**
 * Create a GpgmeError with the specified code
 */
export function gpgmeError(code: ErrorCode, details?: string): GpgmeError {
  return new GpgmeError(code, details);
}

/**
 * Type guard to check if a value is a GpgmeError
 */
export function isGpgmeError(error: unknown): error is GpgmeError {
  return error instanceof GpgmeError;
}
