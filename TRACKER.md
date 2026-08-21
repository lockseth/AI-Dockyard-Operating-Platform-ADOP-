# TRACKER.md — ADOP Session, Milestone & Backlog Log

Living log untuk platform AI Dockyard Operating Platform (ADOP). Dokumen ini **bukan** source of truth requirement (lihat urutan di `CLAUDE.md` §3: LOCK Founder → `PRD.md` → `README.md` → docs modul → code). Dokumen ini adalah catatan historis: apa yang sudah dikerjakan, kapan, dan temuan/insight apa yang masih menunggu tindak lanjut.

## Protokol Pemakaian

Dokumen ini dipelihara manual oleh coding agent setiap sesi — belum ada automation/hook yang menulis ke sini secara otomatis.

1. **Awal sesi:** baca bagian "Ringkasan Status Saat Ini" dan beberapa entri teratas "Session Log" untuk konteks cepat sebelum bootstrap penuh sesuai `CLAUDE.md` §1.
2. **Akhir sesi atau setelah milestone/gate selesai:** tambahkan satu entri baru di **atas** entri terakhir pada "Session Log" (reverse-chronological, terbaru paling atas). Jangan menyunting/menghapus entri lama — ini append-only.
3. **Temuan, insight, risiko, atau pertanyaan baru** yang muncul saat kerja (bukan bug yang langsung diperbaiki di sesi yang sama) → tambahkan baris baru ke "Backlog — Findings & Insights". Jangan didiskusikan lalu dibiarkan hilang dari histori chat.
4. Saat sebuah item backlog selesai ditindaklanjuti, ubah kolom **Status** jadi `Resolved` dan isi **Resolusi** — jangan dihapus dari tabel (histori tetap terlihat).
5. Format tanggal: `YYYY-MM-DD`. Jika user menyebut hari relatif ("besok", "minggu depan"), konversi ke tanggal absolut sebelum dicatat.
6. Dokumen ini tidak menggantikan `git log` untuk detail diff — cukup referensi commit hash/gate id, jangan salin isi diff.

---

## Ringkasan Status Saat Ini (per 2026-08-20)

Fase aktif: **Phase 1 — AI Cost Control / Founding Design Partner Pilot**. Phase 2 (Billing Intelligence) scope terbatas (Metadata/Review/Recap/Export) sudah **LOCKED 100%** per commit `1f2b54e`.

| Domain | Status | Referensi |
|---|---|---|
| Auth & tenant isolation (Gate 0B) | Implemented | `PRD.md` §7.1 |
| Trusted master data (Gate 1A) | Implemented | `PRD.md` §7.2, `supabase/migrations/20260719080000_master_data.sql` |
| Universal Import — candidate project + exception review (Gate 6I-A) | Implemented | `PRD.md` §7.3, `supabase/migrations/20260729020000_...sql` |
| Project lifecycle, cash pool, cost ledger, approval, duplicate detection | Implemented (foundation commits) | lihat Milestone Log |
| Owner dashboard `/owner/control`, Admin dashboard `/app` | Implemented (sebagian besar figur PRD §7.10) | `PRD.md` §7.10 |
| Morning Brief scheduling | Configured (Mon–Sat 08:30 WIB) | commit `2139652` |
| Billing Phase 2 — Metadata/Review/Recap/Export (Gate 2A/4A) | **LOCKED 100%** | `CLAUDE.md` §4 Cross-Phase Locks, 162 test pass |
| Invoice Delivery & Acknowledgement | Belum termasuk lock Phase 2 di atas | `PRD.md` §7.12 |
| Assisted Billing template/generator (Phase 2B) | Belum diimplementasikan | — |
| Phase 3 (Cash Collection / Payment Verification) | Belum diimplementasikan | — |
| GEMA Assistant — kontrak 3-persona (Gate 6J-A) | Dibekukan final, **documentation-only** | belum ada runtime |
| Anomaly Alert Routing (Gate 6J-A1) | Dibekukan final, **documentation-only** | belum ada implementasi |
| Assistant identity & pairing schema (Gate 6J-B, 6J-B1) | Implemented, local only | belum ada webhook/UI/AI |
| Inbound WhatsApp gateway PAIR/VERIFY (Gate 6J-C) | Implemented, **local only** | n8n workflow masih inactive, belum diimpor hosted |
| Native crypto signing reconciliation (Gate 6J-D5/D6) | Documentation/local-artifact reconciled | belum diimpor/diaktifkan/diuji end-to-end |
| Simplified internal access link generation (Gate 6J-D9-B) | Implemented, local only | belum ada UI/Server Action pemanggil; verifikasi Auth URL config tertunda (6J-D9-B1) |
| Dark mode toggle | **Tidak ada** (arsitektural inert) | lihat backlog |
| Full local verification (2026-08-20) | `pnpm test` **PASS**, `pnpm test:integration` **PASS** (170/171 pada run bersih, 1 flaky), `pnpm typecheck`/`pnpm lint` **FAIL** hanya karena file uncommitted milik sesi lain | lihat Session Log 2026-08-20 |

