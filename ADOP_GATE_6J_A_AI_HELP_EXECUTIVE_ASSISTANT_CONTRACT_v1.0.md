# ADOP — Gate 6J-A Contract: GEMA Assistant (Role-Aware Business Messaging) v1.0

**Produk:** AI Dockyard Operating Platform (ADOP)
**Design partner:** PT PELAYARAN GEMA BAHARI
**Primary user:** Pak Hanafi — Owner
**Gate:** 6J-A — AI Assistant Contract Freeze (3-persona)
**Nama assistant (ADOP instance):** **GEMA Assistant**
**Sifat Gate:** Audit + documentation-only. **Tidak ada implementasi** (migration, RPC, RLS, n8n workflow baru, endpoint, service/repository, provider integration, atau test) pada Gate 6J-A.
**Status dokumen:** Baseline v1.0, **Revisi 3 (final)** — Founder telah mengambil keputusan atas seluruh open item identity/pairing, client verification, sender, capability matrix, dan Morning Brief schedule yang dicatat di Revisi 2. Revisi ini mengunci keputusan tersebut sebagai LOCK; item yang tersisa di §20 murni menunggu implementasi (gate berikutnya), bukan menunggu keputusan lagi.

**Addendum — Gate 6J-A1 (korektif, documentation-only):** §22 menambahkan **Anomaly Alert Routing Contract** — LOCK satu canonical anomaly source (mesin expense duplicate detection existing) untuk realtime alert dan Morning Brief, severity matrix (EXACT/SUSPECTED/CRITICAL), dan routing per persona. Tidak mengubah keputusan Revisi 3 di atas; tidak ada implementasi runtime baru pada addendum ini.

---

## 1. Ruang Lingkup

Gate 6J-A membekukan kontrak untuk **GEMA Assistant** — sistem AI messaging read-first berjalan di atas channel WhatsApp (`PRD.md` §7.11, `CLAUDE.md` §8) dengan **tiga persona tegas**, masing-masing dengan capability, tool registry, dan trust boundary berbeda:

- **A. Executive/Owner Assistant** — Owner bertanya data bisnis tenant real-time (Morning Brief, posisi kas, status project, biaya tertinggi, unbilled, invoice delivery/acknowledgement, owner attention items), plus panduan penggunaan ADOP dan secure dashboard deep link.
- **B. Internal Operator/Admin Assistant** — Admin bertanya panduan penggunaan ADOP saja (product help) untuk pilot saat ini. Kemampuan operasional (mis. query data operasional, aksi apa pun) **tidak** termasuk pilot ini dan wajib eksplisit + capability-gated bila ditambahkan di masa depan (bukan default-on).
- **C. External Client Assistant** — kontak eksternal (PIC customer), **dipecah dua tingkat kepercayaan**: **verified** (menerima notifikasi invoice/dokumen, secure link, dan boleh memberi acknowledgment eksplisit) dan **unverified** (hanya FAQ publik + human handoff, **tidak** ada data invoice apa pun). Persona ini **tidak pernah** mendapat akses dashboard, biaya internal, kas, margin, overhead, data client lain, atau tanya-jawab bebas atas data tenant, terlepas dari status verifikasi.

Gate ini **tidak** mengaktifkan runtime apa pun. `n8n/workflows/owner-control-whatsapp-notification.json` (Gate 1L, outbound-only, sender = nomor pribadi Hendro) tetap **inactive/unpublished** dan **terpisah** dari kontrak GEMA Assistant ini — lihat §13 untuk batas eksplisit antara keduanya. Tidak ada inbound WhatsApp workflow baru yang dibuat pada gate ini.

---

## 2. Pola Reusable — CHAMELONIX Role-Aware Business Messaging

Dokumen ini membekukan **kontrak untuk instance ADOP**, tapi bentuk 3-persona-nya adalah **pola reusable lintas produk CHAMELONIX**, bukan kode/domain yang dibagi:

- **Persona 1 — Executive/Owner:** pemilik bisnis/decision maker; read-only business intelligence + scheduled/interactive brief + product help + secure deep link ke UI internal.
- **Persona 2 — Internal Operator:** staf internal (admin/finance/ops); product help sebagai baseline; kapabilitas operasional tambahan selalu eksplisit dan capability-gated per produk, tidak pernah default-on.
- **Persona 3 — External Client:** pihak eksternal (customer/vendor/PIC), **bertingkat kepercayaan** (verified/unverified); notifikasi terbatas + secure link + acknowledgment eksplisit (verified saja) + FAQ publik + human handoff; **tidak pernah** mendapat akses data internal, data tenant lain, atau tanya-jawab bebas.

**Batas reusability — LOCK:**

- Yang **dibagi** lintas produk CHAMELONIX: bentuk pola (3 persona, tingkat kepercayaan verified/unverified pada persona eksternal, batasan kapabilitas per persona, prinsip trust boundary di §7, prinsip "LLM bukan authorization layer/final data source").
- Yang **tidak dibagi**: kode domain, tabel, RPC, service, endpoint, template pesan, atau data. **Setiap produk CHAMELONIX menyediakan sendiri**: capability matrix persona-nya, identity adapter (bagaimana nomor dipetakan ke identitas produk tersebut), read tools/allowlist-nya, template pesan/FAQ-nya, dan domain authorization-nya sendiri.
- **Tidak ada** package/library/schema bersama yang dibuat pada gate ini atau diusulkan untuk dibuat.
- Dokumen kontrak produk lain (jika dan ketika dibuat) **wajib** memakai istilah persona yang sama untuk konsistensi lintas produk, tapi isi capability matrix-nya spesifik produk masing-masing.

---

## 3. Non-Goals (Gate 6J-A)

- Tidak membuat/mengubah migration, tabel, RPC, RLS, index, atau trigger.
- Tidak membuat n8n workflow baru (inbound webhook, intent router, atau tool-calling node).
- Tidak menambah endpoint `/api/internal/*` baru.
- Tidak memilih/menginstal/memanggil AI provider (LLM) atau vector-store/retrieval provider apa pun.
- Tidak menulis konten knowledge base atau FAQ publik aktual — hanya kontrak bentuk dan proses update-nya.
- Tidak mengaktifkan `owner-control-whatsapp-notification.json`.
- Tidak membangun scheduled Morning Brief engine — jadwal dan prinsip reuse dikunci di §14, implementasi tetap gate berikutnya.
- Tidak mengubah `tenant_role`, `PRD.md` §6 Persona, atau lock lintas-fase pada `CLAUDE.md` §4.
- Tidak mengubah/menambah env value nyata — hanya nama variabel baru (§15) tanpa nilai, dan tidak pernah nilai nomor Founder/demo yang nyata.
- Tidak memutuskan provider WhatsApp produksi final — hanya kontrak bahwa Fonnte **bukan** Meta Official WhatsApp Business API dan produksi wajib device PT-controlled (§13).
- Tidak membuat/mengaktifkan package/library bersama lintas produk CHAMELONIX (§2).
- Tidak melakukan migrasi sender Gate 1L — dikonfirmasi **tidak diperlukan sekarang** (§13).

