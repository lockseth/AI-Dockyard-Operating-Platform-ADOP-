# CLAUDE.md — ADOP

Aturan kerja mandiri untuk Claude Code pada repository **AI Dockyard Operating Platform (ADOP)**. Dokumen ini harus cukup untuk akun baru; jangan mengandalkan chat/account lama.

## 1. Bootstrap Akun Baru

Pada task pertama:

1. Baca `CLAUDE.md` ini sekali.
2. Baca bagian `README.md` dan `PRD.md` yang relevan dengan task.
3. Jalankan `rg --files` dan pencarian symbol/route/test yang dituju.
4. Verifikasi stack, package manager, scripts, env example, schema, migration, dan pola code aktual. Jangan menebak teknologi.
5. Cek working tree; perubahan existing milik user dan tidak boleh ditimpa.
6. Kerjakan hanya task yang diminta.

Jika repository baru hanya berisi dokumen, jangan memilih stack atau membuat scaffold besar tanpa instruksi eksplisit.

## 2. Communication dan Authority

- Komunikasi dan laporan: Bahasa Indonesia.
- Code, identifiers, schema, API, dan filenames: English.
- Commit message mengikuti konvensi repo setelah diperiksa.
- Founder/Product Owner memegang keputusan scope dan product lock.
- Coding agent tidak boleh mengubah lock, roadmap, atau arsitektur lintas modul tanpa approval eksplisit.
- Open discovery bukan requirement; jangan mengarang jawaban.
- Konflik material harus dilaporkan sebelum implementasi destruktif.

## 3. Source of Truth

Prioritas tertinggi ke terendah:

1. Instruksi/LOCK terbaru dari Founder/Product Owner.
2. `PRD.md`.
3. `README.md`.
4. Architecture/security/module docs yang relevan.
5. Existing code, schema, migrations, dan tests.
6. Interview/discovery notes.

Jangan membuat dokumen duplikat untuk requirement yang sudah memiliki source of truth.

## 4. Product Locks

### Identity

- Product: **AI Dockyard Operating Platform (ADOP)**.
- Design partner: **PT Gamatara**.
- Primary user: **Pak Hanafi — Owner**.
- Principle: **Trust Before Intelligence**.
- Core object: **Project Kapal**.
- Platform modular, Excel-friendly, dan API-friendly; bukan ERP monolitik.

### Roadmap

1. AI Cost Control
2. Billing Intelligence
3. AI Cash Collection Intelligence
4. Dock Operation Intelligence
5. Executive Intelligence
6. Predictive Intelligence

Jangan membangun fase berikutnya kecuali task menyebutkannya.

### Pilot Scope

Founding Design Partner pilot hanya:

- import Excel/XLSX, CSV, dan PDF lama (Universal Import);
- shared daily cash pool;
- expense/cost per Project Kapal;
- duplicate-input detection;
- project active/ready-to-close/closed;
- owner dashboard;
- Morning Daily Expense Brief;
- simple read-only WhatsApp Business Copilot.

Billing, collection, bank API, dan automasi fase lanjut bukan pilot default.

### Operating Rules

- Satu shared daily cash pool untuk seluruh kapal; jangan membuat wallet per kapal.
- Formula: `opening + top_up + other_cash_in - cash_out = closing`.
- Setiap expense wajib memiliki project/vessel allocation.
- `Vessel`, `Project`, `service_type`, `facility_location`, dan `reporting_period` adalah konsep terpisah.
- Service type awal: Emergency, Standard, Docking, PLTU.
- Daftar Gate/Dock/Pelabuhan/PLTU fisik masih configurable/open discovery.
- Lifecycle: `active → ready_to_close → closed`.
- Owner atau admin berizin dapat close; closed project menolak expense baru.
- Koreksi financial memakai append-only adjustment/reversal.
- Candidate duplicate tetap terlihat dan selalu membutuhkan human review.
- Morning Brief merangkum hari sebelumnya; schedule final configurable.
- Setelah onboarding, direct UI input adalah jalur operasional harian utama; Excel bukan aplikasi harian utama.

### Cross-Phase Locks

