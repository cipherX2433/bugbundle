import type { SafeErrorSummary } from '../types/index.js';
import { EXIT_CODES, resolveExitCode, type ExitCode } from './exit-codes.js';

export type BugbundleErrorCode =
  | 'CONFIG_VALIDATION_ERROR'
  | 'SECURITY_BOUNDARY_ERROR'
  | 'COLLECTOR_EXECUTION_ERROR'
  | 'REVIEW_ABORTED_ERROR'
  | 'NON_INTERACTIVE_APPROVAL_ERROR'
  | 'FILE_EXISTS_ERROR'
  | 'EXPORT_ERROR'
  | 'USER_INTERRUPTED_ERROR'
  | 'INTERNAL_ERROR';

export interface BugbundleErrorOptions {
  readonly code: BugbundleErrorCode;
  readonly message: string;
  readonly exitCode?: number | undefined;
  readonly cause?: unknown;
}

/**
 * Base typed error for all intentional failure modes in bugbundle.
 */
export class BugbundleError extends Error {
  public readonly code: BugbundleErrorCode;
  public readonly exitCode: number;

  public constructor(options: BugbundleErrorOptions) {
    super(options.message, options.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = new.target.name;
    this.code = options.code;
    this.exitCode = options.exitCode ?? EXIT_CODES.INTERNAL_ERROR;
  }

  public toSafeSummary(): SafeErrorSummary {
    return {
      code: this.code,
      message: this.message,
    };
  }
}

export class ConfigValidationError extends BugbundleError {
  public constructor(message: string, cause?: unknown) {
    super({
      code: 'CONFIG_VALIDATION_ERROR',
      message,
      exitCode: EXIT_CODES.INVALID_INPUT,
      cause,
    });
  }
}

export class SecurityBoundaryError extends BugbundleError {
  public constructor(message: string, cause?: unknown) {
    super({
      code: 'SECURITY_BOUNDARY_ERROR',
      message,
      exitCode: EXIT_CODES.SECURITY_FAILURE,
      cause,
    });
  }
}

export class CollectorExecutionError extends BugbundleError {
  public constructor(message: string, cause?: unknown) {
    super({
      code: 'COLLECTOR_EXECUTION_ERROR',
      message,
      exitCode: EXIT_CODES.COLLECTION_FAILURE,
      cause,
    });
  }
}

export class ReviewAbortedError extends BugbundleError {
  public constructor(message = 'Export cancelled by user during review.') {
    super({
      code: 'REVIEW_ABORTED_ERROR',
      message,
      exitCode: EXIT_CODES.REVIEW_REQUIRED,
    });
  }
}

export class NonInteractiveApprovalError extends BugbundleError {
  public constructor(
    message = 'Refusing to export in non-interactive mode without an explicitly documented approval mechanism.',
  ) {
    super({
      code: 'NON_INTERACTIVE_APPROVAL_ERROR',
      message,
      exitCode: EXIT_CODES.REVIEW_REQUIRED,
    });
  }
}

export class FileExistsError extends BugbundleError {
  public constructor(message: string) {
    super({
      code: 'FILE_EXISTS_ERROR',
      message,
      exitCode: EXIT_CODES.EXPORT_FAILURE,
    });
  }
}

export class ExportError extends BugbundleError {
  public constructor(message: string, cause?: unknown) {
    super({
      code: 'EXPORT_ERROR',
      message,
      exitCode: EXIT_CODES.EXPORT_FAILURE,
      cause,
    });
  }
}

export class UserInterruptedError extends BugbundleError {
  public constructor(message = 'Operation interrupted by user (SIGINT).') {
    super({
      code: 'USER_INTERRUPTED_ERROR',
      message,
      exitCode: EXIT_CODES.USER_INTERRUPTED,
    });
  }
}

export interface FormattedCliError {
  readonly message: string;
  readonly exitCode: ExitCode;
}

/**
 * Formats an error safely for terminal stderr without exposing raw causes or environment state.
 */
export function formatCliError(error: unknown): FormattedCliError {
  const exitCode = resolveExitCode(error);

  if (error instanceof BugbundleError) {
    return {
      message: `[${error.code}] ${error.message}`,
      exitCode,
    };
  }

  if (error instanceof Error) {
    return {
      message: `[INTERNAL_ERROR] ${error.message}`,
      exitCode,
    };
  }

  return {
    message: '[INTERNAL_ERROR] An unexpected error occurred.',
    exitCode,
  };
}
