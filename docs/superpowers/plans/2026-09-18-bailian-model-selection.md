# BaiLian Model Selection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a manually refreshed, verified BaiLian copywriting-model selector, migrate retired `deepseek-v3` settings to `deepseek-v4.1-flash`, and produce a newly versioned Windows installer without changing global content deduplication, MiniMax audio, mixing, publishing, or platform integrations.

**Architecture:** The Electron main process remains the only desktop layer allowed to read the BaiLian API key. It sends the key and existing local-backend authorization proof to a protected FastAPI discovery endpoint; Python queries the official model catalog, ranks a curated text-generation subset, performs minimal live probes, and returns at most five verified recommendations. Vue only receives non-secret model metadata, caches it in the existing SQLite settings store, never refreshes automatically, and changes the active model only when the user explicitly selects and saves it.

**Tech Stack:** Electron, TypeScript, Vue 3, Element Plus, Zod, Vitest, Python 3.11, FastAPI, httpx, pytest, SQLite, electron-builder, PyInstaller.

**Spec:** `docs/superpowers/specs/2026-09-18-bailian-model-selection-design.md`

## Global Constraints

- Global topic and script deduplication remains mandatory and has no switch, strength selector, or bypass.
- MiniMax voice configuration, model, request code, and UI remain unchanged.
- No automatic BaiLian catalog request occurs during startup, settings-page mount, credential save, or ordinary copy generation.
- A refresh never silently changes `defaultModel`; only an explicit user selection followed by Save changes it.
- The renderer never receives or stores the BaiLian API key.
- Only models that pass a live probe may be labelled available; catalog-only entries must not be presented as verified.
- Failed refreshes preserve the previous model selection, cached recommendations, user data, and API key.
- At most five recommended models are displayed.
- `deepseek-v3` is migrated to `deepseek-v4.1-flash`.
- Structured output sent to DeepSeek V4 explicitly sets `enable_thinking: false`.
- Existing installer artifacts are never overwritten or deleted.
- No `.env`, keys, tokens, connection strings, databases, logs, profiles, diagnostic bundles, or build output may enter Git.
- Model-selection work must not be mixed into the pre-existing uncommitted development-window fix.

## File and Interface Map

- `electron/repositories/settings-repository.ts`: owns persisted copy-model schema, defaults, validation, and legacy migration.
- `electron/services/bailian-model-service.ts`: owns Electron-to-FastAPI discovery call and non-secret response validation.
- `electron/main.ts`: registers the one new IPC handler and reads the credential-store secret.
- `electron/preload.ts`: exposes typed, validated discovery and settings methods.
- `src/renderer/env.d.ts`: declares shared renderer-facing model metadata.
- `src/renderer/views/SettingsView.vue`: renders manual refresh, verified recommendations, status, timestamp, and selection.
- `backend/app/copywriting/bailian.py`: low-level BaiLian model-list and chat HTTP client behavior.
- `backend/app/copywriting/model_catalog.py`: filters, ranks, probes, and limits recommendations.
- `backend/app/main.py`: protected recommendation endpoint.
- `backend/tests/*`, `tests/electron/*`, `tests/renderer/*`: unit and integration coverage.
- `package.json`, `package-lock.json`: release-only Build ID bump.
- `release/manifest-0.7.3-models.20260918.160000.json`: hashes and provenance for the new artifacts; build files themselves stay ignored.

---

### Task 0: Isolate and Finish the Existing Development-Window Fix

**Files:**
- Modify: `electron/main.ts`
- Keep/Create: `electron/window-visibility.ts`
- Test: `tests/electron/window-visibility.test.ts`

**Interfaces:**
- Consumes: existing Electron `BrowserWindow` lifecycle callbacks.
- Produces: `installWindowVisibilityRecovery(window, options)` with deterministic one-time reveal behavior, committed separately from all model work.

- [ ] **Step 1: Inspect only the existing uncommitted patch**

Run: `git diff -- electron/main.ts electron/window-visibility.ts tests/electron/window-visibility.test.ts`

Expected: the patch contains only ready/load/fallback window reveal logic and any temporary diagnostic logging is identifiable.

- [ ] **Step 2: Remove temporary diagnostics without changing the tested behavior**

Delete only temporary visibility-probe file logging or console instrumentation from `electron/main.ts`; retain the imported helper and its lifecycle wiring. Do not touch unrelated main-process code.

