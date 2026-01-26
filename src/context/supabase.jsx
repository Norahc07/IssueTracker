// client/src/context/supabase.jsx
import { createContext, useContext, useEffect, useState } from 'react';
import { createClient } from '@supabase/supabase-js';

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

    try {
      // First try to get role from users table
      const { data, error } = await supabase
        .from('users')
        .select('role')
        .eq('id', userId)
        .single();

      if (!error && data) {
        setUserRole(data.role || 'intern');
        return;
      }

      // If users table doesn't exist, check user metadata
      if (userMetadata?.role) {
        setUserRole(userMetadata.role);
        return;
      }

      // Default to intern if no role found
      console.warn('Could not fetch user role, defaulting to intern');
      setUserRole('intern');
    } catch (error) {
      // If table doesn't exist, try user metadata
      if (userMetadata?.role) {
        setUserRole(userMetadata.role);
      } else {
        console.warn('Error fetching user role, defaulting to intern:', error);
        setUserRole('intern');
      }
    }
  };

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        await fetchUserRole(session.user.id, session.user.user_metadata);
      }
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        await fetchUserRole(session.user.id, session.user.user_metadata);
      } else {
        setUserRole(null);
      }
      setLoading(false);
    });

    return () => subscription?.unsubscribe();
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