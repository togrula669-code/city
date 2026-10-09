const BASE = '/api';
export class ApiError extends Error {
  constructor(message, code, status) { super(message); this.name = 'ApiError'; this.code = code; this.status = status; }
}
export async function api(endpoint, { method = 'GET', body, adminToken, signal } = {}) {
  const controller = !signal ? new AbortController() : null;
  const activeSignal = signal || controller.signal;
  // Allow time for two bounded Groq attempts; distinguish a timeout from a connection failure.
  const timeout = controller ? setTimeout(() => controller.abort(), 115000) : null;
  let response;
  try {
    response = await fetch(`${BASE}${endpoint}`, {
      method, signal: activeSignal,
      cache: 'no-store',
      headers: { ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...(adminToken ? { 'x-admin-token': adminToken } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body)
    });
  } catch (error) {
    if (error?.name === 'AbortError') throw new ApiError('The local server did not respond within 115 seconds. Check the VS Code terminal and try the HTTP diagnostics.', 'LOCAL_API_TIMEOUT', 0);
    if (error instanceof TypeError) throw new ApiError('The browser could not complete the request to the local API. This is not a Groq model response. Open System Health and run npm run http:check in the project terminal.', 'LOCAL_API_NETWORK_ERROR', 0);
    throw error;
  } finally { if (timeout) clearTimeout(timeout); }
  let payload;
  try { payload = await response.json(); } catch { throw new ApiError('The server returned an unreadable response.', 'INVALID_RESPONSE', response.status); }
  if (!response.ok || !payload.success) throw new ApiError(`${payload.error?.message || `Request failed (${response.status}).`}${response.headers.get('x-request-id') ? ` (Request ID: ${response.headers.get('x-request-id')})` : ''}`, payload.error?.code || 'REQUEST_FAILED', response.status);
  return payload.data;
}
export function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Unable to read this file.'));
    reader.onload = () => resolve(String(reader.result).split(',')[1]);
    reader.readAsDataURL(file);
  });
}