- Phase 2 billing: close project → export XLSX → Word manual → wet signature/stamp → signed PDF → due date → send.
- Closed project tanpa invoice memunculkan Unbilled Vessel Alert.
- Owner menerima invoice-delivery notification.
- Invoice dikirim via WhatsApp+email; status per kanal `queued→sent→delivered→read/open→failed/bounced`; simpan recipient/channel/invoice version/document hash/provider message ID/timestamp sebagai append-only delivery event.
- Acknowledgement wajib eksplisit (tombol/link terverifikasi atau balasan); read/open **bukan** acknowledgement. Customer dapat Ajukan Koreksi/Dispute.
- Provider WhatsApp/email tetap OPEN/UNCONFIGURED — jangan implementasi provider-specific code/env kecuali task menyebutkannya.
- Phase 3 payment verification boleh dari transfer proof atau bank check; proof opsional, audit fields wajib.
- Reminder Phase 3 mengikuti state delivery/acknowledgement (belum delivered/unread/unacknowledged/acknowledged/disputed = tindakan beda); disputed → stop reminder + human review; read/open = risk signal saja, bukan bukti approval; paid hanya setelah payment matching+verification.
- Cash Collection: invoice tracking, reminders, partial payment, aging, matching bank API/CSV, risk score, executive brief.

## 5. Token-Efficient Workflow

Default loop:

`Search → Read → Inspect → Implement → Test → Report`

### Context Budget

- Search dulu dengan `rg`/`rg --files`; jangan browse folder satu per satu.
- Mulai maksimal **10 file relevan**.
- Baca range/symbol spesifik, bukan seluruh file besar.
- Urutan ekspansi: target file → module → referenced dependency/doc → related module → repo luas hanya jika perlu.
- Abaikan markdown, sales, roadmap, dan module yang tidak terkait task.
- Jangan membaca ulang file yang konteksnya masih tersedia.

### Stop Loading

Berhenti menambah context ketika requirement, entry point, dependency, pola existing, dan test target sudah jelas.

### Small-Diff Rule

- Satu task = satu vertical slice terkecil yang menutup acceptance criteria.
- Reuse pattern existing.
- Jangan speculative refactor, abstraction, dependency, atau dokumen tambahan.
- Jangan print file penuh jika diff/ringkasan cukup.
- Jangan membuat walkthrough panjang kecuali diminta.

## 6. Domain dan Data Model

Project Kapal secara bertahap menghubungkan:

`Progress | Cash/Cost | Material | Labor | Invoice | Receivable | Profit | Timeline`

Phase 1 tidak boleh memalsukan data modul fase lanjut.

Data minimum Phase 1:

- tenant/company, user, role, verified channel identity;
- vessel, customer, project, project lifecycle/timeline;
- service type dan facility/location;
- daily cash session dan funding event;
- cost transaction/lines dan project allocation;
- category/material/vendor;
- evidence, review decision, ledger adjustment;
- risk flag, notification, audit event;
- import source, mapping, staging row, result, provenance, reconciliation;
- WhatsApp session, query, and safe audit record.

Semua record bisnis tenant-scoped dan menggunakan timestamp/timezone eksplisit.

### Evidence dari File Kas

`LAPORAN HARIAN KAS.xlsx` memiliki kolom `TANGGAL`, `KETERANGAN`, `NAMA KAPAL`, `DEBET`, `KREDIT`, `SALDO`. Temuan desain:

- satu shared cash report;
- label Vessel bercampur suffix bulan/lokasi;
- `Kas` dan `Lain-lain` bukan Vessel canonical;
- ada candidate duplicate;
- source balance tidak selalu formula-driven.

Import harus menjaga raw provenance, mempreview normalisasi, dan menghitung canonical reconciliation. Jangan hardcode nilai snapshot file ke business rule.

## 7. Universal Import Rules

- Template opsional; direct upload harus tersedia tanpa download gate.
- Support awal: `.xlsx`, `.csv`, dan PDF (extraction/OCR + confidence + human review, tidak langsung trusted).
- Reject/convert safely: `.xls`, `.xlsm`, `.xlsb`.
- Jangan eksekusi formula atau macro.
- Satu canonical engine: parser/extractor → domain adapter → staging → mapping → validation → duplicate detection → dry-run/preview → reconciliation → human review → commit → audit/rollback.
- Upload tidak boleh langsung menulis canonical table.
- Simpan fingerprint/source key, uploader, mapping version, raw row reference, provenance, status, per-row outcome, serta source file asli + hash.
- Import job/retry/resume wajib idempotent.
- Partial success harus eksplisit dan menyediakan error report.
- Jangan silent-overwrite submitted/approved transaction atau ledger.
- `imported_unverified` tidak boleh dibaca AI sebagai trusted data.
- Normalisasi label gabungan wajib dipreview dan dikonfirmasi.
- Reconcile source opening/debit/credit/closing; tampilkan variance.
- Import tidak memicu alert/KPI/workflow/AI decision sebelum batch commit tervalidasi.
- Import personel tidak membuat akun/role otomatis; aktivasi tetap lewat security workflow terpisah.

UI lock:

