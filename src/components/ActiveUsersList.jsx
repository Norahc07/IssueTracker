import { useEffect, useState } from 'react';
import { useSupabase } from '../context/supabase.jsx';
import { usePresence } from '../context/PresenceContext.jsx';

function formatIdle(lastActivityAt) {
  if (!lastActivityAt) return null;
  const elapsed = Date.now() - lastActivityAt;
  if (elapsed < 60000) return '<1m';
  if (elapsed < 3600000) return `${Math.floor(elapsed / 60000)}m`;
  return `${Math.floor(elapsed / 3600000)}h`;
}

export default function ActiveUsersList() {
  const { supabase, user: currentUser } = useSupabase();
  const { getStatus, presenceByUserId, inactiveThresholdMinutes } = usePresence();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    if (!supabase) return;
    let cancelled = false;
    supabase
      .from('users')
      .select('id, full_name, email, role')
      .order('full_name', { ascending: true })
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          console.warn('ActiveUsersList fetch error:', error);
          setUsers([]);
        } else {
          setUsers(data || []);
        }
        setLoading(false);
      });
    return () => { cancelled = true; };
  }, [supabase]);

  // Re-render every minute so "Idle Xm" and status labels update
  const [, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 60 * 1000);
    return () => clearInterval(t);
  }, []);

  if (loading) return null;

  const onlineCount = users.filter((u) => getStatus(u.id) === 'online').length;
  const inactiveCount = users.filter((u) => getStatus(u.id) === 'inactive').length;
  const offlineCount = users.filter((u) => getStatus(u.id) === 'offline').length;

  return (
    <div className="border-t border-white/20 pt-3 mt-3">
      <button
        type="button"
        onClick={() => setCollapsed((c) => !c)}
        className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm font-medium text-white/90 hover:bg-white/10"
        aria-expanded={!collapsed}
      >
        <span>Active users</span>
        <span className="text-xs text-white/70">
          {onlineCount} online · {inactiveCount} inactive · {offlineCount} offline
        </span>
        <svg
          className={`h-4 w-4 flex-shrink-0 transition-transform ${collapsed ? '' : 'rotate-180'}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {!collapsed && (
        <ul className="mt-2 max-h-48 overflow-y-auto space-y-1 px-1" style={{ WebkitOverflowScrolling: 'touch' }}>
          {users.map((u) => {
            const status = getStatus(u.id);
            const presence = presenceByUserId[u.id];
            const lastAt = presence?.last_activity_at;
            const isMe = currentUser?.id === u.id;
            const displayName = (u.full_name || u.email || 'Unknown').trim() || 'Unknown';
            const idleLabel = status === 'inactive' && lastAt ? formatIdle(lastAt) : null;
            return (
              <li
                key={u.id}
                className="flex items-center gap-2 rounded px-2 py-1.5 text-xs text-white/90"
                title={u.email || u.id}
              >
                <span
                  className="h-2 w-2 flex-shrink-0 rounded-full"
                  aria-hidden
                  style={{
                    backgroundColor:
                      status === 'online'
                        ? '#22c55e'
                        : status === 'inactive'
                          ? '#eab308'
                          : 'rgba(255,255,255,0.4)',
                  }}
                />
                <span className="min-w-0 flex-1 truncate">
                  {displayName}
                  {isMe && <span className="ml-1 text-white/70">(you)</span>}
                </span>
                <span className="flex-shrink-0 text-white/60">
                  {status === 'online' && 'Online'}
                  {status === 'inactive' && (idleLabel ? `Idle ${idleLabel}` : `Inactive (${inactiveThresholdMinutes}m+)`)}
                  {status === 'offline' && 'Offline'}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
