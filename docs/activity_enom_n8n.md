# Activity ENOM N8N Upsert

Target table: `public.proker_enom_jatim_2026`

Flow ini dipakai untuk update daily dari Google Sheets ke NeonDB. Kunci update sekarang adalah kolom Google Sheets `unique_activity`, bukan `upsert_key`.

## Status Schema Neon

Perubahan yang dipakai:

- Kolom lama `upsert_key` pada `public.proker_enom_jatim_2026` diganti menjadi `unique_activity`.
- Unique constraint sekarang memakai `unique_activity`.
- N8N tidak perlu mengirim `create_date` atau `kabupaten`.

Reference migration yang sudah diterapkan:

```sql
ALTER TABLE public.proker_enom_jatim_2026
RENAME COLUMN upsert_key TO unique_activity;

ALTER TABLE public.proker_enom_jatim_2026
RENAME CONSTRAINT proker_enom_jatim_2026_upsert_key_key
TO proker_enom_jatim_2026_unique_activity_key;
```

Validasi schema:

```sql
SELECT column_name
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'proker_enom_jatim_2026'
  AND column_name IN ('upsert_key', 'unique_activity');
```

Expected result: hanya `unique_activity`.

## Kunci Update

Google Sheets sekarang punya kolom `unique_activity` dengan format:

```text
<posisi_row>-<lower_site_id>-<bulan>
```

Contoh:

```text
11948-bdo033-6
11949-bdo044-6
11950-bdo065-6
```

Aturan penting:

- `unique_activity` wajib unik.
- `unique_activity` tidak boleh berubah untuk activity yang sama.
- Perubahan daily seperti `Status`, `WEEK DONE`, dan `Date Done` akan update row lama karena conflict key-nya sama.
- Jangan pakai `status`, `week_done`, atau `date_done` sebagai bagian key.
- Kalau row lama dipindah, disisipkan, atau dihapus di Google Sheets, pastikan nilai `unique_activity` lama tetap dipertahankan. Jika formula ikut berubah, Neon akan menganggapnya row baru.

## Database-Owned Fields

Jangan kirim kolom ini dari N8N:

- `id`: identity primary key.
- `create_date`: otomatis dari `bulan`, format `make_date(2026, bulan, 1)`.
- `kabupaten`: otomatis lookup dari `availability_logs_jatim` berdasarkan `site_id`.
- `imported_at`: default `now()`.
- `updated_at`: diisi oleh query upsert.

Field wajib dari N8N:

- `source_row_number`
- `unique_activity`
- `bulan`
- `source_row_hash`

Constraint penting:

- `bulan` harus `1` sampai `12`.
- `status` harus `OPEN`, `CLOSE`, atau null.
- `week_done` harus `1` sampai `53`, atau null.
- `source_row_number` tetap unik, tapi bukan conflict key daily update.
- `unique_activity` adalah conflict key utama.

## Daily Workflow

Recommended N8N workflow:

```text
Schedule Trigger
  -> Google Sheets: Get Row(s), range A:S
  -> Code: Normalize data dan ambil Bulan 6
  -> Postgres: Upsert direct ke proker_enom_jatim_2026
  -> optional Postgres/Slack/Telegram success log
```

Untuk bulan berikutnya, ganti `TARGET_MONTH` di Code node.

## 1. Schedule Trigger

Contoh setting:

- Mode: `Every Day`
- Timezone: `Asia/Jakarta`
- Time: `06:00` atau setelah sheet selesai diupdate

## 2. Google Sheets Node

Gunakan node Google Sheets:

- Resource: `Sheet Within Document`
- Operation: `Get Row(s)`
- Document: pilih spreadsheet Activity ENOM
- Sheet: pilih sheet data
- Data range: `A:S`
- Output Formatting: gunakan unformatted values jika tersedia
- Date Formatting: lebih aman format `Date Done` di sheet sebagai `yyyy-mm-dd`

Kolom S harus bernama `unique_activity`.

## 3. Code Node: Normalize Bulan 6

Code ini membaca header dari sheet, mengambil `unique_activity`, dan hanya meneruskan data bulan aktif.

