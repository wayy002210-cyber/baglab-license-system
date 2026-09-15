# Content Deduplication and Hot Topics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a history-aware topic and script pipeline that refuses repeated content, rotates narrative structures, and optionally grounds one or two topics per batch in current sourced events.

**Architecture:** Electron remains the owner of the local SQLite database and injects compact history into local FastAPI requests. Python owns content identities, similarity decisions, topic planning, script review, embeddings, and sourced hot-topic retrieval. Vue only presents the richer topic model and records user lifecycle transitions through Electron IPC.

**Tech Stack:** Electron 41, TypeScript 5.9, Vue 3, Zod 4, better-sqlite3, Python 3, FastAPI, Pydantic 2, httpx, Alibaba Cloud Model Studio chat/search/embedding APIs, Vitest, pytest.

**Spec:** `docs/superpowers/specs/2026-09-15-content-dedup-and-hot-topics-design.md`

## Global Constraints

- Do not change licensing, mixing, publishing, platform adaptation, or existing customer project behavior.
- Use non-destructive SQLite migrations and preserve every existing row.
- A rejected duplicate must never be returned merely to fill a five-topic batch.
- Persist every displayed topic, including topics the user does not select.
- Exact duplicates remain blocked permanently; the initial same-thesis cooldown is 90 days.
- A cooled-down thesis is reusable only when at least three of audience, scenario, evidence, and structure materially differ.
- Target one or two sourced hot topics per batch; fall back to evergreen topics when no relevant verified source exists.
- Never invent customer cases, sales figures, loss amounts, rankings, trending claims, policy conclusions, or factory experiences.
- Keep the current 5–8 pure-Chinese short title for downstream compatibility and add a 10–22 character display title.
- Do not build an installer until local API and desktop integration tests pass.

---

## File Structure

### New files

- `electron/repositories/content-history-repository.ts`: SQLite lifecycle records, compact history queries, state transitions, and embedding updates.
- `electron/services/content-generation-orchestrator.ts`: history injection, backend calls, and atomic recording of returned content.
- `backend/app/copywriting/content_identity.py`: shared Pydantic identity, history, hotspot, and reference-style models.
- `backend/app/copywriting/dedup.py`: normalization, n-gram similarity, identity comparison, cosine similarity, and hard decision rules.
- `backend/app/copywriting/hotspots.py`: sourced search request, source parsing, relevance validation, and in-memory TTL cache.
- `backend/app/copywriting/script_review.py`: script fingerprinting, repeated-section checks, and rewrite feedback.
- `tests/electron/content-history-repository.test.ts`: migration and repository behavior.
- `backend/tests/test_content_dedup.py`: deterministic similarity rules.
- `backend/tests/test_hotspots.py`: source validation, caching, and network fallback.
- `backend/tests/test_script_review.py`: script repetition rules.

### Modified files

- `electron/database.ts`: add `content_history` schema and indexes.
- `electron/main.ts`: enrich requests with history, persist displayed topics and generated scripts, expose lifecycle IPC.
- `electron/preload.ts`: validate new topic, history, hotspot, and script response types.
- `electron/repositories/copywriting-project-repository.ts`: expose project-to-history lifecycle events without deleting fingerprints.
- `backend/app/copywriting/bailian.py`: configurable chat options, batch embeddings, and sourced DashScope search.
- `backend/app/copywriting/topic_service.py`: candidate planner, refill loop, diversity selector, and script rewrite loop.
- `backend/app/main.py`: structured error mapping for insufficient novel topics and duplicate scripts.
- `src/renderer/copywriting/copywriting-request.ts`: include `personaId`, history preference, and compact reference styles.
- `src/renderer/copywriting/generate-copywriting-batch.ts`: carry the richer topic object and script metadata.
- `src/renderer/env.d.ts`: expose new renderer API types.
- `src/renderer/views/CopywritingView.vue`: full title, short title, angle, hotspot source, history status, and mode control.
- `src/shared/contracts.ts`: keep saved draft schemas backward compatible.
- Existing API, renderer, preload, project repository, and topic service tests: update contract fixtures and regression coverage.

---

### Task 1: Add the durable content-history store

