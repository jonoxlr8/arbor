import { getAccessToken } from './auth';
import { apiBaseUrl } from './apiConfig';
export function createAccountExporter(token = getAccessToken, request: typeof fetch = fetch) {
  return async (owner: string, signal?: AbortSignal): Promise<Blob> => {
    const controller = new AbortController();
    const cancel = () => controller.abort();
    signal?.addEventListener('abort', cancel, { once: true });
    const timer = setTimeout(cancel, 15000);
    try {
      if (signal?.aborted) controller.abort();
      const access = await token(owner);
      controller.signal.throwIfAborted();
      const response = await request(`${apiBaseUrl(process.env.NEXT_PUBLIC_API_BASE_URL, process.env.NODE_ENV)}/account/export`, {
        headers: { Authorization: `Bearer ${access}` }, cache: 'no-store', signal: controller.signal,
      });
      if (response.status === 401 || response.status === 403) throw new Error('Sign out and sign in again, then download within 15 minutes.');
      if (response.status === 429) throw new Error('Please wait one minute before trying again.');
      if (response.status === 413) throw new Error('Your export exceeds the download limit. Contact support@arbor.ph for help.');
      if (!response.ok) throw new Error('A complete export is unavailable. Please retry or contact support@arbor.ph.');
      if (!response.headers.get('content-type')?.includes('application/json')) throw new Error('The export response could not be verified.');
      const blob = await response.blob();
      controller.signal.throwIfAborted();
      if (blob.size > 20971520) throw new Error('The export exceeds the download limit.');
      return blob;
    } catch (error) {
      if (controller.signal.aborted) throw new Error("The export was cancelled or timed out. Please retry.");
      throw error;
    } finally { clearTimeout(timer); signal?.removeEventListener('abort', cancel); }
  };
}
export const exportAccount = createAccountExporter();
