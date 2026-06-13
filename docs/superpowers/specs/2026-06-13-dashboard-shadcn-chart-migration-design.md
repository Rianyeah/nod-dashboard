# Dashboard shadcn/ui Chart Migration Design

## Ringkasan

Migrasikan seluruh chart pada halaman Activity ENOM, Transport Quality, dan
Ticketing ke pola shadcn/ui Chart yang sudah digunakan oleh Impact Service.
Migrasi bersifat adaptif: endpoint, filter, data key, dan arti metrik tetap,
tetapi tipe serta komposisi chart boleh diperbaiki agar lebih tepat, konsisten,
dan mudah dibaca untuk reporting.

Implementasi tetap memakai Recharts sebagai renderer. shadcn/ui digunakan
sebagai lapisan konfigurasi, container responsif, tooltip, legend, serta token
warna. Halaman tidak akan mengimpor komponen dari feature Impact Service;
perilaku yang reusable dipindahkan ke shared dashboard chart helpers.

## Tujuan

- Menyamakan tampilan chart dengan halaman Impact Service.
- Menggunakan `ChartContainer`, `ChartTooltip`, `ChartTooltipContent`,
  `ChartLegend`, dan `ChartLegendContent`.
- Memberi warna teks tooltip sesuai warna setiap series.
- Mengoptimalkan tipe chart tanpa mengubah makna bisnis.
- Menyeragamkan radius bar, label nilai, grid, axis, empty state, dan ukuran.
- Menjaga chart responsif, accessible, dan stabil ketika dicetak atau diambil
  screenshot.

## Non-Tujuan

- Tidak mengubah endpoint, schema backend, query, atau bentuk response.
- Tidak mengubah filter global maupun filter tabel.
- Tidak mengubah request orchestration atau loading scope.
- Tidak memigrasikan scorecard, tabel, atau panel selain kebutuhan chart.
- Tidak membuat universal chart renderer berbasis JSON.
- Tidak mengubah chart Impact Service selain shared primitive yang diperlukan
  untuk tooltip berwarna.

## Arsitektur

### Primitive shadcn

`frontend/src/components/ui/chart.jsx` tetap menjadi source component shadcn.
Primitive tersebut tidak diberi business rule halaman. Perubahan pada file ini
hanya diperbolehkan jika dibutuhkan untuk prop generik yang dapat dipakai semua
chart, misalnya dukungan warna teks series pada tooltip.

### Shared dashboard chart helpers

Tambahkan folder `frontend/src/components/dashboard-charts/` untuk perilaku
lintas halaman:

- `DashboardChartTooltipContent`
  - membungkus `ChartTooltipContent`;
  - menentukan warna dari `item.color`, `item.payload.fill`, atau chart config;
  - mewarnai nama series dan value dengan warna series;
  - tetap menampilkan label sumbu sebagai warna foreground biasa;
  - menerima formatter angka, persen, tanggal, dan label.
- `DashboardChartLegend`
  - menggunakan `ChartLegend` dan `ChartLegendContent`;
  - mempertahankan label business-facing dari chart config.
- `DashboardChartEmpty`
  - empty state dengan tinggi yang sama seperti chart;
  - menggunakan token shadcn dan teks lama.
- `DashboardChartLabels`
  - menyediakan renderer untuk label di dalam bar, di ujung bar, dan di atas
    bar;
  - tidak memakai stroke;
  - menyembunyikan nilai nol;
  - memakai font monospace, tabular number, dan kontras terhadap fill.
- `dashboardChartStyles`
  - konstanta margin, radius, axis tick, grid, dan formatter bersama;
  - tidak menyimpan data atau state halaman.

Chart config tetap didefinisikan dekat domain halaman agar label dan warna
series mudah ditinjau. Setiap config memetakan data key ke `{ label, color }`.

### Komposisi halaman

`DashboardChartPanel` tetap dipakai sebagai shell card yang ada. Isi panel
berubah dari `ResponsiveContainer` langsung menjadi `ChartContainer`.
Komponen Recharts seperti `BarChart`, `ComposedChart`, `LineChart`, dan
`PieChart` tetap dirangkai di halaman atau komponen chart khusus halaman.

Chart halaman dipisahkan ke:

- `features/activity-enom/ActivityEnomCharts.jsx`
- `features/transport-quality/TransportQualityCharts.jsx`
- `features/ticketing/TicketingCharts.jsx`

Page tetap menjadi pemilik data, filter, request, dan state interaksi.

## Standar Visual dan Interaksi

### Container dan responsivitas

- Semua chart memakai `ChartContainer` dengan tinggi eksplisit.
- Desktop mengikuti layout panel saat ini.
- Mobile memakai lebar penuh tanpa horizontal overflow.
- Legend donut berada di kanan pada ruang lebar dan di bawah pada mobile.
- Label kategori panjang dipotong secara terkontrol, dengan nilai lengkap tetap
  tersedia melalui tooltip.

