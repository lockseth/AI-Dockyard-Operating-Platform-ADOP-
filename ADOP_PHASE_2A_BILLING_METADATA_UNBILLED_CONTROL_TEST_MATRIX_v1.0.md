# ADOP — Phase 2A Test Matrix: Billing Metadata & Unbilled Control v1.0

**Phase/Gate label:** Phase 2A — Billing Metadata & Unbilled Control Contract Freeze (lihat `ADOP_PHASE_2A_BILLING_METADATA_UNBILLED_CONTROL_CONTRACT_v1.0.md` §1.2 untuk catatan penamaan gate).
**Sifat dokumen:** Documentation-only. Test pada matrix ini **belum diimplementasikan** — daftar ini adalah target wajib untuk gate implementasi berikutnya (migration/RPC/read-model/UI), disusun agar setiap invariant di kontrak Phase 2A (termasuk Amendment 1) memiliki coverage yang jelas sebelum implementasi dimulai. Format dan struktur mengikuti preseden `ADOP_GATE_4A_TEST_MATRIX_v1.0.md`.
**Status dokumen:** Baseline v1.0, **Amendment 1** — menambahkan skenario untuk kardinalitas invoice, registrasi nomor manual, immutable coverage snapshot, verifikasi PDF-ke-Billing-Record, registrasi invoice legacy, dan penomoran void/pengganti. Nama file tetap `v1.0`; lihat `ADOP_PHASE_2A_BILLING_METADATA_UNBILLED_CONTROL_CONTRACT_v1.0.md` §0 untuk Amendment Log lengkap.

**Konvensi file test — mengikuti pola existing repo:**

- Database-level (pgTAP): `supabase/tests/database/<nama_domain>.test.sql`, pola sama seperti `invoice_evidence_binding.test.sql`, `invoice_evidence_read_model.test.sql`, `client_billing_profile_and_pic_roles.test.sql`.
- Integration-level: `tests/integration/<nama-domain>.integration.test.ts`, pola sama seperti `invoice-evidence.integration.test.ts`.
- Unit-level (domain logic murni, seperti `billing-readiness.test.ts`): `src/lib/<module>/<nama>.test.ts`.

Nama file target diusulkan: `supabase/tests/database/invoice_billing_metadata.test.sql`, `supabase/tests/database/invoice_cardinality.test.sql`, `supabase/tests/database/invoice_legacy_registration.test.sql`, `supabase/tests/database/unbilled_vessel_alert.test.sql`, `tests/integration/invoice-billing-metadata.integration.test.ts`, dan `src/lib/invoice-evidence/billing-completeness.test.ts`. Nama final ditentukan saat gate implementasi.

Setiap baris mereferensikan bagian kontrak (`§`) di `ADOP_PHASE_2A_BILLING_METADATA_UNBILLED_CONTROL_CONTRACT_v1.0.md` (numbering Amendment 1).

---

## 1. Happy Path

| ID | Skenario | Kategori | Referensi kontrak |
|---|---|---|---|
| H-01 | Admin membuat Billing Record untuk satu `project_id`, mengisi kelima field metadata (`legal_entity_id`, `invoice_number`, `invoice_date`, `due_date`; `client_id` otomatis terturunkan), mengikat ≥1 transaksi dari project yang sama, lalu `issue_invoice` berhasil dan mengunci seluruh metadata + snapshot cakupan | Positive | §5, §6.1, §8, §10.1, §10.2 |
| H-02 | Billing Record yang seluruh metadatanya lengkap dan punya ≥1 baris cakupan menghasilkan status completeness `DRAFT_READY_TO_ISSUE` pada read model | Positive | §11 |
| H-03 | Billing Record `issued` dengan evidence current version `verified` (lulus checklist §14.2) dan metadata lengkap menghasilkan status `READY_TO_SEND` | Positive | §11, §14 |
| H-04 | Project `closed` yang seluruh transaksinya sudah terikat Billing Record `draft` (belum `issued`) **tidak** muncul di Unbilled Vessel Alert | Positive | §13.1, §13.2 |
| H-05 | Project `closed` dengan biaya yang belum terikat Billing Record manapun muncul di Unbilled Vessel Alert dengan `unbilled_transaction_count`/`unbilled_amount_total` yang benar | Positive | §13.1, §13.3 |