Working tree saat sesi ini dimulai: ada perubahan **milik user/sesi lain** yang belum di-commit — `ADOP Private Demo Data/`, `ADOP_RESKIN_PROTOTYPE_TAILADMIN_v1.html`, `_ephemeral-visual-check.cjs`, `assets/`, dan 4 file n8n proposal native-crypto baru, plus modifikasi `.gitignore`. **Tidak disentuh** sesi ini — murni observasi bootstrap.

---

## Skala Prioritas Kerja (per 2026-08-20)

Disusun berdasarkan risiko/dampak vs effort, bukan keputusan scope/roadmap — item yang menyangkut roadmap/fase berikutnya tetap menunggu approval eksplisit Founder sesuai `CLAUDE.md` §2/§3. Urutan ini bisa berubah kapan saja atas arahan user/Founder.

| # | Prioritas | Item | Kenapa |
|---|---|---|---|
| 1 | 🔴 Kritis | **Flaky race condition** di `morning-brief.integration.test.ts` (5 request paralel, salah satu kadang 503) | Satu-satunya temuan yang sudah **terbukti gagal beneran** (bukan sekadar belum dikerjakan), dan menyentuh fitur yang sudah aktif jalan (jadwal Morning Brief Senin–Sabtu 08:30 WIB). Risiko: brief pagi Pak Hanafi kadang gagal terkirim tanpa alasan jelas. |
| 2 | 🟠 Tinggi | Verifikasi blocker deployment GEMA Assistant: field webhook Fonnte asli, ketersediaan node `crypto` di hosted n8n, kecocokan Auth URL redirect production (Gate 6J-C, 6J-D5/D6, 6J-D9-B1) | WhatsApp Copilot read-only adalah bagian dari **pilot scope yang sudah dikunci** (`CLAUDE.md` §4 poin 8). Ini "cek dulu sebelum pasang" — kalau langsung dicoba di server sungguhan tanpa verifikasi ini, kemungkinan besar gagal total di percobaan pertama. |
| 3 | 🟠 Tinggi | **Invoice Delivery & Acknowledgement** (`PRD.md` §7.12) — kirim invoice ke client via link, client klik untuk download PDF | Owner (Pak Hanafi) sudah kasih keputusan konkret lewat WhatsApp ("Iya pdf aja bagusnya") — salah satu open question sudah terjawab, jadi sudah bisa mulai dirancang. Satu paket kerja dengan Prioritas 2 karena sama-sama butuh jalur WhatsApp yang jalan (WABA/provider) — masuk akal dikerjakan berurutan setelahnya. **Catatan:** ini di luar lock Phase 2 100% yang sudah ada (lihat `CLAUDE.md` §4) — tetap butuh konfirmasi eksplisit Founder sebelum mulai implementasi kode, bukan otomatis jalan hanya karena sudah diprioritaskan di sini. |
| 4 | 🟡 Sedang | Beresin file uncommitted yang bikin `typecheck`/`lint` gagal (`n8n/...proposal-v3...test.ts`, `_ephemeral-visual-check.cjs`), serta putuskan status file besar lain (`ADOP_RESKIN_PROTOTYPE_TAILADMIN_v1.html`, `ADOP Private Demo Data/`, `assets/`) | Selama masih numpuk, error asli di masa depan bisa "ketutup" oleh error lama ini. Bukan bug produk, tapi kebersihan working tree. |
| 5 | 🟢 Rendah-sedang | Audit privilege schema-wide (`claim_next_notification_event`, `complete_notification_event`, akses `anon` ke `client_contacts` di luar kolom digest) | Belum ada bukti dieksploitasi, tapi ini "kunci bawaan pabrik yang belum diganti" — lebih murah dibenahi sekarang sebelum makin banyak fitur dibangun di atas skema yang sama. |
| 6 | ⚪ Menunggu keputusan | 20 open question `PRD.md` §15 lainnya (jam pasti Morning Brief, aturan top-up kas, daftar Dock/Gate fisik, dll); Assisted Billing (Phase 2B); Phase 3+; Hosted Apply & UAT first-owner onboarding | Bukan kerjaan teknis — butuh keputusan bisnis/approval eksplisit Founder dulu sebelum dikerjakan, sesuai aturan kerja project. |
| 7 | ⚫ Bisa nunggu | Dark mode toggle | Belum pernah diminta, di luar scope pilot yang dikunci. |

---

## Milestone / Gate Log