---

## 4. Existing Foundation yang Diaudit dan Direuse

| Area | File/Migration | Reuse pada Gate 6J-A |
|---|---|---|
| Internal API shared-secret auth | `src/lib/notification-outbox/internal-auth.ts`, `secret.ts` | Pola `x-internal-secret` header + `verifyInternalSecret()` fail-closed direuse untuk boundary n8n→ADOP baru (§7) |
| Internal API route pattern | `src/app/api/internal/notifications/{claim,complete,fail}/route.ts` | Pola "n8n-only, tenant_id tidak pernah diekspos ke n8n" direuse untuk endpoint assistant baru |
| Outbound notification outbox | `supabase/migrations/20260721000000_owner_control_notification_outbox.sql`, `src/lib/notification-outbox/*` | Precedent append-only outbox — pola yang sama diusulkan untuk audit percakapan (§12), dan untuk pengiriman kode pairing/verifikasi (§9) |
| n8n outbound workflow | `n8n/workflows/owner-control-whatsapp-notification.json`, README.md | Precedent sender-vs-recipient Fonnte token model, staged rollout, **precedent "nomor asli tidak pernah di-hardcode/commit, selalu env var di sisi n8n"** — direuse langsung sebagai prinsip untuk nomor Founder demo (§13) |
| Tenant/role resolution | `src/lib/auth/tenant.ts` (`requireTenantContext`, `listActiveMemberships`, `requireTenantRole`) | Model re-validasi identity/role tiap request untuk persona A/B (§9.1) |
| Executive read model | `src/lib/executive-report/service.ts`, `view-model.ts`, `types.ts` | Satu-satunya sumber intent unbilled/attention/invoice-delivery persona A (§10) |
| Cash & project reads | `src/lib/cash-pool/service.ts`, `src/lib/vessel-projects/service.ts` | Sumber intent cash position/project lifecycle/biaya tertinggi persona A, dan komponen baseline Morning Brief (§14) |
| Owner Control dashboard | `src/lib/owner-control/*` | Precedent "Owner-only" gating |
| Generic append-only audit | `supabase/migrations/20260719070115_foundation_tenant_isolation.sql` (`access_audit_events`) | Model kolom untuk audit event assistant baru (§12) |
| Role/capability pattern | `src/lib/user-management/access.ts`, `src/lib/owner-control/access.ts` | Pola `can<Action>(roles)` — direuse untuk capability check persona A/B (§6) |
| Provider-neutral env contract | `.env.example`, `src/lib/env/server.ts` | Precedent OPEN/UNCONFIGURED provider (§15) |
| Redaction helper precedent | `src/lib/demo-owner-bootstrap/redact.ts` | Model redaksi log (§15) |
| Client PIC identity (persona C) | `client_contacts` table (`supabase/migrations/20260719080000_master_data.sql`, kolom `whatsapp_number`, `is_primary`, `client_id`, `status`) | **Candidate identity source**, bukan trusted langsung — wajib lifecycle verified/unverified baru (§9.2) |
| Invoice delivery/acknowledgment (persona C) | `invoice_delivery_events` table (`supabase/migrations/20260727000000_invoice_delivery_acknowledgment.sql`), `src/lib/invoice-delivery/service.ts` (`recordInvoiceAcknowledgmentForActiveTenant`, event type `acknowledged`) | Event type dan konsep acknowledgment direuse langsung (§5, §10); fungsi service existing tetap owner/admin-gated — tidak dipanggil langsung oleh identity eksternal (§20) |

**Tidak ditemukan** pada audit (tetap berlaku, lihat §20 untuk status): modul internal Help-knowledge/FAQ publik, modul Morning Brief scheduled engine, webhook signature/HMAC pattern, rate-limiting utility, kolom nomor telepon pada `auth.users`/`tenant_memberships`, mekanisme secure/signed link invoice client-facing, mekanisme STOP/BERHENTI opt-out, constraint unique pada `client_contacts.whatsapp_number`, dan kolom verifikasi pada `client_contacts`.

---

## 5. Sifat Gate: Read-Only-First dengan Satu Pengecualian Sempit Terkunci

Aturan dasar tetap berlaku untuk **persona A dan B**: tidak ada create/update/delete transaksi, tidak ada approve/reject import, tidak ada perubahan project lifecycle, tidak ada invoice write, tidak ada user/role management, tidak ada aksi otonom. Permintaan aksi mendapat guidance/deep link saja.

**Pengecualian tunggal yang dikunci secara eksplisit — LOCK:** persona **External Client verified** boleh melakukan **tepat satu** tindakan tulis: **explicit acknowledgment atas invoice/dokumen yang dikirim ke dirinya sendiri**, memakai event `acknowledged` yang sudah ada di `invoice_delivery_events`. Batasnya:

1. Hanya event type `acknowledged`, tidak ada event type lain yang bisa ditulis via assistant.
2. Hanya untuk invoice yang memang ditujukan ke PIC/client tersebut, dan **hanya bila identity PIC berstatus `verified`** (§9.2) — client `unverified` **tidak pernah** mendapat kapabilitas ini, terlepas apakah nomornya kebetulan cocok ke suatu invoice.
3. Tidak bisa membuat/mengubah/menghapus invoice, tidak bisa mengubah nominal, tidak bisa "membatalkan" acknowledgment yang sudah tercatat (append-only).
4. Read/open pesan tetap bukan acknowledgment — wajib tindakan eksplisit, sesuai `PRD.md` §7.12 dan `CLAUDE.md` §4.
5. Mekanisme penulisan **tidak** memakai `recordInvoiceAcknowledgmentForActiveTenant` existing secara langsung (owner/admin-gated) — perlu jalur internal baru dengan otorisasi berbasis identity `client_contacts` verified (§20, gap eksplisit, bukan diimplementasikan di sini).

Selain butir ini, **seluruh sistem GEMA Assistant read/notify-only** dari sisi assistant.

---

## 6. Persona & Capability Matrix — LOCK

| Kapabilitas | A. Owner | B. Admin | C. External Client — **verified** | C. External Client — **unverified** | Reviewer/Viewer |
|---|---|---|---|---|---|
| Executive read-only business intelligence | ✅ | ❌ | — | — | ❌ |
| Morning Brief (scheduled 07:00 WIB + on-demand) | ✅ | ❌ | — | — | ❌ |
| Product help ADOP | ✅ | ✅ (scope operasional yang admin sendiri berwenang) | ❌ | ❌ | ❌ |
| Secure dashboard deep link (internal) | ✅ | ❌ (pilot ini) | ❌ | ❌ | ❌ |
| Invoice/document delivery notification (terima) | n/a | n/a | ✅ | ❌ | n/a |
| Secure invoice link (terima, buka) | — | — | ✅ | ❌ | — |
| Explicit acknowledgment invoice | — | — | ✅ (satu-satunya write, §5) | ❌ | — |
| FAQ layanan publik PT PELAYARAN GEMA BAHARI | — | — | ✅ | ✅ | — |
| Human handoff | ✅ | ✅ | ✅ | ✅ (jalur utama) | tidak applicable (tidak ada akses sama sekali) |
| Data operasional tenant (dashboard, cost, cash, margin, overhead) | ✅ (allowlist §10.1) | ❌ | ❌ **tegas** | ❌ **tegas** | ❌ |
| Data client/tenant lain | ❌ (single-tenant) | ❌ | ❌ **tegas** | ❌ **tegas** | ❌ |
| Aksi tulis di luar §5 pengecualian | ❌ | ❌ | ❌ | ❌ | ❌ |

