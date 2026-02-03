// client/src/context/supabase.jsx
import { createContext, useContext, useEffect, useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import { queryCache } from '../utils/queryCache.js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase environment variables');
}

// Single shared client for the whole app (avoids "Multiple GoTrueClient instances")
const SUPABASE_GLOBAL_KEY = '__kti_supabase_client';
const supabase =
  (typeof globalThis !== 'undefined' && globalThis[SUPABASE_GLOBAL_KEY]) ||
  (() => {
    const client = createClient(supabaseUrl, supabaseKey, {
      auth: {
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true,
      },
    });
    if (typeof globalThis !== 'undefined') globalThis[SUPABASE_GLOBAL_KEY] = client;
    return client;
  })();

const ROLE_CACHE_TTL = 10 * 60 * 1000; // 10 min

const noop = () => {};
const defaultContext = {
  supabase,
  session: null,
  user: null,
  userRole: null,
  loading: false,
  clearSession: noop,
};

const SupabaseContext = createContext(defaultContext);

export function SupabaseProvider({ children }) {
  const [session, setSession] = useState(null);
  const [user, setUser] = useState(null);
  const [userRole, setUserRole] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchUserRole = async (userId, userMetadata = null) => {
    if (!userId) {
      setUserRole(null);
      return;
    }

    const cacheKey = `role:${userId}`;
    const cached = queryCache.get(cacheKey);
    if (cached != null) {
      setUserRole(cached);
      return;
    }

    try {
      const { data, error } = await supabase
        .from('users')
        .select('role')
        .eq('id', userId)
        .single();

      if (!error && data) {
        const role = data.role || 'intern';
        queryCache.set(cacheKey, role, ROLE_CACHE_TTL);
        setUserRole(role);
        return;
      }

      if (userMetadata?.role) {
        queryCache.set(cacheKey, userMetadata.role, ROLE_CACHE_TTL);
        setUserRole(userMetadata.role);
        return;
      }

      console.warn('Could not fetch user role, defaulting to intern');
      setUserRole('intern');
      queryCache.set(cacheKey, 'intern', ROLE_CACHE_TTL);
    } catch (error) {
      if (userMetadata?.role) {
        setUserRole(userMetadata.role);
      } else {
        console.warn('Error fetching user role, defaulting to intern:', error);
        setUserRole('intern');
      }
    }
  };

  useEffect(() => {
    const AUTH_TIMEOUT_MS = 5000;

    const timeoutId = setTimeout(() => {
      setLoading(false);
    }, AUTH_TIMEOUT_MS);

    supabase.auth.getSession()
      .then(({ data: { session } }) => {
        clearTimeout(timeoutId);
        setSession(session);
        setUser(session?.user ?? null);
        setLoading(false);
        if (session?.user) {
          fetchUserRole(session.user.id, session.user.user_metadata);
        }
      })
      .catch((err) => {
        clearTimeout(timeoutId);
        console.warn('Auth getSession error:', err);
        const msg = err?.message || '';
        if (msg.includes('Refresh Token') || msg.includes('Invalid') || msg.includes('JWT')) {
          queryCache.clearAll();
          supabase.auth.signOut();
          setSession(null);
          setUser(null);
          setUserRole(null);
        }
        setLoading(false);
      });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        fetchUserRole(session.user.id, session.user.user_metadata);
      } else {
        setUserRole(null);
        if (event === 'SIGNED_OUT') queryCache.clearAll();
      }
      setLoading(false);
    });

    // Periodically verify session (e.g. after invalid refresh token)
    const checkSession = async () => {
      try {
        const { data: { session: s } } = await supabase.auth.getSession();
        if (!s) {
          setSession(null);
          setUser(null);
          setUserRole(null);
          queryCache.clearAll();
        }
      } catch {
        setSession(null);
        setUser(null);
        setUserRole(null);
        queryCache.clearAll();
      }
    };
    const interval = setInterval(checkSession, 60000);

    return () => {
      clearTimeout(timeoutId);
      clearInterval(interval);
      subscription?.unsubscribe();
    };
  }, []);

  const clearSession = () => {
    setSession(null);
    setUser(null);
    setUserRole(null);
    queryCache.clearAll();
    try {
      const keys = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith('sb-') && key.endsWith('-auth-token')) keys.push(key);
      }
      keys.forEach((k) => localStorage.removeItem(k));
    } catch (_) {}
  };

  return (
    <SupabaseContext.Provider value={{ supabase, session, user, userRole, loading, clearSession }}>
      {children}
    </SupabaseContext.Provider>
  );
}

export const useSupabase = () => {
  try {
    const context = useContext(SupabaseContext);
    return context && typeof context.supabase === 'object' ? context : defaultContext;
  } catch (_) {
    return defaultContext;
  }
};