**Files:**
- Create: `electron/repositories/content-history-repository.ts`
- Modify: `electron/database.ts`
- Test: `tests/electron/content-history-repository.test.ts`

**Interfaces:**
- Produces: `ContentHistoryRepository.recordTopics`, `recordScript`, `markTopic`, `listDigest`, and `setSemanticVector`.
- Produces types: `ContentIdentity`, `HotspotSource`, `ContentHistoryDigest`, and `ContentLifecycleState`.
- Consumes: the existing `better-sqlite3` database instance and ISO timestamps.

- [ ] **Step 1: Write migration and repository tests**

```ts
it("records every shown topic and keeps it after project deletion", () => {
  const database = openTestDatabase();
  const history = new ContentHistoryRepository(database);
  history.recordTopics("persona-1", [topicFixture()], "2026-09-16T00:00:00.000Z");
  database.prepare("DELETE FROM copywriting_projects").run();
  expect(history.listDigest("persona-1", 500)).toHaveLength(1);
  expect(history.listDigest("persona-1", 500)[0].lifecycleState).toBe("shown");
});

it("upserts one normalized topic without duplicating lifecycle rows", () => {
  const history = new ContentHistoryRepository(openTestDatabase());
  history.recordTopics("persona-1", [topicFixture()], NOW);
  history.recordTopics("persona-1", [topicFixture()], NOW);
  expect(history.listDigest("persona-1", 500)).toHaveLength(1);
});
```

- [ ] **Step 2: Run the repository tests and verify the missing table/repository failure**

Run: `npx vitest run tests/electron/content-history-repository.test.ts`

Expected: FAIL because `ContentHistoryRepository` and `content_history` do not exist.

- [ ] **Step 3: Add the non-destructive schema**

```sql
CREATE TABLE IF NOT EXISTS content_history (
  id TEXT PRIMARY KEY,
  persona_id TEXT NOT NULL,
  content_type TEXT NOT NULL CHECK(content_type IN ('topic','script')),
  lifecycle_state TEXT NOT NULL,
  project_id TEXT,
  display_title TEXT NOT NULL DEFAULT '',
  short_title TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  hook TEXT NOT NULL DEFAULT '',
  content_text TEXT NOT NULL DEFAULT '',
  identity_json TEXT NOT NULL DEFAULT '{}',
  structure_type TEXT NOT NULL DEFAULT '',
  hotspot_json TEXT,
  normalized_hash TEXT NOT NULL,
  lexical_signature_json TEXT NOT NULL DEFAULT '{}',
  semantic_vector_json TEXT,
  created_at TEXT NOT NULL,
  last_used_at TEXT NOT NULL,
  UNIQUE(persona_id, content_type, normalized_hash)
);
CREATE INDEX IF NOT EXISTS content_history_persona_idx
  ON content_history(persona_id, content_type, last_used_at DESC);
```

Add the schema through `INITIAL_SCHEMA` so new databases contain it. In the current transactional `applyMigrations` path, inspect `PRAGMA table_info(copywriting_projects)` and run `ALTER TABLE copywriting_projects ADD COLUMN display_title TEXT NOT NULL DEFAULT ''` only when that column is absent. Tests must open a pre-feature fixture and verify every existing project remains readable.

- [ ] **Step 4: Implement the focused repository**

```ts
export class ContentHistoryRepository {
  constructor(private readonly database: Database.Database) {}
  recordTopics(personaId: string, topics: ContentTopic[], now?: string): ContentHistoryDigest[];
  recordScript(personaId: string, topic: ContentTopic, text: string, projectId: string, now?: string): ContentHistoryDigest;
  markTopic(personaId: string, topicId: string, state: ContentLifecycleState, projectId?: string): void;
  listDigest(personaId: string, limit: number): ContentHistoryDigest[];
  setSemanticVector(id: string, vector: number[]): void;
}
```

Use a SQLite UPSERT keyed by `(persona_id, content_type, normalized_hash)` that advances `last_used_at` and never downgrades a lifecycle state.

- [ ] **Step 5: Run migration, repository, and existing database tests**

Run: `npx vitest run tests/electron/content-history-repository.test.ts tests/electron/database.test.ts tests/electron/copywriting-project-repository.test.ts`

Expected: PASS with existing tables and rows intact.

