# Data Sync Cancellation and Status Recovery Design

**Date:** 2026-09-09

**Status:** Approved for implementation

**Supersedes:** The cancellation, timeout, button-state, and header-layout portions
of `2026-09-08-dashboard-n8n-data-sync-design.md`. All other security and data
sync contracts from that design remain in force.

## Problem and Evidence

The shared data-sync feature can leave the dashboard showing `Starting` or
`Syncing` long after the useful outcome is known. Two distinct cases cause this:

- `dispatching` currently shares the 30-minute stale timeout with an executing
  workflow, even though the trigger request should settle within seconds;
- a workflow can claim a job and finish in N8N without sending a terminal
  callback, leaving the dashboard job active until the generic timeout.

The browser also reports a generic start failure as soon as its request times
out, even when a status refresh immediately finds the same job running. This can
show `Syncing 00:00` and an apparently contradictory failure notification at the
same time.

Operators currently have no dashboard action to release or stop a stuck sync.
The sync control also appears before filters or print actions on some pages,
rather than consistently occupying the far-right header position.

## Goals

- Limit a job that remains `dispatching` to 60 seconds.
- Keep the existing 30-minute execution timeout for `running` and
  `dispatch_unknown` jobs.
- Reconcile an ambiguous browser start request with server status before showing
  a failure.
- Let the job creator or a `sysadmin` stop the corresponding N8N execution from
  the dashboard.
- Keep other viewers informed about the shared job without granting them cancel
  authority.
- Require an explicit confirmation before cancellation.
- Return the button to a reusable state promptly after failure, timeout, or
  confirmed cancellation.
- Put the sync control last and at the far-right edge of every affected page
  header on desktop, while preserving sensible wrapping on mobile.
- Preserve the existing per-user hourly quota and dataset cooldown.

## Non-goals

- Cancellation does not roll back rows already committed by N8N before the stop
  request takes effect.
- This change does not add percentage or row-level progress.
- This change does not alter the business logic of any N8N synchronization or
  source table.
- This change does not add a history-management screen.
- Validation will not create or use a Neon branch.

## Selected Approach

The dashboard backend remains the source of truth for shared job state. N8N
continues to claim and complete jobs through machine-authenticated endpoints, but
the claim now also records the N8N execution ID. An authorized browser cancel
request asks the backend to stop that execution through N8N's server-side public
API. N8N credentials and execution identifiers are never exposed to the browser.

Cancellation is synchronous from the API caller's perspective: the job becomes
`canceled` only after N8N confirms that the execution is stopped. If stopping
fails or is ambiguous, the job remains active and the UI returns to `Syncing`,
allowing a retry. For a job canceled before N8N claims it, the backend can mark it
`canceled` immediately; any later claim receives `execute: false`.

This approach avoids falsely declaring an execution canceled and avoids a new
durable `canceling` state that could itself become stuck. `Canceling...` is a
temporary local UI action state.

## State Model and Timeouts

Persisted states are:

| State | Kind | Meaning |
| --- | --- | --- |
| `dispatching` | active | Backend is waiting for the initial N8N webhook response. |
| `running` | active | N8N acknowledged or claimed the job. |
| `dispatch_unknown` | active | Trigger outcome was ambiguous; N8N may be running. |
| `succeeded` | terminal | N8N reported successful completion. |
| `failed` | terminal | Trigger or workflow reported a definitive failure. |
| `timed_out` | terminal | The applicable stale deadline elapsed. |
| `canceled` | terminal | An authorized cancellation was confirmed. |

Two independently validated settings control expiration:

```text
DATA_SYNC_DISPATCH_TIMEOUT_SECONDS=60
DATA_SYNC_JOB_TIMEOUT_SECONDS=1800
```

`DATA_SYNC_DISPATCH_TIMEOUT_SECONDS` accepts 15 through 300 seconds.
`DATA_SYNC_JOB_TIMEOUT_SECONDS` remains the execution timeout and keeps its
existing validation. Expiration occurs atomically before status reads, starts,
claims, callbacks, and cancellations.

- stale `dispatching` becomes `timed_out` with `dispatch_timed_out`;
- stale `running` or `dispatch_unknown` becomes `timed_out` with
  `workflow_timed_out`;
- a late claim or callback cannot revive any terminal job;
- a terminal job no longer blocks a new start, subject to cooldown and quota.

## Persistence Changes

The idempotent `data_sync_jobs` bootstrap adds:

- `n8n_execution_id text null`, populated only by the authenticated claim;
- `canceled_at timestamptz null`;
- `canceled_by_user_id text null`.

The status constraint includes `canceled`. The terminal-state consistency
constraint treats `canceled` like other terminal states, requiring
`finished_at`. The result-code constraint adds `dispatch_timed_out`,
`workflow_timed_out`, and `canceled` while continuing to allow existing rows
that use the legacy `timed_out` result code.

The active partial unique index remains limited to `dispatching`, `running`, and
`dispatch_unknown`. Requester snapshots, callback-token hashing, audit fields,
and retention behavior remain unchanged.

## API Contracts

### Status