**Reviewer/Viewer — LOCK final:** tidak mendapat akses GEMA Assistant dalam bentuk apa pun pada v1 (bukan hanya "belum termasuk" seperti draft awal — ini keputusan final Founder, perluasan wajib revisi kontrak baru).

Role ADOP internal tetap mengikuti `public.tenant_role`. Persona **A = role owner**, persona **B = role admin**. Persona **C bukan** `tenant_role` — identitasnya dari `client_contacts` dengan lifecycle verifikasi sendiri (§9.2), independen dari sistem role internal.

**Kapabilitas operasional Internal Operator di masa depan** tetap wajib melalui revisi kontrak eksplisit — tidak berubah dari draft sebelumnya.

---

## 7. Routing Contract & Trust Boundaries — LOCK

```
WhatsApp (Owner, Admin, atau External Client PIC — via Fonnte, nomor perusahaan sebagai bot endpoint/sender)
  → n8n ingress (inbound trigger, provider-specific)
  → n8n memanggil ADOP /api/internal/assistant/inbound (shared-secret header, pola internal-auth.ts)
      body: { providerMessageId, fromE164, text, receivedAt }
      — TIDAK PERNAH membawa tenant_id/role/userId/clientId/persona/verifiedStatus
  → ADOP: idempotency check by providerMessageId (§12)
  → ADOP: cek apakah teks adalah `PAIR <code>` (verifikasi Owner/Admin, §9.1) atau
      `VERIFY <code>` (verifikasi Client, §9.2) — bila ya, proses sebagai completion
      challenge, bukan intent biasa, lalu selesai (tidak lanjut ke classifier)
  → ADOP: resolve verified channel identity dari fromE164 — dicoba berurutan, hasil
      paling restriktif yang valid dipilih, kecocokan ganda = ambigu:
      (a) cocok ke assistant_channel_identities aktif → persona A/B
      (b) cocok ke tepat satu client_contacts dengan whatsapp_verification_status='verified'
          DAN status='active' → persona C verified
      (c) cocok ke client_contacts unverified/tidak cocok sama sekali → persona C
          unverified (tetap dilayani FAQ+handoff, bukan "unknown" — lihat §9.3)
      (d) ambigu di (a) atau (b) → fail closed, no data sama sekali, hanya fallback aman
  → ADOP: authorize tenant/persona/capability (re-check setiap request)
  → ADOP: cek STOP/BERHENTI state untuk nomor ini (§7.1)
  → ADOP: session open/detect, greeting sekali (§8)
  → ADOP: deterministic intent classifier per-persona (allowlist berbeda per persona/tier, §10)
  → ADOP: Help/FAQ retrieval (§11) ATAU allowlisted business read tool (§10.1) ATAU
      acknowledgment write path (§5, khusus persona C verified) — tidak pernah bercampur
  → ADOP: response guard (format §12, redaksi, tenant/client-scope check, no cross-client leak)
  → ADOP: tulis audit/outbox event (§12)
  → ADOP mengembalikan teks balasan sudah-jadi ke n8n
  → n8n mengirim balasan lewat Fonnte send API
      — n8n TIDAK PERNAH memanggil endpoint approve/reject/import/create ADOP mana pun,
        TIDAK PERNAH menyusun teks balasan sendiri, TIDAK PERNAH menyimpan data bisnis,
        TIDAK PERNAH tahu persona/tenant/client/verifiedStatus yang sedang dilayani.
```

### 7.1 STOP/BERHENTI Consent Handling — LOCK

Tidak berubah dari Revisi 2: `STOP`/`BERHENTI` kapan saja menghentikan pesan conversational/otomatis (bukan kewajiban delivery non-conversational di kanal lain), wajib human handoff, wajib audit event.

### 7.2 Human Handoff — LOCK

Tidak berubah dari Revisi 2: dipicu oleh intent di luar allowlist, STOP/BERHENTI, dispute, kegagalan AI provider berulang, atau permintaan eksplisit; wajib tercatat sebagai `handoff_triggered`.

### 7.3 Trust boundary inti

1. LLM tidak pernah menjadi authorization layer.
2. LLM tidak pernah menjadi final data source.
3. n8n adalah transport murni — tidak pernah tahu tenant/role/persona/client/verifiedStatus.
4. Nomor/tenant/role/persona/identitas/kode pairing di dalam teks pesan **tidak pernah dipercaya begitu saja** — kode `PAIR`/`VERIFY` divalidasi terhadap row tersimpan (match + belum expired), bukan diterima karena formatnya benar.
5. Endpoint `/api/internal/assistant/*` memakai pola `isAuthorizedInternalRequest` identik `notification-outbox/internal-auth.ts`.

---

## 8. Greeting & Tone per Persona

Tidak berubah dari Revisi 2: persona A/B memakai greeting waktu-lokal sesuai `PRD.md` §7.11 (nama sesuai identity binding, bukan hardcode "Pak Hanafi" untuk non-owner); persona C (verified maupun unverified) memakai salutation formal-bisnis atas nama PT PELAYARAN GEMA BAHARI, wajib identifikasi diri sebagai pesan otomatis, tidak pernah memakai "Pak Hanafi".

---

## 9. Identity & Pairing Lifecycle — LOCK

### 9.1 Persona A/B — Owner/Admin (`assistant_channel_identities`, terpisah dari identitas client)

**Keputusan Founder — LOCK final:**

- Owner/Admin memakai tabel terpisah **`assistant_channel_identities`**, terpisah tegas dari `client_contacts` (tidak pernah satu tabel identity untuk internal dan eksternal — mencegah kebocoran kapabilitas lintas persona lewat data model yang tercampur).
- **Pairing flow:**
  1. User yang **sudah login** ke ADOP web (authenticated session) memulai pairing dari UI, memasukkan nomor WhatsApp miliknya sendiri.
  2. ADOP membuat row `status='pending_verification'`, generate **single-use random challenge code**, simpan `challenge_expires_at = now() + 10 minutes`.
  3. ADOP mengirim kode via WhatsApp ke nomor tsb (memakai jalur outbound yang sama seperti notification outbox, §4).
  4. User membalas **`PAIR <code>`** dari nomor yang didaftarkan.
  5. ADOP mencocokkan `fromE164` == nomor yang tersimpan di row pending **dan** kode cocok **dan** belum `challenge_expires_at` → `status='active'`, `verified_at=now()`, `challenge_code` dikosongkan.
  6. Kode salah/kedaluwarsa/nomor tidak cocok → ditolak eksplisit, **tidak** auto-retry, percobaan dibatasi (rate-limit desain di gate implementasi) dan dicatat audit.
