export {
  BugbundleError,
  CollectorExecutionError,
  ConfigValidationError,
  ExportError,
  FileExistsError,
  NonInteractiveApprovalError,
  ReviewAbortedError,
  SecurityBoundaryError,
  UserInterruptedError,
  formatCliError,
} from './bugbundle-error.js';
export type {
  BugbundleErrorCode,
  BugbundleErrorOptions,
  FormattedCliError,
} from './bugbundle-error.js';
export { EXIT_CODES, resolveExitCode } from './exit-codes.js';
export type { ExitCode } from './exit-codes.js';
