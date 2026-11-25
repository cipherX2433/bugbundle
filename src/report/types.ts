import type { DiagnosticBundle } from '../types/index.js';

export interface ReportSecuritySummary {
  readonly validated: boolean;
  readonly redactionCount: number;
  readonly pathReplacements?: number | undefined;
}

/**
 * Input contract for generating a Markdown diagnostic report from
 * security-processed diagnostic output.
 */
export interface MarkdownReportInput {
  readonly bundle: DiagnosticBundle;
  readonly projectName?: string | undefined;
  readonly includeWarnings?: boolean | undefined;
  readonly security?: ReportSecuritySummary | undefined;
}