## 2. Invoice Cardinality — Satu Invoice, Satu Pihak, Satu Project

| ID | Skenario | Kategori | Referensi kontrak |
|---|---|---|---|
| K-01 | Billing Record dengan tepat satu tenant, satu legal entity, satu customer/client, dan satu Project Kapal berhasil dibuat dan diterbitkan (kontrol positif) | Positive | §5 |
| K-02 | Percobaan membuat Billing Record yang mencakup transaksi dari dua customer/client berbeda ditolak — dalam desain final, ini secara struktural tidak mungkin terjadi karena `client_id` diturunkan otomatis dari satu `project_id` (§5.1); test memverifikasi bahwa **tidak ada jalur** (API/RPC apa pun) yang bisa menghasilkan kondisi ini | Rejection | §5 |
| K-03 | Percobaan membuat Billing Record dengan dua `legal_entity_id` berbeda ditolak — `legal_entity_id` adalah kolom tunggal pada `invoices`, sehingga percobaan "mengubah" `legal_entity_id` menjadi nilai kedua sebelum `issued` menggantikan (bukan menambah) nilai pertama; test memverifikasi tidak ada mekanisme yang menghasilkan dua legal entity aktif bersamaan pada satu Billing Record | Rejection | §5, §6.1 |
| K-04 | Percobaan mengikat transaksi dari Project Kapal kedua ke Billing Record yang `project_id`-nya sudah terkunci ke Project Kapal pertama ditolak oleh `bind_invoice_transaction` | Rejection | §5, §8.2 |
| K-05 | Transaksi dari project berbeda (bukan project yang terkunci pada Billing Record) ditolak saat `bind_invoice_transaction`, dengan pesan error eksplisit menyebutkan ketidaksesuaian project | Rejection | §8.2, §22 |
| K-06 | `create_draft_invoice` tanpa `project_id` eksplisit ditolak — kardinalitas tidak boleh diisi belakangan/opsional untuk Billing Record native | Rejection | §5.1 |

## 3. Transaction Coverage Selection

| ID | Skenario | Kategori | Referensi kontrak |
|---|---|---|---|
| CV-01 | Billing Record dengan cakupan transaksi kosong ditolak saat `issue_invoice` (tidak dapat mencapai `DRAFT_READY_TO_ISSUE`/`issued`) | Rejection | §8.2, §11, §22 |
| CV-02 | Transaksi yang sudah dicakup Billing Record aktif (`draft`/`issued`) lain ditolak saat dicoba di-bind ke Billing Record kedua | Rejection | §8.2, §9.1 |
| CV-03 | Dua request konkuren mengikat transaksi yang sama ke dua Billing Record `draft` berbeda — tepat satu berhasil, yang lain ditolak deterministik (lihat juga C-03) | Concurrency | §9.1, Gate 4A F3/F10 |
| CV-04 | Idempotent retry pengikatan transaksi yang sama (network retry) tidak menghasilkan baris cakupan duplikat (lihat juga I-01) | Idempotency | §20, Gate 4A F12 |
| CV-05 | Perubahan cakupan (tambah/lepas transaksi) pada Billing Record `draft` menghasilkan audit event before/after yang benar (lihat juga G-01) | Positive | §8.2, §19 |

## 4. Issued Transaction Coverage Snapshot — Immutability

| ID | Skenario | Kategori | Referensi kontrak |
|---|---|---|---|
| SNAP-01 | Percobaan mengubah/menghapus baris `invoice_transaction_lines` (snapshot) pada Billing Record yang sudah `issued` ditolak | Rejection | §8.3, §8.4, Gate 4A F4 |
| SNAP-02 | Perubahan pada transaksi sumber (`project_cost_ledger_entries`, mis. adjustment/reversal) setelah Billing Record `issued` tidak mengubah nilai snapshot (`amount`, `description`, `transaction_date`, kategori) yang sudah terbentuk pada `invoice_transaction_lines` | Regression | §8.4 |
| SNAP-03 | Snapshot cakupan yang terbentuk saat `issued` menyertakan seluruh field minimum kontrak (transaction ID, project ID, customer identity, legal entity identity, transaction date, tipe/kategori, description, amount, total coverage, snapshot timestamp) | Positive | §8.3 |

