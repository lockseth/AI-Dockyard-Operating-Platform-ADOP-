# ADOP — Phase 2A Test Matrix: Billing Metadata & Unbilled Control v1.0

**Phase/Gate label:** Phase 2A — Billing Metadata & Unbilled Control Contract Freeze (lihat `ADOP_PHASE_2A_BILLING_METADATA_UNBILLED_CONTROL_CONTRACT_v1.0.md` §1.2 untuk catatan penamaan gate).
**Sifat dokumen:** Documentation-only. Test pada matrix ini **belum diimplementasikan** — daftar ini adalah target wajib untuk gate implementasi berikutnya (migration/RPC/read-model/UI), disusun agar setiap invariant di kontrak Phase 2A memiliki coverage yang jelas sebelum implementasi dimulai. Format dan struktur mengikuti preseden `ADOP_GATE_4A_TEST_MATRIX_v1.0.md`.

**Konvensi file test — mengikuti pola existing repo:**

- Database-level (pgTAP): `supabase/tests/database/<nama_domain>.test.sql`, pola sama seperti `invoice_evidence_binding.test.sql`, `invoice_evidence_read_model.test.sql`, `client_billing_profile_and_pic_roles.test.sql`.
- Integration-level: `tests/integration/<nama-domain>.integration.test.ts`, pola sama seperti `invoice-evidence.integration.test.ts`.
- Unit-level (domain logic murni, seperti `billing-readiness.test.ts`): `src/lib/<module>/<nama>.test.ts`.

Nama file target diusulkan: `supabase/tests/database/invoice_billing_metadata.test.sql`, `supabase/tests/database/unbilled_vessel_alert.test.sql`, `tests/integration/invoice-billing-metadata.integration.test.ts`, dan `src/lib/invoice-evidence/billing-completeness.test.ts`. Nama final ditentukan saat gate implementasi.

Setiap baris mereferensikan bagian kontrak (`§`) di `ADOP_PHASE_2A_BILLING_METADATA_UNBILLED_CONTROL_CONTRACT_v1.0.md`.

---

## 1. Happy Path

| ID | Skenario | Kategori | Referensi kontrak |
|---|---|---|---|
| H-01 | Admin mengisi kelima field metadata (`legal_entity_id`, `client_id`, `invoice_number`, `invoice_date`, `due_date`) pada invoice `draft`, lalu `issue_invoice` berhasil dan mengunci seluruh metadata | Positive | §5.1, §6.1, §6.2 |
| H-02 | Invoice yang seluruh metadatanya lengkap dan punya ≥1 baris binding menghasilkan status completeness `DRAFT_READY_TO_ISSUE` pada read model | Positive | §7 |
| H-03 | Invoice `issued` dengan evidence current version `verified` dan metadata lengkap menghasilkan status `READY_TO_SEND` | Positive | §7, §11 |
| H-04 | Project `closed` yang seluruh transaksinya sudah terikat invoice `draft` (belum `issued`) **tidak** muncul di Unbilled Vessel Alert | Positive | §9.1, §9.2 |
| H-05 | Project `closed` dengan biaya yang belum terikat invoice manapun muncul di Unbilled Vessel Alert dengan `unbilled_transaction_count`/`unbilled_amount_total` yang benar | Positive | §9.1, §9.3 |

## 2. Project Closed Tanpa Invoice

| ID | Skenario | Kategori | Referensi kontrak |
|---|---|---|---|
| U-01 | Project baru saja bertransisi ke `closed` dan belum ada invoice apa pun → langsung muncul di Unbilled Vessel Alert pada query berikutnya (tanpa delay/batch) | Positive | §9.2 |
| U-02 | Project `active`/`ready_to_close` dengan biaya besar **tidak** muncul di alert meskipun belum ditagih (belum closed) | Rejection/Negative | §9.1 |
| U-03 | Project `closed` tanpa baris `project_cost_ledger_entries` billable sama sekali (mis. project ditutup tanpa biaya) **tidak** muncul di alert (tidak ada yang perlu ditagih) | Negative | §9.1 |

## 3. Invoice Draft/Incomplete

| ID | Skenario | Kategori | Referensi kontrak |
|---|---|---|---|
| D-01 | Invoice `draft` tanpa baris binding sama sekali → status completeness `DRAFT_INCOMPLETE` | Positive | §7 |
| D-02 | Invoice `draft` dengan binding tapi salah satu dari lima field metadata masih kosong → status completeness `DRAFT_INCOMPLETE` | Positive | §7 |
| D-03 | Admin mengubah metadata pada invoice `draft` berkali-kali → setiap perubahan tersimpan dan tidak ada penguncian dini sebelum `issue_invoice` dipanggil | Positive | §6.1 |