Ringkasan gate-gate mayor dari `CLAUDE.md`/`PRD.md` (source of truth), disusun kronologis berdasarkan urutan commit history (101 commit, `5b87f46`…`912498d`). Untuk detail lengkap tiap gate, baca kontrak/status resmi di `CLAUDE.md` §4/§8 atau `PRD.md` §7.x — tabel ini indeks, bukan pengganti.

| Gate/Milestone | Status | Commit/File kunci |
|---|---|---|
| Foundation — tenant isolation, role model, login lokal (Gate 0B) | Implemented | `5b87f46`…`cdd2ef6` |
| Trusted master data (Gate 1A) | Implemented | `bf32971` |
| Project lifecycle, cash pool, cost ledger, expense approval, duplicate detection, EOD reconciliation | Implemented | `d7744b5`…`46c2864` |
| Cash import staging/mapping/dry-run/commit/rollback | Implemented | `c63032b`…`d65523c` |
| Owner Control WhatsApp slice (foundation, pre Gate 6J) | Implemented | `a93db6b` |
| Billing: invoice evidence, cost recap export, metadata lock (Gate 2A/4A) | **LOCKED 100%** | `a560cd7`…`1f2b54e` |
| First-owner onboarding (multi-tenant provisioning) | Implemented locally | `8d568ec` (lihat memory `project_first_owner_onboarding_gate` — next gate: Hosted Apply & UAT belum jalan) |
| Morning brief foundation + owner recipient authorization | Implemented | `11c621a`, `e8b034c`, `3b9de59` |
| Import candidate-project + exception review (Gate 6I-A) | Implemented | `aea4110` |
| GEMA Assistant contract lock (3-persona) (Gate 6J-A) | Dibekukan final, documentation-only | `5cedb25` |
| Anomaly Alert Routing contract (Gate 6J-A1) | Dibekukan final, documentation-only | `4974806` |
| Assistant identity & pairing schema (Gate 6J-B) | Implemented (schema/RPC only) | `246e471` |
| Assistant identity privilege hardening (Gate 6J-B1) | Implemented (corrective) | `b06f7e4` |
| Inbound WhatsApp gateway PAIR/VERIFY (Gate 6J-C) | Implemented, local only | `ebdf699`, `326e06f`, `48e9227`, `ab9582b`, `63caacd` (fix commits) |
| n8n native-crypto signing reconciliation (Gate 6J-D5/D6) | Documentation/local-artifact reconciled, belum diuji hosted | `7c0d4fd` |
| Internal invite/recovery links (Gate 6J-D9-B) | Implemented, local only | `9df7003` |
| Owner dashboard TailAdmin-inspired redesign (nav consolidation, command center) | Implemented | `8c48f42`…`77d0601`, `5c7ff55` |
| UI reskin — accent alignment | Implemented (latest commit) | `912498d` |
| Morning Brief schedule lock (Mon–Sat 08:30 WIB) | Configured/locked | `2139652` |
| Phase 2 scope officially locked (100%, closeout audit) | **LOCKED** | `1f2b54e` |

Tidak semua gate secara eksplisit tercatat sebagai commit tunggal (beberapa gate berupa dokumen kontrak tanpa commit kode, atau tersebar di banyak commit kecil `fix(...)`) — untuk audit lengkap gunakan `git log --oneline` dan silangkan dengan status di `CLAUDE.md` §4/§8.

---

## Session Log

### 2026-08-20 — Ganti font ADOP: Ubuntu (heading) + Source Sans Pro (body)
- User minta ganti font ADOP, terinspirasi referensi Figma "Ubuntu Pairings" yang di-share sebelumnya. Ditanya lewat `AskUserQuestion` pasangan mana yang dipakai — user pilih **Ubuntu + Source Sans Pro**.
- Investigasi kode sebelum ubah: font sebelumnya **Geist Sans** (`next/font/google`) di [layout.tsx](src/app/layout.tsx), tapi ditemukan bug pre-existing — `body` di [globals.css](src/app/globals.css) hardcode `font-family: Arial, Helvetica, sans-serif`, jadi Geist yang sudah di-load **tidak pernah benar-benar terpakai** di teks body manapun. Dibenerin sekalian di perubahan ini.
- Perubahan:
  - [layout.tsx](src/app/layout.tsx) — ganti `Geist` → `Ubuntu` (weight 400/500/700, wajib diskrit karena Ubuntu tidak tersedia sebagai variable font di Google Fonts) dan `Source_Sans_3` (nama Google Fonts terbaru untuk "Source Sans Pro"; variable font, tanpa weight eksplisit, sama pola dengan Geist sebelumnya). `Geist_Mono` **tidak disentuh** — masih dipakai luas (`font-mono`, 13 file, nomor transaksi/ID) dan di luar cakupan permintaan.
  - [globals.css](src/app/globals.css) — `--font-sans` (token Tailwind `font-sans`) sekarang mengarah ke Source Sans 3, token baru `--font-heading` mengarah ke Ubuntu; `body` diperbaiki memakai `var(--font-source-sans)` (bukan lagi Arial hardcode); ditambah rule global `h1,h2,h3,h4,h5,h6 { font-family: var(--font-heading) }` supaya Ubuntu otomatis berlaku ke semua heading semantik (PageHeader `<h1>`, Modal `<h2>`, dst.) tanpa perlu menyentuh tiap komponen satu-satu.
