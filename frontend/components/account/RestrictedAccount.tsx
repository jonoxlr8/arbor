"use client";
import AccountPrivacy from './AccountPrivacy';
import AccountLifecycleControls from './AccountLifecycleControls';
import type { AccountLifecycle } from '@/lib/accountLifecycle';
export default function RestrictedAccount({ userId, status, onRefresh, onSignOut }: { userId: string; status: AccountLifecycle; onRefresh: () => void; onSignOut: () => void }) {
 return <main className="min-h-screen bg-background px-6 py-12"><div className="mx-auto max-w-xl space-y-6"><h1 className="text-3xl font-semibold">{status.state === 'deletion_pending' ? 'Your deletion request' : status.state === 'erasing' ? 'Account erasure is in progress' : status.state === 'active' ? 'Sign in again' : 'Your account is deactivated'}</h1>
  {status.state !== 'deletion_pending' && status.state !== 'erasing' && <p>Sign out and sign in again to reopen ordinary deactivation. Signing in never cancels a pending deletion request.</p>}
  {status.state === 'erasing' ? <><p>Reopening, cancellation and export are unavailable once irreversible erasure begins. A failed step keeps access restricted while it is reviewed and retried. We will explain completion and any specifically retained information.</p><p>For status or privacy requests, contact <a href="mailto:support@arbor.ph">support@arbor.ph</a>. Do not send your password.</p></> : <><AccountPrivacy userId={userId} hideLifecycle /><AccountLifecycleControls userId={userId} initial={status} onChange={onRefresh} /></>}
  <div className="flex gap-4"><button className="entry-link min-h-11" type="button" onClick={onRefresh}>Refresh status</button><button className="entry-link min-h-11" type="button" onClick={onSignOut}>Sign out</button></div>
 </div></main>;
}
