# N8N Data Sync Runbook

## Scope

This runbook connects the dashboard to the three existing production n8n sync
workflows. Keep the existing source, transformation, and database-write nodes
unchanged. Add only the authenticated production webhook entry, job claim, and
terminal callback around the existing flow.

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
DATA_SYNC_JOB_TIMEOUT_SECONDS=1800
N8N_SYNC_BASE_URL=https://n8n.example.internal
N8N_IMPACT_SERVICE_SYNC_WEBHOOK_URL=https://n8n.example.internal/webhook/<redacted-path>
N8N_DATA_MASTER_SYNC_WEBHOOK_URL=https://n8n.example.internal/webhook/<redacted-path>
N8N_ACTIVITY_ENOM_SYNC_WEBHOOK_URL=https://n8n.example.internal/webhook/<redacted-path>
N8N_SYNC_TRIGGER_API_KEY=<redacted-minimum-32-characters>
```

All webhook URLs must use the exact HTTPS origin from `N8N_SYNC_BASE_URL`, with
no credentials, query string, or fragment. The sync trigger key must be unique;
do not reuse another n8n API or capture key.

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
4. POST to `claim_url`, passing `job_token` in `X-Data-Sync-Job-Token`.
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
  --header "X-Data-Sync-Job-Token: <redacted-job-token>" \
  "https://dashboard.example/api/v1/integrations/n8n/data-sync/11111111-1111-4111-8111-111111111111/claim"
```

A winning claim returns:

```json
{ "execute": true }
```

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
- Confirm a viewer sees `Starting...`, then `Syncing mm:ss`, can navigate and use
  filters while it runs, and sees the terminal notification.

If a workflow cannot call back, the dashboard marks it timed out after
`DATA_SYNC_JOB_TIMEOUT_SECONDS` (30 minutes by default). Investigate by
`correlation_id` or `job_id`; never search logs using the job token.
