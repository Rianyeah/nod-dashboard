# Data Sync Cancellation and Status Recovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make data-sync status recover promptly, allow authorized users to cancel a real N8N execution, and place the sync control last at the right edge of all three supported page headers.

**Architecture:** FastAPI and Postgres remain authoritative for shared job state. N8N records its execution ID during claim; a new browser cancel endpoint authorizes the creator or sysadmin, calls a bounded server-side N8N execution client, and persists `canceled` only after a confirmed stop or a safe pre-claim cancellation. React reconciles ambiguous start failures with server status, presents cancellation through an accessible confirmation dialog, and keeps all other page interactions non-blocking.

**Tech Stack:** Python 3, FastAPI, Pydantic, SQLAlchemy async, PostgreSQL, httpx, React 19, Axios, Radix/shadcn UI, Node test runner, ESLint, Vite.

**Spec:** `docs/superpowers/specs/2026-09-09-data-sync-cancel-status-ux-design.md`

## Global Constraints

- `DATA_SYNC_DISPATCH_TIMEOUT_SECONDS=60`; accepted range is 15 through 300 seconds.
- `DATA_SYNC_JOB_TIMEOUT_SECONDS=1800` remains the running/ambiguous execution timeout.
- Production N8N must be version 1.99.1 or newer before cancellation is enabled.
- Only the job creator and `sysadmin` may cancel; every authenticated viewer may still start or observe sync.
- The browser never receives an N8N URL, API key, callback token, or execution ID.
- A canceled attempt participates in the existing 60-second dataset cooldown and does not consume a second hourly start slot.
- The existing maximum is ten newly created jobs per user in a rolling hour.
- No Neon branch is created or queried during verification.
- Every implementation task follows red-green-refactor and preserves same-origin protection.

---

### Task 1: Configuration, Schema, and Public Contracts

**Files:**
- Modify: `backend/config.py`
- Modify: `backend/.env.example`
- Modify: `backend/sql/data_sync_jobs.sql`
- Modify: `backend/models/data_sync.py`
- Test: `backend/tests/test_data_sync_config.py`
- Test: `backend/tests/test_data_sync_schema.py`
- Create: `backend/tests/test_data_sync_models.py`

**Interfaces:**
- Produces: `DataSyncSettings.dispatch_timeout_seconds: int`
- Produces: `DataSyncSettings.execution_api_key: str`
- Produces: `DataSyncStatus.CANCELED`, `DataSyncClaimRequest(execution_id: str)`
- Produces: `DataSyncPublicJob.can_cancel: bool`
- Produces: `DataSyncCancelResponse(canceled: bool, job: DataSyncPublicJob)`
- Produces: result codes `dispatch_timed_out`, `workflow_timed_out`, and `canceled`

- [ ] **Step 1: Write failing configuration and model tests**

Add tests proving the default dispatch timeout is 60, values below 15 or above
300 fail, enabled sync requires a strong `N8N_EXECUTION_API_KEY`, that key must
be distinct from all other configured N8N keys, execution IDs reject empty or
overlong input, `canceled` is terminal, and public rows can set `can_cancel`
without exposing requester/execution fields.

```python
def test_data_sync_dispatch_timeout_defaults_to_60():
    settings = SecuritySettings.from_env(enabled_sync_env())
    assert settings.data_sync.dispatch_timeout_seconds == 60

@pytest.mark.parametrize("value", ["14", "301", "invalid"])
def test_data_sync_dispatch_timeout_is_bounded(value):
    with pytest.raises(SecurityConfigurationError):
        SecuritySettings.from_env(
            enabled_sync_env(DATA_SYNC_DISPATCH_TIMEOUT_SECONDS=value)
        )

def test_claim_requires_bounded_execution_id():
    assert DataSyncClaimRequest(execution_id=" 12345 ").execution_id == "12345"
    with pytest.raises(ValidationError):
        DataSyncClaimRequest(execution_id="")
```

- [ ] **Step 2: Run the targeted tests and confirm RED**

Run: `python -m pytest backend/tests/test_data_sync_config.py backend/tests/test_data_sync_schema.py backend/tests/test_data_sync_models.py -q`

Expected: failures for missing fields, enums, messages, and DDL.

- [ ] **Step 3: Implement configuration, models, and idempotent DDL**

Extend the frozen settings dataclass and conditional environment parsing. Keep
new secrets empty when the feature is disabled. Add the new columns through
`ALTER TABLE ... ADD COLUMN IF NOT EXISTS`, replace named check constraints
idempotently, and preserve the existing legacy `timed_out` result code.

