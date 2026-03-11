import { useEffect, useState, useMemo } from 'react';
import { useSupabase } from '../context/supabase.jsx';
import { toast } from 'react-hot-toast';
import CreateAccountModal from '../components/CreateAccountModal.jsx';
import TicketDetailModal from '../components/TicketDetailModal.jsx';
import { Link } from 'react-router-dom';
import { permissions } from '../utils/rolePermissions.js';
import { queryCache } from '../utils/queryCache.js';
import DashboardTicketCharts from '../components/DashboardTicketCharts.jsx';
import { ticketStatusPill } from '../utils/uiPills.js';

const PRIMARY = '#6795BE';
const DEFAULT_OJT_REQUIRED_HOURS = 400;

// Map onboarding_records.team (e.g. 'TLA', 'Monitoring', 'PAT1', 'Onboarding') to users.team ('tla', 'monitoring', 'pat1')
function onboardingTeamToUserTeam(obTeam) {
  if (!obTeam) return '';
  const v = String(obTeam)
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ');
  if (v.includes('onboarding')) return 'tla';
  if (v === 'tla' || v === 'team lead assistant' || v.includes('tla')) return 'tla';
  if (v === 'monitoring' || v === 'monitoring team' || v === 'monitoring_team') return 'monitoring';
  if (v === 'pat1' || v === 'pat 1') return 'pat1';
  return '';
}

function minutesToHours(minutes) {
  const m = Number(minutes) || 0;
  return (m / 60).toFixed(2);
}

