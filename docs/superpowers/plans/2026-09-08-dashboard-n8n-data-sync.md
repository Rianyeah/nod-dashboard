# Dashboard N8N Data Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add safe, asynchronous, viewer-accessible data-sync controls for Impact Service, Data Potensi, and Activity ENOM that trigger their existing n8n workflows and expose shared progress across authenticated pages.

**Architecture:** FastAPI owns durable job state, authorization, rate limits, outbound webhook dispatch, n8n claim/callback authentication, timeout handling, and cache invalidation. A React provider below `AuthProvider` owns shared client state, bounded polling, elapsed time, notifications, and page refresh signals. n8n acknowledges the start request immediately, claims the job before doing database work, and reports a terminal callback when its existing workflow finishes.

**Tech Stack:** Python 3.12, FastAPI, SQLAlchemy async, PostgreSQL, httpx, React 19, Axios, Vite, Node test runner, Playwright, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-09-08-dashboard-n8n-data-sync-design.md`

## Global Constraints

- Work only on branch `codex/data-sync-n8n` in `D:\Web-dashboard\.worktrees\data-sync-n8n`.
- Do not create or use a Neon branch. Database integration tests use the existing local PostgreSQL/GitHub Actions service only.
- Keep `DATA_SYNC_ENABLED=false` as the default. A disabled flag hides controls and rejects new browser starts, while authenticated n8n claims and callbacks remain accepted for existing jobs.
- Viewer, data-admin, and sysadmin roles receive `data_sync:trigger`; status requires only `dashboard:view`.
- One active job exists per dataset across all users. Concurrent starts join that job and do not dispatch a second workflow.
- The server never retries an ambiguous outbound n8n trigger. An ambiguous dispatch remains active as `dispatch_unknown` until callback or expiry.
- Use `X-N8N-Sync-API-Key` for the configured outbound n8n header and `X-Data-Sync-Job-Token` for per-job claim/callback authentication.
- Validate webhook URLs against `N8N_SYNC_BASE_URL`: HTTPS in production, exact origin match, path beginning `/webhook/`, reject `/webhook-test/`, and reject userinfo, query, fragment, and redirects.
- Use outbound timeouts of connect 3 seconds, read 5 seconds, write 5 seconds, pool 3 seconds, and 10 seconds total. Use a 15-second Axios timeout for the browser start request.
- Default `DATA_SYNC_JOB_TIMEOUT_SECONDS=1800`, constrained to 60 through 86400 seconds.
- Keep callback `result_code` to `completed`, `workflow_failed`, `source_validation_failed`, or `database_write_failed`. Never expose arbitrary workflow error text or requester identity in public status responses.
- Button terminal feedback lasts 5 seconds; app-level notification feedback lasts 8 seconds.
- Before every commit, inspect the staged diff for secret exposure, authorization bypass, unsafe URL handling, token leakage, and regressions in the changed trust boundary.

---

## Task 1: Configuration, URL Policy, and Role Permission

**Files:**

- Create: `backend/tests/test_data_sync_config.py`
- Modify: `backend/config.py`
- Modify: `backend/user_store.py`
- Modify: `backend/tests/test_auth_security.py`
- Modify: `backend/.env.example`
- Modify: `zeabur.json`

**Interfaces:**

- Consumes environment variables `DATA_SYNC_ENABLED`, `DATA_SYNC_JOB_TIMEOUT_SECONDS`, `N8N_SYNC_BASE_URL`, three dataset webhook URLs, and `N8N_SYNC_TRIGGER_API_KEY`.
- Produces a validated `DataSyncSettings` object and `data_sync:trigger` role permission.

- [ ] Add failing configuration tests for disabled defaults, timeout bounds, exact-origin validation, production HTTPS, accepted `/webhook/` paths, rejected `/webhook-test/`, userinfo, query, fragment, and missing per-dataset webhook values when enabled.

- [ ] Run the focused tests and confirm they fail for the missing settings contract.

```powershell
Set-Location backend
python -m pytest tests/test_data_sync_config.py -q
```

- [ ] Add `DataSyncSettings` and a dataset-to-webhook accessor in `backend/config.py`.

```python
DATA_SYNC_DATASETS = ("impact_service", "data_master", "activity_enom")

