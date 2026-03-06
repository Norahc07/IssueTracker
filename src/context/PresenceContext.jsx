import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useSupabase } from './supabase.jsx';

const PRESENCE_CHANNEL = 'kti-presence';
const INACTIVE_THRESHOLD_MS = 10 * 60 * 1000; // 10 minutes
const ACTIVITY_DEBOUNCE_MS = 60 * 1000;       // update presence at most every 1 min on activity
const HEARTBEAT_MS = 2 * 60 * 1000;          // heartbeat every 2 min so we stay in sync

const defaultContext = {
  presenceByUserId: {},
  getStatus: () => 'offline',
  myStatus: 'offline',
};

const PresenceContext = createContext(defaultContext);

export function PresenceProvider({ children }) {
  const { supabase, user } = useSupabase();
  const [presenceByUserId, setPresenceByUserId] = useState({});
  const channelRef = useRef(null);
  const lastTrackRef = useRef(0);
  const heartbeatRef = useRef(null);

  const trackPresence = useCallback(
    (payload = {}) => {
      const channel = channelRef.current;
      if (!channel || !user) return;
      const now = Date.now();
      lastTrackRef.current = now;
      channel
        .track({
          user_id: user.id,
          full_name: (user.user_metadata?.full_name || user.email || '').trim() || null,
          email: user.email || null,
          ...payload,
          last_activity_at: payload.last_activity_at ?? now,
        })
        .catch((err) => console.warn('Presence track error:', err));
    },
    [user]
  );

  useEffect(() => {
    if (!user?.id || !supabase) return;

    const channel = supabase.channel(PRESENCE_CHANNEL, {
      config: { presence: { key: user.id } },
    });
    channelRef.current = channel;

    channel
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState();
        const byUserId = {};
        Object.values(state).forEach((presences) => {
          (presences || []).forEach((p) => {
            const uid = p.user_id;
            if (!uid) return;
            const existing = byUserId[uid];
            const lastAt = p.last_activity_at || 0;
            if (!existing || lastAt > (existing.last_activity_at || 0)) {
              byUserId[uid] = {
                user_id: uid,
                full_name: p.full_name ?? null,
                email: p.email ?? null,
                last_activity_at: lastAt,
              };
            }
          });
        });
        setPresenceByUserId(byUserId);
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await trackPresence({ last_activity_at: Date.now() });
        }
      });

    const onActivity = () => {
      const now = Date.now();
      if (now - lastTrackRef.current < ACTIVITY_DEBOUNCE_MS) return;
      trackPresence({ last_activity_at: now });
    };

    const events = ['mousedown', 'mousemove', 'keydown', 'scroll', 'touchstart'];
    events.forEach((ev) => window.addEventListener(ev, onActivity));

    heartbeatRef.current = setInterval(() => {
      trackPresence({ last_activity_at: Date.now() });
    }, HEARTBEAT_MS);

    return () => {
      events.forEach((ev) => window.removeEventListener(ev, onActivity));
      if (heartbeatRef.current) {
        clearInterval(heartbeatRef.current);
        heartbeatRef.current = null;
      }
      channel.unsubscribe();
      channelRef.current = null;
      setPresenceByUserId({});
    };
  }, [user?.id, supabase, trackPresence]);

  const getStatus = useCallback(
    (userId) => {
      const p = presenceByUserId[userId];
      if (!p) return 'offline';
      const last = p.last_activity_at || 0;
      const elapsed = Date.now() - last;
      if (elapsed > INACTIVE_THRESHOLD_MS) return 'inactive';
      return 'online';
    },
    [presenceByUserId]
  );

  const myStatus = user?.id ? getStatus(user.id) : 'offline';

  const value = useMemo(
    () => ({
      presenceByUserId,
      getStatus,
      myStatus,
      inactiveThresholdMinutes: INACTIVE_THRESHOLD_MS / 60000,
    }),
    [presenceByUserId, getStatus, myStatus]
  );

  return (
    <PresenceContext.Provider value={value}>
      {children}
    </PresenceContext.Provider>
  );
}

export function usePresence() {
  const ctx = useContext(PresenceContext);
  return ctx || defaultContext;
}
