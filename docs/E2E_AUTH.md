# Local authenticated browser checks

This Node-only QA harness uses normal Supabase `signInWithPassword` and verified
`getUser` calls. It does not bypass auth, change RLS, register users, or alter
Arbor's production code. Run with Node 22+ and an installed Google Chrome.

## One-time setup

An owner must provision a **dedicated, email-confirmed, disposable test account**
through the normal account flow. Never use personal credentials. Prefer a separate
development Supabase project. If using the hosted project, this remains real hosted
test data: only this explicitly designated account may be changed by tests.

Create `frontend/.env.e2e.local` locally with owner-only permissions (`chmod 600`).
Configure these names; do not paste secret values into chat or commit them:

- `ARBOR_E2E_EMAIL`
- `ARBOR_E2E_PASSWORD`
- `ARBOR_E2E_USER_ID` — the dedicated account's Supabase user UUID
- `ARBOR_E2E_ACCOUNT_IS_DISPOSABLE` — explicitly acknowledge with `true`
- `ARBOR_E2E_BASE_URL` — optional loopback origin; defaults to localhost port 3000

Existing `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
come from `frontend/.env.local`. Only a publishable/anon key is accepted, never a
secret/service-role key. Keep test credentials in `.env.e2e.local`, without a
`NEXT_PUBLIC_` prefix. Next.js does not load that file in normal development/builds.
Shell environment overrides file configuration. Do not put secrets in CLI arguments.

Start the usual local backend and frontend, then from `frontend/`:

```sh
npm run e2e:auth
npm run e2e:browser
```

The first command verifies/signs in, opens an isolated headless browser, and checks
that normal `/profiles/me` restoration returns 200 (saved profile) or 404 (onboarding).
The second leaves an isolated visible browser open. Press Ctrl+C in its terminal
to save the current session and close it. Closing the window directly discards the
cache safely. No profile/plan is created or reset by either command.

## Reuse from future Codex/browser tests

Import `withAuthenticatedBrowser` from `frontend/scripts/e2e/auth.mjs` in a Node
E2E script. Its callback receives `{ page, context, browser, reused }` using normal
Playwright APIs. Use this isolated page, not the user's normal Chrome profile.
The harness verifies both the email and user ID with Supabase **before** handing
the browser to a test. Do not copy its session into the personal browser.

Use normal product UI/API actions for fixture changes, scoped to this test account.
Do not add service-role access or bypass email confirmation/CAPTCHA/MFA. If those
block password sign-in, report the limitation rather than disabling protections.

The SDK manages refreshes. Missing/revoked sessions trigger at most one normal
password sign-in; connectivity errors fail without a retry loop. Logout is retained
when saving, then the next run signs in normally. Wrong identities fail closed.

## Sensitive artifacts

`frontend/playwright/.auth/test-user.json` is standard Playwright storage state
containing Supabase session secrets. The directory is mode 700, the file mode 600,
and both it and test artifacts are Git-ignored. Only the local app's SDK auth entry
is retained; other origins, cookies and financial inputs are excluded.

Never upload, attach, print, or commit this file. Do not enable tracing, HAR, video,
console/network capture, `DEBUG`, `PWDEBUG`, or `NODE_DEBUG` around authentication.
The launcher rejects diagnostic environment flags and reports sanitized failures.
Avoid concurrent runs against one account/cache (refresh-token rotation); a lock
prevents overlap. After a crash, remove only `playwright/.auth/run.lock` once no QA
process remains. Remove `test-user.json` to discard an uncertain session; this is
not server-side revocation. Sign out through normal auth to revoke a test session.

Fixture reset is deferred: the app has no narrowly scoped reset facility. Never
delete/reset a hosted profile or introduce an admin endpoint to manufacture one.
Use normal user-directed plan changes when appropriate, or separately provision a
fresh disposable account when onboarding itself must be tested.

Run helper regression tests with `npm run e2e:test`. These use synthetic SDK mocks,
never hosted credentials. Live `e2e:auth` success must be checked separately after
the dedicated account is configured. Production builds do not import this tooling.

## Separate hosted production QA

The generic `e2e:auth` and `withAuthenticatedBrowser` paths **remain loopback-only**.
Never pass a deployed URL to them or copy their cached session to a browser profile.

The separate `npm run e2e:hosted-qa` runner permits only `https://arbor.ph`,
the fixed production API origin, and the reviewed production Supabase project
origin. It uses the same owner-only `.env.e2e.local`
configuration (`ARBOR_E2E_EMAIL`, `ARBOR_E2E_PASSWORD`, `ARBOR_E2E_USER_ID`,
`ARBOR_E2E_ACCOUNT_IS_DISPOSABLE=true`) and the public Supabase URL and
publishable key from `.env.local`. Values must never be pasted into chat or logs.
Its two opt-ins must be supplied to the **current process**, not saved in an env
file:

```sh
ARBOR_HOSTED_QA=1 npm run e2e:hosted-qa
ARBOR_HOSTED_QA=1 ARBOR_HOSTED_QA_WRITE=1 npm run e2e:hosted-qa -- --write
```

The first command is read-only. It checks the dedicated account and tours the
live app in a fresh headless Chrome context. It never imports personal cookies,
Chrome profiles, or the local E2E session cache. It blocks unapproved network
origins and application writes. Arbor's normal automatic snapshot POST is
answered locally with the genuine history from the preceding portfolio GET,
so a read-only tour does not create an observation or invent chart data.
The backend's exact `/v2/future-projection` POST is permitted because it is
documented as an ephemeral calculation that saves no scenario or history;
other POSTs remain blocked without a reviewed write scope.

The second command is intentionally write-capable and must be used only after
the harness safety tests pass and its cleanup plan is reviewed. It allows only
bounded owner-scoped actions for the current QA run. New investment entries are
voided through Arbor's existing correction API, and newly created pending
recordings are dismissed through the normal resolve API in a `finally` cleanup.
If this run creates a monthly check-in, cleanup undoes it through Arbor's
normal check-in API; the audit history remains. A single-run lock at
`frontend/playwright/.auth/hosted-qa.lock` prevents overlapping hosted runs.
After an interrupted run, inspect the dedicated QA account and confirm no QA
process remains before removing that lock and retrying.
The runner compares active holdings, entries, pending items and check-in state
with the pre-run baseline and reports any cleanup failure. Voided entries remain
as audit history. Do not use it to manufacture snapshots or alter a real user.

Both modes require `getUser` to match the configured dedicated email and UUID;
credentials alone are insufficient. Neither mode changes market data, NAVs,
prices, feature flags, cron jobs, migrations, auth configuration, or billing.
The runner rejects lookalike domains, HTTP, `www`, preview URLs and arbitrary
hosts. No screenshots, traces, HAR, videos or raw network logs are saved.

Before hosted use, run `npm run e2e:test`; this exercises both the unchanged
local refusal and the hosted origin/identity/write gates with synthetic data.
