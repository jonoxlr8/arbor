import type { IdentityGlyph } from "@/lib/investmentIdentity";

/** Original geometric UI vocabulary. These are not issuer/provider trademarks. */
export default function ArborIdentityIcon({ glyph }: { glyph: IdentityGlyph }) {
  return <svg viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false" data-glyph={glyph}>
    {glyph === "globe" && <><circle cx="16" cy="16" r="10"/><ellipse cx="16" cy="16" rx="4.5" ry="10"/><path d="M6 16h20M8 10.5h16M8 21.5h16"/><circle cx="25" cy="7" r="2.5" fill="currentColor" stroke="none"/></>}
    {glyph === "circuit" && <><rect x="10" y="10" width="12" height="12" rx="3"/><path d="M13 5v5m6-5v5M13 22v5m6-5v5M5 13h5m-5 6h5m12-6h5m-5 6h5"/><path d="m16 12 4 4-4 4-4-4Z" fill="currentColor" stroke="none"/></>}
    {glyph === "shield" && <><path d="M16 4 26 8v7c0 6-5 10-10 13C11 25 6 21 6 15V8Z"/><path d="m11 13 5-3 5 3-5 3Zm0 5 5 3 5-3"/></>}
    {glyph === "coin" && <><circle cx="16" cy="16" r="11"/><circle cx="16" cy="16" r="7.5" strokeDasharray="2 4"/><path d="m16 10 5 6-5 6-5-6Z" fill="currentColor" stroke="none"/></>}
    {glyph === "layers" && <><path d="m5 11 11-6 11 6-11 6Zm0 5 11 6 11-6M5 21l11 6 11-6"/><path d="m12 11 4-2 4 2-4 2Z" fill="currentColor" stroke="none"/></>}
    {glyph === "market" && <><path d="M6 6v20h21M11 21v-5m6 5V9m6 12v-8"/><path d="m10 11 6-6 7 2"/></>}
    {glyph === "facets" && <><path d="m16 4 11 10-11 14L5 14Zm-11 10h22M16 4l-4 10 4 14 4-14Z"/></>}
    {glyph === "wallet" && <><rect x="5" y="9" width="22" height="17" rx="4"/><path d="M6 11V7l15-3v5"/><path d="M27 15h-7a3 3 0 0 0 0 6h7"/><circle cx="21" cy="18" r="1" fill="currentColor"/></>}
    {glyph === "coins" && <><ellipse cx="12" cy="10" rx="7" ry="4"/><path d="M5 10v6c0 2 3 4 7 4m-7-5v6c0 2 3 4 7 4"/><ellipse cx="22" cy="18" rx="5" ry="3"/><path d="M17 18v6c0 2 2 3 5 3s5-1 5-3v-6"/></>}
    {glyph === "exchange" && <><path d="M5 10h20m-5-5 5 5-5 5M27 22H7m5-5-5 5 5 5"/><circle cx="6" cy="10" r="2.5" fill="currentColor" stroke="none"/><circle cx="26" cy="22" r="2.5" fill="currentColor" stroke="none"/></>}
  </svg>;
}
