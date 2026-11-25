export type CollectorStatus = 'ok' | 'partial' | 'skipped' | 'error';

export type CollectorSensitivity = 'low' | 'moderate';

export interface CollectorMetadata {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly sensitivity: CollectorSensitivity;
}

export interface SafeErrorSummary {
  readonly code: string;
  readonly message: string;
}

export interface SecurityGuard {
  assertSafePath(targetPath: string): Promise<string>;
  fileExists(targetPath: string): Promise<boolean>;
  readSafeTextFile(targetPath: string, maxBytes?: number): Promise<string>;
}

export interface ValidatedConfig {
  readonly cwd: string;
  readonly outputPath: string;
  readonly configPath?: string | undefined;
  readonly includeCollectors?: readonly string[] | undefined;
  readonly excludeCollectors?: readonly string[] | undefined;
}

export interface DiagnosticContext {
  readonly cwd: string;
  readonly config: ValidatedConfig;
  readonly securityGuard: SecurityGuard;
}

export interface CollectorResult<TData = unknown> {
  readonly id: string;
  readonly status: CollectorStatus;
  readonly data?: TData | undefined;
  readonly warnings: readonly string[];
  readonly error?: SafeErrorSummary | undefined;
  readonly durationMs: number;
}

export interface Collector<TData = unknown> {
  readonly meta: CollectorMetadata;
  collect(ctx: DiagnosticContext): Promise<CollectorResult<TData>>;
}

export interface SystemCpuInfo {
  readonly model: string;
  readonly cores: number;
}

export interface SystemInfoData {
  readonly platform: string;
  readonly release: string;
  readonly arch: string;
  readonly nodeVersion: string;
  readonly cpu: SystemCpuInfo;
}

export type RuntimeToolId = 'node' | 'npm' | 'pnpm' | 'yarn' | 'bun' | 'python' | 'java';

export type RuntimeDetectionStatus = 'detected' | 'missing' | 'timeout' | 'error';

export interface RuntimeToolInfo {
  readonly id: RuntimeToolId;
  readonly name: string;
  readonly required: boolean;
  readonly status: RuntimeDetectionStatus;
  readonly version?: string | undefined;
  readonly warning?: string | undefined;
}

export interface RuntimesData {
  readonly tools: readonly RuntimeToolInfo[];
  readonly detectedCount: number;
  readonly missingOptionalCount: number;
}

export type LockfileFilename =
  'package-lock.json' | 'pnpm-lock.yaml' | 'yarn.lock' | 'bun.lock' | 'bun.lockb';

export type LockfileType = 'npm' | 'pnpm' | 'yarn' | 'bun' | 'bun-binary';

export interface LockfileInfo {
  readonly filename: LockfileFilename;
  readonly type: LockfileType;
  readonly present: boolean;
  readonly supported: boolean;
  readonly lockfileVersion?: string | number | undefined;
  readonly formatNote?: string | undefined;
}

export interface DependencyCounts {
  readonly dependencies: number;
  readonly devDependencies: number;
  readonly total: number;
}

export interface DependenciesData {
  readonly manifestPresent: boolean;
  readonly projectName?: string | undefined;
  readonly projectVersion?: string | undefined;
  readonly packageManager?: string | undefined;
  readonly dependencies: Readonly<Record<string, string>>;
  readonly devDependencies: Readonly<Record<string, string>>;
  readonly counts: DependencyCounts;
  readonly lockfiles: readonly LockfileInfo[];
}

export interface DiagnosticBundle {
  readonly generatedAt: string;
  readonly cliVersion: string;
  readonly results: readonly CollectorResult[];
  readonly warnings: readonly string[];
}
