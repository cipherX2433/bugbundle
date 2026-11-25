# Security Policy & Threat Model — `bugbundle`

Security and user trust are foundational to `bugbundle`. Developers run diagnostics tools inside repositories that frequently contain API keys, `.env` files, proprietary code, and local credentials. A single leak destroys maintainer and user trust.

---

## 1. Non-Negotiable Security Invariants

1. **Never Silently Collect Arbitrary Files:** `bugbundle` may only read explicitly allowlisted files required by enabled collectors (`package.json`, supported lockfiles, `bugbundle.config.json`). Recursive filesystem sweeps or unrequested file reads are prohibited.
2. **Never Read `.env` Contents or Credentials:** `.env` files, SSH private keys, credential stores, shell histories, and browser profiles are strictly excluded at the collection boundary (`PathSecurityGuard`) before any file is opened or read.
3. **Never Upload Data or Make Network Calls:** `bugbundle` is 100% offline/local-first. No telemetry, no analytics, no update checks that phone home, and no automatic issue uploads.
4. **Require User Review Before Exporting:** Collected diagnostic information must pass the security pipeline and be presented for user review and explicit confirmation before any report is written or exported.

---

## 2. Threat Model & Trust Boundaries

### Threats Considered

- **T1 — Accidental Secret Exposure:** Sensitive tokens, API keys, passwords, database URI credentials, private keys, or auth headers ending up in a public GitHub issue.
- **T2 — Path Traversal / Out-of-Scope Reads:** Crafted symlinks, `..` segments, or config options tricking a collector into reading prohibited files, shell histories, browser profiles, or files outside the target workspace.
- **T3 — Silent / Unintended Export:** Tool writing diagnostic reports or bypassing privacy validation in interactive or CI environments.
- **T4 — Command Injection:** Unsafe shell execution (`child_process.exec`) interpreting malicious project names, directory names, or PATH entries.
- **T5 — Supply Chain Bloat:** Excessive third-party npm runtime dependencies increasing attack surface.

### Security Architecture & Pipeline

Every diagnostic payload flows through a fail-closed local sanitization and validation pipeline (`src/security/pipeline.ts`):

```text
Approved Data
  -> Secret Scanner (src/security/scanner.ts, patterns.ts)
  -> Redaction Engine (src/security/redactor.ts)
  -> Path Sanitizer (src/security/path-sanitizer.ts)
  -> Privacy Validator (src/security/privacy-validator.ts)
  -> Sanitized Data (or SecurityBoundaryError blocking export)
```

