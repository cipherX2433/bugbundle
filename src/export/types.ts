import type { ReviewApproval } from '../review/index.js';

export interface ExportFileWriter {
  writeExclusive(filePath: string, content: string): Promise<void>;
}

export interface ExportReportOptions {
  readonly cwd: string;
  readonly destinationPath?: string | undefined;
  readonly markdownContent: string;
  readonly approval: ReviewApproval;
  readonly securityValidated: boolean;
  readonly writer?: ExportFileWriter | undefined;
}

export interface ExportReportResult {
  readonly ok: true;
  readonly filePath: string;
  readonly bytesWritten: number;
}
