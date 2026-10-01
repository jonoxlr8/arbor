import { getAccessToken } from './auth';
import { apiBaseUrl } from './apiConfig';
import { InvalidSessionError } from './accountRecovery';
import { boundedRequest } from './dashboardConsistency';
export type AccountLifecycle = { state: 'active' | 'deactivated' | 'deletion_pending' | 'erasing'; version: number; access_allowed: boolean; deletion_request: { id: string; requested_at: string } | null; in_flight_reminders: number; erasure_available: false; processing?: { state: 'reviewed' | 'erasing' | 'data_erased' | 'auth_erased' | 'completed'; verified_at: string; completion_target: string; held: boolean } | null };
export type LifecycleAction = 'status' | 'login' | 'deactivate' | 'request_deletion' | 'cancel_deletion';
export function isAccountLifecycle(value: unknown): value is AccountLifecycle {
 if (!value || typeof value !== 'object') return false;
 const v = value as AccountLifecycle;
 if (v.processing != null && (!['reviewed','erasing','data_erased','auth_erased','completed'].includes(v.processing.state) || typeof v.processing.held !== 'boolean' || !Number.isFinite(Date.parse(v.processing.verified_at)) || !Number.isFinite(Date.parse(v.processing.completion_target)))) return false;
 return ['active','deactivated','deletion_pending','erasing'].includes(v.state) && Number.isSafeInteger(v.version) && v.version >= 0 && typeof v.access_allowed === 'boolean' && Number.isSafeInteger(v.in_flight_reminders) && v.in_flight_reminders >= 0 && v.erasure_available === false && (v.deletion_request === null || (typeof v.deletion_request?.id === 'string' && typeof v.deletion_request.requested_at === 'string'));
}
export function createLifecycleRequester(token = getAccessToken, request: typeof fetch = fetch) {
 return async (owner: string, action: LifecycleAction = 'status', version?: number, actionId?: string, access?: string, signal?: AbortSignal): Promise<AccountLifecycle> => boundedRequest(async active => {
  const credential = access ?? await token(owner); active.throwIfAborted();
  const paths = { status: '/account/lifecycle', login: '/account/lifecycle/login', deactivate: '/account/deactivate', request_deletion: '/account/deletion-requests', cancel_deletion: '/account/deletion-requests/current/withdraw' };
  const response = await request(`${apiBaseUrl(process.env.NEXT_PUBLIC_API_BASE_URL, process.env.NODE_ENV)}${paths[action]}`, { method: action === 'status' ? 'GET' : 'POST', cache: 'no-store', signal: active, headers: { Authorization: `Bearer ${credential}`, 'Content-Type': 'application/json' }, ...(action === 'status' || action === 'login' ? {} : { body: JSON.stringify({expected_version: version, action_id: actionId, confirm: true}) }) });
  if (response.status === 401) throw new InvalidSessionError('Your session has ended. Sign in again.');
  if (response.status === 403) throw new Error('Sign out and sign in again before changing account status.');
  if (response.status === 409) throw new Error('Account status changed. Refresh and review it before continuing.');
  if (response.status === 429) throw new Error('Your account is busy. Please retry shortly.');
  if (!response.ok) throw new Error('Account status is unavailable. Please retry or contact support@arbor.ph.');
  const result: unknown = await response.json(); if (!isAccountLifecycle(result)) throw new Error('Account status could not be verified.');
  return result;
 }, signal, 12000);
}
export const accountLifecycle = createLifecycleRequester();