- **Data disimpan:** `channel_address` **normalized E.164** (bukan format bebas).
- **Re-check setiap request:** user aktif, membership aktif, tenant aktif, role, dan capability — bukan hanya sekali saat pairing (pola sama seperti `requireTenantContext()`).
- **Revocable dan audited:** owner/admin dapat mencabut kapan saja; setiap create/verify/revoke tercatat sebagai audit event (§12).
- **Ambiguous active binding fails closed:** jika (secara anomali/race) satu nomor cocok ke >1 `assistant_channel_identities` aktif, atau satu membership punya >1 binding aktif yang saling konflik → **no data**, log security event — tidak pernah pilih salah satu secara diam-diam.
- **Nomor demo Founder tidak pernah di-hardcode** — di kode, config tracked, test fixture, atau dokumen mana pun (§13). Ini berlaku untuk *seluruh* nomor real yang dipakai pairing, bukan hanya nomor demo, tapi ditegaskan khusus untuk nomor Founder karena risiko reputasi/privasi tertinggi.

Skema kolom lengkap ada di Lampiran §21.

### 9.2 Persona C — External Client (`client_contacts`, verified/unverified lifecycle)

**Keputusan Founder — LOCK final:**

- `client_contacts.whatsapp_number` adalah **candidate identity only** — tidak pernah dianggap trusted tanpa langkah verifikasi eksplisit.
- **Lifecycle verifikasi baru (proposal kolom, gate implementasi):** `whatsapp_verification_status enum('unverified','verified')` default `unverified`, `whatsapp_verified_at timestamptz`.
- **Mekanisme verifikasi (proposal):** admin memicu "Verifikasi WhatsApp" dari UI master data untuk contact tsb → ADOP generate single-use challenge code (mekanisme sama seperti §9.1, TTL sama 10 menit) → dikirim ke `whatsapp_number` → PIC membalas **`VERIFY <code>`** (keyword **berbeda** dari `PAIR` milik persona A/B, agar intent tidak pernah tertukar antara verifikasi internal dan verifikasi client) → cocok+belum expired → `whatsapp_verification_status='verified'`.
- **Hanya contact yang `verified` DAN tidak ambigu (tepat satu match aktif) DAN tenant-scoped benar** boleh menerima informasi spesifik-invoice atau kapabilitas acknowledgment (§5, §6).
- **Client unverified menerima FAQ publik + human handoff saja** — tidak pernah info invoice apa pun, walau nomornya secara data cocok ke suatu client/invoice.
- **Active duplicate/ambiguous numbers fail closed:** karena tidak ada unique constraint pada `whatsapp_number`, resolusi identity **wajib** memeriksa apakah nomor cocok ke lebih dari satu `client_contacts` aktif (verified maupun unverified, lintas client atau lintas tenant) — jika ya, **fail closed** (diperlakukan sebagai unverified/no-invoice-data minimal, atau bahkan ditolak total tergantung derajat ambiguitas yang didesain di gate implementasi), **tidak pernah** dipilih salah satu.
- **Number changes require re-verification:** setiap kali `whatsapp_number` pada suatu `client_contacts` diubah, `whatsapp_verification_status` **wajib** otomatis kembali ke `unverified` dan `whatsapp_verified_at` dikosongkan — pola sama seperti evidence version baru kembali ke `pending` (`ADOP_GATE_4A_CONTRACT_v1.0.md` §5) — tidak pernah mewarisi status verified ke nomor baru.
- **Never merge clients automatically by phone:** jika dua `client_contacts` (client berbeda, atau bahkan tenant berbeda) kebetulan punya `whatsapp_number` yang sama, sistem **tidak pernah** menyimpulkan mereka orang/entitas yang sama, tidak pernah auto-merge data, tidak pernah auto-pilih salah satu sebagai "yang benar" — selalu diperlakukan sebagai kondisi ambigu yang butuh review manual admin.
- Revocation persona C = admin menonaktifkan `client_contacts` row (`status='inactive'`, UI existing `/app/master-data/*`) — tidak perlu mekanisme revoke terpisah dari verifikasi.

Skema kolom lengkap ada di Lampiran §21.

### 9.3 Authorization per request (semua persona)

- Unknown number (tidak cocok ke pairing A/B maupun `client_contacts` mana pun) → **no data sama sekali**, balasan generik aman yang tetap mengidentifikasi diri sebagai PT PELAYARAN GEMA BAHARI.
- Cocok ke `client_contacts` tapi `unverified` → dilayani sebagai persona C unverified (FAQ + handoff), **bukan** diperlakukan sebagai unknown — bedanya: unverified tetap dapat FAQ publik, unknown-total tidak mendapat identifikasi konteks apa pun selain identitas pengirim.
- Ambigu (cocok ke >1 identitas dalam tier mana pun) → **no data**/fail closed sesuai §9.1/§9.2, log security event.
- Inactive/suspended/revoked → **no data**, pesan tidak membedakan alasan detail (anti-enumeration).
- Role admin meminta kapabilitas Executive → ditolak eksplisit, tidak silently downgrade.
- Identity yang cocok ke persona C (verified maupun unverified) **tidak pernah** mendapat kapabilitas persona A/B walau ada anomali data — kedua resolusi dicoba independen; jika keduanya cocok (harus dicegah di data entry), perlakukan sebagai ambigu.

---

## 10. Allowed Intent & Tool Registry — LOCK

LLM **tidak boleh** menulis SQL, memilih tabel, atau menerima query bebas untuk persona mana pun.

### 10.1 Persona A — Executive/Owner

| Intent | Fungsi read-model existing | File |
|---|---|---|
| `morning_brief` | Komposer canonical Morning Brief (§14) — sama untuk scheduled maupun on-demand | `src/lib/cash-pool/service.ts`, `src/lib/vessel-projects/service.ts` (komponen baseline sampai komposer dedicated dibangun) |
| `cash_position_current` | `getDailyCashPoolSummaryForActiveTenant(businessDate)` | `src/lib/cash-pool/service.ts` |
| `projects_by_status` | `listVesselProjectsForActiveTenant()` | `src/lib/vessel-projects/service.ts` |
| `highest_project_costs` | `listVesselProjectCostSummaryForActiveTenant()` | `src/lib/vessel-projects/service.ts` |
| `unbilled_projects` | `getExecutiveReportForActiveTenant().unbilled`/`attentionItems` (`UNBILLED`) | `src/lib/executive-report/service.ts` |
| `invoice_delivery_status` | `getExecutiveReportForActiveTenant().attentionItems` (`NOT_DELIVERED`/`DELIVERY_FAILED`/`NOT_ACKNOWLEDGED`) | `src/lib/executive-report/service.ts` |
| `owner_attention_items` | `getExecutiveReportForActiveTenant().attentionItems`/`attentionBreakdown` | `src/lib/executive-report/view-model.ts` |
| `product_help_*` | Internal Help Knowledge (§11.1) | — |

### 10.2 Persona B — Internal Operator/Admin (pilot: help only)

