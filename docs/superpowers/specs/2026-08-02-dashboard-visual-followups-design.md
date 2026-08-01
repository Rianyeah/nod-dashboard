# Dashboard Visual Follow-ups Design

**Tanggal:** 2026-08-02

**Status:** Disetujui

**Branch:** `codex/dashboard-visual-followups`

**Basis:** `origin/main` pada merge commit PR #23 (`9277121`)

## Tujuan

Menyelesaikan lima perbaikan terarah pada NOD Dashboard tanpa mengubah information architecture atau visual inti peta dan tower:

1. Memperbarui copy, password visibility, dan background Vanta Fog pada Login.
2. Menampilkan Notes antenna di preview dan hasil gambar Tower Visualizer.
3. Membuat seri bernilai kecil pada Weekly Quality Trend tetap terbaca melalui dual Y-axis.
4. Membedakan warna Revenue dan Payload pada Home Performance Trend.
5. Memperkuat karakter dan kontras sidebar pada light mode.

## Design Read

Perubahan ini adalah targeted evolution untuk dashboard operasional NOC. Bahasa visual Graphite dan Telkomsel Red dipertahankan. Motion hanya diperkuat pada Login, sedangkan halaman data tetap padat, stabil, dan mudah dipindai.

- `DESIGN_VARIANCE: 4`
- `MOTION_INTENSITY: 4` pada Login dan `2` pada dashboard
- `VISUAL_DENSITY: 8` pada dashboard
- Mode redesign: preserve
- Design system: token CSS, Tailwind, shadcn primitives, Lucide, dan Recharts yang sudah digunakan proyek

Skill anti-slop diterapkan hanya pada komposisi Login dan kalibrasi warna. Aturan dashboard existing tetap menjadi sumber utama untuk halaman data.

## Temuan Existing

### Login

`LoginPage.jsx` masih menampilkan judul `NOD Dashboard`, footer `Monitoring Availability Site · Jawa Timur`, dan input password tanpa tombol visibility. Dependensi `three` dan `vanta` sudah terkunci di `frontend/package.json`, sehingga tidak diperlukan script CDN global.

### Tower Visualizer

`antenna.note` sudah dipertahankan oleh `normalizeAntenna()` dan diedit melalui `TowerPlanAntennaEditor`. Generator callout pada `towerPlanSvg.js` hanya membentuk detail Sector, Leg/Side, Height, Azimuth, CID, dan Mechanical Tilt. Notes tidak pernah dimasukkan ke array detail SVG.

### Transport Quality

Weekly Quality Trend memakai satu `YAxis` untuk empat count series. Seri dengan nilai ribuan menentukan domain sehingga seri pada rentang 0-50 menempel di baseline.

### Home

`homeChartConfig` memakai chart neutral untuk Revenue dan chart info untuk Payload. Pada tema graphite kedua warna memiliki luminance yang berdekatan dan sulit dibedakan pada area chart.

### Sidebar Light Mode

Sidebar light mode memakai satu warna datar `#CBD1D9`. Nilai ini terlalu dekat dengan canvas light mode dan membuat sidebar terlihat pucat.

## Pendekatan Terpilih

Targeted modular patch dipilih. Perubahan dipisahkan berdasarkan tanggung jawab, helper perhitungan dibuat sebagai fungsi murni, dan perilaku baru dilindungi oleh test sebelum production code ditulis.

Pendekatan inline ditolak karena akan mencampur lifecycle Vanta dan perhitungan domain ke dalam komponen besar. Refactor visual menyeluruh juga ditolak karena melebihi ruang lingkup dan meningkatkan risiko regresi.

## Rancangan Teknis

### 1. Login Fog Background dan Password Visibility

Komponen baru `frontend/src/features/auth/LoginFogBackground.jsx` bertanggung jawab hanya atas lifecycle Vanta.

- Menerima child content dan menyediakan elemen target melalui `ref`.
- Melakukan dynamic import `three` dan `vanta/dist/vanta.fog.min` di dalam `useEffect` agar bundle dashboard lain tidak memuat WebGL.
- Mengirim instance Three melalui opsi `THREE` ke Vanta.
- Menyimpan effect instance dan memanggil `destroy()` saat unmount.
- Mengabaikan hasil import yang selesai setelah komponen unmount.
- Tidak menginisialisasi Vanta ketika `prefers-reduced-motion: reduce` aktif.
- Mempertahankan static graphite-red fallback jika import atau WebGL gagal.
- Kegagalan dekorasi tidak boleh memblokir atau mengubah proses autentikasi.

Konfigurasi Vanta:

```js
{
  mouseControls: true,
  touchControls: true,
  gyroControls: false,
  minHeight: 200,
  minWidth: 200,
  highlightColor: 0x000000,
  midtoneColor: 0xe60013,
  lowlightColor: 0x000000,
  baseColor: 0x000000,
  blurFactor: 0.64,
  speed: 2.6,
  zoom: 1.3,
}
```