- [ ] **Step 6: Commit the history-store slice**

```powershell
git add electron/database.ts electron/repositories/content-history-repository.ts tests/electron/content-history-repository.test.ts
git commit -m "feat: persist content dedup history"
```

---

### Task 2: Implement deterministic content identities and hard deduplication

**Files:**
- Create: `backend/app/copywriting/content_identity.py`
- Create: `backend/app/copywriting/dedup.py`
- Test: `backend/tests/test_content_dedup.py`

**Interfaces:**
- Produces: `normalize_content`, `lexical_similarity`, `cosine_similarity`, `identity_is_duplicate`, `DedupDecision`, and `ContentDeduplicator.evaluate`.
- Consumes: compact history records serialized by Electron.

- [ ] **Step 1: Write deterministic duplicate tests**

```python
def test_same_thesis_with_synonym_title_is_rejected():
    previous = history("低价袋子的坑", thesis="过度压价导致耐用性下降")
    candidate = topic("便宜袋的真相", thesis="价格压得过低会牺牲耐用程度")
    decision = ContentDeduplicator(now=NOW).evaluate(candidate, [previous])
    assert decision.duplicate is True
    assert decision.reason_code in {"IDENTITY_DUPLICATE", "SEMANTIC_DUPLICATE"}

def test_cooled_thesis_requires_three_changed_dimensions():
    previous = history_at("2026-01-01", audience="采购", scenario="展会", evidence="成本", structure="成本账")
    candidate = topic(audience="设计师", scenario="门店", evidence="测试", structure="现场演示")
    assert ContentDeduplicator(now=NOW).evaluate(candidate, [previous]).duplicate is False
```

- [ ] **Step 2: Run tests and verify missing modules fail**

Run: `python -m pytest backend/tests/test_content_dedup.py -q`

Expected: FAIL with import errors for the new modules.

- [ ] **Step 3: Define structured models**

```python
class ContentIdentity(BaseModel):
    audience: str
    scenario: str
    problem: str
    thesis: str
    evidence_type: str = Field(alias="evidenceType")
    angle: str
    structure_type: str = Field(alias="structureType")
    hook_type: str = Field(alias="hookType")
    viewer_gain: str = Field(alias="viewerGain")
    hotspot_id: str | None = Field(default=None, alias="hotspotId")

class DedupDecision(BaseModel):
    duplicate: bool
    reason_code: str
    matched_history_id: str | None = None
    score: float = 0.0
```

- [ ] **Step 4: Implement normalization and hard decisions**

Normalize Unicode, lowercase Latin text, remove punctuation and spacing, normalize Arabic and Chinese numeric forms, and strip only an explicit short list of discourse fillers. Compute character 2-gram and 3-gram Jaccard scores. Enforce permanent exact hash rejection, 90-day thesis rejection, and the three-of-four cooled-thesis rule before any model call.

```python
def identity_is_duplicate(candidate, previous, now, cooldown_days=90):
    thesis_match = lexical_similarity(candidate.thesis, previous.thesis) >= THESIS_HARD
    if thesis_match and (now - previous.last_used_at).days < cooldown_days:
        return True
    changed = sum([
        candidate.audience != previous.audience,
        candidate.scenario != previous.scenario,
        candidate.evidence_type != previous.evidence_type,
        candidate.structure_type != previous.structure_type,
    ])
    return thesis_match and changed < 3
```

- [ ] **Step 5: Run deterministic dedup tests**

Run: `python -m pytest backend/tests/test_content_dedup.py -q`

Expected: PASS for exact, near-text, recent-thesis, cooled-thesis, and distinct-topic fixtures.

- [ ] **Step 6: Commit deterministic deduplication**

```powershell
git add backend/app/copywriting/content_identity.py backend/app/copywriting/dedup.py backend/tests/test_content_dedup.py
git commit -m "feat: add deterministic content deduplication"
```

---

### Task 3: Add batch embeddings and sourced hot-topic retrieval

**Files:**
- Modify: `backend/app/copywriting/bailian.py`
- Create: `backend/app/copywriting/hotspots.py`
- Test: `backend/tests/test_bailian.py`
- Test: `backend/tests/test_hotspots.py`