| Intent | Sumber |
|---|---|
| `product_help_*` | Internal Help Knowledge (§11.1), dibatasi topik yang admin sendiri berwenang |

Tidak ada intent data operasional untuk persona B pada pilot ini.

### 10.3 Persona C — verified vs unverified (LOCK tegas)

| Intent | Verified | Unverified | Sumber |
|---|---|---|---|
| `invoice_notification_ack` | ✅ | ❌ | Write path baru (§5, §20) |
| `public_service_faq_*` | ✅ | ✅ | Public Service FAQ Knowledge (§11.2) |
| `human_handoff` | ✅ | ✅ | §7.2 |
| `stop_optout` | ✅ | ✅ | §7.1 |

**Tidak ada** intent lain untuk persona C pada tier mana pun. Pertanyaan biaya/kas/margin/overhead/project detail/data client lain/status internal apa pun **ditolak permanen by design** untuk kedua tier — bukan roadmap perluasan (kontras eksplisit dengan `PRD.md` §7.11 yang hanya berlaku untuk persona A).

---

## 11. Help & FAQ Knowledge Contract — LOCK

### 11.1 Internal Help Knowledge (persona A & B)

Tidak berubah: sumber dokumen versioned repo, output menyertakan source+version, defense terhadap prompt injection, update process terikat perubahan kode, tidak tahu → escalate.

### 11.2 Public Service FAQ (persona C, verified & unverified)

Tidak berubah dari Revisi 2: sumber terpisah tegas dari Internal Help, wajib direview sebelum publish, tidak pernah menyentuh tabel bisnis tenant, tidak pernah tercampur dengan Internal Help dalam satu jawaban, source/version disertakan, "tidak tahu → human handoff".

---

## 12. Business Response Schema & Audit Contract — LOCK

### 12.1 Business Response Schema (persona A)

Tidak berubah: tenant identity, as-of timestamp Asia/Jakarta, metric/source label, hasil ringkas dari fungsi terstruktur, deep link relatif.

### 12.2 Client Notification & Acknowledgment Schema (persona C verified)

Tidak berubah dari Revisi 2, ditambah: setiap notifikasi/acknowledgment **wajib** menyertakan referensi `whatsapp_verification_status` yang berlaku **pada saat pesan diproses** (bukan status yang mungkin sudah berubah setelahnya) — memastikan audit trail bisa membuktikan bahwa acknowledgment terjadi saat identity memang verified.

### 12.3 Audit Event Contract

Tabel baru bergaya `access_audit_events` (nama diusulkan `assistant_conversation_events`) mencatat, untuk semua persona: `tenant_id`, `persona` (`executive`/`internal_operator`/`external_client_verified`/`external_client_unverified`), `channel`, `provider_message_id`, `intent`, `status` (`answered`/`insufficient_data`/`unauthorized`/`error`/`handoff`/`opted_out`/`pairing_initiated`/`pairing_completed`/`pairing_failed`/`verification_initiated`/`verification_completed`/`verification_failed`), `created_at`. Tidak menyimpan isi pesan penuh secara default, tidak menyimpan challenge code plaintext setelah dipakai/kedaluwarsa (§15). Append-only.

### 12.4 Error Behavior

Tidak berubah dari Revisi 2 (AI provider gagal → fallback aman; data tidak lengkap → nyatakan eksplisit; duplicate inbound → dedup by `provider_message_id`; rate limit → generik; auth/signature gagal → fail closed 401; acknowledgment gagal validasi → ditolak eksplisit, `status=unauthorized`).

---

## 13. Provider & Number Contract — LOCK (final)

- **Fonnte bukan Meta Official WhatsApp Business API (Cloud API).** Dokumen, UI, dan komunikasi ke customer/Founder tidak boleh menyatakan atau menyiratkan sebaliknya.
- **Sandbox untuk demo Jumat (2026-07-31):** device Hendro yang sudah dipakai Gate 1L **tetap dipakai sebagai sandbox sender** untuk demo ini. Ini keputusan eksplisit Founder, dibatasi lingkup sandbox/demo saja.
- **Migrasi Gate 1L ke device PT-controlled TIDAK diperlukan sekarang** — keputusan yang sebelumnya open item (Revisi 2 §13.4) sudah dijawab: ditunda, bukan dibatalkan. Keputusan migrasi produksi tetap berlaku terpisah (poin berikut).
- **Produksi/client outreach (di luar sandbox/demo) wajib** SIM/device yang dikuasai **PT PELAYARAN GEMA BAHARI** (bukan device/nomor pribadi individu mana pun), dengan credential terpisah dari sandbox.
- **Nomor Founder demo tidak pernah di-hardcode** di kode, config tracked, test fixture, `.env.example`, atau dokumen mana pun (§9.1) — mengikuti persis precedent `n8n/workflows/README.md` untuk `RECIPIENT_OWNER_WHATSAPP_NUMBER` (env var di sisi n8n, tidak pernah di repo ADOP).

---

## 14. Morning Brief Contract — LOCK

- **Jadwal default: harian 07:00 Asia/Jakarta** — dikunci sebagai default; perubahan jadwal per tenant tetap configurable sesuai `PRD.md` §7.10/§439, tapi 07:00 WIB adalah nilai default yang dipakai kecuali diubah eksplisit.
- **Trigger demo/manual wajib tersedia** — karena scheduled engine belum dibangun (§4), demo Jumat memerlukan cara memicu Morning Brief secara manual/on-demand (via intent `morning_brief` interaktif dari persona A) yang **hasilnya identik** dengan apa yang scheduled engine akan kirim nanti.
- **Satu komposer/read-model canonical — LOCK tegas:** scheduled Morning Brief (masa depan) dan `morning_brief` interaktif **wajib** memanggil fungsi komposisi yang sama persis. **Tidak ada mesin hitung kedua.** Sampai komposer dedicated dibangun, intent interaktif memakai baseline sementara (§10.1) dan **wajib** diberi label "ringkasan interaktif" pada responsnya — begitu komposer dedicated ada, label ini dilepas dan kedua jalur (cron + interaktif) memanggil fungsi yang sama.
- `owner-control-whatsapp-notification.json` (Gate 1L) tetap inactive/unpublished; tidak diaktifkan sebagai bagian dari Morning Brief.

---

## 15. Privacy & Observability — LOCK

Tidak berubah dari Revisi 2, ditambah: **challenge code** (pairing `PAIR`/verifikasi `VERIFY`) diperlakukan setara secret sementara — tidak pernah dicatat plaintext di log operasional/audit setelah dipakai atau kedaluwarsa, TTL keras 10 menit, dan percobaan gagal berulang wajib rate-limited (desain limit di gate implementasi, prinsip dikunci di sini).

---

## 16. Threat Model (ringkas, final)

