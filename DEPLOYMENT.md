# Arbor private-beta environment contract

This document configures code only; it does not prove live Supabase security.
Do not invite users until Step 3N-C verifies policies/constraints and Step 3N-D
completes deployment, smoke tests, confirmation email, and two-account tests.

## Frontend — build from `frontend/`

| Variable | Purpose | Exposure |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project HTTPS URL | Browser-safe |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Project publishable key; never a service-role key | Browser-safe; RLS is required |
| `NEXT_PUBLIC_API_BASE_URL` | Backend HTTPS base URL, optionally with a path prefix | Browser-safe |
| `NEXT_PUBLIC_SITE_URL` | Frontend origin for confirmation returns, e.g. `https://arbor.example.com` | Browser-safe; required in production |

Next embeds public variables at build time: changing them requires a rebuild.
Never put secrets in `NEXT_PUBLIC_*`. Set these variables in the hosting platform,
not in tracked files. Local `.env.local` files are ignored.

Development/test can default the API URL to `http://localhost:8000`.
Production requires an explicit non-local HTTPS URL. Trailing slashes are removed;
credentials, query strings and fragments are rejected. Even a local production
build must supply HTTPS configuration; use an example HTTPS URL for build-only
verification, never as an actual deployed API destination.

Install from the lockfile, run `npm run build`, then
`npm run start -- --hostname 0.0.0.0 --port "$PORT"` on a conventional Node host.
Supply a supported Node runtime.
The current Google Fonts integration needs outbound network access during build.

## Backend — run from `backend/`

| Variable | Purpose | Exposure |
| --- | --- | --- |
| `APP_ENV` | `production` on every deployed backend; defaults to `development`; `test` also supported | Server configuration |
| `SUPABASE_URL` | Same project URL used by the frontend | Configuration, not secret |
| `SUPABASE_KEY` | Least-privileged Supabase key; current design supports the anon key | Keep server-side; never substitute an admin/service-role key to bypass RLS |
| `CORS_ALLOWED_ORIGINS` | Comma-separated exact frontend origins | Server configuration |
| `PORT` | Port provided by hosting platform | Server configuration |

Example non-secret production CORS setting:
`CORS_ALLOWED_ORIGINS=https://arbor.example.com`

Production requires configured, non-local HTTPS origins. Wildcards, credentials,
paths (other than a trailing slash), queries, fragments, and malformed entries are
rejected. Entries are trimmed, deduplicated, and normalized. In development only,
an omitted value defaults to `http://localhost:3000`; an explicit empty value fails.
Allowed methods are GET/POST/PUT/DELETE and headers Authorization/Content-Type.
Cookie credentials are disabled: the application uses bearer tokens.

Install `requirements.txt` in a tested Python environment. Start with:
`uvicorn app.main:app --host 0.0.0.0 --port "$PORT"`

Do not use `--reload` or debug tracebacks in production. Use HTTPS for both services,
with outbound HTTPS access to Supabase/PostgREST/JWKS. `GET /` is a liveness check,
not a database-readiness check. Separate frontend/backend origins are supported.

No OpenAI key is needed for the current deterministic Explain my Arbor plan beta.
Do not provision the unused local `OPENAI_API_KEY` in production.

## Authentication and profile creation

The verifier derives issuer `<SUPABASE_URL>/auth/v1` and JWKS from the project URL.
It requires `exp`, `iat`, `iss`, `aud`, `sub`, verifies the `authenticated` audience,
UUID subject and ES256 signature, and retains five-second clock leeway.
`nbf` is checked if present. Confirm the real project contract in 3N-C, especially
if custom domains, token hooks or third-party issuers are introduced.

POST `/profiles` never overwrites an existing saved profile. Existing profiles are
returned canonically with a recovery notice; edits belong to PUT `/profiles/me`.
After an uncertain insert, only a successful owner-scoped canonical read establishes
recovery. The frontend aborts timed-out creation and performs one bounded canonical
read, not an automatic second POST. Each phase has a 12-second deadline.

**Mandatory Step 3N-C dependency: `profiles.user_id UNIQUE NOT NULL`.**
The pre-read is not a concurrency lock. Without database uniqueness, simultaneous
first inserts can still create duplicate rows. Verify constraints, existing duplicate
data, Auth-user references, and RLS before inviting users. This milestone adds no
migration and changes no live policy. Verify user-owned SELECT/INSERT/UPDATE/DELETE
policies and UPDATE ownership checks for profiles/holdings. Ordinary users must not
write `portfolio_assets`; its non-sensitive model data must be readable by the
backend's least-privileged role. Validate all three production model portfolios.

