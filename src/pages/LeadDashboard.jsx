import { useEffect, useState, useMemo } from 'react';
import { useSupabase } from '../context/supabase.jsx';
import { toast } from 'react-hot-toast';
import TicketDetailModal from '../components/TicketDetailModal.jsx';
import { Link } from 'react-router-dom';
import { queryCache } from '../utils/queryCache.js';
import DashboardTicketCharts from '../components/DashboardTicketCharts.jsx';
import { ticketStatusPill } from '../utils/uiPills.js';

const PRIMARY = '#6795BE';
const DEFAULT_OJT_REQUIRED_HOURS = 400;

function minutesToHours(minutes) {
  const m = Number(minutes) || 0;
  return (m / 60).toFixed(2);
}

/** Get segments for a log (supports legacy single time_in/time_out) */
function getSegments(log) {
  if (!log) return [];
  const seg = log.segments;
  if (Array.isArray(seg) && seg.length > 0) return seg;
  if (log.time_in) return [{ time_in: log.time_in, time_out: log.time_out || null }];
  return [];
}

/** Get total rendered seconds for one log: total_rendered_seconds, or sum segments, or legacy rendered_seconds/minutes */
function getLogRenderedSeconds(log) {
  if (!log) return 0;
  if (log.total_rendered_seconds != null) return log.total_rendered_seconds;
  const segments = getSegments(log);
  const fromSegments = segments.reduce((acc, s) => {
    if (!s?.time_in) return acc;
    const out = s.time_out ? new Date(s.time_out).getTime() : null;
    const inMs = new Date(s.time_in).getTime();
    if (out != null) return acc + Math.floor((out - inMs) / 1000);
    return acc;
  }, 0);
  if (fromSegments > 0) return fromSegments;
  if (log.rendered_seconds != null) return log.rendered_seconds;
  const min = Number(log.rendered_minutes);
  return Number.isNaN(min) ? 0 : min * 60;
}

/** Is user currently clocked in (last segment has no time_out) */
function isClockedIn(log) {
  const seg = getSegments(log);
  if (seg.length === 0) return false;
  const last = seg[seg.length - 1];
  return last && !last.time_out;
}

