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

### n8n Webhook node wrapper boundary (Gate 6J-C1.1)

n8n's `n8n-nodes-base.webhook` node does not hand a Code node the raw
provider payload — `$input.item.json` is n8n's own wrapper:

```json
{ "headers": {...}, "params": {...}, "query": {...}, "body": {...}, "webhookUrl": "...", "executionMode": "production" }
```

Fonnte's fields (`device`, `sender`, `message`, `text`, `senderid`,
`inboxid`, `timestamp`) live under `.body`, never at the wrapper's top
level. `Normalize Provider Payload` reads this deterministically:

```js
const input = $input.item.json;
const body = input && input.body && typeof input.body === 'object' ? input.body : input;
```

`input.body` (an object) is the canonical production path. The
direct-body fallback (`body = input`) exists only for compatibility/testing
— e.g. this workflow's own contract test invoking the node against a bare
Fonnte payload with no wrapper — and is a strict `typeof` check, never
`||`, so a wrapper whose `.body` is missing or not an object (a raw string,
for instance) falls through to an **all-empty envelope** rather than
throwing. `Validate Required Fields` (the very next node) then fails that
closed on its own required-field conditions — see
`fonnte-inbound-payload.fixture.json`'s `malformed.missingBody` /
`malformed.nonObjectBody` cases and their contract tests. A field faked at
the wrapper's top level (e.g. a forged top-level `sender`) can never
override the real nested `body.sender`, since `body` is fully replaced by
`input.body` when present — never merged with the wrapper.

`fonnte-inbound-payload.fixture.json` carries three shapes: `wrapped`
(mirrors the real n8n Webhook node output — the canonical shape),
`direct` (the bare Fonnte body, compatibility/testing only), and
`malformed` (missing/non-object `.body`). All are synthetic values only.

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
  Fonnte inbound webhook delivery (Gate 6J-C1), read through n8n's real
  Webhook node wrapper (Gate 6J-C1.1 — see "n8n Webhook node wrapper
  boundary" above).** The `Normalize Provider Payload` node maps
  `device` -> `receiverAddress`, `sender` -> `senderAddress`, `message` ->
  `messageText`, `timestamp` -> `providerTimestamp` (Unix seconds, passed
  through verbatim — never replaced with n8n's own receive time), reading
  all of these off `$input.item.json.body`, not `$input.item.json` itself
  (Gate 6J-C1.1 fixed an earlier bug that read the wrapper directly and so
  never actually saw Fonnte's fields). `senderid` (a WhatsApp sender
  identity/LID) is never used as a message id, and `text` (Fonnte's
  BUTTON TEXT field) is never used as a plain-message fallback. See
  `fonnte-inbound-payload.fixture.json` for the verified field shape
  (synthetic values only, both wrapped and direct-body forms) and
  `gema-assistant-inbound-pair-verify.test.ts` for the mapping contract
  test that runs the real node code against it.
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

## gema-assistant-inbound-pair-verify.gate-6j-d5-native-crypto.json

Gate 6J-D5/6J-D6 — a candidate replacement for the signing/auth mechanics of
`gema-assistant-inbound-pair-verify.json` above, produced outside this repo
through a supervised n8n editing session and reconciled locally (JSON-only
review, no hosted n8n access) against the Founder's screenshot confirmation
of the two node fields that cannot be verified from an export alone. It
supersedes the two now-superseded review-only proposals
(`*.proposal-v2-native-crypto.json` Gate 6J-D2, `*.proposal-v3-no-env-dependency.json`
Gate 6J-D3 — left untouched, kept only as historical review artifacts) by
also fixing the gap those two still had.

What changed vs. the frozen `gema-assistant-inbound-pair-verify.json` graph:

- **Signing**: the `Sign Canonical Request` Code node (`require('crypto')`,
  disallowed on the hosted BOC n8n instance per Gate 6J-D1) is replaced by
  n8n's native `Sign Canonical Request (Native Crypto)` node
  (`n8n-nodes-base.crypto`), action `Hmac`, Type `SHA256`, Encoding `HEX`
  (confirmed directly from the node's Parameters panel — these fields are
  not present in the exported JSON, only Founder-screenshotted), secret
  sourced from the n8n credential **`ADOP Assistant Inbound Signing Secret`**.
- **Internal API auth**: `Post ADOP Inbound` no longer reads
  `$env.ADOP_APP_URL` / `$env.ADOP_INTERNAL_API_SECRET` (the hosted instance
  denies `$env` access entirely, confirmed Gate 6J-D1 retest). The URL is now
  the literal production endpoint
  (`https://adop-demo-gema.vercel.app/api/internal/assistant/inbound`), and
  the `x-internal-secret` header is injected via a `genericCredentialType` /
  `httpHeaderAuth` credential named **`ADOP Internal API Secret`** in this
  export (Founder-confirmed to be the same credential referred to elsewhere
  as "ADOP Internal API" — a label difference only).
- **Fonnte auth (the gap the two prior proposals left unresolved)**: `Send
  Safe Reply via Fonnte` no longer reads `$env.FONNTE_SENDER_DEVICE_TOKEN`.
  Authorization is now a `genericCredentialType` / `httpHeaderAuth` credential
  named **`ADOP Fonnte Sender Device Token`**.
- Node names in this export carry a literal `1` suffix (e.g. `Webhook
  Inbound1`, `Normalize Provider Payload1`) — an artifact of how the nodes
  were assembled in the n8n canvas. Left as-is per Gate 6J-D6's scope
  (no cosmetic renaming); the contract test references the real names.

Everything NOT listed above — required-field validation, the Fonnte payload
mapping (`sender`→`senderAddress`, `device`→`receiverAddress`,
`message`→`messageText`, `timestamp`→`providerTimestamp`), `inboxid=0`
handling, the safe-reply template allowlist, and the fail-closed graph shape
— is byte-identical to `gema-assistant-inbound-pair-verify.json` and covered
by `gema-assistant-inbound-pair-verify.gate-6j-d5-native-crypto.test.ts`.

**Status: documentation/local-artifact reconciled only.** This file has never
been imported into, or executed against, the hosted n8n instance; hosted
credential bindings and secret validity remain unverified until a separate,
explicitly-authorized supervised test (Gate 6J-D7). It does not replace
`gema-assistant-inbound-pair-verify.json` as canonical — that decision is
pending separate Founder authorization.

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
