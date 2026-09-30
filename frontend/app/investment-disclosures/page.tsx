import type { Metadata } from "next";
import PublicInformation from "@/components/entry/PublicInformation";
import "../marketing.css";
export const metadata: Metadata = { title: "Investment disclosures — Arbor", alternates: { canonical: "https://arbor.ph/investment-disclosures" } };
export default function Page() { return <PublicInformation page="investment-disclosures" />; }
