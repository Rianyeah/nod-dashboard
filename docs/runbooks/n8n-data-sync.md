# N8N Data Sync Runbook

## Scope

This runbook connects the dashboard to the three existing production n8n sync
workflows. Keep the existing source, transformation, and database-write nodes
unchanged. Add only the authenticated production webhook entry, job claim, and
terminal callback around the existing flow.

Dashboard cancellation requires n8n version 1.99.1 or newer. Confirm the running
version before enabling the feature.

| Dashboard dataset | Existing workflow | Dashboard environment variable |
| --- | --- | --- |
| `impact_service` | Impact Service sync | `N8N_IMPACT_SERVICE_SYNC_WEBHOOK_URL` |
| `data_master` | Data Master sync | `N8N_DATA_MASTER_SYNC_WEBHOOK_URL` |
| `activity_enom` | Activity ENOM sync | `N8N_ACTIVITY_ENOM_SYNC_WEBHOOK_URL` |

Only active production webhook URLs under `/webhook/` are accepted. Test URLs
under `/webhook-test/` are intentionally rejected.

## Required dashboard configuration

Configure these values in the dashboard service. Do not put them in frontend
variables, workflow output, screenshots, or source control.

```dotenv
DATA_SYNC_ENABLED=false
DATA_SYNC_DISPATCH_TIMEOUT_SECONDS=60
DATA_SYNC_JOB_TIMEOUT_SECONDS=1800
N8N_SYNC_BASE_URL=https://n8n.example.internal
N8N_IMPACT_SERVICE_SYNC_WEBHOOK_URL=https://n8n.example.internal/webhook/<redacted-path>
N8N_DATA_MASTER_SYNC_WEBHOOK_URL=https://n8n.example.internal/webhook/<redacted-path>
N8N_ACTIVITY_ENOM_SYNC_WEBHOOK_URL=https://n8n.example.internal/webhook/<redacted-path>
N8N_SYNC_TRIGGER_API_KEY=<redacted-minimum-32-characters>
N8N_EXECUTION_API_KEY=<redacted-n8n-public-api-key>
```

All webhook URLs must use the exact HTTPS origin from `N8N_SYNC_BASE_URL`, with
no credentials, query string, or fragment. The sync trigger key and execution
API key must each contain at least 32 characters and must be distinct from one
another and from every other n8n key. Create the execution key in n8n with the
least privilege that permits execution read and `execution:stop`. It belongs
only in the dashboard backend environment.

Keep `DATA_SYNC_ENABLED=false` until all three workflows have been configured,
activated, and checked with a non-production-data contract test. Set it to
`true` only for rollout. Turning it back to `false` blocks new dashboard starts
but still allows claim/callback requests for jobs that already exist.

## Incoming webhook contract

Each workflow must require this header before processing the request:

```text
X-N8N-Sync-API-Key: <same value as N8N_SYNC_TRIGGER_API_KEY>
```

The dashboard also sends `Idempotency-Key` with the same UUID as `job_id`. The
JSON body is:

```json
{
  "job_id": "11111111-1111-4111-8111-111111111111",
  "dataset": "impact_service",
  "requested_by": "viewer-name",
  "requested_at": "2026-09-08T10:00:00+00:00",
  "claim_url": "https://dashboard.example/api/v1/integrations/n8n/data-sync/11111111-1111-4111-8111-111111111111/claim",
  "callback_url": "https://dashboard.example/api/v1/integrations/n8n/data-sync/11111111-1111-4111-8111-111111111111/callback",
  "job_token": "<one-time-per-job-secret>",
  "correlation_id": "22222222-2222-4222-8222-222222222222",
  "protocol_version": 1
}
```

Validate that `dataset` is the fixed key for that workflow and
`protocol_version` is `1`. Preserve `job_id`, `job_token`, `claim_url`, and
`callback_url` as workflow data through every branch. Do not persist or log the
job token.

The webhook must respond immediately, before the database sync runs, with HTTP
202, content type `application/json`, and exactly:

```json
{
  "accepted": true,
  "job_id": "11111111-1111-4111-8111-111111111111"
}
```

Do not redirect the request or wait for the core workflow to finish. A response
other than this exact acknowledgment leaves the dashboard job in an uncertain
dispatch state; the dashboard deliberately does not retry the trigger.