export default function LeadDashboard() {
  const { user, supabase, userRole } = useSupabase();
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [ojt, setOjt] = useState({
    scheduleSet: false,
    requiredHours: DEFAULT_OJT_REQUIRED_HOURS,
    renderedSecondsBase: 0,
    clockedInStartMs: null,
  });
  const [ojtNowTick, setOjtNowTick] = useState(0);
  const [myTasksCount, setMyTasksCount] = useState(0);
  const [selectedTicket, setSelectedTicket] = useState(null);
  const [ticketFilter, setTicketFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [stats, setStats] = useState({
    totalTickets: 0,
    openTickets: 0,
    inProgressTickets: 0,
    closedTickets: 0,
  });

  useEffect(() => {
    if (userRole === 'lead' || userRole === 'tl' || userRole === 'vtl' || userRole === 'monitoring_team' || userRole === 'pat1') {
      fetchTickets();
      fetchOjt();
      fetchTasks();
    }
  }, [user, userRole, supabase]);

  const fetchOjt = async (bypassCache = false) => {
    if (!user?.id) return;
    const cacheKey = `lead:ojt:v2:${user.id}`;
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
      if (userErr) console.warn('Lead OJT users fetch error:', userErr);
      const requiredHours = Number(u?.total_ojt_hours_required) || DEFAULT_OJT_REQUIRED_HOURS;
      const scheduleSet = u?.schedule_configured_at != null;

      const { data: logs, error: logsErr } = await supabase
        .from('attendance_logs')
        .select('log_date, segments, total_rendered_seconds, rendered_seconds, rendered_minutes, time_in, time_out')
        .eq('user_id', user.id);
      if (logsErr) {
        const status = logsErr?.status;
        if (status !== 403) console.warn('Lead OJT attendance_logs fetch error:', logsErr);
        const imported = Number(u?.imported_rendered_minutes) || 0;
        const next = { scheduleSet, requiredHours, renderedSecondsBase: imported * 60, clockedInStartMs: null };
        setOjt(next);
        queryCache.set(cacheKey, next);
        return;
      }
      const imported = Number(u?.imported_rendered_minutes) || 0;
      const allLogs = Array.isArray(logs) ? logs : [];
      const fromLogsSeconds = allLogs.reduce((acc, row) => acc + getLogRenderedSeconds(row), 0);
      const renderedSecondsBase = fromLogsSeconds + imported * 60;

      const todayStr = new Date().toISOString().slice(0, 10);
      const todayLog = allLogs.find((l) => l?.log_date === todayStr) || null;
      let clockedInStartMs = null;
      if (todayLog && isClockedIn(todayLog)) {
        const seg = getSegments(todayLog);
        const last = seg.length ? seg[seg.length - 1] : null;
        const startIso = last?.time_in || todayLog.time_in || null;
        clockedInStartMs = startIso ? new Date(startIso).getTime() : null;
      }

      const next = { scheduleSet, requiredHours, renderedSecondsBase, clockedInStartMs };
      setOjt(next);
      queryCache.set(cacheKey, next);
    } catch (e) {
      console.warn('Lead OJT fetch error:', e);
    }
  };

  // Tick while clocked in to keep cards consistent with Attendance page.
  useEffect(() => {
    if (userRole === 'lead' || userRole === 'tl' || userRole === 'vtl' || userRole === 'monitoring_team' || userRole === 'pat1') {
      if (!ojt.clockedInStartMs) return;
      const id = setInterval(() => setOjtNowTick((t) => t + 1), 1000);
      return () => clearInterval(id);
    }
    return undefined;
  }, [userRole, ojt.clockedInStartMs]);

  const fetchTasks = async (bypassCache = false) => {
    if (!user?.id) return;
    const cacheKey = `lead:tasks:${user.id}`;
    if (!bypassCache) {
      const cached = queryCache.get(cacheKey);
      if (Array.isArray(cached)) {
        setMyTasksCount(cached.length);
        return;
      }
    }
    try {
      const { data, error } = await supabase
        .from('tasks')
        .select('id')
        .eq('assigned_to', user.id);
      if (error) {
        console.warn('Lead tasks fetch error:', error);
        return;
      }
      const list = Array.isArray(data) ? data : [];
      queryCache.set(cacheKey, list);
      setMyTasksCount(list.length);
    } catch (e) {
      console.warn('Lead tasks fetch error:', e);
    }
  };

  const fetchTickets = async (bypassCache = false) => {
    if (!bypassCache) {
      const cached = queryCache.get('lead:tickets');
      if (cached != null) {
        setTickets(cached);
        setStats({
          totalTickets: cached.length,
          openTickets: cached.filter(t => t.status === 'open').length,
          inProgressTickets: cached.filter(t => t.status === 'in-progress').length,
          closedTickets: cached.filter(t => t.status === 'closed').length,
        });
        setLoading(false);
        return;
      }
    }
    try {
      const { data, error } = await supabase
        .from('tickets')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      const ticketsList = data || [];
      queryCache.set('lead:tickets', ticketsList);
      setTickets(ticketsList);
      setStats({
        totalTickets: ticketsList.length,
        openTickets: ticketsList.filter(t => t.status === 'open').length,
        inProgressTickets: ticketsList.filter(t => t.status === 'in-progress').length,
        closedTickets: ticketsList.filter(t => t.status === 'closed').length,
      });
    } catch (error) {
      toast.error('Error loading tickets');
      console.error('Error:', error);
    } finally {
      setLoading(false);
    }
  };

  const filteredTickets = useMemo(() => {
    let list = tickets;
    if (ticketFilter === 'open') list = list.filter(t => t.status === 'open');
    else if (ticketFilter === 'in-progress') list = list.filter(t => t.status === 'in-progress');
    else if (ticketFilter === 'closed') list = list.filter(t => t.status === 'closed');
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(t =>
        (t.title && t.title.toLowerCase().includes(q)) ||
        (t.description && t.description.toLowerCase().includes(q))
      );
    }
    return list;
  }, [tickets, ticketFilter, searchQuery]);

  const ticketsToShow = filteredTickets.slice(0, 5);

  const elapsedSecondsLive =
    ojt.clockedInStartMs != null ? Math.max(0, Math.floor((Date.now() - ojt.clockedInStartMs) / 1000)) : 0;
  const renderedSecondsLive = (ojt.renderedSecondsBase || 0) + elapsedSecondsLive;
  const renderedMinutesLive = Math.floor(renderedSecondsLive / 60);
  const remainingMinutesLive = Math.max(0, ojt.requiredHours * 60 - renderedMinutesLive);

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
    <div className="w-full space-y-4 sm:space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900" style={{ color: PRIMARY }}>
            Dashboard
          </h1>
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
            Overview of team tickets and activity
          </p>
        </div>
      </div>

      {/* OJT Hours (TLA/PAT1/Monitoring TL-VTL/Interns) + Tasks */}
      <div>
        <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-3">OJT Hours</h2>
        {!ojt.scheduleSet && (
          <div className="rounded-lg border border-amber-200 dark:border-amber-900/60 bg-amber-50 dark:bg-amber-950/30 p-4 text-amber-800 dark:text-amber-200 mb-4">
            Your official attendance schedule is not set yet. You can still time in/out in{' '}
            <Link to="/attendance" className="font-semibold underline">
              Attendance
            </Link>
            .
          </div>
        )}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
        <div className="rounded-xl border-2 bg-white dark:bg-gray-900 p-3.5 sm:p-4 shadow-sm" style={{ borderColor: PRIMARY }}>
            <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">Rendered hours</p>
            <p className="mt-1 text-2xl font-bold text-gray-900 dark:text-gray-100">{minutesToHours(renderedMinutesLive)}</p>
          </div>
        <div className="rounded-xl border-2 bg-white dark:bg-gray-900 p-3.5 sm:p-4 shadow-sm" style={{ borderColor: PRIMARY }}>
            <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">Remaining hours</p>
            <p className="mt-1 text-2xl font-bold text-gray-900 dark:text-gray-100">
              {minutesToHours(remainingMinutesLive)}
            </p>
          </div>
        <div className="rounded-xl border-2 bg-white dark:bg-gray-900 p-3.5 sm:p-4 shadow-sm" style={{ borderColor: PRIMARY }}>
            <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">My tasks</p>
            <p className="mt-1 text-2xl font-bold text-gray-900 dark:text-gray-100">{myTasksCount}</p>
          </div>
        </div>
      </div>

      <div>
        <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-3">Ticket Overview</h2>
        <DashboardTicketCharts tickets={tickets} title="Ticket Analytics" />
      </div>

      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 shadow-sm overflow-hidden">
        <div className="px-4 sm:px-6 py-4 border-b border-gray-200 dark:border-gray-800 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">Tickets</h2>
          <div className="flex flex-wrap items-center gap-2">
            {['all', 'open', 'in-progress', 'closed'].map((f) => (
              <button key={f} onClick={() => setTicketFilter(f)} className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${ticketFilter === f ? 'text-white' : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'}`} style={ticketFilter === f ? { backgroundColor: PRIMARY } : {}}>
                {f === 'all' ? 'All Tickets' : f === 'closed' ? 'Completed' : f === 'in-progress' ? 'In Progress' : 'Open'}
              </button>
            ))}
            <div className="relative flex-1 min-w-[160px] max-w-xs">
              <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400">
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
              </span>
              <input type="text" placeholder="Search Tickets..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="w-full pl-9 pr-3 py-1.5 border border-gray-300 dark:border-gray-700 rounded-lg text-sm bg-white dark:bg-gray-950 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-offset-0 focus:ring-[#6795BE]" />
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

      {selectedTicket && (
        <TicketDetailModal isOpen={!!selectedTicket} onClose={() => setSelectedTicket(null)} ticket={selectedTicket} onUpdate={() => { fetchTickets(true); setSelectedTicket(null); }} />
      )}
    </div>
  );
}