```javascript
const TARGET_MONTH = 6;
const SOURCE_ROW_OFFSET = 600000;

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

function toIsoDate(value) {
  const raw = clean(value);
  if (!raw) return '';

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

  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return '';
  return parsed.toISOString().slice(0, 10);
}

return items
  .map((item, index) => {
    const row = item.json;
    const bulan = Number(clean(pick(row, ['Bulan', 'bulan'])));

    if (bulan !== TARGET_MONTH) return null;

    const sheetRowNumber = Number(row.row_number || row.rowNumber || row.__rowNum || index + 2);
    const sourceRowNumber = SOURCE_ROW_OFFSET + sheetRowNumber;
    const siteId = clean(pick(row, ['Site ID', 'site_id'])).toUpperCase();
    const uniqueActivity = clean(pick(row, [
      'unique_activity',
      'Unique Activity',
      'UNIQUE_ACTIVITY'
    ])).toLowerCase();
    const status = clean(pick(row, ['Status', 'status'])).toUpperCase();
    const weekDone = clean(pick(row, ['WEEK DONE', 'Week Done', 'week_done']));

    if (!uniqueActivity) {
      throw new Error(`Missing unique_activity on sheet row ${sheetRowNumber}`);
    }

    if (!siteId) {
      throw new Error(`Missing Site ID on sheet row ${sheetRowNumber}`);
    }

    if (status && !['OPEN', 'CLOSE'].includes(status)) {
      throw new Error(`Invalid status on sheet row ${sheetRowNumber}: ${status}`);
    }

    const normalized = {
      source_row_number: sourceRowNumber,
      unique_activity: uniqueActivity,
      bulan,
      baseline_activity: clean(pick(row, ['Baseline Ac', 'Baseline Activity', 'baseline_activity'])),
      nop: clean(pick(row, ['NOP', 'nop'])).toUpperCase(),
      site_id: siteId,
      site_name: clean(pick(row, ['Site Name', 'site_name'])),
      part: clean(pick(row, ['Part', 'part'])),
      activity: clean(pick(row, ['Activity', 'activity'])),
      info: clean(pick(row, ['Info', 'info'])),
      analisis: clean(pick(row, ['Analisis', 'analisis'])),
      week_done: weekDone,
      status,
      date_done: toIsoDate(pick(row, ['Date Done', 'date_done'])),
      remark_1: clean(pick(row, ['Remark 1', 'remark_1'])),
      remark_2: clean(pick(row, ['Remark 2', 'remark_2'])),
      milestone: clean(pick(row, ['Milestone', 'milestone'])),
      xcek: clean(pick(row, ['XCEK', 'xcek'])),
      workshop: clean(pick(row, ['WORKSHOP', 'Workshop', 'workshop'])),
      target_workshop: clean(pick(row, [
        'TARGET WC',
        'TARGET WORK',
        'TARGET WORKSHOP',
        'Target Workshop',
        'target_workshop'
      ])),
    };

    return {
      json: {
        ...normalized,
        source_row_hash: JSON.stringify(normalized),
      },
    };
  })
  .filter(Boolean);
```

Catatan:

- `source_row_number` dibuat `600000 + sheet row number` supaya sesuai pola data bulan 6 yang sudah ada.
- `unique_activity` tetap dibaca dari Google Sheets, bukan dibuat ulang di N8N.
- Jika `Date Done` seperti `03/04/2026`, code ini membaca sebagai `2026-04-03`.

## 4. Postgres Credentials

Buat credential Postgres di N8N dari Neon pooled connection:

- Host: Neon host dengan `-pooler`, contoh `ep-xxxxx-pooler.ap-southeast-1.aws.neon.tech`
- Database: `neondb`
- User: Neon role
- Password: dari Neon
- SSL: required
- Port: `5432`

Jangan taruh connection string di note workflow. Simpan hanya di N8N credentials.

## 5. Postgres Node: Direct Upsert

Gunakan Operation `Execute Query`, run once for each input item, lalu bind parameter sesuai urutan array di bawah.

