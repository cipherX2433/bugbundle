# Product Specification — `bugbundle`

> **Status:** Phase 0 — Implementation Preparation (Product Decisions Finalized; Tooling Decisions Open)  
> **License:** MIT  
> **Distribution:** npm (package name: `bugbundle`, subject to a future npm availability check) & GitHub

## 1. Vision

`bugbundle` is a completely open-source, local-first developer diagnostics CLI that helps open-source maintainers receive structured, reproducible diagnostic reports from users without invasive data collection or lengthy back-and-forth triage.

When a user encounters a bug in a Node.js library, CLI, or application, maintainers typically have to ask repeatedly for OS details, Node.js versions, package manager versions, and installed dependency graphs. `bugbundle` standardizes that process into a transparent, locally generated, user-reviewed Markdown report that the user can paste directly into a GitHub issue or bug tracker.

## 2. Problem Statement

- **For Open-Source Maintainers:** Issue reports frequently omit critical environment details (Node version, OS/arch, dependency versions), slowing down triage and reproduction.
- **For Users / Contributors:** Gathering accurate diagnostic context manually is tedious, error-prone, and often risks accidentally pasting sensitive environment variables, filesystem paths, or tokens into public issues.
- **Why Existing Approaches Fall Short:** Hosted telemetry, crash-reporting SDKs, or ad-hoc shell scripts either require backend infrastructure, transmit data without clear user inspection, or risk reading sensitive files (`.env`, shell histories, credentials).

## 3. Target Audience

### Initial Primary Audience

- **Node.js Developers** filing bug reports or troubleshooting local environment mismatches.

### Secondary Audience (Beneficiaries of Output)

- **Open-Source Maintainers** who want predictable, readable, Markdown-formatted diagnostic bundles attached to bug reports.

_(Future expansion to non-Node ecosystems is tracked separately in [FEATURES.md](./FEATURES.md) as post-MVP scope.)_

## 4. Product Principles

1. **Local-First & Zero Infrastructure:** Runs 100% locally on the user's machine. No backend server, no database, no user accounts, no authentication, no mandatory API keys, and no telemetry.
2. **Privacy & Security by Design:** Never silently collect arbitrary files, never read `.env` files or credentials, and never upload data automatically.
3. **Explicit User Consent:** Users must be able to review what was collected before anything is exported or written as a shareable report.
4. **Structured & Maintainer-Friendly:** Produces clean, deterministic Markdown that renders well in GitHub issues and discussions.
5. **Simple & Extensible:** Built around modular collectors and strict validation so new diagnostic checks can be added cleanly over time.

## 5. Initial Scope (Phase 1 / MVP)

- **Interface:** Command-Line Interface (CLI)
- **Language & Runtime:** TypeScript running on Node.js
- **Core Capabilities:**
  - System information collection (OS platform, OS release, architecture; excluding hostname, username, home directory, and unnecessary absolute paths by default)
  - Runtime detection (Node.js and relevant runtime versions, degrading with warnings rather than crashing if optional tools are missing)
  - Dependency inspection (`package.json` and supported lockfile metadata; no recursive `node_modules` scanning)
  - Markdown report generation (`bugbundle-report.md` in the current working directory by default, warning if it exists and never silently overwriting)
  - CLI commands (`bugbundle collect`, `bugbundle inspect`, `bugbundle init`) with `bugbundle.config.json` support, clear terminal output, and mandatory pre-export user review (refusing non-interactive export without an explicitly documented approval mechanism)

See [FEATURES.md](./FEATURES.md) for the full breakdown between MVP and future features.

## 6. Explicit Non-Goals

`bugbundle` will **not** include:

- Any backend service, cloud storage, or hosted dashboard
- Databases or persistent server-side state
- User authentication or account systems
- Mandatory API keys or paid tiers
- Usage analytics, crash telemetry, or background phoning home
- Automatic uploading or automatic GitHub issue submission without explicit user action
- Silent arbitrary file collection or secret/`.env` inspection

## 7. Open Product & Technical Questions

Core product direction for Phase 1 is finalized in [DECISIONS.md](./DECISIONS.md); the following remaining details are tracked as `OPEN`:

- Exact syntax of the explicitly documented non-interactive approval mechanism and interactive prompt library ([DEC-006](./DECISIONS.md#dec-006))
- Exact set of supported lockfiles and lockfile metadata fields extracted in Phase 1 ([DEC-008](./DECISIONS.md#dec-008))
- CLI exit code taxonomy ([DEC-010](./DECISIONS.md#dec-010))
- Confirmation of `bugbundle` npm package name availability ([DEC-012](./DECISIONS.md#dec-012))
- Phase 0 repository/tooling setup: minimum Node.js version ([DEC-001](./DECISIONS.md#dec-001)), module format/bundler ([DEC-002](./DECISIONS.md#dec-002)), package manager ([DEC-003](./DECISIONS.md#dec-003)), and linting/CI ([DEC-011](./DECISIONS.md#dec-011))
