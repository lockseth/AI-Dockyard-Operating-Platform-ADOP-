# Product Requirements Document

## AI Dockyard Operating Platform — PT Gamatara

**Versi:** 1.3  
**Tanggal:** 19 Juli 2026  
**Design Partner:** PT Gamatara  
**Primary User:** Pak Hanafi — Owner  
**Fase aktif:** Phase 1 — AI Cost Control / Founding Design Partner Pilot

## 1. Ringkasan Produk

AI Dockyard Operating Platform (ADOP) adalah platform kendali operasional galangan kapal. Phase 1 membantu PT Gamatara mencatat, mengontrol, dan menganalisis kas serta pengeluaran harian per kapal/proyek.

Owner memperoleh dashboard dan WhatsApp Business Copilot untuk menanyakan kondisi bisnis berdasarkan data yang sudah tercatat. Sistem dibangun dengan prinsip **Trust Before Intelligence**: data, permission, ledger, approval, dan audit trail harus dapat dipercaya sebelum AI memberikan insight atau melakukan tindakan.

Objek bisnis utama adalah **Project Kapal**, yang menjadi penghubung bertahap antara Progress, Cash/Cost, Material, Tenaga Kerja, Invoice, Piutang, Profit, dan Timeline. Tidak semua modul dibangun pada Phase 1; ketersediaannya mengikuti roadmap resmi.

## 2. Latar Belakang

Hasil interview awal menunjukkan:

- operasional dapat menggunakan kas harian sekitar Rp50 juta;
- beberapa kapal/proyek berjalan secara bersamaan;
- pembelian material dan biaya operasional mengurangi kas setiap hari;
- admin melakukan pencatatan transaksi harian;
- owner perlu melihat draft dan mereview transaksi;
- owner membutuhkan deteksi kemungkinan double input;
- owner membutuhkan notifikasi dan indikasi fraud/risk;
- owner ingin AI WhatsApp yang dapat menjawab pertanyaan mengenai bisnisnya.

Nominal kas harian adalah konteks discovery, bukan batas sistem yang di-hardcode.

### 2.1 Evidence Snapshot — Laporan Kas 17 Juli 2026

Analisis read-only terhadap `LAPORAN HARIAN KAS.xlsx` menemukan:

- satu sheet dengan satu tabel kas bersama;
- 260 baris transaksi pada tanggal laporan 17 Juli 2026;
- opening balance Rp7.870.794;
- total debit Rp92.615.565;
- total kredit Rp97.841.565;
- closing balance Rp2.644.794;
- 19 label kapal/proyek, termasuk label generik `Kas` dan `Lain-lain`;
- informasi periode/lokasi masih tercampur di label kapal, termasuk `(Juli)` dan `(Dock Jn)`;
- enam kelompok kandidat exact duplicate;
- hanya sebagian kecil saldo sumber memiliki formula, sehingga saldo sumber tidak boleh diterima tanpa rekonsiliasi.

Snapshot ini merupakan bukti desain import dan kontrol data, bukan baseline performa permanen atau data produksi canonical.

## 3. Tujuan

- Menjadikan seluruh pengeluaran harian tercatat dan dapat ditelusuri.
- Memindahkan data existing tanpa mewajibkan input ulang satu per satu.
- Mengetahui penggunaan dan sisa kas berdasarkan data terpercaya.
- Memisahkan biaya per kapal/proyek secara jelas.
- Membantu owner mereview transaksi dengan cepat.
- Menemukan indikasi duplikasi atau transaksi tidak wajar lebih awal.
- Memberikan akses tanya-jawab bisnis melalui WhatsApp untuk Pak Hanafi.
- Menyiapkan fondasi data untuk seluruh roadmap ADOP berikutnya.
- Menjadikan Project Kapal sebagai pusat agregasi biaya dan timeline tanpa membuat wallet kas per kapal.

## 4. Non-Goals Phase 1

- Bukan sistem accounting lengkap atau pengganti general ledger perusahaan.
- Belum mencakup payroll dan HR.
- Belum menjalankan procurement kompleks end-to-end.
- Belum melakukan pembayaran otomatis.
- Belum memberi AI kewenangan mengubah, menyetujui, atau menghapus transaksi melalui WhatsApp.
- Belum mencakup Billing Intelligence, Cash Collection, Dock Operation, Executive Intelligence lengkap, atau Predictive Intelligence.

### 4.1 Scope Pilot yang Dikunci

Scope commercial pilot 90 hari dibatasi pada:

1. import Excel/XLSX, CSV, dan PDF lama (Universal Import);
2. shared daily cash pool;
3. pengeluaran dan agregasi biaya per kapal/proyek;
4. deteksi kandidat duplicate input;
5. project active/ready-to-close/closed;
6. owner dashboard;
7. Morning Daily Expense Brief;
8. WhatsApp Business Copilot sederhana dan read-only.

Requirement lintas fase tetap dicatat pada dokumen ini agar arsitektur tidak buntu, tetapi tidak otomatis masuk delivery pilot.

