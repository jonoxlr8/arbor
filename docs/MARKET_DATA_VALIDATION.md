# Local real-provider validation — 3U-B.3

Validated on 2026-09-24 from clean `main` at `c478612`.
No hosted cache, holdings, profile or migration writes. Production activation remains off.

## Local credentials

`backend/.env.local` is ignored. Existing backend commands load `.env`, not `.env.local`.
For local validation, explicitly load only the ignored file using
`dotenv_values('.env.local')` and pass `MARKETSTACK_API_KEY` and `COINRANKING_API_KEY`
to the adapters. Do not print the dictionary. This needs no production loading change.
Use an isolated local cache, not the hosted `SharedCache` writer.
Suppress HTTP client debug logging; Marketstack credentials occur in query parameters.

## Observed live results

Four HTTP 200 requests: one Marketstack batch, one USD/PHP request, one PHP fiat
reference lookup, one direct BTC/PHP request. No retries or extra live failure tests.

| Observation | Decimal value | Effective UTC |
| --- | --- | --- |
| VT USD | 159.330000000000 | 2026-09-23 00:00:00 |
| VGT USD | 125.600000000000 | 2026-09-23 00:00:00 |
| BND USD | 70.810000000000 | 2026-09-23 00:00:00 |
| USD/PHP | 62.712472000000 | 2026-09-24 00:02:32 |
| BTC/PHP | 5287804.041086796780 | 2026-09-24 02:35:00 |

Adapter fetched-at: 2026-09-24 02:35:33.073614 UTC. PHP resolved to one fiat match;
direct reference currency was used, without a USD conversion fallback.
All normalized records entered the isolated in-memory cache; a second refresh
returned `cached` for all three sources with zero additional HTTP calls.
These observations are validation evidence, not current prices or permanent fixtures.

## Local integration

Replayed those exact normalized observations through existing isolated API-test storage:
10 VT = PHP 99,919.78; 20 BND = PHP 88,813.40; 0.01 BTC through PDAX metadata =
PHP 52,878.04. Total PHP 241,611.22; no unavailable/stale holdings at validation.
Gotrade grouping PHP 188,733.18; PDAX grouping PHP 52,878.04.
Growth targets remained 80/20/0/0; actual Global Equity was 41.36%, Bitcoin 21.89%.

A PHP 1,000 contribution scenario consumed canonical sleeve values, returned 200,
and accounted for all PHP 1,000. Gotrade's PHP 100 practical minimum remained intact.
Current value, Global Equity allocation and recorded Bitcoin chat questions returned
canonical facts. Two exact question forms initially routed to plan context; a narrow
intent-pattern fix now routes them to actual holdings. “What should I buy?” retains
the contribution explanation and does not choose securities. Local holdings were deleted.
This was local API/service validation, not a hosted database or browser integration run.

## Operational limits

For 5–10 users, valid shared-cache reads add no vendor requests. A continuous
ten-minute BTC refresh cadence is 4,320 requests/30 days or 4,464/31 days, plus
initial resolution; other use of the same API key must be budgeted separately.
There is no background scheduler or user-triggered ingestion yet. Operator refresh
is required; unused periods consume no requests. Existing mocks cover source failures
and retention without spending live quota.

Technical connectivity passed. Marketstack commercial customer-facing display rights
were not confirmed, and the display-rights gate remains. No manual official NAV was
locally supplied or ingested. Both 3U-A and 3U-B migrations remain unapplied; hosted
cache persistence, RLS and production activation still require deliberate validation.
The intended subscription stack remains Marketstack Basic only (working estimate
US$9.99/month), plus free Coinranking/Open FX and manual NAV; this test does not
verify an invoice, ongoing terms, or guaranteed future pricing.