## Workflow node order

Use this order for each of the three workflows:

1. Production Webhook node authenticates `X-N8N-Sync-API-Key`.
2. Validate the fixed dataset and protocol version, then retain the job fields.
3. Respond to Webhook immediately with the exact HTTP 202 acknowledgment.
4. POST to `claim_url`, passing `job_token` in `X-Data-Sync-Job-Token` and
   `{{$execution.id}}` as `execution_id` in the JSON body.
5. Continue only when the claim response contains `{ "execute": true }`.
6. Run the existing workflow nodes unchanged.
7. POST one success callback after the database transaction has completed.
8. From every handled failure branch, POST one failure callback with the closest
   allowed result code. Configure an n8n error workflow or equivalent error path
   so an unhandled execution failure also reports a failure callback.

Set workflow concurrency to one execution for each dataset. The dashboard also
enforces one active job per dataset, but n8n must still honor the claim result:
`execute: false` means another execution already claimed or completed the job,
so stop before reading or writing any source data.

## Claim and callback examples

Claim the job immediately after acknowledgment:

```bash
curl --request POST \
  --header "Content-Type: application/json" \
  --header "X-Data-Sync-Job-Token: <redacted-job-token>" \
  --data '{"execution_id":"12345"}' \
  "https://dashboard.example/api/v1/integrations/n8n/data-sync/11111111-1111-4111-8111-111111111111/claim"
```

A winning claim returns:

```json
{ "execute": true }
```

In the n8n HTTP Request node, configure the JSON body as:

```json
{
  "execution_id": "{{$execution.id}}"
}
```

The expression must resolve to the current n8n execution ID, not the dashboard
job ID. A missing, blank, or duplicate execution ID produces a rejected claim;
the workflow must stop when `execute` is false.

Report success only after the existing workflow's database work commits:

```bash
curl --request POST \
  --header "Content-Type: application/json" \
  --header "X-Data-Sync-Job-Token: <redacted-job-token>" \
  --data '{"status":"succeeded","rows_processed":1250,"result_code":"completed"}' \
  "https://dashboard.example/api/v1/integrations/n8n/data-sync/11111111-1111-4111-8111-111111111111/callback"
```

Report a safe failure classification without raw exception text:

```bash
curl --request POST \
  --header "Content-Type: application/json" \
  --header "X-Data-Sync-Job-Token: <redacted-job-token>" \
  --data '{"status":"failed","result_code":"database_write_failed"}' \
  "https://dashboard.example/api/v1/integrations/n8n/data-sync/11111111-1111-4111-8111-111111111111/callback"
```

Allowed callback result codes are:

- `completed` with `status: succeeded`
- `workflow_failed` with `status: failed`
- `source_validation_failed` with `status: failed`
- `database_write_failed` with `status: failed`

`rows_processed` is optional and, when supplied, must be a non-negative integer.
Duplicate identical callbacks are safe. A conflicting callback for an already
terminal job returns HTTP 409 and must not be retried as a different outcome.
A callback sent before the execution wins its claim also returns HTTP 409 and
does not invalidate cache or publish a terminal result.

## Operational checks

Before enabling the feature:

- Confirm all three n8n production workflows are active and their paths match
  the configured URLs.
- Confirm invalid/missing trigger keys are rejected before the 202 response.
- Confirm two deliveries with the same job ID produce one `execute: true` claim
  and one `execute: false` claim.
- Confirm success and each handled failure path calls back exactly once.
- Confirm no execution log, node output, or error message contains the trigger
  key or per-job token.
- Confirm a viewer sees `Starting 00:00`, then `Syncing mm:ss`, can navigate and use
  filters while it runs, and sees the terminal notification.
- Confirm the job creator can open the cancel confirmation and stop the n8n
  execution; confirm a different viewer cannot cancel it and a sysadmin can.
- Confirm the sync action is the last, far-right action on Impact Service, Data
  Potensi, and Activity ENOM at desktop width and remains last after mobile wrap.

## Timeout and cancellation behavior

- `dispatching` expires after `DATA_SYNC_DISPATCH_TIMEOUT_SECONDS` (60 seconds by
  default) and shows `Workflow tidak merespons dalam 60 detik.`