**Interfaces:**
- Produces: `BailianChat.embed(api_key, texts, model="text-embedding-v3", dimensions=256) -> list[list[float]]`.
- Produces: `BailianChat.search(api_key, model, prompt) -> SearchResponse` with sources.
- Produces: `HotspotProvider.get(api_key, model, industry, now, mode) -> list[HotspotSource]`.
- Consumes: existing Bailian API key and `httpx` transport.

- [ ] **Step 1: Write transport and cache tests with mocked HTTP**

```python
def test_embed_batches_texts_and_preserves_order(httpx_mock):
    httpx_mock.add_response(json={"data": [{"index": 0, "embedding": [1.0, 0.0]}, {"index": 1, "embedding": [0.0, 1.0]}]})
    assert BailianChat().embed(api_key="secret", texts=["甲", "乙"], dimensions=2) == [[1.0, 0.0], [0.0, 1.0]]

def test_hotspot_provider_rejects_missing_source_and_reuses_cache():
    chat = SearchFixture([sourced_result(), unsourced_result()])
    provider = HotspotProvider(chat, ttl_seconds=3600)
    first = provider.get(api_key="secret", model="qwen-plus", industry="帆布袋", now=NOW, mode="balanced")
    second = provider.get(api_key="secret", model="qwen-plus", industry="帆布袋", now=NOW, mode="balanced")
    assert len(first) == 1 and second == first and chat.calls == 1
```

- [ ] **Step 2: Run tests and verify missing methods fail**

Run: `python -m pytest backend/tests/test_bailian.py backend/tests/test_hotspots.py -q`

Expected: FAIL because embedding, sourced search, and the provider do not exist.

- [ ] **Step 3: Implement embedding with safe fallback errors**

POST batches of no more than ten normalized texts to `/embeddings`, request `text-embedding-v3` with 256 dimensions, validate finite equal-length vectors, and raise `BailianAPIError(code="BAILIAN_EMBEDDING_UNAVAILABLE")` on unsupported models or malformed data. Callers catch this error and continue with deterministic deduplication.

- [ ] **Step 4: Implement sourced search and TTL cache**

Use the DashScope generation endpoint for the hotspot-only path with `enable_search=true`, `forced_search=true`, `enable_source=true`, a dynamic current date, and a strict JSON result. Accept only `https` source URLs, explicit publication dates, non-empty summaries, and candidates whose relevance reason names a concrete connection to the persona industry.

The public method is `HotspotProvider.get(*, api_key: str, model: str, industry: str, now: datetime, mode: Literal["off", "balanced", "priority"]) -> list[HotspotSource]`. It returns an empty list for `off` and recoverable network failures, and validated `HotspotSource` values for successful searches.

Strip HTML, cap every external field, and delimit source material as untrusted quoted data in later prompts.

- [ ] **Step 5: Run transport and hotspot tests**

Run: `python -m pytest backend/tests/test_bailian.py backend/tests/test_hotspots.py -q`

Expected: PASS for valid sources, bad URLs, missing dates, timeout fallback, and cache reuse.

- [ ] **Step 6: Commit external enrichment clients**

```powershell
git add backend/app/copywriting/bailian.py backend/app/copywriting/hotspots.py backend/tests/test_bailian.py backend/tests/test_hotspots.py
git commit -m "feat: add semantic and hotspot enrichment"
```

---

### Task 4: Replace single-pass topic generation with a refill planner

**Files:**
- Modify: `backend/app/copywriting/topic_service.py`
- Modify: `backend/app/main.py`
- Test: `backend/tests/test_topics.py`
- Test: `backend/tests/test_api.py`

**Interfaces:**
- Consumes: `ContentHistoryDigest`, `HotspotSource`, `ContentDeduplicator`, and `BailianChat.embed`.
- Produces: `TopicGenerationRequest` with `personaId`, `history`, and `hotspotMode`.
- Produces: `TopicResult(topics, historyChecked, hotspotStatus)` and error code `NOVEL_TOPICS_EXHAUSTED`.

- [ ] **Step 1: Write planner and API failure tests**

