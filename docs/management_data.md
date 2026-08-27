# Management Data, RBAC, and Ticketing Takeover

## Roles

| Role | Dashboard | Import data and PIC aliases | Users and roles |
|---|---:|---:|---:|
| `viewer` | Yes | No | No |
| `data_admin` | Yes | Yes | No |
| `sysadmin` | Yes | Yes | Yes |

The existing `DASHBOARD_USER` account remains a read-only `viewer` during migration. Its username does not imply an administrative role. Database users are stored in `app_users`, and changing a role, password, or active state increments `session_version` so existing sessions are revoked.

Create the first database-backed sysadmin from the backend directory:

```powershell
python scripts/manage_dashboard_user.py --username nod-sysadmin --role sysadmin
```

The script reads `backend/.env` by default, prompts for the password without echoing it, and creates the idempotent management schema before saving the user.

## Import workflow

The `/management-data` page exposes only targets registered in backend code. Operators cannot submit a table name or SQL statement.

1. Select an allowlisted target.
2. Upload compatible `.xlsx` or UTF-8 `.csv` files.
3. Validate and review the insert, update, unchanged, invalid, and warning counts.
4. Commit the validated job.
5. Review the immutable source row staging and job audit history.

Uploads are limited to 8 MB per file and 20 MB total. XLSX archives are checked before parsing. Macro-enabled formats are not accepted, and formulas in key fields are rejected.

### `ticketing_swfm_non_inap`

- Accepts multiple PMS, PMG, FNA, and BBM files.
- Uses `ticket_number` as the upsert key.
- Keeps historical tickets that are absent from a later cumulative workbook.
- Stores the original PIC plus a normalized key.
- Imports blank PIC values with a warning, but excludes them from takeover ranking.

### `ticketing_fault_center`

- Accepts one file per job.
- Requires the complete allowlisted export schema.
- Requires exactly one year and month.
- Replaces only that month inside one transaction.
- Rejects ticket numbers already used by another period.

## Combined takeover ranking

The Ticketing dashboard combines:

- Fault Center rows where `takeover = TAKE OVER`, `pic_take_over_ticket` is not blank, and the normalized category is BPS or TS.
- PMS, PMG, FNA, and BBM rows where the normalized takeover PIC is not blank.

The result contains Rank, PIC, BPS, TS, PMS, PMG, FNA, BBM, Avg daily, and Total Takeover. Avg daily divides Total Takeover by the inclusive calendar-day count of the active period. Canonical and custom ranges use their selected boundaries, a legacy month-only filter sums that calendar month's days across the years present in the filtered takeover data, and an unbounded request uses the earliest-to-latest filtered takeover date. Total Takeover is highlighted green only when it is greater than 26 tickets per active calendar month. PIC aliases are applied at query time, so correcting an alias immediately updates historical ranking without rewriting source rows. The shared period and NOP filters apply to the combined ranking.

## Deployment order

1. Deploy the backend. Startup creates the idempotent schema in `backend/sql/management_data.sql`.
2. Run the sysadmin bootstrap command once.
3. Sign in with the new sysadmin and create `data_admin` accounts.
4. Upload and validate the source files in Management Data.
5. Commit only after the preview counts match the source controls.

Do not grant `data_admin` or `sysadmin` by renaming the legacy environment account. Roles are always explicit database records.
