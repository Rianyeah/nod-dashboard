# N8N Telegram Site Detail Capture

`n8n/workflows/capture-site-detail.json` menerima Site ID dan chat ID, lalu mengirim satu PNG lengkap modal Detail Site sebagai Telegram Document. Workflow inactive saat diimpor dan tidak menyimpan password, cookie dashboard, capture token, Browserless key, atau Telegram token.

```text
capture_site_detail: Send the complete Site Detail modal for one normalized
Site ID to the originating Telegram chat. Inputs are site_id and chat_id.
The tool itself sends the document; never request or return image bytes.
```

## Zeabur

Gunakan dua nilai baru dan berbeda; jangan memakai ulang `N8N_API_KEY` atau `N8N_MAP_API_KEY`.

```powershell
python -c "import secrets; print(secrets.token_urlsafe(32))"
python -c "import base64, secrets; print(base64.urlsafe_b64encode(secrets.token_bytes(32)).decode())"
```

Tambahkan dan redeploy service `nod-dashboard`:

```text
N8N_CAPTURE_API_KEY=<nilai-random>
N8N_CAPTURE_SIGNING_SECRET=<nilai-base64-random>
PUBLIC_APP_ORIGIN=https://<domain-dashboard-produksi>
```

Origin harus HTTPS dan dapat dijangkau Browserless. Token berlaku 60 detik, site-scoped, dark-only, dan hanya berada pada fragment URL (`#token=`).

## N8N credentials dan workflow

| Nama | Tipe | Pengaturan |
| --- | --- | --- |
| `NOD Capture API Key` | Generic Header Auth | `X-N8N-Capture-API-Key` dengan nilai `N8N_CAPTURE_API_KEY` |
| `Browserless Authorization` | Generic Header Auth | Header sesuai layanan Browserless |
| `Telegram Bot` | Telegram API | Token bot Telegram |

Set environment n8n berikut tanpa memasukkan nilainya ke JSON workflow:

```text
NOD_DASHBOARD_ORIGIN=https://<domain-dashboard-produksi>
BROWSERLESS_BQL_URL=https://<endpoint-browserless-terdekat>/chromium/bql
```

Import workflow, assign ketiga credential, dan biarkan inactive sampai dipanggil sebagai subworkflow dengan *Wait for Sub-Workflow Completion*. Pilih region Browserless yang paling dekat dengan Zeabur.

```text
Execute Sub-workflow Trigger -> Validate Site ID -> Mint Capture Token
-> Prepare Browserless -> Browserless Capture -> Validate PNG and Create Binary
-> Prepare Telegram Upload -> Send Telegram Document -> Return Capture Status
```

BrowserQL memakai HTTPS POST, viewport `1200x1000`, DPR `1.5`, dan selector tepat `[data-capture-state="ready"][data-capture-site-id="SITE_ID"]`; tidak memakai fixed sleep. Screenshot dibatasi ke `.site-detail-modal`, PNG, dan `captureBeyondViewport: true`, sehingga seluruh modal sampai paling bawah ikut dikirim.

Node PNG mengecek signature, MIME, IHDR width/height, kecukupan dimensi modal, dan batas 50 MB sebelum membuat binary property `data`. Telegram memakai **Send Document** (bukan Send Photo), nama file `site-detail-SITE_ID.png`, dan retry upload sekali dengan binary sama—tanpa capture ulang.

## Telegram dan AI Agent

Bypass AI Agent secara deterministik untuk `/site BGL002`: trim, uppercase, validasi regex `^[A-Z0-9][A-Z0-9_-]{1,31}$`, lalu panggil subworkflow dengan `{ "site_id": "BGL002", "chat_id": "<telegram-chat-id>" }`.

Untuk bahasa natural, AI Agent boleh memilih `capture_site_detail` tetapi hanya meneruskan Site ID ternormalisasi dan chat ID asal. Jangan mengirim capture URL, base64, atau binary ke AI Agent. Output tool harus ringkas: `{ "sent": true, "site_id": "BGL002", "telegram_message_id": 123, "elapsed_ms": 8421 }`.

## Error, logging, dan acceptance

`INVALID_CAPTURE_INPUT`, `404`, dan `422` tidak di-retry. `401`/`403` adalah fatal. Hanya `429`, timeout, `5xx`, atau BrowserQL errors yang boleh satu retry dengan jitter. `CAPTURE_PNG_*` tidak boleh mengirim gambar parsial. Telegram upload dapat satu retry tanpa screenshot ulang. Hubungkan error output ke node `Capture Failure` sesuai versi n8n; jangan mengaktifkan retry global pada issuer.

Jangan log capture URL, fragment token, respons Browserless mentah, base64, PNG bytes, atau credential headers. Redact `X-N8N-Capture-API-Key`, `Authorization`, dan Telegram token. Simpan hanya request ID, Site ID, `token_issue_ms`, `capture_ready_ms`, `screenshot_ms`, `telegram_upload_ms`, `total_ms`, bytes, dimensi, hasil, dan cold/warm. Atur pruning execution data agar binary dan header sensitif tidak tersimpan.

Untuk acceptance, jalankan 20 capture (site biasa, Data Lainnya terbesar, dan trend/performance kosong), catat metrik aman, hitung p50/p95. Target median <= 8 detik dan p95 <= 15 detik tanpa crop atau Site ID salah. Uji juga site tidak ada, token kadaluarsa, transient Browserless failure, dan retry Telegram. API/token, route capture, ready marker, kontrak workflow, dan build frontend telah diverifikasi lokal; Browserless hosted, Telegram, serta metrik produksi belum diverifikasi karena credential dan endpoint produksi tidak tersedia di workspace.