- Verifikasi: dev server dijalankan (`preview_start` name `dev`), tidak ada error compile/console. Computed style dicek via JS di halaman `/login`: heading `"Ubuntu, \"Ubuntu Fallback\", Arial, Helvetica, sans-serif"`, body/label `"\"Source Sans 3\", \"Source Sans 3 Fallback\", Arial, Helvetica, sans-serif"` — sesuai target. `npx tsc --noEmit` tidak menghasilkan error baru (di luar 2 error pre-existing pada file uncommitted `proposal-v3...test.ts` yang sudah tercatat sebelumnya). Screenshot `/login` dikonfirmasi visual berbeda antara heading dan body text.
- Scope: hanya font pairing (heading vs body) yang diubah — warna/aksen/layout tidak disentuh.
- **Verifikasi tambahan di halaman authenticated (`/app` Admin Dashboard):** Docker Desktop sempat mati lagi di antara sesi (kontainer `supabase_*_adop` masih ada, cuma daemon-nya perlu dinyalakan ulang via PowerShell `Start-Process`). Dibuat ephemeral test user role `admin` di Tenant A memakai pola resmi `tests/integration/support/members.ts` (skrip throwaway `_ephemeral-admin-visual-check.cjs` di root, dihapus lagi setelah selesai — bukan bagian dari kode aplikasi). Login manual via Browser pane, cek computed style: `h1` "Dashboard" dan heading section ("Status Kas Hari Ini", "Perlu Tindakan", "Project Kapal Aktif") = Ubuntu; nav sidebar, paragraf, tombol = Source Sans 3. Tidak ada error console. User ephemeral berhasil dihapus bersih (`admin.auth.admin.deleteUser`, tidak kena guard trigger last-owner karena role-nya `admin` bukan `owner`).

### 2026-08-20 — Keputusan Owner (Pak Hanafi) via WhatsApp: format Morning Brief & preferensi pengiriman invoice
- User membagikan screenshot percakapan WhatsApp dengan Pak Hanafi (Owner). Dua keputusan Owner yang relevan untuk product/requirement:
  1. **Morning Brief** — Owner sudah diperlihatkan contoh (memakai data dummy) dan menjawab "Cukup sih pak" — format/isi ringkasan pagi dinyatakan cukup oleh Owner. Belum ada detail lebih lanjut soal jam pasti pengiriman (tetap mengacu jadwal terkunci Senin–Sabtu 08:30 WIB, commit `2139652`).
  2. **Preferensi format pengiriman invoice ke client** — user bertanya ke Owner: "Utk invoice yg dikirim ke client mau lsg soft copy lsg aja atau teks saja cukup pak? Misalkan client butuh pdf nya nanti tinggal klik link buat di download, ckup bgitu saja pak?" — Owner menjawab **"Iya pdf aja bagusnya"**. Keputusan: invoice dikirim sebagai **link, client klik untuk download PDF** — bukan file terlampir langsung, bukan juga teks polos tanpa dokumen.
- Ini mengisi salah satu open question terkait `PRD.md` §7.12 "Invoice Delivery & Acknowledgement — LOCK" (yang sebelumnya hanya menyebut "kirim via WhatsApp dan email" tanpa detail bentuk pengiriman). Belum mengubah lock resmi di `PRD.md`/`CLAUDE.md` — itu tetap butuh update dokumen terpisah oleh Founder/pemilik dokumen; sesi ini hanya mencatat sebagai project fact dari percakapan nyata.
- **Belum terjawab dari percakapan ini:** konfirmasi nomor mana ("hendro" atau lainnya) yang boleh dipakai untuk WABA — masih perlu ditanyakan terpisah ke Pak Hanafi (lihat backlog item terkait di atas).