| Ancaman | Mitigasi terkontrak |
|---|---|
| Nomor tidak terverifikasi mengakses data tenant (persona A/B) | Pairing wajib challenge-code + re-check tiap request (§9.1) |
| Client unverified mengakses data invoice | Ditolak by design — hanya FAQ+handoff untuk unverified (§6, §10.3) |
| Nomor client salah/ambigu mengakses invoice client lain | Fail closed pada ambiguitas, tidak pernah auto-merge (§9.2) |
| Cross-client data leak | Response guard cek `client_id` invoice = `client_id` identity yang resolve (§7, §9.3) |
| Pairing/verification code ditebak atau di-brute-force | Single-use, TTL 10 menit, rate-limit percobaan (§9.1, §9.2, §15) |
| Kode pairing dipakai ulang setelah verified | `challenge_code` dikosongkan setelah dipakai (§9.1) |
| Prompt injection dari teks pesan/dokumen retrieval | Teks user = data bukan instruksi (§11) |
| Internal Help bocor ke persona C via FAQ retrieval salah sumber | Sumber dipisah tegas (§11.2) |
| LLM mengarang nominal/status/kesimpulan | LLM hanya format hasil query terstruktur (§7.3, §10) |
| n8n dikompromikan/bypass authorization | n8n hanya transport, tidak tahu identity/verifiedStatus (§7) |
| Replay/duplicate webhook | Idempotency by `provider_message_id` (§12.3, §15) |
| Enumeration nomor terdaftar | Pesan unauthorized digeneralisasi (§9.3) |
| Client acknowledgment write disalahgunakan | Hanya verified, append-only, satu event type, validasi binding (§5) |
| STOP/BERHENTI diabaikan | Suppression + handoff + audit wajib (§7.1) |
| Kesan phishing/impersonasi | Identifikasi diri wajib PT PELAYARAN GEMA BAHARI (§8) |
| Salah klaim Fonnte = Meta Official API | Klarifikasi terkunci (§13) |
| Nomor produksi = device pribadi individu | Wajib device PT-controlled untuk produksi (§13) |
| Nomor Founder demo bocor lewat repo/log | Larangan hardcode eksplisit (§9.1, §13, §15) |
| AI provider/Fonnte down memutus core ADOP | Core tetap jalan, fallback aman, fail closed (§12.4) |
| Admin/reviewer/viewer downgrade diam-diam ke data Owner | Role check eksplisit menolak (§9.3); reviewer/viewer tanpa akses sama sekali (§6) |

---

## 17. Rollout Gates & Acceptance Criteria

1. **Gate 6J-B (Identity & Pairing Schema):** migration `assistant_channel_identities` (§9.1, §21) dan kolom verifikasi `client_contacts` (§9.2, §21), termasuk trigger reset-to-unverified on number change, RLS, dan test tenant-isolation + cross-client-ambiguity.
2. **Gate 6J-C (Routing & Internal API):** endpoint `/api/internal/assistant/inbound`, shared-secret auth, idempotency, `PAIR`/`VERIFY` challenge completion handler, intent classifier per-persona/tier, STOP/handoff handling.
3. **Gate 6J-D (Acknowledgment Write Path):** endpoint/service internal baru untuk `invoice_notification_ack`, terpisah dari `recordInvoiceAcknowledgmentForActiveTenant`, otorisasi berbasis `client_contacts` verified + validasi binding invoice, idempotency/anti-replay.
4. **Gate 6J-E (Morning Brief Composer):** komposer canonical dedicated (§14) dipakai scheduled maupun interaktif; scheduled trigger 07:00 WIB default.
5. **Gate 6J-F (Knowledge & AI Provider Adapter):** pemilihan AI provider, adapter pattern, retrieval Internal Help dan Public FAQ sebagai dua sumber terpisah.
6. **Provider & Number Setup:** device PT-controlled wajib tersedia sebelum rollout ke nomor client produksi mana pun; sandbox (device Hendro) tetap dipakai untuk demo Jumat dan pengujian internal berikutnya sampai keputusan lain diambil.
7. **Internal dry run** ke nomor test (A/B) dan minimal satu client test (C, dengan persetujuan eksplisit) sebelum nomor produksi asli dipakai — Founder explicit approval wajib.
8. Setiap gate implementasi wajib test matrix terpisah (pola `ADOP_GATE_4A_TEST_MATRIX_v1.0.md`).

---

## 18. Explicitly Out of Scope (Gate 6J-A)

Migration/RPC/RLS/endpoint/service nyata untuk pairing dan verifikasi; n8n workflow inbound; pemilihan AI provider; konten FAQ publik aktual; desain UI human handoff; bentuk teknis secure invoice link (token/signed URL/expiry — kontraknya dikunci prinsipnya, bentuknya di gate implementasi); komposer Morning Brief dedicated; kapabilitas operasional persona B di luar help; migrasi sender Gate 1L (dikonfirmasi tidak diperlukan sekarang, §13).

---

## 19. Keputusan & Asumsi yang Dibekukan di Gate Ini (final)

1. Penamaan dokumen tetap `ADOP_GATE_6J_A_AI_HELP_EXECUTIVE_ASSISTANT_CONTRACT_v1.0.md` — tidak ganti nama file walau isi sudah berevolusi jauh dari judul aslinya, agar referensi existing di `CLAUDE.md`/`PRD.md` tetap valid.
2. Assistant untuk instance ADOP: **"GEMA Assistant"** — nama produk-facing, skema tetap generik `assistant_*`.
3. Identity Owner/Admin dan Client **sengaja dipisah dua tabel/lifecycle berbeda** (`assistant_channel_identities` vs `client_contacts` + kolom verifikasi) — bukan satu tabel identity generik, untuk mencegah kebocoran kapabilitas lintas persona lewat model data yang tercampur.
4. Keyword challenge **`PAIR`** (internal) dan **`VERIFY`** (client) sengaja dibedakan — mencegah tertukar intent antara dua alur verifikasi yang punya konsekuensi otorisasi sangat berbeda.
5. TTL challenge code **10 menit** berlaku sama untuk pairing internal maupun verifikasi client — satu prinsip keamanan yang konsisten, bukan dua kebijakan berbeda.
6. Client unverified tetap dilayani (FAQ+handoff), **tidak** diperlakukan sama dengan unknown/unregistered — keputusan UX sekaligus keamanan: unverified adalah kondisi transisi yang sah (menunggu verifikasi), bukan kondisi mencurigakan.
7. Sandbox demo Jumat (2026-07-31) tetap pakai device Hendro; migrasi Gate 1L ditunda, bukan dibatalkan — keputusan eksplisit, dicatat agar tidak diasumsikan permanen ke arah mana pun.
8. Morning Brief default 07:00 WIB, dengan syarat keras satu komposer canonical — mencegah drift dua mesin hitung yang bisa memberi angka berbeda ke Owner.
9. Reviewer/Viewer final tanpa akses assistant apa pun v1 — bukan lagi "belum termasuk", tapi keputusan tegas.

Tidak ditemukan konflik material antara addendum finalisasi ini dan `CLAUDE.md`/`PRD.md`/schema existing yang menghalangi pembekuan kontrak revisi ini.

---

## 20. Gaps / Blockers untuk Implementasi (bukan blocker untuk membekukan kontrak ini)

