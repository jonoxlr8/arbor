# Arbor product previews

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
