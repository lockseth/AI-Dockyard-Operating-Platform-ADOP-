# ADOP — Gate 4A Contract: Evidence & Signed Document Freeze v1.0

**Produk:** AI Dockyard Operating Platform (ADOP)
**Design partner:** PT Gamatara
**Primary user:** Pak Hanafi — Owner
**Gate:** 4A — Evidence & Signed Document Contract Freeze
**Sifat Gate:** Documentation-only. **Tidak ada implementasi** (migration, RPC, RLS, storage bucket, repository/service/action, UI, atau test) pada Gate 4A.
**Status dokumen:** Baseline v1.0; mengunci kontrak bisnis dan batas domain sebelum Gate 4B (implementasi schema/storage).

---

## 1. Ruang Lingkup

Gate 4A membekukan kontrak bisnis untuk alur:

`transaksi ditutup (closed) → dipilih menjadi invoice → invoice dicetak/diekspor → ditandatangani Pak Hanafi dan diberi cap di luar sistem → admin mengunggah dokumen final → dokumen diverifikasi manual → dokumen dapat dilihat dari invoice dan Riwayat Transaksi terkait`

Gate ini selaras dengan LOCK yang sudah ada di `PRD.md` §7.12 *Assisted Billing — Phase 2* (`project closed → export cost recap XLSX → admin prepares Word invoice → owner wet signature/stamp → upload signed PDF → set due date → send invoice`). Gate 4A **tidak mengubah** LOCK tersebut — Gate 4A menambahkan detail kontrak yang belum eksplisit: binding transaksi→invoice yang immutable, serta versioning dan integritas dokumen evidence/signed document.

Tidak ada perhitungan tagihan baru, renderer invoice baru, atau ringkasan biaya per periode baru yang dibekukan di sini. Nilai invoice diasumsikan berasal dari snapshot transaksi yang dipilih (lihat §4).

---

## 2. Domain Boundary

Empat lapisan domain dipisahkan secara tegas dan tidak boleh saling menimpa tanggung jawab:

| Lapisan | Definisi | Sifat |
|---|---|---|
| **Transaksi operasional `closed`** | Baris `project_cost_ledger_entries` (immutable cost ledger, lihat `supabase/migrations/20260719120000_project_cost_ledger.sql`) milik Project Kapal yang `lifecycle_status = 'closed'` | Sumber kebenaran nilai; tidak pernah diubah oleh proses invoicing |
| **Invoice** | Record bisnis yang mengikat sekumpulan transaksi closed sebagai satu tagihan | Immutable binding setelah diterbitkan; koreksi lewat void/reissue |
| **Evidence / dokumen** | File fisik (scan/foto/PDF hasil tanda tangan+cap) yang menjadi bukti invoice final | Private, versioned, tidak pernah di-overwrite |
| **Verifikasi dokumen** | Keputusan manual bahwa suatu versi dokumen sah mewakili invoice yang dituju | Append-only decision, terpisah dari upload |

Relasi permanen invoice → transaksi **wajib** memakai primary key tabel sumber `project_cost_ledger_entries.id` (composite dengan `tenant_id` sesuai pola FK existing di migration tersebut), **bukan** id yang diekspos oleh view `public.trusted_transaction_history`. View tersebut adalah proyeksi read-only (gabungan cash source + cost source, lihat `supabase/migrations/20260720140000_trusted_transaction_history.sql`) dan tidak boleh menjadi target foreign key permanen.

---

## 3. Invoice Binding Contract — LOCK

