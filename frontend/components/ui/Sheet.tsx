"use client";
import { useEffect, useId, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";

/** Native modal: focus trap, Escape and inert background without another dependency. */
export default function Sheet({ title, children, onClose, busy = false }: { title: string; children: ReactNode; onClose: () => void; busy?: boolean }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const id = useId();
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const element = dialog.current;
    element?.showModal();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { element?.close(); document.body.style.overflow = overflow; if (previous?.isConnected) previous.focus(); };
  }, []);
  return createPortal(<dialog ref={dialog} className="arbor-sheet" aria-labelledby={id} onCancel={e => { e.preventDefault(); if (!busy) onClose(); }}>
    <header className="sheet-header"><h2 id={id}>{title}</h2><button type="button" aria-label="Close" disabled={busy} onClick={onClose}>×</button></header>
    <div className="sheet-body">{children}</div>
  </dialog>, document.body);
}
