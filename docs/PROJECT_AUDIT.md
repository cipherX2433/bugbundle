# Comprehensive Project Audit — `bugbundle`

**Audit Date:** 2026-11-25  
**Auditor Role:** Senior Staff TypeScript Engineer, Software Architect, QA Engineer & Application Security Auditor  
**Repository State:** Milestones 1, 2, and 3 implementation  
**Target Next Phase:** Milestone 4 (Markdown Report Builder, Config Loader, Review Gate & Safe Local Exporter)

---

## 1. Executive Summary

A comprehensive architectural, code quality, testing, and security audit was conducted on `bugbundle` across all implemented modules.

### High-Level Verdict: **PASS — READY FOR MILESTONE 4 WITH SPECIFIED REMEDIATIONS**

The repository adheres strictly to its foundational principles:

- **100% Local-First & Zero-Telemetry:** No HTTP clients, no analytics, no remote transmission, and no database or backend dependencies exist in `src/`.
- **Strict TypeScript Discipline:** Production code contains **zero** `any` escapes, compiles with full strictness (`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noImplicitOverride`, `noUnusedLocals`), and produces clean build outputs.
- **Fail-Closed Security Architecture:** `PathSecurityGuard` excludes `.env*`, SSH keys, credential files, shell histories, browser profiles, and `node_modules` before any file is opened. The `SecurityPipeline` (`SecretScanner` -> `RedactionEngine` -> `PathSanitizer` -> `PrivacyValidator`) correctly redacts credentials and blocks export if residual secrets or private keys are detected.
- **Test Integrity:** 53 Vitest tests across 12 test files run deterministically in ~480ms with 100% pass rate, zero skipped tests, mocked subprocesses, and synthetic credentials.
- **Integration Status:** `bugbundle collect` executes all three collectors (`system`, `runtimes`, `dependencies`) and passes the bundle through the complete `SecurityPipeline` before rendering terminal summary output.

No critical security vulnerabilities (P0) were identified. Several P1 functional gaps (remaining scope for Milestone 4) and P2/P3 documentation and CLI polish items were documented with assigned finding IDs.

---

## 2. Repository Structure & Artifact Inventory

