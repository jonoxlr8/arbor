# Local Ask improvements and feedback review

Qualified against published main `3e96f9fc82ecd6ae4eb198191374e320266dc00c` in `/tmp/arbor-ask-improvements-local`. No Ask commit, push, deployment, hosted migration, feedback collection, vendor call, account creation or email occurred.

## User experience

Explicit English/Taglish paraphrases use existing canonical answers. Ambiguity asks for clarification and does not read a plan or consume quota. Buy/sell/provider decisions remain bounded. Existing calculations, pricing sources, entitlement/usage admission and financial records remain the source of truth. Short answers retain an entire introduction; missing/stale/readiness/projection caveats remain visible. Full details are progressively available. Buttons use eight finite navigation destinations, with no write, trade, arbitrary URL or provider selection.

Feedback is optional: Helpful/Not helpful, then optional fixed-choice reason and explicit Save reason. Nothing is sent when a question/answer is rendered. A random answer UUID is reused for vote edits and retries. No chat, response or financial value is copied into feedback; only allowlisted fields are sent. No localStorage feedback/chat history, analytics, replay, model provider or automatic logging was introduced. Controls stay hidden when the capability is unavailable or uninstalled.

## Proposed fields and access

`public.arbor_ask_feedback` has exactly seven columns:

| Field | Source |
|---|---|
| id | Random client UUID, unique record for an answer vote |
| user_id | Database `auth.uid()`, never a request account selector |
| helpful | Strict boolean |
| reason | Nullable enum: unclear, not_my_question, numbers_look_wrong, missing_detail |
| intent | Finite reviewed answer-type enum |
| answer_version | Constant deterministic-ask-1 |
| created_at | Server timestamp; edits never extend retention |

RLS enabled; no direct policies/grants to PUBLIC, anon, authenticated or service_role. Two public authenticated-only definer RPCs, empty search paths: capability read and bounded vote save. Existing active-account/live-session/Terms checks remain mandatory. RPC params cannot select another account. API rejects extra fields/query selectors and sanitizes errors; all feedback responses, including failures, are private/no-store.

Installation defaults `arbor_private.ask_feedback_enabled()` to false. Installing the proposal alone does not authorize collection. Gate activation needs reviewed approval and a separate, guarded migration. No authenticated/private operator grant is added.

Per-owner advisory lock serializes edits and a 20-new-record UTC-day cap. Global UUID collision uses conflict handling and returns a generic 409. Changing answer type/version, editing another owner's UUID or an expired vote fails. Answer types are client-declared finite feedback labels, not signed proof that a particular answer was shown; votes are not financial or entitlement evidence.

## Retention, export and erasure

Proposed retention eligibility is 90 days from server creation. Bounded cleanup handles at most 200 rows, skips busy owner barriers, rechecks scoped support holds, and retains elapsed holds until explicit release. Other hold categories do not grant blanket feedback retention. Held rows do not starve cleanup selection. No schedule or execution grant is installed. Until an approved maintenance operation exists, 90 days is a target/eligibility rule, not a guaranteed deletion deadline; UI makes no fixed-date claim.

Owner export includes only id, helpful, reason, intent, answer_version and created_at. Backend validates the finite export shape and existing 20 MiB bound. Existing erasure inventory/data kernel loops gain this category; existing operator approvals, identity/session/closure/hold phases and grants are preserved. Auth-user FK cascades remain a backstop. The manual SQL adapter accepts the additional inventory category and rejects grant/column/security drift. No deletion automation is added.

Candidate privacy-notice addition, before collection activation: “Answer feedback is optional. Arbor saves only your vote, an optional fixed-choice reason, answer type/version and server timestamp, linked to your account. Your question, answer and financial figures are not included in feedback. Feedback is included in owner export and reviewed account erasure. The proposed ordinary retention target is 90 days, subject to an approved cleanup operation and scoped support/legal holds; this is not currently a guaranteed physical-deletion deadline.” This text is a local proposal, not a published notice or Terms change.