Nilai `0x#e60013` dari contoh awal dikoreksi menjadi `0xe60013` karena hanya bentuk kedua yang valid sebagai hexadecimal number JavaScript.

`LoginPage.jsx` akan:

- Mengubah heading menjadi `NOD`.
- Mengubah footer menjadi `All in one Dashboard ENOM and Tools`.
- Mempertahankan subheading existing `Network Operation Dashboard · Jawa Timur`.
- Menambah state `showPassword`.
- Mengganti `type` input antara `password` dan `text` tanpa mengubah value.
- Menambah tombol icon Eye/EyeOff pada sisi kanan input.
- Menggunakan `aria-label`, `aria-pressed`, dan focus style yang terlihat.
- Menggunakan `min-h-[100dvh]` untuk stabilitas viewport mobile.

Layer Login:

1. Static fallback background.
2. Canvas Vanta yang tidak menerima fokus keyboard.
3. Scrim ringan untuk menjaga kontras.
4. Panel autentikasi dan theme toggle.

### 2. Notes pada Callout Tower Visualizer

State dan editor antenna tidak diubah. Perbaikan dilakukan pada sumber masalah, yaitu generator SVG.

`towerPlanSvg.js` akan:

- Mengambil `String(antenna.note || '').trim()`.
- Tidak menghasilkan markup tambahan ketika Notes kosong.
- Membungkus Notes dengan helper SVG text wrapping existing.
- Membatasi tampilan maksimal tiga baris dan menambahkan ellipsis jika melebihi ruang.
- Menambahkan prefix `NOTE:` pada baris pertama.
- Memasukkan baris Notes ke perhitungan `cardHeight` sebelum cursor kolom berikutnya ditentukan.
- Meng-escape setiap baris dengan `escapeXml()`.
- Menambah atribut data untuk memudahkan regression test tanpa memengaruhi tampilan.

Preview dialog dan file download tidak memerlukan jalur terpisah karena keduanya menggunakan generator SVG yang sama. Geometry tower, helicopter view, site data, warna antenna, dan urutan callout tidak diubah.

### 3. Dual Y-axis Weekly Quality Trend

Helper baru `frontend/src/features/transport-quality/transportQualityTrendAxes.js` akan menentukan axis untuk setiap series dari data terfilter.

Series yang dinilai:

- `pl_over_1_sites`
- `latency_over_5_sites`
- `jitter_not_clear_sites`
- `thi_fail_sites`

Aturan:

- Hitung nilai maksimal non-negatif untuk setiap series.
- Series dengan maksimum `<= 50` memakai axis `small`.
- Series dengan maksimum `> 50` memakai axis `large`.
- Axis kiri `small` memiliki domain tetap `[0, 50]`.
- Axis kanan `large` memiliki domain `[0, auto]`.
- Jika seluruh series kecil, axis kanan disembunyikan.
- Jika seluruh series besar, axis kiri tetap ditampilkan sebagai referensi 0-50 yang diminta, tetapi tidak memiliki line terikat.
- Nilai chart tidak dinormalisasi atau diubah.

`TransportQualityCharts.jsx` akan merender dua `YAxis` dan memberi `yAxisId` hasil helper pada setiap `Line`. Legend dan tooltip existing dipertahankan. Mobile memakai tick font yang lebih kecil dan width axis yang ringkas.

### 4. Warna Home Performance Trend

`homeChartConfig.js` akan menggunakan:

- Revenue: `DASHBOARD_CHART_COLORS.accent`, yang terhubung ke Telkomsel Red `#E60012` pada dark mode dan brand red light-mode equivalent.
- Payload: `DASHBOARD_CHART_COLORS.info`, cool blue.
- Availability: `DASHBOARD_CHART_COLORS.warning`, amber.

Area gradient di `HomePerformanceTrend.jsx` sudah membaca warna config, sehingga fill otomatis mengikuti stroke baru. Axis, domain, tooltip, dan data flow tidak berubah.

### 5. Sidebar Light Mode

Token baru `--sidebar-background` akan membedakan background visual dari warna fallback `--bg-sidebar`.

Dark mode mempertahankan tampilan existing. Light mode menggunakan:

```css
--sidebar-background: linear-gradient(180deg, #CDD4DE 0%, #B8C3D0 100%);
```

`DashboardSidebar.jsx` akan memakai class `dashboard-sidebar` sebagai pemilik background sehingga CSS gradient tidak dipaksakan ke utility `background-color`.

Pada `[data-theme="light"] .dashboard-sidebar`, token teks lokal diperkuat:

- primary graphite untuk heading dan active item
- secondary graphite untuk metadata
- muted graphite yang tetap memenuhi kontras navigasi

