# ADOP — Phase 3 WhatsApp E2E Local Evidence (Gate B Closeout)

Status: LOCAL EVIDENCE ONLY. Tidak ada eksekusi terhadap hosted n8n, Fonnte
nyata, atau nomor WhatsApp nyata pada gate ini. Dokumen ini adalah closeout
untuk Gap B dari audit Phase 3 sebelumnya (owner-control-whatsapp-e2e
integration test) — bukan sign-off untuk hosted UAT.

## 1. Scope gate ini

Founder Decision (rujukan permintaan gate):
- Kerjakan hanya Gap B (bukti E2E lokal, mock Fonnte).
- Gap A (observability status outbox di dashboard) — **ditolak**, tidak dikerjakan.
- Gap C (residual risk at-least-once delivery) — **diterima sebagai risiko yang didokumentasikan**, tidak dibangun mekanisme dedup baru.
- Anomaly Alert Routing — tetap out of scope.
- Hosted n8n/Fonnte nyata — tetap dilarang pada gate ini.

## 2. Perubahan

Satu file baru, murni test — tidak ada perubahan business logic, schema, RPC, route, UI, atau workflow JSON:

- `tests/integration/owner-control-whatsapp-e2e.integration.test.ts` (baru)

Tidak ada file production yang diubah. Tidak ada migration baru. Tidak ada
RPC baru. `owner-control-whatsapp-notification.json` tidak disentuh.

## 3. Exact chain yang dieksekusi

Setiap test memanggil kode production yang sama persis dengan yang dipanggil
n8n saat live (bukan simulasi terpisah):

```
mark_cash_import_batch_ready_for_review   (real RPC, real domain trigger)
  -> private.enqueue_notification_event    (real RPC, dipanggil dari dalam RPC di atas)
  -> POST /api/internal/notifications/claim    (real Next.js route handler, dipanggil langsung sbg fungsi)
       -> src/lib/notification-outbox/service.ts -> repository.ts -> RPC claim_next_notification_event (real)
  -> "Send via Fonnte" — DIGANTI dengan node:http server lokal di 127.0.0.1:<port acak>
       (satu-satunya bagian yang di-mock; body request { target, message } identik
       dengan yang dikirim owner-control-whatsapp-notification.json)
  -> POST /api/internal/notifications/complete  ATAU  /fail   (real route handler)
       -> RPC complete_notification_event / fail_notification_event (real)
  -> status kanonik notification_events.status (sent / pending / failed)
```

Route handler diimpor dan dipanggil langsung sebagai fungsi (pola yang sama
dengan `assistant-inbound.integration.test.ts` dan
`morning-brief.integration.test.ts`) — bukan lewat HTTP server terpisah,
tapi kode yang dieksekusi identik dengan yang berjalan saat request HTTP
nyata masuk.

## 4. Hasil per kategori wajib

| Kategori | Hasil | Bukti |
|---|---|---|
| Happy path | PASS | `stageReadyBatch` -> claim menghasilkan tepat satu event -> mock provider terima payload `{target, message}` identik -> `complete` -> status `sent` -> reclaim setelah sent = `null` |
| Message safety | PASS | Pesan diverifikasi TIDAK mengandung amount fixture (1.000.000/1.500.000/500.000), `SUPABASE_SERVICE_ROLE_KEY`, atau `INTERNAL_API_SECRET`; panjang pesan dibatasi (<400 char) |
| Replay pada complete | PASS | Memanggil `/complete` kedua kali pada event yang sama -> HTTP 409 `NOTIFICATION_CLAIM_MISMATCH`, status tidak berubah/tidak dobel |
| Failure path — bounded retry | PASS | 5 siklus claim+fail berturut-turut pada baris yang SAMA (id diverifikasi identik tiap siklus) -> `pending` x4 -> `failed` di percobaan ke-5 (sesuai `max_attempts=5` default) -> percobaan klaim ke-6 mengembalikan `null` (tidak diklaim lagi selamanya) |
| Failure path — recovery | PASS | Event yang gagal 1x (`pending`) berhasil diklaim ulang oleh worker berikutnya dan diselesaikan (`sent`) — retry yang legal tetap bisa sukses |
| Isolation & authorization | PASS | Request tanpa header secret -> 401; header secret salah -> 401; owner tenant-A sign-in asli tidak bisa panggil RPC claim langsung; admin tenant-A sign-in asli tidak bisa panggil RPC claim langsung; client anon tidak bisa membaca tabel `notification_events` langsung (RLS revoke-all) |
| Idempotency — enqueue replay | PASS | Memanggil `mark_cash_import_batch_ready_for_review` kedua kali pada batch yang sama -> ditolak `BATCH_NOT_ELIGIBLE_FOR_REVIEW` sebelum mencapai enqueue -> tepat satu notification claimable untuk batch tsb, bukan dua |

Catatan arsitektur: `claim_next_notification_event` tidak menerima parameter
tenant sama sekali, dan endpoint `/claim` tidak pernah mengembalikan
`tenant_id`/`subject_id` ke pemanggil (n8n tidak pernah tahu pesan itu milik
tenant mana). Karena itu "tenant tidak bisa mengambil notification tenant
lain" dibuktikan pada level yang benar secara arsitektural: tidak ada
pengguna tenant, peran apa pun, yang bisa memanggil RPC ini sama sekali —
bukan lewat filter per-tenant yang bisa dilewati.

