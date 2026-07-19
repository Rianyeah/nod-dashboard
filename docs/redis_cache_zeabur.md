# Redis Cache on Zeabur

This guide configures the optional Redis response cache for Home overview, global filters,
and Network Reporting.
PostgreSQL remains the source of truth, so the dashboard continues to work when Redis is
disabled or temporarily unreachable.

## 1. Zeabur service layout

Keep `nod-dashboard` and `redis` in the same Zeabur project and environment:

```text
nod-dashboard project
|- nod-dashboard
`- redis
```

Redis does not need public networking. The dashboard must use the Redis service's private
connection string.

## 2. Dashboard variables

Open **nod-dashboard > Variable** and configure:

```env
REDIS_URL=${REDIS_CONNECTION_STRING}
REDIS_CACHE_TTL_SECONDS=300
OVERVIEW_CACHE_TTL_SECONDS=60
FILTER_CACHE_TTL_SECONDS=300
REDIS_KEY_PREFIX=nod:v1
```

Use Zeabur's variable reference picker to select `REDIS_CONNECTION_STRING` from the Redis
service. Do not copy Redis passwords into the repository or application logs.

The application also works without `REDIS_URL`. In that mode, cached endpoints return
`X-Cache: BYPASS` and read directly from PostgreSQL.

Do not publish Redis port `6379`, copy its credentials to GitHub, or put them into the
Docker image. `REDIS_CONNECTION_STRING` must come from the private Redis service in the
same Zeabur project/environment.

## 3. Deploy and verify connectivity

Redeploy `nod-dashboard` after the variables and application image are updated. In the
dashboard service logs, expect one of:

```text
[NOD] Redis cache connected.
[NOD] Redis cache is disabled.
[NOD] WARNING: Redis cache is unreachable; continuing without cache.
```

From **nod-dashboard > Command**, verify the private connection:

```bash
python -c "import asyncio, os; from redis.asyncio import from_url; r=from_url(os.environ['REDIS_URL']); print(asyncio.run(r.ping()))"
```

Expected output:

```text
True
```

Check the application health endpoint:

```bash
curl -s https://YOUR-DOMAIN/api/v1/health
```

The public probe is intentionally minimal and should return HTTP 200:

```json
{
  "status": "ok"
}
```

Use the startup log and private `PING` command above for Redis-specific diagnostics. The
public health response does not expose dependency details.

## 4. Verify Home and filter cache behavior

Login in the dashboard, open **Developer Tools > Network**, then reload Home twice within
60 seconds. Inspect these authenticated responses:

```text
/api/v1/overview                         MISS -> HIT
/api/v1/availability/latest-period       MISS -> HIT
/api/v1/sites/filters/options            MISS -> HIT
/api/v1/impact-service/filters           MISS -> HIT
/api/v1/transport-quality/filters        MISS -> HIT
/api/v1/ticketing/filters                MISS -> HIT
```

Home keys include normalized month, year, and NOP. Filter keys use a five-minute TTL.
Overview responses containing partial `errors` are not cached.

## 5. Verify Reporting cache behavior

Call the same Reporting URL twice and inspect its headers:

```bash
curl -i "https://YOUR-DOMAIN/api/v1/reporting/scorecards?trx_month=2026-05&nop=SIDOARJO"
curl -i "https://YOUR-DOMAIN/api/v1/reporting/scorecards?trx_month=2026-05&nop=SIDOARJO"
```

Expected sequence:

```text
X-Cache: MISS
X-Cache: HIT
```

A different month or NOP uses a different key. When Redis is unavailable, the header is:

```text
X-Cache: BYPASS
```

## 6. Configure N8N refresh and invalidation

After an Availability import transaction commits, call the metrics refresh endpoint. It
rebuilds `site_month_metrics` and then invalidates `reporting`, `overview`, and `filters`:

```text
Method: POST
URL: https://YOUR-DOMAIN/api/v1/admin/metrics/refresh?bulan=5&tahun=2026
Header: X-N8N-API-Key = <same value as N8N_API_KEY on nod-dashboard>
Body: none
Retry on failure: enabled
```

For other imports, invalidate all cached dashboard resources after the database commit:

After the database import transaction succeeds, add an **HTTP Request** node:

```text
Method: POST
URL: https://YOUR-DOMAIN/api/v1/admin/cache/invalidate?scope=all
Header: X-N8N-API-Key = <same value as N8N_API_KEY on nod-dashboard>
Body: none
Retry on failure: enabled
```

Successful response:

```json
{
  "scope": "all",
  "deleted_keys": 12,
  "status": "invalidated"
}
```

Supported scopes are:

```text
reporting
overview
filters
all
```

The explicit invalidation endpoint returns `503` when Redis cannot be reached. N8N should
retry. A Redis invalidation failure after metrics refresh never rolls back a successful
PostgreSQL refresh; TTL expiry remains the fallback.

## 7. Operations and rollback

- Monitor Redis memory, command rate, evictions, and connection count in Zeabur Metrics.
- Keep the Redis service private; do not publish port `6379`.
- To disable caching, remove or empty `REDIS_URL` and redeploy `nod-dashboard`.
- Deleting Redis data is safe for this integration because cached values are rebuilt from
  PostgreSQL.
- Change `REDIS_KEY_PREFIX` only when intentionally starting a new cache namespace.