```python
class DataSyncClaimRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    execution_id: str = Field(min_length=1, max_length=128)

    @field_validator("execution_id")
    @classmethod
    def normalize_execution_id(cls, value: str) -> str:
        normalized = value.strip()
        if not normalized:
            raise ValueError("execution_id must not be blank")
        return normalized
```

Map public messages exactly as specified, including row-count formatting later
in the frontend. Update `public_job_from_row` to accept an actor and compute
`can_cancel` only for active jobs owned by that actor or a sysadmin.

- [ ] **Step 4: Run targeted tests and confirm GREEN**

Run: `python -m pytest backend/tests/test_data_sync_config.py backend/tests/test_data_sync_schema.py backend/tests/test_data_sync_models.py -q`

Expected: all selected tests pass.

- [ ] **Step 5: Commit the contract layer**

```text
git add backend/config.py backend/.env.example backend/sql/data_sync_jobs.sql backend/models/data_sync.py backend/tests/test_data_sync_config.py backend/tests/test_data_sync_schema.py backend/tests/test_data_sync_models.py
git commit -m "feat: extend data sync cancellation contracts"
```

### Task 2: Split Expiration and Durable Cancellation Transitions

**Files:**
- Modify: `backend/data_sync_repository.py`
- Test: `backend/tests/test_data_sync_repository.py`

**Interfaces:**
- Consumes: active/terminal status constants and schema fields from Task 1
- Produces: `expire_stale_jobs(session, now, dispatch_timeout_seconds, job_timeout_seconds) -> int`
- Produces: `claim_job(..., execution_id: str, now: datetime) -> ClaimResult`
- Produces: `get_job_for_cancel(...)`, `cancel_unclaimed_job(...)`, and `publish_cancellation(...)`

- [ ] **Step 1: Write repository tests for split deadlines and races**

Cover dispatching at 59/60 seconds, running and dispatch-unknown at
1799/1800 seconds, their distinct result codes, execution ID persistence,
duplicate/terminal claims, pre-claim cancellation, confirmed cancellation,
and a callback that wins before cancellation is published.

```python
await expire_stale_jobs(
    session,
    now=NOW,
    dispatch_timeout_seconds=60,
    job_timeout_seconds=1800,
)
assert dispatching_row["result_code"] == "dispatch_timed_out"
assert running_row["result_code"] == "workflow_timed_out"
```

- [ ] **Step 2: Run repository tests and confirm RED**

Run: `python -m pytest backend/tests/test_data_sync_repository.py -q`

Expected: failures for the new signatures and state transitions.

- [ ] **Step 3: Implement parameterized expiration and locked transitions**

Use one update statement with status-dependent cutoffs and result codes. Include
`canceled` in every terminal guard. Claim stores `n8n_execution_id` in the same
locked transition that sets `claimed_at`. Cancellation helpers must always lock
by job ID and verify dataset/ownership in the service before changing state.

```sql
WHERE (status = 'dispatching' AND started_at <= :dispatch_expires_before)
   OR (status IN ('running', 'dispatch_unknown')
       AND started_at <= :job_expires_before)
```

`publish_cancellation` updates only active states and sets `status`,
`result_code`, `finished_at`, `canceled_at`, `canceled_by_user_id`, and
`updated_at` together.

- [ ] **Step 4: Run repository tests and confirm GREEN**

Run: `python -m pytest backend/tests/test_data_sync_repository.py -q`

Expected: all selected tests pass.

- [ ] **Step 5: Commit repository behavior**

```text
git add backend/data_sync_repository.py backend/tests/test_data_sync_repository.py
git commit -m "feat: add durable data sync cancellation transitions"
```

### Task 3: N8N Stop Client, Service Authorization, and Routes

**Files:**
- Create: `backend/services/data_sync_cancel.py`
- Modify: `backend/services/data_sync.py`
- Modify: `backend/routers/data_sync.py`
- Modify: `backend/routers/n8n_data_sync.py`
- Modify: `backend/main.py`
- Test: `backend/tests/test_data_sync_cancel.py`
- Test: `backend/tests/test_data_sync_service.py`
- Test: `backend/tests/test_data_sync_routes.py`
- Test: `backend/tests/test_n8n_data_sync.py`

**Interfaces:**
- Consumes: `DataSyncClaimRequest`, repository cancellation helpers, and N8N settings
- Produces: `stop_n8n_execution(settings, execution_id, transport=None) -> StopResult`
- Produces: `DataSyncService.cancel(dataset, job_id, actor) -> DataSyncCancelResponse`
- Produces: `POST /api/v1/data-sync/{dataset}/{job_id}/cancel`