`attempt_count` tidak bisa dibaca langsung dari test (tabel `notification_events`
zero-grant bahkan untuk `service_role` di level tabel — hanya RPC SECURITY
DEFINER yang bisa menyentuhnya, dan tidak ada RPC baca yang diekspos ke n8n
per desain). Bukti bounded-retry karena itu bersifat behavioral/black-box
(transisi status yang teramati persis 4x `pending` lalu `failed` di siklus
ke-5), bukan pembacaan counter internal — konsisten dengan kontrak yang sama
yang sudah dibuktikan exhaustive di pgTAP (`owner_control_notification_
outbox.test.sql`).

## 5. Bukti tidak ada network call / provider nyata

- Grep atas file test: tidak ada string `fonnte.com`, `FONNTE_SENDER_DEVICE_TOKEN`, `RECIPIENT_OWNER_WHATSAPP_NUMBER`, atau kredensial apa pun.
- Satu-satunya request keluar (`fetch`) pada setiap test selalu menuju `http://127.0.0.1:<port>` — server `node:http` yang dibuat di `beforeAll` file test ini sendiri, bind ke `127.0.0.1` (bukan `0.0.0.0`), port di-assign OS (`listen(0, ...)`), ditutup di `afterAll`.
- Nomor tujuan yang dipakai adalah konstanta lokal palsu (`62800000000`), didefinisikan di dalam file test, tidak pernah dibaca dari env var mana pun.
- Tidak ada `import` atau referensi ke `n8n/workflows/*.json` di file test ini — workflow n8n itu sendiri tidak diimpor/dijalankan/diaktifkan.

## 6. Residual risk (diterima Founder, tidak dibangun ulang)

At-least-once delivery semantics tetap berlaku: jika Fonnte sukses mengirim
tapi callback `/complete` gagal sampai sebelum lease direbut ulang, WhatsApp
message duplikat secara teoretis mungkin terjadi. Test di atas membuktikan
sisi state-machine-nya AMAN (replay `/complete` tidak pernah menghasilkan
state ilegal atau dua kali `sent`) — risiko yang tersisa murni "provider
mengirim pesan dua kali", bukan "database korup". Sesuai keputusan Founder,
tidak ada mekanisme dedup baru di sisi provider yang dibangun pada gate ini.

## 7. Hosted WhatsApp UAT — masih pending

Belum ada, dan tidak dicoba pada gate ini:
- Import/aktivasi `owner-control-whatsapp-notification.json` ke hosted n8n.
- Kredensial Fonnte nyata (`FONNTE_SENDER_DEVICE_TOKEN`) dalam bentuk apa pun.
- Pengiriman WhatsApp ke nomor nyata.

Ini butuh otorisasi Founder terpisah dan eksplisit sebelum dikerjakan.

## 8. Test run

```
pnpm supabase db reset   (local-only, sekali sebelum single-pass run)
vitest run --config vitest.integration.config.ts tests/integration/owner-control-whatsapp-e2e.integration.test.ts
  -> 5 passed

vitest run --config vitest.integration.config.ts   (single clean pass, semua 24 file)
  -> 23 file passed, 1 file gagal (invoice-evidence.integration.test.ts — Supabase
     Storage 502 "invalid response from upstream server", flake infra yang
     sudah didokumentasikan sendiri oleh vitest.integration.config.ts,
     tidak terkait notification/approval/WhatsApp, tidak disentuh gate ini)
  -> 169/170 test passed

vitest run   (unit suite penuh)
  -> 180 file passed, 1563 test passed, 4 todo
  -> 1 "worker exited unexpectedly" (vitest-pool infra flake, tidak ada test
     yang dilaporkan gagal karenanya)

eslint tests/integration/owner-control-whatsapp-e2e.integration.test.ts
  -> bersih, tanpa error

tsc --noEmit -p tsconfig.json
  -> 2 error, keduanya di n8n/workflows/gema-assistant-inbound-pair-verify.
     proposal-v3-no-env-dependency.test.ts — file WIP existing yang sudah
     ada sebelum gate ini dimulai (untracked di git status awal), tidak
     disentuh, tidak terkait file baru gate ini

next build
  -> PASS, semua route (termasuk /api/internal/notifications/claim|complete|fail) compile bersih
```

## 9. Phase 3 reassessment (berdasarkan scope LOCK, bukan fitur tambahan)

- **Completed pada gate ini**: bukti executable bahwa rantai
  enqueue -> claim (HTTP) -> provider (mock) -> complete/fail (HTTP) ->
  status kanonik benar-benar bekerja sebagai satu alur, termasuk bounded
  retry, replay-safety, dan tenant/actor isolation — semua lewat kode
  production yang sama persis yang akan dipanggil live, tanpa satu pun
  network call ke luar loopback.
- **Masih pending** (di luar scope gate ini, butuh keputusan/otorisasi terpisah):
  observability status outbox di dashboard (Gap A, ditolak eksplisit sebagai
  scope Phase 3); hosted n8n import/aktivasi + Fonnte nyata (hosted UAT);
  dedup provider-level untuk residual at-least-once risk (Gap C, diterima
  sebagai risiko, bukan dikerjakan).
- **Basis penilaian**: sebelum gate ini, rantai E2E hanya punya bukti
  per-potongan (pgTAP + unit test per RPC/route terpisah), tanpa satu test
  pun yang menelusuri seluruh rantai sekaligus. Gate ini menutup persis gap
  itu untuk bagian yang bisa dibuktikan secara lokal dan aman. Bagian yang
  butuh eksekusi nyata terhadap hosted n8n/Fonnte tetap di luar jangkauan
  apa pun yang bisa dibuktikan tanpa otorisasi terpisah — sehingga skor
  Phase 3 naik dari perkiraan audit sebelumnya (~65-70%) ke kisaran
  **~80-85%** untuk bagian yang secara arsitektural bisa diverifikasi
  lokal, dengan sisa gap eksplisit menunggu keputusan Founder (bukan
  pekerjaan teknis yang terlewat).
