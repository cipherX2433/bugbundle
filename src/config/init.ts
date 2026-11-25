import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ExportError, FileExistsError } from '../errors/index.js';
import { PathSecurityGuard } from '../security/index.js';
import type { SecurityGuard } from '../types/index.js';
import {
  CONFIG_FILENAME,
  createDefaultConfig,
  validateConfig,
  type BugbundleConfig,
} from './schema.js';

export interface InitFileWriter {
  writeExclusive(filePath: string, content: string): Promise<void>;
}

export interface InitConfigOptions {
  readonly cwd?: string | undefined;
  readonly projectName?: string | undefined;
  readonly securityGuard?: SecurityGuard | undefined;
  readonly writer?: InitFileWriter | undefined;
}

export interface InitConfigResult {
  readonly filePath: string;
  readonly config: BugbundleConfig;
  readonly explanations: readonly string[];
}

const defaultWriter: InitFileWriter = {
  async writeExclusive(filePath: string, content: string): Promise<void> {
    await writeFile(filePath, content, { encoding: 'utf8', flag: 'wx' });
  },
};

function isErrnoCode(error: unknown, code: string): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === code
  );
}

export function buildConfigExplanations(config: BugbundleConfig): readonly string[] {
  const lines: string[] = [];
  if (config.projectName) {
    lines.push(`projectName: "${config.projectName}" — optional project label for reports.`);
  }
  lines.push(
    `collectors.enabled: [${(config.collectors.enabled ?? []).join(', ')}] — active diagnostic collectors.`,
  );
  lines.push(
    `collectors.excluded: [${(config.collectors.excluded ?? []).join(', ')}] — collectors skipped during runs.`,
  );
  lines.push(`report.filename: "${config.report.filename}" — default Markdown report filename.`);
  lines.push(
    `report.includeWarnings: ${String(config.report.includeWarnings)} — include collector warnings in reports.`,
  );
  lines.push(
    `options.includeDevDependencies: ${String(config.options.includeDevDependencies)} — include devDependencies metadata.`,
  );
  lines.push(
    `options.processTimeoutMs: ${String(config.options.processTimeoutMs)} — timeout (ms) for runtime version checks.`,
  );
  return lines;
}

export async function initConfig(options: InitConfigOptions = {}): Promise<InitConfigResult> {
  const cwd = options.cwd ?? process.cwd();
  const guard = options.securityGuard ?? new PathSecurityGuard(cwd);
  const writer = options.writer ?? defaultWriter;

  const safePath = await guard.assertSafePath(CONFIG_FILENAME);
  const alreadyExists = await guard.fileExists(CONFIG_FILENAME);
  if (alreadyExists) {
    throw new FileExistsError(
      `${CONFIG_FILENAME} already exists in this directory. Refusing to overwrite existing configuration.`,
    );
  }

  const candidate = createDefaultConfig(options.projectName);
  const validated = validateConfig(candidate);
  const serialized = `${JSON.stringify(validated, null, 2)}\n`;

  try {
    await writer.writeExclusive(safePath || join(cwd, CONFIG_FILENAME), serialized);
  } catch (error: unknown) {
    if (isErrnoCode(error, 'EEXIST')) {
      throw new FileExistsError(
        `${CONFIG_FILENAME} already exists in this directory. Refusing to overwrite existing configuration.`,
      );
    }
    if (
      isErrnoCode(error, 'EACCES') ||
      isErrnoCode(error, 'EPERM') ||
      isErrnoCode(error, 'EROFS')
    ) {
      throw new ExportError(
        `Permission denied while writing ${CONFIG_FILENAME}. Check directory write permissions.`,
        error,
      );
    }
    const message = error instanceof Error ? error.message : 'Unable to write configuration file.';
    throw new ExportError(`Failed to write ${CONFIG_FILENAME}: ${message}`, error);
  }

  return {
    filePath: CONFIG_FILENAME,
    config: validated,
    explanations: buildConfigExplanations(validated),
  };
}