Also verify Site URL, exact confirmation redirects, external email delivery, backups,
and direct Data API isolation between two disposable accounts. Keep operational logs
to routes/status/timing and sanitized exception categories; never log tokens, financial
payloads, authorization headers or chat messages. `.env.example` files may contain
placeholders only.

## Supabase Auth + Resend SMTP release checklist

Arbor calls Supabase `signUp` and `resend(type: signup)`; Supabase alone sends
confirmation emails through its configured SMTP provider. No Resend SDK, backend
mail endpoint, or Resend environment secret is needed by Arbor.

`NEXT_PUBLIC_SITE_URL` is an origin only (no path/query/fragment/credentials).
After explicit confirmation, Arbor returns to its root `/`, where the account
coordinator restores the saved profile or onboarding. The confirmation page uses
the existing browser SDK to verify the email token hash and save the session.
Existing local session persistence, URL session detection and refresh remain intact.
Development/test defaults to `http://localhost:3000/`; production fails for missing,
local or non-HTTPS configuration. Use the actual deployed frontend origin, not the
API origin. Changing a public variable requires rebuilding the frontend.

Jonathan must configure and verify externally (not provable from this repository):

1. Verify the sending domain in Resend and publish its required DNS records.
   Choose a sender address on that verified domain and a recognizable Arbor sender name.
2. In Supabase Authentication / SMTP settings, configure Resend custom SMTP:
   host `smtp.resend.com`, port `465`, username `resend`, password the Resend API key.
   Keep that key only in Supabase/the secret manager, never a public frontend variable.
3. Keep Confirm Email enabled. Set Supabase Site URL to the deployed frontend root
   and allowlist that exact confirmation redirect (including `/`). Explicitly list
   localhost only for development; do not use broad production wildcards.
4. Use the prefetch-safe Confirm signup template below. It carries
   `{{ .TokenHash }}` to Arbor rather than opening a verification URL from email.
   Check templates for old localhost links and unintended branding.
5. Review Supabase email/endpoint limits and Resend sending capacity, sender-domain
   status, bounce logs, and delivery to external recipients. The UI's 60-second
   resend cooldown is courtesy throttling, not enforcement or a delivery guarantee.
   Disable link tracking/rewriting for authentication emails where configured.
6. Test signup → inbox/spam → confirmation → onboarding, revisit/login/logout,
   resend, expired/reused links, and cross-browser confirmation using disposable
   accounts. Verify production links return to the correct domain and persisted
   profiles still restore. Never log confirmation URLs/tokens.

Resend does not create accounts. Signup/resend have bounded UI waits and no automatic
email retries; a timed-out SDK request may still send an email. Success copy does
not disclose whether an address exists.