## 5. Manual Invoice Number Registration

| ID | Skenario | Kategori | Referensi kontrak |
|---|---|---|---|
| REG-01 | Upload signed PDF (evidence version) ditolak jika `invoice_number` Billing Record masih kosong | Rejection | §7.1, §22 |
| REG-02 | `invoice_number` tidak dapat diisi otomatis dari nama file upload atau hasil OCR — hanya menerima input teks eksplisit sebelum upload | Rejection/Regression | §7.3, §14.4 |
| REG-03 | `invoice_number` tidak dapat diedit in-place setelah Billing Record `issued` atau setelah evidence current version `verified` — koreksi hanya lewat void + Billing Record baru | Rejection | §7.5, §16 |

## 6. Duplicate Invoice Number Dalam Legal Entity yang Sama

| ID | Skenario | Kategori | Referensi kontrak |
|---|---|---|---|
| N-01 | Dua Billing Record pada `legal_entity_id` yang sama diberi `invoice_number` identik → insert/update kedua ditolak oleh constraint | Rejection | §6.2 |
| N-02 | Constraint N-01 berlaku lintas status (`draft` vs `issued` vs `void` dengan nomor terisi) — **termasuk** nomor yang sudah dipakai invoice yang sekarang `void` (tidak dikecualikan) | Rejection | §6.2 |
| N-03 | Dua request konkuren memberi `invoice_number` identik pada legal entity yang sama → hanya satu yang berhasil, yang lain ditolak deterministik | Concurrency | §6.2, §20 |

## 7. Nomor Sama Pada Legal Entity Berbeda

| ID | Skenario | Kategori | Referensi kontrak |
|---|---|---|---|
| N-04 | Dua Billing Record dengan `invoice_number` identik tetapi `legal_entity_id` berbeda (tenant sama) → keduanya berhasil disimpan tanpa konflik | Positive | §6.2 |
| N-05 | Dua Billing Record dengan `invoice_number` identik pada tenant berbeda → keduanya berhasil, tidak ada leak validasi lintas tenant | Positive/Tenant-isolation | §6.2, §18 |

## 8. Invalid Invoice Date / Due Date

| ID | Skenario | Kategori | Referensi kontrak |
|---|---|---|---|
| V-01 | `due_date < invoice_date` ditolak saat disimpan atau saat `issue_invoice` | Rejection | §10.2 |
| V-02 | `due_date = invoice_date` (termin nol hari) diterima sebagai kasus valid | Positive | §10.2 |
| V-03 | `invoice_date` boleh mendahului `created_at`/`issued_at` invoice — tidak ditolak selama Open Decision §23 #1/terkait belum membatasi ini | Positive | §10.2 (OPEN) |

## 9. PDF-to-Billing-Record Reconciliation — Mismatch

