# ADOP — Gate 4A Test Matrix: Evidence & Signed Document v1.0

**Gate:** 4A — Evidence & Signed Document Contract Freeze
**Sifat dokumen:** Documentation-only. Test pada matrix ini **belum diimplementasikan** — daftar ini adalah target wajib untuk Gate 4B (schema/storage) dan Gate 4C (service/UI), disusun agar setiap invariant di `ADOP_GATE_4A_CONTRACT_v1.0.md` memiliki coverage yang jelas sebelum implementasi dimulai.
**Konvensi file test:** mengikuti pola existing repo —
- Database-level: `supabase/tests/database/<nama_domain>.test.sql` (pgTAP, pola sama seperti `project_cost_ledger.test.sql`, `atomic_paired_refund_reversal.test.sql`).
- Integration-level: `tests/integration/<nama-domain>.integration.test.ts` (pola sama seperti `cost-ledger.integration.test.ts`, `owner-approved-cash-import-commit.integration.test.ts`).

Nama file target diusulkan: `supabase/tests/database/invoice_evidence_binding.test.sql` dan `tests/integration/invoice-evidence.integration.test.ts`. Nama final ditentukan saat Gate 4B.

---

## 1. Invoice Binding

| ID | Skenario | Kategori | Referensi kontrak |
|---|---|---|---|
| B-01 | Bind transaksi `closed` ke invoice `draft` berhasil, snapshot nominal tersimpan | Positive | §3, §4 |
| B-02 | Bind transaksi yang masih `active`/`ready_to_close` ditolak | Rejection | §3, F1 |
| B-03 | Bind transaksi dari tenant lain ke invoice tenant ini ditolak | Tenant-isolation | §3, F2 |
| B-04 | Bind transaksi yang sudah terikat ke invoice aktif lain (`draft`/`issued`) ditolak | Rejection | §3, F3 |
| B-05 | Bind ulang transaksi yang invoice sebelumnya sudah `void` berhasil (reissue) | Positive | §3, §4 |
| B-06 | User role `reviewer`/`viewer` mencoba membuat/bind draft invoice ditolak | Authorization | §7 |
| B-07 | Retry request bind yang identik (network retry) tidak menghasilkan baris binding duplikat | Idempotency | F12 |
| B-08 | Dua request bind konkuren untuk transaksi yang sama ke dua invoice `draft` berbeda — hanya satu yang berhasil, yang lain ditolak deterministik | Concurrency | F3, F10 |

## 2. Invoice Lifecycle

| ID | Skenario | Kategori | Referensi kontrak |
|---|---|---|---|
| L-01 | Transisi `draft → issued` berhasil, binding & snapshot terkunci | Positive | §4 |
| L-02 | Transisi `issued → void` berhasil, menyimpan `void_reason` + actor | Positive | §4 |
| L-03 | Penambahan/pelepasan baris binding pada invoice `issued` ditolak | Rejection | §3, F4 |
| L-04 | Update nominal snapshot pada invoice `issued` ditolak (harus lewat void+reissue) | Rejection | §3, F4 |
| L-05 | Transisi `void → issued` atau `void → draft` ditolak (status terminal) | Rejection | §4 |
| L-06 | User role `reviewer`/`viewer` mencoba `issue`/`void` invoice ditolak | Authorization | §7 |
| L-07 | Invoice tenant A tidak terlihat/tidak dapat diubah oleh actor tenant B | Tenant-isolation | §7, F2 |
| L-08 | Dua klik "Terbitkan" konkuren pada invoice `draft` yang sama menghasilkan hanya satu transisi `issued` dan satu audit event | Concurrency | F10 |
| L-09 | Retry request `issue`/`void` yang identik tidak menghasilkan invoice/void ganda | Idempotency | F12 |

## 3. Evidence & Signed Document Versioning

| ID | Skenario | Kategori | Referensi kontrak |
|---|---|---|---|
| E-01 | Upload versi pertama evidence untuk invoice `issued` berhasil, `version_number = 1`, status `pending` | Positive | §5 |
| E-02 | Upload versi baru (superseding) menghasilkan `version_number` increment dan object key baru (tidak overwrite object lama) | Positive | §5, F5 |
| E-03 | Upaya overwrite object storage pada key versi yang sudah ada ditolak | Rejection | F5 |
| E-04 | Upload tanpa `sha256`/`size_bytes`/`mime_type` valid ditolak | Rejection | F6 |
| E-05 | Upload oleh role `reviewer`/`viewer` ditolak | Authorization | §7, F7 |
| E-06 | Upload evidence untuk invoice tenant lain ditolak | Tenant-isolation | F2 |
| E-07 | Versi lama tetap dapat di-query/audit setelah digantikan versi baru (tidak hard delete) | Positive/Regression | §5, F13 |
| E-08 | Penentuan `current version` eksplisit — versi baru tidak otomatis jadi current tanpa aksi eksplisit (jika desain Gate 4B mensyaratkan konfirmasi) *atau* current berpindah otomatis ke versi terbaru sesuai desain final Gate 4B — test memverifikasi perilaku yang benar-benar dipilih, bukan asumsi | Positive | §5 |
| E-09 | Dua upload versi konkuren ke evidence parent yang sama menghasilkan `version_number` berurutan tanpa bentrok/duplikat | Concurrency | F11 |
| E-10 | Retry upload identik (mis. resubmit form setelah timeout) tidak membuat versi duplikat tanpa perubahan konten | Idempotency | F12 |

## 4. Document Verification