```text
Unduh Template (Opsional)
Gunakan template jika data Anda belum memiliki format yang rapi. Jika sudah mempunyai file Excel/CSV dari sistem lama, langsung lanjutkan ke upload.
```

`Lanjut ke Upload` tetap aktif tanpa template download.

## 8. WhatsApp Copilot Rules

Greeting sekali pada awal sesi lokal:

`Selamat {pagi|siang|sore|malam}, Pak Hanafi.`

Pipeline wajib:

1. verify webhook/signature;
2. deduplicate event;
3. resolve verified channel identity;
4. authorize tenant/user/role/capability;
5. open/detect session dan send greeting bila baru;
6. classify allowlisted intent;
7. run tenant-scoped read-only tool/query;
8. validate structured result;
9. format period + freshness/completeness;
10. write safe audit/conversation event.

Guardrails:

- MVP read-only; no write/approve/reject/delete/pay.
- Jangan beri LLM free-form SQL atau direct database credentials.
- Nominal dihitung server-side, bukan oleh model.
- Unknown identity tidak mendapat data bisnis.
- Data tidak cukup → katakan tidak cukup.
- Gunakan `risk indication`, bukan tuduhan fraud.
- Retry tidak boleh menggandakan response atau greeting.
- Core system tetap bekerja saat AI provider gagal.

## 9. Integrity dan Security

- Tenant isolation dan least privilege; RLS atau kontrol setara.
- Secret, token, nomor produksi, credential, dan service-account file tidak masuk source control.
- Jangan membaca/menampilkan isi `.env` pada laporan.
- Financial amount memakai integer minor unit atau safe decimal, bukan float.
- Ledger/audit append-only untuk user biasa.
- Simpan actor, timestamp, reason, dan before/after reference.
- Webhook, import, transaction creation, notification, dan background job idempotent.
- Aggregate dashboard dapat ditelusuri dan direkonsiliasi ke source transactions.
- Verify file type/content/size/row limit; treat upload/OCR/note sebagai untrusted input.
- Redact sensitive data dari log dan prompt.
- Rate-limit public endpoint; fail closed pada auth/signature failure.
- Backup/restore database dan evidence harus dapat diuji.

## 10. Implementation Rules

- Pertahankan stack, package manager, architecture, naming, dan patterns existing setelah inspeksi.
- Strict typing; hindari `any` tanpa alasan.
- Domain calculation deterministic dan testable.
- Pisahkan domain logic dari UI, route, provider, transport, dan LLM.
- Provider/integration memakai adapter; core workflow tidak bergantung pada satu AI vendor.
- Jangan menambah dependency atau mengubah lockfile tanpa kebutuhan task.
- Cari schema/migration existing sebelum membuat baru.
- Migration additive/reversible bila realistis; jangan drop/rename data tanpa explicit approval dan migration plan.
- Critical invariants diberi database constraint/policy bila tepat, bukan hanya UI validation.

## 11. Test Gate

Pilih test yang relevan; minimal untuk perubahan kritis:

- domain calculation dan cash reconciliation;
- authorization/RLS/tenant isolation;
- immutable ledger/audit/reversal;
- import mapping, preview, validation, idempotency, partial failure, provenance, untrusted-data isolation;
- direct upload tanpa template;
- combined vessel-label normalization preview;
- project close permission dan post-close rejection;
- duplicate visibility/no auto-delete;
- Morning Brief previous-day/timezone boundary;
- webhook signature/deduplication;
- WhatsApp greeting once/session, verified vs unknown identity, grounded/incomplete/unsupported response;
- AI-provider failure fallback;
- regression test untuk bug.

Jangan klaim PASS bila test tidak dijalankan. Gunakan `NOT RUN` atau `BLOCKED` dengan alasan.

## 12. Local Checkpoint dan Git

Workflow delivery:

`Implement locally → automated test → local demo/human review → checkpoint PASS → commit/push/deploy jika diperintahkan`

- Jangan commit, push, deploy, menjalankan cloud migration, mengirim message, atau mengubah external system tanpa instruksi eksplisit.
- Jangan menyentuh unrelated user changes.
- Jangan gunakan destructive Git commands.
- Jangan mengubah generated/lock files kecuali memang diperlukan.
- Jika test membutuhkan service/credential yang tidak tersedia, berhenti pada local-safe boundary dan laporkan blocker.

## 13. Completion Report

Gunakan maksimal format berikut:

```text
RESULT: PASS | PASS WITH LIMITATION | BLOCKED
CHANGED: <file/module utama>
TESTED: <command + hasil ringkas | NOT RUN>
SECURITY/DATA: <relevan saja>
NEXT: <hanya jika ada blocker/keputusan>
```

Jangan mengulang requirement atau seluruh diff di laporan akhir.