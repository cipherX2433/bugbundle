# Current Status — `bugbundle`

> **Last Updated:** 2026-11-25  
> **Current Phase:** Post-v0.1.0 Release Hardening — Preparing `bugbundle-cli@0.1.1` (`READY FOR FINAL RELEASE AUDIT`)

---

## 1. Current State Summary

- **Repository State:** Phase 1 is complete and `bugbundle-cli@0.1.0` is published on npm. Security hardening, Release Hardening 1, and Release Hardening 2 (Phase 2 native dependency investigation) are complete in the working tree for the `0.1.1` patch release target.
- **Package Identity & Publication Status:**
  - **Product / GitHub Repo / CLI Binary:** `bugbundle` (`https://github.com/cipherX2433/bugbundle`)
  - **npm Package Name (`DEC-012`):** `bugbundle-cli`
  - **Published Version:** `0.1.0` (verified on `https://registry.npmjs.org/`)
  - **Current Release Target:** `0.1.1` (version bump and publish not yet run)
  - **License & Runtime:** MIT, Node.js `>=22.0.0`, `npm`
- **Completed Release-Hardening Work (Targeting `0.1.1`):**
  - **Security Pattern Hardening:** Fixed `password-assignment` and `generic-api-key-assignment` regexes in `src/security/patterns.ts` to detect underscore-prefixed names (`APP_PASSWORD`, `USER_PASSWORD`, `FAKE_PASSWORD`, `DB_PASSWORD`, `API_SECRET=example`) without false positives (`PASSWORD_POLICY`). Added `tests/security/regression.test.ts`.
  - **Release Hardening 1 — Redaction Count Accuracy:** Eliminated double-counting of derived `[collectorId] warning` entries in `bundle.warnings` via `stripDerivedBundleWarnings` (`src/report/markdown-builder.ts`, `src/cli/program.ts`), preserving fail-closed `PrivacyValidator` checks and warning output.
  - **Release Hardening 2 (Phase 2) — Native Dependency Installation Reliability:** Diagnosed why clean `npm ci` skipped `@rolldown/binding-darwin-arm64@1.2.19` on macOS ARM64 (`package-lock.json` omitted all 16 `@rolldown/binding-*` optional entries due to `npm/cli#4828` lockfile behavior). Reproduced in an isolated environment and updated `package-lock.json` in place with all 16 platform-specific `@rolldown/binding-*` optional entries (`darwin`, `linux`, `win32`, `wasm32-wasi`).
- **Completed Artifacts:**
  - `src/` — `cli`, `collectors`, `config`, `core`, `errors` (`EXIT_CODES`), `export`, `report`, `review`, `security`, `types`
  - `tests/` — 23 Vitest test files (139 tests, including security regression and redaction-count tests)
  - `eslint.config.mjs`, `.prettierrc.json`, `.prettierignore`, `.gitattributes`, `.github/workflows/ci.yml` (Ubuntu/Windows/macOS across Node `22`, `24`, `26`)
  - `README.md` & `CONTRIBUTING.md` — Grounded in actual CLI commands, flags, exit codes, Zod config schema, and security boundaries

---

## 2. Decision & Tooling Status

- **Finalized Decisions:** `DEC-001`, `DEC-003`, `DEC-004`, `DEC-005`, `DEC-006`, `DEC-007`, `DEC-008`, `DEC-009`, `DEC-010`, `DEC-011`, `DEC-012` (`bugbundle-cli`), `DEC-013`, `DEC-014`.
- **Adopted Provisionally:** `DEC-002` (Pure ESM compiled with `tsc`).

---

## 3. Verification Snapshot (Latest Run)

- `rm -rf node_modules && npm ci --include=optional`: Passed (`@rolldown/binding-darwin-arm64` installed on macOS ARM64)
- `npm run format:check`: Passed
- `npm run lint`: Passed
- `npm run typecheck`: Passed
- `npm run build`: Passed
- `npm test`: 23 test files passed, 139 tests passed
- `npm audit` / `npm audit --omit=dev`: 0 vulnerabilities

---

## 4. Remaining Release Actions (Manual Maintainer Steps)

1. Commit the pending release-hardening changes (`CURRENT_STATUS.md`, `package-lock.json`, `src/cli/program.ts`, `src/report/`, `tests/report/markdown-builder.test.ts`) and push to `https://github.com/cipherX2433/bugbundle` to verify all 7 cross-platform CI jobs (`ubuntu-latest`, `windows-latest`, `macos-latest`).
2. Bump `package.json` / `package-lock.json` to `0.1.1` when ready for the patch release.
3. Run `npm publish` manually for `bugbundle-cli@0.1.1` (`npm publish` has **not** been run for `0.1.1`).
