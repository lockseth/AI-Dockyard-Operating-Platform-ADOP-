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
- Design partner: **PT PELAYARAN GEMA BAHARI**.
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
- Lifecycle: `draft (khusus kandidat project dari import) → active → ready_to_close → closed`. Draft hanya dibuat oleh approval import (Gate 6I-A) berstatus "Perlu Dilengkapi"; project manual tetap langsung `active`.
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

**Status Gate 1A (terimplementasi):** trusted master data — `clients`, `client_contacts`, `vessels`, `vendors`, `service_types`, `facility_locations`, `expense_categories`, dan append-only `master_data_audit_events` — sudah ada di `supabase/migrations/20260719080000_master_data.sql` dengan RLS/role matrix, composite tenant-safe FK, dan direct UI di `/app/master-data/*`. Project lifecycle, cost transaction/ledger, evidence, review/approval, import, dan WhatsApp session **belum** dibuat — lihat `PRD.md` §7.2 untuk detail status per domain.

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

**Status Gate 6J-A (dibekukan final, documentation-only):** kontrak **GEMA Assistant** — pola 3-persona CHAMELONIX Role-Aware Business Messaging (A. Owner: business intelligence + Morning Brief + help; B. Admin: product help only pada pilot ini; C. External Client verified/unverified: verified dapat notifikasi invoice + secure link + explicit acknowledgment, unverified hanya FAQ publik + human handoff) — sudah dibekukan final di `ADOP_GATE_6J_A_AI_HELP_EXECUTIVE_ASSISTANT_CONTRACT_v1.0.md`. Reviewer/viewer tanpa akses assistant sama sekali. Identity Owner/Admin (`assistant_channel_identities`) dan Client (`client_contacts` + kolom verifikasi baru) dipisah tegas; pairing/verifikasi memakai challenge code single-use TTL 10 menit via `PAIR <code>`/`VERIFY <code>`. Satu-satunya write capability di seluruh sistem adalah invoice acknowledgment oleh client verified (§5); semua lainnya read-only. Sandbox demo Jumat 2026-07-31 memakai device Hendro (Gate 1L, migrasi ke device PT-controlled ditunda, bukan dibatalkan); produksi wajib device PT PELAYARAN GEMA BAHARI-controlled; nomor Founder tidak pernah di-hardcode; Fonnte bukan Meta Official WhatsApp Business API. Morning Brief default 07:00 WIB, satu komposer canonical untuk scheduled maupun interaktif. **Belum diimplementasikan** apa pun di atas — migration, endpoint, komposer, dan provider semua menunggu gate implementasi berikutnya (§17/§20 dokumen tersebut). Jangan berasumsi runtime assistant sudah aktif.

**Status Gate 6J-A1 (korektif, documentation-only):** §22 dokumen yang sama mengunci **Anomaly Alert Routing Contract** — satu canonical anomaly source (mesin `expense-duplicate-detection` existing, tidak ada mesin kedua), severity matrix EXACT/SUSPECTED/CRITICAL, routing realtime (Admin selalu; Owner via WA hanya untuk CRITICAL) dan Morning Brief (unresolved list + rekap resolved), dan escalation state `detected → under_review → resolved/false_positive`. Client tidak pernah menerima alert anomali internal. Belum ada implementasi apa pun (migration/RPC/endpoint/realtime infra) pada gate ini.

**Status Gate 6J-B (Identity & Pairing Schema Foundation) — IMPLEMENTED:** `supabase/migrations/20260729030000_assistant_identity_pairing.sql` menambahkan tabel `assistant_channel_identities` (Owner/Admin WhatsApp pairing, status `pending/verified/revoked`) dan kolom verifikasi `client_contacts.whatsapp_verification_*` (`unverified/pending/verified/revoked`), dengan RLS + SECURITY DEFINER RPC (`assistant_issue_pairing_challenge`, `assistant_complete_pairing`, `assistant_revoke_pairing`, `assistant_issue_client_verification_challenge`, `assistant_complete_client_verification`, `assistant_reset_client_verification`) dan `src/lib/assistant-identity/*`. Challenge code TTL 10 menit, hanya digest sha256 tersimpan, lockout setelah 5 percobaan salah, `assistant_complete_*` service-role-only. Masih **schema/RPC foundation saja** — tidak ada webhook inbound, endpoint `/api/internal/assistant/*`, UI pairing, AI, atau pengiriman WhatsApp (tetap gate berikutnya, §17/§20 kontrak).

