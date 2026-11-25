# Agent & Contributor Guide — `bugbundle`

`bugbundle` is an open-source (MIT), local-first Node.js developer diagnostics CLI written in strict TypeScript. It helps open-source maintainers receive structured, user-reviewed Markdown diagnostic reports without backend infrastructure, telemetry, or invasive file collection.

---

## 1. Documentation Map (Read Before Making Changes)

Always consult the project documentation before designing or implementing changes:

1. [CURRENT_STATUS.md](./CURRENT_STATUS.md) — Current project phase, what exists, and active blockers.
2. [DECISIONS.md](./DECISIONS.md) — Confirmed constraints and numbered decision records (`DEC-001`–`DEC-013`).
3. [PRODUCT.md](./PRODUCT.md) — Product vision, audience, and strict non-goals.
4. [FEATURES.md](./FEATURES.md) — Phase 1 (MVP) scope vs. explicitly deferred Post-MVP features.
5. [ARCHITECTURE.md](./ARCHITECTURE.md) — Pipeline data flow, module boundaries, collector contracts, and error handling.
6. [TECH_STACK.md](./TECH_STACK.md) — Confirmed libraries and TypeScript strictness rules.
7. [SECURITY.md](./SECURITY.md) — Threat model, denylist, and security verification requirements.
8. [DEVELOPMENT_PLAN.md](./DEVELOPMENT_PLAN.md) — Phased milestones and testing strategy.
9. [.agents/rules/security.md](./.agents/rules/security.md) — **Mandatory** security rules enforced on all agent work.

---

## 2. Non-Negotiable Engineering Rules

1. **Respect Security Boundaries First:** Every change must obey [.agents/rules/security.md](./.agents/rules/security.md) and [SECURITY.md](./SECURITY.md). Never read `.env*` files or credentials, never silently collect arbitrary files, never add network calls or telemetry, and never bypass the mandatory user review gate.
2. **Do Not Silently Invent Unresolved Decisions:** Check [DECISIONS.md](./DECISIONS.md). If an implementation task depends on an `OPEN` decision (`DEC-001`–`DEC-013`), stop and ask for clarification or record the uncertainty rather than guessing.
3. **Strict TypeScript Everywhere:** No `any` escapes in production code. Validate all external/CLI/config inputs at the boundary using `zod`.
4. **Keep Modules & Collectors Isolated:** Follow the module boundaries in [ARCHITECTURE.md](./ARCHITECTURE.md#2-module-responsibilities). Collectors must implement the `Collector` contract, route file reads through `SecurityGuard`, and isolate errors via `CollectorResult`.
5. **Test-Driven Verification:** All new logic requires Vitest unit/integration tests. Security guardrails require explicit negative tests (e.g., `.env` canary rejection, path traversal denial, review abort producing zero files).
6. **Keep Documentation Synchronized:** When architecture, decisions, commands, or project status change, update the corresponding markdown docs (`DECISIONS.md`, `CURRENT_STATUS.md`, `ARCHITECTURE.md`, etc.) in the same change.
7. **Stay Within Phase Scope:** Do not build Post-MVP features (see [FEATURES.md](./FEATURES.md#2-future--post-mvp-features-explicitly-out-of-phase-1-scope)) during Phase 1 unless explicitly requested.

---

## 3. Build, Lint & Test Commands

```bash
npm run format:check # Verify Prettier formatting
npm run lint         # Run ESLint flat config across src/ and tests/
npm run typecheck    # Strict TypeScript type checking (tsc --noEmit)
npm run build        # Compile src/ to dist/ (tsc -p tsconfig.build.json)
npm test             # Run Vitest suite once (vitest run)
npm run test:watch   # Run Vitest in watch mode
```