- Invoice hanya boleh mengikat transaksi dari Project Kapal yang **sudah `closed`**; transaksi dari project `active`/`ready_to_close` ditolak saat binding.
- Invoice menyimpan pilihan transaksi sumber secara **immutable** melalui baris relasi (`invoice_transaction_lines` atau nama setara pada Gate 4B) yang mereferensikan `project_cost_ledger_entries.id` + `tenant_id`.
- Setelah invoice berstatus `issued`, transaksi terikat **tidak boleh** ditambah, dilepas, atau dipindahkan secara diam-diam. Baris binding bersifat append-only setelah issuance.
- Nilai invoice berasal dari **snapshot** transaksi yang dipilih pada saat binding (nominal, deskripsi, project) — bukan dihitung ulang secara live dari ledger saat invoice dibuka kembali.
- Koreksi setelah penerbitan **wajib** memakai mekanisme **void + reissue** eksplisit:
  - Invoice yang salah di-void (status `void`, menyimpan `void_reason` dan actor).
  - Invoice baru dibuat dengan referensi `predecessor_invoice_id` ke invoice yang di-void, membentuk rantai versi yang dapat ditelusuri.
  - Tidak ada update senyap pada baris binding atau nominal invoice yang sudah `issued`.
- **Satu transaksi (`project_cost_ledger_entries.id`) tidak boleh terikat ke lebih dari satu invoice *aktif*** dalam tenant yang sama.
  - **Definisi invoice aktif (LOCK):** status `draft` atau `issued`. Invoice `void` **tidak aktif** dan membebaskan transaksi terikatnya untuk dipilih ulang oleh invoice baru (mis. melalui reissue).
  - Invariant ini diberlakukan lewat constraint tenant-scoped (mis. partial unique index pada `(tenant_id, transaction_entry_id)` yang hanya berlaku selagi invoice induk berstatus aktif) — bukan hanya validasi UI.

---

## 4. Invoice Lifecycle Minimum — LOCK

```
draft → issued → void
```

- **`draft`** — admin menyiapkan invoice dari transaksi closed; binding transaksi masih dapat disunting selama status `draft`.
- **`issued`** — invoice dicetak/diekspor dan dianggap resmi; binding transaksi dan nominal snapshot terkunci (lihat §3).
- **`void`** — invoice dibatalkan (baik dari `draft` yang dibatalkan tanpa pernah diterbitkan, maupun dari `issued` yang dikoreksi lewat reissue). Status terminal; tidak ada transisi keluar dari `void`.

Tidak ada status tambahan (mis. `sent`, `paid`, `overdue`) yang dibekukan pada Gate 4A — status delivery/payment adalah domain Phase 2/3 terpisah (`invoice_delivery_channel`, delivery event, payment verification) yang sudah dibekukan di `PRD.md` §7.12 dan **tidak diperluas** di sini.

Transisi lifecycle mengikuti pola state-machine yang sudah ada di `vessel_project_lifecycle` (`private.enforce_*_transition()` trigger, tanpa skip/reverse/reopen) — Gate 4B disarankan menggunakan pola yang sama untuk `invoice.status`.

---

## 5. Evidence & Signed Document Contract — LOCK

- Storage **wajib private** (bukan public bucket).
- Akses file hanya melalui **server-authorized access** atau **signed URL berumur terbatas** (short-lived, single-purpose). Signed URL tidak pernah membuat bucket menjadi public secara permanen.
- File yang sudah tersimpan **tidak boleh di-overwrite**. Setiap penggantian dokumen (mis. hasil scan ulang, cap ulang) **selalu membuat versi baru** dengan object key baru.
- Setiap versi dokumen menyimpan minimal:
  - `storage_path` / object key;
  - `sha256` hash;
  - `size_bytes`;
  - `mime_type`;
  - `uploaded_by` (actor);
  - `uploaded_at`;
  - `version_number` (monotonic per evidence parent, dimulai dari 1);
  - relasi eksplisit ke evidence/invoice parent (`invoice_id` dan/atau `evidence_id`).