### 2026-08-20 — Arahan user soal WABA + investigasi alur registrasi & batasan 24-jam Meta
- Klarifikasi user atas 3 poin sebelumnya: (1) status nomor "hendro" di Bablast **belum dikonfirmasi** — user akan tanya Pak Hanafi (Owner) dulu, jangan diasumsikan; (2) rencana user **memakai WABA resmi** (bukan jalur "Unofficial/Standard" yang sedang aktif di akun Bablast sekarang); (3) kalau Bablast bisa dipakai untuk WABA, user mau pakai Bablast sebagai provider ADOP.
- Ditindaklanjuti dengan buka (tanpa submit) form "Request Open WABA" di dashboard Bablast. Temuan:
  - **Registrasi bukan instan** — 3 tahap: ajukan permohonan → verifikasi kesiapan bisnis oleh admin Bablast → lanjut ke proses resmi Meta ("Embedded Signup"). Ada dependency eksternal (approval Bablast + proses Meta), bukan flip switch sesaat.
  - Dua mode: **WABA Dedicated** (direkomendasikan Bablast — nomor jadi khusus API, tidak bisa dipakai WhatsApp seluler biasa lagi) vs **WABA Coexistence/CoEx** (nomor tetap bisa dipakai WA biasa, tapi tunduk pada limit CoEx dari Meta). Ini keputusan bisnis (nomor mana yang dipakai, apakah boleh "dikorbankan") — bukan keputusan teknis semata.
  - Tidak disubmit — dialog ditutup tanpa mengirim permohonan apapun ke Bablast/Meta.
- Dicek juga dokumentasi "WABA Send Message API" dan "WABA Webhook" (sebelumnya belum dibuka saat sesi evaluasi awal):
  - **🚩 Temuan arsitektural signifikan:** WhatsApp API resmi (aturan Meta, berlaku di provider manapun, bukan spesifik Bablast) **melarang bisnis mengirim pesan bebas kecuali dalam jendela 24 jam setelah user terakhir mengirim pesan**. Pesan yang diinisiasi bisnis (Morning Brief terjadwal, anomaly alert CRITICAL ke Owner, notifikasi invoice terkirim) **wajib pakai Template Pesan** yang didaftarkan dan disetujui Meta lebih dulu (kategori MARKETING/UTILITY/AUTHENTICATION, struktur tetap dengan parameter `{{n}}`/named parameter, proses review Meta punya lead time). Command `PAIR`/`VERIFY` tetap aman karena itu balasan atas pesan yang dikirim user duluan (dalam window 24 jam).
  - **Konflik dengan lock existing:** kontrak GEMA Assistant (Gate 6J-A, `ADOP_GATE_6J_A_AI_HELP_EXECUTIVE_ASSISTANT_CONTRACT_v1.0.md`) mengunci "satu komposer canonical untuk scheduled maupun interaktif". Kalau jadi pakai WABA resmi, asumsi ini **perlu ditinjau ulang** — pesan terjadwal/proaktif dan balasan interaktif akan lewat jalur teknis berbeda (template pre-approved vs pesan sesi bebas). Ini perubahan arsitektur pada dokumen yang sudah "dibekukan final" — butuh keputusan eksplisit Founder sebelum diubah.
  - **Sisi positif:** webhook WABA Bablast memakai HMAC SHA256 signing (`X-Webhook-Signature`, sama pola dengan verifikasi Node.js `crypto.createHmac` + `timingSafeEqual`) — **identik** dengan pendekatan yang sudah dibangun untuk Fonnte di Gate 6J-D5/D6 (native crypto node n8n). Pekerjaan itu berpotensi dipakai ulang, bukan sia-sia, kalau pindah provider.
- Belum ada aksi berdampak (tidak submit request WABA, tidak generate API key WABA, tidak kirim pesan). Menunggu: (a) konfirmasi Pak Hanafi soal nomor, (b) keputusan Dedicated vs CoEx, (c) keputusan Founder soal revisi lock "satu komposer canonical" di kontrak Gate 6J-A.