```text
GET /api/v1/data-sync/status
```

Each public job adds `can_cancel: boolean`. It is true only when the job is active
and the current actor is either its creator or a `sysadmin`. Requester identity
and `n8n_execution_id` remain private. A viewer who did not create the job sees
the shared running state with `can_cancel: false`.

### Start

```text
POST /api/v1/data-sync/{dataset}
```

Start behavior remains unchanged except for the split stale deadlines and the
new public `can_cancel` field. The per-user limit stays at ten newly created jobs
in a rolling hour. Joining an existing active job does not consume quota. Every
terminal attempt, including a canceled one, starts the existing 60-second
dataset cooldown.

If the browser start request fails or times out, the frontend immediately fetches
status. It suppresses the start-failure notification when that refresh finds an
active job for the dataset. It shows a failure only when the refresh confirms no
active job or the reconciliation request also fails.

### Claim

```text
POST /api/v1/integrations/n8n/data-sync/{job_id}/claim
X-Data-Sync-Job-Token: <per-job token>
Content-Type: application/json

{
  "execution_id": "12345"
}
```

`execution_id` is required, trimmed, bounded, and treated as an opaque string.
The first valid claim atomically records it and returns `execute: true`. A repeat
claim with the same or a different execution ID returns `execute: false` and
must stop before source reads or database writes. A claim received after
cancellation, timeout, or another terminal result also returns `execute: false`.

Each N8N workflow sends `{{$execution.id}}` in this claim payload.

### Callback

The existing callback contract remains unchanged. A callback after `canceled`
returns `409` and cannot overwrite the cancellation. Duplicate identical
terminal callbacks remain idempotent.

### Cancel

```text
POST /api/v1/data-sync/{dataset}/{job_id}/cancel
```

The endpoint requires an authenticated same-origin request. It verifies the job
belongs to the path dataset and authorizes only the creator or a `sysadmin`.
Unauthorized actors receive `403` without requester or execution details.

- If the job is already terminal, return its current public representation as an
  idempotent result.
- If the job is active but has no execution ID, atomically mark it `canceled`.
- If it has an execution ID, request a stop from N8N, then lock and re-read the
  job. If a callback won the race, preserve and return that terminal result. If
  it is still active and N8N confirms the stop, mark it `canceled`.
- If N8N reports that the execution is already stopped, fetch its current state.
  Treat a confirmed canceled/stopped state as success; preserve a confirmed
  completed or failed dashboard callback when present.
- On N8N timeout, transport error, or unconfirmed stop, leave the job active and
  return a safe `502` or `504`. The user can retry cancellation.

Successful response:

```json
{
  "canceled": true,
  "job": {
    "id": "3ea11624-287a-451d-a050-772944599a2f",
    "dataset": "data_master",
    "status": "canceled",
    "started_at": "2026-09-09T06:45:12Z",
    "finished_at": "2026-09-09T06:48:02Z",
    "rows_processed": null,
    "result_code": "canceled",
    "public_message": "Sinkronisasi telah dibatalkan.",
    "can_cancel": false
  }
}
```

## N8N Execution API

The backend receives one additional server-only credential:

```text
N8N_EXECUTION_API_KEY=<n8n public API key>
```

It calls the configured N8N origin at:

```text
POST {N8N_SYNC_BASE_URL}/api/v1/executions/{execution_id}/stop
X-N8N-API-KEY: <N8N_EXECUTION_API_KEY>
```

Redirects are disabled, execution IDs are URL-encoded, and connect/read/total
timeouts are bounded. The configured base URL must pass the existing HTTPS and
same-origin validation. The API key, execution ID, raw N8N response, and internal
errors are never returned to the browser or written to ordinary application
logs. Production N8N must be version 1.99.1 or newer before enabling dashboard
cancellation.

## Frontend Interaction

The reusable control has these states:

| State | Display and interaction |
| --- | --- |
| Idle | `Sync Data`; starts a new job. |
| Dispatch pending | `Starting 00:00`; other dashboard controls remain usable. |
| Active | `Syncing mm:ss` or `hh:mm:ss`. |
| Active and cancelable | Hover/focus changes the control to destructive `Cancel Sync`; click opens confirmation. On touch, tapping the active control opens confirmation directly. |
| Active but not cancelable | Continues to show `Syncing`; disabled for mutation but remains readable. |
| Cancel request | `Canceling...`; prevents duplicate cancel requests only. |
| Terminal | Briefly shows `Synced`, `Sync failed`, `Timed out`, or `Canceled`, then returns to `Sync Data` after approximately five seconds. |

The confirmation dialog says that stopping may leave changes already written by
the workflow. Its safe action is `Lanjutkan Sync`; its destructive action is
`Batalkan Sync`. Keyboard focus is trapped, Escape closes the dialog, and focus
returns to the initiating control.

Elapsed time continues to derive from server `started_at`. Polling continues
while any dataset has an active job, backs off after transient failures, and
stops for terminal jobs. Cancellation affects only the selected dataset and
does not block filters, navigation, dialogs, or unrelated requests.

## Header Layout