References: [Supabase SMTP](https://supabase.com/docs/guides/auth/auth-smtp),
[redirects](https://supabase.com/docs/guides/auth/redirect-urls),
[resend API](https://supabase.com/docs/reference/javascript/auth-resend),
[Resend SMTP](https://resend.com/changelog/smtp-service).

## Prefetch-safe signup confirmation (arbor.ph)

Deploy `/confirm-signup` before updating the Supabase **Confirm signup** template.
Set `NEXT_PUBLIC_SITE_URL=https://arbor.ph` and Supabase Site URL to `https://arbor.ph`;
allow the exact post-verification return `https://arbor.ph/`. Keep Confirm Email on.
Paste this HTML into the Confirm signup email body (also used by signup resend):

```html
<h2>Welcome to Arbor</h2>
<p>Confirm your email address to continue building your Arbor plan.</p>
<p><a href="https://arbor.ph/confirm-signup#token_hash={{ .TokenHash }}&amp;type=email">Continue to email confirmation</a></p>
<p>On the Arbor page, select Confirm email address to finish.</p>
<p>If you didn’t request an Arbor account, you can ignore this email.</p>
```

This uses Supabase's [prefetch-safe intermediate-page pattern](https://supabase.com/docs/guides/auth/auth-email-templates#email-prefetching)
with its documented [TokenHash verification](https://supabase.com/docs/reference/javascript/auth-verifyotp):
`auth.verifyOtp({ token_hash, type: "email" })`. The email type is intentional,
including for signup confirmation. No nested ConfirmationURL or client-controlled
redirect is accepted. The fragment is not sent to Arbor/Vercel in the HTTP request.
On load, the page clears it from the address bar/history entry and keeps the parsed
values only in memory. Refreshing requires reopening the email link.

There is no verification on load and no token-bearing anchor on the page.
Only pressing Confirm email address calls the existing Supabase browser client.
The SDK saves the verified browser session before Arbor returns to its configured
root and runs normal profile recovery. The UI has a 15-second deadline and no
automatic retry; a timed-out SDK request can still finish and establish a session.
Missing/invalid/expired/used links and network failures offer login/resend.
Request a fresh email after deploying/changing the template; old nested-URL emails
are no longer accepted. Disable Resend click tracking/link rewriting and exclude
this route from any future analytics/session replay/URL logging. The route sets
no-referrer and noindex/nofollow metadata; never log confirmation URLs or tokens.
Email providers necessarily handle the original email link. This is protection
against automatic fetches, not a guarantee against scanners that simulate clicks.

## Password recovery

Deploy `/forgot-password` and `/reset-password` before enabling the login link.
Keep `NEXT_PUBLIC_SITE_URL=https://arbor.ph` (build-time setting) and Supabase
Site URL `https://arbor.ph`. Add this exact Supabase Auth Redirect URL:
`https://arbor.ph/reset-password`. Local testing may separately allow
`http://localhost:3000/reset-password`; do not add broad production wildcards.
No new environment variable or Resend API key is required.

In Supabase Authentication → Email templates → **Reset password**, use:

```html
<h2>Reset your Arbor password</h2>
<p>Use the link below to choose a new password.</p>
<p><a href="https://arbor.ph/reset-password#token_hash={{ .TokenHash }}&amp;type=recovery">Continue to password reset</a></p>
<p>On the Arbor page, select Verify reset link to choose a new password.</p>
<p>If you didn’t request this, you can ignore this email. Your password has not changed.</p>
```

Deploy the updated reset page before changing the template. Keep the exact allowed
redirect above: Arbor still calls `resetPasswordForEmail` with that validated URL.
The new email opens Arbor without consuming the token. Its fragment is not sent
to Arbor/Vercel in the initial HTTP request. On load Arbor validates and immediately
clears the fragment, keeping the hash only in component memory. It does not load
the SDK or verify on page load. Only **Verify reset link** calls
`auth.verifyOtp({ token_hash, type: "recovery" })`; the SDK then stores its normal
browser session and emits `PASSWORD_RECOVERY`. Both successful explicit verification
and the matching recovery identity are required to open the password form. An
ordinary session or a previous recovery event alone is insufficient.
Refreshing requires reopening an unconsumed email link or requesting a new email.
Old ConfirmationURL emails are no longer supported by this page; request a fresh
email after deploying/changing the template. Missing/invalid/expired/used links
offer login and another reset request. The route uses no-referrer/noindex metadata.
Exclude it from URL analytics, session replay and request-body logging. Never copy
token-bearing links into logs or support tickets.

The client minimum is 8 characters; Supabase's configured password policy remains
authoritative and can be stronger. Check the project's policy before release.
After `updateUser({ password })`, Arbor signs out the **local** recovery session
and offers normal login. If sign-out fails, retry sign-out; do not repeat the
password update. This does not promise revocation of other devices' sessions.
Requests have bounded UI waits; SDK requests may still complete after a timeout.

Keep existing Resend SMTP and email verification settings. Disable email click
tracking/link rewriting. The intermediate page prevents a simple email-link fetch
from consuming the one-time token; it cannot protect against scanners that simulate
the explicit button interaction. Email providers necessarily handle the original
link. Do not use `ConfirmationURL` in the reset template or change its type to
the signup flow's `email` type.
Test delivery with actual inbox providers; neutral request success is not proof
of delivery. Email quota/capacity and SMTP delivery remain dashboard concerns.

Release check: existing account → Forgot password → neutral response → inbox link
→ Verify reset link → matching new password → local sign-out → login with new password → saved v1/v2
profile restoration. Also test nonexistent email, expired/reused/missing link,
mismatched passwords, network failure and signup/confirmation/resend regression.
See [Supabase recovery API](https://supabase.com/docs/reference/javascript/auth-resetpasswordforemail)
and [password update](https://supabase.com/docs/reference/javascript/auth-updateuser).

Release test: opening/prefetching the Arbor link must leave the user unverified;
clicking Confirm email address must verify and restore onboarding/dashboard. Test
signup and resend, mobile/desktop, another browser, missing/malformed links, expired
and reused links. No live verification or Auth settings are changed by repository
tests. If users remain unverified after clicking, inspect Supabase Auth/provider logs
without copying tokens; prefetching is not proven solely by a redirect to `/#`.