```python
def test_planner_refills_only_missing_dimensions():
    chat = FixtureChat([batch_with_three_duplicates(), batch_with_two_new_topics()])
    result = TopicService(chat).generate_topics(api_key="secret", request=request_with_history())
    assert len(result.topics) == 5
    assert len(chat.calls) == 2
    assert "只补充" in chat.calls[1][1]

def test_planner_never_returns_duplicates_after_three_attempts(client):
    response = client.post("/copywriting/topics", json=repeating_request(), headers=authorized_headers())
    assert response.status_code == 409
    assert response.json()["detail"]["code"] == "NOVEL_TOPICS_EXHAUSTED"
```

- [ ] **Step 2: Run planner tests and verify contract failures**

Run: `python -m pytest backend/tests/test_topics.py backend/tests/test_api.py -q`

Expected: FAIL because the current service accepts exactly five unstructured candidates and returns no structured error.

- [ ] **Step 3: Extend the candidate schema**

```python
class TopicCandidate(BaseModel):
    id: str
    display_title: str = Field(alias="displayTitle", min_length=10, max_length=22)
    short_title: str = Field(alias="shortTitle", min_length=5, max_length=8, pattern=r"^[\u3400-\u9fff]+$")
    description: str = Field(min_length=20, max_length=160)
    hook: str = Field(min_length=4, max_length=120)
    identity: ContentIdentity
    hotspot: HotspotSource | None = None
    semantic_vector: list[float] | None = Field(default=None, alias="semanticVector")
```

- [ ] **Step 4: Implement planning, filtering, diversity selection, and refill**

Generate 12–15 candidates on the first attempt, remove the existing low-price example, and include recently underused content dimensions in the prompt. Run hard checks first, optional embeddings second, and model adjudication only for gray-zone pairs. Select five using novelty, factual support, relevance, and pairwise diversity scores. On refill, send only accepted identities and missing dimensions; stop after three total generation calls.

- [ ] **Step 5: Map domain errors to stable API responses**

```python
except NovelTopicsExhausted as error:
    raise HTTPException(status_code=409, detail={
        "code": "NOVEL_TOPICS_EXHAUSTED",
        "message": "当前资料下暂时无法生成五个不重复的新选题，请补充品牌事实或稍后重试",
    }) from error
```

- [ ] **Step 6: Run topic and API tests**

Run: `python -m pytest backend/tests/test_topics.py backend/tests/test_api.py -q`

Expected: PASS for twelve-candidate planning, history rejection, refill, diversity, and explicit exhaustion.

- [ ] **Step 7: Commit the topic planner**

```powershell
git add backend/app/copywriting/topic_service.py backend/app/main.py backend/tests/test_topics.py backend/tests/test_api.py
git commit -m "feat: generate history-aware diverse topics"
```

---

### Task 5: Add script structure rotation and post-generation duplicate review

**Files:**
- Create: `backend/app/copywriting/script_review.py`
- Modify: `backend/app/copywriting/topic_service.py`
- Test: `backend/tests/test_script_review.py`
- Test: `backend/tests/test_topics.py`

**Interfaces:**
- Produces: `ScriptReviewResult(accepted, reasonCodes, rewriteInstruction, signature)`.
- Changes `CopywritingGenerationRequest` to consume a complete `topic`, `history`, and `recentStructures` instead of one concatenated topic string.
- Produces `CopywritingResult(text, structureType, hookType, semanticVector)`.

- [ ] **Step 1: Write script review and rewrite-loop tests**

```python
def test_repeated_opening_and_argument_order_are_rejected():
    review = ScriptReviewer().review(candidate_script(), [history_with_same_opening_and_order()])
    assert review.accepted is False
    assert "OPENING_DUPLICATE" in review.reason_codes

def test_generation_switches_structure_on_retry():
    chat = FixtureChat([duplicate_script_json(), distinct_script_json()])
    result = TopicService(chat).generate_copywriting(api_key="secret", request=script_request())
    assert result.structure_type == "现场演示"
    assert "改用不同结构" in chat.calls[1][1]
```

- [ ] **Step 2: Run script tests and verify they fail**

Run: `python -m pytest backend/tests/test_script_review.py backend/tests/test_topics.py -q`

Expected: FAIL because the existing result only validates length and banned words.

- [ ] **Step 3: Implement fingerprints and review decisions**

