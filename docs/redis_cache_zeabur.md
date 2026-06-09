# Redis Cache on Zeabur

This guide configures the optional Redis response cache for the Network Reporting API.
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
REDIS_KEY_PREFIX=nod:v1
```

Use Zeabur's variable reference picker to select `REDIS_CONNECTION_STRING` from the Redis
service. Do not copy Redis passwords into the repository or application logs.

The application also works without `REDIS_URL`. In that mode, Reporting requests return
`X-Cache: BYPASS` and read directly from PostgreSQL.

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

Expected Redis field:

```json
{
  "status": "ok",
  "database": "connected",
  "redis": "connected",
  "service": "nod-backend"
}
```

Redis being `disabled` or `unreachable` does not change the top-level status while
PostgreSQL is connected.

## 4. Verify Reporting cache behavior

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

## 5. Configure N8N invalidation

After the database import transaction succeeds, add an **HTTP Request** node:

```text
Method: POST
URL: https://YOUR-DOMAIN/api/v1/admin/cache/invalidate?scope=reporting
Header: X-N8N-API-Key = <same value as N8N_API_KEY on nod-dashboard>
Body: none
Retry on failure: enabled
```

Successful response:

```json
{
  "scope": "reporting",
  "deleted_keys": 12,
  "status": "invalidated"
}
```

The endpoint returns `503` when Redis cannot be reached. N8N should retry, while the
five-minute TTL remains the fallback against permanently stale responses.

The existing endpoint below also invalidates Reporting keys after rebuilding the monthly
PostgreSQL aggregate:

```text
POST /api/v1/admin/metrics/refresh?bulan=5&tahun=2026
```

## 6. Operations and rollback

- Monitor Redis memory, command rate, evictions, and connection count in Zeabur Metrics.
- Keep the Redis service private; do not publish port `6379`.
- To disable caching, remove or empty `REDIS_URL` and redeploy `nod-dashboard`.
- Deleting Redis data is safe for this integration because cached values are rebuilt from
  PostgreSQL.
- Change `REDIS_KEY_PREFIX` only when intentionally starting a new cache namespace.
