# AI Dockyard Operating Platform (ADOP)

**Versi dokumen:** 1.3  
**Diperbarui:** 19 Juli 2026  
**Design partner:** PT Gamatara  
**Primary user:** Pak Hanafi — Owner

ADOP adalah platform kendali operasional galangan kapal yang menyatukan kas, biaya, proyek kapal, billing, piutang, dan insight AI dalam satu sumber data yang dapat diaudit. Fase pertama berfokus pada **AI Cost Control**.

Dokumen ini sengaja dibuat mandiri agar proyek dapat dilanjutkan dari akun Claude Code yang berbeda tanpa membutuhkan riwayat percakapan sebelumnya.

## Masalah Utama

PT Gamatara menjalankan beberapa proyek kapal secara bersamaan dengan satu kas operasional. Data yang tersebar di Excel dan proses manual membuat owner sulit mengetahui dengan cepat:

- posisi kas dan pengeluaran hari ini;
- biaya per kapal/proyek;
- transaksi yang belum direview;
- kemungkinan input atau tagihan biaya yang berulang;
- proyek yang sudah selesai tetapi belum ditagih;
- status invoice dan piutang;
- kondisi bisnis melalui WhatsApp.

ADOP bukan ERP monolitik. ADOP dibangun sebagai platform modular, Excel-friendly, dan API-friendly dengan kontrol manusia pada keputusan penting.

## Prinsip Produk

### Trust Before Intelligence

AI hanya boleh bekerja di atas data yang dipercaya. Fondasi wajib:

- authentication, tenant isolation, dan role permission;
- trusted master data;
- immutable cost ledger dan audit trail;
- approval/review engine;
- secure evidence storage;
- notification engine;
- structured query layer untuk AI;
- backup, recovery, dan observability.

AI tidak boleh menjadi sumber angka finansial, mengarang data, atau menyatakan fraud sebagai fakta.

### Project-Centered Architecture

Objek inti ADOP adalah **Project Kapal**. Satu proyek menghubungkan:

`Progress → Cash/Cost → Material → Tenaga Kerja → Invoice → Piutang → Profit → Timeline`

Ketersediaan modul mengikuti fase. Phase 1 mengaktifkan project lifecycle, cash/cost, material/category, review, risk, timeline, dashboard, import, dan WhatsApp read-only. Invoice, piutang, profit, serta operasi dock yang lebih dalam diaktifkan pada fase berikutnya.

Alur target:

`Admin input/import sekali → data divalidasi → dialokasikan ke Project Kapal → ledger & timeline diperbarui → dashboard/WhatsApp membaca data trusted`

Setelah onboarding, workflow operasional harian utama adalah **admin input transaksi baru langsung melalui UI ADOP**; Excel bukan aplikasi operasional harian utama setelah ADOP aktif.

## Bukti Data Operasional Terbaru

Analisis read-only terhadap `LAPORAN HARIAN KAS.xlsx` mendukung desain berikut:

- satu laporan kas bersama untuk seluruh kapal;
- 260 baris transaksi pada laporan 17 Juli 2026;
- opening balance Rp7.870.794;
- total debit Rp92.615.565, total kredit Rp97.841.565, dan closing balance Rp2.644.794;
- 19 label kapal/proyek, termasuk label generik `Kas` dan `Lain-lain`;
- lokasi/periode masih tercampur di nama kapal, misalnya `(Dock Jn)` dan `(Juli)`;
- terdapat enam kelompok kandidat exact duplicate yang harus direview manusia;
- saldo pada file sumber tidak selalu formula-driven, sehingga import wajib menyimpan provenance dan melakukan rekonsiliasi sendiri.

Implikasi produk: ADOP harus memisahkan `vessel`, `project`, `service_type`, `facility_location`, dan `reporting_period`; menyimpan baris sumber; serta tidak memperlakukan file import sebagai trusted ledger sebelum validasi.

## Phase 1 — Founding Design Partner Pilot

Scope pilot yang dikunci:

1. import Excel/XLSX, CSV, dan PDF lama (Universal Import);
2. shared daily cash pool;
3. pengeluaran dan agregasi biaya per kapal/proyek;
4. deteksi kandidat duplicate input;
5. project active/ready-to-close/closed;
6. owner dashboard;
7. Morning Daily Expense Brief;
8. WhatsApp Business Copilot sederhana dan read-only.

Di luar scope pilot: full accounting, payroll/HR, pembayaran otomatis, invoice generator penuh, bank API, autonomous AI action, dan fase lanjutan kecuali disepakati sebagai change request atau add-on.

