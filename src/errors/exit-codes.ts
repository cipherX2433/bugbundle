import { CommanderError } from 'commander';
import {
  BugbundleError,
  CollectorExecutionError,
  ConfigValidationError,
  ExportError,
  FileExistsError,
  NonInteractiveApprovalError,
  ReviewAbortedError,
  SecurityBoundaryError,
  UserInterruptedError,
} from './bugbundle-error.js';

export const EXIT_CODES = {
  SUCCESS: 0,
  INTERNAL_ERROR: 1,
  INVALID_INPUT: 2,
  COLLECTION_FAILURE: 3,
  SECURITY_FAILURE: 4,
  REVIEW_REQUIRED: 5,
  EXPORT_FAILURE: 6,
  USER_INTERRUPTED: 130,
} as const;

export type ExitCode = (typeof EXIT_CODES)[keyof typeof EXIT_CODES];

/**
 * Single centralized mapping from CLI, validation, collector, security,
 * review, export, and runtime errors to standardized CLI exit codes.
 */
export function resolveExitCode(error: unknown): ExitCode {
  if (error instanceof CommanderError) {
    return error.exitCode === 0 ? EXIT_CODES.SUCCESS : EXIT_CODES.INVALID_INPUT;
  }

  if (error instanceof ConfigValidationError) {
    return EXIT_CODES.INVALID_INPUT;
  }

  if (error instanceof CollectorExecutionError) {
    return EXIT_CODES.COLLECTION_FAILURE;
  }

  if (error instanceof SecurityBoundaryError) {
    return EXIT_CODES.SECURITY_FAILURE;
  }

  if (error instanceof ReviewAbortedError || error instanceof NonInteractiveApprovalError) {
    return EXIT_CODES.REVIEW_REQUIRED;
  }

  if (error instanceof FileExistsError || error instanceof ExportError) {
    return EXIT_CODES.EXPORT_FAILURE;
  }

  if (error instanceof UserInterruptedError) {
    return EXIT_CODES.USER_INTERRUPTED;
  }

  if (error instanceof BugbundleError) {
    return EXIT_CODES.INTERNAL_ERROR;
  }

  if (error instanceof Error && error.name === 'AbortError') {
    return EXIT_CODES.USER_INTERRUPTED;
  }

  return EXIT_CODES.INTERNAL_ERROR;
}
