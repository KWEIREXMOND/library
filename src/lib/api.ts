export class ApiError extends Error {
  status: number;
  details?: Record<string, string> | Record<string, unknown> | unknown;
  constructor(message: string, status: number, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.details = details as Record<string, string> | undefined;
  }
  get fieldErrors(): Record<string, string> {
    const details = this.details;
    if (!details || typeof details !== 'object' || Array.isArray(details)) return {};
    const entries = Object.entries(details as Record<string, unknown>).filter(([, v]) => typeof v === 'string');
    return Object.fromEntries(entries) as Record<string, string>;
  }
}

type ApiInit = {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  headers?: Record<string, string>;
  signal?: AbortSignal;
  cache?: RequestCache;
};

export const OFFLINE_MESSAGE = 'The library server is not responding. It may be restarting — please try again in a moment.';

const TOKEN_KEY = 'libra.session';
let memoryToken: string | null = null;
let hydrated = false;

function readStoredToken(): string | null {
  try {
    return window.localStorage.getItem(TOKEN_KEY) ?? window.sessionStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

/**
 * Session token fallback.
 *
 * The server sets an httpOnly session cookie, which is the preferred transport.
 * Some browsers (and previews embedded in an iframe) silently drop third-party
 * cookies, so the login response also carries a bearer token. We keep it in
 * memory — and, when storage is available, persist it — and send it alongside
 * the cookie. The server accepts either credential.
 */
export function getAuthToken(): string | null {
  if (!hydrated) {
    memoryToken = readStoredToken();
    hydrated = true;
  }
  return memoryToken;
}

/** Which storage the browser actually allows — surfaced in session errors. */
export function storageStatus(): 'localStorage' | 'sessionStorage' | 'blocked' {
  try {
    window.localStorage.setItem('libra.probe', '1');
    window.localStorage.removeItem('libra.probe');
    return 'localStorage';
  } catch {
    try {
      window.sessionStorage.setItem('libra.probe', '1');
      window.sessionStorage.removeItem('libra.probe');
      return 'sessionStorage';
    } catch {
      return 'blocked';
    }
  }
}

export function setAuthToken(token: string | null, persist = true) {
  memoryToken = token;
  hydrated = true;
  try {
    window.localStorage.removeItem(TOKEN_KEY);
    window.sessionStorage.removeItem(TOKEN_KEY);
    if (token) (persist ? window.localStorage : window.sessionStorage).setItem(TOKEN_KEY, token);
  } catch {
    /* storage may be blocked in embedded contexts — the in-memory token still works */
  }
}

export async function api<T = any>(path: string, init: ApiInit = {}): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json', ...(init.headers ?? {}) };
  const token = getAuthToken();
  if (token) {
    // Send the credential twice: some hosting proxies strip `Authorization`,
    // and the custom header keeps the session alive when that happens.
    if (!headers.Authorization) headers.Authorization = `Bearer ${token}`;
    if (!headers['X-Libra-Token']) headers['X-Libra-Token'] = token;
  }
  let body: BodyInit | undefined;
  if (init.body instanceof FormData) {
    body = init.body;
  } else if (init.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(init.body);
  }
  let response: Response;
  try {
    response = await fetch(path.startsWith('http') ? path : `/api${path}`, {
      method: init.method ?? 'GET',
      headers,
      body,
      credentials: 'same-origin',
      cache: init.cache,
      signal: init.signal,
    });
  } catch (error) {
    // Network-level failure: the API is down, the dev server is not proxying,
    // or the browser is offline. Say so plainly instead of "Something went wrong".
    if ((error as Error)?.name === 'AbortError') throw error;
    throw new ApiError(OFFLINE_MESSAGE, 0);
  }

  const contentType = response.headers.get('content-type') ?? '';
  let payload: any = null;
  if (contentType.includes('application/json')) {
    try {
      payload = await response.json();
    } catch {
      payload = null;
    }
  } else if (response.ok) {
    return (await response.text()) as unknown as T;
  }

  if (!response.ok) {
    // A proxy in front of a stopped backend answers with HTML (or nothing).
    const unreachable = !payload && (response.status === 500 || response.status === 502 || response.status === 503 || response.status === 504);
    const message = payload?.error
      || (unreachable ? OFFLINE_MESSAGE : response.statusText)
      || OFFLINE_MESSAGE;
    throw new ApiError(message, response.status, payload?.details);
  }
  return payload as T;
}

/** Fetch a binary download (PDF, CSV) with the same credentials as JSON calls. */
export async function apiBlob(path: string): Promise<Blob> {
  const token = getAuthToken();
  const headers: Record<string, string> = {};
  if (token) {
    headers.Authorization = `Bearer ${token}`;
    headers['X-Libra-Token'] = token;
  }
  let response: Response;
  try {
    response = await fetch(`/api${path}`, { headers, credentials: 'same-origin' });
  } catch (error) {
    if ((error as Error)?.name === 'AbortError') throw error;
    throw new ApiError(OFFLINE_MESSAGE, 0);
  }
  if (!response.ok) {
    let message = response.status === 401
      ? 'Your session has ended. Sign in again.'
      : response.statusText || OFFLINE_MESSAGE;
    try {
      const body = await response.json();
      if (body?.error) message = body.error;
    } catch {
      /* the body may not be JSON */
    }
    throw new ApiError(message, response.status);
  }
  return response.blob();
}

/**
 * Fire-and-forget diagnostics. Auth problems are hard to reproduce from a
 * hosted preview, so the browser reports sign-in/out milestones which land in
 * the server log.
 */
export function reportClientEvent(event: string, data: Record<string, unknown> = {}) {
  try {
    const body = JSON.stringify({ event, data, path: window.location.pathname, ua: navigator.userAgent.slice(0, 120) });
    if (navigator.sendBeacon) {
      navigator.sendBeacon('/api/client-log', new Blob([body], { type: 'application/json' }));
      return;
    }
    void fetch('/api/client-log', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, keepalive: true }).catch(() => undefined);
  } catch {
    /* diagnostics must never break the app */
  }
}

export function qs(params: Record<string, string | number | boolean | null | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    search.set(key, String(value));
  }
  const text = search.toString();
  return text ? `?${text}` : '';
}

export function downloadFile(path: string) {
  const link = document.createElement('a');
  link.href = path.startsWith('http') ? path : `/api${path}`;
  link.rel = 'noopener';
  document.body.appendChild(link);
  link.click();
  link.remove();
}

/**
 * URL for media the browser loads itself (`<iframe>`, `<img>`, download links),
 * where no custom headers can be attached. The token rides along in the query
 * string so previews keep working when cookies are unavailable.
 */
export const apiFileUrl = (path: string) => {
  const token = getAuthToken();
  const url = `/api${path}`;
  if (!token) return url;
  return `${url}${url.includes('?') ? '&' : '?'}token=${encodeURIComponent(token)}`;
};
