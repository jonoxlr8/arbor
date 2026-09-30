import type { Metadata } from "next";
import PublicInformation from "@/components/entry/PublicInformation";
import "../marketing.css";
export const metadata: Metadata = { title: "Terms — Arbor", alternates: { canonical: "https://arbor.ph/terms" } };
export default function Page() { return <PublicInformation page="terms" />; }
