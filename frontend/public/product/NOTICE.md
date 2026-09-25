# Arbor product previews

## Current premium captures — September 26, 2026

The active website uses `premium/`: optimized captures of the actual local app
with original Arbor vector icons and neutral Alex identity. The explicit
80/10/10 example has VT/Gotrade, VGT/Gotrade, Bitcoin/PDAX and a manual-value
ATRAM/GFunds holding, totaling PHP 161,400. These are not customer data.

Only the marketing browser substitutes eight demo history observations into
GET/snapshot responses. No fake history is persisted to local or hosted data.
The chart is recorded-value history, not performance or a forecast. Functional
tests separately exercise real fixture snapshot behavior.

Run `completion.mjs onboarding`, then `marketing-assets.mjs` using the existing
isolated disposable-account authentication helper and guarded loopback fixture.
All financial/profile storage is process-local; unknown hosted access fails
closed. Holdings are removed through UI afterward; stopping the fixture discards
its profile, history and monthly records. No production flags or data change.
Public availability copy follows the founder-confirmed activated private beta.

WebPs use responsive mobile crops and lazy loading below the hero.
`home-social.png` is input only to the generated social preview. `sizes.json`
records intrinsic dimensions. Earlier sets below are retained history only.

## Historical completion-pass captures — September 25, 2026

The active website now uses `completion/`: 17 WebPs totaling 381,032 bytes,
plus a separate 211,350-byte PNG for the social-image renderer. They are actual
captures of the current local UI, using neutral Alex fixture data and the
unchanged supplied logos. Older image sets below remain historical only.

The explicitly chosen target is 80% Global Equity / 10% Technology / 10% Bitcoin.
The illustrative holdings total PHP 16,600: fund current value PHP 8,000, one VT
share at PHP 5,600, and 0.001 BTC at PHP 3,000. For a planned PHP 10,000 contribution,
the authoritative target-gap result is PHP 7,680 VT and PHP 2,320 VGT through
Gotrade; no new amount is assigned to Bitcoin. The contribution crop is a provider
summary, not the entire minimum-check screen or an instruction to trade.

The one recorded PHP 8,000 history point came from the first real fixture holding
save. It was not backfilled or changed to match the later current total. All test
holdings were removed afterward; the guarded fixture uses process-local storage,
not hosted financial/profile writes. No email or account identifier is in these
public assets. Production was checked read-only: Live Portfolio OFF, Monthly
Check-In ON. New local capabilities and gated tracking remain labeled previews.

See `docs/FULL_PRODUCT_COMPLETION.md` for current evidence. The following account
describes earlier captures and is not the current runtime/asset status.

## Historical supplied-logo captures

Refreshed with owner-supplied logos under `3ug1-supplied/` on September 25, 2026.
Previous `3ug1/` captures are retained as earlier review artifacts, not used by
the active public website. Captured from Arbor's existing authenticated interface on the
3U-G.1 working tree, based on `1b70d01` plus the existing uncommitted 3U-G work.
These are current app screenshots, not generated UI.

The isolated local portfolio fixture supplied illustrative values: an ATRAM
fund recorded at PHP 8,000, one VT share valued at PHP 5,600, and 0.001 BTC valued
at PHP 3,000. The contribution example uses PHP 5,000. These are not customer
holdings, verified performance, investment recommendations or executed trades.
The greeting uses the neutral name Alex; no account email or identifier is shown.

Live Portfolio was available only in the local fixture for these captures.
Monthly check-in recording remained disabled. Website captions identify them as previews that are
not yet enabled. No production feature flag or financial record was changed.
Screenshots must be refreshed when the released product or availability changes.

`home`, `portfolio`, `ways` (empty Portfolio), `catalogue`, `settings`,
`ask-desktop`, `holdings`, `allocation`, `contribution`, `ask` and `fund-value`
show actual corresponding views. Mobile variants are separate actual captures.
WebP files are used by the website; `home-social.png` is the compatible input for
Next.js social-image rendering. No performance chart/history was fabricated.

Arbor's mark is the existing approved local artwork. Provider and issuer names
use the existing app identity system and are not partnership claims. Corporate
artwork now uses the nine unchanged PNG originals supplied by the founder.
This does not establish licensing or endorsement. See
`docs/INVESTMENT_IDENTITY.md` and `frontend/public/identities/NOTICE.md` for asset
provenance and outstanding corporate-logo permissions.

To reproduce, use `scripts/e2e/marketing-assets.mjs` with the repository's
isolated E2E authentication workflow and local portfolio/monthly fixture. The
script requires the fixture response marker and an empty local holdings store
before it creates examples. Never run it against customer data.
