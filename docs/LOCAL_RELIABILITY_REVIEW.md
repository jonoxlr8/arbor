# Local memory / market-cron reliability review

Base6688185063112e45ec4f01b1f41b9e35d222ca64. Detached `/tmp/arbor-reliability-local`; uncommitted/unpublished. The ready UI release and whole-app audit are complete. This slice does not implement the separately reported chart endpoint defect or queued owner Admin.

## Changes

Authenticated table/RPC access now builds a small JWT-bound query description without opening HTTP or constructing Auth/Realtime/Storage clients. Execute uses the pinned public SyncPostgrestClient with a public context manager and closes its HTTP transport on success, SDK/HTTP failure and builder/construction failure. Caller-owned payloads are copied at query-building time; credentials and query payloads are excluded from repr. Only Arbor's existing fluent methods are supported. Existing application call sites and exception handling remain unchanged. The static unrelated Supabase singleton remains unchanged. No global owner bearer, private SDK subscription manipulation, forced-GC timer or dependency upgrade.

Ownership is **per query execution**, not a reusable connection pool for an entire API request. The adapter has immutable per-caller JWT configuration; every execution gets a fresh client. Building/abandoning a query allocates no transport. This deliberately trades within-request connection reuse for deterministic cleanup and a narrow compatibility patch.

Market refresh CLI now considers `unchanged_observation` a successful outcome. Existing cached/cooldown/updated/older-data-ignored/disabled statuses remain successful; mixed failures and unknown outcomes still exit1. Refresh/cache/vendor logic, cron schedule and reminder implementation are unchanged. No live refresh/vendor calls made.

## Qualification

4044backend tests PASS,2existing skips,1existing Starlette/httpx deprecation warning. New real pinned SDK wire tests cover select/count/filter/order/paging, insert/update/delete, RPC payload snapshot, owner headers/public schema, success/API-error/timeout/builder/constructor cleanup, unexecuted query allocation, concurrent ownerA/B isolation, repeated execution lifecycle, factory no Auth SDK and empty-token rejection. Five actual Supabase-vs-adapter wire parity cases preserve method/URL/body/apikey/Authorization/public-profile/Prefer. Five CLI outcome cases include unchanged, mixed valid, mixed failure and unknown, with network blocked. Python compilation and git diff --check PASS.

Frontend source tree is unchanged from published6688185. Current-source whole-app audit735tests/44browser safety/offlinebuild and ready UI lint/types checks remain relevant; no new frontend work requires another build. No claim of physical-device, hosted successful owner workflow or live schema/RLS revalidation in this local memory test. Existing request/Insights security releases remain unchanged.

Same pinned37dependencies/MacOS27arm64/Python3.14.6/OpenSSL3.5.7. Baseline68cef14 and current6688185 have identical backend Git tree e2c3c726132df5d5d9cc93c8bfc0b40f7595bfc3. Comparison uses real routes/client constructors, synthetic HTTP bodies, socket/DNS blocked, dotenv disabled, no owner env files. Portfolio/entries/lifecycle mix retained; no forced-GC during normal1000cycles. Explicit final GC is diagnostic only.

| Workload | RSS before | RSS before final GC | RSS after GC | live HTTP/SSL before GC | closed query HTTP |
|---|---:|---:|---:|---:|---:|
| Prior baseline1000×30points |80.56MiB|114.61MiB|151.59MiB|95/96|0|
| Local patch1000×30points |80.80MiB|82.83MiB|82.83MiB|1/2 static|9000|
| Patch fresh200A |80.72MiB|82.80MiB|82.81MiB|1/2 static|1800|
| Patch fresh200B |80.62MiB|82.72MiB|82.72MiB|1/2 static|1800|
| Patch20×10000points |80.89MiB|106.25MiB|106.25MiB|1/2 static|380|

All FDs stayed4 and network attempts0. Large-history response2028358bytes, Python traced peak12862082bytes. No fresh owner full Supabase clients created in patched workloads; only static baseline remains. Nine HTTP clients/SSL contexts per small cycle versus baseline six full clients/twelve HTTP+SSL contexts. Baseline post-GC RSS rising despite released objects was unexplained native/macOS residency, not proof of an unbounded leak. Prior diagnostic full evidence retained unchanged.

## Security / schema review

