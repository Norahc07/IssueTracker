import { useEffect, useMemo, useState } from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import DailyReportReminder from './DailyReportReminder.jsx';
import AppBreadcrumbs from './AppBreadcrumbs.jsx';
import { useSupabase } from '../context/supabase.jsx';
import { toast } from 'react-hot-toast';
import { getRoleDisplayName, getRoleColor, getRoleDescription, permissions } from '../utils/rolePermissions.js';
import { createNotifications } from '../utils/notifications.js';
import { applyTheme, getStoredTheme, setStoredTheme } from '../utils/theme.js';

const PRIMARY = '#6795BE';

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

/** High-contrast active nav: white panel + amber left bar (expanded) or solid pill (collapsed). */
function sidebarNavLinkClass(active, collapsed) {
  if (collapsed) {
    return active
      ? 'flex min-w-0 items-center justify-center rounded-xl px-2 py-2.5 text-sm font-semibold bg-white text-[#1a3a52] shadow-lg ring-2 ring-amber-200/90'
      : 'flex min-w-0 items-center justify-center rounded-xl px-2 py-2.5 text-sm font-medium text-white hover:bg-white/15';
  }
  const row = 'flex min-w-0 items-center gap-3 rounded-lg py-2.5 pl-2 pr-3 text-sm border-l-[5px]';
  if (active) {
    return `${row} font-semibold bg-white text-[#1a3a52] shadow-md border-l-amber-300 ring-1 ring-black/10`;
  }
  return `${row} font-medium text-white border-l-transparent hover:bg-white/20 hover:text-white`;
}