```text
bugbundle/
├── .agents/
│   └── rules/
│       └── security.md            # Mandatory agent security rules
├── .gitignore                     # Ignores dist, node_modules, .env*, reports, logs
├── AGENTS.md                      # Contributor guide & command reference
├── ARCHITECTURE.md                # Data flow, pipeline architecture, contracts
├── CURRENT_STATUS.md              # Project status tracking
├── DECISIONS.md                   # Numbered ADR log (CONF-01..08, DEC-001..013)
├── DEVELOPMENT_PLAN.md            # Phased roadmap & milestone definitions
├── FEATURES.md                    # Phase 1 vs Post-MVP feature matrix
├── LICENSE                        # MIT License
├── package.json                   # ESM manifest, engines >=20.0.0, scripts, deps
├── package-lock.json              # Committed npm lockfile
├── PRODUCT.md                     # Vision, audience, non-goals, product principles
├── SECURITY.md                    # Threat model, denylist, security invariants
├── tsconfig.json                  # Strict TypeScript configuration
├── tsconfig.build.json            # Build-specific TS compiler config
├── vitest.config.ts               # Vitest test configuration
├── src/
│   ├── index.ts                   # Root barrel export
│   ├── cli/
│   │   ├── index.ts               # CLI executable entrypoint (shebang, error handling)
│   │   └── program.ts             # Commander CLI definition & collect integration
│   ├── collectors/
│   │   ├── dependencies.ts        # Manifest & 5 lockfiles inspector (no node_modules scan)
│   │   ├── index.ts               # Collector exports
│   │   ├── runtimes.ts            # Safe execFile detection (node, npm, pnpm, yarn, bun, python, java)
│   │   └── system.ts              # OS/arch/node/CPU collector (no PII)
│   ├── core/
│   │   ├── index.ts               # Core orchestrator exports
│   │   └── orchestrator.ts        # DiagnosticOrchestrator (isolated execution)
│   ├── errors/
│   │   ├── bugbundle-error.ts     # Typed error hierarchy & formatCliError
│   │   └── index.ts               # Error exports
│   ├── security/
│   │   ├── index.ts               # Security module barrel export
│   │   ├── path-guard.ts          # PathSecurityGuard (collection boundary exclusion)
│   │   ├── path-sanitizer.ts      # PathSanitizer (<HOME>, <PROJECT>, <USER>, <PATH>)
│   │   ├── patterns.ts            # SecretRule definitions & REDACTED_PLACEHOLDER
│   │   ├── pipeline.ts            # SecurityPipeline (fail-closed validator pipeline)
│   │   ├── privacy-validator.ts   # PrivacyValidator (fail-closed export blocker)
│   │   ├── redactor.ts            # RedactionEngine (multiline/nested object redactor)
│   │   └── scanner.ts             # SecretScanner (indices-based regex matcher)
│   └── types/
│       ├── diagnostics.ts         # Normalized diagnostic data & collector contracts
│       └── index.ts               # Type exports
├── tests/
│   ├── cli.test.ts                # CLI flags, help, version, placeholders, collect integration
│   ├── errors.test.ts             # BugbundleError hierarchy & safe error formatting
│   ├── collectors/
│   │   ├── dependencies.test.ts   # Manifest, 5 lockfiles, malformed JSON, .env exclusion
│   │   ├── runtimes.test.ts       # Primary/optional runtimes, timeouts, shim failures
│   │   └── system.test.ts         # OS/CPU metadata, missing CPU warning, PII exclusion
│   ├── core/
│   │   ├── orchestrator.test.ts   # Collector failure isolation & warning aggregation
│   │   └── path-guard.test.ts     # Pre-read exclusion, traversal, symlink escapes
│   └── security/
│       ├── path-guard.test.ts     # Collection boundary enforcement & denylist overrides
│       ├── path-sanitizer.test.ts # Unix/Windows paths, usernames, safe relative paths
│       ├── pipeline.test.ts       # End-to-end pipeline, fail-closed blocking
│       ├── privacy-validator.test.ts # Residual secret rejection, private key rejection
│       ├── redactor.test.ts       # Multiline, multiple secrets, database URI redaction
│       └── scanner.test.ts        # API keys, passwords, Bearer/JWT, AWS, false positives
└── docs/
    └── PROJECT_AUDIT.md           # This audit document
```

---

## 3. Milestone 1 Audit: Project Foundation

### Scope Verified

1. **TypeScript Project Configuration:** `tsconfig.json` and `tsconfig.build.json` enforce NodeNext modules, ES2022 target, declaration emit, and strictness flags. Compiles cleanly via `npm run build` and `npm run typecheck`.
2. **Package Configuration:** `package.json` specifies `"type": "module"`, `"bin": { "bugbundle": "./dist/cli/index.js" }`, and engines `"node": ">=20.0.0"`. Only 3 runtime dependencies are declared (`chalk`, `commander`, `zod`).
3. **CLI Entrypoint & Commands:** `src/cli/index.ts` and `src/cli/program.ts` register:
   - `--help` (`-h`): Formats usage, options, and commands.
   - `--version` (`-V`): Returns `0.1.0` parsed safely via Zod from `package.json`.
   - `collect`: Fully wired to collectors and security pipeline.
   - `inspect`: Registered; returns placeholder notice (pending Milestone 4).
   - `init`: Registered; returns placeholder notice (pending Milestone 4).
4. **Typed Error Hierarchy:** `BugbundleError` with specific subclasses (`ConfigValidationError`, `SecurityBoundaryError`, `CollectorExecutionError`, `ReviewAbortedError`, `NonInteractiveApprovalError`, `FileExistsError`, `ExportError`). `formatCliError()` produces safe terminal messages without stack traces or environment leakage.
5. **Vitest Setup:** `vitest.config.ts` targets `tests/**/*.test.ts` in Node environment with automatic mock clearing.