No schema/migration/grant/policy/function/export/erasure/retention/Terms/auth-config/credential changes. Bearer remains the caller's verified JWT; apikey routing key remains existing server configuration. Real SDK wire parity verifies user bearer was not replaced by a service role. Server identity/lifecycle/Terms admission and owner filters/RLS are unchanged. Public PostgREST schema fixed; no admin/other-customer financial access introduced. Concurrent isolation tests check actual request headers but do not replace a hosted two-owner RLS test. Existing auth verification remains responsible for accepting/refreshing JWTs; the adapter does not verify a token independently.

Official changelog https://supabase.com/changelog.md scanned; no relevant pinned Python-client breaking change requiring an upgrade. Public PostgREST docs https://postgrest-py.readthedocs.io/en/latest/api/client.html reviewed, with installed2.31.0source as exact signature/close authority. Public SyncPostgrestClient context manager calls aclose/session.close; supplied HTTP client settings match existing120sec/HTTP2/follow-redirects. No relying on private SDK state.

## Limits / bounded release proposal

Production OOM root cause is still **unproven**; this corrects one supported allocation/cleanup mechanism. Synthetic workloads do not model real TLS connections/pooling, Render Linux, production concurrency, all endpoints, native allocation or long-duration load. Per-query clients increase actual PostgREST connections compared with within-helper reuse (9versus6in small cycle); assess latency/rate/FD behavior after any approved API deployment. Do not claim a production memory cure or choose a paid upgrade on this evidence.

Review exact six-file patch/source hashes. Prefer two separate releases after explicit approval:
1. API-only memory change: authenticated_data.py,database.py,test_authenticated_data.py and this documentation; no frontend,cron,config/schema/vendor actions. Verify current main and exact server commit/config read-only, rebase in isolation if changed and rerun regression checks. Publish using skip-render then explicitly deploy only the API. After API is live, observe health/read-only error/memory/latency metrics and ordinary owner lifecycle/portfolio reads with separately authorized dedicated fixture. No financial writes. Roll back API to68cef14c4e3e3e3138c53683b230b86c5c3510fd if auth errors/latency/FD/memory regress.
2. Market-cron-only exit classification: __main__.py,test_market_cache_credentials.py; no API/frontend/reminder deploy/config/schedule changes. Explicit deploy only market service at reviewed commit, then wait for its normal scheduled run to confirm genuine unchanged exits0 and failures remain1. Do not manually refresh or trigger vendor calls. Roll back market service to0ae921a0e81fa8a7cbe617662433414d1f280728 if needed. Reminder latest22:00:24all0 is execution-path evidence, not email-delivery proof; reminder code stays unchanged.

No commit/push/deployment/config/schedule/manual job/vendor call performed here. Release proposal is reviewable, not approval to publish. Original checkout46preexisting dirty paths/indexempty preserved. Frozen release bundles retained intact.


## Oct3 approved current-main release qualification

Reapplied the exact five runtime/test files unchanged onto verified published7705d1e3dbf26681c529c9d9b38bfb983f073273 in detached /tmp/arbor-reliability-release-local. Prior local diagnostic bundle/worktree preserved. Fresh full backend regression4065PASS,2existing skips,1existing Starlette/httpx warning, synthetic environment/dotenv disabled. Frontend and dependencies unchanged; existing qualified UI bundle remains authoritative. Current API pre-releasee643152f53a225f327bda553a6ff07eb12a49ebd/dep-db08u0k9v7es73adp0q0; current market and reminder services0ae921a. Exact service command/schedule/plan/config metadata verified read-only. This release has direct user approval for API memory cleanup and market success-status correction, in that order; no reminder release/manual refresh/email/scaling/schema/credential changes. Use [skip render] to suppress all automatic Render deployments, then after readback explicitly trigger API and market only, reconcile existing actions rather than duplicate retries. Read public health, admission-denial routes, safe error summaries and resource metrics; observe the existing normal scheduled market run. Rollback API to current pre-releasee643152 to preserve the live Admin, not the older pre-Admin68cef14 mentioned in the historical proposal; rollback market to0ae921a. Original OOM cause remains unproven and production memory cure is not claimed. Signed-in owner workflows require a separately authorized disposable fixture, never personal cookies or production financial writes.

Fresh current-main1000-cycle synthetic profile completed with9000 query clients closed, zero real network/hosted writes and flat FDs; full exact measurements included in the release bundle. Final Python compilation and whitespace checks PASS. Five runtime/test source hashes exactly match the preserved original qualified patch.
