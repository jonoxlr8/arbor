# Exact retention/privacy decision for owner review

Proposed target: 90 days for identifiable missing-investment requests, earlier removal through reviewed account erasure, and deferral only for a specifically reviewed existing hold. This is not an accepted or deployed policy.

Exact proposed privacy wording:

“When you request a missing investment, Arbor stores its name, provider, account reference, received date and request/retry identifiers so Jonathan can review requests and avoid duplicates. Please don’t include account numbers or personal details. We aim to remove identifiable requests after 90 days. Cleanup is reviewed and run manually, so removal may occur later. Reviewed account erasure can remove them earlier; any necessary hold is reviewed separately.”

Exactly six stored columns: investment_name (max120), provider (max80), user_id (existing Auth UUID), id (server UUID receipt), idempotency_key (client retry UUID), received_at (stable server timestamp). Receipt status is computed, not stored. No email, phone, financial amounts, review status or additional timestamps. Owner export adds only name/provider/received date.

`investment-request-retention-operator-proposal.sql` is an owner-only rollback dry run, capped at 250 rows older than 90 days, excluding inactive accounts, holds and in-progress erasure. It locks candidate rows and retains existing lifecycle guards. Local qualification proves policy-flag denial, the 250-row bound, old/recent selection, inactive exclusion and rollback preservation. No permanent purge occurred.

Approving the 90-day policy is not authorization to delete actual records now or to run future blanket cleanup. Each irreversible hosted invocation needs its own required approval after reviewing that invocation's dry run. Default SQL remains ROLLBACK; no cron or service grant is added.

Manual-only cleanup cannot reliably guarantee an exact automatic 90-day expiry. Proposed process: monthly owner review recorded in the existing private handover, followed by separately approved bounded cleanup and a dated receipt. No schedule/reminder or process has been configured here. Guaranteed automatic expiry would require a separately approved scheduling change. Expiry removes the linked demand signal, so a later request may be counted again.

Owner approval needed: this target and honest privacy wording, adoption of the manual review process, and the two exact request/erasure migrations before API/frontend activation. No data-policy, hosted migration or publication approval is inferred from screenshots.