**Status Gate 6J-B1 (Cloud Privilege Corrective) — IMPLEMENTED:** verifikasi cloud Gate 6J-B menemukan default privilege project (grant langsung ke `anon`/`authenticated` saat object dibuat, tidak tersentuh oleh `revoke ... from public`) membuat kedua RPC `assistant_complete_*` (seharusnya service-role-only), keempat RPC browser-session, dan tabel `assistant_channel_identities` (termasuk kolom `challenge_digest`) dapat diakses `anon`/`authenticated` di luar intent. `supabase/migrations/20260729040000_assistant_identity_privilege_hardening.sql` melakukan revoke/grant eksplisit by-name (bukan `from public`) untuk seluruh object tersebut; `client_contacts.whatsapp_verification_digest` sudah benar sejak awal, tidak diubah. Default privilege schema-wide **tidak** diubah pada corrective ini (termasuk exposure serupa pada `claim_next_notification_event`/`complete_notification_event` dan standing `anon` pada `client_contacts` di luar kolom digest) — backlog security audit terpisah, di luar scope Gate 6J-B/6J-B1.

**Status Gate 6J-C (Inbound WhatsApp Gateway & PAIR/VERIFY Command Handler) — IMPLEMENTED, LOCAL ONLY:** `supabase/migrations/20260730000000_assistant_inbound_gateway.sql` menambahkan tabel `assistant_inbound_events` (idempotency claim per `provider`+`provider_message_id`, RPC-only, zero grant langsung termasuk ke `service_role`) dan RPC `claim_inbound_assistant_event`/`record_inbound_assistant_event_result`/`count_recent_inbound_assistant_events` (rate-limit per address+channel+intent) serta `assistant_complete_client_verification_by_address` — penutup gap Gate 6J-B: resolve VERIFY lintas tenant murni dari channel+nomor+kode (tanpa tenant_id dari sender), fail-closed `ambiguous` bila lebih dari satu kandidat cocok, `invalid_or_expired` bila nol (mirip pola `assistant_complete_pairing` yang sudah tanpa tenant_id). Endpoint `POST /api/internal/assistant/inbound` (`src/app/api/internal/assistant/inbound/route.ts`) dan modul `src/lib/assistant-inbound/*` (parser tertutup `PAIR <code>`/`VERIFY <code>` only, HMAC signature layer di atas `x-internal-secret` — env `INTERNAL_ASSISTANT_INBOUND_SIGNING_SECRET`, safe-reply allowlist, handler orchestrator). Canonical n8n workflow `n8n/workflows/gema-assistant-inbound-pair-verify.json` dibuat **inactive**, belum pernah diimpor/dijalankan di hosted n8n. Tidak ada AI/LLM, Public FAQ, Morning Brief, invoice, atau anomaly alert pada gate ini. **Belum diverifikasi**: field webhook Fonnte asli (asumsi nama field `sender`/`message`/`id`, lihat `n8n/workflows/README.md`) dan ketersediaan Node `crypto` builtin pada Code node hosted n8n untuk HMAC signing — keduanya deployment-time blocker, bukan kelemahan desain (endpoint tetap fail-closed bila signature tidak feasible). Tidak ada cloud migration/deploy/import n8n hosted/Fonnte call pada gate ini.

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
- Authorization pakai `getClaims()`/`getUser()`, bukan `getSession()` atau `user_metadata`; proxy/middleware hanya optimistic redirect, bukan satu-satunya gate — data-access layer + RLS tetap final enforcement.
- Tenant aktif adalah pointer (mis. cookie httpOnly), bukan bukti akses; selalu divalidasi ulang ke membership sebelum dipercaya.
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