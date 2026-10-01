'use client';
import { useEffect, useRef, useState } from 'react';
import AccountLifecycleControls from './AccountLifecycleControls';
import { exportAccount } from '@/lib/accountExport';
export default function AccountPrivacy({ userId, hideLifecycle = false }: { userId: string; hideLifecycle?: boolean }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const active = useRef<AbortController | null>(null);
  useEffect(() => () => { active.current?.abort(); active.current = null; }, [userId]);
  async function download() {
    if (active.current) return;
    const controller = new AbortController(); active.current = controller;
    setBusy(true); setMessage('Preparing your data…');
    try {
      const blob = await exportAccount(userId, controller.signal);
      if (controller.signal.aborted) return;
      const url = URL.createObjectURL(blob);
      try {
        const link = document.createElement('a'); link.href = url;
        link.download = `arbor-account-export-${new Date().toISOString().slice(0,10)}.json`;
        link.click(); setMessage('Your export download has started. Keep this financial information private.');
      } finally { setTimeout(() => URL.revokeObjectURL(url), 1000); }
    } catch (error) { if (!controller.signal.aborted) setMessage(error instanceof Error ? error.message : 'The export is unavailable. Please retry.'); }
    finally { if (active.current === controller) { active.current = null; setBusy(false); } }
  }
  return <details><summary>Account &amp; privacy</summary><p className="mt-3">Download your recorded account and investment data. Includes one export-security timestamp used to limit repeat requests. Provider correspondence, logs and backups are not included.</p><p className="mt-2">For privacy requests or help, contact <a href="mailto:support@arbor.ph">support@arbor.ph</a>. This download does not delete your account.</p><button type="button" className="entry-primary mt-4 min-h-11" disabled={busy} onClick={download}>{busy ? 'Preparing download…' : 'Download my Arbor data'}</button><p role="status" aria-live="polite" className="mt-3">{message}</p>{!hideLifecycle && <AccountLifecycleControls userId={userId} />}</details>;
}