## Keputusan Operasional — LOCK

### 1. Shared Daily Cash Pool

Kas operasional adalah satu saldo gabungan, bukan wallet per kapal. Setiap pengeluaran tetap wajib dialokasikan ke project kapal.

`closing_cash = opening_cash + top_up + other_cash_in - total_cash_out`

### 2. Project dan Lokasi Dipisahkan

- lifecycle: `active → ready_to_close → closed`;
- owner atau admin berizin dapat melakukan close;
- project closed menolak pengeluaran baru;
- koreksi memakai adjustment/reversal dan tidak menghapus histori;
- `service_type` terpisah dari `facility_location`;
- nilai awal service type: Emergency, Standard, Docking, PLTU;
- daftar Gate/Dock/Pelabuhan/PLTU fisik masih open discovery dan harus configurable.

### 3. Duplicate Tetap Terlihat

Kandidat duplicate tidak boleh dihapus atau disembunyikan otomatis. Sistem menampilkan reason, evidence, dan risk level untuk human review, termasuk item serupa pada kapal yang sama lintas hari.

### 4. Morning Brief

Pak Hanafi menerima ringkasan aktivitas hari sebelumnya pada pagi berikutnya. Jam kirim masih configurable sampai dikonfirmasi.

### 5. Assisted Billing — Phase 2

`project closed → export rekap XLSX → admin menyiapkan Word → tanda tangan/cap basah owner → upload PDF final → set due date → kirim`

Closed project tanpa invoice memunculkan **Unbilled Vessel Alert**. Admin boleh mengatur due date tanpa approval owner, tetapi seluruh perubahan harus diaudit. Owner menerima notifikasi ketika invoice dikirim.

**Invoice Delivery & Acknowledgement — LOCK.** ADOP mengirim invoice melalui WhatsApp dan email, melacak delivery/read signal per kanal (`queued → sent → delivered → read/open → failed/bounced`), dan meminta explicit acknowledgement (tombol/link terverifikasi atau balasan customer) sebagai bukti penerimaan. Read/open **tidak pernah** otomatis menjadi acknowledgement. Customer dapat mengajukan Koreksi/Dispute. Provider WhatsApp dan email tetap **OPEN/UNCONFIGURED** — belum ada provider-specific code/env pada tahap ini.

### 6. Payment Verification — Phase 3

Pembayaran dapat diverifikasi dari bukti transfer atau pemeriksaan rekening. Bukti transfer opsional, tetapi verifier, waktu, nominal, metode, dan referensi wajib tercatat. Klaim customer saja tidak otomatis mengubah invoice menjadi lunas.

Reminder Phase 3 memakai status delivery/acknowledgement Phase 2 — belum delivered, delivered-but-unread, read/open-but-unacknowledged, acknowledged, dan disputed menghasilkan tindakan berbeda. Disputed menghentikan reminder normal dan masuk human review. Read/open boleh menjadi risk signal, tetapi bukan bukti persetujuan/penolakan tagihan.

## WhatsApp Business Copilot

Pada awal setiap sesi baru, AI wajib memberi greeting sesuai waktu lokal:

> Selamat pagi/siang/sore/malam, Pak Hanafi.

Greeting dikirim sekali per sesi, bukan pada setiap pesan. MVP bersifat **read-only**, hanya dapat digunakan oleh identity owner terverifikasi, dan semua jawaban wajib:

- berasal dari structured query yang tenant-scoped;
- menyebut periode serta freshness/completeness data;
- memberikan referensi/deep link bila tersedia;
- mengatakan data belum cukup jika memang belum cukup;
- menggunakan istilah indikasi risiko, bukan menuduh fraud;
- menolak write, approve, reject, delete, pay, atau tindakan bisnis lain lewat chat.

Contoh pertanyaan Phase 1:

- “Hari ini uang keluar berapa?”
- “Sisa kas berapa?”
- “Biaya kapal X minggu ini berapa?”
- “Ada transaksi yang terindikasi dobel?”
- “Pengeluaran mana yang belum direview?”

Pertanyaan billing/piutang baru dijawab setelah modul dan data fase terkait tersedia.

## Universal Data Onboarding & Import

ADOP menyediakan Universal Data Onboarding & Import agar data lama tidak perlu diinput ulang satu per satu. Format yang didukung: **Excel/XLSX, CSV, dan PDF**. Template **tidak wajib**. Tersedia dua jalur:

1. **Template opsional** untuk data yang belum rapi.
2. **Direct upload** satu file `.xlsx` atau `.csv` dari Accurate, SIMS, MyDistributor, atau Excel sendiri.

