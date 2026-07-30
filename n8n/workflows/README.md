# n8n workflows

## gema-assistant-inbound-pair-verify.json

Gate 6J-C — canonical inbound gateway for the GEMA Assistant `PAIR <code>` /
`VERIFY <code>` commands only (Gate 6J-A/6J-B/6J-B1). No AI chat, no Public
FAQ, no Morning Brief, no invoice or anomaly-alert routing lives behind this
workflow — see `ADOP_GATE_6J_A_AI_HELP_EXECUTIVE_ASSISTANT_CONTRACT_v1.0.md`.

Graph: `Webhook Inbound -> Normalize Provider Payload -> Validate Required
Fields -> Sign Canonical Request -> Post ADOP Inbound -> Has Reply? -> Map
Safe Reply Text -> Send Safe Reply via Fonnte -> Fonnte Send Success? ->
Reply Sent / Reply Send Failed`.

### Required environment variables (set in n8n's own environment only)

| Variable | Role |
| --- | --- |
| `ADOP_APP_URL` | Base URL of the ADOP deployment — same variable the Gate 1L workflow already uses. |
| `ADOP_INTERNAL_API_SECRET` | Same value as ADOP's `INTERNAL_API_SECRET` — the baseline internal-auth header, shared with Gate 1L. |
| `ADOP_ASSISTANT_INBOUND_SIGNING_SECRET` | Same value as ADOP's `INTERNAL_ASSISTANT_INBOUND_SIGNING_SECRET`. Signs the canonical request (timestamp + exact raw body) — a SEPARATE, additional layer on top of the internal secret above, not a replacement. |
| `FONNTE_SENDER_DEVICE_TOKEN` | Sender device token — same Fonnte-paired device Gate 1L already uses to send. This workflow never registers a new device. |

None of these are ever hardcoded in the workflow JSON, this file, or any
test fixture — see `gema-assistant-inbound-pair-verify.test.ts`'s literal
secret/phone/tenant-id scan.

### Deployment notes / known limitations

- **Webhook payload field names are verified against a real captured
  Fonnte inbound webhook delivery (Gate 6J-C1).** The `Normalize Provider
  Payload` node maps `device` -> `receiverAddress`, `sender` ->
  `senderAddress`, `message` -> `messageText`, `timestamp` ->
  `providerTimestamp` (Unix seconds, passed through verbatim — never
  replaced with n8n's own receive time). `senderid` (a WhatsApp sender
  identity/LID) is never used as a message id, and `text` (Fonnte's
  BUTTON TEXT field) is never used as a plain-message fallback. See
  `fonnte-inbound-payload.fixture.json` for the verified field shape
  (synthetic values only) and `gema-assistant-inbound-pair-verify.test.ts`
  for the mapping contract test that runs the real node code against it.
- **Fonnte has no verified stable inbound message id (Gate 6J-C1).**
  `inboxid` can be `0` or absent, so the node only trusts it as
  `providerMessageId` (namespaced `fonnte:inbox:<id>`) when it is a
  positive integer; otherwise `providerMessageId` is left off the envelope
  entirely and ADOP derives a deterministic id server-side from
  `receiverAddress` + `senderAddress` + `providerTimestamp` + `messageText`
  (`src/lib/assistant-inbound/derive-provider-message-id.ts`) — never an
  n8n execution id or receive-time, either of which would break idempotency
  on a genuine provider retry. `Validate Required Fields` no longer requires
  `providerMessageId`; it requires `senderAddress`, `receiverAddress`,
  `messageText`, and `providerTimestamp` instead.
- **HMAC signing requires the n8n Code node to have access to Node's
  `crypto` builtin** (self-hosted n8n: `NODE_FUNCTION_ALLOW_BUILTIN=crypto`
  or equivalent). If that is not configured, the `Sign Canonical Request`
  node throws and the workflow fails closed — it never falls back to
  calling ADOP unsigned, since `/api/internal/assistant/inbound` rejects any
  request without a valid signature regardless (`x-internal-secret` alone
  is not sufficient). **Still unverified against the actual hosted n8n
  instance** (Gate 6J-C1's Audit B found no available access/credentials to
  the hosted BOC n8n runtime) — confirm this setting before relying on this
  workflow in production.