- **Versi aktif/current** ditentukan secara eksplisit oleh satu flag/pointer per evidence parent (mis. `is_current` unik-partial atau kolom `current_version_id` pada parent) — tidak pernah diinferensi dari `version_number` terbesar semata, agar rollback ke versi lama (jika verifikasi gagal) tetap eksplisit dan dapat diaudit.
- **Versi lama tetap dipertahankan** untuk audit; tidak ada hard delete pada baris versi.
- Verifikasi dokumen adalah keputusan **per versi**, bukan per parent:
  - status verifikasi: `pending` (default saat upload) → `verified` atau `rejected`.
  - versi baru yang menggantikan versi `current` sebelumnya **selalu kembali ke `pending`** — verifikasi tidak diwariskan otomatis antar versi.
  - hanya versi `current` **dan** `verified` yang dianggap dokumen final yang sah ditampilkan sebagai "signed document" resmi pada invoice/Riwayat Transaksi. Versi `current` yang masih `pending`/`rejected` tetap terlihat (transparan), tetapi ditandai belum final — konsisten dengan prinsip "candidate duplicate tetap terlihat" yang sudah dibekukan untuk domain lain di `CLAUDE.md` §4.
- Dokumen final bertanda tangan/cap **harus dapat ditelusuri** ke invoice (`invoice_id`) dan, melalui invoice, ke seluruh transaksi sumber (`project_cost_ledger_entries.id`) lewat binding di §3.

---

## 6. Workflow v1 — LOCK

1. Admin membuat/menyiapkan invoice (`draft`) dari satu atau lebih transaksi Project Kapal yang `closed`.
2. Invoice diterbitkan (`issued`); binding dan nominal snapshot terkunci. Invoice dicetak/diekspor di luar kontrak Gate 4A (mengikuti alur export existing di PRD §7.12).
3. Pak Hanafi menandatangani dan memberi cap **di luar sistem** (tidak ada aksi sistem pada langkah ini).
4. Admin mengunggah hasil scan/foto/PDF sebagai versi evidence baru (§5).
5. Dokumen diverifikasi manual oleh role berwenang (§7) — hasil `verified` atau `rejected`.
6. Dokumen final (`current` + `verified`) dapat dibuka dari halaman invoice **dan** dari Riwayat Transaksi transaksi terkait, melalui akses private/signed URL (§5).

OCR/ekstraksi otomatis atas dokumen yang diunggah **boleh** dicatat sebagai enhancement masa depan, tetapi **bukan syarat** Gate 4A–4C v1.

---

## 7. Authorization Matrix — LOCK

Role mengikuti `public.tenant_role` existing (`owner`, `admin`, `reviewer`, `viewer`).

| Tindakan | owner | admin | reviewer | viewer |
|---|---|---|---|---|
| Membuat draft invoice | ✅ | ✅ | ❌ | ❌ |
| Menerbitkan invoice (`issued`) | ✅ | ✅ | ❌ | ❌ |
| Void invoice | ✅ | ✅ | ❌ | ❌ |
| Upload versi dokumen evidence | ✅ | ✅ | ❌ | ❌ |
| Mengganti current version | ✅ | ✅ | ❌ | ❌ |
| Verify/reject dokumen | ✅ | ✅ | ❌ | ❌ |
| Melihat/download dokumen private (signed URL) | ✅ | ✅ | ❌ | ❌ |
| Melihat status invoice dari Riwayat Transaksi | ✅ | ✅ | ❌ | ❌ |

**Keputusan yang dibekukan:** akses invoice/evidence mengikuti preseden `public.trusted_transaction_history` (`list_trusted_transactions`, `get_trusted_transaction_detail`, `summarize_trusted_transactions` — lihat `supabase/migrations/20260720140000_trusted_transaction_history.sql`), yaitu **dibatasi ke `owner`+`admin` saja**. Ini berbeda dari pola read-only master data (`reviewer`/`viewer` boleh membaca master data) karena invoice dan dokumen bertanda tangan bersifat finansial-sensitif setara trusted ledger, bukan master data referensi. `reviewer`/`viewer` tidak mendapat akses baca ke invoice maupun dokumen evidence pada Gate 4A ini.

