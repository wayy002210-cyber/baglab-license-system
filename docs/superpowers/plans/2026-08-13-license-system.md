# License System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add one-time activation codes, device binding, signed online/offline authorization, three-layer desktop enforcement, and a deployable administration service.

**Architecture:** A standalone Next.js service owns PostgreSQL authorization state and Ed25519 signing. Electron owns device identity and secure credential coordination; Vue presents state; Python independently verifies short-lived local authorization proof.

**Tech Stack:** Next.js, TypeScript, PostgreSQL/Neon, Drizzle SQL migrations, Zod, Vitest, Electron, Vue 3, FastAPI, Pytest, Windows Credential Manager/DPAPI.

## Global Constraints

- Never commit real environment values, activation signing private keys, credentials, databases, browser profiles, logs, diagnostics, or build artifacts.
- Preserve baseline tag `baseline-0.6.8-batchfix.20260812.220000` and the existing installer.
- Never delete customer data on license failure.
- Do not build a new installer before local API/desktop integration succeeds.
- Desktop offline use is limited to 72 hours and never extends business expiry.

---

### Task 1: Authorization service core

**Files:** Create `license-service/` application, `license-service/db/migrations/`, domain modules, API routes, and tests.

**Interfaces:** Produces `/api/license/activate`, `/api/license/validate`, `/api/license/refresh`, canonical Ed25519 credentials, database migrations, and stable error codes.

- [ ] Write failing domain and API tests for code duration, one-time/concurrent redemption, binding, expiry, validation, refresh, rate limiting, and signature claims.
- [ ] Run focused tests and verify failures are caused by missing implementation.
- [ ] Implement schema, transactions, hashing, credential signing, validation, error mapping, and rate limiting.
- [ ] Run service tests, typecheck, build, migration validation, and secret scan.
- [ ] Commit `feat: add license service core`.

### Task 2: Administrator application

**Files:** Create admin auth/session modules, admin API routes, admin pages/components, and tests under `license-service/`.

**Interfaces:** Consumes service repositories; produces secure login/logout, CSRF-protected mutations, code generation/export, queries, disable/restore/extend/unbind, notes, devices, licenses, and events.

- [ ] Write failing tests for authentication, password verification, CSRF, authorization, one-time plaintext display, queries, and audited mutations.
- [ ] Verify focused failures.
- [ ] Implement admin API and responsive server-rendered management UI.
- [ ] Run service tests, typecheck, and build.
- [ ] Commit `feat: add license administration console`.

### Task 3: Desktop authorization coordinator

**Files:** Create focused modules in `electron/license/`, update credential storage/preload contracts, create tests.

**Interfaces:** Produces device identity, `getStatus`, `activate`, `refresh`, signed-credential verification, offline evaluation, clock state, and local proof issuance.

- [ ] Write failing tests for stable/fallback fingerprinting, secure Installation ID, credential tampering/copying, retry, 72-hour limit, expiry, rollback, build floor, and upgrade persistence.
- [ ] Verify focused failures.
- [ ] Implement device probes, secure persistence, API client, Ed25519 verification, retry/state machine, timers, and local proof.
- [ ] Run Electron tests and typecheck.
- [ ] Commit `feat: add desktop license coordinator`.

### Task 4: Activation and license UI

**Files:** Create Vue license store/views/components and update router, shell, preload typings, and tests.

**Interfaces:** Consumes Electron license IPC; produces activation gate, device-code copy, explicit errors, status panel, remaining time, offline deadline, and manual refresh.

- [ ] Write failing component/router tests for every visible state and protected navigation.
- [ ] Verify focused failures.
- [ ] Implement activation page, route guard, status panel, and expiry redirect without data deletion.
- [ ] Run renderer tests and typecheck.
- [ ] Commit `feat: add desktop activation experience`.

### Task 5: Three-layer enforcement

**Files:** Update Electron IPC registration, backend process headers, create Python authorization verifier/dependency, update critical FastAPI routes, and add tests.

**Interfaces:** Electron guards sensitive IPC and supplies short-lived proof; Python validates signature, device, build, expiry, and proof lifetime for protected endpoints.

- [ ] Write failing direct-bypass tests for Vue navigation, IPC generation/voice/account/publish calls, and FastAPI protected endpoints.
- [ ] Verify focused failures.
- [ ] Implement reusable Electron guard and Python dependency without changing unrelated publishing or mixing logic.
- [ ] Run all desktop/Python regression tests and production build.
- [ ] Commit `feat: enforce license across desktop layers`.

### Task 6: Local integration, deployment assets, and delivery

**Files:** Create `.env.example`, local integration harness, deployment/key/backup/restore/upgrade documentation, installer verification/hash scripts, and test reports.

**Interfaces:** Produces local end-to-end activation flow, Vercel/Neon configuration, new Build ID, and final installer/hash manifest.

- [ ] Run local PostgreSQL-backed activation/validation/admin/desktop flow and all security scenarios.
- [ ] Run full regression, secret scan, dependency audit, and production builds.
- [ ] Commit `test: complete license system integration`.
- [ ] Pause once for required GitHub/Neon/Vercel account and environment-variable configuration.
- [ ] Verify deployed environment, generate a unique Build ID, build one Windows test installer, verify package contents, and record installer/app.asar/backend hashes.
- [ ] Commit `chore: package licensed desktop build`.