## 5. Prinsip Produk yang Dikunci

### 5.1 Trust Before Intelligence

Urutan pembangunan wajib:

1. Authentication
2. Role permission
3. Trusted master data
4. Immutable cost ledger
5. Secure evidence storage
6. Review/approval engine
7. Audit trail dan activity log
8. Notification engine
9. AI insight dan conversational access

### 5.2 Living Knowledge Platform

Hasil interview dan pola operasional PT Gamatara disimpan sebagai knowledge yang berversi. Perubahan pengetahuan bisnis tidak boleh merusak core platform atau menghapus keputusan sebelumnya.

### 5.3 Explainable AI

Setiap jawaban atau alert AI harus dapat menjelaskan:

- data dan periode yang digunakan;
- transaksi yang mendasari hasil;
- status kelengkapan data;
- alasan alert atau indikasi risiko.

AI tidak boleh menyatakan fraud sebagai fakta. Gunakan istilah **indikasi risiko** sampai diverifikasi manusia.

### 5.4 Modular, Excel-Friendly, API-Friendly

- ADOP bukan ERP monolitik.
- Input manual, import file, API, dashboard, dan WhatsApp memakai domain service serta sumber data canonical yang sama.
- Integrasi/provider ditempatkan di belakang adapter agar dapat diganti tanpa merusak ledger dan workflow inti.
- Satu kali input/import harus dapat memperbarui agregasi Project Kapal, dashboard, timeline, dan query WhatsApp setelah status data trusted.
- Setelah onboarding, workflow operasional harian utama adalah admin input transaksi baru langsung melalui UI ADOP; Excel bukan aplikasi operasional harian utama setelah ADOP aktif.

## 6. Persona dan Hak Akses

### Owner — Pak Hanafi

- Melihat seluruh data perusahaan yang diizinkan.
- Melihat dashboard dan ringkasan biaya.
- Mereview, menyetujui, menolak, atau meminta koreksi transaksi.
- Menerima alert penting.
- Menggunakan WhatsApp Business Copilot.

### Admin/Finance

- Membuat dan mengedit draft transaksi.
- Mengunggah bukti transaksi.
- Mengirim transaksi untuk review.
- Melihat status dan catatan koreksi.
- Tidak dapat menghapus histori transaksi yang sudah disubmit/approved.

### Authorized Operational User

- Hak akses ditentukan secara eksplisit per role.
- Scope final perlu divalidasi sebelum implementasi.

## 7. Ruang Lingkup Fungsional MVP

### 7.1 Authentication dan Authorization

- Login aman.
- Role-based access control.
- Session management.
- Owner control untuk user aktif/nonaktif.
- Semua akses sensitif dicatat.

**Status Foundation Gate 0B (terimplementasi):** login email/password lokal (Supabase Auth, tanpa signup publik/social login/magic link pada gate ini), session di-refresh melalui `proxy.ts` (Next.js 16) yang hanya melakukan redirect optimistis — bukan authorization gate. Authorization final selalu divalidasi ulang di server/data-access layer (`requireAuthenticatedUser`, `requireTenantContext`, `requireTenantRole`) menggunakan `getClaims()`/`getUser()`, tidak pernah dari `getSession()` atau `user_metadata`, dan tetap ditegakkan oleh RLS database. Tenant aktif disimpan sebagai cookie server-managed httpOnly (`adop_active_tenant_id`) yang hanya berfungsi sebagai pointer — setiap pembacaan divalidasi ulang terhadap `tenant_memberships` milik user; tenant palsu/asing pada cookie otomatis diabaikan dan tenant yang benar dipilih ulang. User dengan lebih dari satu active membership diarahkan ke pemilih tenant (`/select-tenant`); user tanpa active membership atau suspended diarahkan ke `/no-access` tanpa membocorkan daftar tenant yang ada.

### 7.2 Master Data

- Vessel/Kapal sebagai aset atau identitas kapal.
- Project Kapal sebagai pekerjaan/engagement operasional yang memiliki lifecycle sendiri.
- Customer/PT pemilik kapal.
- Service type awal: Emergency, Standard, Docking, dan PLTU.
- Facility/Dock/Gate/Pelabuhan yang configurable dan terpisah dari service type.
- Reporting period/tag sumber yang tidak disimpan sebagai bagian permanen nama kapal.
- Kategori biaya.
- Material atau item pembelian.
- Vendor/supplier minimal jika dibutuhkan transaksi.
- User dan role.

Setiap master data memiliki status aktif/nonaktif dan histori perubahan.

Import wajib mampu memisahkan label gabungan file lama, misalnya nama kapal + bulan atau nama kapal + lokasi. Sistem boleh menyarankan parsing, tetapi user harus mengonfirmasi hasil mapping/normalisasi sebelum persistence canonical.