Gate 4A **tidak** memperkenalkan role atau permission baru di luar `tenant_role` existing, dan **tidak** memberlakukan maker-checker (verifier ≠ uploader) — keduanya boleh berasal dari role yang sama (`owner`/`admin`) pada v1; pemisahan tugas lebih ketat adalah open discovery untuk gate berikutnya bila dibutuhkan Pak Hanafi.

---

## 8. Audit Event Contract — LOCK

Setiap tindakan material dicatat sebagai audit event **append-only**, memakai foundation `public.access_audit_events` yang sudah ada (`tenant_id`, `actor_user_id`, `entity_type`, `entity_id`, `action`, `before_data`, `after_data`, `created_at` — lihat `supabase/migrations/20260719070115_foundation_tenant_isolation.sql`, digunakan lintas domain termasuk `master_data`, `cash_reconciliation`, `user_management`, `owner_control_notification_outbox`). Gate 4A **tidak** membuat tabel audit baru.

Action minimum yang wajib dicatat pada Gate 4B:

- `invoice.created` (`entity_type = 'invoice'`)
- `invoice.issued`
- `invoice.voided`
- `evidence.uploaded` (`entity_type = 'invoice_evidence_version'`)
- `evidence.version_superseded`
- `evidence.verified`
- `evidence.rejected`
- `evidence.accessed` — dicatat **jika** akses private document diimplementasikan lewat server-authorized path yang dapat mengeksekusi insert audit (bukan direct signed-URL-only tanpa titik kontrol server). Gate 4A **tidak** mewajibkan pembuatan viewer untuk `access_audit_events` — pencatatan event cukup memakai foundation yang sudah ada.

Setiap event minimal menyimpan actor, timestamp (`created_at`), dan referensi before/after yang relevan, konsisten dengan pola `master_data_audit_events`.

---

## 9. Failure & Concurrency Invariants — LOCK

| # | Invariant | Mekanisme referensi |
|---|---|---|
| F1 | Binding transaksi yang belum `closed` ditolak | Check constraint / validasi di RPC binding, meniru guard `enforce_vessel_project_lifecycle_transition` |
| F2 | Cross-tenant binding ditolak (transaksi tenant lain tidak bisa masuk invoice tenant ini) | Composite FK `(project_cost_ledger_entries.id, tenant_id)` + RLS, pola sama seperti FK tenant-safe di `project_cost_ledger_entries` |
| F3 | Duplicate active billing ditolak (satu transaksi di >1 invoice aktif) | Partial unique index pada binding, scoped ke invoice berstatus `draft`/`issued` |
| F4 | Perubahan binding/nominal setelah `issued` ditolak | Trigger append-only/immutability mirip `vessel_project_lifecycle_events_append_only` |
| F5 | Overwrite storage object/versi ditolak | Object key baru wajib per versi; tidak ada operasi update-in-place pada object storage |
| F6 | Hash atau metadata versi tidak valid ditolak | Validasi `sha256`/`size_bytes`/`mime_type` wajib diisi sebelum versi dianggap tersimpan sah |
| F7 | Upload oleh role tanpa izin ditolak | RLS/RPC role check `owner`/`admin` (§7) |
| F8 | Verify oleh role tanpa izin ditolak | RLS/RPC role check `owner`/`admin` (§7) |
| F9 | Cross-tenant file access ditolak | Signed URL/server-authorized access wajib re-validasi tenant + role sebelum menerbitkan akses, pola sama seperti `current_user_has_tenant_role` |
| F10 | Concurrent invoice issuance aman (dua klik "Terbitkan" tidak menghasilkan dua transisi/duplicate audit) | Atomic guard pada transisi status, meniru pola `20260721020000_opening_cash_pool_atomic_guard.sql` / `20260720150000_atomic_paired_refund_reversal.sql` |
| F11 | Concurrent version upload menghasilkan urutan deterministik (`version_number` tidak pernah bentrok/duplikat) | Row lock pada parent evidence saat alokasi nomor versi berikutnya, atau sequence/serializable transaction |
| F12 | Retry tidak membuat duplicate invoice/evidence | Idempotency key atau precondition check status sebelum insert, konsisten dengan idempotency rule import di `CLAUDE.md` §7 |
| F13 | Versi lama tetap dapat diaudit (tidak hard delete) | Larangan DELETE pada tabel versi, hanya `is_current` yang berpindah |
| F14 | Signed URL tidak membuat bucket menjadi public | TTL pendek, scope per-object, tidak ada policy public-read pada bucket |

