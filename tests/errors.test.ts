import { describe, expect, it } from 'vitest';
import {
  BugbundleError,
  CollectorExecutionError,
  ConfigValidationError,
  ExportError,
  FileExistsError,
  NonInteractiveApprovalError,
  ReviewAbortedError,
  SecurityBoundaryError,
  formatCliError,
} from '../src/errors/index.js';

describe('BugbundleError hierarchy', () => {
  it('constructs base error with code, exitCode, and safe summary', () => {
    const err = new BugbundleError({
      code: 'INTERNAL_ERROR',
      message: 'Something went wrong',
      exitCode: 3,
      cause: new Error('internal details'),
    });

    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(BugbundleError);
    expect(err.name).toBe('BugbundleError');
    expect(err.code).toBe('INTERNAL_ERROR');
    expect(err.exitCode).toBe(3);
    expect(err.toSafeSummary()).toEqual({
      code: 'INTERNAL_ERROR',
      message: 'Something went wrong',
    });
  });

  it('assigns expected codes to typed subclasses', () => {
    expect(new ConfigValidationError('invalid config').code).toBe('CONFIG_VALIDATION_ERROR');
    expect(new ConfigValidationError('invalid config').exitCode).toBe(2);
    expect(new SecurityBoundaryError('blocked .env').code).toBe('SECURITY_BOUNDARY_ERROR');
    expect(new CollectorExecutionError('collector failed').code).toBe('COLLECTOR_EXECUTION_ERROR');
    expect(new ReviewAbortedError().code).toBe('REVIEW_ABORTED_ERROR');
    expect(new NonInteractiveApprovalError().code).toBe('NON_INTERACTIVE_APPROVAL_ERROR');
    expect(new FileExistsError('already exists').code).toBe('FILE_EXISTS_ERROR');
    expect(new ExportError('write failed').code).toBe('EXPORT_ERROR');
  });

  it('formats BugbundleError and unknown errors safely', () => {
    expect(formatCliError(new SecurityBoundaryError('Access denied'))).toEqual({
      message: '[SECURITY_BOUNDARY_ERROR] Access denied',
      exitCode: 4,
    });

    expect(formatCliError(new Error('unexpected failure'))).toEqual({
      message: '[INTERNAL_ERROR] unexpected failure',
      exitCode: 1,
    });

    expect(formatCliError('non-error thrown')).toEqual({
      message: '[INTERNAL_ERROR] An unexpected error occurred.',
      exitCode: 1,
    });
  });
});
