import type { Metadata } from "next";
import PasswordResetRequest from "@/components/PasswordResetRequest";

export const metadata: Metadata = { title: "Reset your password — Arbor", referrer: "no-referrer", robots: { index: false, follow: false } };
export default function ForgotPasswordPage() { return <PasswordResetRequest />; }