## Qualification

- Backend: 4,171 passed, two existing skipped tests, one existing Starlette/httpx deprecation warning.
- Frontend: 789 passed; lint/types/build passed; 44 auth/browser-safety checks passed.
- Actual isolated Chromium: 11 synthetic screenshots; 10 common-question interactions, 10 explicit test votes; zero browser errors, unexpected external requests or financial writes. Canonical responses generated through the real chat route with frozen data.
- Local PostgreSQL/PostgREST: 54 real JWT/security/concurrency/export/erasure/retention checks; 32 racing new votes admit exactly 20, 16 concurrent edits retain one record, global cross-owner UUID collision denied. Default-closed gate, session revocation, Terms, lifecycle states, elapsed scoped holds and busy-owner pruning tested.
- Five additional local manual-adapter checks, fully rolled back; normal schema accepted, added grant/column rejected. No hosted destructive action.
- Final SQL proposal also installed transactionally on a fresh synthetic database copy, default closed.

Browser qualification uses synthetic accounts/data only. No actual-owner session, physical mobile device or Safari validation. Natural-language matching is a finite reviewed set, not general conversation memory. Cleanup scheduling/operator authorization and the privacy-notice update remain release decisions.

## Bounded release proposal — not approved

1. Review current Ask preview/source/qualification. Reverify main; publish only this reviewed frontend/API slice if approved, leaving feedback default closed.
2. Separately approve the exact reviewed feedback migration/export/erasure coverage, privacy disclosure and activation scope. Do not enable hosted feedback from a UI-only approval.
3. Approve a bounded cleanup operation/cadence before making a fixed retention promise. No cron/automation change is part of this implementation.

Rollback: close the gate first to stop new collection; preserve the closed table and export/erasure coverage for any previously collected rows. Never drop live feedback records or silently remove erasure/export coverage as an application rollback.

## Approved combined release checkpoint — 3 October
Jonathan approved the exact seven-field storage, fixed reasons, 20-new/UTC-day cap, export/erasure coverage, manual 90-day eligibility and separate verified-owner read-only view, and explicitly approved collection/reader activation after qualification. He subsequently approved the corrected Admin spacing, five Holdings sort choices and Ask slice for live deployment. No additional approval is required for this exact scope. No cleanup cadence/job/operator grant is approved.

Reader uses the same table. Four projected row fields only: helpful, reason, intent, created_at. Topic totals: intent, helpful count, not_helpful count. No feedback/account ID, customer email, answer version, question, financial data or write method. Separate actor-bound private gate and existing live-session/Terms/active-owner checks on every read; installation defaults closed. Bounded50-row page/10000offset and finite27-topic totals. One statement snapshot, stable timestamp/ID ordering; IDs never projected. UI says all retained votes and does not present totals as answer accuracy.

Final combined qualification:4183 backend passed/two existing skips/one existing deprecation warning;798 frontend passed; lint/types/build;44 safety checks;36 new local real-JWT reader checks including20 concurrent unchanged reads;four exact activation SQL transaction checks fully rolled back. Final served synthetic browser runs:11 Ask,10 feedback Admin,30 sort screenshots; zero errors/external/financial or hosted fixture writes. Corrected Admin padding measured16px mobile/20px desktop horizontal,12px vertical,48px height in six width/theme combinations. Privacy notice and progressive feedback disclosure enumerate all metadata, owner projection, manual retention and scoped support holds.

Approved release order: install exact storage/reader schemas closed; publish/deploy qualified API/frontend with Render skip marker and explicit API-only deployment; verify current assets/API/privacy then apply exact verified-owner activation SQL. Retain existing market/reminder cron revisions. Rollback closes both feedback gates first and retains collected rows plus export/erasure coverage. Production migration results and final IDs are recorded in the separate release receipt. Actual-owner browser session/physical mobile/Safari remain untested.
