import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  authLogin,
  authLogout,
  authSession,
  setUnauthorizedHandler,
} from '../services/api';

const AuthContext = createContext(null);

function sessionUser(session) {
  return {
    username: session.username,
    role: session.role || 'viewer',
    permissions: Array.isArray(session.permissions) ? session.permissions : [],
  };
}

function clearLegacyBrowserState() {
  try {
    localStorage.removeItem('nod_auth_token');
    localStorage.removeItem('nod_last_activity');
  } catch {
    // Storage can be disabled; it is never the source of truth for sessions.
  }
}

export function AuthProvider({ children }) {
  const [status, setStatus] = useState('loading');
  const [user, setUser] = useState(null);

  const becomeAnonymous = useCallback(() => {
    clearLegacyBrowserState();
    setUser(null);
    setStatus('anonymous');
  }, []);

  const refreshSession = useCallback(async () => {
    try {
      const session = await authSession();
      if (session.authenticated && session.username) {
        setUser(sessionUser(session));
        setStatus('authenticated');
        return;
      }
    } catch {
      // A missing, expired, or unreachable session must not unlock the UI.
    }
    becomeAnonymous();
  }, [becomeAnonymous]);

  useEffect(() => {
    clearLegacyBrowserState();
    const unregisterUnauthorizedHandler = setUnauthorizedHandler(becomeAnonymous);
    void Promise.resolve().then(refreshSession);
    return unregisterUnauthorizedHandler;
  }, [becomeAnonymous, refreshSession]);

  const login = useCallback(async (username, password) => {
    const session = await authLogin(username, password);
    if (!session.authenticated || !session.username) {
      becomeAnonymous();
      throw new Error('The server did not create a dashboard session.');
    }
    setUser(sessionUser(session));
    setStatus('authenticated');
    return session;
  }, [becomeAnonymous]);

  const logout = useCallback(async () => {
    try {
      await authLogout();
    } finally {
      becomeAnonymous();
    }
  }, [becomeAnonymous]);

  const value = useMemo(() => ({
    status,
    user,
    login,
    logout,
    refreshSession,
    hasPermission: (permission) => Boolean(user?.permissions?.includes(permission)),
  }), [login, logout, refreshSession, status, user]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used inside AuthProvider');
  }
  return context;
}
