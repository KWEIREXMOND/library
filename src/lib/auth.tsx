import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { api, ApiError, getAuthToken, reportClientEvent, setAuthToken, storageStatus } from './api';
import type { MeResponse, Role } from './types';
import { FullPageLoader } from '../components/ui';

type AuthContextValue = {
  me: MeResponse | undefined;
  user: MeResponse['user'];
  settings: MeResponse['settings'] | undefined;
  isLoading: boolean;
  refresh: () => Promise<void>;
  login: (identifier: string, password: string, remember?: boolean) => Promise<MeResponse>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  // While signing out the session probe must not run: otherwise `/auth/me`
  // refetches immediately and can win the race against the revoke request,
  // silently restoring the user and bouncing them back into the app.
  const [signingOut, setSigningOut] = useState(false);
  const query = useQuery<MeResponse>({
    queryKey: ['me'],
    queryFn: () => api<MeResponse>('/auth/me'),
    staleTime: 30_000,
    retry: false,
    enabled: !signingOut,
  });

  const refresh = useCallback(async () => {
    if (signingOut) return; // never resurrect a session that is being ended
    await queryClient.invalidateQueries({ queryKey: ['me'] });
  }, [queryClient, signingOut]);

  const login = useCallback(async (identifier: string, password: string, remember = false) => {
    // Drop any session left over from a previous user so it cannot shadow this
    // sign-in, and make sure the probe is live again after a previous sign-out.
    setSigningOut(false);
    setAuthToken(null);
    const result = await api<{ user: MeResponse['user']; token?: string }>('/auth/login', {
      method: 'POST',
      body: { identifier, password, remember },
    });

    // Confirm the session actually sticks. The httpOnly cookie is the preferred
    // transport, but embedded previews and strict privacy modes drop it, which
    // used to leave the user stuck on the sign-in screen. When that happens we
    // fall back to the bearer token from the login response.
    let me = await api<MeResponse>('/auth/me', { cache: 'no-store' }).catch(() => null);
    if (!me?.user && result.token) {
      setAuthToken(result.token, remember);
      me = await api<MeResponse>('/auth/me', { cache: 'no-store' }).catch(() => null);
      if (!me?.user) {
        // A stale cookie can still confuse a browser that refuses to overwrite it.
        // Clear it server-side, then retry once with the token alone.
        await api('/auth/logout', { method: 'POST' }).catch(() => null);
        me = await api<MeResponse>('/auth/me', { cache: 'no-store' }).catch(() => null);
      }
      if (!me?.user) {
        setAuthToken(null);
        const detail = `token=${result.token ? 'issued' : 'missing'}, storage=${storageStatus()}, probe=/auth/me returned no user`;
        throw new ApiError(
          `You signed in, but this browser blocked the session. Allow cookies for this site, or open the library in a new tab. (${detail})`,
          401,
        );
      }
    } else if (me?.user) {
      // Cookie session works — avoid keeping a copy of the token in web storage.
      setAuthToken(null);
    }

    reportClientEvent('login_ok', { via: me?.user ? 'session' : 'token' });
    queryClient.setQueryData(['me'], me ?? undefined);
    await queryClient.invalidateQueries({ queryKey: ['me'] });
    return (queryClient.getQueryData(['me']) as MeResponse) ?? me ?? ({ user: result.user } as MeResponse);
  }, [queryClient]);

  const logout = useCallback(async () => {
    const token = getAuthToken();

    // 1. Detach the user immediately and freeze the session probe.
    setSigningOut(true);
    setAuthToken(null);

    // 2. Drop every cached library record so no screen can render stale data.
    //    Note: not queryClient.clear() — that would delete ['me'] and make its
    //    mounted observer refetch instantly, racing the revoke below.
    queryClient.removeQueries({ predicate: (q) => q.queryKey[0] !== 'me' });

    // 3. Revoke server-side. Bounded wait so a hung request can never trap the
    //    app in a half-signed-out state.
    reportClientEvent('logout', { hadToken: Boolean(token) });
    try {
      await Promise.race([
        api('/auth/logout', {
          method: 'POST',
          headers: token ? { Authorization: `Bearer ${token}`, 'X-Libra-Token': token } : undefined,
        }),
        new Promise((resolve) => setTimeout(resolve, 4000)),
      ]);
      reportClientEvent('logout_ok', {});
    } catch (error) {
      reportClientEvent('logout_failed', { status: error instanceof ApiError ? error.status : 0 });
    }

    // 4. Record the signed-out payload. The probe deliberately stays frozen
    //    (signingOut remains true) until the user signs in again or reloads the
    //    page, so nothing can silently re-adopt a session that is ending.
    queryClient.setQueryData<MeResponse>(['me'], (previous) =>
      previous
        ? { ...previous, user: null, unreadNotifications: 0, balance: 0, permissions: { manageLibrary: false, administer: false } }
        : ({ user: null } as MeResponse),
    );
  }, [queryClient]);

  // A stored token that the server no longer honours (expired, revoked, or issued
  // before a password change) should not linger and silently shadow the cookie.
  useEffect(() => {
    if (query.data && !query.data.user && getAuthToken()) setAuthToken(null);
  }, [query.data]);

  // Expose a signed-out view the instant logout starts, regardless of what the
  // cached payload still says.
  const me = useMemo<MeResponse | undefined>(() => {
    if (!signingOut || !query.data) return query.data;
    return { ...query.data, user: null, unreadNotifications: 0, balance: 0, permissions: { manageLibrary: false, administer: false } };
  }, [query.data, signingOut]);

  const value = useMemo<AuthContextValue>(() => ({
    me,
    user: me?.user ?? null,
    settings: me?.settings,
    isLoading: query.isLoading && !signingOut,
    refresh,
    login,
    logout,
  }), [me, query.isLoading, signingOut, refresh, login, logout]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside <AuthProvider>');
  return context;
}

export function RequireAuth({ roles }: { roles?: Role[] }) {
  const { user, isLoading } = useAuth();
  const location = useLocation();
  if (isLoading) return <FullPageLoader label="Opening your library…" />;
  if (!user) {
    return <Navigate to="/login" replace state={{ from: `${location.pathname}${location.search}` }} />;
  }
  if (roles && !roles.includes(user.role)) {
    return (
      <div className="mx-auto flex min-h-[60vh] max-w-lg flex-col items-center justify-center px-6 text-center">
        <p className="eyebrow">Restricted area</p>
        <h1 className="mt-2 text-3xl">You don’t have access to this page</h1>
        <p className="mt-3 text-ink-mute">If you believe this is a mistake, speak to the librarian or an administrator.</p>
        <a href="/app" className="mt-6 inline-flex rounded-xl bg-forest-700 px-5 py-2.5 text-sm font-semibold text-parchment">Back to my dashboard</a>
      </div>
    );
  }
  return <Outlet />;
}

export function RequireStaff() {
  return <RequireAuth roles={['librarian', 'admin']} />;
}

export function RequireAdmin() {
  return <RequireAuth roles={['admin']} />;
}

/** Where each role lands after signing in. */
export function homeForRole(role?: Role | null) {
  if (!role) return '/';
  return role === 'librarian' || role === 'admin' ? '/app' : '/books';
}
