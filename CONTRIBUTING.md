# Contributing to `bugbundle`

Thank you for your interest in contributing to `bugbundle`! `bugbundle` is an MIT-licensed, local-first developer diagnostics CLI written in strict TypeScript.

---

## 1. Prerequisites

- **Node.js:** `>=22.0.0` (tested on Node.js 22, 24, and 26)
- **Package Manager:** `npm` (uses `package-lock.json`)
- **Git:** For branching and pull requests

---

## 2. Local Development Setup

```bash
git clone https://github.com/cipherX2433/bugbundle.git
cd bugbundle
npm ci
```

---

## 3. Build, Lint & Test Commands

Run the full local verification suite before opening a pull request:

```bash
npm run format:check # Verify Prettier formatting
npm run lint         # Run ESLint across src/ and tests/
npm run typecheck    # Run strict TypeScript type checking (tsc --noEmit)
npm run build        # Compile src/ to dist/
npm test             # Run Vitest suite once (requires build for spawned CLI tests)
```

To auto-format files with Prettier:

```bash
npm run format
```

---

## 4. Pull Request Expectations

1. **Preserve Core Principles:** `bugbundle` must remain local-first, with zero network calls, zero telemetry, no automatic uploads, and no mandatory API keys.
2. **Respect Security Boundaries:** Obey [SECURITY.md](./SECURITY.md) and [.agents/rules/security.md](./.agents/rules/security.md). Never read `.env*` files or credentials, never bypass `PathSecurityGuard`, `SecurityPipeline`, or the mandatory user review gate.
3. **Strict TypeScript:** No `any` escapes in production code; validate external/CLI/config inputs with `zod`.
4. **Tests Required:** Add Vitest unit or integration tests for new behavior, including negative security tests where applicable.
5. **Documentation Sync:** Keep docs (`README.md`, `ARCHITECTURE.md`, `DECISIONS.md`, `CURRENT_STATUS.md`) in sync with code changes.
6. **Keep PRs Focused:** Avoid unrelated refactoring and ensure `npm run format:check`, `npm run lint`, `npm run typecheck`, `npm run build`, and `npm test` all pass.

---

## 5. Security Vulnerability Reporting

If you discover a security vulnerability in `bugbundle`:

- **Do not** open a public GitHub issue with exploit details or sensitive proof-of-concept payloads.
- Report the issue privately to the repository maintainer via GitHub's security advisory / private vulnerability reporting flow on `https://github.com/cipherX2433/bugbundle/security` (or contact the maintainer directly through their GitHub profile if private advisories are not yet enabled).
- Include clear reproduction steps, affected versions, and impact so the issue can be investigated and patched promptly.