**Status Phase 1 Gate 1A (terimplementasi):** `clients`, `client_contacts` (PIC), `vessels`, `vendors`, `service_types` (seed awal Emergency/Standard/Docking/PLTU per tenant, tenant boleh menambah), `facility_locations` (open discovery, belum ada daftar Gate/Dock/Pelabuhan/PLTU baku), dan `expense_categories` (self-referencing parent, tenant-safe) tersedia sebagai direct UI entry di `/app/master-data/*`. Semua tabel `tenant_id`-scoped dengan composite tenant-safe FK untuk relasi anak-induk (client_contacts/vessels → clients, expense_categories → parent), RLS owner/admin CRUD dan reviewer/viewer read-only, tanpa hard delete (hanya `status=inactive`), dan append-only `master_data_audit_events` (create/update/activate/deactivate, tidak bisa ditulis langsung dari browser — hanya lewat RPC `log_master_data_audit_event` yang re-cek role owner/admin). **Belum diimplementasikan:** Project Kapal, cost ledger, dan Universal Import — itu target gate berikutnya di atas fondasi master data ini.

### 7.3 Universal Data Onboarding & Import

ADOP wajib memiliki satu **Universal Import Core** canonical agar data lama tidak perlu diinput ulang satu per satu, dipakai baik untuk onboarding data lama maupun input data operasional secara massal.

#### Scope Import Phase 1

- client/customer;
- kapal;
- Project Kapal;
- vendor/supplier;
- kategori biaya/master referensi (termasuk service type dan facility location);
- shared cash/opening balance;
- pengeluaran dan transaksi historis;
- dokumen pendukung (evidence, kontrak, dokumen transaksi).

Domain adapter berikutnya: invoice/billing historis (Phase 2), piutang dan pembayaran (Phase 3), data operasional docking (Phase 4). Detail phase mapping mengikuti `ADOP_WORKFLOW_ROADMAP_v1.0.md` §2 dan tabel Domain Import.

Untuk format laporan kas PT Gamatara yang telah diperiksa, canonical mapping awal harus mendukung:

- `TANGGAL` → transaction/report date;
- `KETERANGAN` → cost description atau funding description;
- `NAMA KAPAL` → raw project/vessel label lalu normalisasi ke Vessel + Project;
- `DEBET` → cash-in/funding candidate;
- `KREDIT` → cash-out candidate;
- `SALDO` → source-reported balance untuk rekonsiliasi, bukan ledger truth otomatis.

Format yang didukung: **Excel/XLSX, CSV, dan PDF**. Excel/XLSX dan CSV diproses sebagai structured data melalui parser langsung. PDF diproses melalui text/table extraction (PDF digital) atau OCR (PDF hasil scan), disertai confidence score dan page/source provenance, dan wajib melalui human review — hasil ekstraksi PDF tidak boleh langsung masuk trusted master data atau ledger. Format sumber lain diproses melalui adapter atau konversi yang terkontrol, bukan parser ad-hoc di setiap modul.

#### Arsitektur Import

```text
Universal Import Core
  → format parser/extractor (XLSX/CSV/PDF)
  → domain adapter
  → staging
  → mapping
  → validation
  → duplicate detection
  → dry-run/preview
  → reconciliation
  → human review
  → commit
  → audit/rollback
```

File sumber asli dan hash-nya wajib dipertahankan untuk kebutuhan audit dan rollback.

#### Keputusan Template — LOCK

Template bersifat **opsional**, bukan prasyarat import. UI harus menyediakan dua jalur yang setara:

##### Cara 1 — Menggunakan Template

Cocok untuk data yang masih berantakan atau dibuat manual di Excel.

`Unduh template → isi/copy data → upload`

Keuntungan:

- format kolom sudah benar;
- lebih sedikit error;
- mapping otomatis atau lebih cepat;
- proses onboarding lebih mudah.

##### Cara 2 — Upload File Lama Langsung

Jika klien memiliki export dari Accurate, SIMS, MyDistributor, atau Excel sendiri, user dapat langsung memilih **Lanjut ke Upload** tanpa mengunduh template.

Setelah upload, ADOP menampilkan mapping kolom sumber ke canonical field. Contoh domain galangan:

- `Nama Kapal` dari file lama → `Nama Kapal` ADOP;
- `Nama PT/Pemilik` → `Customer Company`;
- `Uraian Barang/Jasa` → `Deskripsi Biaya`;
- `Jumlah/Nominal` → `Total Nominal`;
- `Lokasi/Dermaga` → `Facility/Dock Location`.

Saran mapping otomatis hanya membantu user. Mapping final wajib ditampilkan untuk diperiksa sebelum validasi dan konfirmasi.

#### Keputusan Format — LOCK

- `.xlsx` adalah format Excel biasa dan umumnya paling mudah bagi pengguna.
- `.csv` lebih ringan dan lazim untuk export sistem lama.
- Klien cukup memilih salah satu; tidak perlu mengunduh atau mengunggah keduanya.
- `.xls`, `.xlsm`, dan `.xlsb` tidak diterima pada scope awal.
- Formula atau macro tidak boleh dieksekusi.
- PDF diterima sebagai format tambahan (mis. dokumen pendukung, invoice/billing historis) melalui jalur text/table extraction atau OCR, bukan mapping kolom langsung seperti `.xlsx`/`.csv`; wajib human review sebelum masuk trusted data.