Compute separate signatures for the first three lines, ordered argument beats, repeated 6-character shingles, examples, and CTA. Reject a repeated opening or near-identical argument sequence. Return targeted rewrite instructions when only one section repeats; require a different structure when multiple sections repeat.

- [ ] **Step 4: Implement the structure contract and retry loop**

Choose the least-used compatible structure from the twelve-type pool. The JSON response includes `text`, `structureType`, `hookType`, and `argumentBeats`. Validate that claims are grounded in `brandFacts` or the selected hotspot. Retry at most three times; raise `DuplicateScriptExhausted` instead of returning the repeated draft.

- [ ] **Step 5: Run script and topic tests**

Run: `python -m pytest backend/tests/test_script_review.py backend/tests/test_topics.py -q`

Expected: PASS for opening, structure, shingle, example, CTA, factual grounding, targeted rewrite, and terminal failure cases.

- [ ] **Step 6: Commit script diversity enforcement**

```powershell
git add backend/app/copywriting/script_review.py backend/app/copywriting/topic_service.py backend/tests/test_script_review.py backend/tests/test_topics.py
git commit -m "feat: enforce diverse copywriting structures"
```

---

### Task 6: Orchestrate history through Electron IPC

**Files:**
- Create: `electron/services/content-generation-orchestrator.ts`
- Modify: `electron/main.ts`
- Modify: `electron/preload.ts`
- Modify: `electron/repositories/copywriting-project-repository.ts`
- Test: `tests/electron/preload-bundle.test.ts`
- Test: `tests/electron/copywriting-project-repository.test.ts`
- Create: `tests/electron/content-generation-orchestrator.test.ts`

**Interfaces:**
- Consumes: `ContentHistoryRepository` and the richer Python API contracts.
- Produces renderer IPC: `generateTopics(input)`, `generateCopywriting(input)`, and `markContentHistory(input)`.

- [ ] **Step 1: Write orchestration tests**

```ts
it("injects persona history and atomically records every returned topic", async () => {
  const result = await orchestrator.generateTopics(topicInput(), backendFixture(fiveTopics()));
  expect(result.topics).toHaveLength(5);
  expect(history.listDigest("persona-1", 500)).toHaveLength(5);
  expect(backendFixture.lastPayload.history).toEqual(expect.any(Array));
});

it("records the accepted script without tying its lifetime to project deletion", async () => {
  const result = await orchestrator.generateCopywriting(scriptInput(), backendFixture(scriptResult()));
  expect(history.listDigest("persona-1", 500).some(item => item.contentType === "script")).toBe(true);
});
```

- [ ] **Step 2: Run Electron tests and verify missing orchestration fails**

Run: `npx vitest run tests/electron/content-generation-orchestrator.test.ts tests/electron/preload-bundle.test.ts`

Expected: FAIL because IPC currently forwards payloads without history or persistence.

- [ ] **Step 3: Extract a testable content-generation orchestrator**

The orchestrator reads up to 500 compact records for the selected persona, calls the backend, and wraps recording five displayed topics in one database transaction. For script generation it marks the topic `selected`, calls the backend, creates or updates the project through the existing flow, then records the accepted script. Extend `CopywritingProject` mapping and create input with `displayTitle`; old rows whose value is empty fall back to `mainTitle`.

- [ ] **Step 4: Update IPC validation and lifecycle transitions**

```ts
const topicSchema = z.object({
  id: z.string().min(1), displayTitle: z.string().min(10).max(22),
  shortTitle: z.string().regex(/^[\u3400-\u9fff]{5,8}$/),
  description: z.string().min(20).max(160), hook: z.string().min(4),
  identity: contentIdentitySchema, hotspot: hotspotSourceSchema.nullable(),
  semanticVector: z.array(z.number().finite()).nullable()
});
```

Keep `licensedHandle` on both generation endpoints. Do not expose database paths or raw SQL to the renderer.

- [ ] **Step 5: Run Electron repository and orchestration tests**

Run: `npx vitest run tests/electron/content-history-repository.test.ts tests/electron/content-generation-orchestrator.test.ts tests/electron/copywriting-project-repository.test.ts tests/electron/preload-bundle.test.ts`

Expected: PASS, including deletion retention and license-gated IPC regression.

