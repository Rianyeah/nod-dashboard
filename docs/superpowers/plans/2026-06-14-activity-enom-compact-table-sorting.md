# Activity ENOM Compact Layout and Table Sorting Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Padatkan layout chart dan toolbar Activity ENOM serta pindahkan sorting tabel ke seluruh header yang didukung backend.

**Architecture:** Pertahankan request orchestration dan endpoint yang ada. Ubah
feature chart menjadi grid desktop dua baris yang eksplisit, lalu gunakan
konfigurasi kolom tabel sebagai satu sumber label, key sorting, dan rendering
header accessible.

**Tech Stack:** React 19, Vite 8, JavaScript, shadcn/ui, Recharts 3, Node test runner, Playwright.

---

### Task 1: Lock Layout and Sorting Contracts

**Files:**
- Modify: `frontend/src/__tests__/activityEnomContracts.test.js`

- [ ] Tambahkan assertion bahwa Ranking tidak memakai `row-span-2`, grid chart
  memakai dua row wrapper, dan Category berada pada row chart kedua.
- [ ] Tambahkan assertion bahwa dropdown `activity-enom-sort-by` serta
  `activity-enom-sort-dir` sudah tidak ada.
- [ ] Tambahkan assertion untuk konfigurasi sepuluh kolom sortable,
  `handleTableSort`, `aria-sort`, dan tombol header.
- [ ] Jalankan `node --test src/__tests__/activityEnomContracts.test.js` dan
  pastikan gagal karena perilaku baru belum tersedia.

### Task 2: Compact Chart and Toolbar Layout

**Files:**
- Modify: `frontend/src/features/activity-enom/ActivityEnomCharts.jsx`
- Modify: `frontend/src/pages/ActivityEnomPage.jsx`

- [ ] Pisahkan chart menjadi dua grid row desktop dengan rasio yang disetujui.
- [ ] Ubah tinggi Ranking menjadi 260px dan hapus `row-span-2`.
- [ ] Hapus dropdown Sort By/Direction dari toolbar.
- [ ] Jadikan search, status, badge NOP, dan reset satu toolbar compact yang
  tetap wrap di mobile.

### Task 3: Sortable Table Headers

**Files:**
- Modify: `frontend/src/pages/ActivityEnomPage.jsx`

- [ ] Ganti `SORT_OPTIONS` menjadi konfigurasi kolom yang memuat `key`,
  `label`, dan kelas cell.
- [ ] Implementasikan `handleTableSort(key)`:
  kolom baru menjadi ascending, kolom aktif membalik arah, lalu page kembali 1.
- [ ] Render setiap header sebagai button dengan `aria-sort`, ikon arah aktif,
  tooltip/title, dan test id stabil.
- [ ] Pertahankan `sort_by` dan `sort_dir` pada `tableParams`.

### Task 4: Verify

**Files:**
- Modify: `e2e-playwright.spec.js`

- [ ] Tambahkan flow mock Activity ENOM yang mengklik header dan memverifikasi
  request tabel saja.
- [ ] Jalankan contract test Activity ENOM dan targeted ESLint.
- [ ] Jalankan focused Playwright Activity ENOM.
- [ ] Jalankan production build dan `git diff --check` terarah.
- [ ] Jalankan `graphify update .`.