### Verification Evidence

- `node dist/cli/index.js --help`: Exit `0`, displays complete command tree.
- `node dist/cli/index.js --version`: Exit `0`, prints `0.1.0`.
- `tests/cli.test.ts`: 7 tests passing.
- `tests/errors.test.ts`: 3 tests passing.

---

## 4. Milestone 2 Audit: Diagnostic Collectors

### A. System Collector (`src/collectors/system.ts`)

- **Collected Fields:** `platform`, `release`, `arch`, `nodeVersion`, `cpu` (`model`, `cores`).
- **Exclusion Guarantees:** Does **not** query or emit `os.hostname()`, `os.userInfo()`, or `os.homedir()`.
- **Fault Tolerance:** If `os.cpus()` returns an empty array, reports `model: "unknown"`, `cores: 0`, status `'partial'`, and emits a clear warning without throwing.
- **Test Coverage:** `tests/collectors/system.test.ts` (3 tests) verifies normal collection, PII omission, and adapter failure isolation.

### B. Runtime Collector (`src/collectors/runtimes.ts`)

- **Detected Runtimes:**
  - Primary (required): Node.js, npm.
  - Optional: pnpm, Yarn, Bun, Python (`python3` / `python`), Java (`java -version`).
- **Subprocess Safety:**
  - Uses `execFile` with `shell: false`, explicit argument arrays, `windowsHide: true`, and bounded buffer (`256KB`).
  - Strict timeout of 3000ms enforced per invocation.
- **Normalization:** Regex extracts clean semver strings for Node, npm, pnpm, Yarn, Bun, and Python, and extracts quoted version strings for Java (`openjdk version "21.0.10"` -> `21.0.10`).
- **Resilience:** If an optional runtime is absent, or its shim fails (e.g., Corepack pnpm cache miss), collector records a warning while overall status remains `'ok'`. If a primary runtime is missing or a timeout occurs, collector records `'partial'`. Collector never throws.
- **Test Coverage:** `tests/collectors/runtimes.test.ts` (5 tests) verifies all 7 runtimes, timeout handling, missing tools, and shim failures.

### C. Dependency Collector (`src/collectors/dependencies.ts`)

- **Inspected Files:** `package.json` plus 5 lockfiles (`package-lock.json`, `pnpm-lock.yaml`, `yarn.lock`, `bun.lock`, `bun.lockb`).
- **Lockfile Support:**
  - `package-lock.json`: Validates lockfileVersion `1`, `2`, or `3`.
  - `pnpm-lock.yaml`: Extracts `lockfileVersion` header.
  - `yarn.lock`: Identifies v1 and Yarn Berry formats.
  - `bun.lock`: Strips JSONC trailing commas and parses lockfileVersion.
  - `bun.lockb`: Detects binary file presence safely; explicitly does **not** execute `bun` or parse binary content.
- **Security Invariants:**
  - **Zero `node_modules` Scanning:** Filesystem queries are strictly restricted to root-level project files via `PathSecurityGuard`.
  - **Zero Script Execution:** Package lifecycle scripts (`preinstall`, `postinstall`, etc.) and package managers are never executed.
  - **Prototype Pollution Defense:** Strips `__proto__`, `constructor`, and `prototype` keys during dependency map extraction.
- **Test Coverage:** `tests/collectors/dependencies.test.ts` (8 tests) verifies manifests, multi-lockfile workspaces, malformed JSON, missing files, and `.env`/`node_modules` isolation.

---

## 5. Milestone 3 Audit: Security Engine

### A. Collection Boundary Guard (`src/security/path-guard.ts`)