#### Copy dan Perilaku UI — LOCK

Gunakan copy berikut:

> **Unduh Template (Opsional)**  
> Gunakan template jika data Anda belum memiliki format yang rapi. Jika sudah mempunyai file Excel/CSV dari sistem lama, langsung lanjutkan ke upload.

Requirement UI:

- tombol **Lanjut ke Upload** tersedia tanpa harus mengunduh template;
- download template tidak menjadi completion gate atau prerequisite;
- tidak boleh ada tanda wajib, blocking validation, atau urutan visual yang memberi kesan template harus digunakan;
- pilihan file menerima satu `.xlsx` atau `.csv` sesuai batas keamanan;
- setelah direct upload, user diarahkan ke column mapping;
- mapping profile dapat disimpan per sumber/dataset untuk import berikutnya;
- nama sumber seperti Accurate, SIMS, MyDistributor, atau Custom Excel dicatat sebagai metadata, bukan membuat import engine terpisah.

#### Workflow Import

`upload → select dataset → map columns → preview → validate → confirm → process → result report`

#### Guardrails Import

- File upload tidak langsung menulis ke tabel canonical.
- Tampilkan preview dan hasil mapping sebelum konfirmasi.
- Validasi tipe data, field wajib, referensi master, nominal, tanggal, dan tenant ownership.
- Normalisasi nilai harus deterministic dan dapat dilacak.
- Sediakan external/source key atau fingerprint untuk idempotency.
- Retry file/job yang sama tidak boleh menggandakan record.
- Deteksi duplicate di dalam file dan terhadap data existing.
- Tampilkan hasil per baris: imported, skipped, warning, atau failed beserta alasannya.
- Partial success harus eksplisit; jangan menyatakan seluruh import berhasil jika ada baris gagal.
- Simpan uploader, file metadata/fingerprint, mapping version, waktu, hasil, dan audit event.
- Import tidak boleh silent-overwrite transaksi submitted/approved atau immutable ledger.
- Koreksi data finansial yang sudah dipercaya mengikuti adjustment/reversal workflow.
- Data historis memiliki provenance dan status validasi, misalnya `imported_unverified` atau status setara.
- WhatsApp Copilot dan dashboard harus membedakan data trusted dari data import yang belum tervalidasi.
- File formula, macro, malformed content, dan ukuran berlebih harus ditangani secara aman.
- Simpan `raw_value` atau source-row snapshot yang cukup untuk audit mapping.
- Jangan menganggap label `Kas` atau `Lain-lain` sebagai Vessel; arahkan ke funding/overhead classification yang dikonfirmasi user.
- Jangan menyimpan suffix periode/lokasi sebagai bagian canonical vessel name jika dapat dipisahkan secara aman.
- Rekonsiliasi opening + debit - kredit terhadap closing yang dilaporkan dan tampilkan variance.
- Candidate duplicate dari source tetap diimport/staging sebagai record terlihat dengan review status; jangan dibuang otomatis.
- Import tidak boleh memicu alert, KPI, workflow, atau keputusan AI sebelum batch tervalidasi dan di-commit.
- Import personel (user/role) tidak membuat akun atau permission otomatis; data personel masuk sebagai kandidat, aktivasi akun dan permission tetap melalui security workflow terpisah.

#### Import Result

User memperoleh:

- jumlah total baris;
- jumlah imported, skipped, warning, dan failed;
- downloadable error report;
- link menuju record hasil import;
- kemampuan memperbaiki baris gagal dan menjalankan ulang tanpa duplikasi.

### 7.4 Daily Cash Control

- Menggunakan satu shared daily cash pool untuk seluruh kapal, bukan saldo terpisah per kapal.
- Mencatat opening cash harian.
- Mencatat tambahan kas/top-up, termasuk sumber kas/bank jika tersedia.
- Mencatat cash in dan cash out.
- Menghitung sisa kas berdasarkan transaksi yang memenuhi aturan status.
- Mengalokasikan setiap pengeluaran ke kapal/proyek tanpa memecah saldo kas menjadi wallet per kapal.
- Menampilkan ringkasan per hari.
- Menampilkan total biaya per kapal sebagai agregasi transaction allocation.
- Menampilkan transaksi yang belum direview.
- Tidak meng-hardcode nominal kas harian.
- Menampilkan source-reported balance dan canonical calculated balance saat import masih dalam proses rekonsiliasi.
- Menampilkan variance dan tidak menandai dataset trusted bila rekonsiliasi kritis belum selesai.

Formula canonical:

`closing_cash = opening_cash + cash_top_up + other_cash_in - total_cash_out`

### 7.5 Cost Entry

