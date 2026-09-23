# Deterministic V2 next action

`GET /v2/next-action` restores the authenticated owner's canonical profile through
the existing profile reader. It accepts no decision inputs. V1 is unchanged.
`services/next_action.py` returns one immutable product-navigation action; V2 Ask
Arbor uses the same selector for “What should I do next?”.

Priority for valid saved profiles:

1. Contribution permission blocked → review financial-foundation answers.
2. Short-term path → review the short-term plan (never activate a dormant model).
3. Historical plan → review the existing plan, without claiming it is missing.
4. Explicit long-term plan → review contribution scenarios.

Verified profile absence returns `complete_profile`. Partial/corrupt saved rows
remain profile-load errors, not an invitation to overwrite them. New profiles
cannot be saved without explicit selection, so there is no separate persisted
“complete long-term profile but no plan” state to invent.

Implementation choices are temporary. No action claims they are complete, missing
or saved. Contribution review collects them for the current session. Getting
Ready retains its existing core-scenario permission; the planner retains the
readiness caution. No financial calculations or provider rankings occur here.

The Home card remounts on a canonical profile change, cancels old reads and fetches
again. No action/history/completion is persisted. Stable keys can support future
analytics and additional actions; no analytics, entitlements or notifications
are implemented. Missing-profile UI continues using the existing onboarding
route. Errors display Retry, not a guessed action.