- **Pre-Read Enforcement:** Access is evaluated before any file handle is opened.
- **Approved Scope:** Only explicitly allowed files (`DEFAULT_APPROVED_COLLECTION_FILES`: `package.json`, `package-lock.json`, `pnpm-lock.yaml`, `yarn.lock`, `bun.lock`, `bun.lockb`, `bugbundle.config.json`) can be checked or read.
- **Unconditional Denylist:** Rejects `.env*`, SSH keys (`.ssh/**`, `id_rsa*`, etc.), credentials (`.npmrc`, `.aws/**`, `.git-credentials`, etc.), shell histories (`.bash_history`, `.zsh_history`, etc.), browser profiles (`Chrome/**`, `Firefox/**`, `Cookies`, etc.), and `node_modules/**`.
- **Traversal & Symlink Defense:** Resolves canonical paths (`realpath`), verifies workspace root containment, and rejects escaping symlinks.

### B. Secret Scanner (`src/security/scanner.ts`, `patterns.ts`)

- **Rules Evaluated:** Provider API keys (`sk-proj-`, `sk-ant-`, `xox*`, `AIza*`), Bearer authorization tokens, JWTs, GitHub/npm tokens, password/db_password assignments, database URI credentials (`postgres://user:pass@host`), AWS access/secret keys, and multiline private key blocks.
- **Precision:** Uses RegExp `d` flag (`indices`) to isolate exact secret substrings. Overlapping matches are deduplicated by severity and span.
- **Privacy:** `SecretMatch` records only rule ID, name, category, severity, offsets, and line numbers. **Raw secret strings are never preserved in scan metadata.**

### C. Redaction Engine (`src/security/redactor.ts`)

- Replaces secret spans with `[REDACTED]`.
- Handles single-line, multiline, and multiple secrets within a single input without exposing partial characters.
- Recursively processes structured objects and arrays while rejecting circular references and prototype pollution.
- Returns structured `RedactionEntry` counts without original values.

### D. Path Sanitizer (`src/security/path-sanitizer.ts`)

- Replaces Unix home directories (`/Users/...`, `/home/...`, `/root`) with `<HOME>`.
- Replaces Windows home directories (`C:\Users\...`, `C:/Users/...`) with `<HOME>`.
- Replaces project root paths with `<PROJECT>`, preserving safe relative project references (e.g., `<PROJECT>/src/index.ts`).
- Replaces sensitive system directories (`/etc`, `/var`, `C:\Windows`, etc.) with `<PATH>`.
- Sanitizes explicit username assignments (`USER=<USER>`).

### E. Privacy Validator & Pipeline (`src/security/privacy-validator.ts`, `pipeline.ts`)

- **Fail-Closed Gate:** Runs `SecretScanner -> RedactionEngine -> PathSanitizer -> PrivacyValidator`.
- If residual secrets, private key headers, unsanitized home directory paths, or circular/malformed objects remain, throws `SecurityBoundaryError` and blocks export.
- Error messages identify rule IDs without echoing sensitive data.

---

## 6. Testing & Quality Audit

### Vitest Execution Results

Command executed: `npm test` (`vitest run`)

- **Test Files:** 12 passed (12 total)
- **Tests:** 53 passed (53 total)
- **Duration:** 488 ms
- **Skipped Tests:** 0