Field minimum:

- nomor transaksi unik;
- tanggal dan waktu;
- kapal/proyek;
- kategori biaya;
- material/item atau deskripsi biaya;
- vendor/supplier jika relevan;
- quantity dan unit jika relevan;
- harga satuan jika relevan;
- total nominal;
- metode pembayaran;
- catatan;
- bukti transaksi;
- pembuat transaksi;
- status workflow.

Status minimum:

`draft → submitted → approved/rejected/needs_correction`

Perubahan setelah submission dilakukan melalui koreksi yang terlacak, bukan overwrite diam-diam.

Transaksi wajib tetap terlihat ketika ditandai sebagai kandidat duplikat. Admin tidak boleh menghapus atau mengedit histori untuk menghilangkan double input.

### 7.6 Cost Ledger dan Audit Trail

- Setiap transaksi approved masuk ke cost ledger.
- Ledger bersifat immutable dari sudut pandang user biasa.
- Koreksi menggunakan reversal/adjustment atau mekanisme append-only yang setara.
- Sistem menyimpan actor, waktu, perubahan, dan alasan.
- Bukti lama tidak hilang ketika bukti diperbarui.

### 7.7 Review dan Approval

- Owner melihat antrean review.
- Owner dapat approve, reject, atau meminta koreksi.
- Keputusan membutuhkan timestamp dan actor.
- Reject/needs correction membutuhkan alasan.
- Transaksi mencurigakan ditandai tanpa menghalangi review manusia.
- Owner atau admin dapat melakukan project close sesuai permission.
- Project yang sudah `closed` menolak pengeluaran baru.
- Reopen, jika kelak diaktifkan, membutuhkan permission khusus, alasan, dan audit event.

### 7.8 Duplicate Detection

Sistem memberi indikasi duplikasi berdasarkan kombinasi seperti:

- nomor atau fingerprint bukti;
- vendor;
- nominal;
- tanggal/waktu;
- kapal/proyek;
- item/material;
- creator.

Tambahkan deteksi operasional untuk item serupa yang diminta kembali pada kapal yang sama, termasuk lintas hari. Duplicate flag tidak berarti transaksi pasti salah; record tetap disimpan untuk human review.

Output berupa skor/level risiko dan alasan. Sistem tidak boleh menghapus atau menolak otomatis hanya karena kandidat duplikat.

### 7.9 Risk Alert

Contoh alert MVP:

- kandidat transaksi ganda;
- nominal di luar pola normal;
- bukti transaksi tidak tersedia;
- transaksi dipecah menjadi beberapa nominal berdekatan;
- transaksi lama yang belum direview;
- pengeluaran melebihi batas yang dikonfigurasi.

Rule awal dapat bersifat deterministic. AI digunakan untuk rangkuman dan penjelasan, bukan menggantikan kontrol dasar.

### 7.10 Owner Dashboard

Minimal pada Phase 1 menampilkan:

- opening cash, top-up/cash in, cash out, dan calculated closing cash;
- pengeluaran hari ini;
- biaya per kapal/proyek;
- biaya per kategori/material;
- transaksi menunggu review;
- alert risiko aktif;
- tren pengeluaran untuk periode terpilih;
- project aktif/closed;
- freshness/completeness serta status rekonsiliasi data.

Target owner dashboard lintas fase menambahkan Piutang, Progress Kapal, unbilled project, invoice delivery, profit, dan forecast setelah modul sumbernya aktif. UI tidak boleh menampilkan placeholder seolah datanya sudah tersedia.

Angka harus dapat ditelusuri sampai ke transaksi sumber.

Pak Hanafi menerima Morning Daily Expense Brief untuk aktivitas hari sebelumnya. Waktu kirim bersifat configurable; jam final menunggu konfirmasi discovery.

### 7.11 WhatsApp Business Copilot

#### Greeting yang Dikunci

Pada awal setiap sesi WhatsApp, AI wajib mengucapkan greeting sesuai waktu lokal:

- “Selamat pagi, Pak Hanafi.”
- “Selamat siang, Pak Hanafi.”
- “Selamat sore, Pak Hanafi.”
- “Selamat malam, Pak Hanafi.”

Greeting cukup sekali pada pembukaan sesi dan tidak diulang pada setiap balasan.

#### Kemampuan MVP

Pak Hanafi dapat menanyakan:

- total dan rincian pengeluaran;
- sisa kas berdasarkan data sistem;
- biaya per kapal/proyek;
- biaya per material/kategori;
- transaksi belum direview;
- kandidat transaksi duplikat;
- alert dan ringkasan risiko;
- perbandingan antarperiode atau antarkapal.

Setelah Phase 2/3 aktif dan data terkait trusted, allowlist dapat diperluas untuk tagihan terbesar, status invoice, closed project yang belum ditagih, invoice delivery, outstanding, aging, dan payment status.

#### Guardrails

