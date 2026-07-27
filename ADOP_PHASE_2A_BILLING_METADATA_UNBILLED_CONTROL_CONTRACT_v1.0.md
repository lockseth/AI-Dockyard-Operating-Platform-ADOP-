# ADOP — Phase 2A Contract: Billing Metadata & Unbilled Control Freeze v1.0

**Produk:** AI Dockyard Operating Platform (ADOP)
**Design partner:** PT Gamatara
**Primary user:** Pak Hanafi — Owner
**Gate/Phase label:** **Phase 2A** — Billing Metadata & Unbilled Control Contract Freeze. Repo belum memiliki nomor gate resmi untuk pekerjaan ini (lihat §1.2 "Catatan Penamaan Gate"); "Phase 2A" dipakai mengikuti istilah `ADOP_WORKFLOW_ROADMAP_v1.0.md` §5 Phase 2 ("Phase 2A: bangun billing register... dengan invoice eksternal/manual") dan §7 butir 9.
**Sifat dokumen:** Documentation-only. **Tidak ada implementasi** (migration, RPC, RLS, UI, atau test) pada gate ini. Kontrak ini membekukan kontrak bisnis dan batas domain untuk gate implementasi berikutnya.
**Status dokumen:** Baseline v1.0.

---

## 1. Purpose dan Non-Goals

### 1.1 Purpose

Membekukan kontrak domain untuk melengkapi **Billing Completeness** (`ADOP_WORKFLOW_ROADMAP_v1.0.md` Checkpoint 2) di atas fondasi yang sudah ada:

- Gate 4A (`ADOP_GATE_4A_CONTRACT_v1.0.md`) — invoice binding, lifecycle `draft → issued → void`, evidence/signed document versioning.
- Gate 4B (`supabase/migrations/20260723000000_invoice_evidence_documents.sql`) — implementasi schema/storage dari Gate 4A.
- Gate 4C (`supabase/migrations/20260724000000_invoice_evidence_read_model.sql`) — read model (`invoice_billing_summary`, `invoice_eligible_transactions`, `transaction_invoice_bindings`) dan `record_invoice_evidence_access`.
- Commit `01dcd5e` — cost recap XLSX export (langkah "export cost recap XLSX" dari `PRD.md` §7.12).

Phase 2A membekukan tiga hal yang **belum** dibekukan di Gate 4A–4C:

1. **Billing metadata** pada invoice — identitas (nomor, legal entity, customer) dan tanggal (invoice date, due date) — yang secara eksplisit ditunda oleh Gate 4B (lihat §2 komentar migration: *"Phase 2 billing fields (client_id, due_date, currency, delivery channel) are additive follow-ups on top of this table, not part of this gate"*).
2. **Billing completeness status** per invoice — status eksplisit dan deterministic yang menggabungkan lifecycle invoice (Gate 4A §4) dengan kelengkapan metadata dan status evidence.
3. **Unbilled Vessel Alert** — kontrol wajib dari `PRD.md` §7.12 dan `ADOP_WORKFLOW_ROADMAP_v1.0.md` §3 langkah 9, yang sampai commit `01dcd5e` **belum memiliki implementasi maupun kontrak sama sekali** (lihat §3 bukti baseline).

### 1.2 Catatan Penamaan Gate

Tidak ditemukan dokumen kontrak terpisah bernama "Gate 4D" di repo. Yang ada:

- `ADOP_GATE_4A_CONTRACT_v1.0.md` dan `ADOP_GATE_4A_TEST_MATRIX_v1.0.md` — satu-satunya dokumen kontrak Gate 4x yang frozen sebagai file terpisah.
- "Gate 4B" dan "Gate 4C" hanya disebut sebagai label di header/komentar migration (`20260723000000_invoice_evidence_documents.sql`, `20260724000000_invoice_evidence_read_model.sql`) dan kode aplikasi (`src/lib/invoice-evidence/*`) — **tidak pernah dibekukan sebagai dokumen kontrak terpisah**; keduanya diimplementasikan langsung di atas kontrak Gate 4A tanpa gate dokumentasi tersendiri.
- Tidak ada "Gate 4D" dalam bentuk apa pun (dokumen, komentar migration, atau nama commit) pada baseline `01dcd5e`.

Karena numbering "Gate 4x" belum konsisten dibekukan untuk pekerjaan metadata/unbilled ini, kontrak ini memakai nama **Phase 2A** sesuai istilah roadmap yang sudah LOCK, bukan mengarang "Gate 4D"/"Gate 4E". Nama gate implementasi berikutnya (mis. apakah akan disebut "Gate 4D" atau "Phase 2A Implementation") adalah keputusan tim saat gate tersebut dimulai — lihat §17.

### 1.3 Non-Goals (lihat juga §14 Explicit Deferred Scope)

Phase 2A **tidak**:

- membuat full invoice generator, renderer, atau preview PDF;
- mengubah cost ledger immutable (`project_cost_ledger_entries`);
- mengubah issued invoice snapshot atau evidence versioning yang sudah dikunci Gate 4A/4B;
- memutuskan template invoice atau legal entity final (masih "MENUNGGU INPUT PAK HANAFI" per `ADOP_WORKFLOW_ROADMAP_v1.0.md` §2 dan §5 Phase 2);
- memilih provider pengiriman (WhatsApp/email tetap OPEN/UNCONFIGURED per `CLAUDE.md` §4 dan `PRD.md` §7.12);
- mengimplementasikan delivery/acknowledgement (`queued → sent → delivered → read/open → failed/bounced`) — itu kontrak terpisah berikutnya.

---

## 2. Bukti Baseline / As-Is

Verifikasi dijalankan terhadap HEAD `01dcd5eac159583fcde9ddea899deaba72f68cf0` (branch `master`, sama dengan `origin/master`).

### 2.1 Skema invoice saat ini (`supabase/migrations/20260723000000_invoice_evidence_documents.sql`)

```sql
create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  status public.invoice_status not null default 'draft',
  predecessor_invoice_id uuid,
  issued_at timestamptz,
  issued_by uuid references auth.users (id) on delete set null,
  void_at timestamptz,
  void_by uuid references auth.users (id) on delete set null,
  void_reason text,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  ...
);
```

**Tidak ada** kolom `client_id`, `legal_entity_id`, `invoice_number`, `invoice_date`, `due_date`, `currency`, atau `delivery_channel` pada `invoices`. Komentar migration baris 8–11 menyatakan eksplisit bahwa field-field ini "additive follow-ups... not part of this gate" — Phase 2A adalah gate follow-up tersebut.

