import type { ReactNode } from "react";
import Link from "next/link";
import Logo, { ArborMark } from "./Logo";
import { AppearanceSelect } from "./app/Appearance";

export function AuthEmblem() {
  return <span className="auth-emblem" aria-hidden="true"><ArborMark className="h-12 w-14" /></span>;
}

export default function AuthSurface({ children }: { children: ReactNode }) {
  return <div className="auth-experience">
    <header className="auth-navigation"><Link href="/" aria-label="Arbor welcome"><Logo /></Link><Link className="entry-link" href="/#login">Sign in</Link></header>
    <main className="auth-main"><section className="auth-content"><AuthEmblem />{children}</section></main>
    <footer className="auth-footer"><a href="https://arbor.ph">Invest with clarity.</a><AppearanceSelect /></footer>
  </div>;
}