The sync control is the final action at the far-right edge of all three desktop
headers:

- Impact Service: title, date/NOP filters, Reset, Print PDF, Sync Data;
- Data Potensi: title, filters/actions, Sync Data;
- Activity ENOM: title, period/NOP/category filters, Sync Data.

`ImpactServiceHeader` receives a dedicated sync-action slot so child filters and
Print PDF maintain their intended order. Data Potensi and Activity ENOM render
the sync control after their filter bars. On narrow screens, header controls may
wrap, but the sync action remains last in document and keyboard order and aligns
to the right of its row when space permits.

## User-Facing Messages

| Condition | Message |
| --- | --- |
| Success with row count | `Sinkronisasi selesai. 1.250 baris diproses.` |
| Trigger rejected | `Workflow menolak permintaan sinkronisasi.` |
| Source validation failed | `Data sumber tidak lolos validasi.` |
| Database write failed | `Data gagal disimpan ke database.` |
| Workflow failed | `Workflow sinkronisasi mengalami kegagalan.` |
| Dispatch timeout | `Workflow tidak merespons dalam 60 detik.` |
| Execution timeout | `Sinkronisasi melewati batas waktu 30 menit.` |
| Canceled | `Sinkronisasi telah dibatalkan.` |
| Cancel could not be confirmed | `Execution belum berhasil dihentikan. Coba batalkan kembali.` |
| Cooldown | `Tunggu 42 detik sebelum mencoba sinkronisasi ulang.` with the server-provided remaining duration. |
| Hourly quota | `Batas 10 sinkronisasi per jam tercapai. Coba lagi dalam 18 menit.` with the server-provided remaining duration. |

The frontend formats row counts using the Indonesian locale. Server-authored
result codes select safe messages; raw workflow, SQL, URL, token, or stack-trace
details never reach notifications.

## Concurrency and Failure Handling

- The existing unique active-job index remains the concurrency authority.
- A cancellation and callback race is resolved by locking and re-reading the
  row after N8N responds; the first confirmed terminal result wins.
- Stop calls are safe to repeat. A backend interruption after N8N stops but
  before the database update can be reconciled by the next cancel attempt.
- A stop failure never releases the active-job guard prematurely.
- A late claim after pre-claim cancellation is rejected before data work.
- Canceling a job consumes no additional hourly start quota, but the resulting
  terminal job participates in the normal 60-second dataset cooldown.
- Other viewers cannot bypass ownership by changing the dataset or job ID in
  the request path.

## Testing and Verification

Implementation follows red-green-refactor.

Backend coverage includes split timeout boundaries, result messages, idempotent
schema changes, execution-ID validation, claim races, creator/sysadmin cancel
authorization, viewer denial, pre-claim cancellation, confirmed N8N stop,
unconfirmed stop, callback races, late callbacks, quota, and cooldown.

Frontend coverage includes start-error reconciliation, all visual states,
creator/non-creator cancel capability, confirmation behavior, cancel failure and
retry, terminal reset, accessible labeling, and final-action layout on all three
pages.

A local fake N8N service covers the stop and execution-state API contracts. The
normal backend unit/integration suite, frontend node tests, lint, build, and
targeted browser checks are run. No Neon branch is created or queried.

## Deployment and Runbook

1. Confirm production N8N is version 1.99.1 or newer.
2. Create a least-privilege N8N API key with execution read/stop access and add
   it as `N8N_EXECUTION_API_KEY` only to the dashboard backend environment.
3. Add `DATA_SYNC_DISPATCH_TIMEOUT_SECONDS=60` and keep
   `DATA_SYNC_JOB_TIMEOUT_SECONDS=1800`.
4. Update each workflow's claim request body with
   `execution_id: {{$execution.id}}` while retaining the per-job token header.
5. Deploy the schema and application update before testing cancellation.
6. Verify start, claim, successful callback, failed callback, pre-claim cancel,
   running cancel, late callback rejection, and the three header layouts.
7. Keep `DATA_SYNC_ENABLED=false` as the rollback switch. Existing active jobs
   may still claim or callback so their records can settle safely.

The runbook must include a troubleshooting decision tree for `Starting`,
`Syncing`, failed callback, and cancellation errors, plus the exact N8N fields
operators must configure. It must not contain real API keys or callback tokens.

## Acceptance Criteria

- `dispatching` cannot remain active longer than 60 seconds; workflow execution
  states keep the 30-minute limit.
- A browser request timeout does not display a false failure when server status
  confirms the job is active.
- The creator and a sysadmin can cancel; another viewer cannot.
- Cancellation requires confirmation and only becomes terminal after a confirmed
  stop, except for a safe pre-claim cancellation.
- A failed stop remains retryable and never falsely releases the dataset lock.
- Late claims and callbacks cannot revive a canceled or timed-out job.
- All terminal states return to the idle button after the brief result display.
- The sync control is last and right-aligned on Impact Service, Data Potensi, and
  Activity ENOM without disabling unrelated interactions.
- Rate-limit and cooldown messages contain the configured limit and remaining
  retry duration.
- All automated and browser checks pass without using a Neon branch.