- [ ] **Step 6: Commit Electron orchestration**

```powershell
git add electron/main.ts electron/preload.ts electron/repositories/copywriting-project-repository.ts electron/services/content-generation-orchestrator.ts tests/electron
git commit -m "feat: connect content history to generation IPC"
```

---

### Task 7: Update shared contracts and the copywriting workspace

**Files:**
- Modify: `src/renderer/env.d.ts`
- Modify: `src/shared/contracts.ts`
- Modify: `src/renderer/copywriting/copywriting-request.ts`
- Modify: `src/renderer/copywriting/generate-copywriting-batch.ts`
- Modify: `src/renderer/views/CopywritingView.vue`
- Test: `tests/renderer/copywriting-request.test.ts`
- Test: `tests/renderer/generate-copywriting-batch.test.ts`
- Test: `tests/renderer/copywriting-view.test.ts`
- Test: `tests/renderer/creation-draft.test.ts`

**Interfaces:**
- Consumes: richer topic and script IPC results from Task 6.
- Produces: `CopywritingTopic`, `HotspotMode`, `HotspotSource`, and backward-compatible saved draft data.

- [ ] **Step 1: Write renderer behavior tests**

```ts
it("shows full title, short title, angle and sourced hotspot", async () => {
  const wrapper = mountCopywritingView({ topics: [hotTopicFixture()] });
  await wrapper.get('[data-action="generate-topics"]').trigger("click");
  expect(wrapper.text()).toContain(hotTopicFixture().displayTitle);
  expect(wrapper.text()).toContain(hotTopicFixture().shortTitle);
  expect(wrapper.get('[data-testid="hotspot-source"]').attributes("href")).toBe(hotTopicFixture().hotspot.url);
});

it("reports checked history and exposes evergreen fallback", async () => {
  const wrapper = mountCopywritingView({ hotspotStatus: "unavailable", historyChecked: 126 });
  expect(wrapper.text()).toContain("已避开本地历史 126 条内容");
  expect(wrapper.text()).toContain("本次热点不可用");
});
```

- [ ] **Step 2: Run renderer tests and verify contract failures**

Run: `npx vitest run tests/renderer/copywriting-request.test.ts tests/renderer/generate-copywriting-batch.test.ts tests/renderer/copywriting-view.test.ts tests/renderer/creation-draft.test.ts`

Expected: FAIL because the current topic only has `shortTitle`, `description`, and `hook`.

- [ ] **Step 3: Extend renderer and draft types**

Add `personaId` and `hotspotMode` to generated requests. Preserve parsing of version-1 drafts by making new topic fields optional in saved drafts and normalizing them on load:

```ts
displayTitle: z.string().min(1).max(22).optional(),
identity: contentIdentitySchema.optional(),
hotspot: hotspotSourceSchema.nullable().optional()
```

- [ ] **Step 4: Update the workspace UI**

Add `常规`, `综合`, and `热点优先` controls mapped to `off`, `balanced`, and `priority`; default to `综合` so hot content is attempted but never forced. Render source links with `target="_blank"` only through the app's safe external-link handler. Display the full title as the primary line and retain the short title in the editable project title field.

- [ ] **Step 5: Update script generation to pass the complete topic**

Stop concatenating title, description, and hook into one string. Send the structured topic, recent history supplied by Electron, and structural reference summaries. Preserve sequential batch generation and per-item failure saving.

- [ ] **Step 6: Run renderer tests and type checking**

Run: `npx vitest run tests/renderer/copywriting-request.test.ts tests/renderer/generate-copywriting-batch.test.ts tests/renderer/copywriting-view.test.ts tests/renderer/creation-draft.test.ts`

Run: `npm run typecheck`

Expected: all selected tests and both TypeScript projects PASS.

- [ ] **Step 7: Commit the workspace integration**

```powershell
git add src/renderer/env.d.ts src/shared/contracts.ts src/renderer/copywriting src/renderer/views/CopywritingView.vue tests/renderer
git commit -m "feat: show diverse topics and sourced trends"
```

---

### Task 8: Add end-to-end regression fixtures and verify the complete source build