export default function AdminDashboard() {
  const { user, supabase, userRole } = useSupabase();
  const [tickets, setTickets] = useState([]);
  const [users, setUsers] = useState([]);
  const [onboardingRecords, setOnboardingRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [attendanceStats, setAttendanceStats] = useState({ late: 0, on_leave: 0, absent: 0 });
  const [ojt, setOjt] = useState({
    scheduleSet: false,
    requiredHours: DEFAULT_OJT_REQUIRED_HOURS,
    renderedMinutes: 0,
  });
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedTicket, setSelectedTicket] = useState(null);
  const [ticketFilter, setTicketFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [stats, setStats] = useState({
    totalTickets: 0,
    openTickets: 0,
    inProgressTickets: 0,
    closedTickets: 0,
    totalUsers: 0,
  });

  useEffect(() => {
    if (userRole === 'admin' || userRole === 'tla') fetchData();
    if (userRole === 'tla') fetchOjt();
  }, [user, userRole, supabase]);

  useEffect(() => {
    if (!supabase || !(userRole === 'admin' || userRole === 'tla')) return;
    fetchAttendanceStats();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase, userRole]);

  // Fetch onboarding records for team fallback (matches User Management logic)
  useEffect(() => {
    if (!supabase || !(userRole === 'admin' || userRole === 'tla')) return;
    const cached = queryCache.get('onboarding:records');
    if (cached && Array.isArray(cached)) {
      setOnboardingRecords(cached);
      return;
    }
    supabase
      .from('onboarding_records')
      .select('id, name, email, team')
      .order('onboarding_datetime', { ascending: false })
      .then(({ data, error }) => {
        if (error) {
          console.warn('AdminDashboard: onboarding_records fetch error', error);
          return;
        }
        const list = Array.isArray(data) ? data : [];
        queryCache.set('onboarding:records', list);
        setOnboardingRecords(list);
      });
  }, [supabase, userRole]);

  const fetchOjt = async (bypassCache = false) => {
    if (!user?.id) return;
    const cacheKey = `admin:ojt:${user.id}`;
    if (!bypassCache) {
      const cached = queryCache.get(cacheKey);
      if (cached && typeof cached === 'object') {
        setOjt(cached);
        return;
      }
    }
    try {
      const { data: u, error: userErr } = await supabase
        .from('users')
        .select('total_ojt_hours_required, schedule_configured_at, imported_rendered_minutes')
        .eq('id', user.id)
        .single();
      if (userErr) console.warn('Admin/TLA OJT users fetch error:', userErr);
      const requiredHours = Number(u?.total_ojt_hours_required) || DEFAULT_OJT_REQUIRED_HOURS;
      const scheduleSet = u?.schedule_configured_at != null;

      const { data: logs, error: logsErr } = await supabase
        .from('attendance_logs')
        .select('total_rendered_seconds, rendered_minutes')
        .eq('user_id', user.id);
      if (logsErr) {
        const status = logsErr?.status;
        if (status !== 403) console.warn('Admin/TLA OJT attendance_logs fetch error:', logsErr);
        const imported = Number(u?.imported_rendered_minutes) || 0;
        const next = { scheduleSet, requiredHours, renderedMinutes: imported };
        setOjt(next);
        queryCache.set(cacheKey, next);
        return;
      }
      const fromLogsMinutes = (Array.isArray(logs) ? logs : []).reduce((acc, row) => {
        const sec = row?.total_rendered_seconds;
        const min = row?.rendered_minutes;
        return acc + (sec != null ? Math.round(sec / 60) : (min || 0));
      }, 0);
      const imported = Number(u?.imported_rendered_minutes) || 0;
      const renderedMinutes = fromLogsMinutes + imported;
      const next = { scheduleSet, requiredHours, renderedMinutes };
      setOjt(next);
      queryCache.set(cacheKey, next);
    } catch (e) {
      console.warn('Admin/TLA OJT fetch error:', e);
    }
  };

  const normalizeUser = (row) => {
    if (!row || typeof row !== 'object') return null;
    return {
      id: row.id,
      email: row.email ?? row.email_address ?? null,
      role: row.role ?? 'intern',
      full_name: row.full_name ?? row.fullname ?? row.name ?? null,
      team: row.team ?? null,
      created_at: row.created_at ?? null,
    };
  };

  const fetchData = async (bypassCache = false) => {
    const cachedTickets = queryCache.get('admin:tickets');
    const cachedUsers = queryCache.get('admin:users');
    const hasCachedUsers = Array.isArray(cachedUsers) && cachedUsers.length > 0;
    const useCache =
      !bypassCache &&
      cachedTickets != null &&
      cachedUsers != null &&
      hasCachedUsers;
    if (useCache) {
      setTickets(cachedTickets);
      setUsers(cachedUsers);
      setStats({
        totalTickets: cachedTickets.length,
        openTickets: cachedTickets.filter(t => t.status === 'open').length,
        inProgressTickets: cachedTickets.filter(t => t.status === 'in-progress').length,
        closedTickets: cachedTickets.filter(t => t.status === 'closed').length,
        totalUsers: cachedUsers.length,
      });
      setLoading(false);
      return;
    }
    try {
      const { data: ticketsData, error: ticketsError } = await supabase.from('tickets').select('*').order('created_at', { ascending: false });
      if (ticketsError) throw ticketsError;
      const { data: usersData, error: usersError } = await supabase.from('users').select('*').order('created_at', { ascending: false });
      if (usersError) console.warn('Could not fetch users:', usersError);
      const ticketsList = ticketsData || [];
      const rawUsers = Array.isArray(usersData) ? usersData : [];
      const usersList = rawUsers.map(normalizeUser).filter(Boolean);
      queryCache.set('admin:tickets', ticketsList);
      queryCache.set('admin:users', usersList);
      setTickets(ticketsList);
      setUsers(usersList);
      setStats({
        totalTickets: ticketsList.length,
        openTickets: ticketsList.filter(t => t.status === 'open').length,
        inProgressTickets: ticketsList.filter(t => t.status === 'in-progress').length,
        closedTickets: ticketsList.filter(t => t.status === 'closed').length,
        totalUsers: usersList.length,
      });
    } catch (error) {
      toast.error('Error loading data');
      console.error('Error:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchAttendanceStats = async (bypassCache = false) => {
    const cacheKey = 'admin:attendanceStats:30';
    if (!bypassCache) {
      const cached = queryCache.get(cacheKey);
      if (cached && typeof cached === 'object') {
        setAttendanceStats({
          late: Number(cached.late) || 0,
          on_leave: Number(cached.on_leave) || 0,
          absent: Number(cached.absent) || 0,
        });
        return;
      }
    }
    try {
      const start = new Date();
      start.setDate(start.getDate() - 29);
      const startStr = start.toISOString().slice(0, 10);
      const { data, error } = await supabase
        .from('team_daily_report')
        .select('attendance_counts, report_date')
        .gte('report_date', startStr)
        .order('report_date', { ascending: false })
        .limit(180);
      if (error) throw error;
      const rows = Array.isArray(data) ? data : [];
      const totals = rows.reduce(
        (acc, r) => {
          const c = typeof r.attendance_counts === 'string' ? JSON.parse(r.attendance_counts) : (r.attendance_counts || {});
          acc.late += Number(c.late) || 0;
          acc.on_leave += Number(c.on_leave) || 0;
          acc.absent += Number(c.absent) || 0;
          return acc;
        },
        { late: 0, on_leave: 0, absent: 0 }
      );
      queryCache.set(cacheKey, totals);
      setAttendanceStats(totals);
    } catch (e) {
      console.warn('AdminDashboard attendance stats fetch error:', e);
    }
  };

  const filteredTickets = useMemo(() => {
    let list = tickets;
    if (ticketFilter === 'open') list = list.filter(t => t.status === 'open');
    else if (ticketFilter === 'in-progress') list = list.filter(t => t.status === 'in-progress');
    else if (ticketFilter === 'closed') list = list.filter(t => t.status === 'closed');
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(t => (t.title && t.title.toLowerCase().includes(q)) || (t.description && t.description.toLowerCase().includes(q)));
    }
    return list;
  }, [tickets, ticketFilter, searchQuery]);

  const onboardingByEmail = useMemo(() => {
    const map = new Map();
    (onboardingRecords || []).forEach((r) => {
      const email = (r.email || '').trim().toLowerCase();
      if (email && !map.has(email)) map.set(email, r);
    });
    return map;
  }, [onboardingRecords]);

  const usersWithEffectiveTeam = useMemo(() => {
    return (Array.isArray(users) ? users : []).map((u) => {
      const emailKey = (u.email || '').trim().toLowerCase();
      const ob = onboardingByEmail.get(emailKey);
      const effectiveTeam = u.team || onboardingTeamToUserTeam(ob?.team) || '';
      return { ...u, effectiveTeam };
    });
  }, [users, onboardingByEmail]);

  const userRoleCounts = useMemo(() => {
    const list = Array.isArray(usersWithEffectiveTeam) ? usersWithEffectiveTeam : [];
    const counts = { tla: 0, pat1: 0, monitoring_team: 0 };
    list.forEach((u) => {
      const t = String(u?.effectiveTeam || '').toLowerCase();
      if (t === 'tla') counts.tla += 1;
      else if (t === 'pat1') counts.pat1 += 1;
      else if (t === 'monitoring') counts.monitoring_team += 1;
    });
    return counts;
  }, [usersWithEffectiveTeam]);

  const ticketsToShow = filteredTickets.slice(0, 5);

  const getStatusBadge = (status) => {
    const label = status === 'closed' ? 'Completed' : status === 'in-progress' ? 'In Progress' : 'Open';
    return <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${ticketStatusPill(status)}`}>{label}</span>;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-10 w-10 border-2 border-[#6795BE] border-t-transparent" aria-label="Loading" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 tracking-tight" style={{ color: PRIMARY }}>Admin Dashboard</h1>
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">Manage users, tickets, and system settings</p>
        </div>
        <div className="flex flex-wrap gap-2 lg:justify-end">
          {permissions.canCreateAccounts(userRole) && (
            <button
              onClick={() => setShowCreateModal(true)}
              className="inline-flex items-center justify-center rounded-lg px-3.5 py-2 text-sm font-semibold text-white shadow-sm transition hover:opacity-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
              style={{ backgroundColor: PRIMARY }}
            >
              Create Account
            </button>
          )}
          <Link
            to="/role-permissions"
            className="inline-flex items-center justify-center rounded-lg px-3.5 py-2 text-sm font-semibold text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 shadow-sm hover:bg-gray-50 dark:hover:bg-gray-800 transition text-center focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#6795BE]"
          >
            View Permissions
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
        <Link
          to="/daily-report/manage?tab=attendanceReports&sub=late&range=30"
          className="group rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-3.5 sm:p-4 shadow-sm hover:shadow transition flex items-center justify-between"
        >
          <div>
            <p className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Lates</p>
            <p className="mt-1 text-2xl font-semibold text-gray-900 dark:text-gray-100">{attendanceStats.late}</p>
            <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">Last 30 days</p>
          </div>
          <span className="text-gray-300 group-hover:text-gray-400 transition text-xl">→</span>
        </Link>
        <Link
          to="/daily-report/manage?tab=attendanceReports&sub=leave&range=30"
          className="group rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-3.5 sm:p-4 shadow-sm hover:shadow transition flex items-center justify-between"
        >
          <div>
            <p className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Leaves</p>
            <p className="mt-1 text-2xl font-semibold text-gray-900 dark:text-gray-100">{attendanceStats.on_leave}</p>
            <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">Last 30 days</p>
          </div>
          <span className="text-gray-300 group-hover:text-gray-400 transition text-xl">→</span>
        </Link>
        <Link
          to="/daily-report/manage?tab=attendanceReports&sub=absent&range=30"
          className="group rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-3.5 sm:p-4 shadow-sm hover:shadow transition flex items-center justify-between"
        >
          <div>
            <p className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Absences</p>
            <p className="mt-1 text-2xl font-semibold text-gray-900 dark:text-gray-100">{attendanceStats.absent}</p>
            <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">Last 30 days</p>
          </div>
          <span className="text-gray-300 group-hover:text-gray-400 transition text-xl">→</span>
        </Link>
      </div>

      {userRole === 'tla' && (
        <div>
          <div className="flex items-baseline justify-between mb-2">
            <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">OJT Hours</h2>
            <span className="text-xs text-gray-500 dark:text-gray-400">Hours summary</span>
          </div>
          {!ojt.scheduleSet && (
            <div className="rounded-lg border border-amber-200 dark:border-amber-900/60 bg-amber-50 dark:bg-amber-950/30 p-4 text-amber-800 dark:text-amber-200 mb-4">
              Your official attendance schedule is not set yet. You can still time in/out in{' '}
              <Link to="/attendance" className="font-semibold underline">
                Attendance
              </Link>
              .
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4 shadow-sm">
              <p className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Rendered hours</p>
              <p className="mt-1 text-2xl font-semibold text-gray-900 dark:text-gray-100">{minutesToHours(ojt.renderedMinutes)}</p>
            </div>
            <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4 shadow-sm">
              <p className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Remaining hours</p>
              <p className="mt-1 text-2xl font-semibold text-gray-900 dark:text-gray-100">
                {minutesToHours(Math.max(0, ojt.requiredHours * 60 - ojt.renderedMinutes))}
              </p>
            </div>
          </div>
        </div>
      )}

      <DashboardTicketCharts
        tickets={tickets}
        title="Ticket Analytics"
        totalUsers={stats.totalUsers}
        userRoleCounts={userRoleCounts}
      />

      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 shadow-sm overflow-hidden">
        <div className="px-4 sm:px-6 py-3.5 border-b border-gray-200 dark:border-gray-800 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">Tickets</h2>
            <span className="text-xs text-gray-500 dark:text-gray-400">{filteredTickets.length} shown</span>
          </div>
          <div className="flex flex-wrap items-center gap-2 lg:justify-end">
            {['all', 'open', 'in-progress', 'closed'].map((f) => (
              <button
                key={f}
                onClick={() => setTicketFilter(f)}
                className={`px-3 py-1.5 rounded-full text-sm font-semibold transition-colors border ${
                  ticketFilter === f
                    ? 'text-white border-transparent'
                    : 'text-gray-700 dark:text-gray-200 border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 hover:bg-gray-50 dark:hover:bg-gray-800'
                }`}
                style={ticketFilter === f ? { backgroundColor: PRIMARY } : {}}
              >
                {f === 'all' ? 'All Tickets' : f === 'closed' ? 'Completed' : f === 'in-progress' ? 'In Progress' : 'Open'}
              </button>
            ))}
            <div className="relative flex-1 min-w-[200px] max-w-sm">
              <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400">
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
              </span>
              <input
                type="text"
                placeholder="Search tickets…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-2 border border-gray-200 dark:border-gray-800 rounded-lg text-sm bg-white dark:bg-gray-950 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-offset-0 focus:ring-[#6795BE]"
              />
            </div>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-800">
            <thead>
              <tr>
                <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Ticket Name</th>
                <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Description</th>
                <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Status</th>
                <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Date Created</th>
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-800">
              {ticketsToShow.length > 0 ? ticketsToShow.map((ticket) => (
                <tr key={ticket.id} onClick={() => setSelectedTicket(ticket)} className="hover:bg-gray-50 dark:hover:bg-gray-800/60 cursor-pointer transition-colors">
                  <td className="px-4 sm:px-6 py-3 text-sm font-medium text-gray-900 dark:text-gray-100">{ticket.title || '—'}</td>
                  <td className="px-4 sm:px-6 py-3 text-sm text-gray-600 dark:text-gray-300 max-w-xs truncate">{ticket.description || '—'}</td>
                  <td className="px-4 sm:px-6 py-3">{getStatusBadge(ticket.status)}</td>
                  <td className="px-4 sm:px-6 py-3 text-sm text-gray-500 dark:text-gray-400">{ticket.created_at ? new Date(ticket.created_at).toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: '2-digit' }) : '—'}</td>
                </tr>
              )) : (
                <tr><td colSpan={4} className="px-4 sm:px-6 py-8 text-center text-gray-500 dark:text-gray-400 text-sm">No tickets found</td></tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="px-4 sm:px-6 py-3 border-t border-gray-200 dark:border-gray-800 flex justify-end">
          <Link to="/organized-tickets" className="text-sm font-medium transition-colors hover:opacity-90" style={{ color: PRIMARY }}>View all →</Link>
        </div>
      </div>

      {showCreateModal && <CreateAccountModal isOpen={showCreateModal} onClose={() => setShowCreateModal(false)} onSuccess={() => fetchData(true)} />}
      {selectedTicket && <TicketDetailModal isOpen={!!selectedTicket} onClose={() => setSelectedTicket(null)} ticket={selectedTicket} onUpdate={() => { fetchData(true); setSelectedTicket(null); }} />}
    </div>
  );
}
