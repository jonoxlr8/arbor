# Arbor product previews

Captured September 25, 2026 from Arbor's existing authenticated interface on the
3U-F working tree, based on `e7f2048`. These are screenshots, not generated UI.

The isolated local portfolio fixture supplied illustrative values: an ATRAM
fund recorded at PHP 8,000, one VT share valued at PHP 5,600, and 0.001 BTC valued
at PHP 3,000. The contribution example uses PHP 5,000. These are not customer
holdings, verified performance, investment recommendations or executed trades.
The greeting uses the neutral name Alex; no account email or identifier is shown.

Live Portfolio and monthly check-in recording were available only in the local
fixture for these captures. Website captions identify them as previews that are
not yet enabled. No production feature flag or financial record was changed.
Screenshots must be refreshed when the released product or availability changes.

`home`, `holdings`, `allocation`, `contribution`, `ask` and `fund-value` show the
actual corresponding views. Mobile variants are separate actual captures.
WebP files are used by the website; `home-social.png` is the compatible input for
Next.js social-image rendering. No performance chart/history was fabricated.

Arbor's mark is the existing approved local artwork. Provider and issuer names
use the existing app identity system and are not partnership claims. Corporate
identity tiles are typographic fallbacks, not official logos. Existing Bitcoin
artwork attribution is retained in the website disclosures. See
`docs/INVESTMENT_IDENTITY.md` and `frontend/public/identities/NOTICE.md` for asset
provenance and outstanding corporate-logo permissions.

To reproduce, use `scripts/e2e/marketing-assets.mjs` with the repository's
isolated E2E authentication workflow and local portfolio/monthly fixture. The
script requires the fixture response marker and an empty local holdings store
before it creates examples. Never run it against customer data.