class DataSyncSettings(BaseSettings):
    enabled: bool = False
    job_timeout_seconds: int = 1800
    n8n_base_url: str | None = None
    impact_service_webhook_url: str | None = None
    data_master_webhook_url: str | None = None
    activity_enom_webhook_url: str | None = None
    trigger_api_key: SecretStr | None = None

```

The implementation also exposes `webhook_url_for(dataset)` and raises a typed configuration error for unknown datasets or missing enabled values.

- [ ] Implement one URL validator that normalizes the base origin and enforces every rule in Global Constraints without logging secrets or full credential-bearing values.

- [ ] Add `data_sync:trigger` to viewer, data-admin, and sysadmin permissions, then add assertions proving viewer can trigger while an unrelated/unauthenticated actor cannot.

```python
assert "data_sync:trigger" in permissions_for_role("viewer")
assert "data_sync:trigger" in permissions_for_role("data_admin")
assert "data_sync:trigger" in permissions_for_role("sysadmin")
```

- [ ] Document safe sample values in `backend/.env.example` and deployment variable names in `zeabur.json`, keeping the feature disabled and all secrets unset by default.

- [ ] Run configuration and auth-security tests until green.

```powershell
Set-Location backend
python -m pytest tests/test_data_sync_config.py tests/test_auth_security.py -q
```

- [ ] Commit the configuration and permission slice.

```powershell
git add backend/config.py backend/user_store.py backend/tests/test_data_sync_config.py backend/tests/test_auth_security.py backend/.env.example zeabur.json
git commit -m "feat(sync): add secure n8n sync configuration"
```

---

## Task 2: Durable Job Schema and Startup Bootstrap

**Files:**

- Create: `backend/sql/data_sync_jobs.sql`
- Create: `backend/data_sync_schema.py`
- Create: `backend/tests/test_data_sync_schema.py`
- Create: `backend/tests/integration/test_data_sync_postgres.py`
- Modify: `backend/main.py`
- Modify: `backend/tests/conftest.py`
- Modify: `.github/workflows/deploy.yml`

**Interfaces:**

- Consumes the existing async SQLAlchemy engine and local PostgreSQL test service.
- Produces idempotent `public.data_sync_jobs` DDL with one-active-job enforcement and useful audit indexes.

- [ ] Write failing parser tests proving the SQL loader returns complete statements without splitting PostgreSQL expressions or the partial unique-index predicate.

- [ ] Write a gated local-PostgreSQL integration test that runs the bootstrap twice and proves a second active job for the same dataset violates the unique index.

- [ ] Run the schema tests and confirm they fail because the DDL/bootstrap do not exist.

```powershell
Set-Location backend
python -m pytest tests/test_data_sync_schema.py tests/integration/test_data_sync_postgres.py -q
```

- [ ] Add idempotent DDL for `data_sync_jobs` with the approved columns and constrained values.

```sql
CREATE TABLE IF NOT EXISTS public.data_sync_jobs (
    id uuid PRIMARY KEY,
    dataset text NOT NULL CHECK (dataset IN ('impact_service', 'data_master', 'activity_enom')),
    status text NOT NULL CHECK (status IN ('dispatching', 'running', 'dispatch_unknown', 'succeeded', 'failed', 'timed_out')),
    requested_by_user_id text NOT NULL,
    requested_by_username text NOT NULL,
    requested_by_role text NOT NULL,
    callback_token_hash text NOT NULL,
    correlation_id uuid NOT NULL,
    protocol_version integer NOT NULL DEFAULT 1 CHECK (protocol_version = 1),
    started_at timestamptz NOT NULL,
    dispatch_finished_at timestamptz,
    dispatch_outcome_code text,
    claimed_at timestamptz,
    callback_received_at timestamptz,
    finished_at timestamptz,
    rows_processed bigint CHECK (rows_processed IS NULL OR rows_processed >= 0),
    result_code text,
    cache_outcome_code text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_data_sync_jobs_active_dataset
ON public.data_sync_jobs (dataset)
WHERE status IN ('dispatching', 'running', 'dispatch_unknown');
```

- [ ] Add indexes for requester/time rate-limit queries, dataset/latest-status queries, and stale-active-job expiry.

- [ ] Implement `ensure_data_sync_schema(engine)` using the repository's established startup-DDL pattern and make bootstrap failure fatal because job coordination cannot safely operate without its unique index.

- [ ] Call the bootstrap from FastAPI lifespan before the application accepts requests.

- [ ] Extend test fixtures so unit tests can override sync settings, time, database sessions, and outbound dispatch without accessing Neon or the real n8n service.

- [ ] Enable the integration test in GitHub Actions with the existing PostgreSQL service.

```yaml
env:
  RUN_DATA_SYNC_DB_TESTS: "1"
  DATA_SYNC_TEST_DATABASE_URL: postgresql+asyncpg://test:test@127.0.0.1:5432/test
```

- [ ] Run parser and local PostgreSQL tests until green.

```powershell
Set-Location backend
$env:RUN_DATA_SYNC_DB_TESTS = "1"
$env:DATA_SYNC_TEST_DATABASE_URL = "postgresql+asyncpg://test:test@127.0.0.1:5432/test"
python -m pytest tests/test_data_sync_schema.py tests/integration/test_data_sync_postgres.py -q
```

- [ ] Commit the schema slice.

```powershell
git add backend/sql/data_sync_jobs.sql backend/data_sync_schema.py backend/main.py backend/tests/test_data_sync_schema.py backend/tests/integration/test_data_sync_postgres.py backend/tests/conftest.py .github/workflows/deploy.yml
git commit -m "feat(sync): add durable data sync job schema"
```

---

## Task 3: Job Models and Transactional Repository

**Files:**

- Create: `backend/models/data_sync.py`
- Create: `backend/data_sync_repository.py`
- Create: `backend/tests/test_data_sync_repository.py`

**Interfaces:**

- Consumes async database sessions, authenticated actor snapshots, UTC timestamps, UUIDs, and SHA-256 token hashes.
- Produces transaction-safe create-or-join, quota, cooldown, claim, completion, latest-status, and expiry operations.

- [ ] Add failing model tests for valid dataset/status literals, callback payload validation, non-negative `rows_processed`, allowed `result_code`, and public-response omission of actor/token/internal diagnostics.

- [ ] Add failing repository tests for one active job, same-job joining, ten new jobs per user per rolling hour, sixty-second dataset cooldown, stale expiry, first claim, duplicate claim, terminal callback idempotency, and constant-time token rejection.

- [ ] Run focused tests and confirm they fail for the missing models/repository.

```powershell
Set-Location backend
python -m pytest tests/test_data_sync_repository.py -q
```

- [ ] Add strict Pydantic enums and response models for browser start/status, n8n claim, and n8n callback contracts.

```python
class DataSyncDataset(StrEnum):
    IMPACT_SERVICE = "impact_service"
    DATA_MASTER = "data_master"
    ACTIVITY_ENOM = "activity_enom"

class DataSyncStatus(StrEnum):
    DISPATCHING = "dispatching"
    RUNNING = "running"
    DISPATCH_UNKNOWN = "dispatch_unknown"
    SUCCEEDED = "succeeded"
    FAILED = "failed"
    TIMED_OUT = "timed_out"
```

- [ ] Implement `expire_stale_jobs`, setting every expired active job to `timed_out`, `finished_at=now`, `result_code='timed_out'`, and updating timestamps atomically.

- [ ] Implement `create_or_join_job` under an actor-scoped advisory transaction lock, checking the global per-user hourly quota, the dataset cooldown, and the partial unique index before returning `created`, `joined`, or `rate_limited` with `retry_after`.

- [ ] Handle the concurrent-insert unique violation by rolling back only the savepoint and selecting the already-active dataset job.

- [ ] Implement the remaining typed repository interface.

The interface consists of `latest_jobs_by_dataset`, the three dispatch-marking operations, `claim_job`, `prepare_completion`, and `publish_completion`; each receives an explicit session and timestamp so tests control transaction and time behavior.

- [ ] Authenticate claim/callback by hashing the presented token and using `secrets.compare_digest`, including a dummy-hash comparison for unknown job IDs to reduce timing disclosure.

- [ ] Make terminal callbacks idempotent only when terminal status/result fields match; reject conflicting callbacks with HTTP-contract-ready conflict results.

- [ ] Run repository tests plus the local PostgreSQL integration test until green.

```powershell
Set-Location backend
python -m pytest tests/test_data_sync_repository.py tests/integration/test_data_sync_postgres.py -q
```

- [ ] Commit the domain and repository slice.

```powershell
git add backend/models/data_sync.py backend/data_sync_repository.py backend/tests/test_data_sync_repository.py
git commit -m "feat(sync): add transactional sync job repository"
```

---

## Task 4: One-Shot N8N Dispatch and Sync Orchestration

**Files:**

- Create: `backend/services/data_sync_dispatch.py`
- Create: `backend/services/data_sync.py`
- Create: `backend/tests/test_data_sync_dispatch.py`
- Create: `backend/tests/test_data_sync_service.py`

**Interfaces:**

- Consumes validated settings, repository operations, authenticated actor, cache invalidation helpers, and an injectable `httpx.AsyncClient` transport.
- Produces start/status/claim/complete use cases and a single-attempt outbound n8n dispatch result.

- [ ] Write failing dispatch tests with `httpx.MockTransport` for exact headers/body, disabled redirects, exact 202 acknowledgment, 4xx rejection, 5xx ambiguity, timeout/reset ambiguity, malformed acknowledgment, and proof of one HTTP attempt.

```python
assert request.headers["Idempotency-Key"] == str(job.id)
assert request.headers["X-N8N-Sync-API-Key"] == "configured-secret"
assert request.json()["job_id"] == str(job.id)
assert request.json()["callback_token"] == plaintext_token
```

- [ ] Write failing service tests for create-and-dispatch, join-without-dispatch, feature-disabled rejection, status expiry, callback-before-ack, cache invalidation before terminal publication, and safe result mapping.

- [ ] Run focused tests and confirm they fail for missing services.

```powershell
Set-Location backend
python -m pytest tests/test_data_sync_dispatch.py tests/test_data_sync_service.py -q
```

- [ ] Implement one-request dispatch with `follow_redirects=False`, HTTPX connect/read/write/pool limits, and an outer ten-second `asyncio.timeout`.

```python
class DispatchOutcome(StrEnum):
    ACCEPTED = "accepted"
    REJECTED_4XX = "rejected_4xx"
    TIMEOUT_UNKNOWN = "timeout_unknown"
    NETWORK_UNKNOWN = "network_unknown"
    SERVER_UNKNOWN = "server_unknown"
    INVALID_ACK_UNKNOWN = "invalid_ack_unknown"
```

- [ ] Accept only HTTP 202 and exact semantic JSON `{ "accepted": true, "job_id": "<same UUID>" }`; classify 4xx as definitive failure and 3xx, 5xx, network errors, timeouts, and invalid bodies as `dispatch_unknown`.

- [ ] Generate a cryptographically random per-job token, store only its SHA-256 hash, send plaintext only in the first outbound request, and never log either the API key or token.

- [ ] Implement start orchestration so the job transaction commits before outbound dispatch, a joined job never dispatches, and a callback that wins the race cannot be overwritten by a late acknowledgment classification.

- [ ] Implement cache invalidation mapping and record its internal outcome before publishing `succeeded`.

```python
CACHE_NAMES_BY_DATASET = {
    "impact_service": ("filters",),
    "data_master": ("data-potensi", "overview", "reporting", "filters"),
    "activity_enom": ("reporting",),
}
```

- [ ] Return safe public result codes/messages only: success `completed`, failure codes from the allowlist, and timeout `timed_out`; keep dispatch/cache diagnostics internal.

- [ ] Run dispatch and service tests until green.

```powershell
Set-Location backend
python -m pytest tests/test_data_sync_dispatch.py tests/test_data_sync_service.py -q
```

- [ ] Commit the service slice.

```powershell
git add backend/services/data_sync_dispatch.py backend/services/data_sync.py backend/tests/test_data_sync_dispatch.py backend/tests/test_data_sync_service.py
git commit -m "feat(sync): orchestrate one-shot n8n data sync"
```

---

## Task 5: Browser and N8N API Routes

**Files:**

- Create: `backend/routers/data_sync.py`
- Create: `backend/routers/n8n_data_sync.py`
- Create: `backend/tests/test_data_sync_routes.py`
- Create: `backend/tests/test_n8n_data_sync.py`
- Modify: `backend/main.py`

**Interfaces:**

- Consumes the Task 4 service layer.
- Produces browser endpoints `POST /api/v1/data-sync/{dataset}` and `GET /api/v1/data-sync/status`, plus machine endpoints `POST /api/v1/integrations/n8n/data-sync/{job_id}/claim` and `/callback`.

- [ ] Write failing browser-route tests for viewer success, unauthenticated rejection, permission rejection, disabled start, disabled status shape, joined active job, dataset validation, rate-limit `Retry-After`, and response redaction.

- [ ] Write failing n8n-route tests for missing/wrong token, first claim, duplicate claim, successful callback, failed callback, callback while feature flag is disabled, duplicate callback, conflict callback, invalid result code, and arbitrary-field rejection.

- [ ] Run route tests and confirm they fail for missing routes.

```powershell
Set-Location backend
python -m pytest tests/test_data_sync_routes.py tests/test_n8n_data_sync.py -q
```

- [ ] Implement the browser router using the existing browser authentication/session dependency; require `data_sync:trigger` for POST and `dashboard:view` for GET.

- [ ] Return all three dataset keys from status even when no job exists.

```json
{
  "enabled": false,
  "jobs": {
    "impact_service": null,
    "data_master": null,
    "activity_enom": null
  }
}
```

- [ ] Return HTTP 429 plus an integer `Retry-After` header for durable quota/cooldown responses, and return the joined active job as a successful idempotent start response.

- [ ] Implement the machine router without browser-session or CSRF assumptions; require `X-Data-Sync-Job-Token` and keep authentication errors uniform.

- [ ] Return `{ "execute": true }` for the winning claim and `{ "execute": false }` for an already-claimed or terminal job so duplicate n8n executions stop before data work.

- [ ] Register both routers in `backend/main.py`, preserving the existing `/api/v1` conventions and startup order.

- [ ] Run route tests and the full backend suite until green.

```powershell
Set-Location backend
python -m pytest tests/test_data_sync_routes.py tests/test_n8n_data_sync.py -q
python -m pytest tests -q
```

- [ ] Commit the API slice.

```powershell
git add backend/routers/data_sync.py backend/routers/n8n_data_sync.py backend/main.py backend/tests/test_data_sync_routes.py backend/tests/test_n8n_data_sync.py
git commit -m "feat(sync): expose browser and n8n sync APIs"
```

---

## Task 6: Shared Frontend Sync State and Accessible Controls

**Files:**

- Create: `frontend/src/features/data-sync/dataSyncState.js`
- Create: `frontend/src/features/data-sync/DataSyncProvider.jsx`
- Create: `frontend/src/features/data-sync/DataSyncButton.jsx`
- Create: `frontend/src/features/data-sync/DataSyncNotifications.jsx`
- Create: `frontend/src/__tests__/dataSyncState.test.js`
- Create: `frontend/src/__tests__/dataSyncContracts.test.js`
- Modify: `frontend/src/services/api.js`
- Modify: `frontend/src/App.jsx`

**Interfaces:**

- Consumes browser APIs from Task 5 and `AuthProvider` session state.
- Produces `useDataSync(dataset)`, shared polling/reconciliation, elapsed labels, a reusable button, and app-level accessible notifications.

- [ ] Add failing pure-state tests for active statuses, `mm:ss`/`hh:mm:ss` formatting, 3–5 second jitter, bounded failure backoff, initial terminal-state suppression, terminal-transition de-duplication, and success revision incrementing once per job.

- [ ] Add failing source-contract tests for provider placement below `AuthProvider` and above routes, exact endpoint paths, all three dataset keys, notification live region, and absence of POST retry code.

- [ ] Run the frontend tests and confirm the new tests fail.

```powershell
Set-Location frontend
node --test src/__tests__/dataSyncState.test.js src/__tests__/dataSyncContracts.test.js
```

- [ ] Add the API methods with abort support for status and a 15-second timeout for start; do not configure Axios retry for POST.

```javascript
export async function fetchDataSyncStatus(signal) {
  const { data } = await api.get('/data-sync/status', { signal })
  return data
}

export async function startDataSync(dataset) {
  const { data } = await api.post(
    `/data-sync/${encodeURIComponent(dataset)}`,
    undefined,
    { timeout: 15_000 },
  )
  return data
}
```

- [ ] Implement pure helpers and stable dataset constants.

The helper module exports `DATA_SYNC_DATASETS`, `isActiveDataSyncStatus`, `formatDataSyncElapsed`, `getDataSyncPollDelay`, and `reconcileDataSyncJobs`. Helpers remain pure and accept the clock/random value explicitly where nondeterminism would otherwise make tests unstable.

- [ ] Implement `DataSyncProvider` using authenticated state, a coalesced initial status request resilient to React StrictMode, 3–5 second jitter while active, exponential failure backoff capped at 30 seconds, no retry after 401, and cleanup on logout/unmount.

- [ ] On an ambiguous browser POST failure, perform an immediate status GET instead of resending POST; keep unrelated page controls usable throughout.

- [ ] Expose the approved hook contract and clear all user-specific state on logout.

```javascript
const {
  enabled,
  job,
  start,
  successRevision,
  actionPending,
  actionError,
} = useDataSync(dataset)
```

- [ ] Implement `DataSyncButton` states `Sync Data`, `Starting...`, `Syncing mm:ss`, `Synced`, `Sync failed`, and `Timed out`; update elapsed text from server `started_at` while avoiding a once-per-second `aria-live` announcement.

- [ ] Implement an app-level polite live region with safe messages, 8-second dismissal, and de-duplication by job ID; show terminal button state for 5 seconds.

- [ ] Place the provider and notification surface below `AuthProvider` and above `Routes` in `App.jsx`.

- [ ] Run unit/contract tests, lint, and build until green.

```powershell
Set-Location frontend
node --test src/__tests__/*.test.js
npm run lint
npm run build
```

- [ ] Commit the shared frontend slice.

```powershell
git add frontend/src/features/data-sync frontend/src/__tests__/dataSyncState.test.js frontend/src/__tests__/dataSyncContracts.test.js frontend/src/services/api.js frontend/src/App.jsx
git commit -m "feat(sync): add shared asynchronous sync controls"
```

---

## Task 7: Integrate the Three Dashboard Pages

**Files:**

- Modify: `frontend/src/pages/ImpactServicePage.jsx`
- Modify: `frontend/src/features/impact-service/ImpactServiceHeader.jsx`
- Modify: `frontend/src/pages/DataPotensiPage.jsx`
- Modify: `frontend/src/pages/ActivityEnomPage.jsx`
- Modify: `frontend/src/__tests__/dataSyncContracts.test.js`

**Interfaces:**

- Consumes `DataSyncButton` and each dataset's `successRevision`.
- Produces one dataset-specific control per page and refreshes only that page's data after successful completion.

- [ ] Extend source-contract tests to require the exact dataset mapping and success-revision refresh dependency on each page.

```javascript
const expectedMappings = {
  ImpactServicePage: 'impact_service',
  DataPotensiPage: 'data_master',
  ActivityEnomPage: 'activity_enom',
}
```

- [ ] Run the contract test and confirm it fails before page integration.

```powershell
Set-Location frontend
node --test src/__tests__/dataSyncContracts.test.js
```

- [ ] Add the Impact Service button to `ImpactServiceHeader`, wire dataset `impact_service`, and add its `successRevision` to filter, summary/chart, and table refresh flows without resetting selected filters.

- [ ] Add the Data Potensi button in the existing page header, wire dataset `data_master`, and refresh filters/overview/reporting-backed data after success while retaining valid region/site selections.

- [ ] Add the Activity ENOM button in the existing page header, wire dataset `activity_enom`, and refresh reporting data after success while preserving the user's selected period rather than restoring defaults.

- [ ] Verify the feature-disabled state renders no button on all three pages and does not leave empty header spacing.

- [ ] Run frontend tests, lint, and build until green.

```powershell
Set-Location frontend
node --test src/__tests__/*.test.js
npm run lint
npm run build
```

- [ ] Commit the page integration slice.

```powershell
git add frontend/src/pages/ImpactServicePage.jsx frontend/src/features/impact-service/ImpactServiceHeader.jsx frontend/src/pages/DataPotensiPage.jsx frontend/src/pages/ActivityEnomPage.jsx frontend/src/__tests__/dataSyncContracts.test.js
git commit -m "feat(sync): add sync controls to dashboard pages"
```

---

## Task 8: N8N Contract Runbook and End-to-End Verification

**Files:**

- Create: `docs/runbooks/n8n-data-sync.md`
- Create: `data-sync-playwright.spec.js`
- Modify: `docs/superpowers/specs/2026-09-08-dashboard-n8n-data-sync-design.md`

**Interfaces:**

- Consumes the completed browser/machine APIs and frontend controls.
- Produces an operator-ready n8n contract, mocked browser-flow evidence, and final verification evidence without Neon branch use.

- [ ] Write the runbook with the exact workflow contract for each existing n8n workflow: production webhook path, `X-N8N-Sync-API-Key`, exact 202 acknowledgment, first-step claim, concurrency one per dataset, success/failure callbacks, preserved `job_id` and callback token, and no changes to existing core sync nodes.

- [ ] Include curl-style examples with redacted secrets for claim/callback and list the allowed callback result codes.

```json
{
  "status": "succeeded",
  "rows_processed": 1250,
  "result_code": "completed"
}
```

- [ ] Add Playwright coverage with API interception for a viewer starting each dataset, cross-page persistence, continuing unrelated interactions during sync, elapsed-button display, joined active job, successful notification/refresh, failed state, timed-out state, logout cleanup, and feature-disabled button hiding.

- [ ] Run the Playwright sync scenario in the existing local test setup and save no credentials or production webhook calls.

```powershell
npx playwright test data-sync-playwright.spec.js
```

- [ ] Run the complete backend verification with local/test doubles only.

```powershell
Set-Location backend
python -m pytest tests -q
python -m pip_audit -r requirements.lock
```

- [ ] Run the complete frontend verification.

```powershell
Set-Location frontend
node --test src/__tests__/*.test.js
npm run lint
npm audit --audit-level=high
npm run build
Set-Location ..
npx playwright test data-sync-playwright.spec.js
```

- [ ] Run repository security checks, confirm no API keys/tokens appear in logs or tracked files, and inspect the complete diff against `origin/main`.

```powershell
git diff --check origin/main...HEAD
git status --short
git diff --stat origin/main...HEAD
```

- [ ] Run `graphify update .` from the worktree after the material code and relationship changes, and record whether the graph refresh succeeds.

```powershell
graphify update .
```

- [ ] Update the design status to implemented only after all required verification is green, then commit the runbook and end-to-end slice.

```powershell
git add docs/runbooks/n8n-data-sync.md docs/superpowers/specs/2026-09-08-dashboard-n8n-data-sync-design.md data-sync-playwright.spec.js
git commit -m "test(sync): verify async n8n sync workflow"
```

- [ ] Use `superpowers:requesting-code-review` for a final security/architecture review, address verified findings, rerun affected checks, then use `superpowers:verification-before-completion` before claiming completion.

- [ ] Use `superpowers:finishing-a-development-branch` to present the reviewed branch for user-selected integration; do not merge directly to `main` without explicit authorization.