**Files:**
- Modify: `backend/tests/test_topics.py`
- Modify: `backend/tests/test_api.py`
- Modify: `tests/renderer/copywriting-view.test.ts`
- Modify: `tests/electron/content-generation-orchestrator.test.ts`
- Create: `docs/content-dedup-verification.md`

**Interfaces:**
- Consumes all production interfaces from Tasks 1–7.
- Produces a repeatable verification record; no installer is produced in this task.

- [ ] **Step 1: Add a deterministic 20-batch simulation**

```python
def test_twenty_batches_never_emit_exact_title_or_hook_duplicates():
    history = []
    emitted = []
    for _ in range(20):
        result = service.generate_topics(api_key="secret", request=request(history=history))
        emitted.extend(result.topics)
        history.extend(as_history(result.topics))
    assert len(emitted) == 100
    assert len({normalize_content(item.display_title) for item in emitted}) == 100
    assert len({normalize_content(item.hook) for item in emitted}) == 100
```

- [ ] **Step 2: Add factual and failure-path regressions**

Cover unsourced hot claims, prompt injection inside a source page, embedding timeout, search timeout, invalid source date, duplicate scripts after three attempts, and upgrade from a pre-feature database fixture.

- [ ] **Step 3: Run the focused feature suites**

Run: `python -m pytest backend/tests/test_content_dedup.py backend/tests/test_hotspots.py backend/tests/test_script_review.py backend/tests/test_topics.py backend/tests/test_api.py -q`

Run: `npx vitest run tests/electron/content-history-repository.test.ts tests/electron/content-generation-orchestrator.test.ts tests/renderer/copywriting-view.test.ts`

Expected: all feature tests PASS.

- [ ] **Step 4: Run the complete project verification**

Run: `npm run check`

Expected: typecheck, all Vitest tests, all pytest tests, and the Electron/Vue production build PASS.

- [ ] **Step 5: Perform a local API smoke test with fixtures**

Start the normal development runtime, generate three batches with hotspot mode balanced, generate at least five scripts across different structures, and verify the SQLite history count advances for shown and generated content. Use mocked sourced search if a real API key is intentionally unavailable during automated execution.

- [ ] **Step 6: Record evidence without secrets**

Write `docs/content-dedup-verification.md` with command exit codes, test counts, build result, sample duplicate rejections, hotspot fallback result, and confirmation that no API key, database file, or user content was committed.

- [ ] **Step 7: Run a secret and artifact status check**

Run: `git status --short`

Run: `git diff --check`

Run: `rg -n "sk-[A-Za-z0-9_-]{16,}|DATABASE_URL=|PRIVATE_KEY|BEGIN .*PRIVATE KEY" --glob '!node_modules/**' --glob '!release/**' --glob '!output/**'`

Expected: no real credential match and no build artifact staged.

- [ ] **Step 8: Commit verification evidence**

```powershell
git add backend/tests tests docs/content-dedup-verification.md
git commit -m "test: verify content novelty pipeline"
```

---

### Task 9: Review the completed branch before any installer decision

**Files:**
- Review: every file changed since commit `57cee1a`
- Modify only files with issues discovered by review.

**Interfaces:**
- Consumes the completed feature and verification evidence.
- Produces a clean, reviewed source branch suitable for user acceptance testing.

- [ ] **Step 1: Review the branch diff against the approved spec**

Run: `git diff --stat 57cee1a..HEAD`

Run: `git diff --check 57cee1a..HEAD`

Verify every spec section maps to tested production behavior and that no licensing, publishing, mixing, or platform adapter file changed without a direct integration requirement.

- [ ] **Step 2: Run targeted fixes through failing tests**

For each review issue, add or tighten the smallest reproducing test, run it to see the failure, patch the implementation, and rerun its focused suite.

- [ ] **Step 3: Run final source verification**

Run: `npm run check`

Expected: every check PASS from a clean process.

- [ ] **Step 4: Commit review fixes if any exist**

```powershell
git add backend electron src tests docs/content-dedup-verification.md
git commit -m "fix: address content novelty review"
```

- [ ] **Step 5: Report readiness and wait for the installer decision**

Report commits, changed modules, test totals, source build result, known limits, and whether a real network hotspot smoke test was run. Do not increment the Build ID or package a Windows installer until the user accepts the local behavior.