| ID | Skenario | Kategori | Referensi kontrak |
|---|---|---|---|
| V-01 | Verify versi `current` oleh `owner`/`admin` berhasil → status `verified` | Positive | §5 |
| V-02 | Reject versi `current` oleh `owner`/`admin` berhasil → status `rejected`, dokumen tetap terlihat (tidak disembunyikan) | Positive | §5 |
| V-03 | Versi baru yang menggantikan versi `verified` kembali ke status `pending` (tidak mewarisi verifikasi) | Positive | §5 |
| V-04 | Verify/reject oleh role `reviewer`/`viewer` ditolak | Authorization | §7, F8 |
| V-05 | Verify/reject dokumen milik tenant lain ditolak | Tenant-isolation | F2 |
| V-06 | Hanya versi `current` + `verified` yang ditandai sebagai dokumen final resmi pada tampilan invoice/Riwayat Transaksi; versi `pending`/`rejected` tetap terlihat namun ditandai belum final | Positive | §5 |

## 5. Private Access & Signed URL

| ID | Skenario | Kategori | Referensi kontrak |
|---|---|---|---|
| A-01 | `owner`/`admin` dapat memperoleh signed URL/akses server-authorized untuk dokumen tenant sendiri | Positive | §7 |
| A-02 | `reviewer`/`viewer` ditolak mengakses dokumen (baca sekalipun) | Authorization | §7 |
| A-03 | Actor tenant lain ditolak mengakses dokumen (signed URL tidak bisa dipakai lintas tenant / permintaan baru lintas tenant ditolak) | Tenant-isolation | F9 |
| A-04 | Signed URL kedaluwarsa setelah TTL pendek dan tidak dapat dipakai ulang di luar masa berlaku | Rejection | §5, F14 |
| A-05 | Bucket storage tidak dapat diakses publik tanpa signed URL/server-authorized path (mis. direct object URL tanpa signature ditolak) | Rejection | F14 |
| A-06 | Dokumen dapat dibuka dari halaman invoice **dan** dari Riwayat Transaksi transaksi terkait, menghasilkan target akses yang sama | Positive | §6 (workflow step 6) |

## 6. Audit Trail

| ID | Skenario | Kategori | Referensi kontrak |
|---|---|---|---|
| AU-01 | `invoice.created` tercatat di `access_audit_events` dengan actor + before/after | Positive | §8 |
| AU-02 | `invoice.issued` tercatat, termasuk saat berasal dari reissue (`predecessor_invoice_id` di `after_data`) | Positive | §8 |
| AU-03 | `invoice.voided` tercatat dengan `void_reason` di `after_data` | Positive | §8 |
| AU-04 | `evidence.uploaded` tercatat per versi baru | Positive | §8 |
| AU-05 | `evidence.version_superseded` tercatat saat current version berpindah | Positive | §8 |
| AU-06 | `evidence.verified` / `evidence.rejected` tercatat dengan verifier + timestamp | Positive | §8 |
| AU-07 | `access_audit_events` tetap append-only untuk tindakan Gate 4A (update/delete pada event ditolak oleh trigger existing) | Regression | §8 |
| AU-08 | Jika akses dokumen diimplementasikan lewat server-authorized endpoint, `evidence.accessed` tercatat; jika hanya signed-URL murni, dicatat sebagai limitation eksplisit (bukan test FAIL) | Conditional | §8, §11 keputusan 5 |

---

## 7. Ringkasan Coverage per Invariant Utama

| Invariant kontrak | Positive | Rejection | Authorization | Tenant-isolation | Idempotency | Concurrency |
|---|---|---|---|---|---|---|
| Binding hanya dari transaksi `closed` (F1) | B-01 | B-02 | — | — | — | — |
| Cross-tenant binding ditolak (F2) | — | B-03 | — | B-03 | — | — |
| Duplicate active billing ditolak (F3) | B-05 | B-04 | — | — | — | B-08 |
| Binding/nominal terkunci setelah `issued` (F4) | — | L-03, L-04 | — | — | — | — |
| Overwrite object ditolak (F5) | E-02 | E-03 | — | — | — | — |
| Hash/metadata invalid ditolak (F6) | — | E-04 | — | — | — | — |
| Upload tanpa izin ditolak (F7) | — | E-05 | E-05 | — | — | — |
| Verify tanpa izin ditolak (F8) | — | V-04 | V-04 | — | — | — |
| Cross-tenant file access ditolak (F9) | — | A-03 | — | A-03 | — | — |
| Concurrent invoice issuance aman (F10) | — | — | — | — | — | L-08 |
| Concurrent version upload deterministik (F11) | — | — | — | — | — | E-09 |
| Retry tidak duplikat (F12) | — | — | — | — | B-07, L-09, E-10 | — |
| Versi lama tetap dapat diaudit (F13) | E-07 | — | — | — | — | — |
| Signed URL tidak membuat bucket public (F14) | — | A-04, A-05 | — | — | — | — |

Setiap baris di atas memiliki minimal satu kolom terisi; sel kosong berarti kategori tersebut tidak relevan secara langsung untuk invariant itu (mis. F10/F11 murni concurrency, bukan authorization).

---

## 8. Explicitly Out of Scope (mengikuti kontrak §10)

Matrix ini **tidak** mencakup skenario untuk: invoice renderer/export, perhitungan billing (tax/diskon), OCR/AI extraction, notification/WhatsApp delivery, ringkasan biaya per periode, atau UI detail — seluruhnya out of scope Gate 4A dan akan mendapat test matrix terpisah pada gate yang relevan (Phase 2 Billing Intelligence / Cash Collection Intelligence).