### 2026-08-20 — Evaluasi provider WhatsApp alternatif: Bablast.id vs Fonnte
- User sudah login Bablast.id (`dash.bablast.id`) di browser sesi ini dan minta dicek sebagai kandidat pengganti Fonnte (alasan awal: harga lebih murah). Tidak ada aksi berdampak (tidak kirim pesan test, tidak generate API Key baru, tidak submit form apapun) — murni observasi read-only.
- Akun sudah aktif berlangganan paket "Juragan Plus" (~Rp150rb/bulan, billing 3 bulanan, aktif s/d 17 Sept 2026): 6 sender, 10.000 kontak, fitur AI/blast massal aktif. 3 nomor WhatsApp sudah terhubung, salah satunya diberi nama **"hendro"** — sama dengan nama device sandbox demo di kontrak Gate 6J-A/1L. Perlu konfirmasi user: apakah ini device yang sama/dimaksud untuk dipakai ADOP.
- **Temuan kunci — klaim marketing vs kenyataan:** halaman harga publik Bablast mencantumkan "Official WABA (Meta API)" sebagai fitur bundled di SEMUA paket. Kenyataan di dashboard: seluruh sender yang terhubung berstatus **"Unofficial (QR Code)"**, dan contoh payload webhook resminya eksplisit berisi `"channel": "unofficial"`. "WABA Official API" ternyata sistem terpisah (kredensial/API key sendiri, autentikasi Bearer token berbeda) yang butuh registrasi manual lewat Meta portal ("REQUEST REQUIRED") — bukan otomatis aktif. Kesimpulan: jalur yang sedang dipakai (Standard/Unofficial) **setara level risiko dengan Fonnte** (sama-sama WhatsApp Web automation tidak resmi, risiko banned nomor), bukan upgrade keamanan.
- Sisi positif: dokumentasi API Bablast jauh lebih lengkap dari asumsi kita soal Fonnte — payload webhook `incoming_message` terdokumentasi eksplisit (field `event`, `sender_id`, `data.from`/`from_phone`/`from_name`/`content`/`message_type`/`channel`, dst.), ada Test API Playground interaktif di dashboard, dan endpoint kirim pesan (`POST /send`) sudah jelas formatnya. Ini berpotensi menghilangkan salah satu deployment blocker terbesar Gate 6J-C (field webhook Fonnte belum diverifikasi).
- Verifikasi webhook Bablast memakai header shared-secret statis (`X-Webhook-Secret`), BUKAN HMAC signing seperti yang sedang dibangun untuk Fonnte di Gate 6J-D5/D6. Lebih sederhana diimplementasi (tidak butuh Node `crypto` di n8n — blocker lain Gate 6J-C), tapi secara keamanan lebih lemah (shared secret statis lebih rawan replay/leak dibanding signature per-request).
- Perbandingan harga belum apple-to-apple — harga Fonnte terkini tidak diverifikasi ulang sesi ini (sengaja tidak menebak dari ingatan lama). Paket Bablast aktif sekarang kemungkinan **kelebihan fitur** untuk kebutuhan ADOP (blast massal/AI marketing tidak dipakai; ADOP cuma butuh kirim notifikasi + baca command `PAIR`/`VERIFY`) — paket lebih kecil kemungkinan cukup.
- **Belum ada keputusan pindah provider.** Ini murni riset/evaluasi; mengganti provider WhatsApp adalah perubahan arsitektur lintas gate (6J-C, 6J-D5/D6, 6J-D9) yang butuh approval eksplisit Founder sebelum implementasi diubah, sesuai `CLAUDE.md` §2/§3.

### 2026-08-20 — Full verification pass (typecheck, lint, unit test, integration test)
- Dijalankan atas permintaan user: "cek semua" status PASS/belum 100%. Tidak ada perbaikan kode dilakukan — murni cek dan catat (kecuali `pnpm db:reset` lokal, lihat catatan di bawah).
- `pnpm typecheck` → **FAIL** (2 error). Kedua error ada di `n8n/workflows/gema-assistant-inbound-pair-verify.proposal-v3-no-env-dependency.test.ts` (`Property 'notes' does not exist on type 'WorkflowNode'`) — file **uncommitted**, bukan bagian aplikasi inti, kemungkinan besar arsip review Gate 6J-D3 (lihat `CLAUDE.md` §8, disebut "tetap tidak disentuh, hanya arsip review"). Tidak disentuh sesi ini.
- `pnpm lint` → **FAIL** (1 error, 21 warning). Error: `_ephemeral-visual-check.cjs` (`require()` style import forbidden) — file scratch **uncommitted** dari sesi lain. 21 warning tersebar di beberapa `*.test.tsx` existing (`_prevState`/`_formData`/`_credentials` unused, prefix underscore — pola repo untuk parameter sengaja tidak dipakai, bukan indikasi bug).
- `pnpm test` (unit, no DB) → **PASS** — 185 test file, 1642 test, 0 gagal (4 todo).
- Docker Desktop tidak jalan di awal sesi → dinyalakan, siap dalam ~10 detik. `pnpm supabase:start` → stack lokal aktif (port `553xx` sesuai `README.md`).
- `pnpm test:integration` (run pertama, DB lama belum direset) → **FAIL** 6 file/7 test — root cause: state DB basi dari run sebelumnya (pesan error eksplisit menyuruh `pnpm db:reset`), bukan regresi kode.
- Dijalankan `pnpm db:reset` (lokal, aman — hanya reset DB dev lokal, bukan hosted/production). Semua migration re-apply bersih tanpa error fatal.
- `pnpm test:integration` (run kedua, DB bersih) → **FAIL** 1 test dari 171 (170 PASS): `tests/integration/morning-brief.integration.test.ts` — kasus "N concurrent real (non-dryRun) requests for the pilot tenant produce at most one fresh claim" mengharapkan status 200 di kelima request paralel, salah satu balik 503.
- Verifikasi ulang: `pnpm db:reset` + jalankan file test itu saja sendirian → **PASS** 10/10. Kesimpulan: **flaky, bukan deterministic failure** — indikasi race condition nyata di bawah beban 5 request concurrent lokal (kemungkinan resource/connection contention saat resolve recipient/claim), bukan sekadar bug urutan test (file punya `beforeEach` yang reset env tenant per test dengan benar, sudah diverifikasi).
- Supabase lokal & Docker Desktop **masih jalan** setelah sesi ini — belum di-stop, tersedia untuk sesi berikutnya.