- [ ] **Step 1: Write failing stop-client tests**

Test the exact URL-encoded execution endpoint, `X-N8N-API-KEY`, redirects off,
bounded timeout, confirmed stop, already-stopped reconciliation, 4xx, 5xx,
malformed/oversized responses, timeout, and transport error. Assert secrets and
raw response bodies never appear in result objects or exception strings.

```python
assert request.url.path == "/api/v1/executions/12345/stop"
assert request.headers["X-N8N-API-KEY"] == settings.execution_api_key
assert result.confirmed is True
```

- [ ] **Step 2: Run stop-client tests and confirm RED**

Run: `python -m pytest backend/tests/test_data_sync_cancel.py -q`

Expected: module/function missing.

- [ ] **Step 3: Implement the isolated N8N cancellation client**

Return a bounded enum/result such as `STOPPED`, `ALREADY_STOPPED`,
`REJECTED`, or `UNKNOWN`; never return the raw payload. Use the same base-origin
validation already performed at startup and `urllib.parse.quote(..., safe="")`.

- [ ] **Step 4: Write failing service and route tests**

Cover creator success, sysadmin success, unrelated viewer/data_admin `403`,
dataset/job mismatch, terminal idempotency, cancel before claim, confirmed stop,
failed/unknown stop leaving the row active, callback race preservation,
same-origin enforcement, claim body validation, and execution ID not appearing
in browser responses.

```python
response = authenticated_client.post(
    f"/api/v1/data-sync/impact_service/{job_id}/cancel",
    headers={"Origin": ORIGIN},
)
assert response.status_code == 200
assert response.json()["job"]["status"] == "canceled"
assert "n8n_execution_id" not in response.text
```

- [ ] **Step 5: Run service and route tests and confirm RED**

Run: `python -m pytest backend/tests/test_data_sync_service.py backend/tests/test_data_sync_routes.py backend/tests/test_n8n_data_sync.py -q`

Expected: missing cancel route and old claim signature failures.

- [ ] **Step 6: Implement service orchestration and HTTP mappings**

Pass the current actor into every public model conversion. Call split expiration
before each operation. Map authorization to `403`, missing/mismatched jobs to
`404`, stop rejection/unknown to safe `502`/`504`, and terminal conflicts to
`409`. Inject the stop client when constructing `DataSyncService` so tests never
call N8N.

- [ ] **Step 7: Run all Task 3 tests and confirm GREEN**

Run: `python -m pytest backend/tests/test_data_sync_cancel.py backend/tests/test_data_sync_service.py backend/tests/test_data_sync_routes.py backend/tests/test_n8n_data_sync.py -q`

Expected: all selected tests pass.

- [ ] **Step 8: Commit backend cancellation**

```text
git add backend/services/data_sync_cancel.py backend/services/data_sync.py backend/routers/data_sync.py backend/routers/n8n_data_sync.py backend/main.py backend/tests/test_data_sync_cancel.py backend/tests/test_data_sync_service.py backend/tests/test_data_sync_routes.py backend/tests/test_n8n_data_sync.py
git commit -m "feat: cancel active n8n data sync executions"
```

### Task 4: Frontend API, Reconciliation, and Messages

**Files:**
- Modify: `frontend/src/services/api.js`
- Modify: `frontend/src/features/data-sync/dataSyncState.js`
- Modify: `frontend/src/features/data-sync/DataSyncProvider.jsx`
- Modify: `frontend/src/features/data-sync/DataSyncNotifications.jsx`
- Test: `frontend/src/__tests__/dataSyncContracts.test.js`
- Test: `frontend/src/__tests__/dataSyncState.test.js`
- Create: `frontend/src/__tests__/dataSyncProvider.test.js`

**Interfaces:**
- Produces: `cancelDataSync(dataset, jobId)`
- Produces: provider hook fields `canCancel`, `cancel`, `cancelPending`, `cancelError`
- Produces: `formatRetryAfter`, `formatCompletedMessage`, and canceled presentation

- [ ] **Step 1: Write failing API and pure-state tests**

Assert the exact encoded cancel route, 15-second bounded request, `canceled` as
terminal, five-second `Canceled` presentation, `Starting 00:00`, safe result
messages, Indonesian row formatting, and dynamic retry durations.

```javascript
assert.equal(
  requestConfig.url,
  `/data-sync/${encodeURIComponent(dataset)}/${encodeURIComponent(jobId)}/cancel`,
);
assert.equal(formatCompletedMessage(1250), 'Sinkronisasi selesai. 1.250 baris diproses.');
```

