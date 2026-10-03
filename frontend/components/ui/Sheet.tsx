"use client";
import { useEffect, useId, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";

let openSheets=0;
let overflowBeforeSheets="";

/** Native modal: focus trap, Escape and inert background without another dependency. */
export default function Sheet({ title, children, onClose, busy = false, wide = false, open = true, focusOnOpen }: { title: string; children: ReactNode; onClose: () => void; busy?: boolean; wide?: boolean; open?: boolean; focusOnOpen?: "heading" | "first-field" }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const id = useId();
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const element = dialog.current;
    element?.showModal();
    if (element) {
      element.scrollTop = 0;
      const firstField = element.querySelector<HTMLElement>("input:not(:disabled),select:not(:disabled),textarea:not(:disabled)");
      if (focusOnOpen) (focusOnOpen === "first-field" ? firstField ?? heading.current : heading.current)?.focus({preventScroll:true});
    }
    if(openSheets===0)overflowBeforeSheets=document.body.style.overflow;
    openSheets++;
    document.body.style.overflow = "hidden";
    return () => {
      element?.close();
      openSheets--;
      if(openSheets===0)document.body.style.overflow=overflowBeforeSheets;
      if(previous?.isConnected)previous.focus({preventScroll:true});
    };
  }, [open, focusOnOpen]);
  return createPortal(<dialog ref={dialog} className={`arbor-sheet${wide ? " arbor-sheet-wide" : ""}`} aria-labelledby={id} onKeyDown={event => {
    const element=dialog.current;
    if(event.key!=="Tab" || !open || !element?.contains(event.target as Node))return;
    const controls=Array.from(element.querySelectorAll<HTMLElement>('button,a[href],input,select,textarea,summary,[tabindex]'))
      .filter(node=>node.tabIndex>=0&&!node.hasAttribute("disabled")&&node.getClientRects().length>0);
    const first=controls[0],last=controls[controls.length-1];
    if(!first){event.preventDefault();element.focus();}
    else if(event.shiftKey && (document.activeElement===first||document.activeElement===element||document.activeElement===heading.current)){event.preventDefault();last.focus();}
    else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
  }} onCancel={e => { e.stopPropagation(); e.preventDefault(); if (!busy) onClose(); }}>
    <header className="sheet-header"><h2 ref={heading} tabIndex={-1} id={id}>{title}</h2><button type="button" aria-label="Close" disabled={busy} onClick={onClose}>×</button></header>
    <div className="sheet-body">{children}</div>
  </dialog>, document.body);
}
