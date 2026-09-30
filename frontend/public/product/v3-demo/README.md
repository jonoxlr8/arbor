# Arbor public demo captures — founder polish review

Captured locally on 2026-09-30 from frozen core release
`3a28f3c4609ab55643296e2645b387cfe5b68f6b`.

From `frontend/`, run `node scripts/e2e/website-product.mjs` with
`ARBOR_REVIEW_ORIGIN` pointing to the local production preview. Build with explicit
safe test-only site/API/auth origins; never use production account data.
A new isolated Chrome context fulfills every remote request with a fixture or
blocks it. No hosted authentication or financial writes occur. This is a
screenshot rendering fixture, not authenticated account QA. No personal Chrome
session or real credentials are used or persisted.

The existing backend Python environment is required. The script invokes unchanged
`ProfileV2Create`, `profile_v2_row`, `restore_profile_v2`, `calculate_monthly_plan`
and `future_value` locally, with no database or market-data calls.

## One coherent synthetic scenario

Maya is invented. Goal: PHP 3,000,000, “A place of my own”, 2036-09-30.
User-selected Aggressive approach with explicit Technology 10% and Bitcoin 10%:
Global Equity 80%, Defensive 0%, Technology 10%, Bitcoin 10%.
Chosen routes: VT/Gotrade, VGT/Gotrade and Bitcoin/PDAX.

One recorded holding: 12 VT shares, USD reference price 185.7142857142857,
illustrative USD/PHP rate 56. PHP value: 124,800; USD view: 2,228.57.
Recorded cost: PHP 116,000 = 108,000 opening cost plus a dated PHP 8,000
addition for 0.8 shares. Cumulative holding gain: PHP 8,800 (7.59% displayed).
Goal progress: 4.16% (4.2% displayed).

Synthetic history observations are declared in the script. They render through
the unchanged chart, rounded steps, period accounting and frozen ranges:
1W / 1M / 3M / 6M / 1Y / 5Y / All. Selected 1M chart gain is PHP 5,200,
distinct from cumulative holding gain. Added capital is cost, not profit.
USD observations consistently use the illustrative rate 56. These observations
are interface illustrations, not customer outcomes or imported price history.
No marketing smoothing or chart drawing is applied.

The frozen target-gap planner calculates a PHP 15,000 contribution as
VT 0, VGT 13,980, Bitcoin 1,020. All amounts reconcile to 15,000. The screenshot
retains minimum-check wording, including PDAX's unverified PHP minimum.
Planned amounts are not executed trades or recorded cost. The user decides.

The frozen future-value service produces PHP 2,588,597.29 from PHP 124,800,
120 end-of-month PHP 15,000 contributions and the selected Aggressive 5.5%
nominal annual planning assumption. Goal difference: -411,402.71.
The separate inflation assumption is 3%. This is illustrative, not guaranteed.
No What If state is saved.

## Capture framing

Light appearance; reduced motion; Chrome; 1440×1000 desktop and 390×850 mobile
Home/Portfolio viewports. Monthly crops use 1024×1600 and 390×1600.
The Monthly crop includes its real heading, total and every calculated row,
excluding subsequent accounting/provider panels. Bottom navigation is hidden
only during that crop so it cannot cover a financial row. App components and
styles are unchanged. `ways-detail.png` is captured from the actual VGT/Gotrade
continuation card in the same Ways sheet; the marketing preview is static.

PNG palette compression retains original dimensions. Explicit image dimensions,
eager/high-priority hero loading, and lazy loading elsewhere are preserved.

- home-desktop.png: 1440×1000
- home-mobile.png: 390×850
- portfolio-history.png: 1176×459
- portfolio-mobile.png: 390×850
- monthly-desktop.png: 760×773
- monthly-mobile.png: 358×905
- ways-mobile.png: 390×850 (retained provenance source; not rendered on homepage)
- ways-detail.png: 326×144

Public captions: “Illustrative demo—not actual investment performance.”
No real emails, account identifiers, balances, tokens or customer data appear.
No registration, investment, purchase or email is submitted.
