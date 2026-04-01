import { useEffect, useMemo, useState } from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import DailyReportReminder from './DailyReportReminder.jsx';
import { useSupabase } from '../context/supabase.jsx';
import { getRoleDisplayName, getRoleColor, permissions } from '../utils/rolePermissions.js';
import { createNotifications } from '../utils/notifications.js';
import { applyTheme, getStoredTheme, setStoredTheme } from '../utils/theme.js';

const PRIMARY = '#6795BE';
const PRIMARY_LIGHT = 'rgba(103, 149, 190, 0.15)';

const navItems = [
  { to: 'dashboard', label: 'Dashboard', icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6' },
  { to: '/attendance', label: 'Attendance', icon: 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z' },
  { to: '/onboarding', label: 'Onboarding / Offboarding', icon: 'M4 6h16M4 10h16M4 14h10M4 18h6' },
  { to: '/report', label: 'Report Issue', icon: 'M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z' },
  { to: '/kanban', label: 'Kanban', icon: 'M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2v10a2 2 0 002 2z' },
  { to: '/organized-tickets', label: 'Organize Tickets', icon: 'M15 5v2m0 4v2m0 4v2M5 5a2 2 0 00-2 2v3a2 2 0 110 4v3a2 2 0 002 2h14a2 2 0 002-2v-3a2 2 0 110-4V7a2 2 0 00-2-2H5z' },
  { to: '/tasks', label: 'Tasks', icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4' },
  { to: '/tracker', label: 'Tracker', icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7v3m0 0v3m0-3h3m-3 0H9m-2-5a4 4 0 11-8 0 4 4 0 018 0z' },
  { to: '/repository', label: 'Repository', icon: 'M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v10a2 2 0 01-2 2H5a2 2 0 01-2-2V7z' },
  { to: '/daily-report', label: 'Daily Report', icon: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.5a2 2 0 012 2v5.5a2 2 0 01-2 2z' },
];

function Icon({ path, className = 'w-5 h-5' }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={path} />
    </svg>
  );
}

export default function SidebarLayout() {
  const { user, userRole, userTeam, supabase, clearSession } = useSupabase();
  const location = useLocation();
  const navigate = useNavigate();
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [notificationsLoading, setNotificationsLoading] = useState(false);
  const [notificationDetail, setNotificationDetail] = useState(null);
  const [autoJobRunning, setAutoJobRunning] = useState(false);
  const [theme, setTheme] = useState(() => getStoredTheme());
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const canSendReminders = permissions.canManageAttendanceSchedules(userRole, userTeam); // Admin + Monitoring TL/VTL

  const todayStr = useMemo(() => new Date().toISOString().slice(0, 10), []);

  const loadNotifications = async () => {
    if (!supabase || !user?.id) return;
    setNotificationsLoading(true);
    try {
      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .eq('recipient_user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      setNotifications(Array.isArray(data) ? data : []);
    } catch (e) {
      console.warn('Notifications load error:', e);
      setNotifications([]);
    } finally {
      setNotificationsLoading(false);
    }
  };

  useEffect(() => {
    if (notificationsOpen) loadNotifications();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notificationsOpen, supabase, user?.id]);

  // Keep the <html> class in sync with stored theme.
  // (We apply via setStoredTheme to avoid any stale state re-applying "dark".)
  useEffect(() => {
    const t = getStoredTheme();
    applyTheme(t);
    setTheme(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-hide sidebar on smaller screens; keep desktop collapse as separate behavior.
  useEffect(() => {
    const media = window.matchMedia('(min-width: 1024px)');
    const onChange = () => {
      if (media.matches) setIsMobileSidebarOpen(false);
    };
    onChange();
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, []);

  const markAllAsRead = async () => {
    if (!supabase || !user?.id) return;
    const unread = notifications.filter((n) => !n.read_at);
    if (!unread.length) return;
    try {
      const nowIso = new Date().toISOString();
      const ids = unread.map((n) => n.id);
      await supabase.from('notifications').update({ read_at: nowIso }).in('id', ids);
      setNotifications((prev) => prev.map((n) => (ids.includes(n.id) ? { ...n, read_at: nowIso } : n)));
    } catch (e) {
      console.warn('Notifications mark read error:', e);
    }
  };

  const markNotificationAsRead = async (notificationId) => {
    if (!supabase || !notificationId) return;
    const existing = notifications.find((n) => n.id === notificationId);
    if (existing?.read_at) return;
    const nowIso = new Date().toISOString();
    try {
      await supabase.from('notifications').update({ read_at: nowIso }).eq('id', notificationId);
      setNotifications((prev) => prev.map((n) => (n.id === notificationId ? { ...n, read_at: nowIso } : n)));
    } catch (e) {
      console.warn('Notifications mark single read error:', e);
    }
  };

  const openNotificationDetail = async (n) => {
    if (!n) return;
    setNotificationDetail(n);
    if (!n.read_at) await markNotificationAsRead(n.id);
  };

  const getSegments = (log) => {
    if (!log) return [];
    const seg = log.segments;
    if (Array.isArray(seg) && seg.length > 0) return seg;
    if (log.time_in) return [{ time_in: log.time_in, time_out: log.time_out || null }];
    return [];
  };

  const isClockedIn = (log) => {
    const seg = getSegments(log);
    if (!seg.length) return false;
    const last = seg[seg.length - 1];
    return last && !last.time_out;
  };

  const sendAutoClockOutReminders630 = async () => {
    if (!supabase || !user?.id || !canSendReminders) return;
    const key = `auto:reminders:630:${todayStr}`;
    if (localStorage.getItem(key)) return;
    setAutoJobRunning(true);
    try {
      const { data: logs, error: logsErr } = await supabase
        .from('attendance_logs')
        .select('user_id, log_date, segments, time_in, time_out')
        .eq('log_date', todayStr);
      if (logsErr) throw logsErr;
      const list = Array.isArray(logs) ? logs : [];
      const active = list.filter((l) => isClockedIn(l));
      if (!active.length) {
        localStorage.setItem(key, '1');
        return;
      }
      const payload = active.map((l) => {
        const seg = getSegments(l);
        const last = seg[seg.length - 1];
        const startIso = last?.time_in || l.time_in;
        return {
          recipient_user_id: l.user_id,
          sender_user_id: user.id,
          type: 'reminder_clock_out_630',
          title: 'Clock-out reminder',
          body: `It is past 6:30 PM and you are still clocked in. Please clock out if you are done for the day.`,
          context_date: todayStr,
          metadata: { log_date: todayStr, since: startIso || null },
        };
      });
      await createNotifications(supabase, payload);
      localStorage.setItem(key, '1');
    } catch (e) {
      console.warn('Auto 6:30 reminders error:', e);
    } finally {
      setAutoJobRunning(false);
    }
  };

  const autoClockOutAtMidnight = async () => {
    if (!supabase || !user?.id || !canSendReminders) return;
    const now = new Date();
    const todayYmd = now.toISOString().slice(0, 10);
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    const ymd = yesterday.toISOString().slice(0, 10);
    const key = `auto:clockout:midnight:${ymd}`;
    if (localStorage.getItem(key)) return;

    setAutoJobRunning(true);
    try {
      const { data: logs, error: logsErr } = await supabase
        .from('attendance_logs')
        .select('user_id, log_date, segments, time_in, time_out')
        .eq('log_date', ymd);
      if (logsErr) throw logsErr;
      const list = Array.isArray(logs) ? logs : [];
      const active = list.filter((l) => isClockedIn(l));
      if (!active.length) {
        localStorage.setItem(key, '1');
        return;
      }

      // Find Monitoring TL/VTL recipients + Admin
      let leadIds = [];
      try {
        const { data: leads, error: leadsErr } = await supabase
          .from('users')
          .select('id, email, full_name, role, team')
          .or('role.eq.admin,and(team.eq.monitoring,role.in.(tl,vtl))');
        if (leadsErr) throw leadsErr;
        leadIds = (Array.isArray(leads) ? leads : []).map((u) => u.id).filter(Boolean);
      } catch (e) {
        // If RLS blocks reading public.users, proceed without lead notifications.
        const status = e?.status ?? e?.cause?.status;
        const code = e?.code ?? e?.cause?.code;
        if (!(status === 403 || code === '42501')) throw e;
      }

      // Fetch user display details for the active interns
      const userIds = [...new Set(active.map((l) => l.user_id))];
      let usersData = [];
      try {
        const { data, error: uErr } = await supabase
          .from('users')
          .select('id, email, full_name')
          .in('id', userIds);
        if (uErr) throw uErr;
        usersData = Array.isArray(data) ? data : [];
      } catch (e) {
        const status = e?.status ?? e?.cause?.status;
        const code = e?.code ?? e?.cause?.code;
        if (!(status === 403 || code === '42501')) throw e;
      }
      const byId = {};
      (Array.isArray(usersData) ? usersData : []).forEach((u) => { byId[u.id] = u; });

      const midnightIso = new Date(`${todayYmd}T00:00:00`).toISOString(); // 12:00 AM of today (end of yesterday)

      // Auto-clockout each active session on yesterday's log
      for (const log of active) {
        const seg = getSegments(log);
        const updatedSeg = seg.map((s, i) => (i === seg.length - 1 ? { ...s, time_out: midnightIso } : s));
        const { error: updErr } = await supabase
          .from('attendance_logs')
          .update({ time_out: midnightIso, segments: updatedSeg, updated_at: new Date().toISOString() })
          .eq('user_id', log.user_id)
          .eq('log_date', ymd);
        if (updErr) throw updErr;
      }

      // Notify Monitoring TL/VTL
      if (leadIds.length) {
        const internLines = active.map((l) => {
          const u = byId[l.user_id] || {};
          return `- ${u.full_name || u.email || l.user_id}`;
        }).join('\n');
        const payload = leadIds.map((leadId) => ({
          recipient_user_id: leadId,
          sender_user_id: user.id,
          type: 'alert_missed_clock_out',
          title: 'Auto clock-out executed',
          body: `Some interns were still clocked in and were auto clocked out at 12:00 AM for ${ymd}:\n${internLines}`,
          context_date: ymd,
          metadata: { log_date: ymd, count: active.length, user_ids: userIds },
        }));
        await createNotifications(supabase, payload);
      }

      localStorage.setItem(key, '1');
    } catch (e) {
      console.warn('Auto midnight clock-out error:', e);
    } finally {
      setAutoJobRunning(false);
    }
  };

  // Automatic jobs (best-effort while app is open):
  // - 6:30 PM: remind interns still clocked in
  // - 12:00 AM: auto clock-out yesterday's still-active logs and notify Monitoring TL/VTL
  useEffect(() => {
    if (!supabase || !user?.id || !canSendReminders) return;
    const tick = () => {
      const d = new Date();
      const h = d.getHours();
      const m = d.getMinutes();
      // 18:30 - 18:59
      if (h === 18 && m >= 30) sendAutoClockOutReminders630();
      // 00:00 - 00:10 (run after midnight)
      if (h === 0 && m <= 10) autoClockOutAtMidnight();
    };
    tick();
    const id = setInterval(tick, 60000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase, user?.id, canSendReminders]);

  const getDashboardPath = () => {
    if (userRole === 'superadmin') return '/user-management';
    if (userRole === 'admin' || userRole === 'tla') return '/admin/dashboard';
    if (userRole === 'lead' || userRole === 'tl' || userRole === 'vtl' || userRole === 'monitoring_team' || userRole === 'pat1') return '/lead/dashboard';
    return '/intern/dashboard';
  };

  const isActive = (to) => {
    if (to === 'dashboard') return location.pathname === getDashboardPath();
    return location.pathname === to || (to !== '/' && location.pathname.startsWith(to));
  };

  const handleLogout = () => {
    clearSession();
    navigate('/login', { replace: true });
    supabase.auth.signOut().catch(() => {});
  };

  const sidebarDesktopWidthClass = isSidebarCollapsed ? 'lg:w-20' : 'lg:w-72';
  const sidebarDesktopOffsetClass = isSidebarCollapsed ? 'lg:pl-20' : 'lg:pl-72';

  return (
    <div className="flex min-h-screen bg-gray-50 dark:bg-gray-950">
      {/* Mobile backdrop */}
      {isMobileSidebarOpen && (
        <button
          type="button"
          aria-label="Close sidebar overlay"
          className="fixed inset-0 z-30 bg-black/40 lg:hidden"
          onClick={() => setIsMobileSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed left-0 top-0 z-40 w-72 ${sidebarDesktopWidthClass} flex flex-col transition-all duration-200 ease-out
          ${isMobileSidebarOpen ? 'translate-x-0' : '-translate-x-full'} lg:translate-x-0`}
        style={{
          backgroundColor: PRIMARY,
          height: '100dvh',
          overflow: 'hidden',
        }}
      >
        <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
          <div className="relative flex shrink-0 h-24 items-center justify-center border-b border-white/20 px-4">
            <Link to={getDashboardPath()} className="flex w-full items-center justify-center focus:outline-none">
              <img
                src="/white-logo.png"
                alt="Knowles Training Institute"
                className={`${isSidebarCollapsed ? 'h-10 w-10' : 'h-24 w-auto max-w-[280px]'} object-contain`}
              />
            </Link>
          </div>
          <nav className="flex-1 min-h-0 overflow-x-hidden overflow-y-hidden px-3 py-2 space-y-0.5">
          {userRole !== 'superadmin' && navItems.map((item) => {
            // Tracker: only for admin, tla, intern, TLA team, or TL/VTL in TLA
            const canAccessTracker = () => {
              const isTla = userTeam && String(userTeam).toLowerCase() === 'tla';
              return userRole === 'admin' || userRole === 'tla' || userRole === 'intern' || isTla || ((userRole === 'tl' || userRole === 'vtl') && isTla);
            };
            if (item.to === '/tracker' && !canAccessTracker()) return null;

            // Hide Attendance page link only for superadmin (locked to management views)
            if (item.to === '/attendance' && userRole === 'superadmin') {
              return null;
            }
            
            let to = item.to === 'dashboard' ? getDashboardPath() : item.to;

            // Tasks routing for different teams
            if (item.to === '/tasks' && userRole !== 'admin') {
              const tStr = String(userTeam || '').toLowerCase();
              if (tStr === 'pat1' || tStr === 'pat 1') return null;
              if (tStr === 'monitoring' || tStr === 'monitoring_team') {
                to = '/monitoring-tasks';
              }
            }

            // Hide Daily Report (submit form) from admin, TLA, TL, VTL — they use Manage Daily Report only
            if (item.to === '/daily-report' && (userRole === 'admin' || userRole === 'tla' || userRole === 'tl' || userRole === 'vtl')) {
              return null;
            }
            
            const active = isActive(to === '/monitoring-tasks' ? '/monitoring-tasks' : item.to);
            return (
              <Link
                key={item.to}
                to={to}
                title={item.label}
                className={`flex min-w-0 items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                  active ? 'bg-white/30 text-white shadow-sm ring-1 ring-white/25' : 'text-white/90 hover:bg-white/20 hover:text-white'
                } ${isSidebarCollapsed ? 'justify-center px-2' : ''}`}
              >
                <Icon path={item.icon} className="h-5 w-5 flex-shrink-0" />
                {!isSidebarCollapsed && <span className="truncate">{item.label}</span>}
              </Link>
            );
          })}
          {userRole === 'superadmin' && (
            <>
              <Link
                to="/superadmin/overview"
                className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                  location.pathname === '/superadmin/overview' ? 'bg-white/30 text-white shadow-sm ring-1 ring-white/25' : 'text-white/90 hover:bg-white/20 hover:text-white'
                } ${isSidebarCollapsed ? 'justify-center px-2' : ''}`}
              >
                <Icon path="M3 3h18M3 9h18M3 15h18M3 21h18" className="h-5 w-5 flex-shrink-0" />
                {!isSidebarCollapsed && <span>OJT Overview</span>}
              </Link>
              <Link
                to="/user-management"
                className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                  location.pathname === '/user-management' ? 'bg-white/30 text-white shadow-sm ring-1 ring-white/25' : 'text-white/90 hover:bg-white/20 hover:text-white'
                } ${isSidebarCollapsed ? 'justify-center px-2' : ''}`}
              >
                <Icon path="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" className="h-5 w-5 flex-shrink-0" />
                {!isSidebarCollapsed && <span>User Management</span>}
              </Link>
            </>
          )}
          {(userRole !== 'superadmin' && (userRole === 'admin' || userRole === 'tla' || userRole === 'tl' || userRole === 'vtl')) && (
            <Link
              to="/user-management"
              className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                location.pathname === '/user-management' ? 'bg-white/30 text-white shadow-sm ring-1 ring-white/25' : 'text-white/90 hover:bg-white/20 hover:text-white'
              } ${isSidebarCollapsed ? 'justify-center px-2' : ''}`}
            >
              <Icon path="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" className="h-5 w-5 flex-shrink-0" />
              {!isSidebarCollapsed && <span>User Management</span>}
            </Link>
          )}
          {(userRole === 'admin' || userRole === 'tla') && (
            <Link
              to="/role-permissions"
              className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                location.pathname === '/role-permissions' ? 'bg-white/30 text-white shadow-sm ring-1 ring-white/25' : 'text-white/90 hover:bg-white/20 hover:text-white'
              } ${isSidebarCollapsed ? 'justify-center px-2' : ''}`}
            >
              <Icon path="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" className="h-5 w-5 flex-shrink-0" />
              {!isSidebarCollapsed && <span>Permissions</span>}
            </Link>
          )}
          {(userRole === 'admin' || userRole === 'tla' || userRole === 'tl' || userRole === 'vtl') && (
            <Link
              to="/daily-report/manage"
              className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                location.pathname === '/daily-report/manage' ? 'bg-white/30 text-white shadow-sm ring-1 ring-white/25' : 'text-white/90 hover:bg-white/20 hover:text-white'
              } ${isSidebarCollapsed ? 'justify-center px-2' : ''}`}
            >
              <Icon path="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.5a2 2 0 012 2v5.5a2 2 0 01-2 2z" className="h-5 w-5 flex-shrink-0" />
              {!isSidebarCollapsed && <span>Manage Daily Report</span>}
            </Link>
          )}
        </nav>
        </div>
        <div className="shrink-0 border-t border-white/20 p-3">
          <button
            onClick={handleLogout}
            className={`flex w-full items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium text-white transition-colors hover:bg-white/20 ${isSidebarCollapsed ? 'px-2' : ''}`}
            style={{ backgroundColor: PRIMARY_LIGHT }}
          >
            <Icon path="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" className="h-5 w-5" />
            {!isSidebarCollapsed && 'Logout'}
          </button>
        </div>
      </aside>

      {/* Main content */}
      <div className={`flex flex-1 flex-col pl-0 ${sidebarDesktopOffsetClass}`}>
        {/* Top header */}
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-2 border-b border-gray-200 bg-white px-4 sm:px-6 shadow-sm dark:bg-gray-950 dark:border-gray-800">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setIsMobileSidebarOpen((v) => !v)}
              className="lg:hidden rounded-lg p-2 text-gray-600 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-gray-900 dark:hover:text-gray-100"
              aria-label="Toggle sidebar"
              title="Toggle sidebar"
            >
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
            <button
              type="button"
              onClick={() => setIsSidebarCollapsed((v) => !v)}
              className="hidden lg:flex rounded-lg p-2 text-gray-600 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-gray-900 dark:hover:text-gray-100"
              aria-label={isSidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              title={isSidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            >
              {isSidebarCollapsed ? (
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              ) : (
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              )}
            </button>
          </div>
          <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              const next = theme === 'dark' ? 'light' : 'dark';
              const persisted = setStoredTheme(next);
              setTheme(persisted);
            }}
            className="rounded-full p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#6795BE] dark:text-gray-300 dark:hover:bg-gray-900 dark:hover:text-gray-100 dark:focus:ring-offset-gray-950"
            aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            title={theme === 'dark' ? 'Light mode' : 'Dark mode'}
          >
            {theme === 'dark' ? (
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v2m0 14v2m9-9h-2M5 12H3m15.364-6.364l-1.414 1.414M7.05 16.95l-1.414 1.414m0-11.314L7.05 7.05m9.9 9.9l1.414 1.414M12 8a4 4 0 100 8 4 4 0 000-8z" />
              </svg>
            ) : (
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12.79A9 9 0 1111.21 3a7 7 0 109.79 9.79z" />
              </svg>
            )}
          </button>
          <button
            type="button"
            onClick={() => setNotificationsOpen(true)}
            className="rounded-full p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#6795BE] dark:text-gray-300 dark:hover:bg-gray-900 dark:hover:text-gray-100 dark:focus:ring-offset-gray-950"
            aria-label="Notifications"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
            </svg>
          </button>
          <span className={`rounded-full px-3 py-1 text-xs font-medium ${getRoleColor(userRole)}`}>
            {getRoleDisplayName(userRole) || 'Intern'}
          </span>
          <button
            type="button"
            className="rounded-full p-1.5 text-gray-500 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#6795BE] dark:text-gray-300 dark:hover:bg-gray-900 dark:focus:ring-offset-gray-950"
            aria-label="Profile"
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-200 text-sm font-medium text-gray-600">
              {user?.email?.charAt(0).toUpperCase() || '?'}
            </span>
          </button>
          </div>
        </header>

        <main className="flex-1 p-4 sm:p-6 text-gray-900 dark:text-gray-100">
          <Outlet />
        </main>
      </div>
      <DailyReportReminder />

      {notificationsOpen && (
        <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setNotificationsOpen(false)}>
          <div
            className="bg-white dark:bg-gray-900 rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto border border-gray-200 dark:border-gray-800"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-4 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between">
              <div>
                <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">Notifications</h2>
                <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">All notifications are shown here. Close anytime.</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setNotificationsOpen(false);
                  setNotificationDetail(null);
                }}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                aria-label="Close notifications"
              >
                ✕
              </button>
            </div>

            <div className="px-5 py-4 space-y-4">
              {!notificationDetail && (
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={loadNotifications}
                      className="px-3 py-1.5 rounded-lg text-xs font-medium border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800"
                    >
                      Refresh
                    </button>
                    <button
                      type="button"
                      onClick={markAllAsRead}
                      disabled={!notifications.some((n) => !n.read_at)}
                      className="px-3 py-1.5 rounded-lg text-xs font-medium border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-60"
                    >
                      Mark all as read
                    </button>
                  </div>

                  {canSendReminders && (
                    <span className="text-xs text-gray-500 dark:text-gray-400">
                      Reminders are sent automatically at 6:30 PM; missed clock-outs auto close at 12:00 AM and notify Monitoring TL/VTL.
                      {autoJobRunning ? ' (running…)': ''}
                    </span>
                  )}
                </div>
              )}

              <div className="rounded-lg border border-gray-200 dark:border-gray-800 overflow-hidden">
                {notificationsLoading ? (
                  <div className="px-4 py-6 text-center text-gray-500 dark:text-gray-400 text-sm">Loading notifications…</div>
                ) : notifications.length === 0 ? (
                  <div className="px-4 py-6 text-center text-gray-500 dark:text-gray-400 text-sm">No notifications yet.</div>
                ) : (
                  <>
                    {/* Detail view */}
                    {notificationDetail && (
                      <div className="p-4 space-y-3">
                        <div className="flex items-start justify-between gap-3">
                          <button
                            type="button"
                            onClick={() => setNotificationDetail(null)}
                            className="text-xs font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-md px-2 py-1"
                          >
                            ← Back
                          </button>
                          <span className={`text-[11px] font-medium px-2 py-1 rounded-full ${notificationDetail.read_at ? 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300' : 'bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-200'}`}>
                            {notificationDetail.read_at ? 'Read' : 'Unread'}
                          </span>
                        </div>

                        <div className="space-y-1">
                          <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                            {notificationDetail.title || '—'}
                          </p>
                          {notificationDetail.body && (
                            <pre className="text-xs text-gray-700 dark:text-gray-200 whitespace-pre-wrap leading-5">
                              {notificationDetail.body}
                            </pre>
                          )}
                        </div>

                        <div className="pt-2 border-t border-gray-100 dark:border-gray-800 space-y-1">
                          <p className="text-[11px] text-gray-500 dark:text-gray-400">
                            Created: {notificationDetail.created_at ? new Date(notificationDetail.created_at).toLocaleString() : '—'}
                          </p>
                        </div>
                      </div>
                    )}

                    {/* List view */}
                    {!notificationDetail && (
                      <ul className="divide-y divide-gray-100 dark:divide-gray-800">
                        {notifications.map((n) => (
                          <li
                            key={n.id}
                            className={`px-4 py-3 cursor-pointer ${n.read_at ? 'bg-white dark:bg-gray-900' : 'bg-blue-50/40 dark:bg-blue-950/30'} hover:bg-gray-50 dark:hover:bg-gray-900`}
                            role="button"
                            tabIndex={0}
                            onClick={() => openNotificationDetail(n)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') openNotificationDetail(n);
                            }}
                            aria-label={`Open notification: ${n.title || 'notification'}`}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{n.title}</p>
                                {n.body && (
                                  <p className="mt-0.5 text-xs text-gray-700 dark:text-gray-200 whitespace-pre-line">
                                    {n.body}
                                  </p>
                                )}
                                <p className="mt-1 text-[11px] text-gray-500 dark:text-gray-400">
                                  {n.created_at ? new Date(n.created_at).toLocaleString() : '—'}
                                  {n.read_at ? ' • Read' : ' • Unread'}
                                </p>
                              </div>
                              <div className="text-gray-400 dark:text-gray-500 text-xs font-medium">
                                View
                              </div>
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
