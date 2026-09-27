# Phase 2A: current value, primary goal and illustrative projection

This local milestone does not change the dated-investment ledger, market-data
freshness, snapshot capture or contribution planner. No database migration is
required: `profiles.goal_target` remains the sole saved goal amount; optional
`goal_name` and `goal_date` live in the existing owner-scoped `v2_inputs` JSONB.
Goal edits use the profile revision and compare-and-swap update under the normal
user JWT/RLS. Existing profiles without metadata display “Your goal”.

The shared graph state has five presentation states: empty zero, current only,
single recorded, historical and incomplete. The flat lines use only in-memory
drawing coordinates. Only real `arbor_portfolio_snapshots` rows are exposed as
history, range controls and value-change inputs. Investment dates remain ledger
activity dates, never retrospective portfolio valuations. Recorded-cost gain/loss
continues to come from the backend's complete Phase 1 aggregate cost and current
value; an unknown opening/addition cost means gain is unavailable.

The Plus-only `/v2/future-projection` endpoint is read-only and rejects a
short-term, non-explicit or non-actionable plan and an incomplete portfolio. The
starting amount is the complete current recorded portfolio value, or zero with
no holdings; onboarding's planning starting amount is never added. It uses the
selected standardized plan's nominal annual effective assumption (4.0%, 4.5%,
5.0%, 5.5%) and a high-precision Decimal monthly rate
`(1 + annual_rate) ** (1/12) - 1`. There are only **whole end-of-month**
contribution periods: count calendar-month anniversaries from today's
Asia/Manila date to the exact target date; a shorter final partial month adds
no contribution period. Month-end anniversaries clamp to the last calendar day.
The returned PHP amount is rounded half-up to cents for presentation. The 3%
inflation assumption is disclosed separately; the displayed projection is
nominal and hypothetical, not a guaranteed return. What-If overrides are not
saved. The server enforces `future_projection` for Plus, independent of UI.

Phase 2B may use the ledger activity feed for actual monthly investment
additions, but monthly check-ins must continue to be separate records until
that workflow is explicitly designed. Goal progress reads the current canonical
portfolio total and does not count unavailable holdings as zero. No history is
backfilled from investment dates.
