import type { Metadata } from "next";
import ResetPassword from "./ResetPassword";

export const metadata: Metadata = { title: "Choose a new password — Arbor", referrer: "no-referrer", robots: { index: false, follow: false } };
export default function ResetPasswordPage() { return <ResetPassword />; }