- [ ] **Step 3: Run the focused test and typecheck**

Run: `npx vitest run tests/electron/window-visibility.test.ts`

Expected: PASS for ready-to-show, did-finish-load, one-time reveal, and fallback behavior.

Run: `npm run typecheck`

Expected: exit code 0.

- [ ] **Step 4: Commit the isolated pre-existing fix**

```powershell
git add electron/main.ts electron/window-visibility.ts tests/electron/window-visibility.test.ts
git commit -m "fix: reveal development window reliably"
```

Expected: subsequent model commits start from a clean worktree.

---

### Task 1: Persist Model Recommendations and Migrate `deepseek-v3`

**Files:**
- Modify: `electron/repositories/settings-repository.ts`
- Modify: `tests/electron/settings-repository.test.ts`

**Interfaces:**
- Produces:

```ts
export type BailianModelRecommendation = {
  id: string;
  displayName: string;
  family: "deepseek" | "qwen" | "other";
  status: "available";
  note: string;
};

export type CopyModelSettings = {
  defaultModel: string;
  temperature: number;
  candidateModels: string[];
  modelRecommendations: BailianModelRecommendation[];
  modelsCheckedAt: string | null;
};
```

- `getCopyModelSettings()` normalizes old records, persists the migration, and always returns the complete current shape.
- `saveCopyModelSettings(input)` trims/deduplicates IDs, limits recommendations to five, rejects a default outside `candidateModels`, and—after a successful check—rejects a default that is absent from the verified recommendations.

- [ ] **Step 1: Add failing default, migration, and recommendation-validation tests**

Add tests equivalent to:

```ts
expect(repository.getCopyModelSettings()).toMatchObject({
  defaultModel: "deepseek-v4.1-flash",
  candidateModels: ["deepseek-v4.1-flash", "qwen-plus"],
  modelRecommendations: [],
  modelsCheckedAt: null
});

repository.set("copy-model", {
  defaultModel: "deepseek-v3",
  temperature: 0.8,
  candidateModels: ["deepseek-v3", "qwen-plus"]
});
expect(repository.getCopyModelSettings().defaultModel).toBe("deepseek-v4.1-flash");
expect(repository.get("copy-model", null)?.defaultModel).toBe("deepseek-v4.1-flash");

expect(() => repository.saveCopyModelSettings({
  ...defaultCopyModelSettings,
  modelRecommendations: Array.from({ length: 6 }, (_, index) => ({
    id: `model-${index}`,
    displayName: `Model ${index}`,
    family: "other" as const,
    status: "available" as const,
    note: "verified"
  }))
})).toThrow(/five|5/i);

expect(() => repository.saveCopyModelSettings({
  ...defaultCopyModelSettings,
  defaultModel: "retired-model",
  candidateModels: ["retired-model", "deepseek-v4.1-flash"],
  modelRecommendations: [{
    id: "deepseek-v4.1-flash",
    displayName: "DeepSeek V4.1 Flash",
    family: "deepseek",
    status: "available",
    note: "verified"
  }],
  modelsCheckedAt: "2026-09-18T08:00:00.000Z"
})).toThrow(/verified|可用/i);
```

- [ ] **Step 2: Verify the tests fail for the missing shape and migration**

Run: `npx vitest run tests/electron/settings-repository.test.ts`

Expected: FAIL because the default is still `deepseek-v3` and recommendation fields do not exist.

- [ ] **Step 3: Implement normalization and atomic persistence**

Add a private normalizer that replaces every exact `deepseek-v3` occurrence with `deepseek-v4.1-flash`, supplies missing fields, deduplicates candidate IDs, and ensures the default is present. In `getCopyModelSettings`, compare the stored JSON-compatible value with the normalized value and call `set("copy-model", normalized)` only when they differ.

- [ ] **Step 4: Run focused tests**

Run: `npx vitest run tests/electron/settings-repository.test.ts`

Expected: PASS, including persistence of migration across a new repository instance.

- [ ] **Step 5: Commit**

```powershell
git add electron/repositories/settings-repository.ts tests/electron/settings-repository.test.ts
git commit -m "feat: migrate and cache bailian model settings"
```

---

### Task 2: Implement BaiLian Catalog Discovery and Live Verification

**Files:**
- Modify: `backend/app/copywriting/bailian.py`
- Create: `backend/app/copywriting/model_catalog.py`
- Modify: `backend/tests/test_bailian.py`
- Create: `backend/tests/test_model_catalog.py`

