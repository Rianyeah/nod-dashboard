# Activity ENOM N8N: Staging + Atomic Monthly Replace

Target:

- Main table: `public.proker_enom_jatim_2026`
- Staging table: `public.proker_enom_jatim_2026_stage`
- Active month: `6`
- Source of truth: Google Sheets

Workflow ini mengganti seluruh data bulan aktif setiap hari. Data lama baru
dihapus setelah seluruh row Google Sheets berhasil masuk staging dan lolos
validasi.

## Why This Flow

- Tidak memerlukan UUID atau `unique_activity` dari Google Sheets.
- Perubahan posisi, penambahan, dan penghapusan row di Google Sheets aman.
- Tidak ada upsert per activity ke tabel utama.
- Delete dan insert tabel utama berjalan dalam satu transaksi PostgreSQL.
- Jika validasi atau insert gagal, data bulan lama tetap tersedia.
- `create_date` dan `kabupaten` tetap dikelola database.

`source_row_number` dan `unique_activity` pada tabel utama dibuat otomatis saat
finalisasi:

```text
source_row_number = bulan * 100000 + sheet_row_number
unique_activity   = enom-2026-<bulan>-<sheet_row_number>
```

Nilai ini hanya technical key. Google Sheets tidak perlu lagi memiliki kolom
`unique_activity`.

## 1. Install Database Schema

Migration project:

```text
backend/sql/activity_enom_staging.sql
```

Migration tersebut membuat:

- staging table dengan primary key `(batch_id, sheet_row_number)`;
- index untuk cleanup staging;
- function `public.replace_proker_enom_jatim_2026_month`;
- advisory lock agar finalisasi bulan yang sama tidak berjalan bersamaan.

Jalankan migration satu kali melalui Neon SQL Editor. Jangan menjalankannya
pada Postgres node yang menerima ribuan item.

Validasi:

```sql
SELECT
    to_regclass('public.proker_enom_jatim_2026_stage') AS staging_table,
    to_regprocedure(
        'public.replace_proker_enom_jatim_2026_month(text,smallint,integer)'
    ) AS replace_function;
```

Kedua kolom harus berisi nama object, bukan `NULL`.

## 2. N8N Workflow

Gunakan susunan node berikut:

```text
Schedule Trigger
  -> Google Sheets: Get Row(s)
  -> Code: Normalize Month
  -> Postgres: Load Staging
  -> Code: Finalize Payload
  -> Postgres: Atomic Replace
  -> optional notification
```

Atur workflow agar tidak overlap. Gunakan concurrency `1` jika tersedia pada
versi N8N yang dipakai.

## 3. Schedule Trigger

Contoh:

- Mode: `Every Day`
- Timezone: `Asia/Jakarta`
- Time: setelah Google Sheets selesai diperbarui

## 4. Google Sheets Node

Gunakan:

- Resource: `Sheet Within Document`
- Operation: `Get Row(s)`
- Range: `A:R`, atau `A:S` jika kolom lama `unique_activity` masih ada
- Output Formatting: unformatted values
- Date Formatting: format `Date Done` sebagai `yyyy-mm-dd` bila memungkinkan

Kolom `unique_activity` boleh tetap ada di sheet, tetapi flow ini mengabaikannya.

## 5. Code Node: Normalize Month

Mode:

```text
Run Once for All Items
```

Code:

