import { execFile } from 'node:child_process';
import type {
  Collector,
  CollectorMetadata,
  CollectorResult,
  DiagnosticContext,
  RuntimeToolId,
  RuntimeToolInfo,
  RuntimesData,
} from '../types/index.js';

const DEFAULT_PROCESS_TIMEOUT_MS = 3000;

export interface ProcessInvocationResult {
  readonly ok: boolean;
  readonly stdout: string;
  readonly stderr: string;
  readonly timedOut: boolean;
  readonly notFound: boolean;
  readonly errorMessage?: string | undefined;
}

export interface ProcessRunner {
  run(
    executable: string,
    args: readonly string[],
    timeoutMs: number,
  ): Promise<ProcessInvocationResult>;
}

export interface RuntimesCollectorOptions {
  readonly runner?: ProcessRunner | undefined;
  readonly timeoutMs?: number | undefined;
  readonly fallbackNodeVersion?: string | undefined;
}

interface RuntimeCommandSpec {
  readonly id: RuntimeToolId;
  readonly name: string;
  readonly required: boolean;
  readonly invocations: readonly (readonly [executable: string, args: readonly string[]])[];
}

const RUNTIME_SPECS: readonly RuntimeCommandSpec[] = [
  {
    id: 'node',
    name: 'Node.js',
    required: true,
    invocations: [['node', ['--version']]],
  },
  {
    id: 'npm',
    name: 'npm',
    required: true,
    invocations: [['npm', ['--version']]],
  },
  {
    id: 'pnpm',
    name: 'pnpm',
    required: false,
    invocations: [['pnpm', ['--version']]],
  },
  {
    id: 'yarn',
    name: 'Yarn',
    required: false,
    invocations: [['yarn', ['--version']]],
  },
  {
    id: 'bun',
    name: 'Bun',
    required: false,
    invocations: [['bun', ['--version']]],
  },
  {
    id: 'python',
    name: 'Python',
    required: false,
    invocations: [
      ['python3', ['--version']],
      ['python', ['--version']],
    ],
  },
  {
    id: 'java',
    name: 'Java',
    required: false,
    invocations: [['java', ['-version']]],
  },
];

function isErrnoCode(error: unknown, code: string): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === code
  );
}

function isKilledTimeout(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) {
    return false;
  }
  const record = error as { killed?: unknown; signal?: unknown; code?: unknown };
  return (
    record.code === 'ETIMEDOUT' ||
    (record.killed === true && (record.signal === 'SIGTERM' || record.signal === 'SIGKILL'))
  );
}

export const defaultProcessRunner: ProcessRunner = {
  run(
    executable: string,
    args: readonly string[],
    timeoutMs: number,
  ): Promise<ProcessInvocationResult> {
    return new Promise((resolve) => {
      execFile(
        executable,
        [...args],
        {
          shell: false,
          timeout: timeoutMs,
          windowsHide: true,
          maxBuffer: 256 * 1024,
        },
        (error, stdout, stderr) => {
          if (!error) {
            resolve({
              ok: true,
              stdout: String(stdout ?? ''),
              stderr: String(stderr ?? ''),
              timedOut: false,
              notFound: false,
            });
            return;
          }

          const timedOut = isKilledTimeout(error);
          const notFound = isErrnoCode(error, 'ENOENT');

          resolve({
            ok: false,
            stdout: String(stdout ?? ''),
            stderr: String(stderr ?? ''),
            timedOut,
            notFound,
            errorMessage: error.message,
          });
        },
      );
    });
  },
};

export function normalizeRuntimeVersion(
  id: RuntimeToolId,
  stdout: string,
  stderr: string,
): string | undefined {
  const combined = `${stdout}\n${stderr}`.trim();
  if (!combined) {
    return undefined;
  }

  if (id === 'java') {
    const quotedMatch = /version\s+"([^"]+)"/i.exec(combined);
    if (quotedMatch?.[1]) {
      return quotedMatch[1].trim();
    }
  }

  const semverMatch = /v?(\d+\.\d+(?:\.\d+)?(?:[-+][0-9A-Za-z.-]+)?)/.exec(combined);
  if (semverMatch?.[1]) {
    return semverMatch[1].trim();
  }

  const firstLine = combined.split(/\r?\n/, 1)[0]?.trim();
  return firstLine || undefined;
}