**Interfaces:**
- Produces:

```python
@dataclass(frozen=True)
class ProviderModel:
    id: str

@dataclass(frozen=True)
class ModelRecommendation:
    id: str
    display_name: str
    family: Literal["deepseek", "qwen", "other"]
    status: Literal["available"]
    note: str

@dataclass(frozen=True)
class ModelRefreshResult:
    recommendations: list[ModelRecommendation]
    checked_at: datetime
    source: Literal["provider", "fallback"]

class BailianChat:
    def list_models(self, *, api_key: str) -> list[ProviderModel]: ...

class BailianModelCatalog:
    def refresh(self, *, api_key: str) -> ModelRefreshResult: ...
```

- Curated ranking order is exactly: `deepseek-v4.1-flash`, `qwen3.7-plus`, `qwen3.8-flash`, `deepseek-v4-pro`, `qwen3.8-max`.

- [ ] **Step 1: Add failing HTTP-client tests**

Test that `list_models` sends `GET https://dashscope.aliyuncs.com/api/v1/models` with `Authorization: Bearer ...`, accepts provider payloads with model IDs, and maps 401/403/429 through the existing BaiLian error types. Add a chat test asserting:

```python
client.complete(
    api_key="sk-test",
    model="deepseek-v4.1-flash",
    prompt='Return JSON with key "ok".'
)
assert sent_json["response_format"] == {"type": "json_object"}
assert sent_json["enable_thinking"] is False
```

- [ ] **Step 2: Verify HTTP-client tests fail**

Run: `python -m pytest backend/tests/test_bailian.py -q`

Expected: FAIL because `list_models` and DeepSeek V4 thinking control are absent.

- [ ] **Step 3: Add failing catalog tests**

Cover all of these cases with a fake `BailianChat`:

```python
def test_refresh_ranks_probes_and_limits_to_five(): ...
def test_refresh_uses_curated_fallback_when_listing_fails(): ...
def test_refresh_excludes_failed_or_forbidden_probes(): ...
def test_refresh_raises_when_no_candidate_is_usable(): ...
```

Assertions must verify that only successful live probes produce `status == "available"`, the result contains no more than five unique IDs, and `source == "fallback"` only when catalog listing failed.

- [ ] **Step 4: Implement the low-level client and focused catalog**

`BailianChat.list_models` parses IDs without persisting the key or response. `BailianModelCatalog.refresh` intersects official catalog IDs with the exact curated order; if listing fails for a non-authentication transport/provider reason, it probes the curated order directly and sets `source="fallback"`. Authentication failures stop immediately. Each probe requests a tiny JSON response and excludes every failure instead of guessing availability.

- [ ] **Step 5: Run focused backend tests**

Run: `python -m pytest backend/tests/test_bailian.py backend/tests/test_model_catalog.py -q`

Expected: PASS.

- [ ] **Step 6: Commit**

```powershell
git add backend/app/copywriting/bailian.py backend/app/copywriting/model_catalog.py backend/tests/test_bailian.py backend/tests/test_model_catalog.py
git commit -m "feat: discover and verify bailian copy models"
```

---

### Task 3: Add the Protected API and Secret-Safe Electron Bridge

**Files:**
- Modify: `backend/app/main.py`
- Modify: `backend/tests/test_api.py`
- Create: `electron/services/bailian-model-service.ts`
- Create: `tests/electron/bailian-model-service.test.ts`
- Modify: `electron/main.ts`
- Modify: `electron/preload.ts`
- Modify: `src/renderer/env.d.ts`
- Modify: `tests/electron/preload-bundle.test.ts`

**Interfaces:**
- FastAPI: `POST /copywriting/models/recommendations`, header `X-Bailian-Key`, existing local backend session/license proof, response:

```json
{
  "recommendations": [{
    "id": "deepseek-v4.1-flash",
    "displayName": "DeepSeek V4.1 Flash",
    "family": "deepseek",
    "status": "available",
    "note": "Live verification passed"
  }],
  "checkedAt": "2026-09-18T08:00:00Z",
  "source": "provider"
}
```

- Electron service:

```ts
export type BailianModelRefreshResult = {
  recommendations: BailianModelRecommendation[];
  checkedAt: string;
  source: "provider" | "fallback";
};

export async function refreshBailianModels(input: {
  baseUrl: string;
  apiKey: string;
  sessionToken: string;
  licenseHeaders: Record<string, string>;
  fetchImpl?: typeof fetch;
}): Promise<BailianModelRefreshResult>;
```