### Axis, grid, dan animasi

- Semua chart Cartesian memakai axis tanpa axis line dan tick line.
- Grid hanya ditampilkan pada arah yang membantu pembacaan.
- Warna grid dan tick memakai semantic chart/theme tokens.
- Semua chart memakai `accessibilityLayer`.
- Animasi dinonaktifkan agar screenshot, reporting, dan print konsisten.

### Bar dan value label

- Semua bar memakai radius 8.
- Stacked bar membulatkan setiap segment seperti pola Impact Service.
- Label angka tidak memakai stroke atau text shadow.
- Label ditampilkan untuk nilai non-zero jika ruang cukup.
- Label di dalam bar memakai warna kontras terhadap fill.
- Label di luar bar memakai warna foreground yang terbaca di dark dan light
  theme.

### Tooltip berwarna

Tooltip memakai layout shadcn yang sama pada seluruh halaman:

- Header menunjukkan label kategori atau tanggal.
- Setiap row menunjukkan indicator, nama series, dan value.
- Nama series dan value memakai warna series aktual.
- Warna tidak ditentukan dari urutan payload; warna diambil dari chart config
  atau payload sehingga tetap benar saat series disembunyikan atau diurutkan.
- Formatter khusus tetap dipertahankan: angka lokal, persen, dan tanggal.
- Tooltip donut menggunakan warna `Cell` aktif.

Warna series tetap harus memiliki kontras yang memadai pada background tooltip.
Jika warna fill terlalu gelap pada dark theme atau terlalu terang pada light
theme, chart config menyediakan warna teks tooltip terpisah tanpa mengubah fill.

## Rancangan Activity ENOM

### Monthly Activity Trend

- Tetap `ComposedChart`.
- `open` dan `close` menjadi stacked rounded bars.
- `total` tetap menjadi monotone line.
- Total ditampilkan sebagai label di atas stack.
- Legend: `OPEN`, `CLOSE`, dan `Total Trend`.

### Contribution

- Tetap horizontal stacked bar.
- Data key: `open`, `close`, kategori `label`.
- Maksimal sepuluh bar seperti perilaku sekarang.
- Value label ditampilkan di dalam segment yang cukup lebar.

### Week Done Progress

- Tetap vertical bar.
- Data key: `close`, kategori `label`.
- Value ditampilkan di atas bar.
- Bar memakai warna status CLOSE.

### Kategori Distribution

- Tetap ranked horizontal bar karena label kategori dapat panjang dan tujuan
  chart adalah perbandingan ranking, bukan komposisi part-to-whole.
- Data key: `total`, kategori `label`.
- Data diurutkan mengikuti response saat ini.
- Value ditampilkan di ujung bar.

Ranking panel dan tabel Top Activity tidak diubah.

## Rancangan Transport Quality

### Weekly Quality Trend

- Tetap multi-series `LineChart`.
- Series:
  - `pl_over_1_sites`: `PL >1%`;
  - `latency_over_5_sites`: `Latency >5ms`;
  - `jitter_not_clear_sites`: `Jitter NOT-CLEAR`;
  - `thi_fail_sites`: `THI Fail`.
- Garis memakai ketebalan konsisten dan active dot.
- Tooltip menampilkan empat series dengan warna masing-masing.

### PL & Latency Distribution

- Tetap dua vertical bar chart dalam satu panel.
- Packet loss memakai `records` dengan label `PL records`.
- Latency memakai `records` dengan label `Latency records`.
- Value berada di atas rounded bar.

### Issue Breakdown by NOP

- Tetap horizontal stacked bar.
- Series `p1_sites` dan `p2_sites`.
- Maksimal delapan NOP seperti perilaku sekarang.
- Value label ditampilkan per segment.

### Issue Breakdown by Kabupaten

- Tetap grouped horizontal bar.
- Series `pl_over_1_sites` dan `latency_over_5_sites`.
- Maksimal delapan Kabupaten seperti perilaku sekarang.
- Value ditempatkan di ujung bar jika tersedia ruang.

High Priority Transport dan Priority Site List tidak diubah.

## Rancangan Ticketing

### Daily Trend Ticket by Kategori

- Tetap multi-series `LineChart`.
- Series `bps` dan `ts`.
- Label dan tooltip mengikuti warna masing-masing series.

### SLA Status Distribution

- Tetap donut chart karena datanya berupa komposisi status.
- Data key `tickets`, name key `label`.
- Active segment tetap membesar saat pointer/focus berpindah.
- Tambahkan total ticket di tengah donut.
- Legend/value list berada di kanan pada desktop dan di bawah pada mobile.
- Warna status ditentukan dari label status, bukan index array, agar warna tetap
  stabil saat response berubah urutan.

### Visiting Site vs Backup Genset

