# Mandatory Security Rules for Agents — `bugbundle`

These rules are **non-negotiable** for every change, script, test, or architecture proposal in `bugbundle`. See [SECURITY.md](../../SECURITY.md) for the full threat model.

---

## 1. Hard Prohibitions

1. **NEVER read `.env` files or credentials:**
   - Never open, stat-read contents of, parse, or bundle `.env`, `.env.*`, `*.env`, `.envrc`, `.npmrc`, `.yarnrc`, `.yarnrc.yml`, `.netrc`, `.pypirc`, `.ssh/**`, `.aws/**`, `.gnupg/**`, `.docker/config.json`, private keys (`*.pem`, `*.key`, `*.p12`, `*.pfx`, `id_rsa*`, `id_ed25519*`), or `*secret*` / `*credentials*` files.
2. **NEVER dump or iterate `process.env` wholesale:**
   - Do not serialize, log, include in reports, or attach `process.env` to error objects. Only access explicitly allowlisted non-secret runtime values (e.g., `process.version`, `process.platform`, `process.arch`) or standard UI flags (e.g., `NO_COLOR`).
3. **NEVER silently collect arbitrary files:**
   - Do not implement recursive directory scans, wildcard globs across user projects, or unrequested file reads. Every file read must be explicitly allowlisted by a collector and mediated by `SecurityGuard`.
4. **NEVER make outbound network requests or add telemetry:**
   - No `fetch`, `http`/`https` requests, analytics SDKs, crash-reporting clients, update-check pings, or automatic uploads anywhere in `src/`.
5. **NEVER bypass the user review gate:**
   - The `export` layer must not write or emit final diagnostic reports without explicit confirmation from the `review` gate. Declining review must produce zero exported files.
6. **NEVER use unsafe shell execution:**
   - Never use `child_process.exec` or shell string interpolation (`shell: true`). Prefer Node.js built-in APIs (`node:os`, `node:process`, `node:fs/promises`). If an external command is strictly necessary, use `execFile` with `shell: false`, fixed binary names, fixed argument arrays, and strict timeouts.

---

## 2. Required Implementation Safeguards

- **Canonical Path & Traversal Protection:** Always resolve canonical paths (`realpath`) via `SecurityGuard` before reading, and reject `..` escapes or symlinks pointing outside allowed targets or into prohibited paths.
- **Sanitize Before Formatting or Error Reporting:** Pass collected strings and error paths through `Sanitizer` so user home directory paths (`os.homedir()`) and accidental token/credential patterns (`Bearer ...`, `user:pass@host`, common API token prefixes) are redacted before reaching Markdown output or terminal stderr.
- **Validate Boundaries with Zod:** All CLI options and any config inputs must pass strict Zod validation before collectors execute.

---

## 3. Required Security Tests

Whenever modifying `security`, `collectors`, `report`, `review`, or `export`:

- Include or maintain negative tests proving `.env` canary secrets in a fixture workspace never appear in collector output, error messages, or rendered Markdown.
- Include tests proving path traversal and denylisted files throw `SecurityBoundaryError`.
- Include tests proving declining at the review gate writes zero files.