## 4. Missing Invoice Number / Date / Due Date / Customer / Legal Entity

| ID | Skenario | Kategori | Referensi kontrak |
|---|---|---|---|
| M-01 | `issue_invoice` ditolak jika `invoice_number` kosong | Rejection | §6.2, §15 |
| M-02 | `issue_invoice` ditolak jika `invoice_date` kosong | Rejection | §6.2 |
| M-03 | `issue_invoice` ditolak jika `due_date` kosong | Rejection | §6.2 |
| M-04 | `issue_invoice` ditolak jika `client_id` kosong | Rejection | §5.1 |
| M-05 | `issue_invoice` ditolak jika `legal_entity_id` kosong | Rejection | §5.1 |
| M-06 | Pesan error pada M-01–M-05 menyebutkan field yang kurang secara spesifik, bukan pesan generik | Positive | §15 |

## 5. Duplicate Invoice Number Dalam Legal Entity yang Sama

| ID | Skenario | Kategori | Referensi kontrak |
|---|---|---|---|
| N-01 | Dua invoice pada `legal_entity_id` yang sama diberi `invoice_number` identik → insert/update kedua ditolak oleh constraint | Rejection | §5.2 |
| N-02 | Constraint N-01 berlaku lintas status (`draft` vs `issued` vs `void` dengan nomor terisi) — bukan hanya invoice aktif | Rejection | §5.2 |
| N-03 | Dua request konkuren memberi `invoice_number` identik pada legal entity yang sama → hanya satu yang berhasil, yang lain ditolak deterministik | Concurrency | §5.2, §13 |

## 6. Nomor Sama Pada Legal Entity Berbeda (Jika Diizinkan Kontrak)

| ID | Skenario | Kategori | Referensi kontrak |
|---|---|---|---|
| N-04 | Dua invoice dengan `invoice_number` identik tetapi `legal_entity_id` berbeda (tenant sama) → keduanya berhasil disimpan tanpa konflik | Positive | §5.2 |
| N-05 | Dua invoice dengan `invoice_number` identik pada tenant berbeda (dan legal entity berbeda karena tenant terpisah) → keduanya berhasil, tidak ada leak validasi lintas tenant | Positive/Tenant-isolation | §5.2, §11 |

## 7. Invalid Invoice Date / Due Date

| ID | Skenario | Kategori | Referensi kontrak |
|---|---|---|---|
| V-01 | `due_date < invoice_date` ditolak saat disimpan atau saat `issue_invoice` (tergantung desain final constraint) | Rejection | §6.2 |
| V-02 | `due_date = invoice_date` (termin nol hari) diterima sebagai kasus valid | Positive | §6.2 |
| V-03 | `invoice_date` boleh mendahului `created_at`/`issued_at` invoice (tanggal dokumen fisik lebih awal dari tanggal input sistem) — tidak ditolak selama Open Decision §16 belum membatasi ini | Positive | §6.2 (OPEN) |

## 8. Signed PDF Tidak Ada, Bukan Current, atau Belum Verified

| ID | Skenario | Kategori | Referensi kontrak |
|---|---|---|---|
| E-01 | Invoice `issued` tanpa evidence version apa pun → status completeness `ISSUED_EVIDENCE_PENDING`, bukan `READY_TO_SEND` | Positive | §7 |
| E-02 | Invoice `issued` dengan current evidence version berstatus `pending` → `ISSUED_EVIDENCE_PENDING` | Positive | §7 |
| E-03 | Invoice `issued` dengan current evidence version berstatus `rejected` → `ISSUED_EVIDENCE_PENDING`, bukan `READY_TO_SEND` | Positive | §7 |
| E-04 | Invoice `issued` dengan evidence version `verified` tetapi **bukan** current version (sudah digantikan versi baru yang `pending`) → tetap `ISSUED_EVIDENCE_PENDING` (mengikuti `is_final_document` Gate 4C yang hanya true untuk current+verified) | Positive/Regression | §7, Gate 4A §5 |
| E-05 | `READY_TO_SEND` hanya tercapai saat current version **dan** verified **dan** metadata lengkap secara bersamaan — uji kombinasi salah satu syarat hilang | Rejection | §11 |

## 9. Invoice Void