async function detectSingleRuntime(
  spec: RuntimeCommandSpec,
  runner: ProcessRunner,
  timeoutMs: number,
  fallbackNodeVersion: string | undefined,
): Promise<RuntimeToolInfo> {
  let lastResult: ProcessInvocationResult | undefined;

  for (const [executable, args] of spec.invocations) {
    const result = await runner.run(executable, args, timeoutMs);
    lastResult = result;

    if (result.ok) {
      const version = normalizeRuntimeVersion(spec.id, result.stdout, result.stderr);
      if (version) {
        return {
          id: spec.id,
          name: spec.name,
          required: spec.required,
          status: 'detected',
          version,
        };
      }

      return {
        id: spec.id,
        name: spec.name,
        required: spec.required,
        status: 'error',
        warning: `${spec.name} executed but returned an unrecognized version output.`,
      };
    }

    if (result.timedOut) {
      return {
        id: spec.id,
        name: spec.name,
        required: spec.required,
        status: 'timeout',
        warning: `${spec.name} version check timed out after ${timeoutMs}ms.`,
      };
    }

    if (!result.notFound) {
      return {
        id: spec.id,
        name: spec.name,
        required: spec.required,
        status: 'error',
        warning: spec.required
          ? `Primary runtime "${spec.name}" version check failed.`
          : `Optional runtime "${spec.name}" is unavailable (version check failed).`,
      };
    }
  }

  if (spec.id === 'node' && fallbackNodeVersion) {
    const normalized = normalizeRuntimeVersion('node', fallbackNodeVersion, '');
    if (normalized) {
      return {
        id: spec.id,
        name: spec.name,
        required: spec.required,
        status: 'detected',
        version: normalized,
        warning: 'Node.js binary not found on PATH; reported active process.version.',
      };
    }
  }

  if (lastResult?.notFound) {
    return {
      id: spec.id,
      name: spec.name,
      required: spec.required,
      status: 'missing',
      warning: spec.required
        ? `Primary runtime "${spec.name}" is not available on PATH.`
        : `Optional runtime "${spec.name}" is not installed or not on PATH.`,
    };
  }

  return {
    id: spec.id,
    name: spec.name,
    required: spec.required,
    status: 'error',
    warning: `${spec.name} detection failed.`,
  };
}

export const RUNTIMES_COLLECTOR_META: CollectorMetadata = {
  id: 'runtimes',
  name: 'Runtime information',
  description: 'Detects Node.js, npm, and optional developer runtimes safely with timeouts',
  sensitivity: 'low',
};

export function createRuntimesCollector(
  options: RuntimesCollectorOptions = {},
): Collector<RuntimesData> {
  const runner = options.runner ?? defaultProcessRunner;
  const timeoutMs = options.timeoutMs ?? DEFAULT_PROCESS_TIMEOUT_MS;
  const fallbackNodeVersion =
    options.runner === undefined && options.fallbackNodeVersion === undefined
      ? process.version
      : options.fallbackNodeVersion;

  return {
    meta: RUNTIMES_COLLECTOR_META,
    async collect(_ctx: DiagnosticContext): Promise<CollectorResult<RuntimesData>> {
      const start = Date.now();

      try {
        const tools = await Promise.all(
          RUNTIME_SPECS.map((spec) =>
            detectSingleRuntime(spec, runner, timeoutMs, fallbackNodeVersion),
          ),
        );

        const warnings = tools
          .map((tool) => tool.warning)
          .filter((warning): warning is string => typeof warning === 'string');

        const detectedCount = tools.filter((tool) => tool.status === 'detected').length;
        const missingOptionalCount = tools.filter(
          (tool) => !tool.required && tool.status === 'missing',
        ).length;

        const hasPrimaryIssue = tools.some((tool) => tool.required && tool.status !== 'detected');
        const hasTimeout = tools.some((tool) => tool.status === 'timeout');

        const status = hasPrimaryIssue || hasTimeout ? 'partial' : 'ok';

        return {
          id: RUNTIMES_COLLECTOR_META.id,
          status,
          data: {
            tools,
            detectedCount,
            missingOptionalCount,
          },
          warnings,
          durationMs: Math.max(0, Date.now() - start),
        };
      } catch (error: unknown) {
        const message =
          error instanceof Error ? error.message : 'Failed to detect runtime versions.';
        return {
          id: RUNTIMES_COLLECTOR_META.id,
          status: 'error',
          warnings: [],
          error: {
            code: 'COLLECTOR_EXECUTION_ERROR',
            message,
          },
          durationMs: Math.max(0, Date.now() - start),
        };
      }
    },
  };
}

export const runtimesCollector: Collector<RuntimesData> = createRuntimesCollector();