- Tetap grouped horizontal bar.
- Series `visiting_site` dan `backup_genset`.
- Maksimal enam kategori seperti perilaku sekarang.
- Value ditampilkan di ujung bar.

### Kabupaten/Kota Distribution

- Tetap ranked horizontal bar.
- Data key `tickets`, kategori `label`.
- Value ditampilkan di ujung bar.

### RC Category Pareto

- Diubah dari `BarChart` menjadi `ComposedChart`.
- `tickets` ditampilkan sebagai rounded vertical bars pada sumbu kiri.
- `cumulative_rate` ditampilkan sebagai monotone line pada sumbu kanan
  dengan domain 0-100%.
- Tooltip memakai formatter angka untuk tickets dan persen untuk cumulative
  rate.
- Legend menampilkan `Tickets` dan `Cumulative Rate`.
- Label cumulative rate tidak lagi ditempel pada setiap bar; line dan tooltip
  menjadi representasi utama agar chart tidak penuh.

Top Problem Sites dan tabel Ticketing tidak diubah.

## Data Flow dan State

- Props chart menerima data yang sudah tersedia pada page.
- Tidak ada fetch baru dan tidak ada transformasi yang memengaruhi request.
- Transformasi presentasi seperti pemetaan warna SLA dan total donut dilakukan
  dengan pure functions atau `useMemo`.
- State `activeSlaIndex` tetap lokal pada chart Ticketing.
- Filter yang sudah terhubung ke chart tetap menjadi sumber data tunggal.
- Empty, loading, dan stale-data behavior halaman tetap dipertahankan.

## Error Handling

- Response kosong menampilkan shared empty state tanpa mencoba merender chart.
- Value `null`, `undefined`, atau non-numeric diformat sebagai nol atau tanda
  kosong sesuai formatter lama.
- Chart tidak boleh membuat seluruh halaman gagal ketika satu series tidak ada.
- Chart config menyediakan fallback label dari data key.
- Tooltip mengabaikan payload dengan `type="none"` dan value yang tidak valid.

## Pengujian

### Contract tests

Tambahkan atau perbarui contract tests untuk memastikan:

- ketiga halaman menggunakan `ChartContainer`;
- tidak ada `ResponsiveContainer` langsung pada chart yang dimigrasikan;
- tooltip dan legend menggunakan komponen shadcn;
- seluruh chart memakai `accessibilityLayer`;
- bar memakai radius 8;
- Activity ENOM mempertahankan empat chart dan data key bisnisnya;
- Transport Quality mempertahankan lima chart dan empat trend series;
- Ticketing memakai donut SLA dan Pareto `ComposedChart` dengan
  `cumulative_rate`;
- tooltip series-colored digunakan pada seluruh chart;
- endpoint dan filter contracts tidak berubah.

### Unit tests

Pure tests mencakup:

- resolusi warna tooltip dari config dan payload;
- pemetaan warna status SLA berdasarkan label;
- formatter value angka dan persen;
- label renderer menyembunyikan nol;
- total donut.

### Browser tests

Focused Playwright memverifikasi:

- seluruh chart tampil setelah halaman dimuat;
- tooltip menampilkan nama dan value dengan warna series;
- legend serta label dapat dibaca di dark dan light theme;
- donut tidak terpotong pada desktop maupun mobile;
- Pareto menampilkan bar dan cumulative line;
- tidak ada horizontal overflow;
- perubahan filter tetap memperbarui seluruh chart;
- empty state tetap tampil untuk response kosong.

### Perintah verifikasi

```powershell
node --test src/__tests__/activityEnomContracts.test.js src/__tests__/transportQualityContracts.test.js src/__tests__/ticketingContracts.test.js src/__tests__/themeRedesignContracts.test.js
npx eslint src/pages/ActivityEnomPage.jsx src/pages/TransportQualityPage.jsx src/pages/TicketingPage.jsx src/components/dashboard-charts src/components/ui/chart.jsx
npm run build
npx playwright test e2e-playwright.spec.js -g "Activity ENOM|Transport Quality|Ticketing"
graphify update .
```

Jika build Vite gagal pada Node 24 di mesin ini, verifikasi build diulang memakai
Node 22 LTS tanpa mengubah dependency proyek.

## Kriteria Selesai

- Semua 14 chart target memakai foundation shadcn/ui Chart.
- Tooltip text mengikuti warna series secara konsisten.
- Tipe chart sesuai rancangan adaptif di atas.
- Semua bar rounded dan value label terbaca tanpa stroke.
- Dark theme, light theme, desktop, mobile, dan reporting layout tidak rusak.
- Tidak ada perubahan pada endpoint, filter, label bisnis, atau request flow.
- Targeted tests, lint, build, dan focused browser test lulus atau kegagalan
  baseline dilaporkan terpisah dengan bukti.
