import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { api } from '../services/api';

export interface User {
  id: string;
  email: string;
  firstName?: string;
  lastName?: string;
  name?: string;
  phoneNumber?: string;
  role: 'super_admin' | 'owner' | 'manager' | 'accountant' | 'tenant';
  organisationId: string;
  mfaEnabled?: boolean;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<User>;
  loginWithGoogle: () => void;
  handleOAuthCallback: (accessToken: string, user: User) => User;
  logout: () => void;
  refreshToken: () => Promise<void>;
  extendSession: () => void;
  updateUser: (updates: Partial<User>) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const SESSION_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes
// SWE-19 — Show a warning 5 minutes before session expiry so the user can extend
const SESSION_WARNING_MS = 25 * 60 * 1000; // 25 minutes

const normalizeRole = (role: string): User['role'] => {
  const normalized = role.toLowerCase();
  if (['super_admin', 'owner', 'manager', 'accountant', 'tenant'].includes(normalized)) {
    return normalized as User['role'];
  }
  throw new Error(`Unsupported user role: ${role}`);
};

const normalizeUser = (user: User): User => ({
  ...user,
  role: normalizeRole(user.role),
  name: [user.firstName, user.lastName].filter(Boolean).join(' ') || user.name || '',
});

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [showSessionWarning, setShowSessionWarning] = useState(false);
  const logoutTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const warningTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const logoutRef = useRef<() => void>(() => {});

  const clearSessionTimeout = useCallback(() => {
    if (logoutTimerRef.current) {
      clearTimeout(logoutTimerRef.current);
      logoutTimerRef.current = null;
    }
    if (warningTimerRef.current) {
      clearTimeout(warningTimerRef.current);
      warningTimerRef.current = null;
    }
    setShowSessionWarning(false);
  }, []);

  const startSessionTimeout = useCallback(() => {
    clearSessionTimeout();
    // SWE-19 — Show warning at 25 minutes
    warningTimerRef.current = setTimeout(() => {
      setShowSessionWarning(true);
    }, SESSION_WARNING_MS);
    // Logout at 30 minutes
    logoutTimerRef.current = setTimeout(() => {
      logoutRef.current();
    }, SESSION_TIMEOUT_MS);
  }, [clearSessionTimeout]);

  const logout = useCallback(async () => {
    try {
      await api.post('/auth/logout');
    } catch {
      // Ignore errors — still clear local state
    }
    localStorage.removeItem('accessToken');
    setUser(null);
    clearSessionTimeout();
  }, [clearSessionTimeout]);

  // Keep logout ref updated so timer always calls latest version
  logoutRef.current = logout;

  useEffect(() => {
    const token = localStorage.getItem('accessToken');
    if (token) {
      fetchUser();
    } else {
      setLoading(false);
    }
  }, []);

  // Start session timeout when user logs in
  useEffect(() => {
    if (user) {
      startSessionTimeout();
    } else {
      clearSessionTimeout();
    }
    return () => clearSessionTimeout();
  }, [user, startSessionTimeout, clearSessionTimeout]);

  // Reset timeout on user activity
  useEffect(() => {
    if (!user) return;
    const events = ['mousedown', 'keydown', 'touchstart', 'scroll'];
    const onActivity = () => startSessionTimeout();
    events.forEach((e) => window.addEventListener(e, onActivity));
    return () => events.forEach((e) => window.removeEventListener(e, onActivity));
  }, [user, startSessionTimeout]);

  const extendSession = useCallback(() => {
    setShowSessionWarning(false);
    startSessionTimeout();
  }, [startSessionTimeout]);

  const fetchUser = async () => {
    try {
      const response = await api.get('/auth/me');
      setUser(normalizeUser(response.data));
    } catch (error) {
      localStorage.removeItem('accessToken');
    } finally {
      setLoading(false);
    }
  };

  const login = async (email: string, password: string): Promise<User> => {
    const response = await api.post('/auth/login', { email, password });
    const { accessToken, user: userData, mfaRequired, subscriptionRequired } = response.data;
    localStorage.setItem('accessToken', accessToken);
    const normalized = normalizeUser(userData);
    setUser(normalized);
    // Attach flags so the Login page can redirect accordingly
    (normalized as any).mfaRequired = mfaRequired;
    (normalized as any).subscriptionRequired = subscriptionRequired;
    return normalized;
  };

  const loginWithGoogle = () => {
    const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3000';
    window.location.href = `${apiUrl}/auth/google`;
  };

  const handleOAuthCallback = (accessToken: string, userData: User): User => {
    localStorage.setItem('accessToken', accessToken);
    const normalized = normalizeUser(userData);
    setUser(normalized);
    return normalized;
  };

  const refreshToken = async () => {
    try {
      const response = await api.post('/auth/refresh');
      const { accessToken, user: userData } = response.data;
      if (accessToken) {
        localStorage.setItem('accessToken', accessToken);
      }
      if (userData) {
        setUser(normalizeUser(userData));
      }
    } catch (error) {
      logout();
    }
  };

  const updateUser = useCallback((updates: Partial<User>) => {
    setUser((prevUser) => {
      if (!prevUser) return null;
      const updatedUser = { ...prevUser, ...updates };
      // Update the name field when firstName or lastName changes
      if (updates.firstName !== undefined || updates.lastName !== undefined) {
        updatedUser.name = [updatedUser.firstName, updatedUser.lastName]
          .filter(Boolean)
          .join(' ') || updatedUser.name || '';
      }
      return updatedUser;
    });
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, login, loginWithGoogle, handleOAuthCallback, logout, refreshToken, extendSession, updateUser }}>
      {children}
      {/* SWE-19 — Session expiry warning modal */}
      {showSessionWarning && user && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
          <div className="bg-white rounded-lg shadow-xl p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold mb-2">Session expiring soon</h3>
            <p className="text-gray-600 mb-4">
              Your session will expire in 5 minutes due to inactivity. Click "Stay signed in" to continue.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => logout()}
                className="px-4 py-2 bg-gray-200 text-gray-700 rounded hover:bg-gray-300"
              >
                Sign out now
              </button>
              <button
                onClick={() => extendSession()}
                className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
              >
                Stay signed in
              </button>
            </div>
          </div>
        </div>
      )}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};