- Renderer bridge: `window.autocut.refreshBailianModels(): Promise<CopyModelSettings>`; it returns cached settings after Electron merges the verified recommendations, candidates, and timestamp.

- [ ] **Step 1: Add a failing protected API test**

Mock `BailianModelCatalog.refresh` and assert a valid request returns camelCase metadata, while requests missing the existing backend authorization proof are rejected by the same protection used by other copywriting endpoints. Assert the response never contains `apiKey`, `authorization`, or any request header value.

- [ ] **Step 2: Run the API test and observe failure**

Run: `python -m pytest backend/tests/test_api.py -q -k "model_recommendations"`

Expected: FAIL with 404 before the endpoint exists.

- [ ] **Step 3: Implement the endpoint with explicit error mapping**

Map BaiLian authentication/permission failures to 401/403, rate limiting to 429, no usable candidates to 422, and upstream/transport failures to 502/504 using the project’s existing unified error response format. Do not log the key.

- [ ] **Step 4: Add failing Electron service and preload tests**

The service test must assert the outbound request contains the session token, license proof, and BaiLian key; the returned object contains no key; 401, 403, 429, timeout, and invalid response bodies produce distinct Chinese user-facing messages. The preload test must assert `refreshBailianModels` exists in the built bridge and validates the response with Zod.

- [ ] **Step 5: Implement the Electron service, IPC, schema, and type declarations**

Register `settings:refreshBailianModels`. The handler reads `bailian` from the existing credential repository, throws the existing “未配置密钥” error when absent, calls the service, and only after success saves:

```ts
{
  ...current,
  candidateModels: result.recommendations.map((item) => item.id),
  modelRecommendations: result.recommendations,
  modelsCheckedAt: result.checkedAt
}
```

If the current default is not in refreshed candidates, preserve it by prepending it to `candidateModels` but do not mark it verified and do not replace it.

- [ ] **Step 6: Run bridge tests and typecheck**

Run: `npx vitest run tests/electron/bailian-model-service.test.ts tests/electron/preload-bundle.test.ts`

Expected: PASS.

Run: `npm run typecheck`

Expected: exit code 0.

- [ ] **Step 7: Commit**

```powershell
git add backend/app/main.py backend/tests/test_api.py electron/services/bailian-model-service.ts tests/electron/bailian-model-service.test.ts electron/main.ts electron/preload.ts src/renderer/env.d.ts tests/electron/preload-bundle.test.ts
git commit -m "feat: expose verified bailian model refresh"
```

---

### Task 4: Add the Manual Settings-Page Refresh and Selection UI

**Files:**
- Modify: `src/renderer/views/SettingsView.vue`
- Create: `tests/renderer/settings-view.test.ts`

**Interfaces:**
- Consumes: `window.autocut.getCopyModelSettings()`, `refreshBailianModels()`, and `saveCopyModelSettings()`.
- Produces: a manual-only refresh flow, a maximum-five recommendation panel, and an explicit selection/save flow.

- [ ] **Step 1: Add a failing “no automatic request” component test**

Mount `SettingsView` with bridge mocks, resolve initial settings load, and assert:

```ts
expect(window.autocut.getCopyModelSettings).toHaveBeenCalledOnce();
expect(window.autocut.refreshBailianModels).not.toHaveBeenCalled();
```

- [ ] **Step 2: Add failing interaction tests**

Click `查看模型更新`, return six mock recommendations from the bridge, and assert the view renders no more than five recommendation rows, displays `上次检查` using `modelsCheckedAt`, and does not call `saveCopyModelSettings` until the user explicitly selects a model and clicks Save. Add error tests for 401/403, 429, and timeout text while ensuring the pre-refresh options remain rendered.

When the saved current model is not among the refreshed recommendations, assert that it remains visible as `当前模型（未通过本次验证）`, Save is blocked for that ID, and choosing a verified recommendation enables Save.

- [ ] **Step 3: Run the component test and observe failure**

Run: `npx vitest run tests/renderer/settings-view.test.ts`

Expected: FAIL because the refresh button and metadata UI do not exist.

- [ ] **Step 4: Implement the minimal UI**

Keep the existing BaiLian credential card and temperature field. Replace the free-form candidate editor with:

- a `默认模型` select whose options are cached `candidateModels`;
- a `查看模型更新` button with a refresh-only loading state;
- `上次检查：从未检查` or the localized timestamp;
- up to five verified recommendations showing display name, exact ID, `可用`, and note;
- existing Save behavior, with no refresh call inside `load()`, `testCredential()`, or `saveCopyModel()`.
- an explicit unavailable warning for a current model absent from the latest verified recommendations; it remains displayed but cannot be saved again until a verified model is selected.

Do not edit the MiniMax voice section.

- [ ] **Step 5: Run UI tests and typecheck**

Run: `npx vitest run tests/renderer/settings-view.test.ts`

Expected: PASS.

Run: `npm run typecheck`

Expected: exit code 0.

- [ ] **Step 6: Commit**

```powershell
git add src/renderer/views/SettingsView.vue tests/renderer/settings-view.test.ts
git commit -m "feat: add manual bailian model selection"
```

---

### Task 5: Verify Selected-Model Use and Protect Existing Deduplication

**Files:**
- Modify: `backend/tests/test_api.py`
- Modify: `backend/tests/test_copywriting.py`
- Modify only if a failing test proves necessary: `backend/app/copywriting/service.py`
- Modify only if a failing test proves necessary: `backend/app/copywriting/topic_service.py`

**Interfaces:**
- Consumes: existing copywriting request model field and the migrated desktop default.
- Produces: regression evidence that the selected model reaches BaiLian while topic/script novelty enforcement remains mandatory.

- [ ] **Step 1: Extend the selected-model integration test**

Use `deepseek-v4.1-flash` in the existing connection/generation test and assert the mocked BaiLian call receives that exact ID. Add a second case with `qwen3.7-plus` to prove the runtime is not hard-coded to DeepSeek.

Assert separately that the existing hotspot search still calls its fixed search model and is not changed by `defaultModel`.

- [ ] **Step 2: Add explicit dedup regression assertions**

Run generation with history containing a matching normalized title and script claim. Assert the existing dedup path rejects or regenerates it exactly as before; the request must not contain any dedup-disable field, and model selection must not change novelty thresholds.

- [ ] **Step 3: Run focused backend regression tests**

Run: `python -m pytest backend/tests/test_api.py backend/tests/test_copywriting.py -q`

Expected: PASS. If already passing, do not change production service/topic code.

- [ ] **Step 4: Prove MiniMax and unrelated business code did not change**

Run:

```powershell
git diff 56332b5 -- backend/app/audio electron/services/minimax* src/renderer/audio backend/app/mixing backend/app/publishing
```

Expected: no diff. If a repository path does not exist, use `rg --files` to identify the existing MiniMax/audio/mixing/publishing paths and repeat the comparison on those exact paths.

- [ ] **Step 5: Commit tests only when changed**

```powershell
git add backend/tests/test_api.py backend/tests/test_copywriting.py
git commit -m "test: cover selectable models and mandatory dedup"
```

---

### Task 6: Full Verification, Security Review, and Local Smoke Test

**Files:**
- Modify only for defects demonstrated by a failing test.
- Do not add secrets or local runtime data.

**Interfaces:**
- Produces: a clean, test-backed release candidate before packaging.

- [ ] **Step 1: Run the complete project check**

Run: `npm run check`

Expected: all TypeScript/Vitest and Python/pytest checks pass with exit code 0.

- [ ] **Step 2: Run the production build without packaging**

Run: `npm run build`

Expected: renderer and Electron production bundles compile successfully.

- [ ] **Step 3: Run a secret and artifact scan**

Run:

```powershell
git grep -n -I -E "(sk-[A-Za-z0-9_-]{16,}|postgres(ql)?://[^[:space:]]+|BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY|gh[pousr]_[A-Za-z0-9_]{20,})" -- . ":(exclude)*.example" ":(exclude)package-lock.json"
git status --short
```

Expected: no real credential matches; only intentional source/test fixtures and planned files appear in status.

- [ ] **Step 4: Inspect scope against the approved commit**

Run: `git diff --stat 56332b5..HEAD` and `git diff 56332b5..HEAD -- src/renderer/views/SettingsView.vue electron/repositories/settings-repository.ts backend/app/copywriting`

Expected: changes are limited to the isolated window fix, BaiLian discovery/selection, migration, tests, and documentation; global dedup implementation and MiniMax implementation are unchanged.

- [ ] **Step 5: Launch one local development smoke test**