| Test File                                  | Tests | Coverage Scope                                                       | Status |
| :----------------------------------------- | :---: | :------------------------------------------------------------------- | :----: |
| `tests/cli.test.ts`                        |   7   | CLI flags, version, help, placeholders, collect integration          |  PASS  |
| `tests/errors.test.ts`                     |   3   | Error hierarchy, exit codes, safe formatting                         |  PASS  |
| `tests/core/orchestrator.test.ts`          |   1   | Collector error isolation and warning aggregation                    |  PASS  |
| `tests/collectors/system.test.ts`          |   3   | System info collection, CPU warning, PII exclusion                   |  PASS  |
| `tests/collectors/runtimes.test.ts`        |   5   | All 7 runtimes, missing tools, timeouts, shim errors                 |  PASS  |
| `tests/collectors/dependencies.test.ts`    |   8   | Manifests, 5 lockfiles, malformed JSON, .env isolation               |  PASS  |
| `tests/security/path-guard.test.ts`        |   4   | Pre-read exclusion, traversal, symlink escapes, allowlist overrides  |  PASS  |
| `tests/security/scanner.test.ts`           |   6   | API keys, Bearer/JWT, passwords, AWS, private keys, false positives  |  PASS  |
| `tests/security/redactor.test.ts`          |   4   | Database URIs, multiple multiline secrets, nested objects            |  PASS  |
| `tests/security/path-sanitizer.test.ts`    |   4   | Unix/Windows home paths, project relative paths, usernames           |  PASS  |
| `tests/security/privacy-validator.test.ts` |   5   | Clean input, private key rejection, residual secrets, circular input |  PASS  |
| `tests/security/pipeline.test.ts`          |   3   | End-to-end pipeline, fail-closed blocking, private key blocking      |  PASS  |

### TypeScript Compilation & Build

- `npm run typecheck` (`tsc --noEmit`): **Zero errors.**
- `npm run build` (`tsc -p tsconfig.build.json`): **Zero errors; emits `dist/` cleanly.**

### Linting Check

- Command executed: `npm run lint`
- **Result:** Script absent in `package.json`. In accordance with `DEC-011`, linting tooling is currently unconfigured.

---

## 7. Integration Audit

Current execution flow in `src/cli/program.ts` (`bugbundle collect`):

```text
CLI (Commander: collect)
  └──> Target CWD resolution (defaults to process.cwd())
        └──> DiagnosticOrchestrator.collect()
              ├──> SystemCollector (safe OS/CPU metadata)
              ├──> RuntimesCollector (Node, npm, pnpm, Yarn, Bun, Python, Java)
              └──> DependenciesCollector (package.json + lockfiles via PathSecurityGuard)
                    └──> Raw DiagnosticBundle
                          └──> SecurityPipeline.processValue(rawBundle)
                                ├──> RedactionEngine (replaces secrets with [REDACTED])
                                ├──> PathSanitizer (replaces home/project/system paths)
                                └──> PrivacyValidator (assertValid: fail-closed)
                                      └──> Sanitized DiagnosticBundle
                                            └──> renderCollectSummary() to stdout
```

### Verified Integration Capabilities

- Invoking `node dist/cli/index.js collect` executes the complete pipeline and outputs:
  ```text
  ✓ System information
  ✓ Runtime information
  ✓ Dependency information

  Diagnostic Summary:
    System: darwin 24.6.0 (arm64), Node v22.17.1, CPU: Apple M4 (10 cores)
    Runtimes: Node.js 22.17.1, npm 11.5.2, Yarn 4.18.0, Bun 1.2.21, Python 3.9.6, Java 21.0.10
    Dependencies: bugbundle@0.1.0, packageManager: npm, deps: 3, devDeps: 3, lockfiles: package-lock.json (v3)
  ```
- No files are written to disk during `collect` (guaranteeing zero accidental unreviewed exports).
- If any collector fails or throws, `DiagnosticOrchestrator` isolates the error to that collector's result, allowing remaining collectors to complete.
- If `PrivacyValidator` detects a violation in the collected bundle, export is blocked with `[SECURITY_BOUNDARY_ERROR]`.

---

## 8. Detailed Audit Findings

