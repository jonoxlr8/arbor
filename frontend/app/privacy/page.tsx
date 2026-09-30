import type { Metadata } from "next";
import PublicInformation from "@/components/entry/PublicInformation";
import "../marketing.css";
export const metadata: Metadata = { title: "Privacy — Arbor", alternates: { canonical: "https://arbor.ph/privacy" } };
export default function Page() { return <PublicInformation page="privacy" />; }
