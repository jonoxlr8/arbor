# Arbor auth email handoff

Prepared locally; **not applied to hosted Supabase**. No email was sent by the
template/browser preview tests. The deployed template state has not been read.

Use `confirm-signup.html` for Confirm signup (subject: “Confirm your Arbor email”)
and `reset-password.html` for Reset password (subject: “Reset your Arbor password”).
Each includes a text wordmark when images are blocked, a single action, a fallback
copyable URL, and a security note. The existing forest-green public logo is reused.

The exact `TokenHash` fragment URLs are unchanged. Opening the email link does not
redeem it; the visitor must explicitly confirm on Arbor. Neither a token nor an
email address is added to page screenshots, application logs, or analytics.
The fallback URL in the email necessarily contains the recipient's one-use hash;
do not include rendered production emails in shared screenshots.

Owner rollout, after the app changes are separately reviewed and deployed:

1. Verify `https://arbor.ph/arbor-email-logo-v2.png` returns the existing public logo.
2. In the **arbor** Supabase project, open Authentication → Email templates.
3. Paste each matching HTML file; preserve all template variables and fragment URLs.
4. Preview desktop/mobile and images-disabled rendering. Send only to the designated
   disposable QA inbox; confirm success, resend, expired-link and reset behavior.
5. Keep the previous template for a reversible rollback. No Auth settings, SMTP,
   redirect allowlists or security policies need changing.

Change-email, invite and magic-link are not exposed in the current Arbor UI. They
are deliberately not enabled or given new flows by this pass. Review and brand
those templates separately if their hosted use is confirmed.

Reference: https://supabase.com/docs/guides/auth/auth-email-templates