Nilai invoice hanya dapat diketahui lewat agregasi `invoice_transaction_lines` (lihat `public.invoice_billing_summary`, Gate 4C). Relasi invoice → project → client hanya **tidak langsung**, lewat `invoice_transaction_lines.project_id → vessel_projects.client_id` per baris — bukan lewat kolom langsung di `invoices`.

### 2.2 Tidak ada pembatasan satu-project/satu-client per invoice

`bind_invoice_transaction` (`20260723000000_invoice_evidence_documents.sql` baris 505–555) hanya memvalidasi: invoice ada, actor berwenang, invoice `draft`, transaksi ada, dan tenant transaksi sama dengan tenant invoice. **Tidak ada validasi** bahwa transaksi yang di-bind berasal dari project atau client yang sama dengan baris lain yang sudah terikat pada invoice tersebut. `BindingSection.tsx` dan `invoice_eligible_transactions` (Gate 4C) menampilkan transaksi closed dari **seluruh project/tenant** sebagai kandidat, bukan dibatasi ke satu project. `cost-recap.ts` (`src/lib/invoice-evidence/cost-recap.ts`) sudah mengasumsikan kemungkinan multi-project/multi-client dalam satu invoice (setiap baris recap punya `projectCode` dan `clientName` sendiri).

Ini adalah gap material untuk desain `client_id`/`legal_entity_id` di invoice — lihat §16 Open Decisions #1.

### 2.3 Legal entity dan client saat ini

- `public.legal_entities` (`20260719070115_foundation_tenant_isolation.sql`): `id`, `tenant_id`, `legal_name` (nullable), `display_name`, `status` (`active`/`inactive`), `logo_path` (ditambahkan `20260721010000_legal_entity_branding.sql`). **Tidak ada relasi ke `clients` atau `invoices`.** `legal_entities` merepresentasikan identitas penerbit tagihan milik tenant sendiri (bukan customer) — `supabase/seed.sql` membuat satu baris per tenant saat provisioning.
- `public.clients` (`20260719080000_master_data.sql`, diperluas `20260721030000_client_billing_profile_and_pic_roles.sql`): `legal_name`, `address`, `tax_identifier`, `default_payment_term_days`, `invoice_delivery_preference` — representasi customer/PT pemilik kapal yang ditagih.
- `computeClientBillingReadiness` (`src/lib/master-data/clients/billing-readiness.ts`) sudah membekukan pola status `READY | INCOMPLETE | BLOCKED` di level **client** (kelengkapan legal name, address, PIC billing aktif dengan kanal invoice valid). Phase 2A **mereferensikan pola nama status ini** sebagai preseden konsisten untuk status baru di level invoice/project — lihat §7 dan §8.
- Roadmap masih mencatat "Apakah satu tenant memiliki satu atau beberapa legal entity penerbit invoice" sebagai **MENUNGGU INPUT PAK HANAFI** (`ADOP_WORKFLOW_ROADMAP_v1.0.md` §5 Phase 2) — skema `legal_entities` sudah mendukung banyak baris per tenant, tetapi tidak ada default/pemilihan otomatis.

### 2.4 Unbilled Vessel Alert — belum ada implementasi maupun kontrak

Pencarian `unbilled` (case-insensitive) di seluruh repo hanya menemukan kemunculan di `CLAUDE.md`, `PRD.md`, `ADOP_WORKFLOW_ROADMAP_v1.0.md`, dan `README.md` — **seluruhnya dokumen naratif, bukan kode, migration, view, atau test**. Tidak ada tabel, view, function, endpoint, atau komponen UI yang menghitung atau menampilkan Unbilled Vessel Alert pada baseline ini. §9 dan §11 membekukan kontrak untuk gate implementasi berikutnya.

### 2.5 Precedent pola yang digunakan Phase 2A

- Lifecycle state machine additive-only, tanpa skip/reverse/reopen: `private.enforce_invoice_lifecycle_transition()` (Gate 4B), `private.enforce_vessel_project_lifecycle_transition` (Gate 1B).
- Read model `security_invoker = true` view + `SECURITY DEFINER` wrapper function yang re-cek role: `public.invoice_billing_summary` + `list_invoices`/`get_invoice_summary` (Gate 4C), `public.trusted_transaction_history` (`20260720140000_trusted_transaction_history.sql`).
- Audit lewat `public.access_audit_events` existing (tenant_id, actor_user_id, entity_type, entity_id, action, before_data, after_data, created_at) — tidak ada tabel audit baru dibuat pada gate manapun sejauh ini.
- Atomic guard row-lock (`for update`) pada RPC mutasi status: `issue_invoice`, `void_invoice` (Gate 4B), `20260721020000_opening_cash_pool_atomic_guard.sql`.
- Composite tenant-safe FK `(id, tenant_id)` di setiap tabel yang direferensikan lintas tabel.
- Status enum tiga-nilai dengan short-circuit `BLOCKED` di layer domain logic murni (bukan query): `computeClientBillingReadiness`.

---

## 3. Terminologi Domain

| Istilah | Definisi | Sumber |
|---|---|---|
| **Legal Entity** | Identitas badan usaha **milik tenant** yang menerbitkan invoice (nama, alamat, NPWP, logo). Bukan customer. | `public.legal_entities` |
| **Client** | Customer/PT pemilik kapal yang ditagih. | `public.clients` |
| **Project Kapal** (`vessel_projects`) | Unit kerja/engagement per kapal dengan lifecycle `active → ready_to_close → closed`, terikat ke satu `client_id`. | `PRD.md` §7.12, `20260719100000_vessel_project_lifecycle.sql` |
| **Invoice** | Record bisnis yang mengikat transaksi closed sebagai satu tagihan; lifecycle `draft → issued → void` (Gate 4A §4). | `public.invoices` |
| **Billing Metadata** | Field identitas dan tanggal pada invoice yang **belum ada**: `legal_entity_id`, `client_id`, `invoice_number`, `invoice_date`, `due_date`. Objek utama kontrak ini. | Phase 2A (baru) |
| **Billing Completeness** | Status deterministic per invoice yang menggabungkan lifecycle + kelengkapan metadata + status evidence. | Phase 2A §7 |
| **Unbilled Vessel Alert** | Sinyal bahwa satu Project Kapal `closed` belum memiliki invoice yang mengikat seluruh biayanya secara memadai. | `PRD.md` §7.12, Phase 2A §9 |
| **Ready to Send** | Kondisi provider-agnostic bahwa sebuah invoice `issued` sudah lengkap metadata + evidence dan **secara teknis** siap masuk jalur pengiriman (bukan berarti sudah terkirim). | Phase 2A §11 |

