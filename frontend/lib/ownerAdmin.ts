import { getAccessToken } from './auth';
import { apiBaseUrl } from './apiConfig';
import { boundedRequest } from './dashboardConsistency';
export type ReviewStatus = 'new' | 'reviewing' | 'resolved';
export type RequestReview = {
    id: string;
    investment_name: string;
    provider: string;
    received_at: string;
    status: ReviewStatus;
    revision: number;
    updated_at: string | null;
};
export type RequestPage = {
    items: RequestReview[];
    has_more: boolean;
    offset: number;
};
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const statuses = ['new', 'reviewing', 'resolved'];
export class AdminAccessError extends Error {
}
export function validReview(value: unknown): value is RequestReview {
    if (!value || typeof value !== 'object')
        return false;
    const r = value as RequestReview;
    return Object.keys(r).sort().join(',') === 'id,investment_name,provider,received_at,revision,status,updated_at' && typeof r.id === 'string' && uuid.test(r.id) && typeof r.investment_name === 'string' && r.investment_name.length > 0 && r.investment_name.length <= 120 && typeof r.provider === 'string' && r.provider.length > 0 && r.provider.length <= 80 && statuses.includes(r.status) && Number.isSafeInteger(r.revision) && r.revision >= 0 && typeof r.received_at === 'string' && /(Z|[+-]\d{2}:\d{2})$/.test(r.received_at) && Number.isFinite(Date.parse(r.received_at)) && (r.updated_at === null || typeof r.updated_at === 'string' && /(Z|[+-]\d{2}:\d{2})$/.test(r.updated_at) && Number.isFinite(Date.parse(r.updated_at)));
}
export function createAdminApi(token = getAccessToken, request: typeof fetch = fetch) {
    async function call(userId: string, path: string, body?: unknown) {
        return boundedRequest(async (signal) => {
            const credential = await token(userId);
            signal.throwIfAborted();
            const response = await request(`${apiBaseUrl(process.env.NEXT_PUBLIC_API_BASE_URL, process.env.NODE_ENV)}/v2/admin${path}`, { method: body ? 'PUT' : 'GET', cache: 'no-store', signal, headers: { Authorization: `Bearer ${credential}`, ...(body ? { 'Content-Type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
            if (response.status === 401 || response.status === 403)
                throw new AdminAccessError('Owner Admin access is unavailable for this account.');
            if (!response.ok)
                throw new Error(response.status === 404 ? 'This request is no longer available.' : response.status === 409 ? 'This request changed or is busy. Refresh before editing its status.' : 'Request review is unavailable. Refresh to check the latest status.');
            return response.json();
        });
    }
    return {
        async access(userId: string) { const value = await call(userId, '/access'); if (!value || Object.keys(value).join(',') !== 'allowed' || typeof value.allowed !== 'boolean')
            throw new Error('Admin access could not be verified.'); return value.allowed as boolean; },
        async list(userId: string, offset = 0): Promise<RequestPage> { if (!Number.isInteger(offset) || offset < 0 || offset > 10000)
            throw new Error('Invalid request page.'); const v = await call(userId, `/requests?offset=${offset}`); if (!v || Object.keys(v).sort().join(',') !== 'has_more,items,offset' || !Array.isArray(v.items) || v.items.length > 50 || !v.items.every(validReview) || typeof v.has_more !== 'boolean' || v.offset !== offset)
            throw new Error('Request list could not be verified.'); return v; },
        async change(userId: string, row: RequestReview, status: ReviewStatus): Promise<RequestReview> { if (!validReview(row) || !statuses.includes(status))
            throw new Error('Check the request status.'); const v = await call(userId, `/requests/${row.id}/status`, { status, expected_revision: row.revision }); if (!validReview(v) || v.id !== row.id || v.status !== status)
            throw new Error('Status could not be confirmed. Refresh to check.'); return v; },
        async detail(userId: string, id: string): Promise<RequestReview> { if (!uuid.test(id))
            throw new Error('Invalid request.'); const v = await call(userId, `/requests/${id}`); if (!validReview(v) || v.id !== id)
            throw new Error('Request details could not be verified.'); return v; }
    };
}
export const adminApi = createAdminApi();