Seluruh keputusan desain yang sebelumnya open (identity mechanism, client verification, sender demo, capability matrix, Morning Brief schedule) **sudah dijawab** di revisi ini. Yang tersisa murni menunggu implementasi kode/schema, bukan keputusan:

1. Migration `assistant_channel_identities` dan kolom verifikasi `client_contacts` belum dibuat (§17 butir 1).
2. Endpoint inbound, challenge-completion handler, dan intent classifier belum dibuat (§17 butir 2).
3. Jalur tulis `invoice_notification_ack` yang tidak owner/admin-gated belum dibuat — `recordInvoiceAcknowledgmentForActiveTenant` existing tetap tidak bisa dipakai langsung (§5.5, §17 butir 3).
4. Komposer Morning Brief dedicated belum dibangun; baseline sementara tetap dipakai untuk intent interaktif sampai itu ada (§14).
5. Belum ada webhook signature/HMAC pattern, rate-limiting utility, AI provider, atau modul Help/FAQ retrieval (§4).
6. Device PT-controlled untuk produksi belum disiapkan — sandbox (device Hendro) cukup untuk demo Jumat dan pengujian internal lanjutan (§13).

---

## 21. Lampiran — Skema Proposal (final, belum diimplementasikan)

### 21.1 `assistant_channel_identities` (persona A/B)

```
public.assistant_channel_identities
  id                    uuid primary key
  tenant_id             uuid not null references public.tenants(id)
  membership_id         uuid not null references public.tenant_memberships(id)
  channel               text not null default 'whatsapp'
  channel_address       text not null        -- normalized E.164, hashed/encrypted-at-rest
  status                enum('pending_verification','active','revoked')
  challenge_code        text                 -- single-use random, hanya terisi saat pending
  challenge_expires_at  timestamptz          -- now() + 10 minutes saat dibuat
  verified_at           timestamptz
  revoked_at            timestamptz
  revoked_reason        text
  created_at            timestamptz not null default now()
  updated_at            timestamptz not null default now()
  unique (channel, channel_address) where status = 'active'
  unique (tenant_id, membership_id, channel) where status = 'active'
```

Lifecycle: web-initiated → challenge dikirim WhatsApp → `PAIR <code>` dalam 10 menit → `active`. Revocation oleh owner/admin atau otomatis saat membership nonaktif (dicek via join, bukan disalin statusnya). Recovery lewat login ulang web, tidak lewat WhatsApp itu sendiri.

### 21.2 Kolom tambahan `client_contacts` (persona C)

```
alter table public.client_contacts add column
  whatsapp_verification_status enum('unverified','verified') not null default 'unverified',
  whatsapp_verified_at         timestamptz,
  whatsapp_challenge_code      text,
  whatsapp_challenge_expires_at timestamptz;
```

Trigger (proposal): setiap `UPDATE` yang mengubah `whatsapp_number` mereset `whatsapp_verification_status` ke `unverified` dan mengosongkan `whatsapp_verified_at` — pola sama seperti evidence version baru kembali ke `pending` (`ADOP_GATE_4A_CONTRACT_v1.0.md` §5). Verifikasi memakai keyword **`VERIFY <code>`**, admin-triggered (bukan self-service web, karena client tidak punya login ADOP), TTL 10 menit sama seperti §21.1. Resolusi identity di runtime wajib memeriksa ambiguitas (`count(*) > 1` pada nomor yang sama, status apa pun, lintas client/tenant) sebelum mempercayai satu match sebagai identity tunggal.

Ini proposal skema untuk gate implementasi — nama kolom/tabel final ditentukan saat migration ditulis.

---

## 22. Anomaly Alert Routing Contract — Gate 6J-A1 (LOCK, addendum korektif)

**Sifat:** Audit + documentation-only, sama seperti Gate 6J-A. **Tidak ada implementasi** (migration, RPC, RLS, n8n workflow, endpoint, service, atau test) pada Gate 6J-A1. Addendum ini mengunci **routing** alert anomali/duplikasi di atas mesin deteksi yang sudah ada — tidak membuat mesin deteksi baru, tidak mengubah `CLAUDE.md` §7 (Universal Import Rules) di luar pencatatan status gate ini.

### 22.1 Satu Canonical Anomaly Source — LOCK

- **Satu-satunya** sumber deteksi anomali/duplikasi untuk seluruh sistem (realtime alert maupun Morning Brief, persona A maupun B) adalah mesin **expense duplicate detection** yang sudah ada: `supabase/migrations/20260719140000_expense_duplicate_detection.sql`, `src/lib/expense-duplicate-detection/*` (tabel `expense_duplicate_candidates`/`expense_duplicate_candidate_current`, reason code `reference_match`/`exact_financial_match`/`cross_project_reference_match`/`same_day_amount_vendor_match`, RPC `resolve_expense_duplicate_candidate`).
- **Dilarang** membuat mesin/perhitungan anomali kedua untuk tujuan apa pun (realtime, Morning Brief, executive report, atau WhatsApp) — setiap konsumen wajib membaca dari sumber canonical yang sama, tidak menghitung ulang secara independen.
- Constraint existing tetap berlaku tanpa perubahan: kandidat duplikasi **tidak pernah** memblokir pembuatan submission (komentar `expense_duplicate_detection.sql` baris 6: "Candidates are informational only: they never block a submission"); yang diblokir adalah **approval** submission ke ledger selama kandidat berstatus `pending` (`DUPLICATE_REVIEW_REQUIRED`) atau `confirmed_duplicate` (`DUPLICATE_CONFIRMED`) — lihat §22.2 tier EXACT.
- Human review tetap wajib untuk seluruh tier tanpa pengecualian, sesuai `CLAUDE.md` §7 ("Candidate duplicate tetap terlihat dan selalu membutuhkan human review"). Addendum ini mengatur **routing/channel/urgency notifikasi**, bukan mengecualikan kewajiban resolusi manual pada `expense_duplicate_candidates`.

### 22.2 Severity Matrix — LOCK

Severity adalah **klasifikasi tambahan** di atas `expense_duplicate_candidate_current` (status `pending`/`not_duplicate`/`confirmed_duplicate` dan reason code existing) — bukan kolom database baru pada gate dokumentasi ini; skema kolom final ditentukan di gate implementasi (§22.6). Severity dihitung deterministic server-side oleh **satu fungsi canonical**, tidak pernah oleh LLM (`CLAUDE.md` §8, §10), dan tidak pernah diduplikasi logic-nya di lebih dari satu tempat.

| Tier | Definisi | Kondisi pemicu (konseptual) |
|---|---|---|
| **EXACT DUPLICATE** | Berhasil dicegah **sebelum** masuk ledger | Kandidat `pending`/`confirmed_duplicate` pada submission yang approval-nya **belum pernah lolos** untuk kandidat ini (diblokir oleh RPC existing, §22.1) |
| **SUSPECTED DUPLICATE** | Perlu pemeriksaan; ambiguitas match belum jelas | Kandidat berstatus `pending`, reason code apa pun, belum ada indikasi dampak finansial atau pola berulang |
| **CRITICAL DUPLICATE** | Sudah berdampak finansial, percobaan override, atau pola berulang | (a) Kandidat terhubung ke submission yang **sudah** approved ke ledger (deteksi post-hoc/backdated), atau (b) percobaan approval berulang pada submission dengan kandidat pending/confirmed (indikasi override attempt), atau (c) pola berulang — kandidat baru dengan reason code sama pada vendor/kapal/project yang sama dalam window waktu tertentu (threshold configurable, §22.4) |

