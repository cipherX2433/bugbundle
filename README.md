# bugbundle

> Stop asking users for logs. Generate everything you need to debug.

[![CI](https://github.com/cipherX2433/bugbundle/actions/workflows/ci.yml/badge.svg)](https://github.com/cipherX2433/bugbundle/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)
[![Node.js >= 22.0.0](https://img.shields.io/badge/node-%3E%3D22.0.0-brightgreen.svg)](./package.json)

`bugbundle` is an open-source, local-first CLI that collects structured Node.js diagnostic information, sanitizes sensitive data, and generates a user-reviewed Markdown report developers can share when reporting bugs.

---

## The Problem

When users report bugs in Node.js libraries, CLIs, or applications, maintainers repeatedly have to ask for:

- Node.js versions
- Operating system platform, release, and architecture
- Package manager versions
- Project dependency and lockfile details
- Environment context needed to reproduce the issue

Gathering this information manually slows down triage and creates risk: users frequently copy and paste terminal output or configuration files containing API keys, database passwords, tokens, or local home-directory paths into public issue trackers.

---

## What bugbundle Does

`bugbundle` runs 100% locally in your project directory through a fail-closed pipeline:

1. **System Information Collector:** Captures OS platform, OS release, CPU architecture, Node.js version, and safe CPU model/core count while excluding hostnames, usernames, and home directories.
2. **Runtime Detection Collector:** Safely checks primary (`Node.js`, `npm`) and optional (`pnpm`, `Yarn`, `Bun`, `Python`, `Java`) runtimes using bounded timeouts without shell interpolation.
3. **Dependency & Lockfile Collector:** Inspects `package.json` and supported lockfiles (`package-lock.json`, `pnpm-lock.yaml`, `yarn.lock`, `bun.lock`, and safe presence detection for `bun.lockb`) without scanning `node_modules` or executing scripts.
4. **Security Pipeline:** Scans for common secret patterns, replaces detected secrets with `[REDACTED]`, sanitizes Unix and Windows home/system paths, and fails closed if residual secrets or private keys are detected.
5. **Markdown Report Generation:** Formats sanitized diagnostic data into deterministic GitHub-Flavored Markdown with Markdown/HTML escaping.
6. **Mandatory Review & Safe Local Export:** Displays the full sanitized report for user review and exports `./bugbundle-report.md` only after explicit confirmation, without overwriting existing files.

`bugbundle` does **not** collect arbitrary log files, read `.env` files, or upload data automatically.

---

## Features

- **Local-first operation:** Runs completely offline on your machine.
- **No account, backend, or telemetry:** Zero databases, zero mandatory API keys, zero analytics, and zero automatic uploads.
- **No silent report export:** `bugbundle collect` requires explicit interactive confirmation (or explicit `--yes` in non-interactive environments).
- **No overwriting existing reports:** Refuses to overwrite an existing `bugbundle-report.md` or `bugbundle.config.json`.
- **Safe collector selection:** Narrow active collectors via `bugbundle.config.json` and `--include` / `--exclude` flags without disabling security validation.
- **Interactive and CI-safe modes:** Supports read-only preview (`bugbundle inspect`) and explicit non-interactive approval (`bugbundle collect --yes`).

---

## Installation

**Requirements:** Node.js `>=22.0.0` and `npm`.

The npm package name is `bugbundle-cli` (preliminary availability verified on `2026-11-25` via `https://registry.npmjs.org/`; initial npm publication is pending). Once published, install globally with:

```bash
npm install -g bugbundle-cli
```

Verify the CLI executable:

```bash
bugbundle --help
```

To run locally from source before publication:

```bash
git clone https://github.com/cipherX2433/bugbundle.git
cd bugbundle
npm ci
npm run build
node dist/cli/index.js --help
```

---

## Quick Start

Initialize a starter configuration file (optional):

```bash
bugbundle init
```

Preview a sanitized diagnostic report in your terminal without writing any files:

```bash
bugbundle inspect
```

Collect diagnostics, review the sanitized Markdown preview, and confirm before saving `./bugbundle-report.md`:

```bash
bugbundle collect
```

- `init` creates `bugbundle.config.json` without overwriting an existing file.
- `inspect` displays the sanitized Markdown report and creates zero files.
- `collect` displays the sanitized Markdown report, asks for confirmation (`(y/N)`), and exports only after approval.

---

## CLI Reference

### Commands

```bash
bugbundle collect [options]
bugbundle inspect
bugbundle init
```

Global flags:

- `-V, --version`: Display the bugbundle CLI version
- `-h, --help`: Display help for command

### `bugbundle collect` Options

```bash
--output <path>         Relative output path for the Markdown report
--include <collectors>  Comma-separated collectors to include (system, runtimes, dependencies)
--exclude <collectors>  Comma-separated collectors to exclude (system, runtimes, dependencies)
--yes                   Explicitly approve saving the sanitized report in non-interactive mode
-h, --help              Display help for command
```

Supported collectors: `system`, `runtimes`, `dependencies`.

### Examples

```bash
bugbundle collect
bugbundle collect --yes
bugbundle collect --include system,runtimes
bugbundle collect --exclude dependencies
bugbundle collect --output ./issue-report.md --yes
bugbundle inspect
```

In non-interactive shells or CI, `bugbundle collect` refuses to export unless `--yes` is explicitly supplied. `--yes` never bypasses the security pipeline, path validation, or existing-file non-overwrite protection.

### Exit Codes

| Exit Code | Meaning                                                                    |
| :-------- | :------------------------------------------------------------------------- |
| `0`       | Successful execution (`collect`, `inspect`, `init`, `--help`, `--version`) |
| `1`       | Unexpected internal error                                                  |
| `2`       | Invalid CLI arguments/flags or invalid configuration                       |
| `3`       | Diagnostic collection failure (all executed collectors failed)             |
| `4`       | Security boundary or privacy validation failure                            |
| `5`       | Review declined or non-interactive execution without `--yes`               |
| `6`       | Export collision, existing file refusal, or filesystem write failure       |
| `130`     | User interruption (`Ctrl+C` / `SIGINT`)                                    |

---

## Configuration

`bugbundle` supports an optional `bugbundle.config.json` file in your project root, validated strictly with Zod. Generate a starter file using `bugbundle init`:

```json
{
  "collectors": {
    "enabled": ["system", "runtimes", "dependencies"],
    "excluded": []
  },
  "report": {
    "filename": "bugbundle-report.md",
    "includeWarnings": true
  },
  "options": {
    "includeDevDependencies": true,
    "processTimeoutMs": 3000
  }
}
```

Supported fields:

- `projectName` _(optional string)_: Custom project label for the report header.
- `collectors.enabled` _(optional array)_: Allowed collector IDs (`system`, `runtimes`, `dependencies`).
- `collectors.excluded` _(optional array)_: Collectors to exclude.
- `report.filename` _(optional relative filename)_: Default report filename (`bugbundle-report.md`). Absolute paths, `..` traversal, and `.env` targets are rejected.
- `report.includeWarnings` _(optional boolean)_: Whether to include collection warnings in the Markdown report (`true` by default).
- `options.includeDevDependencies` _(optional boolean)_: Include `devDependencies` metadata (`true` by default).
- `options.processTimeoutMs` _(optional integer, `500`–`30000`)_: Timeout in milliseconds for runtime version checks (`3000` by default).

Unknown fields and security-bypass options are rejected.

### Collector Selection Precedence

1. Start with `collectors.enabled` from `bugbundle.config.json` (or all supported collectors if omitted).
2. Remove `collectors.excluded` from `bugbundle.config.json`.
3. Apply CLI `--include` as a further restriction (CLI flags cannot re-enable collectors disabled by project configuration).
4. Apply CLI `--exclude` as a further restriction.
5. Reject an empty final collector selection with exit code `2`.

---

## Example Report

```markdown
# bugbundle Diagnostic Report

Automatically generated local-first diagnostic report for issue triage.

| Field        | Value                      |
| :----------- | :------------------------- |
| Tool         | `bugbundle v0.1.0`         |
| Project      | example-app                |
| Generated At | `2026-11-25T15:00:00.000Z` |

## System Information

| Property        | Value                |
| :-------------- | :------------------- |
| Platform        | `linux`              |
| OS Release      | `6.8.0-generic`      |
| Architecture    | `x64`                |
| Node.js Version | `v22.17.1`           |
| CPU Model       | Synthetic 8-Core CPU |
| CPU Cores       | 8                    |

## Runtime Information

| Runtime | Role     | Status   | Version       |
| :------ | :------- | :------- | :------------ |
| Node.js | Primary  | detected | `22.17.1`     |
| npm     | Primary  | detected | `11.5.2`      |
| pnpm    | Optional | missing  | not installed |
| Yarn    | Optional | detected | `1.22.22`     |
| Bun     | Optional | missing  | not installed |
| Python  | Optional | detected | `3.12.4`      |
| Java    | Optional | missing  | not installed |

## Dependency Information

| Property                    | Value              |
| :-------------------------- | :----------------- |
| Manifest                    | package.json found |
| Project Manifest Name       | example-app@1.0.0  |
| Package Manager             | `npm`              |
| Dependencies Count          | 2                  |
| DevDependencies Count       | 1                  |
| Total Declared Dependencies | 3                  |

### Lockfiles

| Filename            | Type | Supported | Version | Notes |
| :------------------ | :--- | :-------- | :------ | :---- |
| `package-lock.json` | npm  | Yes       | `3`     | -     |

### Declared Dependencies

| Package | Version Range |
| :------ | :------------ |
| `chalk` | `^5.4.1`      |
| `zod`   | `^3.24.2`     |

### Development Dependencies

| Package  | Version Range |
| :------- | :------------ |
| `vitest` | `^3.0.8`      |

## Collection Warnings

- \[runtimes\] Optional runtime "pnpm" is not installed or not on PATH.
- \[runtimes\] Optional runtime "Bun" is not installed or not on PATH.
- \[runtimes\] Optional runtime "Java" is not installed or not on PATH.

## Privacy and Security Summary

This report was generated locally after processing through the `bugbundle` security pipeline (no telemetry, no automatic uploads, `.env` and credential files excluded).

| Check               | Value  |
| :------------------ | :----- |
| Security Validation | Passed |
| Redactions Applied  | 0      |
| Path Sanitizations  | 0      |
| Collection Warnings | 3      |
```

---

## Privacy and Security

- **What is collected:** Non-identifying OS/CPU metadata, runtime versions, and declared `package.json` + lockfile metadata from explicitly allowlisted files.
- **What is excluded before reading:** `PathSecurityGuard` enforces workspace containment and blocks `.env*` files, SSH keys, credential files (`.npmrc`, `.aws`, `.netrc`, `.git-credentials`), shell histories, browser profiles, `node_modules`, symlink escapes, and any file outside the explicitly approved collection scope.
- **Secret scanning and redaction:** `SecretScanner` and `RedactionEngine` replace detected API keys, Bearer tokens, JWTs, password assignments, database connection string credentials, AWS keys, and multiline private key blocks with `[REDACTED]`.
- **Path sanitization:** `PathSanitizer` masks Unix and Windows home directories (`<HOME>`), usernames (`<USER>`), and sensitive system paths (`<PATH>`) while preserving safe relative project paths (`<PROJECT>/...`).
- **Fail-closed validation:** `SecurityPipeline` runs `PrivacyValidator` before Markdown generation, review, and export. Residual secrets, private-key headers, or unsanitized home paths block report generation and export (`SecurityBoundaryError`).
- **User review and non-overwrite:** Every exported report requires explicit approval and uses exclusive file creation (`wx`) so existing files are never overwritten. Reports remain strictly local unless you choose to share them.

**Important:** Pattern-based secret detection is a defense-in-depth safeguard and cannot guarantee detecting every possible custom or obfuscated secret. Always review the generated report before sharing it publicly.

---

## Architecture

Diagnostic runs execute as a unidirectional local pipeline:

```text
Collectors -> Security Pipeline -> Markdown Report -> Review Gate -> Safe Exporter
```

Source layout:

```text
src/
  cli/         # Commander CLI setup, options, and process entrypoint
  collectors/  # System, runtime, and dependency collectors
  config/      # Zod schemas, config loader, init, and collector selection
  core/        # DiagnosticOrchestrator with collector error isolation
  errors/      # BugbundleError hierarchy and centralized EXIT_CODES mapping
  export/      # Workspace-contained, non-overwriting report exporter
  report/      # Pure GitHub-Flavored Markdown builder with escaping
  review/      # Interactive (y/N) review gate and --yes non-interactive policy
  security/    # PathSecurityGuard, SecretScanner, RedactionEngine, PathSanitizer, PrivacyValidator
  types/       # Shared strict TypeScript contracts
```

---

## Development

CI runs against Node.js `22`, `24`, and `26` (`.github/workflows/ci.yml`).

```bash
npm ci
npm run format
npm run lint
npm run typecheck
npm test
npm run build
```

---

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for prerequisites, local setup, PR expectations, and security reporting guidance. Before opening a pull request, please also review [AGENTS.md](./AGENTS.md), [ARCHITECTURE.md](./ARCHITECTURE.md), and [SECURITY.md](./SECURITY.md), and ensure `npm run format:check`, `npm run lint`, `npm run typecheck`, `npm run build`, and `npm test` pass.

---

## License

[MIT License](./LICENSE)