```javascript
const TARGET_MONTH = 6;
const batchId = `activity-enom-${$execution.id}`;

function clean(value) {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

function pick(row, names) {
  for (const name of names) {
    if (row[name] !== undefined) return row[name];
  }
  return '';
}

function pad2(value) {
  return String(value).padStart(2, '0');
}

function toIsoDate(value, sheetRowNumber) {
  const raw = clean(value);
  if (!raw) return null;

  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;

  const dmy = raw.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (dmy) {
    const [, day, month, year] = dmy;
    return `${year}-${pad2(month)}-${pad2(day)}`;
  }

  const serial = Number(raw);
  if (Number.isFinite(serial) && serial > 20000) {
    const epoch = new Date(Date.UTC(1899, 11, 30));
    epoch.setUTCDate(epoch.getUTCDate() + Math.floor(serial));
    return epoch.toISOString().slice(0, 10);
  }

  throw new Error(
    `Invalid Date Done on sheet row ${sheetRowNumber}: ${raw}`
  );
}

const rows = items
  .map((item, index) => {
    const row = item.json;
    const bulan = Number(clean(pick(row, ['Bulan', 'bulan'])));

    if (bulan !== TARGET_MONTH) return null;

    // The number only needs to be unique and ordered inside this batch.
    const sheetRowNumber = index + 2;
    const siteId = clean(pick(row, ['Site ID', 'site_id'])).toUpperCase();
    const activity = clean(pick(row, ['Activity', 'activity']));
    const statusRaw = clean(pick(row, ['Status', 'status'])).toUpperCase();
    const weekRaw = clean(
      pick(row, ['WEEK DONE', 'Week Done', 'week_done'])
    );
    const weekDone = weekRaw === '' ? null : Number(weekRaw);

    if (!siteId) {
      throw new Error(`Missing Site ID on sheet row ${sheetRowNumber}`);
    }

    if (!activity) {
      throw new Error(`Missing Activity on sheet row ${sheetRowNumber}`);
    }

    if (statusRaw && !['OPEN', 'CLOSE'].includes(statusRaw)) {
      throw new Error(
        `Invalid status on sheet row ${sheetRowNumber}: ${statusRaw}`
      );
    }

    if (
      weekDone !== null &&
      (!Number.isInteger(weekDone) || weekDone < 1 || weekDone > 53)
    ) {
      throw new Error(
        `Invalid WEEK DONE on sheet row ${sheetRowNumber}: ${weekRaw}`
      );
    }

    const normalized = {
      batch_id: batchId,
      sheet_row_number: sheetRowNumber,
      bulan,
      baseline_activity: clean(
        pick(row, ['Baseline Ac', 'Baseline Activity', 'baseline_activity'])
      ),
      nop: clean(pick(row, ['NOP', 'nop'])).toUpperCase(),
      site_id: siteId,
      site_name: clean(pick(row, ['Site Name', 'site_name'])),
      part: clean(pick(row, ['Part', 'part'])),
      activity,
      info: clean(pick(row, ['Info', 'info'])),
      analisis: clean(pick(row, ['Analisis', 'analysis', 'analisis'])),
      week_done: weekDone,
      status: statusRaw || null,
      date_done: toIsoDate(
        pick(row, ['Date Done', 'date_done']),
        sheetRowNumber
      ),
      remark_1: clean(pick(row, ['Remark 1', 'remark_1'])),
      remark_2: clean(pick(row, ['Remark 2', 'remark_2'])),
      milestone: clean(pick(row, ['Milestone', 'milestone'])),
      xcek: clean(pick(row, ['XCEK', 'xcek'])),
      workshop: clean(pick(row, ['WORKSHOP', 'Workshop', 'workshop'])),
      target_workshop: clean(
        pick(row, [
          'TARGET WC',
          'TARGET WORK',
          'TARGET WORKSHOP',
          'Target Workshop',
          'target_workshop',
        ])
      ),
    };

    return normalized;
  })
  .filter(Boolean);

if (rows.length === 0) {
  throw new Error(`No Google Sheets rows found for month ${TARGET_MONTH}`);
}

const expectedRows = rows.length;

return rows.map((row) => ({
  json: {
    ...row,
    expected_rows: expectedRows,
    source_row_hash: JSON.stringify(row),
  },
}));
```

Output normalizer harus berisi seluruh row bulan 6. Untuk kondisi saat ini,
jumlahnya diperkirakan `2187`, tetapi validasi memakai jumlah aktual dari
Google Sheets dan tidak mengunci angka tersebut secara permanen.