| ID | Skenario | Kategori | Referensi kontrak |
|---|---|---|---|
| PV-01 | PDF final dengan nomor invoice yang tidak sama dengan `invoice_number` Billing Record → evidence version di-`reject` dengan `rejected_reason` menyebut mismatch nomor; status tidak pernah mencapai `READY_TO_SEND` | Rejection | §14.2, §14.5 |
| PV-02 | PDF final dengan nama/identitas customer yang tidak sama dengan `client_id` Billing Record → `rejected`, tidak `READY_TO_SEND` | Rejection | §14.2, §14.5 |
| PV-03 | PDF final dengan identitas legal entity penerbit yang tidak sama dengan `legal_entity_id` Billing Record → `rejected`, tidak `READY_TO_SEND` | Rejection | §14.2, §14.5 |
| PV-04 | PDF final yang merujuk Project Kapal berbeda dari `project_id` Billing Record → `rejected`, tidak `READY_TO_SEND` | Rejection | §14.2, §14.5 |
| PV-05 | PDF final dengan total nominal yang tidak sama dengan total coverage snapshot (§8.3) → `rejected`, tidak `READY_TO_SEND` | Rejection | §14.2, §14.5 |
| PV-06 | PDF final dengan `invoice_date` tercetak yang tidak sama dengan metadata → `rejected`, tidak `READY_TO_SEND` | Rejection | §14.2, §14.5 |
| PV-07 | PDF final dengan `due_date` tercetak yang tidak sama dengan metadata (jika due date memang tercetak pada dokumen) → `rejected`, tidak `READY_TO_SEND`; jika due date **tidak tercetak** pada dokumen, item ini dilewati dan tidak menghalangi `verified` | Rejection/Positive | §14.2 |
| PV-08 | PDF final yang current, sudah `verified`, dan cocok penuh dengan seluruh field checklist §14.2 → Billing Record eligible mencapai `READY_TO_SEND` (bersama syarat metadata/cakupan lain) | Positive | §14.3, §11 |
| PV-09 | Hasil OCR/AI extraction yang salah baca (mis. salah mengenali nomor invoice pada PDF) tidak pernah mengubah `invoice_number`/metadata canonical Billing Record manapun — OCR hanya boleh menjadi anotasi bantu, tidak menulis ke tabel metadata | Regression | §14.4 |

## 10. Evidence & Signed Document — Lifecycle Umum

| ID | Skenario | Kategori | Referensi kontrak |
|---|---|---|---|
| E-01 | Billing Record `issued` tanpa evidence version apa pun → status completeness `ISSUED_EVIDENCE_PENDING`, bukan `READY_TO_SEND` | Positive | §11 |
| E-02 | Billing Record `issued` dengan current evidence version berstatus `pending` → `ISSUED_EVIDENCE_PENDING` | Positive | §11 |
| E-03 | Billing Record `issued` dengan current evidence version berstatus `rejected` (termasuk karena mismatch, §14.5) → `ISSUED_EVIDENCE_PENDING`, bukan `READY_TO_SEND` | Positive | §11, §14.5 |
| E-04 | Billing Record `issued` dengan evidence version `verified` tetapi **bukan** current version (sudah digantikan versi baru yang `pending`) → tetap `ISSUED_EVIDENCE_PENDING` | Positive/Regression | §11, Gate 4A §5 |
| E-05 | `READY_TO_SEND` hanya tercapai saat current version **dan** verified **dan** metadata+cakupan lengkap secara bersamaan — uji kombinasi salah satu syarat hilang | Rejection | §11, §14.3 |

## 11. Legacy Manual Invoice Registration

| ID | Skenario | Kategori | Referensi kontrak |
|---|---|---|---|
| LG-01 | Registrasi invoice lama mempertahankan `invoice_number` asli apa adanya — sistem tidak pernah membuat/menawarkan nomor pengganti | Positive | §15.1 |
| LG-02 | Registrasi invoice lama dengan `due_date`/total/cakupan yang tidak diketahui menyimpan field tersebut sebagai kosong/`NULL` dan ditandai eksplisit "tidak diketahui" pada UI, bukan direkayasa | Positive | §15.3, §15.4 |
| LG-03 | Registrasi invoice lama dengan `invoice_number` yang sudah dipakai Billing Record lain (native atau legacy) dalam legal entity yang sama ditolak oleh constraint uniqueness yang sama — tidak ada canonical record duplikat yang terbentuk | Rejection | §15.1, §15.6, §6.2 |
| LG-04 | Registrasi invoice lama yang cakupan transaksinya tidak dapat direkonstruksi disimpan dengan `legacy_coverage_status = 'unknown'` dan **tanpa** baris `invoice_transaction_lines` fiktif — tidak ada hubungan transaksi palsu yang dibuat | Positive/Regression | §15.7 |
| LG-05 | Registrasi invoice lama otomatis mendapat status completeness `LEGACY_RECORDED`, bukan `READY_TO_SEND`, meskipun seluruh field yang tersedia lengkap | Positive | §11, §15.5 |
| LG-06 | Registrasi invoice lama dengan `project_id` yang belum ada sebagai `vessel_projects` di ADOP ditolak oleh FK — registrasi terblokir sampai project diimpor lebih dulu | Rejection | §15.9 |
| LG-07 | Audit event `invoice.legacy_registered` tercatat dengan `imported_by`/`imported_at` yang benar, terpisah dari `invoice_date` historis | Positive | §19 |

