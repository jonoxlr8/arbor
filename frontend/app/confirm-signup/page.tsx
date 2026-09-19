import type { Metadata } from "next";
import SignupConfirmation from "./SignupConfirmation";

export const metadata: Metadata = {
  title: "Confirm your email — Arbor",
  referrer: "no-referrer",
  robots: { index: false, follow: false },
};

export default function ConfirmSignupPage() {
  return <SignupConfirmation />;
}