- MVP bersifat read-only.
- Hanya nomor WhatsApp yang terverifikasi dan terhubung ke user owner yang boleh mengakses data owner.
- Semua pertanyaan dan jawaban bisnis dicatat di activity log dengan perlindungan data yang sesuai.
- Jawaban wajib menyebut periode data.
- Jawaban numerik harus berasal dari query/tool terstruktur, bukan perhitungan bebas model bahasa.
- Jawaban menyediakan referensi transaksi atau deep link jika tersedia.
- Jika data kosong, belum lengkap, terlambat, atau tidak sinkron, AI harus mengatakannya dengan jelas.
- AI tidak boleh mengarang nominal, transaksi, vendor, atau kesimpulan fraud.
- AI tidak boleh menampilkan data bisnis kepada nomor yang tidak berhak.

#### Contoh Respons

> Selamat malam, Pak Hanafi. Total pengeluaran yang sudah tercatat hari ini adalah Rp18.750.000 dari 12 transaksi. Tiga transaksi senilai Rp4.200.000 masih menunggu review. Data terakhir diperbarui pukul 20.15 WIB.

### 7.12 Locked Cross-Phase Operating Requirements

#### Project Lifecycle

`active → ready_to_close → closed`

- Tipe layanan/kapal dan Facility/Dock Location merupakan field berbeda.
- Selama `active`, biaya masih dapat ditambahkan.
- Owner atau admin dapat melakukan close.
- Setelah `closed`, biaya baru diblokir.
- Histori biaya tidak boleh dihapus; koreksi memakai adjustment/reversal.

#### Assisted Billing — Phase 2

Workflow awal:

`project closed → export cost recap XLSX → admin prepares Word invoice → owner wet signature/stamp → upload signed PDF → set due date → send invoice`

- Sistem tidak memaksakan full automatic invoice generation pada versi awal karena tagihan barang/jasa sangat variatif.
- Admin dapat mengatur jatuh tempo tanpa approval owner; semua perubahan tetap diaudit.
- `closed` project tanpa invoice masuk Unbilled Vessel Alert.
- Sistem menyimpan actor, elapsed time, responsible PIC, dan reason bila invoice belum dibuat.
- Owner menerima notification event ketika invoice ditandai telah dikirim.

##### Invoice Delivery & Acknowledgement — LOCK

ADOP mengirim invoice final melalui WhatsApp dan email, melacak delivery/read signal per kanal, dan meminta explicit customer acknowledgement sebagai bukti penerimaan. Read/open signal tidak pernah otomatis menjadi acknowledgement atau persetujuan tagihan.

- Setiap pengiriman menyimpan recipient, channel, invoice version, document hash, provider message ID, timestamp, dan append-only delivery event.
- Status per kanal: `queued → sent → delivered → read/open → failed/bounced`.
- Acknowledgement wajib eksplisit melalui tombol/link terverifikasi atau balasan customer, bukan inferensi dari read/open.
- Customer dapat memilih **Ajukan Koreksi/Dispute** sebagai respons terhadap invoice.
- Provider WhatsApp dan email tetap OPEN/UNCONFIGURED pada tahap ini; tidak ada provider-specific code atau env yang diimplementasikan.

#### Manual Payment Verification — Phase 3

- Admin dapat mengonfirmasi pembayaran dari bukti transfer atau pemeriksaan rekening.
- Bukti transfer opsional; verifier, waktu, nominal, method, dan reference wajib dicatat.
- Pengakuan customer saja tidak otomatis mengubah invoice menjadi lunas.
- AI Cash Collection Intelligence mencakup invoice tracking, due date, reminder WhatsApp/email, payment matching melalui bank API atau CSV, partial payment, outstanding aging, risk score, dan executive cash collection brief.
- Bank/API integration merupakan scope quotation terpisah; CSV/manual reconciliation harus tetap menjadi fallback yang terkontrol.
- Reminder menggunakan status delivery/acknowledgement Phase 2: belum delivered, delivered-but-unread, read/open-but-unacknowledged, acknowledged, dan disputed menghasilkan tindakan berbeda.
- **Disputed** menghentikan reminder normal dan masuk human review.
- Read/open boleh menjadi risk signal, tetapi bukan bukti persetujuan atau penolakan tagihan.
- Invoice berstatus paid hanya setelah payment matching dan verification, bukan dari acknowledgement saja.

### 7.13 UI Design Reference Lock — Animated Number Change