## 12. Invoice Void

| ID | Skenario | Kategori | Referensi kontrak |
|---|---|---|---|
| O-01 | Billing Record `void` tidak pernah menghasilkan status completeness `READY_TO_SEND`/`DRAFT_READY_TO_ISSUE` apa pun — selalu terklasifikasi `VOID` | Positive | §11 |
| O-02 | Metadata pada Billing Record yang di-`void` tetap terbaca apa adanya (tidak dihapus) untuk keperluan audit/histori | Positive | §16.2, §19, §25 |
| O-03 | Project yang seluruh Billing Record-nya `void` tanpa reissue aktif **kembali** muncul di Unbilled Vessel Alert (perilaku FROZEN, bukan lagi OPEN) | Positive | §13.1 |
| O-04 | Project dengan Billing Record `void` yang sudah memiliki reissue aktif (`issued`/`draft` baru via `predecessor_invoice_id`) **tidak** muncul di alert | Positive | §13.1 |

## 13. Void & Replacement Numbering

| ID | Skenario | Kategori | Referensi kontrak |
|---|---|---|---|
| VR-01 | `invoice_number` yang sudah dipakai Billing Record yang kini `void` tidak dapat digunakan ulang oleh Billing Record lain manapun (native maupun legacy) dalam legal entity yang sama | Rejection | §6.2, §16.1 |
| VR-02 | Billing Record pengganti (reissue) wajib memakai `invoice_number` **baru** (berbeda dari yang di-void-kan) dan menyimpan `predecessor_invoice_id` yang eksplisit menunjuk ke Billing Record yang di-void | Positive | §16.1, §16.4 |
| VR-03 | Void mempertahankan seluruh histori snapshot cakupan (`invoice_transaction_lines`) dan evidence (`invoice_evidence_versions`) milik Billing Record yang di-void — tidak dihapus, tetap dapat diaudit | Positive | §16.2, §16.3 |
| VR-04 | Billing Record pengganti menjalani ulang seluruh alur (registrasi nomor, pemilihan cakupan, upload PDF, verifikasi) — tidak ada langkah yang diwariskan otomatis dari predecessor | Positive/Regression | §16.4 |
| VR-05 | Void tidak menghapus jejak nomor dari daftar/riwayat invoice — nomor yang di-void-kan tetap terlihat dengan status `void`, bukan disembunyikan | Positive | §16.5 |

## 14. Tenant Isolation

| ID | Skenario | Kategori | Referensi kontrak |
|---|---|---|---|
| T-01 | Actor tenant A tidak dapat membaca/mengubah metadata invoice tenant B | Tenant-isolation | §18 |
| T-02 | `project_id`/`client_id`/`legal_entity_id` pada invoice tidak dapat menunjuk ke resource milik tenant lain (composite FK menolak structurally) | Tenant-isolation | §18 |
| T-03 | Unbilled Vessel Alert tenant A tidak menampilkan project milik tenant B | Tenant-isolation | §13.4, §18 |
| T-04 | Read model billing completeness (view + wrapper function) tidak bisa diakses lintas tenant meski `p_tenant_id` dipalsukan | Tenant-isolation | §12, §18 |
| T-05 | Registrasi legacy invoice tidak dapat mereferensikan `project_id` dari tenant lain | Tenant-isolation | §15.9, §18 |

## 15. Unauthorized Role

