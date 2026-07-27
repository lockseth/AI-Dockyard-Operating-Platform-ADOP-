# ADOP — Phase 2A Contract: Billing Metadata & Unbilled Control Freeze v1.0

**Produk:** AI Dockyard Operating Platform (ADOP)
**Design partner:** PT Gamatara
**Primary user:** Pak Hanafi — Owner
**Gate/Phase label:** **Phase 2A** — Billing Metadata & Unbilled Control Contract Freeze. Repo belum memiliki nomor gate resmi untuk pekerjaan ini (lihat §1.2 "Catatan Penamaan Gate"); "Phase 2A" dipakai mengikuti istilah `ADOP_WORKFLOW_ROADMAP_v1.0.md` §5 Phase 2 ("Phase 2A: bangun billing register... dengan invoice eksternal/manual") dan §7 butir 9.
**Sifat dokumen:** Documentation-only. **Tidak ada implementasi** (migration, RPC, RLS, UI, atau test) pada gate ini. Kontrak ini membekukan kontrak bisnis dan batas domain untuk gate implementasi berikutnya.
**Status dokumen:** Baseline v1.0, **Amendment 1** (lihat §0 Amendment Log). Nama file dan nomor versi file tetap `v1.0` — Amendment 1 mengganti isi, bukan membuat dokumen baru.

---

## 0. Amendment Log

**Amendment 1** — memperjelas dan membekukan aturan rekonsiliasi invoice manual (registrasi nomor, cakupan transaksi, verifikasi PDF, invoice lama, void/nomor) agar tidak menyisakan keputusan produk kepada programmer gate implementasi. Dipicu oleh instruksi eksplisit Founder/Product Owner (setara LOCK baru per `CLAUDE.md` §3 — prioritas tertinggi source of truth), bukan temuan baru dari audit repo. Ringkasan perubahan:

- **Ditutup dari OPEN menjadi FROZEN:**
  - Kardinalitas invoice: **satu invoice = satu tenant + satu legal entity + satu customer/client + satu Project Kapal** (menutup Open Decision v1.0 §16 #1). Lihat §5.
  - Nomor invoice yang pernah dipakai **tidak boleh dipakai ulang**, termasuk setelah `void` (menutup Open Decision v1.0 §16 #3). Lihat §6.2.
  - Perilaku Unbilled Vessel Alert saat seluruh invoice sebuah project berstatus `void` tanpa reissue — sebelumnya dicatat sebagai catatan OPEN di badan §9.1 v1.0 (bukan bagian penomoran Open Decision resmi) — sekarang **FROZEN**: project tetap/kembali dianggap unbilled sampai ada invoice pengganti non-void. Lihat §13.1 dan §13.2.
- **Ditambahkan sebagai FROZEN baru (topik yang belum dibekukan sama sekali di v1.0):** registrasi nomor invoice manual sebagai langkah eksplisit sebelum upload PDF (§7); pemilihan cakupan transaksi eksplisit dan immutable coverage snapshot saat issued dengan field minimum yang dirinci (§8); larangan double billing dan penegasan bahwa partial billing DEFERRED (§9); checklist rekonsiliasi PDF-ke-Billing-Record sebelum `READY_TO_SEND` (§14); registrasi invoice lama/legacy manual (§15); penegasan lifecycle void + penomoran pengganti (§16).
- **Tetap OPEN (tidak ditutup — tidak ada bukti/instruksi baru untuk menutupnya):** format/prefix nomor invoice (§6.1 catatan, §23 #1); perilaku memilih `legal_entity_id` berstatus `inactive` (§23 #2); definisi persis "responsible PIC" pada Unbilled Vessel Alert (§23 #3); kebutuhan grace period alert (§23 #4).
- **Ditambahkan sebagai DEFERRED baru:** consolidated invoice untuk beberapa Project Kapal sekaligus (§24); partial billing per sebagian nilai transaksi (§24); automatic/sequential invoice numbering (§24); OCR/AI extraction sebagai *bantuan* pemeriksaan PDF, bukan verifier otomatis (§24).
- **Tidak berubah:** workflow LOCK invoice manual (project closed → ... → send) tetap workflow yang sama, hanya diperjelas dengan langkah-langkah yang sebelumnya implisit (§4). Tidak ada implementasi (migration/RPC/UI/test) yang dijalankan pada amendment ini — dokumen ini tetap documentation-only.

Seluruh isi v1.0 yang tidak disebut di atas **tetap berlaku tanpa perubahan substansi** — Amendment 1 memperjelas dan menutup celah, bukan menggantikan kontrak yang sudah dibekukan sebelumnya.

---

## 1. Purpose dan Non-Goals

### 1.1 Purpose

Membekukan kontrak domain untuk melengkapi **Billing Completeness** (`ADOP_WORKFLOW_ROADMAP_v1.0.md` Checkpoint 2) di atas fondasi yang sudah ada:

- Gate 4A (`ADOP_GATE_4A_CONTRACT_v1.0.md`) — invoice binding, lifecycle `draft → issued → void`, evidence/signed document versioning.
- Gate 4B (`supabase/migrations/20260723000000_invoice_evidence_documents.sql`) — implementasi schema/storage dari Gate 4A.
- Gate 4C (`supabase/migrations/20260724000000_invoice_evidence_read_model.sql`) — read model (`invoice_billing_summary`, `invoice_eligible_transactions`, `transaction_invoice_bindings`) dan `record_invoice_evidence_access`.
- Commit `01dcd5e` — cost recap XLSX export (langkah "export cost recap XLSX" dari `PRD.md` §7.12).

Phase 2A membekukan hal-hal yang **belum** dibekukan di Gate 4A–4C, dan (Amendment 1) menutup ambiguitas yang tersisa agar gate implementasi tidak perlu menebak keputusan produk:

1. **Billing metadata** pada invoice/Billing Record — identitas (nomor, legal entity, customer, project) dan tanggal (invoice date, due date) — yang secara eksplisit ditunda oleh Gate 4B (lihat §2 komentar migration: *"Phase 2 billing fields (client_id, due_date, currency, delivery channel) are additive follow-ups on top of this table, not part of this gate"*).
2. **Kardinalitas invoice** — satu invoice hanya boleh mewakili satu tenant, satu legal entity, satu customer, dan satu Project Kapal (§5, Amendment 1).
3. **Registrasi nomor invoice manual, cakupan transaksi, dan verifikasi PDF terhadap Billing Record** sebagai bagian eksplisit dari workflow yang sama (§7, §8, §14, Amendment 1).
4. **Billing completeness status** per invoice — status eksplisit dan deterministic yang menggabungkan lifecycle invoice (Gate 4A §4) dengan kelengkapan metadata, cakupan, dan status evidence.
5. **Unbilled Vessel Alert** — kontrol wajib dari `PRD.md` §7.12 dan `ADOP_WORKFLOW_ROADMAP_v1.0.md` §3 langkah 9, yang sampai commit `01dcd5e` **belum memiliki implementasi maupun kontrak sama sekali** (lihat §2.4 bukti baseline).
6. **Registrasi invoice lama/legacy** dan **penomoran void/pengganti** sebagai aturan permanen, bukan detail implementasi yang diserahkan ke programmer (§15, §16, Amendment 1).

### 1.2 Catatan Penamaan Gate

Tidak ditemukan dokumen kontrak terpisah bernama "Gate 4D" di repo. Yang ada:

- `ADOP_GATE_4A_CONTRACT_v1.0.md` dan `ADOP_GATE_4A_TEST_MATRIX_v1.0.md` — satu-satunya dokumen kontrak Gate 4x yang frozen sebagai file terpisah.
- "Gate 4B" dan "Gate 4C" hanya disebut sebagai label di header/komentar migration (`20260723000000_invoice_evidence_documents.sql`, `20260724000000_invoice_evidence_read_model.sql`) dan kode aplikasi (`src/lib/invoice-evidence/*`) — **tidak pernah dibekukan sebagai dokumen kontrak terpisah**; keduanya diimplementasikan langsung di atas kontrak Gate 4A tanpa gate dokumentasi tersendiri.
- Tidak ada "Gate 4D" dalam bentuk apa pun (dokumen, komentar migration, atau nama commit) pada baseline repo saat ini.

Karena numbering "Gate 4x" belum konsisten dibekukan untuk pekerjaan metadata/unbilled ini, kontrak ini memakai nama **Phase 2A** sesuai istilah roadmap yang sudah LOCK, bukan mengarang "Gate 4D"/"Gate 4E". Amendment 1 **tidak** mengubah keputusan ini dan **tidak** membuat nomor gate baru. Nama gate implementasi berikutnya adalah keputusan tim saat gate tersebut dimulai — lihat §27.

### 1.3 Non-Goals (lihat juga §24 Explicit Deferred Scope)

Phase 2A (termasuk Amendment 1) **tidak**:

- membuat full invoice generator, renderer, atau preview PDF;
- mengubah cost ledger immutable (`project_cost_ledger_entries`);
- mengubah issued invoice snapshot atau evidence versioning yang sudah dikunci Gate 4A/4B;
- memutuskan template invoice atau legal entity final (masih "MENUNGGU INPUT PAK HANAFI" per `ADOP_WORKFLOW_ROADMAP_v1.0.md` §2 dan §5 Phase 2);
- memilih provider pengiriman (WhatsApp/email tetap OPEN/UNCONFIGURED per `CLAUDE.md` §4 dan `PRD.md` §7.12);
- mengimplementasikan delivery/acknowledgement (`queued → sent → delivered → read/open → failed/bounced`) — itu kontrak terpisah berikutnya;
- mengimplementasikan OCR/AI extraction sebagai verifier otomatis (§14.4, §24);
- mengimplementasikan consolidated invoice lintas-project atau partial billing (§24);
- membuat migration/RPC/UI/test apa pun — Amendment 1 tetap documentation-only.

---

## 2. Bukti Baseline / As-Is

Verifikasi dijalankan terhadap HEAD `01dcd5eac159583fcde9ddea899deaba72f68cf0` (branch `master`, sama dengan `origin/master`) untuk baseline v1.0, dan terhadap HEAD `d283e19647664a34bc4fcc223a89ab38b0091d06` (satu commit dokumentasi di atasnya, belum di-push) untuk Amendment 1 — tidak ada perubahan schema/kode di antara keduanya.

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

**Tidak ada** kolom `client_id`, `legal_entity_id`, `project_id`, `invoice_number`, `invoice_date`, `due_date`, `currency`, atau `delivery_channel` pada `invoices`. Komentar migration baris 8–11 menyatakan eksplisit bahwa field-field ini "additive follow-ups... not part of this gate" — Phase 2A adalah gate follow-up tersebut.

Nilai invoice hanya dapat diketahui lewat agregasi `invoice_transaction_lines` (lihat `public.invoice_billing_summary`, Gate 4C). Relasi invoice → project → client hanya **tidak langsung**, lewat `invoice_transaction_lines.project_id → vessel_projects.client_id` per baris — bukan lewat kolom langsung di `invoices`. `enforce_invoice_lifecycle_transition()` hanya terpasang sebagai trigger `before update of status` — **bukan** `before insert` — sehingga sebuah baris `invoices` secara struktural **sudah bisa** di-insert langsung dengan `status = 'issued'` tanpa melalui `draft` terlebih dulu (tidak ada trigger yang memblokir ini pada `insert`). Fakta ini relevan untuk desain registrasi invoice lama (§15).

### 2.2 Tidak ada pembatasan satu-project/satu-client per invoice (as-is, lihat §2.6)

`bind_invoice_transaction` (`20260723000000_invoice_evidence_documents.sql` baris 505–555) hanya memvalidasi: invoice ada, actor berwenang, invoice `draft`, transaksi ada, dan tenant transaksi sama dengan tenant invoice. **Tidak ada validasi** bahwa transaksi yang di-bind berasal dari project atau client yang sama dengan baris lain yang sudah terikat pada invoice tersebut. `BindingSection.tsx` dan `invoice_eligible_transactions` (Gate 4C) menampilkan transaksi closed dari **seluruh project/tenant** sebagai kandidat, bukan dibatasi ke satu project. `cost-recap.ts` (`src/lib/invoice-evidence/cost-recap.ts`) sudah mengasumsikan kemungkinan multi-project/multi-client dalam satu invoice (setiap baris recap punya `projectCode` dan `clientName` sendiri).

### 2.3 Legal entity dan client saat ini

- `public.legal_entities` (`20260719070115_foundation_tenant_isolation.sql`): `id`, `tenant_id`, `legal_name` (nullable), `display_name`, `status` (`active`/`inactive`), `logo_path` (ditambahkan `20260721010000_legal_entity_branding.sql`). **Tidak ada relasi ke `clients` atau `invoices`.** `legal_entities` merepresentasikan identitas penerbit tagihan milik tenant sendiri (bukan customer) — `supabase/seed.sql` membuat satu baris per tenant saat provisioning.
- `public.clients` (`20260719080000_master_data.sql`, diperluas `20260721030000_client_billing_profile_and_pic_roles.sql`): `legal_name`, `address`, `tax_identifier`, `default_payment_term_days`, `invoice_delivery_preference` — representasi customer/PT pemilik kapal yang ditagih.
- `computeClientBillingReadiness` (`src/lib/master-data/clients/billing-readiness.ts`) sudah membekukan pola status `READY | INCOMPLETE | BLOCKED` di level **client** (kelengkapan legal name, address, PIC billing aktif dengan kanal invoice valid). Phase 2A **mereferensikan pola nama status ini** sebagai preseden konsisten untuk status baru di level invoice/project — lihat §11 dan §12.
- Roadmap masih mencatat "Apakah satu tenant memiliki satu atau beberapa legal entity penerbit invoice" sebagai **MENUNGGU INPUT PAK HANAFI** (`ADOP_WORKFLOW_ROADMAP_v1.0.md` §5 Phase 2) — skema `legal_entities` sudah mendukung banyak baris per tenant, tetapi tidak ada default/pemilihan otomatis.
- `public.vessel_projects` (`20260719100000_vessel_project_lifecycle.sql`) sudah memiliki `client_id not null` — satu Project Kapal **selalu** terikat ke tepat satu client secara struktural sejak Gate 1B. Fakta ini adalah dasar utama yang membuat kardinalitas §5 dapat diimplementasikan tanpa ambiguitas: client sebuah invoice dapat **selalu diturunkan** dari project-nya begitu satu project dipilih.

### 2.4 Unbilled Vessel Alert — belum ada implementasi maupun kontrak

Pencarian `unbilled` (case-insensitive) di seluruh repo hanya menemukan kemunculan di `CLAUDE.md`, `PRD.md`, `ADOP_WORKFLOW_ROADMAP_v1.0.md`, dan `README.md` — **seluruhnya dokumen naratif, bukan kode, migration, view, atau test**. Tidak ada tabel, view, function, endpoint, atau komponen UI yang menghitung atau menampilkan Unbilled Vessel Alert pada baseline ini. §13 membekukan kontrak untuk gate implementasi berikutnya.

### 2.5 Precedent pola yang digunakan Phase 2A

- Lifecycle state machine additive-only, tanpa skip/reverse/reopen: `private.enforce_invoice_lifecycle_transition()` (Gate 4B), `private.enforce_vessel_project_lifecycle_transition` (Gate 1B).
- Read model `security_invoker = true` view + `SECURITY DEFINER` wrapper function yang re-cek role: `public.invoice_billing_summary` + `list_invoices`/`get_invoice_summary` (Gate 4C), `public.trusted_transaction_history` (`20260720140000_trusted_transaction_history.sql`).
- Audit lewat `public.access_audit_events` existing (tenant_id, actor_user_id, entity_type, entity_id, action, before_data, after_data, created_at) — tidak ada tabel audit baru dibuat pada gate manapun sejauh ini.
- Atomic guard row-lock (`for update`) pada RPC mutasi status: `issue_invoice`, `void_invoice` (Gate 4B), `20260721020000_opening_cash_pool_atomic_guard.sql`.
- Composite tenant-safe FK `(id, tenant_id)` di setiap tabel yang direferensikan lintas tabel.
- Status enum tiga-nilai dengan short-circuit `BLOCKED` di layer domain logic murni (bukan query): `computeClientBillingReadiness`.
- `rejected_reason` sebagai text wajib-non-kosong saat evidence version `rejected` (Gate 4B, `invoice_evidence_versions_rejected_shape`) — mekanisme existing yang dipakai ulang untuk mencatat alasan mismatch PDF (§14).

### 2.6 Klasifikasi Gap §2.2 — FROZEN (Amendment 1)

**FROZEN:** Perilaku existing yang dijelaskan di §2.2 (satu invoice dapat mengikat transaksi dari banyak project/client tanpa validasi) adalah **gap implementasi/as-is peninggalan desain minimal Gate 4B**, **bukan** aturan domain yang dipertahankan atau dibekukan secara sengaja. Gate 4A/4B tidak pernah secara eksplisit mengizinkan atau melarang perilaku ini — kolom pembatas (`project_id` pada invoice) memang belum ada saat itu. Amendment 1 (§5) membekukan aturan domain yang benar (satu invoice = satu project), dan gate implementasi berikutnya **wajib** menutup gap ini dengan validasi baru pada `bind_invoice_transaction`, **bukan** mempertahankannya sebagai fitur.

---

## 3. Terminologi Domain

| Istilah | Definisi | Sumber |
|---|---|---|
| **Legal Entity** | Identitas badan usaha **milik tenant** yang menerbitkan invoice (nama, alamat, NPWP, logo). Bukan customer. | `public.legal_entities` |
| **Client** | Customer/PT pemilik kapal yang ditagih. | `public.clients` |
| **Project Kapal** (`vessel_projects`) | Unit kerja/engagement per kapal dengan lifecycle `active → ready_to_close → closed`, terikat ke satu `client_id`. | `PRD.md` §7.12, `20260719100000_vessel_project_lifecycle.sql` |
| **Billing Record** | Nama bisnis untuk record ADOP yang merepresentasikan satu tagihan — identik dengan satu baris `public.invoices` (Gate 4B) beserta seluruh `invoice_transaction_lines` (cakupan) dan `invoice_evidence`/`invoice_evidence_versions` (PDF final) yang melekat padanya. Amendment 1 memperkenalkan istilah ini agar dapat dibedakan tegas dari **Invoice Document** (dokumen Word/PDF fisik). "Invoice" dan "Billing Record" dipakai bergantian dalam dokumen ini untuk merujuk pada object yang sama (`public.invoices`); tidak ada tabel baru bernama `billing_records` (§6.3). | Phase 2A Amendment 1 (baru), `public.invoices` |
| **Invoice Document** | Dokumen Word/PDF fisik yang dibuat admin **di luar ADOP**, ditandatangani/cap basah oleh owner, lalu di-upload sebagai evidence. ADOP tidak pernah merender/generate dokumen ini (§1.3). | `PRD.md` §7.12, Gate 4A §1 |
| **Signed PDF Final** | Hasil scan/foto Invoice Document yang sudah ditandatangani, diunggah sebagai `invoice_evidence_versions` (Gate 4B §5) dan menjadi evidence resmi Billing Record. | Gate 4A §5, §14 |
| **Invoice** | Sinonim Billing Record pada level database; lifecycle `draft → issued → void` (Gate 4A §4). | `public.invoices` |
| **Billing Metadata** | Field identitas dan tanggal pada Billing Record: `legal_entity_id`, `client_id`, `project_id`, `invoice_number`, `invoice_date`, `due_date`. Diperluas Amendment 1 dengan `project_id` (§5, §6.1). | Phase 2A (baru/diperluas) |
| **Transaction Coverage** | Himpunan `invoice_transaction_lines` eksplisit yang dicakup satu Billing Record — lihat §8. | Phase 2A Amendment 1 (baru) |
| **Billing Completeness** | Status deterministic per invoice yang menggabungkan lifecycle + kardinalitas + kelengkapan metadata + cakupan + status evidence. | Phase 2A §11 |
| **Unbilled Vessel Alert** | Sinyal bahwa satu Project Kapal `closed` belum memiliki invoice non-void yang mengikat seluruh biayanya secara memadai. | `PRD.md` §7.12, Phase 2A §13 |
| **Ready to Send** | Kondisi provider-agnostic bahwa sebuah invoice `issued` sudah lengkap metadata + coverage snapshot + nomor terdaftar + PDF verified terhadap Billing Record, dan **secara teknis** siap masuk jalur pengiriman (bukan berarti sudah terkirim). | Phase 2A §11, §14 |
| **Legacy/Manual Import Invoice** | Invoice yang pernah diterbitkan **sebelum** Billing Record-nya diregistrasi di ADOP (invoice lama), didaftarkan retroaktif — lihat §15. | Phase 2A Amendment 1 (baru) |

---

## 4. Workflow LOCK Invoice Manual

### 4.1 Workflow ringkas (PRD, tidak berubah)

```
project closed → export cost recap XLSX → admin prepares Word invoice →
owner wet signature/stamp → upload signed PDF → set due date → send invoice
```

(`PRD.md` §7.12, `ADOP_GATE_4A_CONTRACT_v1.0.md` §1). **FROZEN — tidak diubah oleh Amendment 1 apa pun.**

### 4.2 Workflow diperjelas (Amendment 1) — elaborasi, bukan perubahan

**FROZEN:** Amendment 1 memperjelas langkah-langkah yang **sudah implisit** di dalam workflow ringkas §4.1, tanpa menambah langkah bisnis baru dan tanpa mengubah urutan makro:

```
project closed
→ pilih transaksi yang ditagihkan            \  bagian dari "export cost recap XLSX":
→ export cost recap XLSX                     /  memilih transaksi = prasyarat rekap (§8)
→ buat/update Billing Record                    bagian dari "admin prepares Word invoice":
→ daftarkan nomor invoice manual di ADOP        Billing Record ADOP = representasi invoice
→ admin membuat invoice di Word menggunakan     yang sedang disiapkan admin (§7)
   nomor terdaftar
→ owner wet signature/stamp                     tidak berubah (§4.1)
→ upload signed PDF ke Billing Record yang sama bagian dari "upload signed PDF" (§14)
→ verifikasi PDF terhadap Billing Record        bagian dari verifikasi manual dokumen
                                                 Gate 4A §6 langkah 5 (§14)
→ set/finalize due date                         dipetakan langsung ke "set due date" (§10.2)
→ ready to send                                 status baru, provider-agnostic (§11)
→ send                                          di luar scope Phase 2A (§1.3, §24)
```

Pemetaan eksplisit: "pilih transaksi yang ditagihkan" dan "buat/update Billing Record" **bersama-sama** adalah cara ADOP menjalankan "export cost recap XLSX" dan "admin prepares Word invoice" — admin tidak bisa mengekspor rekap yang bermakna tanpa lebih dulu memilih transaksi mana yang masuk Billing Record yang sedang disiapkan (§8). "Daftarkan nomor invoice manual" adalah prasyarat baru yang eksplisit sebelum "upload signed PDF" (§7) — bukan langkah tambahan di luar workflow, melainkan penjelasan urutan yang sebelumnya tersirat dalam "admin prepares Word invoice" (nomor harus ada di dokumen Word yang dibuat). "Verifikasi PDF terhadap Billing Record" adalah nama eksplisit untuk verifikasi manual dokumen yang sudah dibekukan Gate 4A §6 langkah 5 — Amendment 1 hanya merinci **apa yang diperiksa** (§14), tidak mengubah bahwa verifikasi tetap manual oleh `owner`/`admin`.

**Tidak ada** langkah baru yang menambah beban admin di luar apa yang sudah tersirat dalam workflow LOCK asli; **tidak ada** perubahan pada fakta bahwa dokumen Word/PDF tetap dibuat manual di luar ADOP (§1.3).

---

## 5. Invoice Cardinality — Satu Invoice, Satu Pihak, Satu Project (FROZEN)

**FROZEN (Amendment 1 — menutup Open Decision v1.0 §16 #1):**

1. Satu Billing Record (`invoices` row) hanya boleh memiliki **tepat satu**:
   - `tenant_id` (sudah dijamin struktural sejak Gate 4B — tidak berubah);
   - `legal_entity_id` — legal entity penerbit;
   - `client_id` — customer/client tertagih;
   - `project_id` — Project Kapal.
2. Satu Billing Record **tidak boleh** mencakup transaksi dari lebih dari satu Project Kapal, dan karenanya tidak boleh mencakup lebih dari satu client (karena `vessel_projects.client_id not null` mengunci satu client per project — §2.3) atau tenant.
3. **Keputusan final Phase 2A/v1: satu invoice = satu Project Kapal.** Ini bukan lagi Open Decision — dibekukan langsung oleh instruksi Amendment 1, mengikuti prioritas source of truth `CLAUDE.md` §3 (instruksi/LOCK terbaru Founder/Product Owner adalah prioritas tertinggi).
4. **DEFERRED:** consolidated invoice yang mencakup beberapa Project Kapal sekaligus (mis. satu invoice bulanan untuk banyak kapal milik client yang sama) **tidak didukung** pada Phase 2A/v1. Jika kebutuhan bisnis ini muncul di masa depan, itu memerlukan kontrak terpisah yang membekukan ulang model coverage/snapshot (§8) — bukan interpretasi longgar terhadap kontrak ini.
5. Item ini **tidak dipertahankan sebagai OPEN** — lihat §2.6 untuk klasifikasi gap implementasi existing yang memungkinkan perilaku permisif hari ini.

### 5.1 Mekanisme penguncian kardinalitas (konseptual, untuk gate implementasi)

**FROZEN (arah desain, detail teknis boleh disesuaikan gate implementasi selama invariant ini tidak dilanggar):**

- `project_id` **wajib dipilih secara eksplisit** oleh admin saat membuat Billing Record baru (mis. parameter wajib pada `create_draft_invoice`, bukan disimpulkan dari transaksi pertama yang di-bind). Ini konsisten dengan urutan workflow §4.2 ("pilih transaksi yang ditagihkan" mendahului pembuatan rekap) — admin sudah tahu project mana yang sedang ditagih sebelum Billing Record dibuat.
- `client_id` **selalu diturunkan otomatis** dari `project_id` yang dipilih (`vessel_projects.client_id`) pada saat pembuatan Billing Record — **tidak pernah** dipilih bebas oleh admin secara independen, karena `vessel_projects.client_id` sudah mengunci relasi ini secara struktural (§2.3). Menyimpannya sebagai kolom terpisah pada `invoices` adalah untuk kemudahan query dan snapshot (§8.3), bukan pilihan independen.
- `legal_entity_id` dipilih bebas oleh admin dari legal entity aktif milik tenant (independen dari project/client — legal entity adalah identitas penerbit milik tenant sendiri, bukan atribut project).
- Setiap pemanggilan bind transaksi (`bind_invoice_transaction`) **wajib menolak** transaksi yang `project_id`-nya tidak sama dengan `project_id` Billing Record — perluasan validasi pada RPC existing (Gate 4B), bukan trigger/tabel baru.
- Karena `client_id` terkunci ke `project_id`, tidak ada validasi client terpisah yang diperlukan pada level bind — validasi project sudah cukup untuk menjamin konsistensi client.

---

## 6. Data Model Konseptual

Nama kolom/tabel di bagian ini bersifat **konseptual/indikatif** untuk gate implementasi, kecuali disebut sebagai constraint eksplisit. Tidak ada implementasi aktual pada gate ini.

### 6.1 Kolom baru pada `invoices` (Billing Record)

| Kolom (indikatif) | Tipe | Kapan diisi | Wajib sebelum `issued` | Catatan |
|---|---|---|---|---|
| `project_id` | uuid, composite FK `(project_id, tenant_id) → vessel_projects(id, tenant_id)` | Wajib diisi **saat Billing Record dibuat** (§5.1) — bukan opsional/nullable dalam praktik, meski secara skema kolom tetap nullable untuk kompatibilitas legacy import tanpa project yang jelas (lihat §15.7 pengecualian legacy) | **ya** (kecuali legacy exception §15) | Satu Billing Record = satu project (§5). |
| `client_id` | uuid, composite FK `(client_id, tenant_id) → clients(id, tenant_id)` | Diturunkan otomatis dari `project_id` saat Billing Record dibuat (§5.1) | **ya** | Selalu sama dengan `project.client_id`; tidak dipilih independen. |
| `legal_entity_id` | uuid, composite FK `(legal_entity_id, tenant_id) → legal_entities(id, tenant_id)` | Dipilih admin, dapat diubah selama `draft` | **ya** | Legal entity yang aktif (`status = 'active'`) pada tenant (lihat §23 #2 untuk kasus `inactive`, tetap OPEN). |
| `invoice_number` | text | Diisi lewat langkah registrasi eksplisit (§7), sebelum PDF final dapat diunggah | **ya** | Unik per legal entity (§6.2); format bebas teks (§23 #1, tetap OPEN). |
| `invoice_date` | date | Dipilih admin, dapat diubah selama `draft` | **ya** | `due_date >= invoice_date` (§10.2). |
| `due_date` | date | Dipilih/difinalisasi admin (§4.2 "set/finalize due date"), dapat diubah selama `draft` | **ya** | Lihat §10.2. |
| `origin` | enum indikatif `'native' \| 'legacy_import'`, default `'native'` | Ditetapkan saat pembuatan, immutable selamanya | tidak relevan (bukan bagian kelengkapan billing) | Membedakan Billing Record yang dibuat lewat workflow normal vs registrasi retroaktif (§15). |
| `legacy_coverage_status` | enum indikatif `'full' \| 'partial' \| 'unknown'`, nullable | Hanya relevan/diisi jika `origin = 'legacy_import'` | tidak relevan untuk native | §15.7 — menandai transparan bahwa cakupan transaksi legacy tidak dapat/tidak sepenuhnya direkonstruksi. |
| `imported_by` / `imported_at` | uuid / timestamptz, nullable | Hanya diisi jika `origin = 'legacy_import'` | tidak relevan | Provenance registrasi legacy (§15.2), terpisah dari `created_by`/`created_at` yang tetap merekam siapa yang menjalankan proses registrasi di ADOP. |

Seluruh kolom **additive** di atas tabel `invoices` Gate 4B — tidak mengubah kolom lifecycle (`status`, `issued_at`, `void_*`, dsb.) yang sudah dibekukan.

### 6.2 Unique constraint invoice number — FROZEN penuh (Amendment 1 menutup sisa Open Decision)

- **FROZEN:** `invoice_number` unik **per legal entity** (bukan per tenant secara global, dan bukan global lintas tenant) — konsisten dengan §2.3: satu tenant berpotensi punya beberapa legal entity penerbit, masing-masing dengan rangkaian nomor sendiri.
- **FROZEN:** dua legal entity **boleh** memakai `invoice_number` yang sama (mis. keduanya mulai dari `001`) tanpa konflik.
- **DERIVED FROM EXISTING CONTRACT:** constraint memakai pola partial unique index tenant-safe yang sama seperti `clients_tenant_id_client_code_uidx` (`20260719080000_master_data.sql`) — unique pada `(tenant_id, legal_entity_id, invoice_number)` **where `invoice_number` is not null**, sehingga Billing Record `draft` tanpa nomor tidak memblokir invoice lain.
- **FROZEN (Amendment 1 — menutup Open Decision v1.0 §16 #3):** `invoice_number` yang pernah dipakai oleh Billing Record manapun — termasuk yang kemudian `void` — **tidak boleh dipakai ulang** oleh Billing Record lain dalam legal entity yang sama, selamanya. Constraint uniqueness (`where invoice_number is not null`) **tidak dikecualikan** untuk status `void` — nomor tetap dianggap "terpakai" walau invoice induknya sudah `void`. Ini konsisten dengan §16.1: replacement invoice wajib memperoleh nomor **baru**, tidak pernah menggunakan kembali nomor invoice yang di-void-kan.
- Format/prefix nomor (mis. `INV/2026/001` vs bebas teks) tetap **OPEN** — lihat §23 #1. Yang FROZEN hanya uniqueness dan lifecycle nomor (tidak pernah dibebaskan), bukan bentuknya.

### 6.3 Tidak ada tabel baru wajib

Seluruh metadata (§6.1), termasuk field legacy (`origin`, `legacy_coverage_status`, `imported_by`, `imported_at`), adalah kolom tambahan pada `invoices` yang sudah ada — **tidak ada tabel baru** yang harus dibuat untuk Billing Record, registrasi nomor, atau registrasi legacy. "Billing Record" (§3) adalah nama bisnis, bukan tabel fisik terpisah. Ini konsisten dengan komentar Gate 4B bahwa field-field ini memang dirancang sebagai "additive follow-ups on top of this table".

---

## 7. Manual Invoice Number Registration (FROZEN — baru, Amendment 1)

**FROZEN:**

1. `invoice_number` **wajib diregistrasi pada Billing Record sebelum** signed PDF final (§14) dapat diunggah sebagai evidence version. Upload evidence version untuk Billing Record yang `invoice_number`-nya masih kosong **ditolak**.
2. Nomor yang diregistrasi adalah nomor **yang sama** yang wajib dipakai admin saat menyusun dokumen Word/PDF manual di luar ADOP — ADOP tidak pernah membuat/menyarankan nomor secara otomatis pada Phase 2A (§24 — automatic numbering DEFERRED).
3. `invoice_number` **tidak boleh** diisi otomatis dari nama file upload atau hasil OCR — harus berupa input teks eksplisit dari admin sebelum atau terpisah dari proses upload evidence, sesuai §7.1 (upload memerlukan nomor sudah ada, bukan sebaliknya).
4. Uniqueness minimal: `tenant_id + legal_entity_id + normalized(invoice_number)` (§6.2). "Normalized" berarti perbandingan uniqueness dilakukan atas representasi ternormalisasi (mis. trim whitespace) — normalisasi persis (case-sensitive/insensitive, dsb.) adalah **detail implementasi** yang boleh direkomendasikan gate berikutnya, bukan dibekukan di sini, selama hasilnya tidak melonggarkan constraint (dua nomor yang secara visual identik setelah trim tidak boleh lolos sebagai berbeda).
5. Setelah Billing Record `issued` **atau** setelah signed PDF final versi `current` berstatus `verified` (mana pun lebih dulu tercapai — keduanya berarti nomor sudah "dipublikasikan" ke dunia fisik), `invoice_number` **tidak boleh diedit in-place**. Ini memperluas §10.1 (metadata terkunci setelah `issued`) dengan penegasan tambahan: bahkan jika suatu implementasi longgar mengizinkan edit metadata lain sebelum `issued`, nomor yang **sudah tercetak di PDF yang sedang diverifikasi** tidak boleh diam-diam berubah tanpa evidence versioning menyadarinya — dalam praktik ini otomatis terpenuhi karena §10.1 mengunci seluruh metadata di titik yang sama (`issued`).
6. Kesalahan nomor yang baru terdeteksi setelah `issued` **wajib** diselesaikan lewat void + invoice baru (§16), bukan update langsung.

---

## 8. Transaction Coverage Selection & Immutable Snapshot (FROZEN — baru, Amendment 1)

### 8.1 Penguncian project/client saat pembuatan Billing Record

Lihat §5.1 — `project_id` wajib eksplisit saat pembuatan; `client_id` diturunkan otomatis.

### 8.2 Pemilihan transaksi eksplisit

**FROZEN:**

1. Billing Record **wajib** memiliki daftar transaksi eksplisit yang dicakupnya (`invoice_transaction_lines`, sudah ada sejak Gate 4B) — cakupan **tidak boleh** disimpulkan secara implisit dari total nominal, rentang tanggal, atau "seluruh transaksi project" tanpa baris eksplisit per transaksi.
2. Setiap transaksi yang dicakup **wajib**:
   - berasal dari `tenant_id` yang sama dengan Billing Record (sudah ditegakkan Gate 4B — F2);
   - berasal dari `project_id` yang **sama persis** dengan `project_id` Billing Record (**baru** — §5.1, memperluas validasi `bind_invoice_transaction` existing yang belum mengecek ini);
   - eligible untuk billing (`entry_kind = 'expense'`, project `closed`, tidak di-reverse — kriteria persis `invoice_eligible_transactions` Gate 4C, tidak berubah);
   - belum dicakup invoice **aktif** (`draft`/`issued`) lain (sudah ditegakkan Gate 4A F3/Gate 4B partial unique index — tidak berubah).
3. Selama Billing Record masih `draft`, pilihan transaksi **boleh diperbaiki** (ditambah/dilepas) oleh role berwenang (`owner`/`admin`, §17) — mekanisme `bind_invoice_transaction`/`unbind_invoice_transaction` existing (Gate 4B), tidak berubah selain validasi project baru (§8.2 butir 2).
4. Setiap penambahan/pelepasan cakupan saat `draft` **wajib** menghasilkan audit event before/after — sudah dipenuhi `invoice.transaction_bound`/`invoice.transaction_unbound` (Gate 4B, §19).

### 8.3 Immutable transaction coverage snapshot saat issuance

**FROZEN:** Pada saat Billing Record bertransisi ke `issued`, sistem membekukan **immutable transaction coverage snapshot** yang, secara agregat lintas seluruh `invoice_transaction_lines` milik Billing Record tersebut ditambah metadata header Billing Record itu sendiri, mencakup minimal:

| Field snapshot | Sumber | Status existing |
|---|---|---|
| Transaction ID/reference | `invoice_transaction_lines.transaction_entry_id` | Sudah ada (Gate 4B) |
| Project ID | `invoice_transaction_lines.project_id` (per baris) **dan** `invoices.project_id` (header, harus identik — §8.2 butir 2) | `invoice_transaction_lines.project_id` sudah ada; `invoices.project_id` baru (§6.1) |
| Customer/client identity | `invoices.client_id` (header — berlaku untuk seluruh baris karena satu invoice satu client, §5) | Baru (§6.1) — tidak perlu disimpan per baris karena kardinalitas §5 menjaminnya seragam |
| Legal entity identity | `invoices.legal_entity_id` (header) | Baru (§6.1) |
| Transaction date | **Belum ada** pada `invoice_transaction_lines` — perlu kolom tambahan `transaction_date` (snapshot dari `project_cost_ledger_entries.created_at`/tanggal transaksi asli pada saat bind) | Gap baru — additive pada `invoice_transaction_lines` |
| Transaction type/category | **Belum ada** pada `invoice_transaction_lines` — perlu kolom tambahan (snapshot dari `entry_kind` dan/atau `expense_categories` terkait pada saat bind) | Gap baru — additive pada `invoice_transaction_lines` |
| Description/reference | `invoice_transaction_lines.description` | Sudah ada (Gate 4B) |
| Amount yang ditagihkan | `invoice_transaction_lines.amount` (**nilai penuh transaksi**, bukan sebagian — §9.2) | Sudah ada (Gate 4B) |
| Total coverage | Agregat `sum(invoice_transaction_lines.amount)` per Billing Record — sudah dihitung `invoice_billing_summary.total_amount` (Gate 4C) | Sudah ada (Gate 4C) |
| Snapshot timestamp | `invoice_transaction_lines.created_at` (waktu baris dibuat = waktu snapshot diambil, karena baris tidak pernah di-update — §8.4) | Sudah ada (Gate 4B) |
| Snapshot version | **Tidak diperlukan kolom versi terpisah.** Setiap `invoice_transaction_lines` dibuat sekali (`insert`) dan tidak pernah di-`update` (Gate 4B §5d, hanya insert/delete saat `draft`) — sehingga `created_at` sudah menjadi identitas snapshot yang unik dan immutable secara struktural; tidak ada konsep "versi 2 dari baris yang sama" yang perlu direpresentasikan. **FROZEN interpretasi ini** agar gate implementasi tidak menambah kolom versi yang tidak perlu. | Interpretasi baru — tidak ada gap |

**FROZEN:** Kedua kolom baru pada `invoice_transaction_lines` (`transaction_date`, kategori/tipe) bersifat additive dan snapshot — diisi sekali saat bind, tidak pernah diperbarui, mengikuti pola immutability yang sama seperti `amount`/`description` existing.

### 8.4 Perubahan transaksi sumber pasca-issuance

**FROZEN (menegaskan ulang Gate 4A §3, tidak berubah):** Perubahan pada `project_cost_ledger_entries` sumber (mis. adjustment/reversal) setelah Billing Record `issued` **tidak pernah** mengubah snapshot `invoice_transaction_lines` yang sudah terbentuk — nilai invoice tetap snapshot historis, bukan dihitung ulang live. Koreksi dilakukan lewat void + Billing Record pengganti (§16), tidak dengan mengedit baris snapshot.

---

## 9. Double-Billing Prevention & Partial Billing (FROZEN — baru, Amendment 1)

**FROZEN:**

1. Satu transaksi (`project_cost_ledger_entries.id`) — atau bagian nilai dari transaksi yang sama — **tidak boleh** ditagihkan pada dua Billing Record **aktif** (`draft`/`issued`) sekaligus. Mekanisme penegakan **sudah ada** dan tidak berubah: partial unique index pada binding aktif (Gate 4A F3, Gate 4B).
2. **Partial billing (menagihkan sebagian nilai satu transaksi) DEFERRED** — Phase 2A/v1 **tidak mendukungnya**. Satu transaksi yang dipilih untuk suatu Billing Record **wajib ditagihkan penuh** (nilai `amount` snapshot sama dengan nilai penuh transaksi sumber) — ini **sudah** menjadi perilaku `bind_invoice_transaction` existing (`amount = v_entry.amount`, tanpa parameter nominal parsial) dan **dikonfirmasi FROZEN**, bukan sekadar kebetulan implementasi. Jika kebutuhan partial billing muncul di masa depan, itu memerlukan kontrak model data terpisah (mis. `amount_billed` vs `amount_remaining` per transaksi) — tidak diimplementasikan atau diasumsikan di sini.
3. Perlakuan cakupan pada Billing Record yang dibatalkan/void — deterministic:
   - **Draft yang dibatalkan sebelum pernah `issued`** (`draft → void` langsung, Gate 4A §4): seluruh `invoice_transaction_lines`-nya **boleh dilepas** — dalam praktik existing baris-baris ini tetap ada sebagai riwayat (tidak dihapus saat invoice menjadi `void`, hanya dihapus manual lewat `unbind_invoice_transaction` **selagi masih `draft`**), tetapi begitu status `void`, transaksi-transaksi tersebut otomatis kembali eligible untuk Billing Record lain karena invoice pengikatnya tidak lagi aktif (`invoice_eligible_transactions` Gate 4C sudah menangani ini tanpa perubahan).
   - **Invoice `issued` yang kemudian di-`void`** (koreksi): snapshot cakupan historis **tetap dipertahankan** apa adanya (tidak dihapus/diedit) — transaksi yang tercakup di dalamnya **hanya dapat ditagihkan ulang** melalui Billing Record pengganti yang memiliki referensi eksplisit ke Billing Record yang di-void (`predecessor_invoice_id`, Gate 4A §3, tidak berubah). Transaksi tersebut tidak "bebas" dipilih oleh Billing Record lain yang tidak berelasi predecessor — meski secara teknis constraint uniqueness aktif (§9.1) tidak membedakan reissue vs invoice baru yang tidak berelasi, **rekomendasi operasional** (bukan constraint database) adalah reissue melalui alur predecessor untuk menjaga jejak koreksi yang jelas; gate implementasi boleh memilih menegakkan ini sebagai constraint keras jika dianggap perlu — didokumentasikan sebagai rekomendasi, bukan constraint database wajib, karena tidak ada instruksi eksplisit yang memaksa larangan teknis di titik ini.
4. Detail constraint/RPC (mis. bentuk pasti index, trigger tambahan) adalah rekomendasi untuk gate implementasi (§27) — **tidak diimplementasikan pada gate ini**.
5. Test matrix (`ADOP_PHASE_2A_BILLING_METADATA_UNBILLED_CONTROL_TEST_MATRIX_v1.0.md`) mencakup retry dan race condition dua Billing Record yang mencoba mengikat transaksi yang sama — lihat §CV di sana.

---

## 10. State/Transition Rules

### 10.1 Kapan metadata boleh diisi/diubah

- **FROZEN:** mengikuti pola binding Gate 4A §3 — seluruh field metadata (§6.1: `project_id`, `client_id`, `legal_entity_id`, `invoice_number`, `invoice_date`, `due_date`) **hanya dapat diisi atau diubah selama Billing Record berstatus `draft`**, dengan pengecualian `project_id`/`client_id` yang justru dikunci **lebih awal** (saat pembuatan, §5.1) karena keduanya menentukan validitas seluruh transaksi yang dapat di-bind. Begitu `issued`, seluruh metadata terkunci (immutable), identik dengan perlakuan `invoice_transaction_lines` dan nominal snapshot.
- **FROZEN:** koreksi metadata setelah `issued` **wajib** memakai mekanisme void + reissue yang sudah dibekukan Gate 4A §3 (Billing Record baru dengan `predecessor_invoice_id`), **bukan** update langsung pada kolom metadata invoice yang sudah `issued`.
- **DERIVED FROM EXISTING CONTRACT:** mekanisme penguncian mengikuti pola trigger append-only/immutability yang sama seperti `private.enforce_invoice_lifecycle_transition()` dan larangan update binding pada invoice `issued` (Gate 4A F4) — perluasan trigger constraint yang sama, bukan trigger baru yang terpisah secara desain.

### 10.2 Validasi relasi `invoice_date` dan `due_date`

- **FROZEN:** `due_date >= invoice_date` (boleh sama hari; termin pembayaran nol hari adalah kasus valid, mis. cash on delivery).
- **FROZEN:** kedua tanggal wajib terisi sebelum invoice dapat bertransisi ke `issued` — diperluas dari `invoices_issued_shape` check constraint Gate 4B yang sudah ada (pola yang sama, field bertambah).
- **DERIVED FROM EXISTING CONTRACT:** `default_payment_term_days` pada `clients` (`20260721030000_client_billing_profile_and_pic_roles.sql`) dapat dipakai **UI-side** untuk menyarankan default `due_date = invoice_date + default_payment_term_days` — ini hanya bantuan pengisian, bukan constraint database, dan admin tetap bisa mengubahnya secara manual.
- **OPEN (tidak ditutup Amendment 1 — tidak ada instruksi baru terkait ini):** apakah `invoice_date` boleh berbeda dari tanggal `created_at`/`issued_at`. Rekomendasi default tetap: **diizinkan**, tidak ada constraint yang mengikat keduanya, karena workflow LOCK menandatangani dokumen fisik dulu baru upload — tanggal invoice fisik bisa mendahului tanggal `issued` di sistem.

### 10.3 Siapa boleh mengisi/mengubah

- **FROZEN (mengikuti §17 Gate 4A, diteruskan tanpa perubahan):** hanya `owner` dan `admin` yang dapat membuat/mengubah metadata invoice, cakupan transaksi, registrasi nomor, dan verifikasi PDF — sama seperti hak membuat/menerbitkan/void invoice. `reviewer`/`viewer` tidak mendapat akses tulis maupun baca ke invoice (lihat §17).
- **FROZEN:** tidak ada maker-checker baru diperkenalkan pada Phase 2A — pola v1 Gate 4A §7 ("verifier boleh sama dengan uploader") diteruskan apa adanya, termasuk untuk verifikasi PDF-ke-Billing-Record (§14): admin yang mengunggah PDF boleh juga menjadi admin yang memverifikasinya.

---

## 11. Billing Completeness Definition — Per Invoice

**FROZEN** status enum berikut (diperbarui Amendment 1 untuk mencakup kardinalitas, cakupan, dan verifikasi PDF), dievaluasi **deterministic** dari state invoice + coverage + evidence yang sudah ada (dihitung, bukan disimpan, mengikuti pola `computeClientBillingReadiness`):

| Status | Kondisi | Catatan |
|---|---|---|
| `NO_INVOICE` | Project `closed` belum memiliki Billing Record non-void manapun. | Status level project, bukan invoice — pintu masuk §13. |
| `DRAFT_INCOMPLETE` | Billing Record `draft` dan salah satu dari: cakupan transaksi kosong, atau salah satu metadata wajib (§6.1) kosong. | Diperluas Amendment 1: kardinalitas (`project_id`) yang belum diisi juga membuat Billing Record tidak dapat dibuat sama sekali (§5.1) — dalam praktik `DRAFT_INCOMPLETE` selalu punya `project_id` terisi sejak awal, kekurangan hanya pada field lain atau cakupan kosong. |
| `DRAFT_READY_TO_ISSUE` | Billing Record `draft`, cakupan ≥1 baris (seluruhnya dari `project_id` yang sama, §8.2), dan seluruh metadata wajib terisi valid (termasuk `due_date >= invoice_date` dan `invoice_number` teregistrasi, §7). | Precondition sebelum `issue_invoice`; belum menjamin sukses (race condition tetap mungkin, §20). |
| `ISSUED_EVIDENCE_PENDING` | Billing Record `issued`, belum ada signed PDF current+verified, **atau** current version berstatus `pending`/`rejected` (termasuk rejected karena mismatch, §14.5). | Menggabungkan `is_final_document` (Gate 4C) dengan lifecycle `issued`. |
| `READY_TO_SEND` | Billing Record `issued`, `is_final_document = true` (current version `verified` **dan** lulus checklist rekonsiliasi §14.2), seluruh metadata lengkap, cakupan snapshot terbentuk (§8.3), dan Billing Record tidak `void`. | Definisi presisi §14 — provider-agnostic, tidak berarti benar-benar terkirim. |
| `SENT` | **DEFERRED.** Hanya valid setelah kontrak delivery/acknowledgement dibekukan terpisah. | Placeholder nama status saja. |
| `VOID` | `invoices.status = 'void'`. | Status lifecycle existing, dipetakan langsung — tidak pernah tercapai `READY_TO_SEND`/`DRAFT_READY_TO_ISSUE` apa pun (§16.5). |
| `LEGACY_RECORDED` | **Baru (Amendment 1).** Billing Record dengan `origin = 'legacy_import'` yang berhasil diregistrasi (§15) — dikeluarkan dari pipeline `DRAFT_*`/`READY_TO_SEND` normal karena invoice-nya secara historis **sudah pernah terkirim** di luar ADOP sebelum ADOP ada; "siap kirim" tidak relevan untuk sesuatu yang sudah terjadi. | Justifikasi domain: legacy invoice tidak boleh otomatis `READY_TO_SEND` (§15.5) — status terpisah ini adalah cara eksplisit merepresentasikan itu tanpa memaksa legacy invoice melalui gate kelengkapan yang didesain untuk alur baru. Kompatibel dengan `invoice_status` existing: `LEGACY_RECORDED` hanya proyeksi read-only di atas kombinasi `origin = 'legacy_import'` + `status` (biasanya `issued`, kadang `void` jika legacy invoice ternyata pernah dibatalkan) — tidak menggantikan `invoice_status` apa pun. |

**FROZEN — aturan status baru:** Tidak ada status completeness tambahan di luar tabel ini boleh ditambahkan pada gate implementasi tanpa menjelaskan (a) kebutuhan domain yang tidak tertutup status existing, dan (b) kompatibilitasnya dengan `invoice_status` enum Gate 4A — status completeness **tidak pernah menggantikan** `invoice_status`, hanya proyeksi read-only di atasnya.

---

## 12. Read Model Konseptual

**DERIVED FROM EXISTING CONTRACT** — pola persis Gate 4C (`invoice_billing_summary` + `SECURITY DEFINER` wrapper, `security_invoker = true` view, tidak di-grant langsung ke `authenticated`):

- Perluasan `invoice_billing_summary` (view existing) dengan kolom metadata (§6.1), kolom completeness status (§11), dan kolom hasil checklist verifikasi PDF (§14) — **additive** terhadap view Gate 4C, tidak mengubah kolom yang sudah ada.
- Fungsi wrapper baru mengikuti pola `list_invoices`/`get_invoice_summary` (Gate 4C) — re-verifikasi role `owner`/`admin` via `private.current_user_has_tenant_role` sebelum mengembalikan baris.
- Tidak ada perubahan pada `invoice_eligible_transactions` selain penambahan filter `project_id` (§8.2 butir 2) atau `transaction_invoice_bindings` (Gate 4C) di luar itu.

---

## 13. Unbilled Vessel Alert — Definisi Frozen

### 13.1 Kondisi persis "unbilled"

**FROZEN:** Sebuah Project Kapal (`vessel_projects`) dianggap **unbilled** jika dan hanya jika:

1. `lifecycle_status = 'closed'`, **dan**
2. project tersebut memiliki **minimal satu** baris `project_cost_ledger_entries` berstatus billable yang **belum pernah** terikat ke Billing Record aktif (`draft`/`issued`) manapun — direct reuse `invoice_eligible_transactions` view Gate 4C, difilter per `project_id`, **atau**
3. project memiliki baris cost ledger yang seluruhnya sudah terikat, namun **seluruh** Billing Record pengikatnya berstatus `void` tanpa Billing Record pengganti aktif (predecessor chain berakhir di `void` tanpa `successor_invoice_id`).

**FROZEN (Amendment 1 — menutup catatan OPEN v1.0 §9.1):** Kondisi #3 **dikonfirmasi FROZEN sebagai perilaku yang benar**, bukan lagi catatan terbuka — mengikuti instruksi eksplisit Amendment 1 §H: *"Invoice void: bukan ready; project tetap membutuhkan invoice pengganti jika kewajiban tagih masih ada"* dan *"Alert hilang hanya setelah terdapat invoice non-void ... yang memenuhi definisi kontrak"*. Artinya: sebuah project yang seluruh Billing Record-nya `void` **kembali** dianggap unbilled dan **tetap** dianggap unbilled sampai ada Billing Record pengganti (`predecessor_invoice_id` chain) yang berstatus aktif (`draft`/`issued`).

**FROZEN — project TIDAK unbilled jika:** seluruh baris cost ledger billable project tersebut sudah terikat pada minimal satu Billing Record **aktif** (`draft` atau `issued`) — **termasuk yang masih `draft`**. Begitu admin mulai membuat draft Billing Record untuk sebuah project, project itu tidak lagi tampil di alert, meskipun belum `issued`/`READY_TO_SEND`. **DERIVED FROM EXISTING CONTRACT** — konsisten dengan definisi "invoice aktif" Gate 4A §3 (`draft`/`issued`, `void` tidak aktif).

### 13.2 Kapan alert muncul dan hilang

**FROZEN:**

- **Muncul:** segera setelah project bertransisi ke `closed` **dan** ada baris cost ledger billable yang tidak terikat invoice aktif, atau segera setelah satu-satunya Billing Record aktif project tersebut menjadi `void` tanpa pengganti (§13.1 kondisi #3) — dihitung real-time dari read model, bukan event terjadwal/batch. Tidak ada delay/grace period yang dibekukan pada gate ini (§23 #4, tetap OPEN).
- **Hilang:** segera setelah seluruh baris cost ledger billable project terikat pada Billing Record aktif (`draft` atau `issued`) yang **non-void** — **bukan** menunggu evidence verified atau `READY_TO_SEND`.
- Alert **tidak pernah** disimpan sebagai baris/state persisten — selalu dihitung ulang dari read model saat diminta.

### 13.3 Read model/query yang diperlukan

**DERIVED FROM EXISTING CONTRACT** — konseptual, mengikuti pola `security_invoker` view + `SECURITY DEFINER` wrapper Gate 4C:

- View konseptual `unbilled_vessel_projects`: satu baris per `vessel_projects` yang `lifecycle_status = 'closed'` dan memenuhi §13.1, dengan kolom minimal: `project_id`, `tenant_id`, `vessel_id`, `vessel_name`, `client_id`, `closed_at`, `unbilled_transaction_count`, `unbilled_amount_total`, `elapsed_since_closed`, dan (baru) `last_voided_invoice_id`/`last_void_reason` untuk kasus §13.1 kondisi #3 agar admin tahu **mengapa** project ini unbilled kembali (bukan belum pernah ditagih sama sekali).
- Dibangun di atas `invoice_eligible_transactions` (Gate 4C, sudah ada) yang di-`group by project_id`.
- Fungsi wrapper `list_unbilled_vessel_projects(p_tenant_id uuid)` — pola identik `list_invoice_eligible_transactions` (Gate 4C), re-cek role via `private.current_user_has_tenant_role`.

### 13.4 Akses Owner/Admin

**FROZEN — mengikuti §17:** hanya `owner`/`admin` dapat melihat Unbilled Vessel Alert, konsisten dengan akses invoice/evidence Gate 4A §7.

### 13.5 Empty/loading/error state — kontrak UI

**FROZEN (kontrak, bukan implementasi):**

- **Empty:** state positif eksplisit ("Semua Project Kapal closed sudah tertagih") — bukan halaman kosong tanpa pesan.
- **Loading:** skeleton/placeholder yang tidak menampilkan angka `0` atau daftar kosong sebagai nilai sementara.
- **Error:** wajib eksplisit menyatakan alert **tidak dapat dimuat**, bukan menampilkan "tidak ada unbilled".

### 13.6 Auditability

**FROZEN:** Alert sendiri tidak menghasilkan audit event baru (read-only). Setiap perubahan state yang memengaruhi alert **sudah** menghasilkan audit event lewat mekanisme existing (`vessel_project_lifecycle_events`, `access_audit_events`). Alert harus **dapat direkonstruksi** dari histori event-event ini kapan pun.

### 13.7 Idempotency dan concurrency

**FROZEN:** Alert adalah hasil query, bukan operasi tulis — tidak ada pertanyaan idempotency untuk "membuat" alert. Race yang relevan terjadi di sisi penyebab (binding F3/F12, lifecycle F10 — Gate 4A §9) dan sudah ditangani di sana; alert secara otomatis konsisten dengan hasil race tersebut.

---

## 14. PDF-to-Billing-Record Reconciliation (FROZEN — baru, Amendment 1)

### 14.1 Sifat evidence

**FROZEN:** Signed PDF final adalah **evidence** dari Billing Record, **bukan** sumber kebenaran utama. Metadata Billing Record (§6.1) dan coverage snapshot (§8.3) tetap menjadi canonical source; PDF adalah bukti fisik yang harus **dicocokkan** terhadap canonical source, bukan sebaliknya.

### 14.2 Checklist rekonsiliasi sebelum `READY_TO_SEND`

**FROZEN:** Sebelum status `READY_TO_SEND` tercapai, verifier berwenang (`owner`/`admin`, §10.3) **wajib** memastikan signed PDF final sesuai dengan Billing Record minimal pada:

1. nomor invoice (§7);
2. legal entity penerbit (§6.1);
3. customer/client (§6.1);
4. Project Kapal (§6.1);
5. invoice date (§6.1);
6. due date, **jika tercetak** pada dokumen (tidak semua template mencantumkan due date secara eksplisit — jika tidak tercetak, item ini dilewati, bukan dianggap gagal);
7. total invoice (§8.3 total coverage);
8. identitas dokumen lain yang relevan (mis. tanda tangan/cap terlihat) — pemeriksaan kualitatif, tidak divalidasi otomatis oleh sistem.

**Mekanisme penegakan (FROZEN — memakai lifecycle existing, tidak ada state baru):** checklist ini adalah **panduan prosedural** bagi verifier sebelum mengklik "Verify" pada evidence version (Gate 4A §5, §6 langkah 5) — bukan validasi otomatis oleh sistem (sistem tidak bisa membaca isi PDF tanpa OCR, yang eksplisit di luar scope, §14.4). Jika verifier menemukan kecocokan penuh → `verified`. Jika tidak → `rejected`, dengan `rejected_reason` (kolom wajib-non-kosong existing, Gate 4B) **wajib** menyebutkan field mana yang mismatch (mis. "nomor invoice pada PDF tidak sama dengan nomor terdaftar"). Tidak ada status evidence baru untuk "mismatch" — `rejected` **adalah** representasi mismatch.

### 14.3 Syarat PDF untuk `READY_TO_SEND`

**FROZEN (menegaskan ulang Gate 4A §5, digabung dengan kelengkapan metadata Amendment 1):** PDF final harus:

- menjadi **versi current** (`invoice_evidence.current_version_id`);
- berstatus **verified** (bukan `pending`/`rejected`);
- terikat ke Billing Record yang sama (`invoice_evidence.invoice_id`);
- berasal dari invoice **non-void**.

Keempatnya **sudah** direpresentasikan oleh `is_final_document` (Gate 4C) — Amendment 1 tidak mengubah mekanismenya, hanya menegaskan bahwa keputusan `verified` itu sendiri **harus** didasarkan pada checklist §14.2.

### 14.4 Batas OCR/AI extraction

**FROZEN — eksplisit di luar scope implementasi Phase 2A:**

- OCR/AI extraction boleh disebut sebagai **bantuan pemeriksaan** di masa depan (mis. menyorot kemungkinan mismatch untuk mempercepat verifier manusia) — **bukan** canonical source.
- OCR/AI **tidak boleh** secara otomatis mengubah status evidence menjadi `verified`/`rejected` — keputusan tetap manual oleh `owner`/`admin` (§10.3, tidak ada maker-checker baru).
- OCR/AI **tidak boleh** menimpa metadata Billing Record (`invoice_number`, tanggal, dsb.) — hasil ekstraksi yang salah baca **tidak pernah** mengubah canonical metadata yang sudah diinput admin secara eksplisit.
- OCR/AI **tidak termasuk** scope implementasi Phase 2A — hanya dicatat sebagai kemungkinan enhancement masa depan (§24).

### 14.5 Penanganan mismatch

**FROZEN:**

- Upload PDF yang ternyata mismatch **tetap tercatat** sebagai evidence version sesuai lifecycle existing (Gate 4B) — tidak ditolak/dihapus begitu saja, konsisten dengan prinsip "candidate tetap terlihat" (`CLAUDE.md` §4).
- Status **tidak boleh** menjadi `READY_TO_SEND` selama mismatch belum diselesaikan (evidence version terkait berstatus `rejected`, §14.2).
- Mismatch **harus terlihat dan dapat diaudit** — `rejected_reason` + audit event `evidence.rejected` (Gate 4A §8, sudah ada) memenuhi ini tanpa mekanisme baru.
- Koreksi mismatch: **jika PDF yang salah** → admin upload versi baru (`version_number` increment, Gate 4B, kembali ke `pending`). **Jika metadata Billing Record yang salah** (mis. tanggal salah input, PDF sebenarnya benar) → koreksi metadata hanya mungkin selama `draft` (§10.1); jika Billing Record sudah `issued`, koreksi metadata **wajib** lewat void + reissue (§16), bukan edit langsung — PDF yang sudah diunggah untuk Billing Record yang di-void tetap sebagai evidence historis (§16.3), Billing Record pengganti memerlukan upload PDF baru yang sudah dikoreksi.

---

## 15. Legacy Manual Invoice Registration (FROZEN — baru, Amendment 1)

**FROZEN:**

1. Invoice lama **mempertahankan nomor aslinya** — ADOP **tidak pernah** membuat nomor pengganti untuk invoice yang sudah pernah diterbitkan secara fisik sebelum diregistrasi di ADOP. Uniqueness (§6.2) tetap berlaku: jika nomor asli ternyata bentrok dengan Billing Record lain (native atau legacy) dalam legal entity yang sama, registrasi **ditolak** (§15.6) — tidak ada pengecualian "legacy boleh duplikat".
2. Registrasi legacy wajib mencatat minimal (kolom konseptual, §6.1):
   - `invoice_number` (nomor asli, apa adanya);
   - `legal_entity_id`;
   - `client_id`;
   - `project_id` (**satu** Project Kapal — kardinalitas §5 berlaku sama untuk legacy; jika invoice lama secara historis mencakup lebih dari satu project, ini adalah **legacy exception** yang dicatat sesuai §15.7, bukan alasan melonggarkan kardinalitas);
   - `invoice_date`;
   - `due_date`, **jika diketahui** (nullable jika tidak diketahui — lihat §15.4);
   - total (tercermin dari coverage snapshot jika tersedia, atau dicatat sebagai catatan legacy jika coverage tidak dapat direkonstruksi, §15.7);
   - cakupan transaksi yang dipilih/dipetakan, **jika datanya tersedia** (§15.7 untuk kasus tidak tersedia);
   - PDF/evidence, **jika tersedia** (opsional — bukan syarat registrasi berhasil, karena invoice lama mungkin sudah tidak menyimpan file digital);
   - `origin = 'legacy_import'` (penanda legacy);
   - status verifikasi (mengikuti lifecycle evidence existing jika PDF diunggah; jika tidak ada PDF, tidak ada status verifikasi yang berlaku — Billing Record tetap `LEGACY_RECORDED` tanpa evidence);
   - `imported_by` (actor yang menjalankan registrasi) dan `imported_at` (waktu registrasi) — provenance, bukan waktu penerbitan historis asli.
3. Data yang tidak diketahui **tidak boleh direkayasa** — field yang tidak diketahui tetap `NULL`/kosong, bukan diisi nilai tebakan.
4. Missing historical data **wajib ditandai eksplisit** sebagai unknown/unverified pada UI (mis. "Due date tidak diketahui" alih-alih menyembunyikan field atau menampilkan tanggal kosong tanpa keterangan).
5. Legacy invoice **tidak otomatis** `READY_TO_SEND` — direpresentasikan sebagai status terpisah `LEGACY_RECORDED` (§11), bukan dipaksa melalui pipeline kelengkapan yang didesain untuk alur baru.
6. Proses import/registrasi **wajib memeriksa** duplicate `invoice_number` (constraint §6.2, berlaku sama untuk legacy) dan potensi double billing (jika coverage dipetakan ke transaksi yang sudah dicakup Billing Record aktif lain, constraint §9.1 berlaku sama — registrasi ditolak, bukan dipaksakan).
7. **Legacy coverage exception:** jika cakupan transaksi historis **tidak dapat direkonstruksi** (mis. data pra-ADOP yang tidak pernah diimpor ke cost ledger), sistem **tidak boleh membuat hubungan transaksi palsu** untuk mengisi kekosongan tersebut. Kondisi ini dicatat eksplisit lewat `legacy_coverage_status = 'unknown'` (§6.1) — Billing Record tetap valid dan terlihat di daftar invoice (ditandai jelas sebagai "cakupan tidak dapat direkonstruksi"), **bukan** disembunyikan atau diberi baris `invoice_transaction_lines` fiktif. `legacy_coverage_status = 'partial'` berlaku jika sebagian transaksi berhasil dipetakan tapi admin secara eksplisit menandai pemetaan tidak lengkap.
8. Backfill (proses registrasi banyak invoice lama sekaligus) **wajib idempotent** — mengimpor ulang data sumber yang sama tidak boleh menggandakan Billing Record (mis. dicegah lewat `invoice_number` unik per legal entity yang sudah menjadi constraint alami, §6.2) — dan **tidak boleh mengubah** issued snapshot atau cost ledger existing manapun (§8.4, §20).
9. **Dependency:** registrasi legacy invoice mensyaratkan `project_id` yang direferensikan sudah ada sebagai `vessel_projects` di ADOP (composite FK, §5.1) — jika Project Kapal historis belum diimpor ke master data ADOP (Universal Import Phase 1), registrasi invoice legacy-nya **terblokir sampai** project tersebut diimpor terlebih dahulu. Ini bukan aturan baru, hanya konsekuensi struktural dari FK yang sudah dibekukan.

---

## 16. Void & Replacement Numbering (FROZEN — baru, Amendment 1, mengonsolidasikan Gate 4A §3/§4)

**FROZEN:**

1. Nomor invoice yang pernah digunakan **tidak boleh digunakan ulang**, termasuk setelah `void` (§6.2 — final, bukan lagi OPEN).
2. Record `void` dan transaction coverage snapshot historisnya **tetap dipertahankan** — tidak pernah dihapus (konsisten dengan Gate 4A §3/§9 F13, tidak berubah).
3. PDF/evidence versi lama pada Billing Record yang `void` tetap mengikuti retention dan access control existing (Gate 4A §5, §7) — tidak ada perubahan.
4. Billing Record pengganti (reissue) **wajib**:
   - memperoleh `invoice_number` **baru** (berbeda dari nomor yang di-void-kan — otomatis konsekuensi dari §6.2 karena nomor lama tidak boleh dipakai ulang);
   - memiliki referensi eksplisit ke Billing Record yang di-void (`predecessor_invoice_id`, Gate 4A §3, tidak berubah);
   - membentuk Billing Record baru sepenuhnya (baris `invoices` baru, bukan reuse baris lama);
   - menjalani ulang seluruh alur: registrasi nomor (§7), pemilihan cakupan (§8), upload PDF (§14), dan verifikasi (§14) — tidak ada satu pun langkah yang diwariskan otomatis dari predecessor-nya.
5. Void **tidak boleh** menghapus jejak nomor maupun membuat histori tampak seolah invoice tidak pernah ada — nomor yang di-void-kan tetap terlihat sebagai riwayat (mis. pada daftar invoice dengan status `void`), bukan dihapus dari tampilan.

---

## 17. Read/Write Authorization Matrix

**FROZEN — meneruskan Gate 4A §7 tanpa perubahan, diperluas ke object baru:**

| Tindakan | owner | admin | reviewer | viewer |
|---|---|---|---|---|
| Membuat/mengubah kardinalitas (`project_id`, `legal_entity_id`) Billing Record saat `draft` | ✅ | ✅ | ❌ | ❌ |
| Membaca/mengubah billing metadata lain (`invoice_number`, `invoice_date`, `due_date`) saat `draft` | ✅ | ✅ | ❌ | ❌ |
| Meregistrasi/mengubah `invoice_number` (§7) | ✅ | ✅ | ❌ | ❌ |
| Menambah/melepas cakupan transaksi (§8) saat `draft` | ✅ | ✅ | ❌ | ❌ |
| Membaca billing metadata invoice `issued`/`void` | ✅ | ✅ | ❌ | ❌ |
| Membaca billing completeness status (§11) | ✅ | ✅ | ❌ | ❌ |
| Membaca Unbilled Vessel Alert (§13) | ✅ | ✅ | ❌ | ❌ |
| Mengunggah/memverifikasi PDF terhadap Billing Record (§14) | ✅ | ✅ | ❌ | ❌ |
| Meregistrasi invoice legacy (§15) | ✅ | ✅ | ❌ | ❌ |
| Membaca ready-to-send status (§14) | ✅ | ✅ | ❌ | ❌ |

**Keputusan yang dibekukan:** tidak ada role atau permission baru diperkenalkan; matrix identik dengan Gate 4A §7 (dibatasi `owner`+`admin`). Tidak ada maker-checker baru (§10.3).

---

## 18. Tenant Isolation

**FROZEN — tidak ada pola baru, reuse penuh:**

- Setiap kolom metadata baru (`project_id`, `client_id`, `legal_entity_id`) **wajib** memakai composite tenant-safe FK `(kolom_id, tenant_id) → target(id, tenant_id)`, pola identik seluruh FK Gate 1A–4C.
- Read model baru (§12, §13.3) wajib `security_invoker = true` + `SECURITY DEFINER` wrapper yang re-cek `private.current_user_has_tenant_role(p_tenant_id, ...)` sebelum mengembalikan baris.
- Tidak ada mekanisme baru untuk lintas-tenant sharing — composite FK membuat ini **structurally impossible**.
- Registrasi legacy (§15) tunduk pada tenant isolation yang sama — `project_id` yang direferensikan wajib berada di tenant yang sama (FK composite), tidak ada jalur import lintas-tenant.

---

## 19. Audit Events

**FROZEN — extend `access_audit_events` existing, tidak ada tabel audit baru:**

| Action | entity_type | Kapan |
|---|---|---|
| `invoice.metadata_updated` | `invoice` | Setiap kali salah satu field metadata (§6.1, kecuali `invoice_number`) diubah saat `draft`. |
| `invoice.number_registered` | `invoice` | **Baru (Amendment 1).** Saat `invoice_number` pertama kali diisi/diregistrasi pada Billing Record (§7) — dipisahkan dari `invoice.metadata_updated` karena §7 menjadikannya prasyarat eksplisit sebelum upload PDF, bukan sekadar field metadata biasa. |
| `invoice.project_locked` | `invoice` | **Baru (Amendment 1).** Saat `project_id` (dan `client_id` turunannya) ditetapkan pada pembuatan Billing Record (§5.1) — merekam kardinalitas sejak awal. |
| `invoice.legacy_registered` | `invoice` | **Baru (Amendment 1).** Saat sebuah Billing Record diregistrasi dengan `origin = 'legacy_import'` (§15) — `after_data` mencakup seluruh field legacy (§15.2) termasuk `imported_by`/`imported_at`. |
| `invoice.metadata_locked` | `invoice` | Implisit bersamaan dengan `invoice.issued` (Gate 4A) — tidak perlu action baru terpisah jika `after_data` sudah menyertakan snapshot metadata. |
| `evidence.verified` / `evidence.rejected` | `invoice_evidence_version` | Sudah ada (Gate 4A §8) — Amendment 1 tidak menambah action baru untuk verifikasi PDF, hanya menegaskan bahwa keputusan ini **harus** didasarkan pada checklist §14.2, dan `rejected_reason` (Gate 4B) **wajib** menyebutkan field mismatch saat `rejected` karena alasan mismatch. |

**DERIVED FROM EXISTING CONTRACT:** format audit mengikuti pola persis `invoice.created`/`invoice.issued`/`invoice.voided` (Gate 4A §8) — actor, timestamp, before/after data.

**Larangan eksplisit (FROZEN):** tidak ada mutasi apa pun terhadap `invoice_transaction_lines` yang sudah terkunci, `invoice_evidence_versions` manapun, atau baris `invoices` yang sudah `issued`/`void` di luar kolom metadata yang secara eksplisit didesain immutable pasca-`issued` (§10.1).

---

## 20. Idempotency dan Concurrency Rules

**FROZEN:**

- **Update metadata saat `draft`:** idempotent secara alami.
- **Constraint invoice_number unik:** race dua Billing Record diberi `invoice_number` sama secara konkuren dalam legal entity yang sama **ditolak deterministic** oleh partial unique index (§6.2).
- **Transisi ke `issued` dengan metadata/cakupan belum lengkap:** ditolak oleh extended `invoices_issued_shape` check constraint (§10.2) — kegagalan constraint database, bukan hanya validasi UI.
- **Dua request bind transaksi yang sama ke dua Billing Record `draft` berbeda secara konkuren:** hanya satu berhasil, ditolak deterministic oleh partial unique index binding aktif (Gate 4A F3, tidak berubah oleh Amendment 1) — **ditambah** validasi project baru (§8.2) berlaku independen dari race ini.
- **Retry request bind/unbind/registrasi nomor yang identik:** tidak menghasilkan efek ganda (baris duplikat/nomor ganda) — pola idempotency yang sama seperti Gate 4A F12.
- **Registrasi legacy invoice yang di-retry** dengan data sumber identik: tidak menggandakan Billing Record — dicegah oleh constraint uniqueness nomor (§6.2) yang berlaku sama untuk legacy.
- **Concurrent read Unbilled Vessel Alert:** lihat §13.7 — tidak ada state tertulis, sehingga tidak ada concurrency hazard pada level alert itu sendiri.

---

## 21. Compatibility dengan Gate 4B/4C

- **Gate 4B (schema/storage):** Phase 2A (Amendment 1 termasuk) murni additive di atas `invoices` dan `invoice_transaction_lines` — tidak mengubah tipe kolom, constraint, trigger, atau RLS yang sudah ada. `invoices_issued_shape` **diperluas** (bukan diganti). `bind_invoice_transaction` **diperluas** dengan validasi `project_id` (§8.2) — perubahan pada isi fungsi, bukan pada signature/kontrak API-nya kecuali penambahan parameter `project_id` wajib pada `create_draft_invoice` (§5.1), yang merupakan breaking change kecil dan terkontrol pada gate implementasi berikutnya, bukan pada dokumen ini.
- **Gate 4C (read model):** `invoice_billing_summary` **diperluas** dengan kolom baru; `invoice_eligible_transactions` **diperluas** dengan filter `project_id` opsional yang sudah ada (`p_project_id` parameter di `list_invoice_eligible_transactions` — Gate 4C sudah mendukung filter ini); `transaction_invoice_bindings` **tidak berubah**.
- **Gap §2.2/§2.6:** perilaku permisif existing (multi-project per invoice) **wajib ditutup** pada gate implementasi berikutnya sebagai bagian dari menegakkan §5 — ini bukan regresi terhadap Gate 4B/4C (keduanya tidak pernah menjamin perilaku sebaliknya), melainkan penyempurnaan gap yang memang belum ditutup.
- **"Gate 4D":** tidak ada — lihat §1.2.
- **Cost recap XLSX (`01dcd5e`):** `cost-recap.ts` tetap berfungsi tanpa perubahan wajib — penambahan metadata dan pembatasan project tidak mengharuskan perubahan pada cost recap export (rekap yang sudah dibatasi ke satu project secara alami akan menampilkan satu client saja, tidak mengubah kebutuhan struktur rekap yang sudah mendukung banyak baris).

---

## 22. Failure Behavior

**FROZEN:**

- Metadata tidak lengkap → `issue_invoice` gagal dengan pesan eksplisit menyebutkan field yang kurang.
- Cakupan kosong → `issue_invoice` gagal dengan pesan eksplisit ("Billing Record belum memiliki transaksi tercakup").
- Transaksi dari project berbeda dicoba di-bind → `bind_invoice_transaction` gagal dengan pesan eksplisit ("transaksi berasal dari Project Kapal yang berbeda dengan Billing Record ini").
- `invoice_number` duplikat dalam legal entity yang sama (termasuk bentrok dengan nomor yang sudah `void`) → constraint database menolak.
- `due_date < invoice_date` → ditolak sebelum transisi `issued`.
- Upload PDF sebelum `invoice_number` teregistrasi → ditolak dengan pesan eksplisit (§7.1).
- PDF mismatch terhadap Billing Record → tidak ditolak saat upload (tetap tercatat sebagai evidence, §14.5), tetapi tidak pernah mencapai `verified`/`READY_TO_SEND` sampai dikoreksi.
- Legal entity `inactive` dipilih → **OPEN**, lihat §23 #2.
- Registrasi legacy dengan `project_id` yang belum ada di ADOP → ditolak oleh FK (§15.9).
- Registrasi legacy dengan nomor yang sudah dipakai → ditolak oleh constraint uniqueness yang sama (§15.6).
- Read model Unbilled Vessel Alert gagal query → UI wajib menampilkan error state eksplisit (§13.5), tidak boleh fallback ke "tidak ada unbilled".
- Core system (dashboard, invoice list) tetap berjalan jika Unbilled Vessel Alert query gagal.

---

## 23. Open Decisions — Tidak Dapat Diputuskan dari Repo (Diperbarui Amendment 1)

**Ditutup pada Amendment 1 (tidak lagi OPEN):**

- ~~Kardinalitas invoice (multi-project/multi-client)~~ → **FROZEN**, lihat §5.
- ~~Reuse nomor invoice yang di-void~~ → **FROZEN, tidak boleh dipakai ulang**, lihat §6.2.
- ~~Perilaku alert saat semua invoice project void tanpa reissue~~ → **FROZEN**, lihat §13.1.

**Tetap OPEN (tidak ditutup — tidak ada bukti repo atau instruksi baru untuk menutupnya):**

1. **OPEN — NEEDS OWNER/LEGAL CONFIRMATION.** Format/prefix `invoice_number` (mis. `INV/2026/001` vs `2026-001` vs bebas teks) — bergantung pada identitas legal entity final yang menurut roadmap masih "MENUNGGU INPUT PAK HANAFI". Phase 2A hanya membekukan bahwa kolom ini **ada**, **teks bebas**, dan **unik per legal entity, tidak pernah dipakai ulang** (§6.2) — bukan format spesifik.
2. **OPEN.** Perilaku saat admin memilih `legal_entity_id` yang berstatus `inactive` untuk Billing Record baru — ditolak keras atau diizinkan dengan peringatan. Tidak ada preseden di Gate 4A–4C untuk kasus ini.
3. **OPEN.** Definisi persis "responsible PIC" pada Unbilled Vessel Alert (§13.3) — PIC internal ADOP vs PIC client billing.
4. **OPEN.** Apakah Unbilled Vessel Alert perlu grace period (mis. N hari setelah closed sebelum alert muncul) — tidak disebut di PRD/roadmap/instruksi manapun sejauh ini.

---

## 24. Explicit Deferred Scope

Ditunda ke gate/kontrak terpisah berikutnya, **bukan** bagian Phase 2A (diperbarui Amendment 1):

- **Invoice generator/renderer/preview PDF** — tetap di luar scope; workflow tetap Word manual + wet signature (§4).
- **Provider delivery** (WhatsApp/email) — tetap OPEN/UNCONFIGURED.
- **Acknowledgement/dispute** — implementasi state machine delivery adalah gate kontrak terpisah setelah Phase 2A.
- **Status `SENT`** — placeholder nama saja.
- **Payment verification/matching** (Phase 3) — tidak disentuh sama sekali.
- **Consolidated invoice lintas-Project Kapal** (baru, Amendment 1) — DEFERRED per §5.4, memerlukan kontrak model data terpisah jika dibutuhkan di masa depan.
- **Partial billing** (baru, Amendment 1) — DEFERRED per §9.2, satu transaksi selalu ditagihkan penuh pada Phase 2A/v1.
- **Automatic/sequential invoice numbering** (baru, Amendment 1) — DEFERRED; nomor tetap input manual admin selama format belum FROZEN (§23 #1).
- **OCR/AI extraction sebagai verifier PDF otomatis** (baru, Amendment 1) — DEFERRED per §14.4; hanya boleh menjadi bantuan pemeriksaan non-otomatis di masa depan.
- **Structured field-by-field verification checklist di database** (baru, Amendment 1) — Phase 2A hanya membekukan checklist sebagai panduan prosedural (§14.2) menggunakan `rejected_reason` teks bebas; representasi terstruktur (mis. JSON pass/fail per kriteria) adalah enhancement opsional untuk gate implementasi, bukan kewajiban.
- **Backfill data invoice historis dalam jumlah besar (tooling otomatis)** — kebijakan registrasi legacy dibekukan (§15), tetapi tooling/UI untuk bulk-import adalah pekerjaan gate implementasi terpisah.

---

## 25. Migration/Backfill Policy

**FROZEN (kebijakan, bukan eksekusi):**

- Seluruh kolom baru (§6.1) wajib **nullable** saat ditambahkan — tidak boleh mem-break invoice `draft`/`issued`/`void` yang sudah ada.
- **Tidak ada backfill otomatis** untuk invoice `issued`/`void` native yang sudah ada sebelum Phase 2A — metadata tetap kosong (bukan diisi nilai tebakan). Constraint "wajib terisi sebelum `issued`" **hanya berlaku untuk transisi status yang terjadi setelah gate implementasi berjalan** — tidak retroaktif.
- **Legacy invoice registration** (§15) adalah satu-satunya jalur "backfill" yang **disengaja** dan **manual per-record (atau batch dengan review)** — bukan migrasi database otomatis yang menebak data. Setiap Billing Record legacy dimasukkan lewat proses registrasi eksplisit yang tunduk pada seluruh aturan §15, bukan `UPDATE`/`INSERT` massal tanpa jejak.
- Jika di masa depan ditemukan invoice `issued` native lama tanpa metadata (dari sebelum Phase 2A), itu adalah **limitation yang harus dicatat eksplisit** — bukan pelanggaran constraint, dan bukan kandidat otomatis untuk diregistrasi ulang sebagai legacy (invoice native yang sudah ada di ADOP bukan "legacy" dalam pengertian §15 — legacy khusus untuk invoice yang **belum pernah** punya Billing Record di ADOP sama sekali).
- Registrasi legacy invoice bergantung pada Project Kapal terkait sudah ada di master data ADOP (§15.9) — urutan migrasi/import: master data project → registrasi legacy invoice, tidak bisa dibalik.

---

## 26. Observability Minimum

**FROZEN (kontrak, bukan implementasi):**

- Setiap invoice yang mencapai `READY_TO_SEND` harus dapat ditelusuri kapan status itu tercapai — turunan dari `access_audit_events` existing (evidence verified + issued + metadata lengkap + checklist §14.2 terpenuhi).
- Unbilled Vessel Alert harus dapat dijelaskan ("mengapa project ini muncul", termasuk kasus "karena satu-satunya invoice-nya di-void", §13.3) dengan drill-down ke daftar transaksi yang belum terikat.
- Legacy invoice yang `legacy_coverage_status = 'unknown'`/`'partial'` harus terlihat jelas di UI sebagai exception yang teraudit (§15.7) — tidak boleh tampil identik dengan Billing Record native yang cakupannya lengkap.

---

## 27. Acceptance Criteria — Gate Implementasi Berikutnya

Gate implementasi (migration/RPC/UI) untuk Phase 2A (termasuk Amendment 1) dianggap **PASS** jika:

1. Seluruh kolom metadata §6.1 (termasuk `project_id`, `origin`, `legacy_coverage_status`, `imported_by`, `imported_at`) ditambahkan additive ke `invoices`, dan kolom snapshot tambahan (`transaction_date`, kategori/tipe) ditambahkan additive ke `invoice_transaction_lines`.
2. `create_draft_invoice` mensyaratkan `project_id` eksplisit; `client_id` diturunkan otomatis dan tidak dapat diisi independen (§5.1).
3. `bind_invoice_transaction` menolak transaksi yang `project_id`-nya berbeda dari Billing Record (§8.2) — menutup gap §2.2/§2.6.
4. `invoices_issued_shape` diperluas mensyaratkan seluruh field wajib (§6.1) dan cakupan ≥1 baris terisi sebelum `issued`.
5. Partial unique index `(tenant_id, legal_entity_id, invoice_number) where invoice_number is not null` mencegah duplikat, **tidak dikecualikan untuk status `void`** (§6.2).
6. Upload evidence version ditolak jika `invoice_number` Billing Record masih kosong (§7.1).
7. Read model billing completeness (§11, termasuk status `LEGACY_RECORDED`) dan Unbilled Vessel Alert (§13, termasuk kondisi void-tanpa-reissue) tersedia sebagai view + `SECURITY DEFINER` wrapper, dibatasi `owner`/`admin`, tenant-isolated.
8. Registrasi legacy invoice (§15) tersedia sebagai jalur eksplisit terpisah dari pembuatan Billing Record native, dengan seluruh field provenance (§15.2) dan larangan merekayasa data (§15.3, §15.7).
9. Tidak ada regresi pada seluruh test Gate 4A/4B/4C existing.
10. Audit event baru (§19: `invoice.number_registered`, `invoice.project_locked`, `invoice.legacy_registered`) tercatat sesuai definisi.
11. Open Decisions §23 (#1–#4) sudah mendapat keputusan eksplisit dari Pak Hanafi/legal sebelum item terkait diimplementasikan sebagai constraint permanen yang sulit diubah.
12. Tidak ada perubahan pada cost ledger immutable, evidence versioning, atau invoice snapshot yang sudah `issued` sebelum gate ini berjalan.
13. Test matrix `ADOP_PHASE_2A_BILLING_METADATA_UNBILLED_CONTROL_TEST_MATRIX_v1.0.md` (termasuk skenario Amendment 1) lulus seluruhnya.

---

**Tidak ditemukan konflik material lain** antara `CLAUDE.md`, `PRD.md`, `ADOP_WORKFLOW_ROADMAP_v1.0.md`, dan implementasi Gate 4A–4C/`01dcd5e` selain yang sudah didokumentasikan eksplisit sebagai OPEN di §23 — kontrak ini (termasuk Amendment 1) dapat dibekukan tanpa STOP.