## 6. Postgres Node: Load Staging

Operation:

```text
Execute Query
```

Options:

```text
Query Batching: Independently
```

Node ini menjalankan satu query untuk setiap input item.

Query:

```sql
INSERT INTO public.proker_enom_jatim_2026_stage (
    batch_id,
    sheet_row_number,
    bulan,
    baseline_activity,
    nop,
    site_id,
    site_name,
    part,
    activity,
    info,
    analisis,
    week_done,
    status,
    date_done,
    remark_1,
    remark_2,
    milestone,
    xcek,
    workshop,
    target_workshop,
    source_row_hash
) VALUES (
    $1::text,
    $2::integer,
    $3::smallint,
    NULLIF($4::text, ''),
    NULLIF($5::text, ''),
    NULLIF($6::text, ''),
    NULLIF($7::text, ''),
    NULLIF($8::text, ''),
    NULLIF($9::text, ''),
    NULLIF($10::text, ''),
    NULLIF($11::text, ''),
    $12::integer,
    UPPER(NULLIF($13::text, '')),
    $14::date,
    NULLIF($15::text, ''),
    NULLIF($16::text, ''),
    NULLIF($17::text, ''),
    NULLIF($18::text, ''),
    NULLIF($19::text, ''),
    NULLIF($20::text, ''),
    $21::text
)
ON CONFLICT (batch_id, sheet_row_number) DO UPDATE SET
    bulan = EXCLUDED.bulan,
    baseline_activity = EXCLUDED.baseline_activity,
    nop = EXCLUDED.nop,
    site_id = EXCLUDED.site_id,
    site_name = EXCLUDED.site_name,
    part = EXCLUDED.part,
    activity = EXCLUDED.activity,
    info = EXCLUDED.info,
    analisis = EXCLUDED.analisis,
    week_done = EXCLUDED.week_done,
    status = EXCLUDED.status,
    date_done = EXCLUDED.date_done,
    remark_1 = EXCLUDED.remark_1,
    remark_2 = EXCLUDED.remark_2,
    milestone = EXCLUDED.milestone,
    xcek = EXCLUDED.xcek,
    workshop = EXCLUDED.workshop,
    target_workshop = EXCLUDED.target_workshop,
    source_row_hash = EXCLUDED.source_row_hash,
    loaded_at = now()
RETURNING
    batch_id,
    bulan,
    $22::integer AS expected_rows;
```

Query Parameters:

```javascript
[
  $json.batch_id,
  $json.sheet_row_number,
  $json.bulan,
  $json.baseline_activity,
  $json.nop,
  $json.site_id,
  $json.site_name,
  $json.part,
  $json.activity,
  $json.info,
  $json.analisis,
  $json.week_done,
  $json.status,
  $json.date_done,
  $json.remark_1,
  $json.remark_2,
  $json.milestone,
  $json.xcek,
  $json.workshop,
  $json.target_workshop,
  $json.source_row_hash,
  $json.expected_rows
]
```

Conflict handling hanya digunakan di staging agar retry pada batch yang sama
idempotent. Tabel utama tidak memakai upsert per activity.

## 7. Code Node: Finalize Payload

Mode:

```text
Run Once for All Items
```

Code:

```javascript
if (items.length === 0) {
  throw new Error('No staging results received');
}

const first = items[0].json;
const expectedRows = Number(first.expected_rows);

if (!Number.isInteger(expectedRows) || expectedRows <= 0) {
  throw new Error(`Invalid expected_rows: ${first.expected_rows}`);
}

if (items.length !== expectedRows) {
  throw new Error(
    `Only ${items.length} of ${expectedRows} rows reached staging`
  );
}

return [
  {
    json: {
      batch_id: first.batch_id,
      bulan: Number(first.bulan),
      expected_rows: expectedRows,
    },
  },
];
```

Node ini memastikan Postgres finalization hanya dipanggil satu kali.

