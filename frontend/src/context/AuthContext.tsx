'use client';

import { createContext, useContext, useSyncExternalStore, ReactNode } from 'react';
import { useRouter } from 'next/navigation';

interface User {
  id: string;
  nome: string;
  email: string;
  role: string; // super_admin, admin_central, gerente_almox, resp_sub_almox, operador_setor
  scope_id?: string;
  central_id?: string;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (user: User) => void;
  logout: () => void;
  canAccess: (requiredRole: string[]) => boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

type AuthSnapshot = { user: User | null; hydrated: boolean };

const AUTH_STORAGE_KEY = 'almox_user';
const SERVER_SNAPSHOT: AuthSnapshot = { user: null, hydrated: false };

const safeParseUser = (value: string | null): User | null => {
  if (!value) return null;
  try {
    return JSON.parse(value) as User;
  } catch {
    if (typeof window !== 'undefined') {
      localStorage.removeItem(AUTH_STORAGE_KEY);
    }
    return null;
  }
};

const schedule = (fn: () => void) => {
  if (typeof queueMicrotask === 'function') queueMicrotask(fn);
  else setTimeout(fn, 0);
};

const authStore = (() => {
  let snapshot: AuthSnapshot = { user: null, hydrated: false };
  const listeners = new Set<() => void>();

  const emit = () => {
    for (const listener of listeners) listener();
  };

  const hydrate = () => {
    if (typeof window === 'undefined') return;
    if (snapshot.hydrated) return;
    snapshot = { hydrated: true, user: safeParseUser(localStorage.getItem(AUTH_STORAGE_KEY)) };
    emit();
  };

  const subscribe = (listener: () => void) => {
    listeners.add(listener);

    if (typeof window !== 'undefined' && !snapshot.hydrated) {
      schedule(hydrate);
    }

    const onStorage = (e: StorageEvent) => {
      if (e.key !== AUTH_STORAGE_KEY) return;
      snapshot = { hydrated: true, user: safeParseUser(localStorage.getItem(AUTH_STORAGE_KEY)) };
      emit();
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('storage', onStorage);
    }

    return () => {
      listeners.delete(listener);
      if (typeof window !== 'undefined') {
        window.removeEventListener('storage', onStorage);
      }
    };
  };

  const getSnapshot = () => snapshot;
  const getServerSnapshot = () => SERVER_SNAPSHOT;

  const setUser = (user: User | null) => {
    if (typeof window !== 'undefined') {
      if (user) localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(user));
      else localStorage.removeItem(AUTH_STORAGE_KEY);
    }

    snapshot = { hydrated: true, user };
    emit();
  };

  return { subscribe, getSnapshot, getServerSnapshot, setUser };
})();

export function AuthProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const snapshot = useSyncExternalStore(authStore.subscribe, authStore.getSnapshot, authStore.getServerSnapshot);
  const user = snapshot.user;
  const loading = !snapshot.hydrated;

  const login = (userData: User) => {
    authStore.setUser(userData);
    router.push(userData.role === 'operador_setor' ? '/setor' : '/');
  };

  const logout = () => {
    authStore.setUser(null);
    router.push('/login');
  };

  const canAccess = (allowedRoles: string[]) => {
    if (!user) return false;
    if (user.role === 'super_admin') return true;
    return allowedRoles.includes(user.role);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, canAccess }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