PDF (mis. dokumen pendukung, invoice/billing historis) diproses lewat text/table extraction atau OCR dengan confidence dan provenance halaman, dan wajib human review sebelum masuk trusted master data/ledger.

`.xls`, `.xlsm`, dan `.xlsb` belum didukung. Formula/macro tidak boleh dieksekusi.

Domain import Phase 1: client/customer, kapal, Project Kapal, vendor/supplier, kategori biaya/master referensi, service type, facility location, shared cash/opening balance, pengeluaran & transaksi historis, dan dokumen pendukung. Domain adapter berikutnya: invoice/billing historis (Phase 2), piutang & pembayaran (Phase 3), data operasional docking (Phase 4). Detail lengkap ada di `PRD.md` §7.3 dan `ADOP_WORKFLOW_ROADMAP_v1.0.md` §2.

Workflow canonical:

`upload → pilih dataset → mapping/extraction → preview → validate → confirm → process → result report`

Import tidak memicu alert, KPI, workflow, atau keputusan AI sebelum batch tervalidasi dan di-commit. Import personel (user/role) tidak membuat akun/permission otomatis — aktivasi akun tetap melalui security workflow terpisah.

Import harus memakai staging, fingerprint/idempotency, per-row outcome, downloadable error report, provenance, mapping version, dan validation status. Data `imported_unverified` tidak boleh digunakan AI sebagai trusted data. Approved ledger/history tidak boleh ditimpa diam-diam.

Copy UI yang dikunci:

> **Unduh Template (Opsional)**  
> Gunakan template jika data Anda belum memiliki format yang rapi. Jika sudah mempunyai file Excel/CSV dari sistem lama, langsung lanjutkan ke upload.

Tombol **Lanjut ke Upload** harus aktif tanpa download template.

## Roadmap Resmi

1. AI Cost Control
2. Billing Intelligence
3. AI Cash Collection Intelligence
4. Dock Operation Intelligence
5. Executive Intelligence
6. Predictive Intelligence

Jangan mengubah urutan atau mengerjakan fase berikutnya tanpa keputusan eksplisit Founder/Product Owner.

## Commercial Handoff — Internal

Proposal Founding Design Partner yang disetujui:

- pilot 90 hari;
- setup Rp5.000.000;
- subscription pilot Rp1.500.000/bulan, minimum 3 bulan;
- initial commitment Rp9.500.000;
- setelah pilot: subscription normal Rp2.990.000/bulan;
- Assisted Billing add-on Rp5.000.000;
- AI Cash Collection add-on Rp7.500.000;
- integrasi bank/API dikutip terpisah.

Nilai design partner mencakup izin nama/logo, testimonial, anonymized case study, feedback berkala, dan penggunaan minimum sesuai kesepakatan komersial. Bagian ini adalah konteks internal, bukan acceptance criteria teknis.

## Open Discovery

Belum LOCK dan tidak boleh diasumsikan:

- daftar serta arti Gate/Dock/Pelabuhan/PLTU fisik;
- definisi final service type dan apakah single/multi-select;
- rule carry-forward closing cash ke opening cash;
- authority dan frekuensi top-up;
- role operasional selain owner dan admin;
- reopen policy;
- jam Morning Brief;
- threshold transaksi besar dan SLA review;
- nomor/provider WhatsApp, session timeout, dan retention policy;
- dataset tambahan, kualitas data, serta mapping final;
- detail billing delivery tracking dan bank matching.

## Memulai di Akun Claude Code Baru

1. Salin repository beserta `README.md`, `PRD.md`, `CLAUDE.md`, dan `.gitignore`.
2. Buka root repository di Claude Code.
3. Instruksikan agent: `Baca CLAUDE.md lalu kerjakan hanya task yang saya berikan.`
4. Agent wajib memeriksa stack, package manager, environment, dan struktur repo aktual sebelum membuat asumsi.
5. Jalankan perubahan sebagai vertical slice kecil: local test → human demo → checkpoint PASS → commit/push/deploy hanya atas instruksi eksplisit.

## Dokumen Sumber Kebenaran

- `README.md` — orientasi produk dan handoff.
- `PRD.md` — requirement, scope, acceptance criteria, serta open discovery.
- `CLAUDE.md` — aturan kerja coding agent yang hemat token.
- `.gitignore` — mencegah secret, local data, cache, dan output build masuk Git.

Jika dokumen bertentangan, gunakan urutan sumber kebenaran di `CLAUDE.md` dan minta konfirmasi untuk konflik material.