### 22.3 Realtime Routing — LOCK

Realtime = tindakan operasional segera, bukan pengawasan. Channel realtime reuse notification-outbox pattern (§4, `src/lib/notification-outbox/*`, `supabase/migrations/20260721000000_owner_control_notification_outbox.sql`) untuk in-app, dan reuse n8n/Fonnte outbound pattern (§4, §13) untuk WhatsApp Owner — **belum diaktifkan** pada gate ini (§22.6).

| Tier | In-app realtime → Admin | Audit attempt | WA realtime → Owner |
|---|---|---|---|
| EXACT DUPLICATE | ✅ | ✅ | ❌ |
| SUSPECTED DUPLICATE | ✅ (ke Review & Approval Admin — surface existing `src/lib/operations-daily/*`) | ✅ | ❌ |
| CRITICAL DUPLICATE | ✅ | ✅ | ✅ |

- In-app realtime **selalu** ke Admin (persona B/`role admin`) untuk ketiga tier; CRITICAL menambah WA realtime ke Owner (persona A/`role owner`) **di atas** in-app Admin — bukan pengganti.
- WA realtime Owner untuk CRITICAL **wajib** memakai jalur pairing/identity `assistant_channel_identities` (§9.1) begitu Gate 6J-B selesai — **tidak pernah** dikirim ke nomor yang tidak melalui verified pairing, dan **tidak pernah** ke `client_contacts` (§22.4 butir client).
- Persona B (Admin) **tidak** menerima WA realtime untuk anomaly alert pada pilot ini — hanya in-app; kapabilitas WA realtime Admin untuk anomaly (bila diperlukan nanti) memerlukan revisi kontrak eksplisit, konsisten dengan §6 ("Kapabilitas operasional Internal Operator di masa depan tetap wajib melalui revisi kontrak eksplisit").

### 22.4 Morning Brief Routing & Prinsip — LOCK

- Morning Brief = pengawasan (oversight), bukan tindakan operasional — menampilkan **unresolved list** (SUSPECTED dan CRITICAL yang belum resolved) dan **rekap resolved** (termasuk EXACT yang sudah tercegah, dan seluruh tier yang sudah diresolusi).
- **EXACT DUPLICATE:** tidak muncul sebagai unresolved (sudah tercegah sebelum ledger), tetap muncul di **rekap** Morning Brief sebagai bagian dari laporan aktivitas pencegahan.
- **SUSPECTED DUPLICATE:** muncul sebagai **unresolved** selama status `pending`, pindah ke rekap resolved setelah diresolusi (`not_duplicate`/`confirmed_duplicate`).
- **CRITICAL DUPLICATE:** tetap muncul di Morning Brief **sampai resolved** — tidak hilang otomatis walau sudah pernah ditampilkan pada brief sebelumnya.
- Morning Brief memakai **komposer canonical yang sama** dengan §14 — tidak ada mesin ringkasan anomali kedua yang terpisah dari komposer Morning Brief utama; blok anomali adalah satu section di dalam output komposer yang sama.
- Severity dan threshold finansial (mis. batas nominal yang menaikkan SUSPECTED → CRITICAL, atau window waktu pola berulang) **wajib tenant-configurable** — **tidak pernah** hardcode nominal pada kode/dokumen (`CLAUDE.md` §6: "Jangan hardcode nilai snapshot file ke business rule").
- Koreksi atas transaksi yang sudah CRITICAL (sudah masuk ledger) **hanya** lewat reversal eksplisit dan audited (`CLAUDE.md` §9: "Koreksi financial memakai append-only adjustment/reversal") — **tidak pernah** delete atau auto-reversal oleh sistem.
- **Client** (persona C, verified maupun unverified) **tidak pernah** menerima alert anomali internal dalam bentuk apa pun — baik realtime maupun Morning Brief. Anomaly alert routing eksklusif untuk persona A (Owner, tier CRITICAL) dan persona B (Admin, seluruh tier), konsisten dengan §6 Capability Matrix ("Data operasional tenant" = ❌ **tegas** untuk persona C).

### 22.5 Deduplication & Escalation State — LOCK

- **Dedupe notification/outbox wajib mencegah alert ganda** untuk kandidat anomali yang sama — reuse pola idempotency existing (dedup by `provider_message_id` untuk WA §12.3/§12.4, pola unique/append-only pada notification-outbox §4) diterapkan pada kunci `candidate_id` + tier + channel: satu kandidat pada satu tier tidak mengirim lebih dari satu notifikasi realtime per channel, kecuali severity-nya naik (mis. SUSPECTED → CRITICAL memicu notifikasi baru).
- **Escalation state canonical** (baru, melapis `expense_duplicate_candidate_current.status` existing — tidak menggantikannya): `detected → under_review → resolved` atau `detected → under_review → false_positive`.
  - `detected`: kandidat baru terdeteksi mesin canonical (§22.1), severity awal dihitung.
  - `under_review`: Admin/Owner sudah membuka/menandai kandidat sedang diperiksa (state UI eksplisit, bukan otomatis dari waktu berlalu).
  - `resolved`: kandidat diresolusi `confirmed_duplicate` via `resolve_expense_duplicate_candidate` existing.
  - `false_positive`: kandidat diresolusi `not_duplicate` via `resolve_expense_duplicate_candidate` existing.
  - Skema kolom final state ini ditentukan di gate implementasi (§22.6).
- Audit attempt (EXACT dan SUSPECTED) dan audit realtime/WA send (CRITICAL) mengikuti pola append-only `assistant_conversation_events`/`access_audit_events` (§4, §12.3) — reuse, bukan tabel audit baru per tier.

### 22.6 Non-Goals & Gaps (Gate 6J-A1)

Sama seperti §3/§18/§20 Gate 6J-A: **tidak ada** migration/RPC/RLS/endpoint/service/n8n workflow baru pada gate ini. Yang masih menunggu implementasi (gate berikutnya, bukan keputusan):

1. Kolom/skema severity dan escalation state (§22.2, §22.5) pada `expense_duplicate_candidates`/tabel pendamping — proposal, belum migration.
2. Fungsi canonical severity classifier (§22.2) — belum ditulis.
3. Mekanisme in-app realtime — belum ada infrastruktur realtime sama sekali di codebase saat ini, tidak khusus untuk anomaly alert.
4. Endpoint/trigger yang memicu WA realtime Owner untuk CRITICAL — bergantung pada Gate 6J-B (`assistant_channel_identities`) selesai lebih dulu.
5. Konfigurasi tenant-level untuk threshold finansial dan window pola berulang (§22.4).
6. Perluasan dedupe key notification-outbox/`assistant_conversation_events` untuk anomaly alert (§22.5).
