type Mode = "login" | "signup";
export type PendingConfirmation = { mode: Mode; email: string };
export const neutralResendMessage = "If this address has an account awaiting confirmation, a new email has been requested. Check your inbox and spam folder.";

export function confirmationContext(mode: Mode, email: string, outcome: { awaitingConfirmation?: boolean; error?: unknown }): PendingConfirmation | null {
  const code = (outcome.error as { code?: string } | null)?.code;
  return (mode === "signup" && outcome.awaitingConfirmation && !outcome.error) ||
    (mode === "login" && code === "email_not_confirmed") ? { mode, email: email.trim() } : null;
}

export function showConfirmationResend(context: PendingConfirmation | null, mode: Mode, email: string): boolean {
  return !!context && context.mode === mode && context.email === email.trim();
}

export function canResendConfirmation(context: PendingConfirmation | null, mode: Mode, email: string, busy: boolean, cooldown: number): boolean {
  return showConfirmationResend(context, mode, email) && !busy && cooldown === 0 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}
