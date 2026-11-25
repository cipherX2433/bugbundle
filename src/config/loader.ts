import { isAbsolute } from 'node:path';
import { ConfigValidationError, SecurityBoundaryError } from '../errors/index.js';
import { PathSecurityGuard } from '../security/index.js';
import type { SecurityGuard, ValidatedConfig } from '../types/index.js';
import {
  CONFIG_FILENAME,
  createDefaultConfig,
  validateConfig,
  type BugbundleConfig,
} from './schema.js';

export interface LoadConfigOptions {
  readonly cwd?: string | undefined;
  readonly configPath?: string | undefined;
  readonly securityGuard?: SecurityGuard | undefined;
}

export interface LoadedConfigResult {
  readonly found: boolean;
  readonly source: 'file' | 'defaults';
  readonly configPath: string;
  readonly config: BugbundleConfig;
}

function assertSafeConfigTarget(configPath: string): void {
  if (isAbsolute(configPath)) {
    throw new SecurityBoundaryError('Absolute configuration paths are not allowed.');
  }
  if (configPath.includes('..')) {
    throw new SecurityBoundaryError('Path traversal in configuration path is not allowed.');
  }
  if (/^\.env/i.test(configPath) || /\.env$/i.test(configPath)) {
    throw new SecurityBoundaryError('Reading .env files as configuration is strictly prohibited.');
  }
}

export async function loadConfig(options: LoadConfigOptions = {}): Promise<LoadedConfigResult> {
  const cwd = options.cwd ?? process.cwd();
  const configPath = options.configPath ?? CONFIG_FILENAME;

  assertSafeConfigTarget(configPath);

  const guard =
    options.securityGuard ??
    new PathSecurityGuard(cwd, {
      allowedFiles: [configPath],
    });

  let exists: boolean;
  try {
    exists = await guard.fileExists(configPath);
  } catch (error: unknown) {
    if (error instanceof SecurityBoundaryError || error instanceof ConfigValidationError) {
      throw error;
    }
    const message = error instanceof Error ? error.message : 'Unable to access configuration file.';
    throw new ConfigValidationError(`Failed to inspect ${configPath}: ${message}`, error);
  }

  if (!exists) {
    return {
      found: false,
      source: 'defaults',
      configPath,
      config: createDefaultConfig(),
    };
  }

  let rawText: string;
  try {
    rawText = await guard.readSafeTextFile(configPath);
  } catch (error: unknown) {
    if (error instanceof SecurityBoundaryError || error instanceof ConfigValidationError) {
      throw error;
    }
    const message = error instanceof Error ? error.message : 'Unable to read configuration file.';
    throw new ConfigValidationError(`Failed to read ${configPath}: ${message}`, error);
  }

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(rawText);
  } catch {
    throw new ConfigValidationError(`Malformed JSON in ${configPath}.`);
  }

  const config = validateConfig(parsedJson);
  return {
    found: true,
    source: 'file',
    configPath,
    config,
  };
}

export function toValidatedRuntimeConfig(cwd: string, loaded: LoadedConfigResult): ValidatedConfig {
  return {
    cwd,
    outputPath: loaded.config.report.filename,
    configPath: loaded.found ? loaded.configPath : undefined,
    includeCollectors: loaded.config.collectors.enabled,
    excludeCollectors: loaded.config.collectors.excluded,
  };
}
