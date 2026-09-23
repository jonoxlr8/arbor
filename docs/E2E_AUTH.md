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