- `running` and `dispatch_unknown` expire after
  `DATA_SYNC_JOB_TIMEOUT_SECONDS` (30 minutes by default) and show
  `Sinkronisasi melewati batas waktu 30 menit.`
- A cancel before a successful claim becomes terminal immediately. A later
  claim receives `execute: false`.
- A cancel after claim calls the n8n public API at
  `/api/v1/executions/{execution_id}/stop`. The dashboard records `canceled`
  only after the stop is confirmed.
- If n8n cannot confirm the stop, the job remains active. The user receives
  `Execution belum berhasil dihentikan. Coba batalkan kembali.` and may retry.
- Cancel does not roll back source or database changes already committed by the
  workflow.
- A late callback after cancellation or timeout returns HTTP 409 and cannot
  revive the job.

## Rate limits

New sync jobs are limited to ten per user in a rolling hour. Joining a job that
is already active does not consume another slot. After every terminal result,
including cancellation, the dataset has a 60-second cooldown. The dashboard
uses `Retry-After` and `X-Data-Sync-Limit` to display the remaining seconds or
minutes rather than a fixed generic message.

## Troubleshooting decision tree

### `Starting` remains visible

1. Wait up to 60 seconds. A stale dispatch is released automatically after that
   deadline.
2. Check whether the Webhook node uses the production URL and `POST`.
3. Verify **Respond** is `Using Respond to Webhook Node` and the response node is
   before source/database work.
4. Verify the response is HTTP 202, `Content-Type: application/json`, and exactly
   contains `accepted: true` plus the received `job_id`.
5. Check the trigger-key header name and value without copying the value into
   tickets, screenshots, or logs.

### `Syncing` remains visible after n8n finishes

1. Inspect the execution by dashboard `job_id` or `correlation_id`, never by its
   token.
2. Confirm the claim node sent `execution_id: {{$execution.id}}` and returned
   `execute: true`.
3. Confirm the success path reaches its callback only after the database write,
   and every handled error path reaches a failure callback.
4. Check the callback HTTP result. A 401 means the per-job token/header is wrong;
   a 409 means the job is already terminal, unclaimed, canceled, or timed out;
   a 422 means the payload does not match an allowed status/result-code pair.
5. If no callback can be recovered, an authorized creator or sysadmin can cancel
   the execution, or the 30-minute execution timeout will release the dataset.

### Cancellation fails

1. Confirm the running n8n version is at least 1.99.1.
2. Confirm `N8N_EXECUTION_API_KEY` is present only in the dashboard backend and
   has execution read/stop permission.
3. Confirm `N8N_SYNC_BASE_URL` is the exact HTTPS origin that serves the public
   API and contains no path, query, credentials, or fragment.
4. Confirm the claim stored the real n8n execution ID. Jobs claimed before this
   deployment may not have an execution ID and cannot be safely stopped from the
   dashboard.
5. Retry cancel after correcting connectivity or permission. A failed stop does
   not mark the job canceled or release its concurrency guard.

### Workflow reports success but dashboard shows failure or timeout

1. Inspect the callback node's execution output and HTTP status.
2. Verify `status: succeeded`, `result_code: completed`, and a non-negative
   integer `rows_processed` when provided.
3. Compare the callback time with the 30-minute deadline. A callback after a
   terminal timeout is intentionally rejected.
4. Do not modify the dashboard row manually. Correct the workflow and start a
   new sync after the cooldown.

## Deployment order

1. Set `DATA_SYNC_ENABLED=false` and wait until no dataset has an active job.
2. Update all three claim nodes with the execution-ID body and verify their
   `execute: false` branch stops before source work. The previous backend safely
   ignores this additional JSON body during the transition.
3. Add `DATA_SYNC_DISPATCH_TIMEOUT_SECONDS=60`, keep
   `DATA_SYNC_JOB_TIMEOUT_SECONDS=1800`, and add the distinct n8n execution API
   key.
4. Deploy the schema/application update while the feature remains disabled.
5. Activate the workflows, enable dashboard sync, and run one controlled check
   per dataset.
6. To roll back, set `DATA_SYNC_ENABLED=false`. Existing machine claim/callback
   routes remain available so already-created jobs can settle.