| Boundary                           | Control                                                                                                                                                                                                                                                                                                                                                                          |
| :--------------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Config / CLI Input**             | All inputs validated by strict Zod schemas before execution. Unknown keys or malformed paths rejected early.                                                                                                                                                                                                                                                                     |
| **Collection Filesystem Boundary** | `PathSecurityGuard` (`src/security/path-guard.ts`) mediates all file checks/reads. Enforces canonical path resolution (`realpath`), workspace containment, symlink escape checks, an explicit collection allowlist (`DEFAULT_APPROVED_COLLECTION_FILES`), and an unconditional denylist before any file is opened.                                                               |
| **Environment Variables**          | `process.env` is **never** dumped or iterated wholesale. Only specific, non-secret runtime metadata (or explicit safe flags like `NO_COLOR`) may be checked.                                                                                                                                                                                                                     |
| **Subprocess Execution**           | Prefer Node.js built-in APIs (`os`, `process`, `fs/promises`). Runtime detection uses `execFile` with `shell: false`, explicit executable and argument arrays, and strict timeouts.                                                                                                                                                                                              |
| **Secret Scanning & Redaction**    | `SecretScanner` + `RedactionEngine` replace detected API keys, Bearer tokens, JWTs, password assignments, database credentials, AWS keys, and multiline private key blocks with `[REDACTED]`, returning metadata without original values.                                                                                                                                        |
| **Path & PII Sanitization**        | `PathSanitizer` scrubs Unix/Windows home directory paths (`<HOME>`), usernames (`<USER>`), and sensitive absolute paths (`<PATH>`) while preserving safe relative project paths and `<PROJECT>/...` references.                                                                                                                                                                  |
| **Fail-Closed Privacy Validation** | `PrivacyValidator` rejects any residual high-confidence secrets, private-key headers/material, unsanitized home paths, or malformed/circular structures—throwing `SecurityBoundaryError` and blocking export.                                                                                                                                                                    |
| **Markdown Report Rendering**      | `buildMarkdownReport` (`src/report/markdown-builder.ts`) consumes `SecurityPipeline`-processed data (failing closed if `security.validated === false`), never reads files/env vars, and escapes Markdown/HTML/table characters (`#`, `*`, `_`, `[`, `]`, `<`, `>`, `                                                                                                             | `, `` ` ``, newlines) to prevent report injection. |
| **Read-Only Preview (`inspect`)**  | `bugbundle inspect` strictly routes through `SecurityPipeline` before `buildMarkdownReport` and writes zero files; any security or config error aborts safely via `formatCliError` + `PathSanitizer` without printing raw collector output or stack traces.                                                                                                                      |
| **User Review Gate**               | `runReviewGate` (`src/review/review-gate.ts`) requires `securityValidated === true`, displays the sanitized Markdown preview, defaults to No `(y/N)`, handles `Ctrl+C`/EOF safely, and refuses non-interactive export unless `--yes` is supplied.                                                                                                                                |
| **Safe Local Exporter**            | `exportReport` (`src/export/report-exporter.ts`) requires both `securityValidated === true` and `ReviewApproval`, enforces workspace containment for `--output <path>` / default destinations, blocks traversal/symlinks/restricted destinations, uses exclusive `wx` writes, never creates unexpected directories, and refuses to overwrite existing files (`FileExistsError`). |
| **CLI Collector & Output Flags**   | `--include` / `--exclude` can only narrow configured collectors (`DEC-014`) and can never disable `SecurityPipeline`, `runReviewGate`, or `exportReport` safeguards; `--output` is validated via `validateExportDestination` before collection and again by `exportReport` before writing.                                                                                       |
| **Supply Chain & CI**              | Minimal runtime dependencies (`chalk`, `commander`, `zod`), npm `files` whitelist (`["dist", "LICENSE"]`) excluding `tests/`, `.env*`, and dev configs, and SHA-pinned GitHub Actions (`.github/workflows/ci.yml`) with `contents: read` permissions and zero secrets or auto-publishing.                                                                                        |
| **Network**                        | Zero network libraries (`fetch`, `http`, `https`, `net` outbound) permitted in `src/`.                                                                                                                                                                                                                                                                                           |

---

## 3. Critical Exclusion Policy (Collection Boundary Denylist)

`PathSecurityGuard` unconditionally rejects opening, inspecting, or reading any path matching:

- **`.env` files:** `.env`, `.env.*`, `*.env`, `.envrc`
- **SSH private keys & config:** `.ssh/**`, `id_rsa*`, `id_ed25519*`, `id_ecdsa*`, `id_dsa*`, `authorized_keys`, `known_hosts`, `*.ppk`
- **Credential & key files:** `.npmrc`, `.yarnrc`, `.yarnrc.yml`, `.netrc`, `.pypirc`, `.git-credentials`, `.aws/**`, `.gnupg/**`, `.kube/**`, `.docker/**`, `*.pem`, `*.key`, `*.p12`, `*.pfx`, `*.jks`, `*.kdbx`, `*secret*`, `*credentials*`
- **Shell histories:** `.bash_history`, `.zsh_history`, `.sh_history`, `.history`, `fish_history`, `.node_repl_history`, `.python_history`, `*_history`
- **Browser profiles:** `.mozilla/**`, `Chrome/**`, `Chromium/**`, `Firefox/**`, `BraveSoftware/**`, `Microsoft Edge/**`, `User Data/**`, `Local Storage/**`, `Session Storage/**`, `Cookies`, `Login Data`, `Web Data`, `Local State`
- **`node_modules` & arbitrary files:** `node_modules/**` and any file outside the explicitly approved collection scope (`DEFAULT_APPROVED_COLLECTION_FILES`).

Denylist rules always take precedence over any allowlist configuration.

---

## 4. Limitations of Pattern-Based Detection

`bugbundle` does **not** claim to guarantee detection of every possible secret:

- Pattern-based rules (`src/security/patterns.ts`) target structured, recognizable secret formats (known token prefixes, Bearer headers, database URIs, private key blocks, and explicit key/password assignments).
- Custom or proprietary secret formats, encoded/encrypted/compressed blobs, split secrets, or arbitrary password strings lacking recognizable context may not be caught by pattern matching alone.
- For this reason, `bugbundle` enforces **defense-in-depth**: strict collection-boundary exclusion (so sensitive files are never opened), path/PII sanitization, fail-closed privacy validation, and **mandatory human review** before any diagnostic report can be exported.

---

## 5. Error & Log Hygiene

- Never print raw file contents, matched secret snippets, or full environment maps on failure.
- Format `SecurityBoundaryError` and `PrivacyViolation` messages to state **what rule or category blocked access** without echoing sensitive values.
- Sanitize file paths in error outputs (relative to project root or `<HOME>`-masked).

---

## 6. Security Verification Requirements

Every release and CI run must verify:

1. **Collection boundary exclusion tests (`tests/security/path-guard.test.ts`):** `.env`, `.env.local`, `.npmrc`, `.bash_history`, `.zsh_history`, `.ssh/id_rsa`, browser profile files, `node_modules`, arbitrary unapproved files, path traversal, and symlink escapes are rejected before reading.
2. **Secret scanning & redaction tests (`tests/security/scanner.test.ts`, `redactor.test.ts`):** API keys, passwords, Bearer tokens, JWTs, database connection strings, AWS keys, multiline private keys, multiple secrets, false-positive cases, and empty/malformed inputs are handled without leaking raw secrets into logs or metadata.
3. **Path sanitization tests (`tests/security/path-sanitizer.test.ts`):** Unix and Windows home paths/usernames/absolute paths are sanitized while safe relative project paths are preserved.
4. **Fail-closed privacy validation & pipeline tests (`tests/security/privacy-validator.test.ts`, `pipeline.test.ts`):** Private-key material, residual secrets, unsanitized home paths, and malformed/circular inputs are rejected and block export.
5. **Review gate abort test (future export milestone):** Declining review produces zero output files.
6. **Zero-network audit:** No outbound HTTP/socket usage in application code.

---

## 7. Vulnerability Reporting (Open Source)

Once the GitHub repository is public, maintain a responsible disclosure contact (e.g., GitHub Security Advisories) so security researchers can report vulnerabilities privately before public disclosure.