## 8. Postgres Node: Atomic Replace

Operation:

```text
Execute Query
```

Options:

```text
Query Batching: Single Query
```

Query:

```sql
SELECT *
FROM public.replace_proker_enom_jatim_2026_month(
    $1::text,
    $2::smallint,
    $3::integer
);
```

Query Parameters:

```javascript
[
  $json.batch_id,
  $json.bulan,
  $json.expected_rows
]
```

Expected output:

```text
result_batch_id
result_bulan
staged_rows
deleted_rows
inserted_rows
completed_at
```

`staged_rows` dan `inserted_rows` harus sama dengan `expected_rows`.

Function melakukan operasi berikut dalam satu transaksi:

1. Mengunci finalisasi bulan yang sama.
2. Memeriksa batch hanya berisi bulan target.
3. Memeriksa jumlah staging sama dengan `expected_rows`.
4. Menolak row tanpa `site_id` atau `activity`.
5. Menghapus data bulan target dari tabel utama.
6. Insert seluruh staging ke tabel utama.
7. Menghapus staging untuk batch yang berhasil.

Jika langkah 3-6 gagal, delete tabel utama ikut rollback.

## 9. Daily Validation

```sql
SELECT
    bulan,
    COUNT(*) AS rows,
    COUNT(DISTINCT source_row_number) AS distinct_source_rows,
    COUNT(DISTINCT unique_activity) AS distinct_keys,
    COUNT(*) FILTER (
        WHERE kabupaten IS NULL OR BTRIM(kabupaten) = ''
    ) AS missing_kabupaten,
    MAX(updated_at) AS last_update
FROM public.proker_enom_jatim_2026
WHERE bulan = 6
GROUP BY bulan;
```

Expected:

- `rows` sama dengan jumlah row bulan 6 di Google Sheets;
- `distinct_source_rows = rows`;
- `distinct_keys = rows`;
- `missing_kabupaten = 0`, kecuali site belum ada di availability log.

Audit staging yang tertinggal:

```sql
SELECT
    batch_id,
    bulan,
    COUNT(*) AS rows,
    MIN(loaded_at) AS first_loaded_at,
    MAX(loaded_at) AS last_loaded_at
FROM public.proker_enom_jatim_2026_stage
GROUP BY batch_id, bulan
ORDER BY last_loaded_at DESC;
```

Batch yang berhasil tidak akan muncul karena otomatis dibersihkan.

## 10. Failure Recovery

Jika `Load Staging` gagal:

- tabel utama tidak berubah;
- perbaiki data atau node yang gagal;
- jalankan ulang workflow.

Jika `Atomic Replace` gagal:

- tabel utama bulan 6 tetap memakai data lama;
- staging batch tetap tersedia untuk audit;
- baca pesan error jumlah row atau field yang invalid;
- setelah diperbaiki, jalankan workflow lagi dengan batch baru.

Cleanup batch gagal yang lebih lama dari tujuh hari:

```sql
DELETE FROM public.proker_enom_jatim_2026_stage
WHERE loaded_at < now() - INTERVAL '7 days';
```

Jangan menjalankan `DELETE FROM public.proker_enom_jatim_2026 WHERE bulan = 6`
secara terpisah di N8N. Selalu panggil function finalisasi.

## 11. Database-Owned Fields

N8N tidak mengirim field berikut ke tabel utama:

- `id`: sequence primary key;
- `source_row_number`: dibuat oleh function;
- `unique_activity`: dibuat oleh function;
- `create_date`: generated dari `bulan`;
- `kabupaten`: diisi trigger berdasarkan `site_id`;
- `imported_at` dan `updated_at`: diisi saat finalisasi.

## References

- N8N Google Sheets node: https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.googlesheets/
- N8N Postgres node: https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.postgres/
- N8N execution ID: https://docs.n8n.io/code/cookbook/builtin/execution/
- Neon connection pooling: https://neon.com/docs/connect/connection-pooling