Run the repository’s existing development command, confirm the Electron window becomes visible, open Settings, verify no model request occurs before clicking `查看模型更新`, then click it with the configured BaiLian key and verify a clear result or provider-specific error. Stop the dev processes cleanly after the check.

- [ ] **Step 6: Commit any evidence-only documentation if created**

No production commit is required when all checks pass and no files change.

---

### Task 7: Create the New Build ID, Installer, and Hash Manifest

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Create: `release/manifest-0.7.3-models.20260918.160000.json` only if `release/` permits tracked manifests; otherwise create `docs/releases/0.7.3-models.20260918.160000.json`.
- Preserve: every pre-existing installer and hash record.

**Interfaces:**
- Produces Build ID: `0.7.3-models.20260918.160000`.
- Produces SHA-256 for the new installer, packaged `app.asar`, and packaged backend executable.

- [ ] **Step 1: Confirm all preconditions before changing the version**

Run: `git status --short`, `npm run check`, and `npm run build`.

Expected: only intentional source changes, all tests passing, and the non-packaged build successful. Do not package if any command fails.

- [ ] **Step 2: Update the exact Build ID mechanically**

Run: `npm version 0.7.3-models.20260918.160000 --no-git-tag-version`

Expected: only `package.json` and `package-lock.json` version metadata changes.

- [ ] **Step 3: Commit the release metadata**

```powershell
git add package.json package-lock.json
git commit -m "chore: set build 0.7.3-models.20260918.160000"
```

- [ ] **Step 4: Build the Windows installer once**

Run: `npm run dist:win`

Expected: PyInstaller backend build, Electron native-module rebuild, renderer/Electron production build, and electron-builder installer creation all succeed. Do not delete or overwrite older artifacts; if an output name collides, stop and change the new artifact name rather than replacing it.

- [ ] **Step 5: Locate and hash the three artifacts**

Use `Get-ChildItem` to resolve the newly created installer, `app.asar`, and backend `.exe`, then run `Get-FileHash -Algorithm SHA256 -LiteralPath <resolved path>` separately for each exact path.

Expected: three 64-character uppercase hexadecimal SHA-256 values.

- [ ] **Step 6: Record a non-secret manifest**

Write JSON with this exact shape and the resolved values:

```json
{
  "buildId": "0.7.3-models.20260918.160000",
  "sourceCommit": "the exact output of git rev-parse HEAD",
  "createdAt": "the exact UTC ISO-8601 build completion time",
  "artifacts": [
    { "kind": "installer", "path": "absolute path", "sha256": "64 hex characters" },
    { "kind": "app.asar", "path": "absolute path", "sha256": "64 hex characters" },
    { "kind": "backend.exe", "path": "absolute path", "sha256": "64 hex characters" }
  ]
}
```

Do not put secrets, environment values, database paths, logs, or user data in the manifest.

- [ ] **Step 7: Run installed-artifact smoke checks**

Install or launch the newly packaged build, confirm the Build ID is the new value, existing user data and credentials remain accessible, old `deepseek-v3` settings display as `deepseek-v4.1-flash`, manual refresh works, saved selection survives restart, and no model refresh happens automatically.

- [ ] **Step 8: Final status and preservation check**

Run: `git status --short`, list old and new installer files with timestamps and sizes, and compare all recorded hashes. Expected: old installer files are still present and unchanged; build outputs remain ignored; only the intended manifest may be tracked.

---

## Final Acceptance Checklist

- [ ] `deepseek-v3` migrates once and remains `deepseek-v4.1-flash` after restart.
- [ ] Settings load produces zero model-catalog requests.
- [ ] Clicking `查看模型更新` is the only UI action that starts catalog discovery.
- [ ] The UI shows at most five live-verified BaiLian text models.
- [ ] Refresh failures are explicit and preserve all cached settings.
- [ ] Refresh does not change the active model; explicit selection plus Save does.
- [ ] DeepSeek V4 structured-output requests send `enable_thinking: false`.
- [ ] The selected BaiLian model reaches both connection testing and copy generation.
- [ ] Global topic/script deduplication remains mandatory and unchanged.
- [ ] MiniMax audio and unrelated mixing/publishing/platform code have no implementation diff.
- [ ] Full tests and build pass before packaging.
- [ ] New installer, `app.asar`, and backend executable have recorded SHA-256 values.
- [ ] Old installer artifacts and hash records remain intact.