Referensi: [Design Spells — "Animation when numbers change in Dub.co"](https://designspells.com/spells/animation-when-numbers-change-in-dub-co). ADOP mengadopsi prinsip interaksinya (bukan identitas merek Dub.co) untuk angka dashboard: digit yang berubah rolling vertikal, digit stabil tidak bergerak, width transition halus, `tabular-nums`, format `id-ID`/Rupiah, durasi ±300–500ms, menghormati `prefers-reduced-motion`, dan hanya berjalan saat trusted value berubah. Detail lengkap (area penggunaan, area larangan, aturan implementasi) sudah LOCK di `ADOP_WORKFLOW_ROADMAP_v1.0.md` §6. Komponen animasi **belum diimplementasikan**.

## 8. Notifikasi

Channel prioritas owner adalah WhatsApp. Notifikasi Phase 1 minimum:

- transaksi bernilai besar sesuai threshold;
- kandidat duplikat;
- bukti tidak lengkap;
- antrean review melewati SLA;
- ringkasan harian.

Notifikasi Phase 2/3 menambahkan closed project belum dibuatkan invoice, invoice telah dikirim, reminder jatuh tempo, dan pembayaran yang membutuhkan verifikasi manual.

Frekuensi, threshold, quiet hours, dan eskalasi harus dapat dikonfigurasi agar owner tidak mengalami alert fatigue.

## 9. Kebutuhan Data Minimum

- Tenant/company, user, role, dan verified channel identity.
- Vessel/Kapal dan Project Kapal sebagai entity terpisah.
- Project lifecycle dan timeline event.
- Kategori biaya dan material.
- Daily cash session.
- Cash top-up/funding event.
- Cost transaction dan transaction lines.
- Service type, facility/dock/gate/port, dan source reporting tag sebagai field terpisah.
- Project lifecycle event dan close actor.
- Evidence/attachment.
- Review/approval decision.
- Ledger entry/adjustment.
- Risk flag.
- Notification event.
- Conversation dan AI query log.
- Audit event.
- Import template, source file, mapping profile/version, import job, staged row, row result/error, source key, provenance, reconciliation, dan validation status.
- Phase 2/3: billing handoff, invoice, delivery event, receivable, payment allocation, dan manual payment verification.
- Phase 4+: progress, labor, facility operation, profit, dan predictive feature data sesuai fase.

Semua record bisnis wajib memiliki company/tenant ownership dan timestamp yang konsisten.

## 10. Non-Functional Requirements

### Security

- Tenant isolation dan least privilege.
- Secret tidak disimpan di source code.
- Webhook WhatsApp terverifikasi dan idempotent.
- Data sensitif dienkripsi saat transit dan mengikuti kemampuan storage saat tersimpan.
- Rate limiting dan abuse protection untuk endpoint publik.

### Reliability

- Pembuatan transaksi dan webhook harus idempotent.
- Perhitungan dashboard dapat direkonsiliasi dengan ledger.
- Kegagalan pengiriman notifikasi dapat di-retry tanpa duplikasi pesan.
- AI provider gagal tidak boleh mengganggu pencatatan transaksi inti.
- Backup dan restore procedure untuk database, evidence, serta konfigurasi kritis harus dapat diuji.

### Observability

- Structured logs tanpa membocorkan secret atau data sensitif berlebihan.
- Monitoring webhook, notification delivery, AI query, dan failed jobs.
- Audit trail tidak bergantung pada application log biasa.

### Performance

- Dashboard periode harian ditargetkan tampil dalam waktu yang wajar pada koneksi kantor normal.
- Respons WhatsApp sederhana ditargetkan cepat, dengan status tunggu apabila query membutuhkan proses lebih lama.

Target angka performa final ditentukan setelah baseline infrastruktur tersedia.

## 11. Acceptance Criteria MVP

MVP dinyatakan PASS apabila:

1. User yang tidak berhak tidak dapat melihat data perusahaan.
2. Admin dapat membuat draft biaya dengan kapal/proyek dan bukti.
3. Semua transaksi mengurangi shared cash pool dan tetap dapat diagregasi per kapal.
4. Owner atau admin dapat menutup project dan sistem menolak expense baru setelah close.
5. Kandidat double item tetap terlihat dan tidak dapat dihapus diam-diam.
6. Morning Daily Expense Brief dapat merangkum aktivitas hari sebelumnya.
7. Admin dapat mengimpor minimal satu master dataset dan satu transaction dataset melalui preview serta validation gate.
8. User dapat melanjutkan upload tanpa pernah mengunduh template.
9. Import menggunakan template dan direct upload mengikuti validation gate yang sama.
10. Direct upload menampilkan mapping kolom yang dapat diperiksa sebelum diproses.
11. Satu file `.xlsx` atau `.csv` dapat dipilih tanpa mewajibkan format pasangannya.
12. Retry import yang sama tidak menggandakan record.
13. Baris import gagal memiliki alasan dan error report tanpa menggagalkan baris valid secara diam-diam.
14. Data imported-unverified tidak digunakan AI seolah-olah trusted.
15. Import laporan kas dapat memetakan TANGGAL/KETERANGAN/NAMA KAPAL/DEBET/KREDIT/SALDO dan menampilkan rekonsiliasi.
16. Label kapal gabungan dapat dipreview sebagai Vessel, Project, period tag, dan facility candidate tanpa normalisasi diam-diam.
17. Sistem menolak submission bila field wajib belum lengkap.
18. Sistem dapat menandai kandidat transaksi duplikat beserta alasannya.
19. Owner dapat approve, reject, atau meminta koreksi.
20. Histori transaksi dan keputusan review tetap dapat diaudit.
21. Dashboard dapat menelusuri angka agregat ke transaksi sumber.
22. Pak Hanafi menerima greeting sekali pada awal sesi WhatsApp.
23. Pak Hanafi dapat menanyakan minimal lima jenis pertanyaan bisnis yang didukung.
24. Jawaban WhatsApp menyebut periode dan kondisi freshness/kelengkapan data.
25. Nomor tidak terverifikasi tidak memperoleh data bisnis.
26. AI tidak dapat melakukan write/approve/delete/pay melalui WhatsApp pada MVP.
27. Duplicate webhook atau retry tidak membuat transaksi/pesan/greeting ganda.
28. Core workflow tetap berjalan saat AI provider tidak tersedia.
29. Local automated test dan human demo checkpoint dinyatakan PASS sebelum commit/push/deploy.
30. Seluruh test kritis dan human review gate dinyatakan PASS.

## 12. Success Metrics Pilot

- Persentase pengeluaran harian yang tercatat lengkap.
- Persentase transaksi dengan bukti.
- Waktu rata-rata dari submission sampai review owner.
- Jumlah kandidat duplikat yang benar-benar berguna setelah verifikasi.
- Selisih rekonsiliasi kas terhadap pencatatan aktual.
- Persentase pertanyaan WhatsApp yang dijawab dengan data valid.
- Jumlah jawaban yang harus menyatakan data belum cukup.
- Kepuasan Pak Hanafi terhadap kecepatan memperoleh informasi bisnis.

Baseline dan target numerik dikunci setelah observasi pilot awal.

## 13. Commercial Context — Internal

Founding Design Partner proposal yang disetujui:

- pilot 90 hari;
- setup Rp5.000.000;
- subscription pilot Rp1.500.000 per bulan, minimum tiga bulan;
- initial commitment Rp9.500.000;
- setelah pilot: subscription normal Rp2.990.000 per bulan;
- Assisted Billing add-on Rp5.000.000;
- AI Cash Collection add-on Rp7.500.000;
- integrasi bank/API dikutip terpisah.

Design partner value exchange: izin penggunaan nama/logo, testimonial, anonymized case study, feedback berkala, dan minimum penggunaan sesuai kesepakatan. Bagian ini tidak mengubah acceptance criteria teknis tanpa change request eksplisit.

## 14. Roadmap Resmi

1. Phase 1 — AI Cost Control
2. Phase 2 — Billing Intelligence
3. Phase 3 — AI Cash Collection Intelligence
4. Phase 4 — Dock Operation Intelligence
5. Phase 5 — Executive Intelligence
6. Phase 6 — Predictive Intelligence

WhatsApp Business Copilot dimulai pada Phase 1 sebagai interface read-only terhadap trusted cost data, kemudian diperluas mengikuti data yang tersedia pada setiap fase.

## 15. Open Questions untuk Discovery Berikutnya

- Siapa saja role operasional selain owner dan admin/finance?
- Bagaimana definisi opening cash, top-up, pengembalian, dan closing cash aktual?
- Apakah closing cash otomatis menjadi opening cash hari berikutnya?
- Siapa yang menyetujui top-up dan apakah top-up dapat terjadi beberapa kali per hari?
- Apakah tipe Emergency/Standard/Docking/PLTU single-select atau multi-select, dan apa definisi setiap tipe?
- Apa daftar Facility/Dock/Gate/Pelabuhan/PLTU fisik PT Gamatara dan hubungan hierarkinya?
- Apakah duplicate hanya warning atau membutuhkan approval sebelum diteruskan?
- Apakah project closed dapat di-reopen dan siapa yang berwenang?
- Jam pasti Morning Daily Expense Brief?
- Apakah invoice delivery notification real-time atau masuk summary pagi?
- Apakah perlu tracking sent/delivered/read untuk WhatsApp dan email?
- Siapa yang berwenang menandai pembayaran selesai selain admin?
- Contoh Excel pengeluaran, kop surat, Word invoice, dan PDF final?
- Apakah satu pengeluaran dapat dialokasikan ke lebih dari satu kapal/proyek?
- Dokumen bukti apa yang wajib untuk setiap kategori?
- Threshold transaksi besar dan SLA review yang diinginkan Pak Hanafi?
- Apakah supplier dan material sudah memiliki kode baku?
- Selain laporan kas Excel yang sudah diterima, sistem atau format data sumber apa lagi yang digunakan?
- Dataset mana yang akan diimpor, berapa volumenya, dan bagaimana kualitas datanya?
- Nomor dan provider WhatsApp yang akan digunakan?
- Jam greeting dan zona waktu operasional yang disepakati?
- Kebijakan retensi percakapan dan bukti transaksi?

Open question bukan izin untuk mengarang requirement. Implementasi yang bergantung pada jawaban tersebut harus menggunakan konfigurasi aman atau menunggu keputusan.