### 2026-08-20 — Bootstrap sesi baru + pembuatan TRACKER.md
- Akun Claude Code baru memulai sesi tanpa riwayat chat sebelumnya.
- Bootstrap: baca `CLAUDE.md`, `PRD.md` (710 baris, penuh), `README.md` (291 baris, penuh), `git log` (101 commit), `git status`.
- Dibuat `TRACKER.md` ini per permintaan user — mencatat histori sesi/milestone dan backlog temuan/insight, karena belum ada dokumen tracker terpusat sebelumnya.
- Tidak ada perubahan kode/data. Working tree existing (`ADOP Private Demo Data/`, reskin prototype HTML, `assets/`, n8n proposal files, `.gitignore` mod) dibiarkan utuh — diduga milik sesi/user lain, tidak ditimpa.

---

## Backlog — Findings & Insights

| Tanggal | Sumber | Temuan/Insight | Status | Resolusi |
|---|---|---|---|---|
| 2026-08-20 | WhatsApp Owner (Pak Hanafi) | Owner mengonfirmasi preferensi format invoice ke client: **kirim link, client klik untuk download PDF** (bukan file terlampir langsung, bukan teks polos). Wajib diikuti saat implementasi "Invoice Delivery & Acknowledgement" (`PRD.md` §7.12) dimulai — belum ada implementasi apapun untuk fitur ini saat ini, jadi belum applicable, tapi jangan sampai terlewat saat gate itu mulai dikerjakan. | Open (menunggu gate implementasi Invoice Delivery) | — |
| 2026-08-20 | Bootstrap review | First-owner onboarding (commit `8d568ec`) sudah implemented lokal; gate berikutnya **Hosted Apply & UAT** belum dikerjakan. | Open | — |
| 2026-08-20 | Bootstrap review | Dark mode toggle tidak ada secara arsitektural — `body` tidak punya kelas `dark:bg`, tidak terkait pekerjaan accent-token manapun. Jika ada task styling di masa depan yang menyinggung dark mode, ini bukan regresi, ini gap yang sudah ada sejak awal. | Open | — |
| 2026-08-20 | Bootstrap review | Working tree berisi `ADOP_RESKIN_PROTOTYPE_TAILADMIN_v1.html`, `assets/`, `_ephemeral-visual-check.cjs`, dan `ADOP Private Demo Data/` yang belum di-commit dan belum jelas statusnya (exploratory prototype vs siap diintegrasikan). Perlu klarifikasi Founder/user sebelum disentuh atau dianggap final. | Open | — |
| 2026-08-20 | Bootstrap review | 4 file n8n baru (`gema-assistant-inbound-pair-verify.proposal-v2-native-crypto.*`, `proposal-v3-no-env-dependency.*`) belum di-commit. Berdasarkan pola gate 6J-D5/D6 di `CLAUDE.md`, kemungkinan besar ini arsip review Gate 6J-D2/D3 yang memang "tidak disentuh, hanya arsip review" — bukan pekerjaan aktif yang tertinggal. Perlu konfirmasi sebelum commit/hapus. | Open | — |
| 2026-08-20 | PRD.md §15 | Sejumlah besar Open Questions discovery (definisi opening/top-up/closing cash carry-forward, daftar Facility/Dock/Gate/Pelabuhan fisik, threshold transaksi besar, SLA review, jam Morning Brief final, dsb.) masih belum dijawab Founder — lihat `PRD.md` §15 untuk daftar lengkap (20 pertanyaan). Implementasi terkait wajib pakai default aman, bukan asumsi. | Open | — |
| 2026-08-20 | PRD.md §7.11 / CLAUDE.md §8 | GEMA Assistant (WhatsApp Copilot) — seluruh runtime (migration lanjutan, endpoint AI, komposer, provider Fonnte aktif) masih menunggu gate implementasi berikutnya meski kontrak sudah dibekukan final sejak Gate 6J-A. Field webhook Fonnte asli dan ketersediaan Node `crypto` builtin di hosted n8n **belum diverifikasi** — deployment-time blocker untuk Gate 6J-C. | Open | — |
| 2026-08-20 | CLAUDE.md §4 Gate 6J-D9-B1 | Kecocokan Supabase Auth Site URL/Redirect URL allowlist hosted project (`lgdxxntwpdrlzyhysuzu`) dengan domain production `adop-demo-gema.vercel.app` belum diverifikasi — Supabase CLI tidak punya subcommand read-only untuk cek Auth URL config, Dashboard browser butuh login manual. Butuh operator login manual atau otorisasi Management API read-only. | Open | — |
| 2026-08-20 | CLAUDE.md §4 (privilege hardening note) | Backlog security audit terpisah (di luar scope Gate 6J-B/6J-B1): default privilege schema-wide belum diaudit menyeluruh — exposure serupa disebutkan masih ada pada `claim_next_notification_event`/`complete_notification_event` dan standing `anon` access pada `client_contacts` di luar kolom digest. | Open | — |
| 2026-08-20 | Full verification pass | **Flaky integration test** — `tests/integration/morning-brief.integration.test.ts`, kasus "N concurrent real (non-dryRun) requests for the pilot tenant produce at most one fresh claim": salah satu dari 5 request paralel kadang balik 503 alih-alih 200. Terverifikasi bukan false-positive urutan test (env di-reset benar via `beforeEach`, DB sudah bersih via `pnpm db:reset`) — gagal sekali dari 2 percobaan, lolos 10/10 saat file dijalankan sendiri. Kemungkinan race condition nyata pada endpoint morning-brief di bawah beban concurrent lokal; root cause belum didiagnosis. | Open | — |
| 2026-08-20 | Full verification pass | `pnpm typecheck` gagal (2 error) di `n8n/workflows/gema-assistant-inbound-pair-verify.proposal-v3-no-env-dependency.test.ts` — file uncommitted, kemungkinan arsip review Gate 6J-D3 yang memang tidak dimaksudkan aktif. `pnpm lint` gagal (1 error) di `_ephemeral-visual-check.cjs` — scratch file uncommitted. Keduanya bukan bagian source aplikasi; perlu keputusan user apakah dihapus, di-commit, atau diperbaiki. | Open | — |
| 2026-08-20 | Evaluasi Bablast.id | **Keputusan provider WhatsApp (Fonnte vs Bablast.id) belum diambil final** — user sudah menyatakan arah: mau pakai WABA resmi, dan kalau Bablast bisa dipakai untuk itu, mau pakai Bablast. Temuan kunci jalur Standard/Unofficial: (a) fitur "Official WABA" TIDAK otomatis aktif di paket manapun — sender aktif sekarang semua "Unofficial (QR Code)"; (b) dokumentasi API/webhook Bablast jauh lebih lengkap dari asumsi soal Fonnte; (c) auth webhook jalur Standard pakai shared-secret statis (lebih lemah). Untuk jalur **WABA resmi** (yang direncanakan dipakai): lihat 2 baris backlog di bawah (proses registrasi 3 tahap + Dedicated/CoEx, dan konflik komposer canonical). Belum ada keputusan Founder final; belum ada aksi implementasi. | Open | — |
| 2026-08-20 | Evaluasi Bablast.id — WABA registration | Registrasi WABA resmi via Bablast butuh 3 tahap (ajukan → verifikasi admin Bablast → Meta Embedded Signup) dan pilihan mode **Dedicated** (nomor lepas dari WhatsApp seluler biasa) vs **Coexistence/CoEx** (nomor tetap dipakai biasa, kena limit Meta). Ini keputusan bisnis, perlu dikonfirmasi ke Pak Hanafi bersamaan dengan konfirmasi nomor mana yang dipakai (lihat item "hendro" di atas). Belum disubmit. | Open | — |
| 2026-08-20 | Evaluasi Bablast.id — batasan 24 jam Meta | **Temuan arsitektural:** aturan WhatsApp API resmi (berlaku di semua provider, termasuk Bablast WABA) melarang bisnis mengirim pesan proaktif kecuali dalam window 24 jam sejak user terakhir chat — pesan terjadwal/inisiasi-bisnis (Morning Brief, anomaly alert CRITICAL, notifikasi invoice) wajib pakai Template Meta yang perlu didaftarkan & disetujui dulu. Ini berpotensi **konflik dengan lock "satu komposer canonical untuk scheduled maupun interaktif"** di kontrak Gate 6J-A (`ADOP_GATE_6J_A_AI_HELP_EXECUTIVE_ASSISTANT_CONTRACT_v1.0.md`, dibekukan final). Command PAIR/VERIFY tidak terdampak (selalu balasan atas pesan user). Butuh keputusan eksplisit Founder untuk merevisi lock ini sebelum WABA resmi bisa diimplementasikan sesuai kontrak yang ada. Sisi positif: skema signing webhook WABA (HMAC SHA256) identik dengan yang sudah dibangun untuk Fonnte di Gate 6J-D5/D6 — berpotensi dipakai ulang. | Open | — |

---

## Referensi Cepat

- Source of truth priority: `CLAUDE.md` §3.
- Product locks & roadmap: `CLAUDE.md` §4.
- Status gate detail terbaru: `CLAUDE.md` §4 (Cross-Phase Locks) dan §8 (WhatsApp Copilot Rules) — selalu cross-check dengan `PRD.md` karena `CLAUDE.md` bisa lebih baru untuk gate yang sangat lokal.
- Open discovery questions: `PRD.md` §15, `README.md` §"Open Discovery".
