# Feature Specification — `bugbundle`

This document clearly separates **Phase 1 (MVP)** features from **Future (Post-MVP)** capabilities, reflecting finalized Phase 1 decisions in [DECISIONS.md](./DECISIONS.md).

---

## 1. Phase 1 (MVP) Features

Phase 1 delivers a focused, local-first CLI for Node.js developers centered on core CLI commands, modular collectors, and Markdown report generation.

### 1.1 System Information Collector

- **Purpose:** Capture essential host environment context needed to reproduce platform-specific issues.
- **Included Scope ([DEC-009](./DECISIONS.md#dec-009)):**
  - Operating system platform (`process.platform` / `os.platform()`)
  - Operating system release (`os.release()`)
  - CPU architecture (`process.arch` / `os.arch()`, e.g., `x64`, `arm64`)
- **Security Constraints & Default Exclusions:**
  - Exclude hostname, OS username, home directory (`os.homedir()`), IP/MAC addresses, arbitrary environment variables, and unnecessary absolute paths by default (see [SECURITY.md](./SECURITY.md) and [DEC-009](./DECISIONS.md#dec-009)).

### 1.2 Runtime Detection Collector

- **Purpose:** Identify the active JavaScript/Node.js execution environment.
- **Included Scope ([DEC-009](./DECISIONS.md#dec-009)):**
  - Node.js version (`process.version`) and relevant runtime versions (e.g., detected package manager version if available safely without arbitrary shell interpolation)
- **Failure Behavior ([DEC-013](./DECISIONS.md#dec-013)):**
  - Missing optional tools (such as an unavailable package manager binary) must produce a clear warning rather than crashing the entire collection.

### 1.3 Dependency Inspection Collector

- **Purpose:** Summarize the target Node.js project's dependencies so maintainers can spot version skew or incompatible peer dependencies.
- **Included Scope ([DEC-008](./DECISIONS.md#dec-008)):**
  - Safe, explicit reading of `package.json` in the target working directory (if present): declared `engines`, `dependencies`, `devDependencies`, `peerDependencies`, `optionalDependencies`
  - Safe reading of supported lockfile metadata (presence, lockfile format/version, and lockfile metadata without recursively scanning `node_modules`)
  - Explicit handling when no `package.json` exists in the current directory (report gracefully with warning/skipped state rather than failing catastrophically)
- **Hard Boundary:**
  - Must **never** recursively scan `node_modules`.
- **Open Implementation Sub-Detail:**
  - Exact set of supported lockfiles and metadata fields parsed in Phase 1 — tracked in [DEC-008](./DECISIONS.md#dec-008).

### 1.4 Configuration & Schema Validation (Zod) — _Implemented (Milestone 4.1)_

- **Purpose:** Allow predictable, validated configuration of collectors and output options.
- **Included Scope ([DEC-007](./DECISIONS.md#dec-007)):**
  - Optional `bugbundle.config.json` project config (`projectName`, `collectors`, `report`, `options`) scaffolded via `bugbundle init`
  - Strict Zod schema validation rejecting unknown fields, invalid types, security bypass keys, and unsafe report filenames
  - Graceful fallback to safe defaults when `bugbundle.config.json` is absent
  - Clear, human-readable `ConfigValidationError` reporting when malformed JSON or invalid config values are supplied

### 1.5 Mandatory User Review Gate — _Implemented (Milestone 4.4)_

- **Purpose:** Enforce privacy and user agency before any collected diagnostic report is exported.
- **Included Scope ([DEC-006](./DECISIONS.md#dec-006)):**
  - Display the full sanitized Markdown report preview in the terminal (`DIAGNOSTIC REPORT PREVIEW`)
  - Require explicit default-No `(y/N)` confirmation before writing (`node:readline/promises`, safe `Ctrl+C`/EOF handling)
  - Cleanly abort (`Collection cancelled. No report was saved.`) without writing files if the user declines
  - In non-interactive mode (CI / piped `stdin`), refuse to export unless `--yes` (`bugbundle collect --yes`) is explicitly supplied; never bypass `SecurityPipeline` or non-overwrite safeguards

### 1.6 Markdown Report Generation & Safe Export — _Implemented (Milestones 4.2 & 4.4)_

- **Purpose:** Produce a clean, copy-paste-ready Markdown diagnostic report tailored for GitHub issues and maintainer triage.
- **Included Scope ([DEC-005](./DECISIONS.md#dec-005)):**
  - _Implemented (Milestone 4.2):_ Pure, deterministic `buildMarkdownReport` (`src/report/`) rendering Header, System Info, Runtime Info, Dependency Info, Collection Warnings, and Privacy & Security Summary with Markdown/HTML escaping and `SecurityPipeline` validation enforcement
  - _Implemented (Milestone 4.4):_ Safe local exporter (`src/export/`) writing `./bugbundle-report.md` (or configured `report.filename`) using exclusive-create (`wx`), workspace containment, symlink-escape rejection, and strict non-overwrite protection (`FileExistsError`)

### 1.7 CLI Commands & Terminal Styling

- **Purpose:** Provide an intuitive, self-documenting CLI built with Commander and Chalk.
- **Included Scope ([DEC-004](./DECISIONS.md#dec-004)):**
  - Root `--help` and `--version`
  - `bugbundle collect [--output <path>] [--include <collectors>] [--exclude <collectors>] [--yes]` _(Implemented — Milestones 4.4 & 5.1)_ — Collect, sanitize via `SecurityPipeline`, render Markdown, present review gate, and export to `./bugbundle-report.md` or `--output <path>` upon approval, with strict narrowing collector precedence ([DEC-014](./DECISIONS.md#dec-014))
  - `bugbundle inspect` _(Implemented — Milestone 4.3)_ — Collect, sanitize via `SecurityPipeline`, render sanitized Markdown, and display local preview without writing any file or prompting for export
  - `bugbundle init` _(Implemented — Milestone 4.1)_ — Scaffold `bugbundle.config.json` in the target directory without silently overwriting an existing file
  - Readable, color-coded terminal output (respecting `NO_COLOR` / non-TTY conventions via Chalk)
  - Standardized CLI exit codes (`0` success, `1` internal error, `2` invalid input/config, `3` collection failure, `4` security failure, `5` review declined / non-interactive `--yes` required, `6` export/file-exists/FS failure, `130` Ctrl+C; [DEC-010](./DECISIONS.md#dec-010))

---

## 2. Future / Post-MVP Features (Explicitly Out of Phase 1 Scope)

The following capabilities are **excluded from Phase 1** and captured as architectural extension points only:

1. **Maintainer Diagnostic Manifests:** Repository-level opt-in profiles defining specific non-sensitive checks a maintainer requests (still strictly bounded by `bugbundle` security rules and user review).
2. **Custom / Third-Party Collector Plugins:** Loading external collector modules via an explicit plugin API.
3. **Additional Output Formats:** JSON, SARIF, or HTML local report exporters alongside Markdown.
4. **Additional Language Ecosystems:** Collectors for Python (`pyproject.toml`, `venv`), Rust (`Cargo.toml`, `rustc`), Go (`go.mod`, `go version`), or Docker/container metadata.
5. **Expanded Redaction Rulesets:** User-configurable regex/key redaction profiles and diffing between two diagnostic bundles.
6. **Clipboard / Browser Deep-Link Helpers (User-Initiated Only):** Optional explicit convenience flags (e.g., copy to clipboard after review) — still strictly zero automatic uploads.
7. **Doctor / Advanced Config Verification Commands:** `bugbundle doctor` or advanced environment verification commands beyond Phase 1 `init`/`inspect`/`collect`.

---

## 3. Feature Constraints Matrix

| Constraint                                                                        | Phase 1 (MVP) | Future Versions |
| :-------------------------------------------------------------------------------- | :------------ | :-------------- |
| Local-only execution                                                              | Required      | Required        |
| Reads `.env` or credentials                                                       | Prohibited    | Prohibited      |
| Silent arbitrary file reads / recursive `node_modules` scan                       | Prohibited    | Prohibited      |
| Silent file overwrite on existing output/config                                   | Prohibited    | Prohibited      |
| Automatic network upload / telemetry                                              | Prohibited    | Prohibited      |
| User review before export (and non-interactive refusal without explicit approval) | Required      | Required        |
| Backend / DB / Auth / Mandatory API keys                                          | None          | None            |
