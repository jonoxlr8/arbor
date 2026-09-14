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