---

## 10. Explicitly Out of Scope (Gate 4A)

- Migration, tabel, RPC, atau RLS baru.
- Storage bucket atau storage policy baru.
- Repository/service/action implementasi.
- UI upload atau UI verifikasi dokumen.
- Invoice renderer/export baru.
- OCR/AI extraction atas dokumen evidence.
- Notification/WhatsApp terkait invoice atau evidence.
- Perhitungan billing baru (tax, diskon, dsb).
- Ringkasan biaya per periode baru (tidak wajib — total invoice sudah berasal dari snapshot transaksi immutable per §3).
- Test implementasi (lihat dokumen terpisah `ADOP_GATE_4A_TEST_MATRIX_v1.0.md` untuk daftar skenario yang **akan** diimplementasikan pada Gate 4B/4C).
- Refactor unrelated module.

---

## 11. Keputusan & Asumsi yang Dibekukan di Gate Ini

1. **Penamaan dokumen Gate:** Repo belum memiliki preseden dokumen "Gate contract" terpisah (status gate sebelumnya hanya dicatat sebagai baris status di `PRD.md`/`README.md`/`ADOP_WORKFLOW_ROADMAP_v1.0.md`). Dua dokumen Gate 4A memakai konvensi penamaan root-level yang sudah ada di repo (`ADOP_<NAMA>_v<versi>.md`, mengikuti `ADOP_WORKFLOW_ROADMAP_v1.0.md`), bukan membuat struktur folder baru. Ini bukan konflik material — hanya keputusan penamaan agar konsisten dengan file existing.
2. **Akses baca invoice/evidence dibatasi `owner`+`admin`**, mengikuti preseden `trusted_transaction_history` (§7), bukan pola read-only master data (`reviewer`/`viewer` termasuk).
3. **Definisi "invoice aktif"** = status `draft` atau `issued` (§3), agar invariant "duplicate active billing ditolak" dapat diimplementasikan sebagai constraint tunggal tanpa status tambahan.
4. **Tidak ada maker-checker** (verifier boleh sama dengan uploader) pada v1 (§7) — dicatat eksplisit agar tidak dianggap default silent decision.
5. **Audit access baca dokumen (`evidence.accessed`)** dibekukan sebagai *conditional* — wajib hanya jika Gate 4B mengimplementasikan akses lewat server-authorized endpoint yang punya titik kontrol untuk insert audit event; jika akses hanya signed URL murni tanpa endpoint server, item ini menjadi limitation eksplisit pada Gate 4B/4C, bukan kegagalan Gate 4A.

Tidak ditemukan konflik material antara instruksi Gate 4A dan `CLAUDE.md`/`PRD.md`/schema existing — Gate 4A dapat dibekukan tanpa STOP.

---

## 12. Rekomendasi Gate Berikutnya

**Gate 4B — Evidence & Signed Document Schema/Storage Implementation**: migration untuk tabel invoice minimum (status lifecycle §4), invoice binding (§3), evidence/evidence version (§5), RLS mengikuti matrix §7, storage bucket private + signed URL policy, dan RPC dengan atomic guard untuk F10–F12. Test implementasi mengikuti `ADOP_GATE_4A_TEST_MATRIX_v1.0.md`.