| Finding ID  | Severity | Affected File                 | Description                                                                                                                                                                                                            | Recommended Action                                                                                                |
| :---------- | :------: | :---------------------------- | :--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :---------------------------------------------------------------------------------------------------------------- |
| **AUD-001** |  **P1**  | `src/cli/program.ts`          | **Missing CLI Options on `collect` Command:** `bugbundle collect` does not currently accept `--output <path>`, `--include <collectors>`, or `--exclude <collectors>` flags declared in `ARCHITECTURE.md`.              | Implement Commander options in `collect` command during Milestone 4.                                              |
| **AUD-002** |  **P1**  | `src/cli/program.ts`          | **Unimplemented `inspect` Command:** `bugbundle inspect` currently outputs a placeholder string instead of executing the collector pipeline and displaying full sanitized inspection data.                             | Connect `inspect` to `DiagnosticOrchestrator` and `SecurityPipeline` in Milestone 4.                              |
| **AUD-003** |  **P1**  | `src/cli/program.ts`          | **Unimplemented `init` Command:** `bugbundle init` currently outputs a placeholder string instead of scaffolding `bugbundle.config.json`.                                                                              | Implement safe, non-overwriting `bugbundle.config.json` generator in Milestone 4.                                 |
| **AUD-004** |  **P1**  | `src/config/`                 | **Missing Configuration Module (`src/config/`):** Zod schema validation for CLI options and `bugbundle.config.json` is not yet implemented as a dedicated module.                                                      | Create `src/config/index.ts` with Zod schemas and config file loader in Milestone 4.                              |
| **AUD-005** |  **P2**  | `src/cli/program.ts:150`      | **Outdated Milestone Notice in CLI Output:** Line 150 terminal message reads `"not implemented yet in Milestone 2"`, which is outdated following Milestone 3 completion.                                               | Update notice text to reflect Milestone 3 completion and Milestone 4 export readiness.                            |
| **AUD-006** |  **P2**  | `DEVELOPMENT_PLAN.md:32-76`   | **Roadmap Milestone Numbering Discrepancy:** `DEVELOPMENT_PLAN.md` still lists an older milestone sequence (Milestone 3 as Markdown Builder) that conflicts with executed milestones (Milestone 3 as Security Engine). | Synchronize `DEVELOPMENT_PLAN.md` milestone titles and numbers with actual project phases.                        |
| **AUD-007** |  **P2**  | `package.json`                | **Unconfigured Linter/Formatter (`DEC-011`):** No `lint` script exists in `package.json`. ESLint/Prettier or Biome has not been set up.                                                                                | Resolve `DEC-011` by configuring Biome or ESLint in Phase 0/tooling setup.                                        |
| **AUD-008** |  **P3**  | `src/security/pipeline.ts:85` | **Empty `scan.matches` in `processValue()` Result:** `SecurityPipeline.processValue()` returns `scan.matches: []` because match offsets are text-specific, though `redactionEntries` contains accurate counts.         | Document that `processValue()` provides structured redaction entries rather than character-offset match arrays.   |
| **AUD-009** |  **P3**  | `DECISIONS.md`                | **Unresolved Open Decisions:** `DEC-001`, `DEC-002`, `DEC-006` (sub-details), `DEC-010`, `DEC-011`, and `DEC-012` remain `OPEN`.                                                                                       | Confirm provisional choices (`DEC-001`, `DEC-002`) and finalize `DEC-006` prompt syntax and `DEC-010` exit codes. |

---

## 9. Feature Inventory & Implementation Status