/** Human-readable team label (TLA, Monitoring, HR, etc.) */
function formatTeamLabel(team) {
  if (team == null || String(team).trim() === '') return null;
  const t = String(team).trim();
  const lower = t.toLowerCase();
  const map = {
    tla: 'TLA',
    monitoring: 'Monitoring',
    pat1: 'PAT1',
    hr: 'HR',
    supervisor: 'Supervisor',
  };
  if (map[lower]) return map[lower];
  return t
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function displayNameFromUser(user, profileFullName) {
  const meta = user?.user_metadata || {};
  const fromDb = profileFullName && String(profileFullName).trim() ? String(profileFullName).trim() : '';
  const fromMeta = [meta.full_name, meta.name, meta.display_name].find((s) => typeof s === 'string' && s.trim());
  if (fromDb) return fromDb;
  if (fromMeta) return fromMeta.trim();
  const em = user?.email;
  if (em) return em.split('@')[0];
  return 'User';
}

export default function SidebarLayout() {
  const { user, userRole, userTeam, supabase, clearSession } = useSupabase();
  const location = useLocation();
  const navigate = useNavigate();
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [notificationsLoading, setNotificationsLoading] = useState(false);
  const [notificationDetail, setNotificationDetail] = useState(null);
  const [notificationFilter, setNotificationFilter] = useState('all'); // 'all' | 'read' | 'unread'
  const [selectedNotificationIds, setSelectedNotificationIds] = useState([]);
  const [autoJobRunning, setAutoJobRunning] = useState(false);
  const [theme, setTheme] = useState(() => getStoredTheme());
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [changePasswordOpen, setChangePasswordOpen] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmNewPassword: '',
  });
  const [passwordTouched, setPasswordTouched] = useState({
    currentPassword: false,
    newPassword: false,
    confirmNewPassword: false,
  });
  const [passwordVisible, setPasswordVisible] = useState({
    currentPassword: false,
    newPassword: false,
    confirmNewPassword: false,
  });
  const [profileFullName, setProfileFullName] = useState(null);
  const canSendReminders = permissions.canManageAttendanceSchedules(userRole, userTeam); // Admin + Monitoring TL/VTL

  const profileDisplayName = useMemo(
    () => displayNameFromUser(user, profileFullName),
    [user, profileFullName],
  );
  const profileTeamLabel = formatTeamLabel(userTeam);

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

  useEffect(() => {
    if (!notificationsOpen) {
      setNotificationFilter('all');
      setSelectedNotificationIds([]);
    }
  }, [notificationsOpen]);

  useEffect(() => {
    setSelectedNotificationIds([]);
  }, [notificationFilter]);

  const filteredNotifications = useMemo(() => {
    if (notificationFilter === 'read') return notifications.filter((n) => n.read_at);
    if (notificationFilter === 'unread') return notifications.filter((n) => !n.read_at);
    return notifications;
  }, [notifications, notificationFilter]);

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

  useEffect(() => {
    setProfileOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!changePasswordOpen) {
      setPasswordForm({
        currentPassword: '',
        newPassword: '',
        confirmNewPassword: '',
      });
      setPasswordTouched({
        currentPassword: false,
        newPassword: false,
        confirmNewPassword: false,
      });
      setPasswordVisible({
        currentPassword: false,
        newPassword: false,
        confirmNewPassword: false,
      });
      setChangingPassword(false);
    }
  }, [changePasswordOpen]);

  useEffect(() => {
    if (!profileOpen) return;
    const onKey = (e) => {
      if (e.key === 'Escape') setProfileOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [profileOpen]);

  useEffect(() => {
    if (!changePasswordOpen) return;
    const onKey = (e) => {
      if (e.key === 'Escape') setChangePasswordOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [changePasswordOpen]);

  useEffect(() => {
    if (!profileOpen || !supabase || !user?.id) return;
    let cancelled = false;
    (async () => {
      try {
        const { data, error } = await supabase.from('users').select('full_name').eq('id', user.id).single();
        if (cancelled) return;
        if (!error && data?.full_name && String(data.full_name).trim())
          setProfileFullName(String(data.full_name).trim());
        else setProfileFullName(null);
      } catch {
        if (!cancelled) setProfileFullName(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [profileOpen, supabase, user?.id]);

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

  const toggleNotificationSelected = (id, checked) => {
    setSelectedNotificationIds((prev) => {
      if (checked) return prev.includes(id) ? prev : [...prev, id];
      return prev.filter((x) => x !== id);
    });
  };

  const markSelectedAsRead = async () => {
    if (!supabase || !user?.id) return;
    const ids = selectedNotificationIds.filter((id) => {
      const n = notifications.find((x) => x.id === id);
      return n && !n.read_at;
    });
    if (!ids.length) return;
    const nowIso = new Date().toISOString();
    try {
      await supabase.from('notifications').update({ read_at: nowIso }).in('id', ids);
      setNotifications((prev) => prev.map((n) => (ids.includes(n.id) ? { ...n, read_at: nowIso } : n)));
      setSelectedNotificationIds((prev) => prev.filter((x) => !ids.includes(x)));
    } catch (e) {
      console.warn('Notifications bulk mark read error:', e);
    }
  };

  const markSelectedAsUnread = async () => {
    if (!supabase || !user?.id) return;
    const ids = selectedNotificationIds.filter((id) => {
      const n = notifications.find((x) => x.id === id);
      return n && n.read_at;
    });
    if (!ids.length) return;
    try {
      await supabase.from('notifications').update({ read_at: null }).in('id', ids);
      setNotifications((prev) => prev.map((n) => (ids.includes(n.id) ? { ...n, read_at: null } : n)));
      setSelectedNotificationIds((prev) => prev.filter((x) => !ids.includes(x)));
    } catch (e) {
      console.warn('Notifications bulk mark unread error:', e);
    }
  };

  const selectedHasUnread = selectedNotificationIds.some((id) => {
    const n = notifications.find((x) => x.id === id);
    return n && !n.read_at;
  });
  const selectedHasRead = selectedNotificationIds.some((id) => {
    const n = notifications.find((x) => x.id === id);
    return n && n.read_at;
  });

  /** All unread → only “Mark as read”. All read → only “Mark as unread”. Mixed → both. */
  const selectionBulkToolbar = useMemo(() => {
    if (selectedNotificationIds.length === 0) {
      return { showMarkRead: false, showMarkUnread: false };
    }
    const rows = selectedNotificationIds
      .map((id) => notifications.find((x) => x.id === id))
      .filter(Boolean);
    if (rows.length !== selectedNotificationIds.length) {
      return { showMarkRead: true, showMarkUnread: true };
    }
    const allUnread = rows.every((n) => !n.read_at);
    const allRead = rows.every((n) => n.read_at);
    const mixed = !allUnread && !allRead;
    return {
      showMarkRead: allUnread || mixed,
      showMarkUnread: allRead || mixed,
    };
  }, [selectedNotificationIds, notifications]);

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

  const passwordRules = (value) => {
    const v = String(value || '');
    return {
      minLength: v.length >= 8,
      upper: /[A-Z]/.test(v),
      lower: /[a-z]/.test(v),
      number: /\d/.test(v),
      symbol: /[^A-Za-z0-9]/.test(v),
    };
  };

  const handleChangePassword = async () => {
    const currentPassword = String(passwordForm.currentPassword || '');
    const newPassword = String(passwordForm.newPassword || '');
    const confirmNewPassword = String(passwordForm.confirmNewPassword || '');
    const rules = passwordRules(newPassword);
    const rulesPassed = Object.values(rules).every(Boolean);

    setPasswordTouched({
      currentPassword: true,
      newPassword: true,
      confirmNewPassword: true,
    });

    if (!currentPassword || !newPassword || !confirmNewPassword) {
      toast.error('Please complete all password fields.');
      return;
    }
    if (!rulesPassed) {
      toast.error('New password does not meet complexity requirements.');
      return;
    }
    if (newPassword !== confirmNewPassword) {
      toast.error('New password and confirmation do not match.');
      return;
    }
    if (currentPassword === newPassword) {
      toast.error('New password must be different from current password.');
      return;
    }
    if (!user?.email) {
      toast.error('Unable to verify current account email.');
      return;
    }

    setChangingPassword(true);
    try {
      // Option B: re-authenticate with current password before applying new password.
      const { error: reauthError } = await supabase.auth.signInWithPassword({
        email: user.email,
        password: currentPassword,
      });
      if (reauthError) throw new Error('Current password is incorrect.');

      const { error: updateError } = await supabase.auth.updateUser({
        password: newPassword,
      });
      if (updateError) throw updateError;

      toast.success('Password changed successfully.');
      setChangePasswordOpen(false);
    } catch (err) {
      toast.error(err?.message || 'Failed to change password.');
    } finally {
      setChangingPassword(false);
    }
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
                className={`${sidebarNavLinkClass(active, isSidebarCollapsed)} transition-colors`}
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
                className={`${sidebarNavLinkClass(location.pathname === '/superadmin/overview', isSidebarCollapsed)} transition-colors`}
              >
                <Icon path="M3 3h18M3 9h18M3 15h18M3 21h18" className="h-5 w-5 flex-shrink-0" />
                {!isSidebarCollapsed && <span>OJT Overview</span>}
              </Link>
              <Link
                to="/user-management"
                className={`${sidebarNavLinkClass(location.pathname === '/user-management', isSidebarCollapsed)} transition-colors`}
              >
                <Icon path="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" className="h-5 w-5 flex-shrink-0" />
                {!isSidebarCollapsed && <span>User Management</span>}
              </Link>
            </>
          )}
          {(userRole !== 'superadmin' && (userRole === 'admin' || userRole === 'tla' || userRole === 'tl' || userRole === 'vtl')) && (
            <Link
              to="/user-management"
              className={`${sidebarNavLinkClass(location.pathname === '/user-management', isSidebarCollapsed)} transition-colors`}
            >
              <Icon path="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" className="h-5 w-5 flex-shrink-0" />
              {!isSidebarCollapsed && <span>User Management</span>}
            </Link>
          )}
          {(userRole === 'admin' || userRole === 'tla') && (
            <Link
              to="/role-permissions"
              className={`${sidebarNavLinkClass(location.pathname === '/role-permissions', isSidebarCollapsed)} transition-colors`}
            >
              <Icon path="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" className="h-5 w-5 flex-shrink-0" />
              {!isSidebarCollapsed && <span>Permissions</span>}
            </Link>
          )}
          {(userRole === 'admin' || userRole === 'tla' || userRole === 'tl' || userRole === 'vtl') && (
            <Link
              to="/daily-report/manage"
              className={`${sidebarNavLinkClass(location.pathname === '/daily-report/manage', isSidebarCollapsed)} transition-colors`}
            >
              <Icon path="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.5a2 2 0 012 2v5.5a2 2 0 01-2 2z" className="h-5 w-5 flex-shrink-0" />
              {!isSidebarCollapsed && <span>Manage Daily Report</span>}
            </Link>
          )}
        </nav>
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
            onClick={() => {
              setProfileOpen(false);
              setNotificationsOpen(true);
            }}
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
            onClick={() => {
              setNotificationsOpen(false);
              setNotificationDetail(null);
              setProfileOpen((v) => !v);
            }}
            aria-expanded={profileOpen}
            aria-haspopup="dialog"
            className={`rounded-full p-1.5 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#6795BE] dark:focus:ring-offset-gray-950 ${
              profileOpen
                ? 'bg-gray-200 text-gray-800 dark:bg-gray-800 dark:text-gray-100'
                : 'text-gray-500 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-900'
            }`}
            aria-label="Account and profile"
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-200 text-sm font-medium text-gray-700 dark:bg-gray-700 dark:text-gray-200">
              {profileDisplayName.charAt(0).toUpperCase() || '?'}
            </span>
          </button>
          </div>
        </header>

        {profileOpen && user && (
          <>
            <button
              type="button"
              className="fixed inset-0 z-[90] cursor-default bg-black/20 dark:bg-black/40"
              aria-label="Close account menu"
              onClick={() => setProfileOpen(false)}
            />
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="profile-menu-title"
              className="fixed z-[91] left-1/2 top-[4.25rem] w-[min(22rem,calc(100vw-2rem))] -translate-x-1/2 rounded-xl border border-gray-200 bg-white shadow-xl dark:border-gray-800 dark:bg-gray-900 sm:left-auto sm:right-6 sm:translate-x-0"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-start justify-between gap-2 border-b border-gray-100 px-4 py-3 dark:border-gray-800">
                <div className="min-w-0">
                  <h2 id="profile-menu-title" className="text-base font-semibold text-gray-900 dark:text-gray-100">
                    Your account
                  </h2>
                  <p className="mt-0.5 truncate text-sm text-gray-600 dark:text-gray-300">{profileDisplayName}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setProfileOpen(false)}
                  className="shrink-0 rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-800 dark:hover:text-gray-200"
                  aria-label="Close"
                >
                  ✕
                </button>
              </div>
              <div className="space-y-4 px-4 py-4">
                <dl className="space-y-3 text-sm">
                  <div>
                    <dt className="text-[11px] font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                      Email
                    </dt>
                    <dd className="mt-0.5 break-all text-gray-900 dark:text-gray-100">{user.email || '—'}</dd>
                  </div>
                  <div>
                    <dt className="text-[11px] font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                      Role
                    </dt>
                    <dd className="mt-0.5">
                      <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${getRoleColor(userRole)}`}>
                        {getRoleDisplayName(userRole) || '—'}
                      </span>
                      <p className="mt-1.5 text-xs leading-relaxed text-gray-500 dark:text-gray-400">
                        {getRoleDescription(userRole)}
                      </p>
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[11px] font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                      Team
                    </dt>
                    <dd className="mt-0.5 text-gray-900 dark:text-gray-100">
                      {profileTeamLabel || (
                        <span className="text-gray-400 dark:text-gray-500">Not assigned</span>
                      )}
                    </dd>
                  </div>
                </dl>
                <button
                  type="button"
                  onClick={() => {
                    setProfileOpen(false);
                    setChangePasswordOpen(true);
                  }}
                  className="flex w-full items-center justify-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-800 transition-colors hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 dark:hover:bg-gray-800"
                >
                  <Icon path="M12 11c1.657 0 3-1.343 3-3S13.657 5 12 5 9 6.343 9 8s1.343 3 3 3zm0 0v2m-7 6v-5a3 3 0 013-3h8a3 3 0 013 3v5" className="h-4 w-4" />
                  Change password
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setProfileOpen(false);
                    handleLogout();
                  }}
                  className="flex w-full items-center justify-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-800 transition-colors hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 dark:hover:bg-gray-800"
                >
                  <Icon path="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" className="h-4 w-4" />
                  Sign out
                </button>
              </div>
            </div>
          </>
        )}

        <main className="flex-1 p-4 sm:p-6 text-gray-900 dark:text-gray-100">
          <AppBreadcrumbs />
          <Outlet />
        </main>
      </div>
      <DailyReportReminder />

      {changePasswordOpen && (
        <div
          className="fixed inset-0 z-[110] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setChangePasswordOpen(false)}
        >
          <div
            className="bg-white dark:bg-gray-900 rounded-2xl shadow-xl w-full max-w-lg border border-gray-200 dark:border-gray-800 overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-4 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between">
              <div>
                <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">Change password</h2>
                <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                  Confirm your current password before setting a new one.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setChangePasswordOpen(false)}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                aria-label="Close change password"
              >
                ✕
              </button>
            </div>

            <div className="px-5 py-4 space-y-3">
              <div>
                <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">Current password</label>
                <div className="relative">
                  <input
                    type={passwordVisible.currentPassword ? 'text' : 'password'}
                    value={passwordForm.currentPassword}
                    onChange={(e) => setPasswordForm((p) => ({ ...p, currentPassword: e.target.value }))}
                    onBlur={() => setPasswordTouched((p) => ({ ...p, currentPassword: true }))}
                    className={`w-full rounded-lg pl-3 pr-10 py-2 text-sm bg-white dark:bg-gray-950 text-gray-900 dark:text-gray-100 ${
                      passwordTouched.currentPassword && !passwordForm.currentPassword
                        ? 'border border-red-500'
                        : 'border border-gray-300 dark:border-gray-700'
                    }`}
                    placeholder="Enter current password"
                  />
                  <button
                    type="button"
                    onClick={() => setPasswordVisible((p) => ({ ...p, currentPassword: !p.currentPassword }))}
                    className="absolute inset-y-0 right-0 px-3 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                    aria-label={passwordVisible.currentPassword ? 'Hide current password' : 'Show current password'}
                  >
                    {passwordVisible.currentPassword ? (
                      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-5.05 0-9.27-2.95-10.5-7 1.01-3.322 3.865-5.86 7.428-6.732M9.88 9.88a3 3 0 104.243 4.243M6.1 6.1l11.8 11.8M9.9 4.8A10.57 10.57 0 0112 4.5c5.05 0 9.27 2.95 10.5 7a11.05 11.05 0 01-4.22 5.63" />
                      </svg>
                    ) : (
                      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0zm6.5 0c-1.23 4.05-5.45 7-10.5 7s-9.27-2.95-10.5-7c1.23-4.05 5.45-7 10.5-7s9.27 2.95 10.5 7z" />
                      </svg>
                    )}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">New password</label>
                <div className="relative">
                  <input
                    type={passwordVisible.newPassword ? 'text' : 'password'}
                    value={passwordForm.newPassword}
                    onChange={(e) => setPasswordForm((p) => ({ ...p, newPassword: e.target.value }))}
                    onBlur={() => setPasswordTouched((p) => ({ ...p, newPassword: true }))}
                    className={`w-full rounded-lg pl-3 pr-10 py-2 text-sm bg-white dark:bg-gray-950 text-gray-900 dark:text-gray-100 ${
                      passwordTouched.newPassword && !Object.values(passwordRules(passwordForm.newPassword)).every(Boolean)
                        ? 'border border-red-500'
                        : 'border border-gray-300 dark:border-gray-700'
                    }`}
                    placeholder="Enter new password"
                  />
                  <button
                    type="button"
                    onClick={() => setPasswordVisible((p) => ({ ...p, newPassword: !p.newPassword }))}
                    className="absolute inset-y-0 right-0 px-3 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                    aria-label={passwordVisible.newPassword ? 'Hide new password' : 'Show new password'}
                  >
                    {passwordVisible.newPassword ? (
                      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-5.05 0-9.27-2.95-10.5-7 1.01-3.322 3.865-5.86 7.428-6.732M9.88 9.88a3 3 0 104.243 4.243M6.1 6.1l11.8 11.8M9.9 4.8A10.57 10.57 0 0112 4.5c5.05 0 9.27 2.95 10.5 7a11.05 11.05 0 01-4.22 5.63" />
                      </svg>
                    ) : (
                      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0zm6.5 0c-1.23 4.05-5.45 7-10.5 7s-9.27-2.95-10.5-7c1.23-4.05 5.45-7 10.5-7s9.27 2.95 10.5 7z" />
                      </svg>
                    )}
                  </button>
                </div>
                <ul className="mt-1 grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
                  {Object.entries({
                    'At least 8 chars': passwordRules(passwordForm.newPassword).minLength,
                    'Uppercase letter': passwordRules(passwordForm.newPassword).upper,
                    'Lowercase letter': passwordRules(passwordForm.newPassword).lower,
                    Number: passwordRules(passwordForm.newPassword).number,
                    Symbol: passwordRules(passwordForm.newPassword).symbol,
                  }).map(([label, ok]) => (
                    <li key={label} className={ok ? 'text-green-600 dark:text-green-400' : 'text-gray-500 dark:text-gray-400'}>
                      {ok ? '✓' : '•'} {label}
                    </li>
                  ))}
                </ul>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">Confirm new password</label>
                <div className="relative">
                  <input
                    type={passwordVisible.confirmNewPassword ? 'text' : 'password'}
                    value={passwordForm.confirmNewPassword}
                    onChange={(e) => setPasswordForm((p) => ({ ...p, confirmNewPassword: e.target.value }))}
                    onBlur={() => setPasswordTouched((p) => ({ ...p, confirmNewPassword: true }))}
                    className={`w-full rounded-lg pl-3 pr-10 py-2 text-sm bg-white dark:bg-gray-950 text-gray-900 dark:text-gray-100 ${
                      passwordTouched.confirmNewPassword &&
                      passwordForm.confirmNewPassword &&
                      passwordForm.newPassword !== passwordForm.confirmNewPassword
                        ? 'border border-red-500'
                        : 'border border-gray-300 dark:border-gray-700'
                    }`}
                    placeholder="Re-enter new password"
                  />
                  <button
                    type="button"
                    onClick={() => setPasswordVisible((p) => ({ ...p, confirmNewPassword: !p.confirmNewPassword }))}
                    className="absolute inset-y-0 right-0 px-3 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                    aria-label={passwordVisible.confirmNewPassword ? 'Hide confirm password' : 'Show confirm password'}
                  >
                    {passwordVisible.confirmNewPassword ? (
                      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-5.05 0-9.27-2.95-10.5-7 1.01-3.322 3.865-5.86 7.428-6.732M9.88 9.88a3 3 0 104.243 4.243M6.1 6.1l11.8 11.8M9.9 4.8A10.57 10.57 0 0112 4.5c5.05 0 9.27 2.95 10.5 7a11.05 11.05 0 01-4.22 5.63" />
                      </svg>
                    ) : (
                      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0zm6.5 0c-1.23 4.05-5.45 7-10.5 7s-9.27-2.95-10.5-7c1.23-4.05 5.45-7 10.5-7s9.27 2.95 10.5 7z" />
                      </svg>
                    )}
                  </button>
                </div>
              </div>
            </div>

            <div className="px-5 py-4 border-t border-gray-200 dark:border-gray-800 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setChangePasswordOpen(false)}
                className="px-4 py-2 rounded-lg text-sm font-medium border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800"
                disabled={changingPassword}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleChangePassword}
                className="px-4 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-60"
                style={{ backgroundColor: PRIMARY }}
                disabled={changingPassword}
              >
                {changingPassword ? 'Updating...' : 'Update password'}
              </button>
            </div>
          </div>
        </div>
      )}

      {notificationsOpen && (
        <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setNotificationsOpen(false)}>
          <div
            className="bg-white dark:bg-gray-900 rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto border border-gray-200 dark:border-gray-800"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-4 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between">
              <div>
                <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">Notifications</h2>
                <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                  Filter by All, Read, or Unread. Select items to mark read or unread in bulk.
                </p>
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
                <div className="space-y-3">
                  <div className="flex flex-nowrap items-center justify-between gap-4 sm:gap-8 min-w-0 overflow-x-auto pb-0.5">
                    <div className="flex shrink-0 items-center gap-2" role="tablist" aria-label="Notification filter">
                      {[
                        { id: 'all', label: 'All' },
                        { id: 'read', label: 'Read' },
                        { id: 'unread', label: 'Unread' },
                      ].map(({ id, label }) => (
                        <button
                          key={id}
                          type="button"
                          role="tab"
                          aria-selected={notificationFilter === id}
                          onClick={() => setNotificationFilter(id)}
                          className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors whitespace-nowrap ${
                            notificationFilter === id
                              ? 'border-[#6795BE] bg-[rgba(103,149,190,0.12)] text-gray-900 dark:text-gray-100'
                              : 'border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800'
                          }`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                    <div className="flex shrink-0 items-center justify-end gap-2">
                      <button
                        type="button"
                        onClick={loadNotifications}
                        aria-label="Refresh notifications"
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800 whitespace-nowrap"
                      >
                        <svg className="h-3.5 w-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                          />
                        </svg>
                        Refresh
                      </button>
                      <button
                        type="button"
                        onClick={markAllAsRead}
                        disabled={!notifications.some((n) => !n.read_at)}
                        className="px-3 py-1.5 rounded-lg text-xs font-medium border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-60 whitespace-nowrap"
                      >
                        Mark all as read
                      </button>
                    </div>
                  </div>

                  {selectedNotificationIds.length > 0 && (
                    <div className="flex flex-wrap items-center justify-start gap-2 pt-1">
                      {selectionBulkToolbar.showMarkRead && (
                        <button
                          type="button"
                          onClick={markSelectedAsRead}
                          disabled={!selectedHasUnread}
                          className="px-3 py-1.5 rounded-lg text-xs font-medium border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-60 whitespace-nowrap"
                        >
                          Mark as read
                        </button>
                      )}
                      {selectionBulkToolbar.showMarkUnread && (
                        <button
                          type="button"
                          onClick={markSelectedAsUnread}
                          disabled={!selectedHasRead}
                          className="px-3 py-1.5 rounded-lg text-xs font-medium border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-60 whitespace-nowrap"
                        >
                          Mark as unread
                        </button>
                      )}
                    </div>
                  )}

                  {canSendReminders && (
                    <span className="block text-xs text-gray-500 dark:text-gray-400">
                      Reminders are sent automatically at 6:30 PM; missed clock-outs auto close at 12:00 AM and notify Monitoring TL/VTL.
                      {autoJobRunning ? ' (running…)' : ''}
                    </span>
                  )}
                </div>
              )}

              <div className="rounded-lg border border-gray-200 dark:border-gray-800 overflow-hidden">
                {notificationsLoading ? (
                  <div className="px-4 py-6 text-center text-gray-500 dark:text-gray-400 text-sm">Loading notifications…</div>
                ) : notifications.length === 0 ? (
                  <div className="px-4 py-6 text-center text-gray-500 dark:text-gray-400 text-sm">No notifications yet.</div>
                ) : filteredNotifications.length === 0 ? (
                  <div className="px-4 py-6 text-center text-gray-500 dark:text-gray-400 text-sm">
                    No notifications match this filter.
                  </div>
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
                          <span
                            className={`text-[11px] font-medium px-2 py-1 rounded-full ${
                              notificationDetail.read_at
                                ? 'bg-gray-100 dark:bg-gray-800/80 text-gray-400 dark:text-gray-500 opacity-80'
                                : 'bg-blue-100 dark:bg-blue-950/50 text-blue-800 dark:text-blue-200 font-semibold ring-1 ring-blue-200/80 dark:ring-blue-800/80'
                            }`}
                          >
                            {notificationDetail.read_at ? 'Read' : 'Unread'}
                          </span>
                        </div>

                        <div className="space-y-1">
                          <p
                            className={`text-sm ${
                              notificationDetail.read_at
                                ? 'font-normal text-gray-500 dark:text-gray-400'
                                : 'font-bold text-gray-900 dark:text-gray-50'
                            }`}
                          >
                            {notificationDetail.title || '—'}
                          </p>
                          {notificationDetail.body && (
                            <pre
                              className={`text-xs whitespace-pre-wrap leading-5 ${
                                notificationDetail.read_at
                                  ? 'text-gray-400 dark:text-gray-500'
                                  : 'text-gray-700 dark:text-gray-200 font-medium'
                              }`}
                            >
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
                        {filteredNotifications.map((n) => {
                          const isRead = Boolean(n.read_at);
                          return (
                          <li
                            key={n.id}
                            className={`px-4 py-3 cursor-pointer border-l-[3px] transition-colors ${
                              isRead
                                ? 'border-l-transparent bg-gray-50/80 dark:bg-gray-950/40 opacity-90 hover:bg-gray-100/90 dark:hover:bg-gray-900/80'
                                : 'border-l-[#6795BE] bg-blue-50/70 dark:bg-blue-950/35 hover:bg-blue-100/80 dark:hover:bg-blue-950/50'
                            }`}
                            role="button"
                            tabIndex={0}
                            onClick={() => openNotificationDetail(n)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') openNotificationDetail(n);
                            }}
                            aria-label={`Open notification: ${n.title || 'notification'}${isRead ? ', read' : ', unread'}`}
                          >
                            <div className="flex items-start gap-3">
                              <input
                                type="checkbox"
                                className={`mt-1 h-4 w-4 shrink-0 rounded border-gray-300 text-[#6795BE] focus:ring-[#6795BE] ${isRead ? 'opacity-60' : ''}`}
                                checked={selectedNotificationIds.includes(n.id)}
                                onClick={(e) => e.stopPropagation()}
                                onChange={(e) => toggleNotificationSelected(n.id, e.target.checked)}
                                aria-label={`Select notification: ${n.title || 'notification'}`}
                              />
                              <div className="min-w-0 flex-1">
                                <p
                                  className={`text-sm ${
                                    isRead
                                      ? 'font-normal text-gray-500 dark:text-gray-400'
                                      : 'font-bold text-gray-900 dark:text-gray-50'
                                  }`}
                                >
                                  {n.title || '—'}
                                </p>
                                <p
                                  className={`mt-0.5 text-[11px] tabular-nums ${
                                    isRead ? 'text-gray-400 dark:text-gray-500' : 'text-gray-600 dark:text-gray-300'
                                  }`}
                                >
                                  {n.created_at ? new Date(n.created_at).toLocaleString() : '—'}
                                </p>
                              </div>
                            </div>
                          </li>
                          );
                        })}
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