| ID | Skenario | Kategori | Referensi kontrak |
|---|---|---|---|
| O-01 | Invoice `void` tidak pernah menghasilkan status completeness `READY_TO_SEND`/`DRAFT_READY_TO_ISSUE` apa pun — selalu terklasifikasi `VOID` terlepas dari kelengkapan metadata sebelumnya | Positive | §7 |
| O-02 | Metadata pada invoice yang di-`void` tetap terbaca apa adanya (tidak dihapus) untuk keperluan audit/histori | Positive | §12, §18 |
| O-03 | Project yang seluruh invoicenya `void` tanpa reissue aktif kembali muncul di Unbilled Vessel Alert | Positive | §9.1 kondisi #3 (OPEN — lihat catatan) |
| O-04 | Project dengan invoice `void` yang sudah memiliki reissue aktif (`issued`/`draft` baru via `predecessor_invoice_id`) **tidak** muncul di alert | Positive | §9.1 |

## 10. Tenant Isolation

| ID | Skenario | Kategori | Referensi kontrak |
|---|---|---|---|
| T-01 | Actor tenant A tidak dapat membaca/mengubah metadata invoice tenant B | Tenant-isolation | §11 |
| T-02 | `legal_entity_id`/`client_id` pada invoice tidak dapat menunjuk ke legal entity/client milik tenant lain (composite FK menolak structurally) | Tenant-isolation | §11 |
| T-03 | Unbilled Vessel Alert tenant A tidak menampilkan project milik tenant B | Tenant-isolation | §9.4, §11 |
| T-04 | Read model billing completeness (view + wrapper function) tidak bisa diakses lintas tenant meski `p_tenant_id` dipalsukan — wrapper mem-verifikasi role pada tenant yang diminta | Tenant-isolation | §8, §11 |

## 11. Unauthorized Role

| ID | Skenario | Kategori | Referensi kontrak |
|---|---|---|---|
| R-01 | Role `reviewer`/`viewer` mencoba mengubah metadata invoice `draft` → ditolak | Authorization | §10 |
| R-02 | Role `reviewer`/`viewer` mencoba membaca billing completeness status → ditolak | Authorization | §10 |
| R-03 | Role `reviewer`/`viewer` mencoba membaca Unbilled Vessel Alert → ditolak | Authorization | §9.4, §10 |
| R-04 | Role `owner`/`admin` berhasil pada seluruh operasi R-01–R-03 (kontrol positif memastikan test tidak salah-negatif) | Positive | §10 |

## 12. Audit Before/After

| ID | Skenario | Kategori | Referensi kontrak |
|---|---|---|---|
| G-01 | Perubahan salah satu field metadata pada invoice `draft` menghasilkan audit event `invoice.metadata_updated` dengan `before_data`/`after_data` yang benar | Positive | §12 |
| G-02 | Audit event metadata mencatat `actor_user_id` dan `created_at` yang benar (bukan `null`/salah tenant) | Positive | §12 |
| G-03 | Penguncian metadata pada saat `issue_invoice` tercermin di audit trail (baik lewat `invoice.issued` yang sudah ada maupun action baru) — dapat direkonstruksi bahwa metadata final sesuai snapshot saat issued | Positive | §12 |

## 13. Idempotent Retry

| ID | Skenario | Kategori | Referensi kontrak |
|---|---|---|---|
| I-01 | Retry request update metadata yang identik (network retry) tidak menghasilkan efek bisnis ganda (state akhir tetap sama) | Idempotency | §13 |
| I-02 | Retry `issue_invoice` setelah sukses pertama tidak menggandakan lock metadata atau audit event ganda yang menyesatkan (mengikuti pola idempotency Gate 4A F12) | Idempotency | §13, Gate 4A F12 |

## 14. Concurrent Mutation

| ID | Skenario | Kategori | Referensi kontrak |
|---|---|---|---|
| C-01 | Dua admin mengubah metadata invoice `draft` yang sama secara bersamaan dengan nilai berbeda → hasil akhir deterministik (last-write-wins pada row lock, bukan korupsi data campuran) | Concurrency | §13 |
| C-02 | Admin mengubah metadata bersamaan dengan admin lain memanggil `issue_invoice` pada invoice yang sama → salah satu operasi menang secara deterministik (row lock `for update` mengikuti pola `issue_invoice`/`void_invoice` existing), tidak ada invoice `issued` dengan metadata yang "setengah baru setengah lama" | Concurrency | §6.1, §13 |
| C-03 | Dua request bind transaksi terakhir sebuah project ke dua invoice `draft` berbeda secara konkuren → hanya satu berhasil (F3/F10 Gate 4A, sudah ada), dan hasil Unbilled Vessel Alert konsisten dengan pemenang race tersebut (tidak menampilkan state antara) | Concurrency/Regression | §9.7, Gate 4A F3/F10 |

## 15. Existing Issued Snapshot dan Cost Ledger Tidak Berubah