```sql
INSERT INTO public.proker_enom_jatim_2026 (
    source_row_number,
    unique_activity,
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
    $1::integer,
    $2::text,
    $3::smallint,
    NULLIF($4::text, ''),
    NULLIF($5::text, ''),
    NULLIF($6::text, ''),
    NULLIF($7::text, ''),
    NULLIF($8::text, ''),
    NULLIF($9::text, ''),
    NULLIF($10::text, ''),
    NULLIF($11::text, ''),
    NULLIF($12::text, '')::integer,
    UPPER(NULLIF($13::text, '')),
    NULLIF($14::text, '')::date,
    NULLIF($15::text, ''),
    NULLIF($16::text, ''),
    NULLIF($17::text, ''),
    NULLIF($18::text, ''),
    NULLIF($19::text, ''),
    NULLIF($20::text, ''),
    $21::text
)
ON CONFLICT (unique_activity) DO UPDATE SET
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
    updated_at = now();
```

Kenapa `source_row_number` tidak diupdate saat conflict:

- Conflict key harian adalah `unique_activity`.
- Jika row di Google Sheets berubah posisi tapi `unique_activity` lama masih dipertahankan, update tidak akan gagal karena `source_row_number` lama tidak dipaksa berubah.
- Untuk row baru, `source_row_number` tetap diisi saat insert.

Bind query parameters:

```javascript
[
  $json.source_row_number,
  $json.unique_activity,
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
  $json.source_row_hash
]
```

## 6. Daily Validation

Cek jumlah row bulan aktif:

```sql
SELECT
    bulan,
    COUNT(*) AS rows,
    COUNT(DISTINCT unique_activity) AS distinct_unique_activity,
    COUNT(*) FILTER (
        WHERE unique_activity IS NULL OR TRIM(unique_activity) = ''
    ) AS missing_unique_activity,
    COUNT(*) FILTER (
        WHERE kabupaten IS NULL OR TRIM(kabupaten) = ''
    ) AS missing_kabupaten,
    MAX(updated_at) AS last_update
FROM public.proker_enom_jatim_2026
WHERE bulan = 6
GROUP BY bulan;
```

Expected:

- `rows` sama dengan jumlah activity bulan 6 di Google Sheets.
- `distinct_unique_activity` sama dengan `rows`.
- `missing_unique_activity = 0`.
- `missing_kabupaten = 0`, kecuali ada `site_id` yang memang belum ada di `availability_logs_jatim`.

Cek sample key:

```sql
SELECT source_row_number, unique_activity, site_id, status, week_done, date_done, updated_at
FROM public.proker_enom_jatim_2026
WHERE bulan = 6
ORDER BY source_row_number
LIMIT 10;
```

Cek dashboard:

```text
http://127.0.0.1:5176/activity-enom
```

Gunakan filter `Bulan = Juni`.

## 7. Jika Data Masih Double

Audit duplicate key:

```sql
SELECT unique_activity, COUNT(*) AS rows
FROM public.proker_enom_jatim_2026
WHERE bulan = 6
GROUP BY unique_activity
HAVING COUNT(*) > 1
ORDER BY rows DESC, unique_activity;
```

Audit row tanpa key:

```sql
SELECT COUNT(*) AS rows_without_key
FROM public.proker_enom_jatim_2026
WHERE bulan = 6
  AND (unique_activity IS NULL OR TRIM(unique_activity) = '');
```

Penyebab paling umum:

- N8N masih memakai SQL lama `ON CONFLICT (upsert_key)`.
- Google Sheets mengubah formula `unique_activity` untuk row lama.
- Range Google Sheets belum mencakup kolom S.
- Postgres node tidak mengirim parameter `$json.unique_activity`.

## 8. Operational Notes

- Untuk daily update, jangan delete-replace bulan 6 kalau `unique_activity` sudah stabil.
- N8N cukup upsert row-by-row.
- Kolom yang paling sering berubah (`status`, `week_done`, `date_done`) aman diupdate lewat query di atas.
- Trigger database tetap mengisi `kabupaten` berdasarkan `site_id`.
- `create_date` akan menjadi `2026-06-01` untuk `bulan = 6`.

## References

- N8N Google Sheets node: https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.googlesheets/
- N8N Postgres node: https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.postgres/
- Neon connection pooling: https://neon.com/docs/connect/connection-pooling
