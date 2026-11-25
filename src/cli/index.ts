#!/usr/bin/env node
import { realpathSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import chalk from 'chalk';
import { CommanderError } from 'commander';
import { EXIT_CODES, formatCliError, resolveExitCode } from '../errors/index.js';
import type { MarkdownReportInput } from '../report/index.js';
import type { PromptAdapter } from '../review/index.js';
import { PathSanitizer, type SecurityPipeline } from '../security/index.js';
import type { Collector } from '../types/index.js';
import { createProgram } from './program.js';
import type { CliIo } from './program.js';

export interface RunCliOptions {
  readonly io?: CliIo | undefined;
  readonly exitOverride?: boolean | undefined;
  readonly collectors?: readonly Collector[] | undefined;
  readonly cwd?: string | undefined;
  readonly securityPipeline?: SecurityPipeline | undefined;
  readonly reportBuilder?: ((input: MarkdownReportInput) => string) | undefined;
  readonly prompt?: PromptAdapter | undefined;
}

export async function runCli(
  argv: readonly string[] = process.argv,
  options: RunCliOptions = {},
): Promise<number> {
  const io = options.io ?? {
    stdout: (text: string) => process.stdout.write(text),
    stderr: (text: string) => process.stderr.write(text),
  };

  const program = createProgram({
    io,
    exitOverride: options.exitOverride ?? true,
    collectors: options.collectors,
    cwd: options.cwd,
    securityPipeline: options.securityPipeline,
    reportBuilder: options.reportBuilder,
    prompt: options.prompt,
  });

  try {
    if (argv.length <= 2) {
      program.outputHelp();
      return EXIT_CODES.SUCCESS;
    }

    await program.parseAsync([...argv]);
    return EXIT_CODES.SUCCESS;
  } catch (error: unknown) {
    if (error instanceof CommanderError) {
      return resolveExitCode(error);
    }

    const formatted = formatCliError(error);
    const sanitizedMessage = new PathSanitizer().sanitizeText(formatted.message).text;
    io.stderr(`${chalk.red('Error:')} ${sanitizedMessage}\n`);
    return formatted.exitCode;
  }
}

function isCliEntrypoint(): boolean {
  const entry = process.argv[1];
  if (typeof entry !== 'string' || entry.length === 0) {
    return false;
  }

  try {
    return import.meta.url === pathToFileURL(realpathSync(entry)).href;
  } catch {
    return false;
  }
}

if (isCliEntrypoint()) {
  let interrupted = false;
  const onSigint = (): void => {
    interrupted = true;
    process.exitCode = EXIT_CODES.USER_INTERRUPTED;
  };
  process.once('SIGINT', onSigint);

  try {
    const exitCode = await runCli(process.argv);
    if (interrupted) {
      process.exitCode = EXIT_CODES.USER_INTERRUPTED;
    } else if (exitCode !== EXIT_CODES.SUCCESS) {
      process.exitCode = exitCode;
    }
  } finally {
    process.off('SIGINT', onSigint);
  }
}