- [ ] **Step 2: Run frontend state/API tests and confirm RED**

Run: `node --test frontend/src/__tests__/dataSyncContracts.test.js frontend/src/__tests__/dataSyncState.test.js`

Expected: missing API and canceled/retry presentation failures.

- [ ] **Step 3: Implement API and pure state changes**

Add the cancel request without changing the global Axios timeout. Treat canceled
as terminal, keep the existing server-time elapsed calculation, and derive
labels/messages through pure functions so they remain independently testable.

- [ ] **Step 4: Write failing provider reconciliation tests**

Test that a rejected/timed-out start fetches status first and emits no failure
when the refreshed dataset is active. Test the failure path when no active job
exists, unauthorized behavior, cancel pending isolation, successful cancel,
failed cancel returning to active UI, and polling continuation.

- [ ] **Step 5: Run provider tests and confirm RED**

Run: `node --test frontend/src/__tests__/dataSyncProvider.test.js`

Expected: provider lacks reconciliation and cancel actions.

- [ ] **Step 6: Implement provider cancellation and start reconciliation**

In the start catch block, await status before dispatching a notification. Apply
the status payload first; only add a start failure when the refreshed job is not
active or status could not be fetched. Keep independent `startPending` and
`cancelPending` records. A cancel failure notification uses the approved safe
message and leaves the authoritative job active.

- [ ] **Step 7: Run Task 4 tests and confirm GREEN**

Run: `node --test frontend/src/__tests__/dataSyncContracts.test.js frontend/src/__tests__/dataSyncState.test.js frontend/src/__tests__/dataSyncProvider.test.js`

Expected: all selected tests pass.

- [ ] **Step 8: Commit frontend state behavior**

```text
git add frontend/src/services/api.js frontend/src/features/data-sync/dataSyncState.js frontend/src/features/data-sync/DataSyncProvider.jsx frontend/src/features/data-sync/DataSyncNotifications.jsx frontend/src/__tests__/dataSyncContracts.test.js frontend/src/__tests__/dataSyncState.test.js frontend/src/__tests__/dataSyncProvider.test.js
git commit -m "fix: reconcile data sync status and cancellation state"
```

### Task 5: Accessible Cancel Dialog, Button, and Header Layout

**Files:**
- Create: `frontend/src/features/data-sync/DataSyncCancelDialog.jsx`
- Modify: `frontend/src/features/data-sync/DataSyncButton.jsx`
- Modify: `frontend/src/features/impact-service/ImpactServiceHeader.jsx`
- Modify: `frontend/src/pages/ImpactServicePage.jsx`
- Modify: `frontend/src/pages/DataPotensiPage.jsx`
- Modify: `frontend/src/pages/ActivityEnomPage.jsx`
- Modify: `frontend/src/index.css`
- Create: `frontend/src/__tests__/dataSyncButtonContracts.test.js`
- Modify: `frontend/src/__tests__/dataSyncContracts.test.js`
- Modify: `frontend/src/__tests__/impactServiceShadcnContracts.test.js`

**Interfaces:**
- Consumes: provider cancel fields and button presentation from Task 4
- Produces: `DataSyncCancelDialog({ open, onOpenChange, onConfirm, pending })`
- Produces: `ImpactServiceHeader.syncAction`

- [ ] **Step 1: Write failing component and layout contract tests**

Assert the dialog copy/buttons, creator-only cancel interaction, hover/focus
destructive classes, cancel-pending label, non-cancelable active control,
document order, dedicated Impact Service sync slot, and sync-after-filter order
on Data Potensi and Activity ENOM.

```javascript
assert.match(source, /Lanjutkan Sync/);
assert.match(source, /Batalkan Sync/);
assert.ok(source.indexOf('<DashboardFilterBar') < source.indexOf('<DataSyncButton'));
```

- [ ] **Step 2: Run component/layout tests and confirm RED**

Run: `node --test frontend/src/__tests__/dataSyncButtonContracts.test.js frontend/src/__tests__/dataSyncContracts.test.js frontend/src/__tests__/impactServiceShadcnContracts.test.js`

Expected: missing dialog and incorrect action order.

- [ ] **Step 3: Implement the accessible confirmation dialog and button states**

Reuse the existing shadcn/Radix AlertDialog primitives. For a cancelable active
job, keep the elapsed label by default and reveal `Cancel Sync` on hover/focus;
the control remains directly tappable on touch. While the cancel API is pending,
show `Canceling...` and disable only this control. The dialog warns that already
written data may remain and returns focus to the trigger when closed.