---

## 4. Workflow LOCK Invoice Manual (Tidak Diubah)

```
project closed → export cost recap XLSX → admin prepares Word invoice →
owner wet signature/stamp → upload signed PDF → set due date → send invoice
```

(`PRD.md` §7.12, `ADOP_GATE_4A_CONTRACT_v1.0.md` §1). Phase 2A **tidak mengubah** urutan ini. Kontrak ini hanya menambahkan **di mana** metadata (`invoice_number`, tanggal, identitas) disimpan dan **kapan** boleh diisi/dikunci dalam workflow yang sama — lihat §5 dan §6. Tidak ada langkah baru ditambahkan ke workflow; "set due date" pada workflow di atas dipetakan langsung ke `due_date` pada §5.2.

---

## 5. Data Model Konseptual

Semua keputusan di bagian ini bersifat **konseptual** (nama kolom/tabel indikatif untuk gate implementasi) kecuali disebut sebagai constraint eksplisit.

### 5.1 Kolom baru pada `invoices` — **FROZEN** (struktur), **OPEN** (sebagian rule, lihat §16)

| Kolom (indikatif) | Tipe | Nullable saat `draft` | Wajib sebelum `issued` | Catatan |
|---|---|---|---|---|
| `legal_entity_id` | uuid, composite FK `(legal_entity_id, tenant_id) → legal_entities(id, tenant_id)` | ya | **ya** | Legal entity yang aktif (`status = 'active'`) pada tenant. |
| `client_id` | uuid, composite FK `(client_id, tenant_id) → clients(id, tenant_id)` | ya | **ya** | Lihat §16 Open Decision #1 untuk aturan konsistensi dengan `invoice_transaction_lines`. |
| `invoice_number` | text | ya | **ya** | Format prefix/penomoran **OPEN** — menunggu identitas legal entity final (§16 Open Decision #2). |
| `invoice_date` | date | ya | **ya** | Lihat §6.2. |
| `due_date` | date | ya | **ya** | Lihat §6.2; harus `>= invoice_date`. |

Keempatnya **additive** di atas tabel `invoices` Gate 4B — tidak mengubah kolom lifecycle (`status`, `issued_at`, `void_*`, dsb.) yang sudah dibekukan.

### 5.2 Unique constraint invoice number — **FROZEN** (arah), **OPEN** (bentuk pasti)

- **FROZEN:** `invoice_number` unik **per legal entity** (bukan per tenant secara global, dan bukan global lintas tenant). Ini sesuai instruksi task dan konsisten dengan roadmap: satu tenant berpotensi punya beberapa legal entity penerbit (§2.3), masing-masing entity biasanya punya rangkaian nomor sendiri (mis. prefix berbeda).
- **FROZEN:** dua legal entity **boleh** memakai `invoice_number` yang sama (mis. keduanya mulai dari `001`) tanpa konflik — constraint tidak boleh berupa unique global.
- **DERIVED FROM EXISTING CONTRACT:** constraint memakai pola partial unique index tenant-safe yang sama seperti `clients_tenant_id_client_code_uidx` (`20260719080000_master_data.sql`) dan partial unique index binding aktif Gate 4A §3 — yaitu unique pada `(tenant_id, legal_entity_id, invoice_number)` **where `invoice_number` is not null**, sehingga invoice `draft` tanpa nomor tidak memblokir invoice lain.
- **OPEN:** apakah `invoice_number` yang sudah dipakai oleh invoice yang kemudian di-`void` tetap "terpakai" (mengunci nomor tersebut selamanya) atau dibebaskan untuk dipakai ulang. Rekomendasi default (belum LOCK): nomor tetap terpakai selamanya (konsisten dengan prinsip append-only/tidak menghapus jejak, dan mencegah dua dokumen fisik berbeda memakai nomor sama) — lihat §16 Open Decision #3.

### 5.3 Tidak ada tabel baru untuk billing metadata

Berbeda dari Gate 4B (yang menambah 3 tabel baru untuk evidence), Phase 2A **tidak memerlukan tabel baru** — seluruh metadata adalah kolom tambahan pada `invoices` yang sudah ada. Ini mengurangi permukaan migrasi dan konsisten dengan komentar Gate 4B bahwa field-field ini memang dirancang sebagai "additive follow-ups on top of this table".

---

## 6. State/Transition Rules

### 6.1 Kapan metadata boleh diisi/diubah

- **FROZEN:** mengikuti pola binding Gate 4A §3 — seluruh lima field metadata (§5.1) **hanya dapat diisi atau diubah selama invoice berstatus `draft`**. Begitu invoice `issued`, kelimanya terkunci (immutable), identik dengan perlakuan `invoice_transaction_lines` dan nominal snapshot.
- **FROZEN:** koreksi metadata setelah `issued` **wajib** memakai mekanisme void + reissue yang sudah dibekukan Gate 4A §3 (invoice baru dengan `predecessor_invoice_id`), **bukan** update langsung pada kolom metadata invoice yang sudah `issued`.
- **DERIVED FROM EXISTING CONTRACT:** mekanisme penguncian mengikuti pola trigger append-only/immutability yang sama seperti `private.enforce_invoice_lifecycle_transition()` dan larangan update binding pada invoice `issued` (Gate 4A F4) — perluasan trigger constraint yang sama, bukan trigger baru yang terpisah secara desain.

### 6.2 Validasi relasi `invoice_date` dan `due_date`

- **FROZEN:** `due_date >= invoice_date` (boleh sama hari; termin pembayaran nol hari adalah kasus valid, mis. cash on delivery).
- **FROZEN:** kedua tanggal wajib terisi sebelum invoice dapat bertransisi ke `issued` — diperluas dari `invoices_issued_shape` check constraint Gate 4B yang sudah ada (pola yang sama, field bertambah).
- **DERIVED FROM EXISTING CONTRACT:** `default_payment_term_days` pada `clients` (`20260721030000_client_billing_profile_and_pic_roles.sql`) dapat dipakai **UI-side** untuk menyarankan default `due_date = invoice_date + default_payment_term_days` — ini hanya bantuan pengisian, bukan constraint database, dan admin tetap bisa mengubahnya secara manual (`clients.default_payment_term_days` sudah eksplisit nullable/opsional, tidak boleh dipaksakan sebagai satu-satunya sumber nilai).
- **OPEN:** apakah `invoice_date` boleh berbeda dari tanggal `created_at`/tanggal `issued_at` (mis. admin mengisi invoice_date mundur untuk mencocokkan tanggal fisik dokumen yang sudah ditandatangani terlebih dulu di luar sistem). Rekomendasi default: **diizinkan** (tidak ada constraint yang mengikat `invoice_date` ke `created_at`/`issued_at`), karena workflow LOCK §4 menandatangani dokumen fisik dulu baru upload — tanggal invoice fisik bisa mendahului tanggal `issued` di sistem. Ditandai OPEN karena berdampak pada urutan/pelaporan periode; perlu konfirmasi Pak Hanafi jika ingin dibatasi.

### 6.3 Siapa boleh mengisi/mengubah

- **FROZEN (mengikuti §7 Gate 4A, diteruskan tanpa perubahan):** hanya `owner` dan `admin` yang dapat membuat/mengubah metadata invoice, sama seperti hak membuat/menerbitkan/void invoice. `reviewer`/`viewer` tidak mendapat akses tulis maupun baca ke invoice (lihat §10).
- **FROZEN:** tidak ada maker-checker baru diperkenalkan pada Phase 2A — pola v1 Gate 4A §7 ("verifier boleh sama dengan uploader") diteruskan apa adanya untuk metadata: pembuat draft dan penerbit invoice boleh orang yang sama.

---

## 7. Billing Completeness Definition — Per Invoice

**FROZEN** status enum berikut, dievaluasi **deterministic** dari state invoice + evidence yang sudah ada (tidak memerlukan tabel status terpisah — dihitung, bukan disimpan, mengikuti pola `computeClientBillingReadiness` yang murni fungsi atas data yang sudah dimuat):

| Status | Kondisi | Evaluasi terhadap status existing |
|---|---|---|
| `NO_INVOICE` | Project `closed` belum memiliki invoice manapun yang mengikat transaksinya. | Bukan status invoice — status level project; lihat §9. Dicantumkan di sini karena ini adalah pintu masuk state machine completeness. |
| `DRAFT_INCOMPLETE` | Invoice `draft` dan salah satu dari: tidak ada baris `invoice_transaction_lines`, atau salah satu metadata §5.1 (`legal_entity_id`, `client_id`, `invoice_number`, `invoice_date`, `due_date`) kosong. | Baru — deterministic dari NULL check + `line_count = 0` pada `invoice_billing_summary`. |
| `DRAFT_READY_TO_ISSUE` | Invoice `draft`, punya ≥1 baris binding, dan seluruh metadata §5.1 terisi valid (termasuk `due_date >= invoice_date`). | Baru — precondition sebelum `issue_invoice` dipanggil; **belum tentu berarti tombol "Terbitkan" akan sukses** (race condition tetap mungkin, lihat §12), hanya representasi read-model. |
| `ISSUED_EVIDENCE_PENDING` | Invoice `issued`, belum ada `invoice_evidence_versions` current, atau current version berstatus `pending`/`rejected` (belum `verified`). | Menggabungkan Gate 4A §5's `is_final_document` (sudah ada di `invoice_billing_summary.is_final_document`) dengan lifecycle `issued`. |
| `READY_TO_SEND` | Invoice `issued`, `is_final_document = true` (current version `verified`), seluruh metadata §5.1 lengkap, dan invoice tidak `void`. | Lihat definisi presisi di §11 — provider-agnostic, tidak berarti benar-benar terkirim. |
| `SENT` | **DEFERRED.** Hanya valid setelah kontrak delivery/acknowledgement (channel, provider, status per kanal) dibekukan secara terpisah (`PRD.md` §7.12 "Invoice Delivery & Acknowledgement — LOCK"). Phase 2A **tidak** mendefinisikan kapan status ini aktif — lihat §14. | Placeholder nama status saja; **tidak diimplementasikan pada gate manapun sampai kontrak delivery dibekukan.** |
| `VOID` | `invoices.status = 'void'` (Gate 4A §4). | Sudah ada — status lifecycle existing, dipetakan langsung. |

**FROZEN — aturan status baru:** Tidak ada status completeness tambahan di luar tabel ini boleh ditambahkan pada gate implementasi tanpa menjelaskan (a) kebutuhan domain yang tidak tertutup status existing, dan (b) kompatibilitasnya dengan `invoice_status` enum Gate 4A (`draft`/`issued`/`void`) — status completeness **tidak pernah menggantikan** `invoice_status`, hanya proyeksi read-only di atasnya (pola yang sama seperti `invoice_billing_summary` tidak mengubah kolom `invoices.status`).

**OPEN:** apakah `READY_TO_SEND` dan `ISSUED_EVIDENCE_PENDING` cukup sebagai dua status pasca-issued, atau dibutuhkan status ketiga untuk "issued, evidence verified, tapi metadata sengaja belum lengkap karena void+reissue sedang berjalan" — kasus ini secara teori tidak mungkin terjadi karena metadata dikunci sebelum `issued` (§6.1), sehingga tidak menghasilkan status baru; dicatat di sini agar tidak dianggap terlewat.

---

## 8. Read Model Konseptual

**DERIVED FROM EXISTING CONTRACT** — pola persis Gate 4C (`invoice_billing_summary` + `SECURITY DEFINER` wrapper, `security_invoker = true` view, tidak di-grant langsung ke `authenticated`):

- Perluasan `invoice_billing_summary` (view existing) dengan kolom metadata §5.1 dan kolom completeness status §7 (dihitung via `case`/`coalesce`, bukan tabel baru) — **additive** terhadap view Gate 4C, tidak mengubah kolom yang sudah ada.
- Fungsi wrapper baru mengikuti pola `list_invoices`/`get_invoice_summary` (Gate 4C) — re-verifikasi role `owner`/`admin` via `private.current_user_has_tenant_role` sebelum mengembalikan baris.
- Tidak ada perubahan pada `invoice_eligible_transactions` atau `transaction_invoice_bindings` (Gate 4C) — keduanya di luar scope metadata/completeness.

---

## 9. Unbilled Vessel Alert — Definisi Frozen

### 9.1 Kondisi persis "unbilled"

**FROZEN:** Sebuah Project Kapal (`vessel_projects`) dianggap **unbilled** jika dan hanya jika:

1. `lifecycle_status = 'closed'` (project belum closed tidak pernah dianggap unbilled — Gate 1B/PRD §7.12 mengizinkan biaya ditambah selama `active`, sehingga menagih sebelum closed adalah prematur), **dan**
2. project tersebut memiliki **minimal satu** baris `project_cost_ledger_entries` berstatus billable (`entry_kind = 'expense'`, tidak di-reverse — pola persis `invoice_eligible_transactions` Gate 4C) yang **belum pernah** terikat ke invoice aktif (`draft`/`issued`) manapun — direct reuse `invoice_eligible_transactions` view Gate 4C, difilter per `project_id`, **atau**
3. project memiliki baris cost ledger yang seluruhnya sudah terikat, namun **seluruh** invoice pengikatnya berstatus `void` tanpa reissue aktif pengganti (predecessor chain berakhir di `void` tanpa `successor_invoice_id`).

**FROZEN — project TIDAK unbilled jika:** seluruh baris cost ledger billable project tersebut sudah terikat pada minimal satu invoice **aktif** (`draft` atau `issued`) — **termasuk invoice yang masih `draft`**. Ini adalah keputusan disengaja: begitu admin mulai membuat draft invoice untuk sebuah project, project itu tidak lagi tampil sebagai "belum ada tindakan" di alert, meskipun invoice belum `issued`/`READY_TO_SEND`. Alasan: `PRD.md` §7.12 mendefinisikan alert berbasis "`closed` project tanpa invoice", bukan "tanpa invoice issued" — kata "invoice" tanpa kualifikasi status ditafsirkan mencakup `draft` sebagai bukti sudah ada tindakan. **DERIVED FROM EXISTING CONTRACT** — pola ini konsisten dengan definisi "invoice aktif" Gate 4A §3 (`draft` atau `issued`, `void` tidak aktif).

**OPEN — NEEDS OWNER CONFIRMATION:** apakah kondisi #3 (semua invoice void, tidak ada reissue) memang harus tetap dianggap "unbilled" (kembali ke alert) — ini secara teknis benar (tidak ada invoice aktif), tetapi berarti sebuah project yang **pernah** ditagih lalu invoice-nya di-void karena kesalahan administratif (bukan pembatalan tagihan) akan kembali muncul di alert sampai reissue selesai. Direkomendasikan sebagai **perilaku yang benar** (alert seharusnya aktif sampai ada invoice pengganti), tetapi ditandai OPEN karena berdampak pada frekuensi alert yang dilihat Pak Hanafi.

### 9.2 Kapan alert muncul dan hilang

**FROZEN:**

- **Muncul:** segera setelah project bertransisi ke `closed` **dan** ada baris cost ledger billable yang tidak terikat invoice aktif — dihitung real-time dari read model (§9.3), bukan event terjadwal/batch. Tidak ada delay/grace period yang dibekukan pada gate ini (jika Pak Hanafi menginginkan grace period, itu OPEN discovery terpisah, bukan bagian kontrak ini).
- **Hilang:** segera setelah seluruh baris cost ledger billable project terikat pada invoice aktif (`draft` atau `issued`) — **bukan menunggu evidence verified atau `READY_TO_SEND`**. Ini konsisten dengan §9.1: begitu draft invoice mengikat semua transaksi, alert hilang meskipun completeness invoice masih `DRAFT_INCOMPLETE`.
- Alert **tidak pernah** disimpan sebagai baris/state persisten (tidak ada tabel `unbilled_vessel_alerts`) — selalu dihitung ulang dari read model saat diminta, mengikuti prinsip "tidak boleh silent-overwrite" dan menghindari state basi (`CLAUDE.md` §9 "Aggregate dashboard dapat ditelusuri dan direkonsiliasi ke source transactions").

### 9.3 Read model/query yang diperlukan

**DERIVED FROM EXISTING CONTRACT** — konseptual, mengikuti pola `security_invoker` view + `SECURITY DEFINER` wrapper Gate 4C:

- View konseptual `unbilled_vessel_projects` (nama indikatif): satu baris per `vessel_projects` yang `lifecycle_status = 'closed'` dan memenuhi §9.1, dengan kolom minimal: `project_id`, `tenant_id`, `vessel_id`, `vessel_name`, `client_id`, `closed_at`, `unbilled_transaction_count`, `unbilled_amount_total`, `elapsed_since_closed` (`PRD.md` §7.12 "Sistem menyimpan actor, elapsed time, responsible PIC, dan reason bila invoice belum dibuat").
- Dibangun di atas `invoice_eligible_transactions` (Gate 4C, sudah ada) yang di-`group by project_id` — **tidak** query baru ke `project_cost_ledger_entries` secara langsung, reuse view yang sudah difilter closed + non-reversed + tidak terikat invoice aktif.
- Fungsi wrapper `list_unbilled_vessel_projects(p_tenant_id uuid)` — pola identik `list_invoice_eligible_transactions` (Gate 4C), re-cek role via `private.current_user_has_tenant_role`.

**OPEN:** apakah `responsible PIC` (`PRD.md` §7.12) berarti PIC internal ADOP (siapa admin yang menutup project) atau PIC client (kontak billing customer). Rekomendasi default: PIC internal (`vessel_projects.closed_by` sudah ada dari Gate 1B) — kolom ini sudah tersedia tanpa migrasi tambahan; PIC client adalah data terpisah (`client_contacts` dengan `role = 'billing'`) yang bisa ditambahkan sebagai kolom join, bukan field baru. Ditandai OPEN karena PRD tidak eksplisit menyebut yang mana.

### 9.4 Akses Owner/Admin

**FROZEN — mengikuti §10:** hanya `owner`/`admin` dapat melihat Unbilled Vessel Alert, konsisten dengan akses invoice/evidence Gate 4A §7 (bukan pola read-only master data yang mengizinkan `reviewer`/`viewer`), karena alert ini membocorkan nilai finansial per project (`unbilled_amount_total`) yang setara sensitivitasnya dengan trusted ledger.

### 9.5 Empty/loading/error state — kontrak UI

**FROZEN (kontrak, bukan implementasi):**

- **Empty (tidak ada unbilled project):** state positif eksplisit ("Semua Project Kapal closed sudah tertagih") — **bukan** ditampilkan sebagai halaman kosong tanpa pesan, agar owner tahu ini hasil query yang berhasil, bukan kegagalan diam-diam.
- **Loading:** skeleton/placeholder yang tidak menampilkan angka `0` atau daftar kosong sebagai nilai sementara (mencegah owner salah baca "tidak ada" saat sebenarnya masih memuat) — konsisten dengan `ADOP_WORKFLOW_ROADMAP_v1.0.md` §6 "Nilai akhir harus selalu sama dengan trusted data; animasi tidak boleh menunda, membulatkan, atau mengubah makna angka" (prinsip yang sama diterapkan ke loading state: tidak ada angka yang dipalsukan sebagai placeholder).
- **Error (query gagal):** wajib eksplisit menyatakan alert **tidak dapat dimuat**, bukan menampilkan "tidak ada unbilled" — kegagalan tidak boleh terlihat seperti kondisi aman (`CLAUDE.md` §9 semangat "stale/missing data ditandai, bukan ditafsirkan sebagai kondisi normal", dikutip dari `ADOP_WORKFLOW_ROADMAP_v1.0.md` Checkpoint 5, diterapkan lebih awal di sini karena prinsip yang sama relevan).

### 9.6 Auditability

**FROZEN:** Alert sendiri tidak menghasilkan audit event baru (ia adalah proyeksi read-only, bukan mutasi). Namun **setiap perubahan state yang memengaruhi alert** (project closed, invoice dibuat/terbit/void, binding transaksi) **sudah** menghasilkan audit event lewat mekanisme existing (`vessel_project_lifecycle_events`, `access_audit_events` dengan action `invoice.created`/`invoice.issued`/`invoice.voided`/`invoice.transaction_bound`/`invoice.transaction_unbound` — semua sudah ada dari Gate 1B/4A/4B). Alert harus **dapat direkonstruksi** dari histori event-event ini kapan pun (mis. "mengapa project X muncul di alert pada tanggal Y") — ini adalah properti otomatis dari desain "dihitung, bukan disimpan" (§9.2), bukan tabel audit tambahan.

### 9.7 Idempotency dan concurrency

**FROZEN:**

- Alert adalah hasil query, bukan operasi tulis — **tidak ada** pertanyaan idempotency untuk "membuat" alert (tidak ada insert). Idempotency yang relevan sudah dibekukan di level penyebab (binding F3/F12, lifecycle F10 — Gate 4A §9), bukan di level alert.
- **Concurrency:** dua admin membuka dashboard Unbilled Vessel Alert secara bersamaan **tidak** menghasilkan race condition apa pun karena keduanya hanya membaca read model yang sama — properti ini gratis dari desain read-only, dicatat eksplisit agar tidak dianggap luput dari analisis.
- **Race yang relevan** justru terjadi di sisi penyebab: dua admin mem-bind transaksi terakhir sebuah project ke dua invoice `draft` berbeda secara bersamaan — ini **sudah** ditangani oleh Gate 4A F3 (partial unique index pada binding aktif) dan F10 (`for update` row lock); alert secara otomatis konsisten dengan hasil race tersebut karena ia membaca state pasca-transaksi, bukan state antara.

---

## 10. Read/Write Authorization Matrix

**FROZEN — meneruskan Gate 4A §7 tanpa perubahan, diperluas ke object baru:**

| Tindakan | owner | admin | reviewer | viewer |
|---|---|---|---|---|
| Membaca/mengubah billing metadata invoice (§5.1) saat `draft` | ✅ | ✅ | ❌ | ❌ |
| Membaca billing metadata invoice `issued`/`void` | ✅ | ✅ | ❌ | ❌ |
| Membaca billing completeness status (§7) | ✅ | ✅ | ❌ | ❌ |
| Membaca Unbilled Vessel Alert (§9) | ✅ | ✅ | ❌ | ❌ |
| Membaca ready-to-send status (§11) | ✅ | ✅ | ❌ | ❌ |

**Keputusan yang dibekukan:** tidak ada role atau permission baru diperkenalkan; matrix identik dengan Gate 4A §7 (dibatasi `owner`+`admin`, bukan pola master-data read-only). Tidak ada maker-checker baru (§6.3).

---

## 11. Tenant Isolation

**FROZEN — tidak ada pola baru, reuse penuh:**

- Setiap kolom metadata baru (`legal_entity_id`, `client_id`) **wajib** memakai composite tenant-safe FK `(kolom_id, tenant_id) → target(id, tenant_id)`, pola identik seluruh FK Gate 1A–4C (mis. `invoice_transaction_lines.project_id` → `vessel_projects(id, tenant_id)`).
- Read model baru (§8, §9.3) wajib `security_invoker = true` + `SECURITY DEFINER` wrapper yang re-cek `private.current_user_has_tenant_role(p_tenant_id, ...)` sebelum mengembalikan baris — tidak pernah bergantung hanya pada RLS tabel dasar tanpa re-verifikasi di wrapper, mengikuti pola Gate 4C persis.
- Tidak ada mekanisme baru untuk lintas-tenant sharing (mis. satu invoice merujuk client dari tenant lain) — composite FK membuat ini **structurally impossible**, bukan hanya divalidasi di RPC.

---

## 12. Audit Events

**FROZEN — extend `access_audit_events` existing, tidak ada tabel audit baru:**

| Action | entity_type | Kapan |
|---|---|---|
| `invoice.metadata_updated` | `invoice` | Setiap kali salah satu dari lima field §5.1 diubah saat `draft` (before/after mencakup field yang berubah saja, bukan seluruh row, mengikuti granularitas `before_data`/`after_data` yang sudah dipakai action lain). |
| `invoice.metadata_locked` | `invoice` | Implisit terjadi bersamaan dengan `invoice.issued` (Gate 4A) — **tidak perlu action baru terpisah** jika `invoice.issued`'s `after_data` sudah menyertakan snapshot metadata; keputusan final bentuk payload adalah detail implementasi Gate berikutnya, bukan perlu action baru. Dicantumkan di sini hanya untuk menegaskan bahwa penguncian metadata **harus** tercermin di audit trail, dengan cara apa pun yang konsisten dengan pola existing. |

**DERIVED FROM EXISTING CONTRACT:** format audit mengikuti pola persis `invoice.created`/`invoice.issued`/`invoice.voided` (Gate 4A §8) — actor, timestamp (`created_at`), before/after data. Tidak ada action audit baru untuk membaca Unbilled Vessel Alert (§9.6 — read-only, tidak dimutasi).

**Larangan eksplisit (FROZEN):** tidak ada mutasi apa pun terhadap `invoice_transaction_lines` yang sudah terkunci, `invoice_evidence_versions` manapun, atau baris `invoices` yang sudah `issued`/`void` di luar kolom metadata yang secara eksplisit didesain immutable pasca-`issued` (§6.1) — kontrak ini **hanya** menambah kolom baru dan tidak menyentuh perilaku append-only/immutable yang sudah dibekukan Gate 4A/4B.

---

## 13. Idempotency dan Concurrency Rules

**FROZEN:**

- **Update metadata saat `draft`:** idempotent secara alami (update kolom by value, retry dengan payload identik menghasilkan state akhir sama, audit event boleh dobel dicatat sebagai detail implementasi — bukan pelanggaran kontrak selama tidak menggandakan efek bisnis; direkomendasikan precondition check "hanya insert audit jika before≠after" mengikuti pola umum, tapi ini keputusan implementasi bukan kontrak).
- **Constraint invoice_number unik:** race dua draft invoice diberi `invoice_number` sama secara konkuren **ditolak deterministic** oleh partial unique index (§5.2) — pola identik F3 Gate 4A (partial unique index, bukan validasi aplikasi semata).
- **Transisi ke `issued` dengan metadata belum lengkap:** ditolak oleh extended `invoices_issued_shape` check constraint (§6.2) — kegagalan constraint database, bukan hanya validasi UI, konsisten dengan `CLAUDE.md` §10 "Critical invariants diberi database constraint/policy bila tepat, bukan hanya UI validation".
- **Concurrent read Unbilled Vessel Alert:** lihat §9.7 — tidak ada state tertulis, sehingga tidak ada concurrency hazard pada level alert itu sendiri.

---

## 14. Compatibility dengan Gate 4B/4C/4D

- **Gate 4B (schema/storage):** Phase 2A murni additive di atas `invoices` — tidak mengubah tipe kolom, constraint, trigger, atau RLS yang sudah ada. `invoices_issued_shape` **diperluas** (bukan diganti) untuk mensyaratkan lima field baru juga terisi sebelum `issued`.
- **Gate 4C (read model):** `invoice_billing_summary` **diperluas** dengan kolom baru; `invoice_eligible_transactions` dan `transaction_invoice_bindings` **tidak berubah**. Semua RPC read Gate 4C tetap berfungsi identik untuk konsumen yang belum di-update ke kolom baru (backward compatible — kolom lama tidak dihapus/di-rename).
- **"Gate 4D":** tidak ada — lihat §1.2. Tidak ada regresi untuk dijaga karena tidak ada implementasi Gate 4D yang sudah ada.
- **Cost recap XLSX (`01dcd5e`):** `cost-recap.ts` membaca `get_invoice_summary`, `invoice_transaction_lines`, dan master data client/vessel secara langsung — **tidak bergantung** pada kolom metadata baru. Penambahan metadata **tidak** mengharuskan perubahan pada cost recap export; opsional untuk ditambahkan sebagai header rekap (mis. menampilkan `invoice_number` yang sedang disusun) sebagai enhancement terpisah, bukan bagian wajib Phase 2A.

---

## 15. Failure Behavior

**FROZEN:**

- Metadata tidak lengkap → `issue_invoice` gagal dengan pesan eksplisit menyebutkan field yang kurang (pola sama seperti pesan error existing `issue_invoice`/`bind_invoice_transaction`, bukan pesan generik).
- `invoice_number` duplikat dalam legal entity yang sama → constraint database menolak, pesan error mapped ke UI (pola sama seperti `errors.ts` — "matched by fixed, internally-owned P0001 messages", `src/lib/invoice-evidence/errors.ts` baris 7).
- `due_date < invoice_date` → ditolak sebelum transisi `issued` (check constraint), bukan hanya peringatan UI.
- Legal entity `inactive` dipilih → **OPEN**, lihat §16 Open Decision #4.
- Read model Unbilled Vessel Alert gagal query (mis. timeout) → UI wajib menampilkan error state eksplisit (§9.5), tidak boleh fallback ke "tidak ada unbilled".
- Core system (dashboard, invoice list) tetap berjalan jika Unbilled Vessel Alert query gagal — alert adalah lapisan tambahan yang gagal secara terisolasi, tidak boleh memblokir rendering invoice list/detail lain (prinsip yang sama seperti `CLAUDE.md` §8 "Core system tetap bekerja saat AI provider gagal", diterapkan di sini untuk kegagalan read-model non-kritis).

---

## 16. Open Decisions — Tidak Dapat Diputuskan dari Repo

1. **OPEN — NEEDS OWNER/LEGAL CONFIRMATION.** Apakah satu invoice **wajib** hanya mengikat transaksi dari **satu client** yang sama (validasi silang saat bind: client project transaksi baru harus sama dengan `invoice.client_id` yang sudah dipilih/tersirat dari baris lain), atau ADOP tetap mengizinkan satu invoice mengonsolidasikan transaksi dari **banyak project/client sekaligus** (perilaku permisif saat ini, §2.2). PRD/roadmap memakai bahasa singular ("Invoice terkait langsung dengan... customer/legal entity") yang mengindikasikan relasi 1:1, tetapi implementasi Gate 4B/4C yang sudah frozen tidak pernah mengunci ini, dan `cost-recap.ts` sudah dirancang mendukung baris multi-client dalam satu rekap. **Ini adalah konflik potensial antara bahasa PRD dan implementasi frozen — didokumentasikan di sini, tidak diputuskan sepihak.** Dampak: jika owner memilih "satu client per invoice", `bind_invoice_transaction` (Gate 4B, sudah frozen) perlu constraint tambahan non-breaking (validasi baru, tidak mengubah struktur existing) pada gate implementasi berikutnya.
2. **OPEN — NEEDS OWNER/LEGAL CONFIRMATION.** Format/prefix `invoice_number` (mis. `INV/2026/001` vs `2026-001` vs bebas teks) — bergantung pada identitas legal entity final yang menurut roadmap masih "MENUNGGU INPUT PAK HANAFI". Phase 2A hanya membekukan bahwa kolom ini **ada**, **teks bebas** (tidak divalidasi formatnya di database selain non-kosong), dan **unik per legal entity** — bukan format spesifik.
3. **OPEN.** Apakah `invoice_number` dari invoice yang di-`void` dibebaskan untuk dipakai ulang oleh invoice lain, atau tetap terkunci selamanya. Rekomendasi default (§5.2): tetap terkunci — perlu konfirmasi sebelum diimplementasikan sebagai constraint permanen (pilihan ini sulit diubah setelah data produksi ada).
4. **OPEN.** Perilaku saat admin memilih `legal_entity_id` yang berstatus `inactive` untuk invoice baru — ditolak keras (constraint/RPC check) atau diizinkan dengan peringatan. Tidak ada preseden di Gate 4A–4C untuk kasus ini (evidence/binding tidak punya referensi ke `legal_entities` sama sekali).
5. **OPEN.** Definisi persis "responsible PIC" pada Unbilled Vessel Alert (§9.3) — PIC internal ADOP vs PIC client billing.
6. **OPEN.** Apakah Unbilled Vessel Alert perlu grace period (mis. N hari setelah closed sebelum alert muncul) — tidak disebut di PRD/roadmap; kontrak ini membekukan "muncul segera" (§9.2) sebagai default paling ketat, dapat dilonggarkan kemudian sebagai keputusan produk terpisah, bukan perubahan kontrak keamanan.

---

## 17. Explicit Deferred Scope

Ditunda ke gate/kontrak terpisah berikutnya, **bukan** bagian Phase 2A:

- **Invoice generator/renderer/preview PDF** — tetap di luar scope sesuai `ADOP_GATE_4A_CONTRACT_v1.0.md` §10 dan `PRD.md` §7.12; workflow tetap Word manual + wet signature (§4).
- **Provider delivery** (WhatsApp/email) — tetap OPEN/UNCONFIGURED (`CLAUDE.md` §4, `PRD.md` §7.12 "Invoice Delivery & Acknowledgement — LOCK" sudah membekukan *kontrak bisnis* delivery, tetapi bukan implementasi/provider; Phase 2A tidak menyentuh keduanya).
- **Acknowledgement/dispute** — kontrak bisnisnya sudah LOCK di `PRD.md` §7.12, tetapi implementasi (state machine `queued→sent→delivered→read/open→failed/bounced`, tombol/link verifikasi, Ajukan Koreksi/Dispute) adalah gate kontrak terpisah setelah Phase 2A.
- **Status `SENT`** pada §7 — placeholder nama saja; tidak aktif sampai kontrak delivery dibekukan.
- **Payment verification/matching** (Phase 3) — tidak disentuh sama sekali.
- **Backfill data invoice historis** — lihat §18; kebijakan migrasi dibekukan tapi eksekusi backfill nyata adalah pekerjaan gate implementasi, bukan Phase 2A dokumentasi.

---

## 18. Migration/Backfill Policy

**FROZEN (kebijakan, bukan eksekusi):**

- Kolom baru §5.1 wajib **nullable** saat ditambahkan (`alter table ... add column ... ` tanpa `not null`) — tidak boleh mem-break invoice `draft`/`issued`/`void` yang sudah ada di data manapun (dev/staging), konsisten dengan pola additive seluruh migration existing (mis. `20260721010000_legal_entity_branding.sql` menambah `logo_path` nullable).
- **Tidak ada backfill otomatis** untuk invoice `issued`/`void` yang sudah ada sebelum Phase 2A — metadata tetap kosong untuk invoice lama (bukan diisi nilai tebakan/default palsu). Constraint "wajib terisi sebelum `issued`" (§6.2) **hanya berlaku untuk transisi status yang terjadi setelah gate implementasi berjalan** — tidak retroaktif memvalidasi invoice yang sudah `issued` sebelumnya (constraint check hanya jalan `before update`/`before insert`, tidak pernah men-scan data lama).
- Jika di masa depan ditemukan invoice `issued` lama tanpa metadata, itu adalah **limitation yang harus dicatat eksplisit** (bukan pelanggaran constraint, karena constraint tidak retroaktif) — laporan/UI harus menampilkan metadata kosong apa adanya, bukan menyembunyikan invoice tersebut.

---

## 19. Observability Minimum

**FROZEN (kontrak, bukan implementasi):**

- Setiap invoice yang mencapai `READY_TO_SEND` (§7, §11) harus dapat ditelusuri kapan status itu tercapai — turunan dari `access_audit_events` existing (evidence verified + issued + metadata lengkap), tidak memerlukan log terpisah.
- Unbilled Vessel Alert harus dapat dijelaskan ("mengapa project ini muncul") dengan drill-down ke daftar transaksi yang belum terikat (`invoice_eligible_transactions` per project, Gate 4C, sudah tersedia) — tidak ada agregat yang tidak bisa ditelusuri ke baris sumber (`CLAUDE.md` §9).

---

## 20. Acceptance Criteria — Gate Implementasi Berikutnya

Gate implementasi (migration/RPC/UI) untuk Phase 2A dianggap **PASS** jika:

1. Kelima kolom metadata §5.1 ditambahkan additive ke `invoices`, nullable, dapat diisi/diubah hanya saat `draft`.
2. `invoices_issued_shape` diperluas mensyaratkan kelima field terisi sebelum `issued`; test menolak transisi jika ada yang kosong (lihat test matrix B/D series).
3. Partial unique index `(tenant_id, legal_entity_id, invoice_number) where invoice_number is not null` mencegah duplikat dalam legal entity yang sama, dan mengizinkan nomor sama di legal entity berbeda.
4. `due_date >= invoice_date` ditegakkan sebagai check constraint.
5. Read model billing completeness (§7) dan Unbilled Vessel Alert (§9) tersedia sebagai view + `SECURITY DEFINER` wrapper, dibatasi `owner`/`admin`, tenant-isolated, dan tidak mengubah perilaku `invoice_eligible_transactions`/`transaction_invoice_bindings` existing.
6. Tidak ada regresi pada seluruh test Gate 4A/4B/4C existing (`invoice_evidence_binding.test.sql`, `invoice_evidence_read_model.test.sql`, `client_billing_profile_and_pic_roles.test.sql`, `invoice-evidence.integration.test.ts`).
7. Audit event `invoice.metadata_updated` tercatat untuk setiap perubahan metadata saat `draft`.
8. Open Decisions §16 #1–#6 sudah mendapat keputusan eksplisit dari Pak Hanafi/legal sebelum item terkait diimplementasikan sebagai constraint permanen yang sulit diubah (khususnya #1 dan #3, yang menyangkut struktur data).
9. Tidak ada perubahan pada cost ledger immutable, evidence versioning, atau invoice snapshot yang sudah `issued` sebelum gate ini berjalan.

---

**Tidak ditemukan konflik material lain** antara `CLAUDE.md`, `PRD.md`, `ADOP_WORKFLOW_ROADMAP_v1.0.md`, dan implementasi Gate 4A–4C/`01dcd5e` selain yang sudah didokumentasikan eksplisit sebagai OPEN di §16 — kontrak ini dapat dibekukan tanpa STOP.
