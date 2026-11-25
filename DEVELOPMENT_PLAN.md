# Development Plan — `bugbundle`

This plan sequences delivery from **Phase 0 (Decision Resolution & Repository Scaffolding)** through **Phase 1 (MVP)** and **Phase 2+ (Post-MVP Extensions)**. No application code or dependencies are installed until remaining Phase 0 tooling decisions are confirmed.

---

## Phase 0: Tooling Resolution & Project Scaffolding

**Goal:** Lock remaining repository/tooling choices and establish a clean, strict TypeScript workspace. _(Product decisions `DEC-004`–`DEC-009` and `DEC-013` are finalized in [DECISIONS.md](./DECISIONS.md).)_

1. **Resolve Remaining Tooling Decisions** in [DECISIONS.md](./DECISIONS.md):
   - Minimum Node.js version ([DEC-001](./DECISIONS.md#dec-001))
   - Module format & build tool ([DEC-002](./DECISIONS.md#dec-002))
   - Repository package manager ([DEC-003](./DECISIONS.md#dec-003))
   - Linting & formatting setup ([DEC-011](./DECISIONS.md#dec-011))
   - npm package name availability for `bugbundle` ([DEC-012](./DECISIONS.md#dec-012))
2. **Initialize Repository Scaffold:**
   - `LICENSE` (MIT)
   - `package.json` (`name: "bugbundle"` [subject to npm availability check], `bin`, `engines`, `scripts`, core dependencies: `commander`, `zod`, `chalk`; devDependencies: `typescript`, `vitest`, `@types/node`, lint/format tools)
   - `tsconfig.json` (strict TypeScript settings per [TECH_STACK.md](./TECH_STACK.md#2-typescript-configuration-principles))
   - `vitest.config.ts`
   - `.gitignore` & initial CI workflow (if confirmed in [DEC-011](./DECISIONS.md#dec-011))

**Exit Criteria:** Typecheck, empty/smoke test run, and lint pass cleanly.

---

## Phase 1: MVP Implementation

Phase 1 remains strictly focused on core CLI (`collect`, `inspect`, `init`), modular collectors, and Markdown report generation as defined in [FEATURES.md](./FEATURES.md#1-phase-1-mvp-features).

### Milestone 1: Project Foundation _(Complete)_

- **Scope:**
  - `package.json`, strict `tsconfig.json` / `tsconfig.build.json`, `vitest.config.ts`, `LICENSE` (MIT), `.gitignore`
  - `src/types/` — Shared `Collector`, `CollectorResult`, `DiagnosticContext`, `DiagnosticBundle`, `ValidatedConfig`, `SecurityGuard`
  - `src/errors/` — `BugbundleError` hierarchy (`ConfigValidationError`, `SecurityBoundaryError`, `CollectorExecutionError`, `ReviewAbortedError`, `NonInteractiveApprovalError`, `FileExistsError`, `ExportError`) and `formatCliError`
  - `src/cli/` — Commander.js entry point (`--help`, `--version`, `collect`, `inspect`, `init`)
- **Tests (Vitest):**
  - Unit tests for `BugbundleError` hierarchy and safe CLI formatting
  - CLI tests for `--help`, `--version`, bare invocation, and unknown commands

### Milestone 2: Diagnostic Collectors _(Complete)_

- **Scope:**
  - `src/core/orchestrator.ts` — `DiagnosticOrchestrator` (isolated execution, error aggregation)
  - `src/collectors/system.ts` — OS platform, OS release, architecture, Node.js version, safe CPU metadata; excludes hostname, username, home directory, and unnecessary paths ([DEC-009](./DECISIONS.md#dec-009))
  - `src/collectors/runtimes.ts` — Safe `execFile` (`shell: false`, timeouts) detection for Node.js, npm, pnpm, Yarn, Bun, Python, and Java; emits warnings when optional tools are missing instead of crashing ([DEC-013](./DECISIONS.md#dec-013))
  - `src/collectors/dependencies.ts` — Safe `package.json` and supported lockfile metadata inspection (`package-lock.json`, `pnpm-lock.yaml`, `yarn.lock`, `bun.lock`, `bun.lockb`) without executing scripts or recursively scanning `node_modules` ([DEC-008](./DECISIONS.md#dec-008))
- **Tests (Vitest):**
  - Unit tests per collector using mocked FS/OS/process adapters
  - Orchestrator isolation & graceful-degradation tests
  - Negative tests verifying `node_modules` is never recursively scanned and `.env` canary secrets never enter collector output

### Milestone 3: Security Engine _(Complete)_

- **Scope:**
  - `src/security/path-guard.ts` — Collection-boundary `PathSecurityGuard` excluding `.env*`, SSH keys, credentials, shell histories, browser profiles, `node_modules`, symlink escapes, and non-allowlisted files before reading
  - `src/security/patterns.ts` & `src/security/scanner.ts` — `SecretScanner` (API keys, Bearer tokens, JWTs, passwords, database URIs, AWS keys, multiline private keys)
  - `src/security/redactor.ts` — `RedactionEngine` (`[REDACTED]` replacement, multiline & nested object redaction without logging raw secrets)
  - `src/security/path-sanitizer.ts` — `PathSanitizer` (Unix/Windows `<HOME>`, `<PROJECT>`, `<USER>`, `<PATH>` sanitization)
  - `src/security/privacy-validator.ts` & `src/security/pipeline.ts` — Fail-closed `PrivacyValidator` and `SecurityPipeline` integrated into `bugbundle collect`
- **Tests (Vitest):**
  - Comprehensive security unit & pipeline tests covering synthetic secrets, multiline blocks, path sanitization, false positives, and fail-closed rejection

### Milestone 4: Configuration, Markdown Report Builder, Review Gate & Safe Exporter _(Complete)_

- **Step 4.1: Configuration Module (`src/config/`) — _Complete_**
  - Zod schema (`schema.ts`), safe config loader (`loader.ts`), `bugbundle init` (`init.ts`), and CLI integration with Vitest coverage
- **Step 4.2: Markdown Report Builder (`src/report/`) — _Complete_**
  - Pure, deterministic GitHub-Flavored Markdown generator (`buildMarkdownReport`, `createReportInputFromPipeline`) rendering Header, System, Runtime, Dependency, Warnings, and Privacy/Security Summary sections with Markdown escaping and `SecurityPipeline` validation checks
- **Step 4.3: `bugbundle inspect` Command — _Complete_**
  - Wired `bugbundle inspect` to `loadConfig` + `DiagnosticOrchestrator` + `SecurityPipeline` + `buildMarkdownReport` with zero-file-write guarantee and safe error handling
- **Step 4.4: Mandatory User Review Gate & Safe Local Exporter (`src/review/`, `src/export/`) — _Complete_**
  - Implemented `runReviewGate` (`node:readline/promises`, default-No `(y/N)` confirmation, `Ctrl+C`/EOF safety, non-interactive refusal without `--yes`) and `exportReport` (exclusive `wx` file creation, workspace containment, symlink-escape & restricted-filename checks, strict non-overwrite protection) wired into `bugbundle collect`
- **Tests (Vitest):**
  - Snapshot and structural Markdown tests across `ok`, `partial`, `skipped`, and `error` bundles
  - Review gate abort test, non-interactive refusal test, existing-file non-overwrite test, and approved export test

### Milestone 5: CLI Polish, Exit Codes & Release Readiness _(Complete)_

- **Step 5.1: CLI Flags & Collector Selection — _Complete_**
  - Implemented `--output <path>`, `--include <collectors>`, and `--exclude <collectors>` on `bugbundle collect` (`src/config/selection.ts`, `src/cli/program.ts`) with strict narrowing precedence (`DEC-014`), early `--output` validation, and Vitest coverage
- **Step 5.2A: Standardized CLI Exit Codes — _Complete_**
  - Implemented centralized `EXIT_CODES` and `resolveExitCode` (`src/errors/exit-codes.ts`), `UserInterruptedError` (`130`), `SIGINT` handling, and spawned CLI process exit-code tests (`DEC-010`)
- **Step 5.2B: Developer Tooling, CI & npm Package Verification — _Complete_**
  - Configured ESLint flat config (`eslint.config.mjs`), Prettier (`.prettierrc.json`, `.prettierignore`), SHA-pinned GitHub Actions CI (`.github/workflows/ci.yml` across Node 22/24/26), finalized `DEC-001` (`>=22.0.0`) & `DEC-011`, and verified `bugbundle` npm name availability (`DEC-012`: occupied at `0.3.0`)
- **Step 5.3: Final Release Documentation (`README.md`) & npm Package Identity — _Complete_**
  - Verified `bugbundle-cli` preliminary availability (`E404` on `https://registry.npmjs.org/` on `2026-11-25`), updated `package.json` (`"name": "bugbundle-cli"`, `"bin": { "bugbundle": ... }`, `"files": ["dist", "LICENSE", "README.md"]`), synchronized `package-lock.json`, finalized `DEC-012`, and created `README.md` (publication has not occurred)
- **Tests (Vitest):**
  - End-to-end CLI integration tests running against temporary fixture workspaces for `collect`, `inspect`, and `init`
  - Verification of `--help`, `--version`, invalid options, `init` non-overwrite protection, `inspect` zero-file-write guarantee, and security invariants

---

## Phase 2+: Post-MVP Roadmap (Deferred)

Once Phase 1 is shipped and validated with maintainers, future iterations may add (see [FEATURES.md](./FEATURES.md#2-future--post-mvp-features-explicitly-out-of-phase-1-scope)):

- Maintainer diagnostic schema/profiles (opt-in, user-reviewed)
- External collector plugin API
- Additional output formatters (JSON, SARIF, HTML)
- Multi-ecosystem collectors (Python, Rust, Go, Docker)
- Custom user-supplied redaction profiles & bundle diffing
- Optional explicit user-triggered clipboard copy helper

---

## Cross-Cutting Testing & Quality Strategy

- **Runner:** Vitest (`vitest run` in CI, `vitest` in local watch mode)
- **Mocking Policy:** Collectors must depend on injectable/thin adapters (`fs`, `os`, `process`) so tests run deterministically on any OS without mutating the developer's real environment.
- **Security Regression Suite:** Every PR must keep the `.env` canary test, path traversal tests, `node_modules` non-recursion test, existing-file non-overwrite test, non-interactive refusal test, and review-abort tests green.
- **Documentation Sync:** Any change to CLI commands, architecture, or resolved decisions must update [ARCHITECTURE.md](./ARCHITECTURE.md), [DECISIONS.md](./DECISIONS.md), and [CURRENT_STATUS.md](./CURRENT_STATUS.md) in the same PR.
- **Pre-Release Hardening:** Resolved audit findings `REL-001` through `REL-005` (`zod` `^4.6.7`, `vitest` `^5.1.1`, cross-platform CI matrix for Ubuntu/Windows/macOS, unified config/CLI output path validation, `--include`/`--exclude` on `inspect`, and [CONTRIBUTING.md](./CONTRIBUTING.md)).
