# n8n workflows

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