| ID | Skenario | Kategori | Referensi kontrak |
|---|---|---|---|
| R-01 | Role `reviewer`/`viewer` mencoba mengubah metadata/kardinalitas Billing Record `draft` → ditolak | Authorization | §17 |
| R-02 | Role `reviewer`/`viewer` mencoba membaca billing completeness status → ditolak | Authorization | §17 |
| R-03 | Role `reviewer`/`viewer` mencoba membaca Unbilled Vessel Alert → ditolak | Authorization | §13.4, §17 |
| R-04 | Role `reviewer`/`viewer` mencoba meregistrasi invoice legacy atau memverifikasi PDF → ditolak | Authorization | §17 |
| R-05 | Role `owner`/`admin` berhasil pada seluruh operasi R-01–R-04 (kontrol positif) | Positive | §17 |

## 16. Audit Before/After

| ID | Skenario | Kategori | Referensi kontrak |
|---|---|---|---|
| G-01 | Perubahan salah satu field metadata pada Billing Record `draft` menghasilkan audit event `invoice.metadata_updated` dengan `before_data`/`after_data` yang benar | Positive | §19 |
| G-02 | Audit event metadata mencatat `actor_user_id` dan `created_at` yang benar | Positive | §19 |
| G-03 | Penguncian metadata pada saat `issue_invoice` tercermin di audit trail | Positive | §19 |
| G-04 | Registrasi nomor invoice menghasilkan audit event `invoice.number_registered` yang terpisah dari `invoice.metadata_updated` | Positive | §19 |
| G-05 | Penguncian `project_id`/`client_id` saat pembuatan Billing Record menghasilkan audit event `invoice.project_locked` | Positive | §19 |

## 17. Idempotent Retry

| ID | Skenario | Kategori | Referensi kontrak |
|---|---|---|---|
| I-01 | Retry request update metadata yang identik (network retry) tidak menghasilkan efek bisnis ganda | Idempotency | §20 |
| I-02 | Retry `issue_invoice` setelah sukses pertama tidak menggandakan lock metadata atau audit event ganda yang menyesatkan | Idempotency | §20, Gate 4A F12 |
| I-03 | Retry registrasi legacy invoice dengan data sumber identik tidak menggandakan Billing Record | Idempotency | §15.8, §20 |

## 18. Concurrent Mutation

| ID | Skenario | Kategori | Referensi kontrak |
|---|---|---|---|
| C-01 | Dua admin mengubah metadata Billing Record `draft` yang sama secara bersamaan dengan nilai berbeda → hasil akhir deterministik | Concurrency | §20 |
| C-02 | Admin mengubah metadata bersamaan dengan admin lain memanggil `issue_invoice` pada Billing Record yang sama → salah satu operasi menang secara deterministik, tidak ada invoice `issued` dengan metadata "setengah baru setengah lama" | Concurrency | §10.1, §20 |
| C-03 | Dua request bind transaksi terakhir sebuah project ke dua Billing Record `draft` berbeda secara konkuren → hanya satu berhasil, dan hasil Unbilled Vessel Alert konsisten dengan pemenang race tersebut | Concurrency/Regression | §13.7, Gate 4A F3/F10 |

## 19. Existing Issued Snapshot dan Cost Ledger Tidak Berubah

| ID | Skenario | Kategori | Referensi kontrak |
|---|---|---|---|
| P-01 | Penambahan kolom metadata §6.1 tidak mengubah nilai `invoice_transaction_lines.amount`/`description` snapshot yang sudah ada pada Billing Record `issued` sebelumnya | Regression | §21, §25 |
| P-02 | `project_cost_ledger_entries` tidak pernah diupdate/dihapus oleh migrasi atau RPC Phase 2A manapun (termasuk oleh alur registrasi legacy) | Regression | §21, §15.8 |
| P-03 | Billing Record `issued` sebelum gate implementasi Phase 2A berjalan (metadata kosong) tetap dapat dibaca dan tidak ditolak oleh constraint baru | Regression | §25 |

## 20. Unbilled Alert Muncul dan Hilang Secara Deterministic

