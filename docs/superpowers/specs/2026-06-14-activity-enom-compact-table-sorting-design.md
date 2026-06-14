# Activity ENOM Compact Layout and Table Sorting Design

## Ringkasan

Padatkan halaman Activity ENOM untuk reporting dengan menghilangkan ruang kosong
di area chart, merapikan filter tabel menjadi satu toolbar horizontal, dan
memindahkan kontrol sorting ke header tabel.

## Layout Chart

- Gunakan grid tiga kolom pada desktop.
- Baris pertama berisi Monthly Activity Trend selebar dua kolom dan Ranking
  selebar satu kolom.
- Baris kedua berisi Contribution, Week Done Progress, dan Kategori
  Distribution, masing-masing satu kolom.
- Ranking tidak lagi memakai `row-span-2`; tinggi ranking mengikuti chart lain,
  yaitu 260px.
- Mobile tetap satu kolom tanpa horizontal overflow.

## Toolbar Tabel

- Toolbar hanya berisi search, filter Status, badge NOP aktif, dan Reset tabel.
- Seluruh kontrol menggunakan tinggi compact dan berada dalam satu baris pada
  desktop.
- Toolbar boleh wrap pada layar sempit.
- Dropdown `Sort By` dan `Direction` dihapus karena sorting dilakukan melalui
  header tabel.

## Sorting Header

- Semua kolom yang sudah didukung backend dapat diklik:
  `create_date`, `site_id`, `site_name`, `nop`, `kabupaten`, `part`,
  `activity`, `status`, `week_done`, dan `date_done`.
- Header aktif menampilkan ikon arah dan atribut `aria-sort`.
- Default tetap `create_date desc`.
- Klik kolom lain memilih kolom tersebut dengan arah `asc`.
- Klik ulang kolom aktif membalik `asc` dan `desc`.
- Perubahan sorting mengembalikan tabel ke halaman pertama dan hanya memuat
  ulang endpoint activities.

## Pengujian

- Contract test memverifikasi grid chart, toolbar tanpa dropdown sort, mapping
  semua header, `aria-sort`, dan toggle arah.
- Playwright memverifikasi klik header mengirim `sort_by`/`sort_dir`, tidak
  memanggil endpoint dashboard, dan tidak menimbulkan overflow mobile.
- Targeted ESLint, contract test, build, dan Graphify harus lulus.