- [ ] **Step 4: Move every sync control to the final header position**

Add `syncAction` after Print PDF inside `ImpactServiceHeader`. Move Data Potensi
and Activity ENOM buttons after their `DashboardFilterBar`. Preserve responsive
wrapping with the action last in DOM/keyboard order and a right-aligned utility
class at narrow widths.

- [ ] **Step 5: Run Task 5 tests and confirm GREEN**

Run: `node --test frontend/src/__tests__/dataSyncButtonContracts.test.js frontend/src/__tests__/dataSyncContracts.test.js frontend/src/__tests__/impactServiceShadcnContracts.test.js`

Expected: all selected tests pass.

- [ ] **Step 6: Run lint and build**

Run: `npm --prefix frontend run lint`

Run: `npm --prefix frontend run build`

Expected: both commands exit 0.

- [ ] **Step 7: Commit UI behavior**

```text
git add frontend/src/features/data-sync/DataSyncCancelDialog.jsx frontend/src/features/data-sync/DataSyncButton.jsx frontend/src/features/impact-service/ImpactServiceHeader.jsx frontend/src/pages/ImpactServicePage.jsx frontend/src/pages/DataPotensiPage.jsx frontend/src/pages/ActivityEnomPage.jsx frontend/src/index.css frontend/src/__tests__/dataSyncButtonContracts.test.js frontend/src/__tests__/dataSyncContracts.test.js frontend/src/__tests__/impactServiceShadcnContracts.test.js
git commit -m "feat: add data sync cancel confirmation and header layout"
```

### Task 6: Runbook, Full Verification, and Review Handoff

**Files:**
- Modify: `docs/runbooks/n8n-data-sync.md`
- Modify: `docs/superpowers/plans/2026-09-09-data-sync-cancel-status-ux.md`
- Regenerate: `graphify-out/graph.json` and other tracked Graphify outputs if changed

**Interfaces:**
- Consumes: final environment, API, N8N claim, cancellation, UI, and message contracts
- Produces: operator-ready N8N configuration and troubleshooting steps

- [ ] **Step 1: Update the runbook with exact operator changes**

Document `N8N_EXECUTION_API_KEY`, dispatch/execution timeouts, the
`execution_id: {{$execution.id}}` claim body, N8N version floor, stop permission,
safe key-generation guidance, deployment order, rollback, and a decision tree
for `Starting`, `Syncing`, callback, and cancel failures. Use visibly synthetic
example values where an operator must supply a secret or URL; never include a
real value.

- [ ] **Step 2: Run the complete automated suites**

Run: `python -m pytest backend/tests -q`

Run: `node --test frontend/src/__tests__/*.test.js`

Run: `npm --prefix frontend run lint`

Run: `npm --prefix frontend run build`

Expected: every command exits 0. If coverage tooling is configured, verify the
modified data-sync modules meet the repository's 80% target.

- [ ] **Step 3: Refresh repository architecture output**

Run: `graphify update .`

Expected: Graphify completes successfully; inspect and stage only intentional
tracked output changes.

- [ ] **Step 4: Perform targeted browser verification**

Use the local application and fake N8N service. Verify all three headers at
desktop and mobile widths, viewer start, creator cancel, unrelated-viewer
read-only state, sysadmin cancel, confirmation dismissal, cancel retry, false
start-error suppression, five-second terminal reset, unaffected filters and
navigation, and zero unexpected console errors. Do not connect to or create a
Neon branch.

- [ ] **Step 5: Perform final security and diff review**

Inspect the complete diff for hardcoded credentials, execution-ID leakage,
authorization gaps, unsafe redirects, unbounded responses/timeouts, SQL
parameterization, callback/cancel races, raw internal errors, and unintended
files. Run `git diff --check` and a focused secret-pattern scan before commit.

- [ ] **Step 6: Commit documentation and verified final adjustments**

```text
git add docs/runbooks/n8n-data-sync.md docs/superpowers/plans/2026-09-09-data-sync-cancel-status-ux.md graphify-out
git commit -m "docs: update n8n data sync cancellation runbook"
```

- [ ] **Step 7: Push and open a reviewable pull request**

```text
git push -u origin codex/data-sync-cancel-status-ux
gh pr create --base main --head codex/data-sync-cancel-status-ux --title "Improve data sync cancellation and status recovery" --body-file <prepared-pr-body>
```

The PR summary must list the timeout split, true N8N cancellation, authorization,
frontend reconciliation, header layout, runbook changes, and all verification
commands. Do not merge the PR.