| ID | Skenario | Kategori | Referensi kontrak |
|---|---|---|---|
| W-01 | Alert muncul tepat pada query pertama setelah project `closed` dan ada biaya belum terikat | Positive | §13.2 |
| W-02 | Alert hilang tepat pada query pertama setelah baris terakhir yang belum terikat berhasil di-bind ke Billing Record `draft`/`issued` non-void | Positive | §13.2 |
| W-03 | Menambahkan biaya baru pada project `closed` yang sebelumnya sudah fully-billed tidak secara keliru menyembunyikan biaya baru tersebut dari alert jika biaya baru itu belum terikat Billing Record manapun | Regression | §13.1, §13.2 |
| W-04 | Alert **muncul kembali** tepat pada query pertama setelah satu-satunya Billing Record aktif sebuah project menjadi `void` tanpa pengganti aktif (lihat juga O-03) | Positive | §13.1, §13.2 |

## 21. Empty/Loading/Error UI Contract

| ID | Skenario | Kategori | Referensi kontrak |
|---|---|---|---|
| X-01 | Tidak ada project unbilled → UI menampilkan pesan positif eksplisit | Positive | §13.5 |
| X-02 | State loading tidak pernah menampilkan angka `0`/daftar kosong sebagai nilai sementara | Positive | §13.5 |
| X-03 | Query alert gagal → UI menampilkan error state eksplisit, bukan fallback ke "tidak ada unbilled" | Rejection/Failure | §13.5, §22 |
| X-04 | Kegagalan query Unbilled Vessel Alert tidak memblokir rendering bagian lain dari invoice list/detail page | Regression | §22 |
| X-05 | Legacy invoice dengan `legacy_coverage_status = 'unknown'`/`'partial'` ditampilkan berbeda secara visual dari Billing Record native yang lengkap — tidak menyamarkan exception sebagai data lengkap | Positive | §15.7, §26 |

## 22. Backfill Data Lama

| ID | Skenario | Kategori | Referensi kontrak |
|---|---|---|---|
| B-01 | Migrasi kolom metadata baru berjalan bersih di atas data invoice existing tanpa error, seluruh kolom baru `null` pada baris lama | Positive | §25 |
| B-02 | Tidak ada proses backfill otomatis yang mengisi nilai tebakan pada invoice native lama — kolom tetap kosong apa adanya | Regression | §25 |
| B-03 | Invoice native lama dengan metadata kosong tetap muncul di daftar invoice/read model, ditandai jelas sebagai "metadata belum lengkap" tanpa disembunyikan | Positive | §25, §13.5 |

## 23. Regression Gate 4B/4C

| ID | Skenario | Kategori | Referensi kontrak |
|---|---|---|---|
| RG-01 | Seluruh skenario `ADOP_GATE_4A_TEST_MATRIX_v1.0.md` §1–§7 tetap PASS setelah perubahan Phase 2A (termasuk Amendment 1) diterapkan | Regression | Gate 4A/4B/4C, §21 |
| RG-02 | `invoice_eligible_transactions` dan `transaction_invoice_bindings` (Gate 4C) menghasilkan output identik sebelum dan sesudah perubahan Phase 2A untuk data yang sama, di luar penambahan filter `project_id` opsional yang sudah didukung | Regression | §21 |
| RG-03 | `list_invoices`/`get_invoice_summary` (Gate 4C) tetap berfungsi untuk konsumen yang belum menggunakan kolom metadata baru | Regression | §21 |
| RG-04 | Export cost recap XLSX (`cost-recap.ts`, commit `01dcd5e`) tetap menghasilkan output identik untuk invoice yang sudah ada, tidak terpengaruh penambahan kolom metadata/kardinalitas | Regression | §21 |
| RG-05 | Cost ledger immutable dan seluruh invoice snapshot yang sudah `issued` sebelum Amendment 1 berjalan tetap tidak berubah nilainya setelah gate implementasi Amendment 1 diterapkan | Regression | §21, §25 |

---

**Catatan implementasi:** Skenario yang bergantung pada Open Decision yang masih terbuka (§23 kontrak: format nomor, legal entity `inactive`, definisi PIC, grace period alert) belum dapat difinalkan sebagai assertion pasti pada bagian tersebut — test harus ditulis mengikuti keputusan final Pak Hanafi/legal saat diberikan, bukan asumsi penulis matrix ini. Seluruh skenario lain di dokumen ini sudah FROZEN dan dapat diimplementasikan langsung tanpa menunggu keputusan tambahan.
