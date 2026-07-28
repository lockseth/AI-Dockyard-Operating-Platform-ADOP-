# Demo Owner Bootstrap (Gate 6G-B)

Idempotent CLI harness that provisions exactly one tenant + internal Founder
owner account in the ADOP Demo Supabase project. Fail-closed to a single
allowlisted target, dry-run by default, no destructive operations.

## What it provisions

For tenant **PT PELAYARAN GEMA BAHARI** (slug `pt-pelayaran-gema-bahari-demo`):

- the tenant row
- its legal entity
- one internal Founder `auth.users` account (never the design partner's real
  owner — the CLI prompts you for whoever that internal account actually is)
- an active tenant membership for that account
- the `owner` role on that membership
- a `privileged_bootstrap_run` audit event in `access_audit_events`

It never creates a second tenant, a project, an invoice, or any other
business data — see `plan.ts` for the exhaustive step list.

## Architecture

- `target.ts`, `identity.ts`, `validation.ts`, `plan.ts`, `journal.ts`,
  `audit.ts`, `redact.ts` — pure, no I/O, no network. Contract-tested
  directly.
- `types.ts` — shared types, including `BootstrapRepository`: the only
  interface the executor can call. It has no delete/truncate/reset method,
  so the executor is structurally unable to issue one.
- `repository.ts` — the **only** file allowed to hold a Supabase client or
  make a network call (enforced by `admin-client-only.test.ts`). Builds its
  own admin client rather than importing `@/lib/supabase/admin` because that
  module is guarded by `server-only`, which throws outside Next.js's server
  bundler — the same reason `tests/integration/support/members.ts` builds
  its own client instead of importing it.
- `executor.ts` — orchestrates guard → resolve → plan → (apply?) → journal.
  Pure aside from the injected `repository`; fully testable with a mock.
- `cli-args.ts` / `cli.ts` — the I/O shell: argv parsing, env loading,
  interactive prompts, printing. Thin by design.

## Running it

```bash
pnpm demo:owner-bootstrap            # dry-run (default, read-only)
pnpm demo:owner-bootstrap -- --apply # requires typed confirmation, then mutates
```

`jiti` (already present transitively via Next.js) runs the TypeScript CLI
directly — no `tsx`/`ts-node` was added as a new dependency. If a future
Next.js upgrade drops `jiti` from the dependency tree, this script needs a
dedicated TS runner added deliberately at that point.

### Dry-run

Prompts for the internal Founder owner's email and display name only —
**never a password**. Mode (`--apply` or not) is decided before any
identity prompt runs (`parseCliArgs`), so dry-run skips the hidden password
prompt outright instead of asking then discarding it; see `cli-flow.ts`'s
`collectIdentityInput` and `executor.ts`'s `RunBootstrapOptions`, which is
typed so a dry-run run structurally cannot carry a password at all. Resolves
live state read-only and prints the plan. Makes no writes. This is the
default — no flag needed.

### Apply prerequisites

1. `SUPABASE_SERVICE_ROLE_KEY` and `NEXT_PUBLIC_SUPABASE_URL` for the ADOP
   Demo project, plus `SUPABASE_PROJECT_REF=lgdxxntwpdrlzyhysuzu`, available
   either in the shell environment or in a gitignored `.env.demo.local` at
   the repo root (same convention as `.env.example` documents for
   `dev:demo`). Never pass these as CLI arguments.
2. Run with `--apply`. In addition to email/display name, the CLI now also
   prompts for the password (hidden input) and prints the exact target
   (ref/URL) and tenant, then requires you to type back
   `<ref> <tenant-slug>` verbatim before any write happens. A wrong or
   missing token aborts with zero mutations.

### Target guard

`target.ts` hardcodes the single allowlisted `{ ref, url }` pair — it is
never accepted as input, so there is no "arbitrary target override" surface.
Whatever the environment resolves to is only ever *compared* against that
constant. Localhost, this repo's sibling project (AODP), a similarly-named
unrelated project (ASOS), anything containing "production", and any
empty/inconsistent ref-vs-URL combination are all rejected before any query
runs.

### Recovery / partial failure

Auth user creation and the database writes that follow are not atomic. If a
step fails mid-run, the CLI reports which steps completed, which one failed,
and which are still pending — then exits non-zero. There is no automatic
rollback. Rerunning is safe: `resolveState()` re-reads live state on every
invocation, so already-completed steps resolve to `noop` and only the
pending steps execute. Nothing is duplicated.

### Existing-state conflicts

The planner refuses (STOP, no writes) rather than guess when:

- the email already has an active membership in a **different** tenant,
- the target tenant already has a **different** active owner,
- an existing membership for this email is `suspended`,
- more than one active legal entity already exists for the tenant, or
- an existing legal entity's `legal_name` doesn't match the locked identity.

These require human review in Supabase Studio — this harness does not take
over ambiguous existing state, and never resets an existing user's password.

## Forbidden here

- No delete/truncate/reset of anything.
- No creation of a second tenant, a project, an invoice, or the design
  partner's real owner account.
- No secret (password, service-role key, token) is ever logged, printed
  unmasked, or written to a tracked file.
