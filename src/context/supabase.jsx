// client/src/context/supabase.jsx
import { createContext, useContext, useEffect, useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import { queryCache } from '../utils/queryCache.js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase environment variables');
}

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
  },
});

const ROLE_CACHE_TTL = 10 * 60 * 1000; // 10 min

const SupabaseContext = createContext();

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

    return () => {
      clearTimeout(timeoutId);
      subscription?.unsubscribe();
    };
  }, []);

  return (
    <SupabaseContext.Provider value={{ supabase, session, user, userRole, loading }}>
      {children}
    </SupabaseContext.Provider>
  );
}

export const useSupabase = () => {
  const context = useContext(SupabaseContext);
  if (context === undefined) {
    throw new Error('useSupabase must be used within a SupabaseProvider');
  }
  return context;
};