- The `Map Safe Reply Text` node's template strings must be kept in sync
  with `src/lib/assistant-inbound/safe-replies.ts` — the workflow's own test
  file asserts they match exactly; update both together.
- This workflow is checked in **inactive** (`"active": false`) and has never
  been imported into, or executed against, the hosted n8n instance. Importing,
  activating, and end-to-end testing against a real Fonnte device is a
  separate, later deployment step — not part of this gate.
- Existing outbound workflow (`owner-control-whatsapp-notification.json`,
  Gate 1L) is untouched by this gate.

## owner-control-whatsapp-notification.json

Gate 1L — claims one pending `notification_events` row from ADOP every
minute, sends it via Fonnte, then reports success/failure back so ADOP can
mark it `sent` or retry it.

### Sender vs. recipient — read this before configuring

Fonnte pairs to exactly **one** device/number: Hendro's own personal
WhatsApp number, already (or about to be) paired to Fonnte for this
project. That paired device is the ONLY number ever connected to Fonnte.

Pak Hanafi is never paired or connected to Fontte in any way — he is only
ever the **recipient** address in the `target` field of a `send` call,
exactly like any other outbound SMS/email recipient. Nothing in this
workflow, in ADOP, or in any config file registers his number with Fonnte.

| Variable                       | Role                                                                 |
| ------------------------------- | --------------------------------------------------------------------- |
| `FONNTE_SENDER_DEVICE_TOKEN`     | **Sender.** Hendro's personal Fonnte device/API token — the one number actually paired to Fonnte. |
| `RECIPIENT_OWNER_WHATSAPP_NUMBER`| **Recipient only.** Whatever number `target` should currently point at — never paired to Fonnte, just a destination address. |
| `ADOP_APP_URL`                   | Base URL of the ADOP deployment (e.g. `https://app.example.com`).    |
| `ADOP_INTERNAL_API_SECRET`       | Same value as ADOP's `INTERNAL_API_SECRET` env var.                  |

Set all four in **n8n's own environment** — never in this repo, never
hardcoded in the workflow JSON, never committed to Git in any form
(`.env.example`, test fixtures, or this file). This file and the workflow
JSON must never contain a real phone number.

### Staged rollout for `RECIPIENT_OWNER_WHATSAPP_NUMBER`

This gate ships with outbound notification only — no inbound WhatsApp, no
chatbot. Real message delivery is verified at the **Demo Release Gate**,
not here:

1. First, point `RECIPIENT_OWNER_WHATSAPP_NUMBER` at a test number Hendro
   controls, and confirm delivery end-to-end.
2. Only once that is confirmed working does `RECIPIENT_OWNER_WHATSAPP_NUMBER`
   get repointed at Pak Hanafi's real number.

Both are the same env var — swapping the recipient is a config change in
n8n, never a code or workflow change, and never requires re-pairing
anything with Fonnte (the sender device never changes).

Automated tests never call Fonnte and never use a real number — ADOP's own
test suite only exercises `/api/internal/notifications/*` against a fake
provider-message-id, and the actual Fonnte HTTP call in this workflow is
outside anything `pnpm test`/`pnpm test:integration` runs.

This workflow only ever calls ADOP's `/api/internal/notifications/{claim,complete,fail}`
routes and the Fonnte send API — it never talks to Supabase directly and
never calls any ADOP approve/reject/import endpoint.

### Pilot constraints (Founder-accepted)

1. Pilot is scoped to a single tenant: **PT PELAYARAN GEMA BAHARI**.
2. `RECIPIENT_OWNER_WHATSAPP_NUMBER` is one configured recipient. A second
   tenant must not be onboarded before tenant-scoped recipient routing
   exists.
3. Delivery is at-least-once. A duplicate notification can occur if Fonnte
   succeeds but the `complete` callback fails before the lease is
   reclaimed.
4. A duplicate notification must never be treated as a duplicate approval,
   acknowledgment, invoice, or transaction.
5. This workflow must be monitored during the pilot.
6. Runtime stays inactive until an internal dry run is approved.
7. Pak Hanafi's number must not be used before an internal test to
   Hendro's number PASSes and the Founder gives explicit approval.
