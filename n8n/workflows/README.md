# n8n workflows

## owner-control-whatsapp-notification.json

Gate 1L — claims one pending `notification_events` row from ADOP every
minute, sends it via Fonnte, then reports success/failure back so ADOP can
mark it `sent` or retry it.

Import this file into n8n, then set these variables in n8n's own
environment (never in this repo, never hardcoded in the workflow):

| Variable                  | Purpose                                              |
| -------------------------- | ----------------------------------------------------- |
| `ADOP_APP_URL`              | Base URL of the ADOP deployment (e.g. `https://app.example.com`) |
| `ADOP_INTERNAL_API_SECRET`  | Same value as ADOP's `INTERNAL_API_SECRET` env var    |
| `FONNTE_TOKEN`              | Fonnte device/API token                               |
| `OWNER_WHATSAPP_NUMBER`     | Pak Hanafi's verified WhatsApp number                 |

This workflow only ever calls ADOP's `/api/internal/notifications/{claim,complete,fail}`
routes and the Fonnte send API — it never talks to Supabase directly and
never calls any ADOP approve/reject/import endpoint.