| Feature / Requirement                       | Target Milestone |     Current Status     | Notes                                         |
| :------------------------------------------ | :--------------: | :--------------------: | :-------------------------------------------- |
| TypeScript strict build & config            |        M1        |      **COMPLETE**      | Strict compiler settings, clean build         |
| Commander CLI framework setup               |        M1        |      **COMPLETE**      | Program structure, help, version              |
| Error hierarchy & safe formatting           |        M1        |      **COMPLETE**      | `BugbundleError` hierarchy, `formatCliError`  |
| System Collector                            |        M2        |      **COMPLETE**      | OS, release, arch, Node version, safe CPU     |
| Runtime Collector                           |        M2        |      **COMPLETE**      | Node, npm, pnpm, Yarn, Bun, Python, Java      |
| Dependency Collector                        |        M2        |      **COMPLETE**      | `package.json` + 5 lockfiles, count tracking  |
| Collection Boundary Pre-Read Guard          |        M3        |      **COMPLETE**      | `PathSecurityGuard` denylist + allowlist      |
| Secret Scanner                              |        M3        |      **COMPLETE**      | Multi-category regex patterns with indices    |
| Redaction Engine                            |        M3        |      **COMPLETE**      | `[REDACTED]` replacement, nested object walk  |
| Path Sanitizer                              |        M3        |      **COMPLETE**      | `<HOME>`, `<PROJECT>`, `<USER>`, `<PATH>`     |
| Privacy Validator                           |        M3        |      **COMPLETE**      | Fail-closed validation before export          |
| Collector & Security Integration            |      M2/M3       |      **COMPLETE**      | Integrated into `bugbundle collect`           |
| Read-only `bugbundle inspect`               |        M4        | **PARTIALLY COMPLETE** | Placeholder registered in CLI; pipeline ready |
| Config Scaffolding `bugbundle init`         |        M4        | **PARTIALLY COMPLETE** | Placeholder registered in CLI                 |
| Zod Config Loader (`src/config/`)           |        M4        |  **NOT IMPLEMENTED**   | Deferred to Milestone 4                       |
| Markdown Report Builder (`src/report/`)     |        M4        |  **NOT IMPLEMENTED**   | Deferred to Milestone 4                       |
| Mandatory User Review Gate (`src/review/`)  |        M4        |  **NOT IMPLEMENTED**   | Deferred to Milestone 4                       |
| Safe Non-Overwriting Export (`src/export/`) |        M4        |  **NOT IMPLEMENTED**   | Deferred to Milestone 4                       |
| Non-Interactive Mode Approval Enforcement   |        M4        |  **NOT IMPLEMENTED**   | Deferred to Milestone 4                       |

---

## 10. Readiness Assessment for Milestone 4

### Decision: **READY FOR MILESTONE 4**

#### Rationale:

1. **Solid Diagnostic Base:** Collectors for system info, developer runtimes, and dependencies are implemented, tested, and normalized.
2. **Robust Security Foundation:** The security engine correctly isolates sensitive files before reading, redacts detected credentials in memory, sanitizes paths across operating systems, and fails closed if residual secrets are detected.
3. **Clean Codebase:** Zero circular dependencies, zero `any` types, zero flaky/skipped tests, and strict compiler pass.
4. **Clear Milestone 4 Boundaries:** The remaining work consists of Markdown rendering (`src/report/`), Zod configuration loading (`src/config/`), the interactive review gate prompt (`src/review/`), and the local non-overwriting file exporter (`src/export/`).

---

## 11. Recommended Next Development Steps

1. **Synchronize Documentation (P2):** Update `DEVELOPMENT_PLAN.md` to reflect the executed milestone numbering (Milestone 1: Foundation, Milestone 2: Collectors, Milestone 3: Security Engine, Milestone 4: Report Builder, Review Gate & Safe Exporter).
2. **Implement Milestone 4 in Logical Increments:**
   - **Step 4.1: Configuration Module (`src/config/`):** Zod schemas for runtime options, `bugbundle.config.json` loading, and implementing `bugbundle init`.
   - **Step 4.2: Markdown Report Builder (`src/report/`):** Format `DiagnosticBundle` into GitHub-Flavored Markdown (`bugbundle-report.md`) with sanitized tables and sections.
   - **Step 4.3: Implement `bugbundle inspect`:** Display full sanitized Markdown or structured preview in terminal without writing files.
   - **Step 4.4: User Review Gate & Exporter (`src/review/`, `src/export/`):** Interactive confirmation prompt, non-interactive refusal without explicit approval, and safe writing to `./bugbundle-report.md` with existing-file collision warnings.
3. **Configure Linter/Formatter (`DEC-011`):** Set up Biome or ESLint to enforce automated formatting and code style across the repository.
