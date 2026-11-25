# Technology Stack — `bugbundle`

This document defines the confirmed technology choices and records unresolved tooling/configuration decisions (cross-referenced with [DECISIONS.md](./DECISIONS.md)).

---

## 1. Confirmed Stack (Mandated by Product Requirements)

| Layer                | Choice                      | Role                                                                                                                                            | Status                                                          |
| :------------------- | :-------------------------- | :---------------------------------------------------------------------------------------------------------------------------------------------- | :-------------------------------------------------------------- |
| **Language**         | TypeScript (`strict: true`) | Type-safe source code across all modules                                                                                                        | Confirmed                                                       |
| **Runtime**          | Node.js                     | Cross-platform local execution runtime                                                                                                          | Confirmed (min version open: [DEC-001](./DECISIONS.md#dec-001)) |
| **CLI Framework**    | `commander`                 | Command parsing, options, flags, help/version generation                                                                                        | Confirmed                                                       |
| **Validation**       | `zod`                       | Runtime schema validation for CLI/config inputs & structured data                                                                               | Confirmed                                                       |
| **Terminal Styling** | `chalk`                     | Readable, accessible terminal formatting & status styling                                                                                       | Confirmed                                                       |
| **Testing**          | `vitest`                    | Unit, integration, and CLI test runner                                                                                                          | Confirmed                                                       |
| **Distribution**     | npm & GitHub                | Package registry (`bugbundle`, subject to future npm availability check — [DEC-012](./DECISIONS.md#dec-012)) and open-source repository hosting | Confirmed                                                       |
| **License**          | MIT                         | Permissive open-source licensing                                                                                                                | Confirmed                                                       |

---

## 2. TypeScript Configuration Principles

Regardless of final module/target choices ([DEC-001](./DECISIONS.md#dec-001), [DEC-002](./DECISIONS.md#dec-002)), TypeScript will be configured in **strict mode**:

- `"strict": true`
- `"noUncheckedIndexedAccess": true`
- `"exactOptionalPropertyTypes": true` (recommended; confirm during Phase 0)
- `"noImplicitOverride": true`
- `"noFallthroughCasesInSwitch": true`
- `"skipLibCheck": true`

No `any` escapes in production modules without explicit justification; boundary inputs must be parsed via `zod` schemas rather than unsafe type assertions (`as`).

---

## 3. Unresolved Tooling & Runtime Decisions

The following stack details are **not yet decided** and must be resolved in [DECISIONS.md](./DECISIONS.md) before scaffolding `package.json` and `tsconfig.json`:

1. **Node.js Minimum Supported Version ([DEC-001](./DECISIONS.md#dec-001)):**
   - Candidates: Node `>=18.18.0`, `>=20.0.0` (LTS), or `>=22.0.0`.
   - Impacts: Built-in APIs available (e.g., `node:readline/promises`, `util.parseArgs`, `fs.glob`), TypeScript `target`/`lib`, and `engines.node` in `package.json`.
2. **Module Format & Build Tooling ([DEC-002](./DECISIONS.md#dec-002)):**
   - Candidates: Pure ESM with `tsc`, ESM bundled with `tsup`, or Dual ESM/CJS.
   - Impacts: `package.json` `"type"` and `"exports"`, compatibility with `chalk` v5+ (ESM-only) vs. v4 (CJS), and startup speed.
   - _Note:_ `chalk` v5 is pure ESM; if CJS output is chosen, either bundling or `chalk` v4 would be required—making [DEC-002](./DECISIONS.md#dec-002) directly coupled to dependency major versions.
3. **Repository Package Manager ([DEC-003](./DECISIONS.md#dec-003)):**
   - Candidates: `npm` (ships with Node, zero extra setup) vs. `pnpm`.
4. **Interactive Review Prompt Mechanism ([DEC-006](./DECISIONS.md#dec-006)):**
   - Candidates: Node built-in `node:readline/promises` (zero extra dependency) vs. lightweight prompt library (e.g., `@inquirer/confirm`).
5. **Linting, Formatting & CI ([DEC-011](./DECISIONS.md#dec-011)):**
   - Candidates: ESLint + Prettier vs. Biome; GitHub Actions matrix for OS/Node versions.

---

## 4. Dependency Policy

Because `bugbundle` is a security-sensitive developer diagnostic tool distributed on npm:

- **Minimize Runtime Dependencies:** Only install libraries with clear necessity (`commander`, `zod`, `chalk`, plus any explicitly approved prompt helper if needed per [DEC-006](./DECISIONS.md#dec-006)).
- **Zero Telemetry / Network SDKs:** Never depend on HTTP clients, analytics libraries, or remote error trackers.
- **MIT-Compatible Licenses Only:** All runtime dependencies must have permissive licenses compatible with MIT (MIT, Apache-2.0, BSD, ISC).
- **Lockfile Hygiene:** Commit the repository lockfile once the package manager ([DEC-003](./DECISIONS.md#dec-003)) is chosen.