| ID | Skenario | Kategori | Referensi kontrak |
|---|---|---|---|
| P-01 | Penambahan kolom metadata §5.1 tidak mengubah nilai `invoice_transaction_lines.amount`/`description` snapshot yang sudah ada pada invoice `issued` sebelumnya | Regression | §14, §18 |
| P-02 | `project_cost_ledger_entries` tidak pernah diupdate/dihapus oleh migrasi atau RPC Phase 2A manapun | Regression | §14 |
| P-03 | Invoice `issued` sebelum gate implementasi Phase 2A berjalan (metadata kosong) tetap dapat dibaca dan tidak ditolak oleh constraint baru (constraint hanya berlaku pada transisi status baru, bukan retroaktif) | Regression | §18 |

## 16. Unbilled Alert Muncul dan Hilang Secara Deterministic

| ID | Skenario | Kategori | Referensi kontrak |
|---|---|---|---|
| W-01 | Alert muncul tepat pada query pertama setelah project `closed` dan ada biaya belum terikat — tidak ada delay/batch job yang tertunda | Positive | §9.2 |
| W-02 | Alert hilang tepat pada query pertama setelah baris terakhir yang belum terikat berhasil di-bind ke invoice `draft`/`issued` — tidak menunggu `issue_invoice` atau evidence verified | Positive | §9.2 |
| W-03 | Menambahkan biaya baru (adjustment/reversal) pada project `closed` yang sebelumnya sudah fully-billed tidak secara keliru menyembunyikan biaya baru tersebut dari alert jika biaya baru itu belum terikat invoice manapun | Regression | §9.1, §9.2 |

## 17. Empty/Loading/Error UI Contract

| ID | Skenario | Kategori | Referensi kontrak |
|---|---|---|---|
| X-01 | Tidak ada project unbilled → UI menampilkan pesan positif eksplisit, bukan halaman kosong tanpa konteks | Positive | §9.5 |
| X-02 | State loading tidak pernah menampilkan angka `0`/daftar kosong sebagai nilai sementara yang bisa disalahartikan sebagai "tidak ada unbilled" | Positive | §9.5 |
| X-03 | Query alert gagal (mis. timeout/error server) → UI menampilkan error state eksplisit, bukan fallback ke "tidak ada unbilled" | Rejection/Failure | §9.5, §15 |
| X-04 | Kegagalan query Unbilled Vessel Alert tidak memblokir rendering bagian lain dari invoice list/detail page | Regression | §15 |

## 18. Backfill Data Lama

| ID | Skenario | Kategori | Referensi kontrak |
|---|---|---|---|
| B-01 | Migrasi kolom metadata baru berjalan bersih di atas data invoice existing (`draft`/`issued`/`void`) tanpa error, seluruh kolom baru `null` pada baris lama | Positive | §18 |
| B-02 | Tidak ada proses backfill otomatis yang mengisi nilai tebakan (mis. `invoice_date = created_at`) pada invoice lama — kolom tetap kosong apa adanya | Regression | §18 |
| B-03 | Invoice lama dengan metadata kosong tetap muncul di daftar invoice/read model, ditandai jelas sebagai "metadata belum lengkap" tanpa disembunyikan | Positive | §18, §9.5 |

## 19. Regression Gate 4B/4C

| ID | Skenario | Kategori | Referensi kontrak |
|---|---|---|---|
| RG-01 | Seluruh skenario `ADOP_GATE_4A_TEST_MATRIX_v1.0.md` §1–§7 (Invoice Binding, Lifecycle, Evidence Versioning, Document Verification, Private Access, Audit Trail) tetap PASS setelah perubahan Phase 2A diterapkan | Regression | Gate 4A/4B/4C, §14 |
| RG-02 | `invoice_eligible_transactions` dan `transaction_invoice_bindings` (Gate 4C) menghasilkan output identik sebelum dan sesudah perubahan Phase 2A untuk data yang sama | Regression | §14 |
| RG-03 | `list_invoices`/`get_invoice_summary` (Gate 4C) tetap berfungsi untuk konsumen yang belum menggunakan kolom metadata baru (backward compatible, kolom lama tidak berubah semantik) | Regression | §14 |
| RG-04 | Export cost recap XLSX (`cost-recap.ts`, commit `01dcd5e`) tetap menghasilkan output identik untuk invoice yang sudah ada, tidak terpengaruh penambahan kolom metadata | Regression | §14 |

---

**Catatan implementasi:** Skenario bertanda "(OPEN — lihat catatan)" (mis. O-03) bergantung pada keputusan Open Decision di kontrak §16 sebelum dapat difinalkan sebagai assertion pasti — test harus ditulis mengikuti keputusan final Pak Hanafi/legal, bukan asumsi penulis matrix ini.