Active state tetap memakai Telkomsel Red pada border kiri dan red tint lembut. Ukuran, collapse behavior, urutan menu, route, dan mobile behavior tidak berubah.

## Error Handling dan Cleanup

- Vanta failure hanya mengganti dekorasi dengan fallback; login tidak menampilkan error teknis.
- Effect Vanta selalu memiliki cleanup dan tidak melakukan state update setelah unmount.
- Password visibility tidak memengaruhi submit, autocomplete, atau credential value.
- Notes kosong tidak menambah tinggi callout.
- Notes tidak dapat memasukkan markup ke SVG.
- Axis helper mengabaikan `null`, string kosong, `NaN`, dan nilai negatif.
- Dataset kosong tetap memakai `DashboardChartEmpty` existing.

## Accessibility

- Password toggle dapat diakses melalui keyboard dan memiliki state yang diumumkan.
- Contrast panel Login dipertahankan dengan scrim di atas fog.
- Reduced motion menonaktifkan Vanta.
- Dual axis menggunakan tick dan tooltip yang tetap terbaca tanpa mengandalkan warna saja.
- Sidebar focus, hover, dan active state tetap berbeda secara bentuk melalui border kiri.

## Testing Strategy

Semua production behavior ditulis dengan TDD.

### Contract dan Unit Test

- `authSecurityContracts.test.js`
  - copy Login baru
  - tombol visibility dan atribut aksesibilitas
  - dynamic import Vanta dan Three
  - cleanup `destroy()` serta reduced-motion guard

- `towerPlanContracts.test.js`
  - Notes muncul di SVG
  - Notes kosong dihilangkan
  - wrapping maksimal tiga baris
  - XML escaping dan dynamic card height

- `transportQualityContracts.test.js`
  - dua Y-axis dan line assignment
  - helper memisahkan data kecil dan besar
  - seluruh-series-kecil, seluruh-series-besar, dan nilai invalid

- `homePageContracts.test.js`
  - Revenue, Payload, dan Availability menggunakan tiga token berbeda

- `themeRedesignContracts.test.js`
  - light sidebar gradient dan local contrast tokens
  - dark sidebar token tidak berubah

### Regression Commands

```powershell
node --test src/__tests__/*.test.js
npm run lint
npm run build
```

### Browser QA

Target flows:

1. `/login` desktop dan mobile: page render, Vanta canvas hadir, password toggle bekerja, submit tetap normal, console bersih.
2. `/tower-plan-generator`: isi Notes pada antenna, buka Preview, pastikan Notes terlihat dan tidak overlap.
3. `/transport-quality`: dataset mixed-scale menampilkan seri 0-50 dengan bentuk line yang terbaca dan seri besar pada axis kanan.
4. `/home`: Revenue, Payload, dan Availability terlihat berbeda pada dark dan light mode.
5. Halaman authenticated light mode: sidebar lebih gelap, active state jelas, teks dan panel update tetap terbaca.

Browser QA dilakukan pada desktop dan satu viewport mobile. Screenshot disimpan di luar repository.

## Acceptance Criteria

- Login menampilkan `NOD` dan `All in one Dashboard ENOM and Tools`.
- Password dapat ditampilkan dan disembunyikan tanpa kehilangan isi.
- Vanta Fog aktif dengan konfigurasi yang disetujui dan tidak membebani route dashboard lain.
- Login tetap usable saat Vanta gagal atau reduced motion aktif.
- Notes antenna terlihat pada Preview dan hasil export Tower Visualizer.
- Callout Notes tidak overlap pada input hingga tiga baris.
- Seri Weekly Quality Trend rentang 0-50 terlihat melalui axis kiri.
- Seri besar menggunakan axis kanan dan tooltip mempertahankan nilai asli.
- Revenue, Payload, dan Availability memiliki warna berbeda.
- Sidebar light mode menggunakan cool graphite gradient yang lebih kuat.
- Seluruh contract test, lint, build, dan browser QA lulus tanpa error relevan.

## Non-goals

- Tidak mengubah autentikasi backend atau API.
- Tidak menambahkan zoom interaktif atau brush pada chart.
- Tidak mengubah data Transport Quality.
- Tidak merancang ulang struktur sidebar atau menu.
- Tidak mengubah dark mode sidebar.
- Tidak mengubah visual inti tower, helicopter view, atau peta.
- Tidak melakukan merge langsung ke local `main`.

## Delivery

Implementasi dilakukan pada `codex/dashboard-visual-followups` dalam commit terpisah berdasarkan domain. File untracked dan checkout utama `D:\Web-dashboard` tidak diubah. Integrasi GitHub dilakukan hanya setelah implementasi dan verifikasi selesai serta pengguna memilih langkah publikasi.
