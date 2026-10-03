'use client';
import DeletionReview from './DeletionReview';
import {deletionReviewApi} from '@/lib/adminDeletionReview';
import { useCallback, useEffect, useRef, useState } from 'react';
import { adminApi, AdminAccessError, type RequestPage, type RequestReview, type ReviewStatus } from '@/lib/ownerAdmin';
const labels: Record<ReviewStatus, string> = { new: 'New', reviewing: 'Reviewing', resolved: 'Resolved' };
const date = (value: string, full = false) => new Date(value).toLocaleString('en-PH', { timeZone: 'Asia/Manila', day: '2-digit', month: 'short', year: 'numeric', ...(full ? { hour: 'numeric', minute: '2-digit' } : {}) });
export function AdminEntry({ userId }: {
    userId: string;
}) {
    const [allowed, setAllowed] = useState(false);
    useEffect(() => { let active = true; adminApi.access(userId).then(v => { if (active)
        setAllowed(v); }).catch(() => { if (active)
        setAllowed(false); }); return () => { active = false; }; }, [userId]);
    return allowed ? <a className="admin-entry" href="#settings/admin"><span>Admin<small>Review submitted investment requests</small></span><span aria-hidden="true">→</span></a> : null;
}
function InvestmentRequestAdmin({ userId }: {
    userId: string;
}) {
    const [allowed, setAllowed] = useState<boolean | null>(null), [page, setPage] = useState<RequestPage | null>(null), [selected, setSelected] = useState<RequestReview | null>(null), [error, setError] = useState(''), [busy, setBusy] = useState(false);
    const mounted = useRef(true), pending = useRef(false), epoch = useRef(0), heading = useRef<HTMLHeadingElement>(null), feedback = useRef<HTMLParagraphElement>(null);
    useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, [userId]);
    const load = useCallback(async (offset = 0, id?: string) => {
        if (pending.current)
            return;
        pending.current = true;
        setBusy(true);
        setError('');
        const generation = ++epoch.current;
        try {
            const permit = await adminApi.access(userId);
            if (!mounted.current || generation !== epoch.current)
                return;
            setAllowed(permit);
            if (!permit) {
                setPage(null);
                setSelected(null);
                return;
            }
            const value = id ? await adminApi.detail(userId, id) : await adminApi.list(userId, offset);
            if (!mounted.current || generation !== epoch.current)
                return;
            if (id) {
                setSelected(value as RequestReview);
            }
            else {
                setPage(value as RequestPage);
                setSelected(null);
            }
        }
        catch (reason) {
            if (mounted.current && generation === epoch.current) {
                if (reason instanceof AdminAccessError) {
                    setAllowed(false);
                    setPage(null);
                    setSelected(null);
                }
                setError(reason instanceof Error ? reason.message : 'Request review is unavailable.');
            }
        }
        finally {
            pending.current = false;
            if (mounted.current && generation === epoch.current)
                setBusy(false);
        }
    }, [userId]);
    useEffect(() => { queueMicrotask(() => { if (mounted.current)
        void load(); }); }, [load]);
    const selectedId = selected?.id;
    useEffect(() => { if (selectedId)
        heading.current?.focus(); }, [selectedId]);
    useEffect(() => { if (error)
        feedback.current?.focus(); }, [error]);
    async function change(status: ReviewStatus) {
        if (!selected || pending.current || error)
            return;
        pending.current = true;
        setBusy(true);
        setError('');
        try {
            const result = await adminApi.change(userId, selected, status);
            if (mounted.current) {
                setSelected(result);
                setPage(p => p ? { ...p, items: p.items.map(r => r.id === result.id ? result : r) } : p);
            }
        }
        catch (reason) {
            if (mounted.current) {
                if (reason instanceof AdminAccessError) {
                    setAllowed(false);
                    setPage(null);
                    setSelected(null);
                }
                setError(reason instanceof Error ? reason.message : 'Status could not be confirmed. Refresh to check.');
            }
        }
        finally {
            pending.current = false;
            if (mounted.current)
                setBusy(false);
        }
    }
    return <section className="owner-admin" aria-label="Owner request review"><a className="entry-link min-h-11 inline-flex items-center" href="#settings">‹ Settings</a>
  <p className="eyebrow">Owner only</p><h2 ref={heading} tabIndex={-1}>{selected ? 'Request details' : 'Requests'}</h2>
  <p className="admin-intro">{selected ? 'Read the submitted information and update its review status.' : 'Review submitted investment requests.'}</p>
  {allowed === null && !error && <p role="status">Checking Admin access…</p>}
  {allowed === false && <p role="status">Owner Admin access is unavailable for this account.</p>}
  {error && <p ref={feedback} tabIndex={-1} role="alert">{error}</p>}
  {(error || allowed === true) && <button className="entry-link min-h-11" disabled={busy} onClick={() => void load(page?.offset ?? 0, selected?.id)}>{busy ? 'Loading…' : 'Refresh requests'}</button>}
  {allowed === true && selected ? <><button className="entry-link min-h-11" disabled={busy} onClick={() => void load(page?.offset ?? 0)}>‹ All requests</button><div className="admin-detail-layout"><article className="admin-card"><h3>{selected.investment_name}</h3><dl><div><dt>Name</dt><dd>{selected.investment_name}</dd></div><div><dt>Provider</dt><dd>{selected.provider}</dd></div><div><dt>Received · PHT</dt><dd>{date(selected.received_at, true)}</dd></div></dl><p className="admin-note">Submitted details stay unchanged.</p></article><section className="admin-card" aria-label="Request status"><h3>Review status</h3><p role="status">{labels[selected.status]}</p><div className="admin-statuses">{(['new', 'reviewing', 'resolved'] as const).map(status => <button type="button" key={status} aria-pressed={selected.status === status} disabled={busy || !!error || selected.status === status} onClick={() => void change(status)}>{labels[status]}</button>)}</div><p className="admin-note">Resolved means the review is complete. It does not confirm investment support or add a holding.</p>{selected.updated_at && <p className="admin-note">Updated {date(selected.updated_at, true)} PHT</p>}</section></div></> : allowed === true && page ? <section className="admin-card"><h3>Investment requests</h3>{page.items.length === 0 ? <p>No investment requests recorded.</p> : <><div className="admin-table-head" aria-hidden="true"><span>Name</span><span>Provider</span><span>Received · PHT</span><span>Status</span></div>{page.items.map(row => <button className="admin-request-row" key={row.id} disabled={busy} onClick={() => void load(page.offset, row.id)}><strong>{row.investment_name}</strong><span>{row.provider}</span><time dateTime={row.received_at}>{date(row.received_at)}</time><span className={`admin-badge admin-${row.status}`}>{labels[row.status]}</span></button>)}</>}<div className="admin-pagination">{page.offset > 0 && <button className="entry-link min-h-11" disabled={busy} onClick={() => void load(Math.max(0, page.offset - 50))}>Previous</button>}{page.has_more && page.offset < 10000 && <button className="entry-link min-h-11" disabled={busy} onClick={() => void load(page.offset + 50)}>Next</button>}</div></section> : null}
 </section>;
}

export default function OwnerAdmin({userId}:{userId:string}){
 const [deletionAllowed,setDeletionAllowed]=useState(false),[deletionOpen,setDeletionOpen]=useState(false);
 useEffect(()=>{let active=true;deletionReviewApi.access(userId).then(allowed=>{if(active)setDeletionAllowed(allowed);}).catch(()=>{if(active)setDeletionAllowed(false);});return()=>{active=false;};},[userId]);
 if(deletionOpen)return <DeletionReview key={userId} userId={userId} onBack={()=>setDeletionOpen(false)}/>;
 return <>{deletionAllowed&&<button className="entry-link min-h-11" onClick={()=>setDeletionOpen(true)}>Account-deletion requests</button>}<InvestmentRequestAdmin key={userId} userId={userId}/></>;
}
