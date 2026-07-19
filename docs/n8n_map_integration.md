# N8N Static Map: Sector GeoJSON

Use the dedicated read-only endpoint for N8N static-map and Telegram workflows. Do not use a
dashboard session cookie or the admin `N8N_API_KEY`.

## Zeabur variable

Create a new random value and save it only in the `nod-dashboard` service and N8N credential:

```powershell
python -c "import secrets; print(secrets.token_urlsafe(32))"
```

Set the output as:

```text
N8N_MAP_API_KEY=<new-random-value>
```

Redeploy after adding the variable. The application intentionally refuses to start without it.

## HTTP Request node

```text
Method: GET
URL: https://nod-dashboard-secure.zeabur.app/api/v1/integrations/n8n/map/sectors
Authentication: None
Header: X-N8N-Map-API-Key = <N8N_MAP_API_KEY>
Response format: JSON
```

Optional query parameters preserve the previous sector filter contract:

```text
site_id=BGL001
nop=SIDOARJO
```

The response remains GeoJSON:

```json
{
  "type": "FeatureCollection",
  "features": []
}
```

## Expected responses

- `200`: authenticated GeoJSON response.
- `401`: missing or incorrect `X-N8N-Map-API-Key`.
- `400`: request reached an unexpected host; verify the secure domain.
- `500`: database or geometry-processing error; enable retry in the N8N HTTP Request node.

The map key cannot access `/api/v1/admin/*`, login routes, or other dashboard data.
