# Architectural & Product Decisions — `bugbundle`

This log tracks **confirmed product constraints** (`CONF-*`) and **numbered decision records** (`DEC-001`–`DEC-013`) with explicit status and rationale.

---

## 1. Confirmed Baseline Constraints

| ID          | Decision                                                                                                                                                                                                                                                                                                                                    | Source          |
| :---------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | :-------------- |
| **CONF-01** | **Product identity & license:** Open-source, local-first developer diagnostics CLI (`bugbundle`), MIT license, distributed via npm and GitHub.                                                                                                                                                                                              | Founding Spec   |
| **CONF-02** | **Audience & interface:** Initial interface is CLI; initial audience is Node.js developers & open-source maintainers.                                                                                                                                                                                                                       | Founding Spec   |
| **CONF-03** | **Language & runtime:** Strict TypeScript running on Node.js.                                                                                                                                                                                                                                                                               | Founding Spec   |
| **CONF-04** | **Core libraries:** Commander (CLI), Zod (config validation), Chalk (terminal styling), Vitest (testing).                                                                                                                                                                                                                                   | Founding Spec   |
| **CONF-05** | **Architecture style:** Simple, extensible pipeline using modular collectors and Markdown report generation, keeping Phase 1 focused on core CLI, collectors, and Markdown reports.                                                                                                                                                         | Founding Spec   |
| **CONF-06** | **Zero infrastructure:** Keep all processing local. No backend, no database, no authentication, no mandatory API keys, no telemetry, and no automatic uploads.                                                                                                                                                                              | Founding Spec   |
| **CONF-07** | **Security & consent:** Never silently collect arbitrary files, never read `.env` contents or credentials, never upload data, and require user review before exporting collected information.                                                                                                                                               | Founding Spec   |
| **CONF-08** | **Official rename from `SupportPack` to `bugbundle` (2026-11-25):** The project has been officially renamed from `SupportPack` to `bugbundle`. Target npm package name is `bugbundle` (subject to availability verification in [DEC-012](#dec-012)). All existing product requirements, features, and security principles remain unchanged. | Rename Decision |

---

## 2. Numbered Decision Records

> **Rule for Contributors & Agents:** Do not silently pick an `OPEN` option below when implementing code. Propose a resolution for maintainer approval and update this file, or block on the unresolved item.

### DEC-001: Minimum Supported Node.js Version

- **Status:** `DECIDED` (2026-11-25)
- **Decision:** Set `"engines": { "node": ">=22.0.0" }` and test against active LTS release lines **Node.js 22, 24, and 26** in CI.
- **Rationale:** Node.js 20 reached end-of-life in March 2026. All runtime APIs used by `bugbundle` (`node:readline/promises` with `AbortController`, `node:fs/promises`, `RegExp` `d` flag) and all dependencies (`chalk` v5, `commander` v13, `zod` v3, `vitest` v3, `typescript` v5.8) are natively supported on Node.js 22+.

### DEC-002: Module Format & Build Pipeline

- **Status:** `OPEN` (Provisional scaffold choice: Pure ESM with `tsc`)
- **Question:** Should `bugbundle` ship as Pure ESM, CJS, or Dual ESM/CJS, and build with `tsc` or a bundler (`tsup`/`esbuild`)?
- **Rationale / Why it matters:** `chalk` v5+ is ESM-only while `chalk` v4 is CJS. Pure ESM with `tsc` avoids bundler complexity and aligns with modern Node.js CLIs, whereas bundling with `tsup` can output single-file ESM/CJS artifacts. Milestone 1 uses Pure ESM (`"type": "module"`) compiled with `tsc` (`NodeNext`) provisionally pending final confirmation.
- **Options:**
  1. Pure ESM (`"type": "module"`) compiled with `tsc` (allows `chalk` v5+, zero bundler dependency)
  2. Pure ESM bundled with `tsup`
  3. Dual ESM/CJS build (note: requires `chalk` v4 or bundling `chalk` v5)

### DEC-003: Repository Package Manager

- **Status:** `DECIDED` (2026-11-25)
- **Decision:** Standardize on `npm` (`package.json` npm scripts and `package-lock.json`).
- **Rationale:** `npm` ships with Node.js with zero additional tooling setup and was explicitly selected for Milestone 1 foundation setup.

### DEC-004: Phase 1 CLI Command Surface

- **Status:** `DECIDED` (2026-11-25)
- **Decision:** Phase 1 exposes three explicit CLI commands under `bugbundle`:
  - `bugbundle collect` — Collect diagnostics, show preview/summary, require explicit user review/confirmation, and export the Markdown report.
  - `bugbundle inspect` — Collect diagnostics and display a sanitized local inspection preview without writing a report file.
  - `bugbundle init` — Initialize a local `bugbundle.config.json` configuration file safely (without silently overwriting an existing config).
  - Bare `bugbundle` displays CLI help/usage (`--help`) rather than running collection unexpectedly.
- **Rationale:** Explicit subcommands make user intent unambiguous: `collect` handles the full reviewed export workflow, `inspect` gives users and CI a safe zero-write preview path, and `init` provides predictable project configuration without bloating Phase 1 beyond core CLI, collectors, and Markdown reporting.

### DEC-005: Default Report Filename, Output Directory & Overwrite Policy

- **Status:** `DECIDED` (2026-11-25)
- **Decision:**
  - **Default report filename:** `bugbundle-report.md`
  - **Default output directory:** Current working directory (`process.cwd()`), i.e., `./bugbundle-report.md` (overridable via `--output <path>`).
  - **Overwrite policy:** If the target report file already exists, emit a clear warning and **never silently overwrite**.
- **Rationale:** Writing `bugbundle-report.md` in the current working directory gives developers a predictable, easy-to-find artifact to attach or paste into bug reports, while refusing silent overwrites prevents accidental loss of prior reports or existing repository files.

### DEC-006: Mandatory User Review Gate & Non-Interactive Mode Policy

- **Status:** `DECIDED` (Updated 2026-11-25)
- **Decision:**
  - **Interactive review (`src/review/review-gate.ts`):** Uses Node.js built-in `node:readline/promises` to display the sanitized Markdown report preview and prompt `Save this diagnostic report to ./<filename>? (y/N): ` with **No** as the default. Only explicit `y`/`yes` approves; `Ctrl+C`, closed stdin, empty input, or invalid input cancels without exporting.
  - **Non-interactive mode:** When `stdin` is non-interactive, `bugbundle collect` **refuses to export** (`NonInteractiveApprovalError`) unless `--yes` is explicitly supplied (`bugbundle collect --yes`). `--yes` never bypasses `SecurityPipeline`, `PrivacyValidator`, or `ReportExporter` path/non-overwrite safeguards.
- **Rationale:** Built-in `node:readline/promises` avoids extra prompt dependencies while enforcing default-No human consent, and `--yes` provides an explicit, auditable CI opt-in without weakening any privacy or non-overwrite boundary.

### DEC-007: Configuration File Support & Format (`bugbundle.config.json`)

- **Status:** `DECIDED` (Updated 2026-11-25)
- **Decision:** Phase 1 supports optional project configuration via `bugbundle.config.json` (scaffolded by `bugbundle init`) validated strictly with Zod (`src/config/schema.ts`). Supported fields are `projectName`, `collectors` (`enabled`, `excluded`), `report` (`filename`, `includeWarnings`), and safe `options` (`includeDevDependencies`, `processTimeoutMs`). Unknown fields, security bypass flags, path traversal in `report.filename`, and `.env` targets are unconditionally rejected.
- **Rationale:** Pairing `bugbundle init` with a minimal, `.strict()` Zod-validated `bugbundle.config.json` gives maintainers a transparent, versionable configuration file while preventing configuration-driven security bypasses.

### DEC-008: Dependency Inspection Scope

- **Status:** `DECIDED` (2026-11-25)
- **Decision:** The Dependency Inspection collector inspects `package.json` and metadata from supported lockfiles (`package-lock.json`, `pnpm-lock.yaml`, `yarn.lock`, `bun.lock`, `bun.lockb` — detecting `bun.lockb` safely without executing `bun` or parsing binary bytes). It must **never** recursively scan `node_modules` or execute package managers/scripts.
- **Rationale:** Reading `package.json` plus bounded lockfile metadata provides maintainers with declared version ranges, dependency counts, and lockfile-level context while avoiding slow, brittle, or unsafe recursive traversal of `node_modules` trees or arbitrary script execution.

### DEC-009: System & Runtime Information Granularity and Default Exclusions

- **Status:** `DECIDED` (2026-11-25)
- **Decision:**
  - **Collect by default:** OS platform, OS release, CPU architecture, and relevant runtime versions (e.g., Node.js version and detected package manager version).
  - **Exclude by default:** Hostname, OS username, home directory (`os.homedir()`), and unnecessary absolute filesystem paths (with path sanitization applied to any unavoidable path strings such as error diagnostics).
- **Rationale:** OS platform/release/arch and runtime versions are high-signal for bug reproduction, whereas hostnames, usernames, home directories, and absolute paths leak personal or organizational details with minimal diagnostic value.

### DEC-010: CLI Exit Code Taxonomy

- **Status:** `DECIDED` (2026-11-25)
- **Decision:** Standardized CLI exit codes defined in `src/errors/exit-codes.ts` (`EXIT_CODES` and `resolveExitCode`):
  - `0` (`SUCCESS`): Successful execution (`collect` exported, `inspect` previewed, `init` created, `--help`/`--version`)
  - `1` (`INTERNAL_ERROR`): Unexpected internal or runtime error
  - `2` (`INVALID_INPUT`): Invalid CLI arguments/flags (`CommanderError`) or configuration (`ConfigValidationError`)
  - `3` (`COLLECTION_FAILURE`): Diagnostic collection failure (`CollectorExecutionError`, e.g., all executed collectors failed)
  - `4` (`SECURITY_FAILURE`): Security boundary or privacy validation failure (`SecurityBoundaryError`)
  - `5` (`REVIEW_REQUIRED`): Review declined (`ReviewAbortedError`) or non-interactive execution without `--yes` (`NonInteractiveApprovalError`)
  - `6` (`EXPORT_FAILURE`): Export/init file collision (`FileExistsError`) or filesystem write failure (`ExportError`)
  - `130` (`USER_INTERRUPTED`): User interruption (`SIGINT` / `Ctrl+C` / `UserInterruptedError` / `AbortError`)
- **Rationale:** Centralizing exit codes in a single typed mapping eliminates scattered numeric literals, distinguishes user-declined/non-interactive review (`5`) and file collisions (`6`) from internal crashes (`1`), and aligns `SIGINT` (`130`) with standard Unix CLI conventions. _(Note: `bugbundle init` existing-config collision intentionally maps to `6` via `FileExistsError` for consistency with `collect` export collisions.)_

### DEC-011: Linting, Formatting, and CI Workflow Tooling

- **Status:** `DECIDED` (2026-11-25)
- **Decision:**
  - **Linting:** ESLint v9+ flat configuration (`eslint.config.mjs`) with `@eslint/js`, `typescript-eslint`, and `eslint-config-prettier`, enforcing `@typescript-eslint/no-explicit-any: "error"` and `no-unused-vars` (`^_` ignore pattern).
  - **Formatting:** Prettier (`.prettierrc.json`, `.prettierignore`) via `npm run format` and `npm run format:check`.
  - **CI:** `.github/workflows/ci.yml` running on `push`/`pull_request` to `main` across Node.js `[22, 24, 26]`, using SHA-pinned GitHub Actions (`actions/checkout`, `actions/setup-node`), minimal `contents: read` permissions, and running `npm ci`, `format:check`, `lint`, `typecheck`, `test`, and `build` without publishing or secrets.
- **Rationale:** Separates semantic/type-safety linting (ESLint) from deterministic formatting (Prettier) without rule conflicts, while keeping CI reproducible and supply-chain hardened.

### DEC-012: npm Package Name Availability Verification (`bugbundle-cli`)

- **Status:** `DECIDED` (Preliminary availability verified 2026-11-25; not yet published)
- **Verification History:**
  - `2026-11-25`: `npm view bugbundle name version` returned `name = 'bugbundle'`, `version = '0.3.0'` (occupied).
  - `2026-11-25`: `npm view bugbundle-cli name version --registry=https://registry.npmjs.org/` exited with code `1` (`E404 Not Found - GET https://registry.npmjs.org/bugbundle-cli - Not found`).
- **Decision:** Adopt **`bugbundle-cli`** as the npm package name in `package.json` (`"name": "bugbundle-cli"`) and `package-lock.json`, while preserving **`bugbundle`** as the product name, GitHub repository (`https://github.com/cipherX2433/bugbundle`), CLI binary (`"bin": { "bugbundle": "./dist/cli/index.js" }`), config filename (`bugbundle.config.json`), and default report filename (`bugbundle-report.md`).
- **Note:** `E404` confirms no public package metadata existed on `https://registry.npmjs.org/` at verification time; it is a preliminary availability signal, not a guarantee of publish permission until `npm publish` is executed. No publication has occurred.

### DEC-013: Missing Optional Tools & Graceful Degradation

- **Status:** `DECIDED` (2026-11-25)
- **Decision:** Missing optional tools (such as an unavailable package manager binary or optional lockfile) must produce a clear warning in the collector result and report, and must **never** crash the entire diagnostic collection.
- **Rationale:** Users frequently run diagnostics in partially broken or minimal environments. Isolating optional tool absences ensures healthy collectors still deliver actionable diagnostics to maintainers.

### DEC-014: CLI Collector Selection & Configuration Precedence

- **Status:** `DECIDED` (2026-11-25)
- **Decision:** `bugbundle collect` supports `--output <path>`, `--include <collectors>`, and `--exclude <collectors>`. Collector selection follows strict narrowing precedence:
  1. Start with configured `collectors.enabled` (or all known collectors `system`, `runtimes`, `dependencies` when omitted).
  2. Remove configured `collectors.excluded`.
  3. Apply CLI `--include` as an intersection (further restriction).
  4. Apply CLI `--exclude` as a further restriction.
  5. Reject an empty final selection with `ConfigValidationError`.
- **Rationale:** Allowing CLI flags only to narrow (never expand or re-enable) project-configured collector restrictions ensures team/maintainer config boundaries are respected and prevents silent empty reports.
- **Pre-Release Hardening Update (`REL-003`, `REL-004`):**
  - `bugbundle inspect` also supports `--include` and `--exclude` using the same `resolveEffectiveCollectors` precedence and zero-file-write guarantees.
  - `bugbundle.config.json` `report.filename` and CLI `--output` share `validateExportDestination` for consistent relative path validation, traversal/symlink/drive-letter rejection, and existing-directory containment.
