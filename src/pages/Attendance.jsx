import { useEffect, useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useSupabase } from '../context/supabase.jsx';
import { toast } from 'react-hot-toast';
import { permissions, getRoleDisplayName, ROLES } from '../utils/rolePermissions.js';
import { queryCache } from '../utils/queryCache.js';

const PRIMARY = '#6795BE';
const GRACE_MINUTES = 15;
const PAGE_SIZE = 10;

function formatTime(value) {
  if (value == null || value === '') return '';
  if (typeof value === 'string' && value.includes(':')) {
    const part = value.split(':');
    return `${part[0].padStart(2, '0')}:${(part[1] || '00').padStart(2, '0')}`;
  }
  return String(value);
}

/** Display schedule times as 12-hour with AM/PM from "HH:MM" or "HH:MM:SS" */
function formatScheduleTime(value) {
  if (!value) return '—';
  const s = String(value).trim();
  const [hStr, mStr] = s.split(':');
  let h = parseInt(hStr, 10);
  const m = parseInt(mStr || '0', 10);
  if (Number.isNaN(h) || Number.isNaN(m)) return '—';
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12;
  if (h === 0) h = 12;
  const hh = String(h).padStart(2, '0');
  const mm = String(m).padStart(2, '0');
  return `${hh}:${mm} ${ampm}`;
}

function timeStringToMinutes(t) {
  if (!t) return 0;
  const s = String(t).trim();
  const [h, m] = s.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

function minutesToTimeString(minutes) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function formatHours(minutes) {
  if (minutes == null) return '0';
  const h = (minutes / 60).toFixed(2);
  return parseFloat(h).toFixed(2);
}

/** Display rendered/remaining as hours only (e.g. "2.50") */
function formatHoursFromSeconds(totalSeconds) {
  if (totalSeconds == null || Number.isNaN(totalSeconds)) return '0.00';
  const h = totalSeconds / 3600;
  return Number(h).toFixed(2);
}

/** Rendered label in tables: "H hour(s) : M min(s)" */
function formatHoursMinutesLabel(totalSeconds) {
  if (totalSeconds == null || Number.isNaN(totalSeconds)) return '0 hours : 0 mins';
  const totalMinutes = Math.floor(totalSeconds / 60);
  const hrs = Math.floor(totalMinutes / 60);
  const mins = totalMinutes % 60;
  const hourLabel = hrs === 1 ? 'hour' : 'hours';
  const minLabel = mins === 1 ? 'min' : 'mins';
  return `${hrs} ${hourLabel} : ${mins} ${minLabel}`;
}

/** Card display: "H hour(s) : M min(s)." */
function formatHoursMinutesCard(totalSeconds) {
  if (totalSeconds == null || Number.isNaN(totalSeconds)) return '0 hours : 0 mins.';
  const totalMinutes = Math.floor(totalSeconds / 60);
  const hrs = Math.floor(totalMinutes / 60);
  const mins = totalMinutes % 60;
  const hourLabel = hrs === 1 ? 'hour' : 'hours';
  const minLabel = mins === 1 ? 'min' : 'mins';
  return `${hrs} ${hourLabel} : ${mins} ${minLabel}`;
}
/** Time In/Out in table: 12-hour with AM/PM (e.g. 9:05 AM) */
function formatTimeHHMM(dateOrIso) {
  if (!dateOrIso) return '—';
  const d = typeof dateOrIso === 'string' ? new Date(dateOrIso) : dateOrIso;
  let h = d.getHours();
  const m = d.getMinutes();
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12;
  if (h === 0) h = 12;
  return `${h}:${String(m).padStart(2, '0')} ${ampm}`;
}

/** Elapsed clock display: HH:MM:SS (used when clocked in, no time out yet) */
function formatElapsed(ms) {
  const totalSeconds = Math.floor(ms / 1000);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return [h, m, s].map((n) => String(n).padStart(2, '0')).join(':');
}

/** Get segments for a log (supports legacy single time_in/time_out) */
function getSegments(log) {
  if (!log) return [];
  const seg = log.segments;
  if (Array.isArray(seg) && seg.length > 0) return seg;
  if (log.time_in) {
    return [{ time_in: log.time_in, time_out: log.time_out || null }];
  }
  return [];
}

/** Get total rendered seconds for one log: total_rendered_seconds, or sum segments, or legacy rendered_seconds/minutes */
function getLogRenderedSeconds(log) {
  if (log.total_rendered_seconds != null) return log.total_rendered_seconds;
  const segments = getSegments(log);
  const fromSegments = segments.reduce((acc, s) => {
    if (!s.time_in) return acc;
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

/** Match user to attendance role filter: '' (all), 'tla', 'monitoring', 'pat1', 'tl', 'vtl'.
 * TLA / Monitoring Team / PAT1 = that group (role or team); TL = team leads only; VTL = vice team leads only. */
function userMatchesRoleFilter(user, filterValue) {
  if (!filterValue) return true;
  const role = user?.role;
  const team = user?.team;
  if (filterValue === 'tla') return role === ROLES.TLA || team === 'tla';
  if (filterValue === 'monitoring') return role === ROLES.MONITORING_TEAM || team === 'monitoring';
  if (filterValue === 'pat1') return role === ROLES.PAT1 || team === 'pat1';
  if (filterValue === 'tl') return role === ROLES.TL;
  if (filterValue === 'vtl') return role === ROLES.VTL;
  return false;
}

function Pagination({ total, page, setPage, pageSize }) {
  if (total <= pageSize) return null;
  const totalPages = Math.ceil(total / pageSize) || 1;
  const effectivePage = Math.min(Math.max(1, page), totalPages);
  const start = (effectivePage - 1) * pageSize + 1;
  const end = Math.min(effectivePage * pageSize, total);
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-gray-200 mt-3">
      <p className="text-sm text-gray-600">
        Showing {start}–{end} of {total}
      </p>
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => setPage((p) => Math.max(1, p - 1))}
          disabled={effectivePage <= 1}
          className="px-3 py-1.5 rounded-lg text-sm font-medium border border-gray-300 text-gray-700 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
        >
          Previous
        </button>
        <span className="px-2 text-sm text-gray-600">
          Page {effectivePage} of {totalPages}
        </span>
        <button
          type="button"
          onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
          disabled={effectivePage >= totalPages}
          className="px-3 py-1.5 rounded-lg text-sm font-medium border border-gray-300 text-gray-700 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
        >
          Next
        </button>
      </div>
    </div>
  );
}

export default function Attendance() {
  const { supabase, session, user, userRole } = useSupabase();
  const [myTeam, setMyTeam] = useState(null);
  const canEditMySchedule = permissions.canEditOwnAttendanceSchedule(userRole, myTeam);
  const canManageSchedules = permissions.canManageAttendanceSchedules(userRole, myTeam);
  const canClockInOut = permissions.canClockInOut(userRole);
  const canViewAllAttendanceLogs = permissions.canViewAllAttendanceLogs(userRole);

  const [loading, setLoading] = useState(true);
  const [mySchedule, setMySchedule] = useState(null);
  const [myScheduleSet, setMyScheduleSet] = useState(false);
  const [todayLog, setTodayLog] = useState(null);
  const [allLogs, setAllLogs] = useState([]);
  const [allLogsWithUsers, setAllLogsWithUsers] = useState([]);
  const [usersById, setUsersById] = useState({});
  const [managedUsers, setManagedUsers] = useState([]);
  const [renderedSeconds, setRenderedSeconds] = useState(0);
  const [showSetScheduleModal, setShowSetScheduleModal] = useState(false);
  const [scheduleModalMode, setScheduleModalMode] = useState('self');
  const [setScheduleForm, setSetScheduleForm] = useState({
    user_id: '',
    scheduled_time_in: '09:00',
    scheduled_time_out: '18:00',
    total_ojt_hours_required: 400,
    current_rendered_hours: 0,
  });
  const [savingSchedule, setSavingSchedule] = useState(false);
  const [clocking, setClocking] = useState(false);
  const [timerTick, setTimerTick] = useState(0);
  const timerRef = useRef(null);
  const [logDateFilter, setLogDateFilter] = useState('all'); // 'all' | 'today' | '7' | '30'
  const [attendanceTab, setAttendanceTab] = useState('my-log'); // 'my-log' | 'all-interns' | 'schedules'
  const [pageMyLog, setPageMyLog] = useState(1);
  const [pageAllInterns, setPageAllInterns] = useState(1);
  const [pageSchedules, setPageSchedules] = useState(1);
  const [myLogDateFilter, setMyLogDateFilter] = useState('all'); // 'all' | 'today' | '7' | '30' | 'specific'
  const [myLogSpecificDate, setMyLogSpecificDate] = useState('');
  const [allInternsRoleFilter, setAllInternsRoleFilter] = useState('');
  const [allInternsLateFilter, setAllInternsLateFilter] = useState('all'); // 'all' | 'late' | 'on-time'
  const [scheduleRoleFilter, setScheduleRoleFilter] = useState('');
  const [scheduleDateFilter, setScheduleDateFilter] = useState(''); // filter by schedule set on/after this date (YYYY-MM-DD)
  const [logSpecificDate, setLogSpecificDate] = useState(''); // for logDateFilter === 'specific' (all-interns tab)

  const today = new Date().toISOString().slice(0, 10);

  const todaySegments = getSegments(todayLog);
  const clockedInNow = canClockInOut && todayLog && isClockedIn(todayLog);
  const currentSegmentStart = clockedInNow && todaySegments.length > 0
    ? todaySegments[todaySegments.length - 1].time_in
    : null;

  // Live timer when clocked in (current segment has no time_out yet)
  useEffect(() => {
    if (!clockedInNow || !currentSegmentStart) {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      return;
    }
    const interval = setInterval(() => setTimerTick((t) => t + 1), 1000);
    timerRef.current = interval;
    return () => {
      clearInterval(interval);
      timerRef.current = null;
    };
  }, [clockedInNow, currentSegmentStart]);

  const currentSegmentSeconds = clockedInNow && currentSegmentStart
    ? Math.floor((Date.now() - new Date(currentSegmentStart).getTime()) / 1000)
    : 0;

  const todayRenderedBaseSeconds = todayLog ? getLogRenderedSeconds(todayLog) : 0;
  const elapsedSeconds = clockedInNow
    ? todayRenderedBaseSeconds + currentSegmentSeconds
    : todayRenderedBaseSeconds;
  const elapsedDisplay = formatElapsed(elapsedSeconds * 1000);
  const displayRenderedSeconds = renderedSeconds + currentSegmentSeconds;

  const firstIn = todaySegments.length > 0 ? todaySegments[0].time_in : null;
  const lastSegment = todaySegments.length > 0 ? todaySegments[todaySegments.length - 1] : null;
  const latestIn = lastSegment ? lastSegment.time_in : null;
  const latestOut = lastSegment ? lastSegment.time_out : null;

  useEffect(() => {
    if (session && user?.id) fetchPageData();
    else if (!session && !user) setLoading(false);
  }, [session, user?.id, canManageSchedules, canViewAllAttendanceLogs]);

  const fetchPageData = async () => {
    setLoading(true);
    try {
      const { data: userData, error: userErr } = await supabase
        .from('users')
        .select('team, scheduled_time_in, scheduled_time_out, total_ojt_hours_required, schedule_configured_at, imported_rendered_minutes')
        .eq('id', user.id)
        .single();
      if (userErr) console.warn('Attendance user profile fetch error:', userErr);
      setMyTeam(userData?.team ?? null);
      setMySchedule(userData ?? null);
      setMyScheduleSet(userData?.schedule_configured_at != null);

      const isAdmin = userRole === 'admin';
      const needAllLogs = isAdmin || canViewAllAttendanceLogs;

      if (needAllLogs) {
        const [logsRes, usersRes] = await Promise.all([
          supabase.from('attendance_logs').select('*').order('log_date', { ascending: false }),
          supabase.from('users').select('id, full_name, email, role, team, imported_rendered_minutes'),
        ]);
        const allList = Array.isArray(logsRes.data) ? logsRes.data : [];
        const usersList = Array.isArray(usersRes.data) ? usersRes.data : [];
        const byId = {};
        usersList.forEach((u) => { byId[u.id] = u; });
        setUsersById(byId);
        setAllLogsWithUsers(allList);
        const myList = allList.filter((l) => l.user_id === user.id);
        setAllLogs(myList);
        setTodayLog(myList.find((l) => l.log_date === today) || null);
        const fromLogsSec = myList.reduce((acc, l) => acc + getLogRenderedSeconds(l), 0);
        const importedSec = (Number(userData?.imported_rendered_minutes) || 0) * 60;
        setRenderedSeconds(fromLogsSec + importedSec);
      } else {
        const { data: logs, error: logsErr } = await supabase
          .from('attendance_logs')
          .select('*')
          .eq('user_id', user.id)
          .order('log_date', { ascending: false });
        if (logsErr) console.warn('Attendance logs fetch error:', logsErr);
        const list = Array.isArray(logs) ? logs : [];
        setAllLogs(list);
        setAllLogsWithUsers([]);
        setUsersById({});
        setTodayLog(list.find((l) => l.log_date === today) || null);
        const fromLogsSec = list.reduce((acc, l) => acc + getLogRenderedSeconds(l), 0);
        const importedSec = (Number(userData?.imported_rendered_minutes) || 0) * 60;
        setRenderedSeconds(fromLogsSec + importedSec);
      }

      if (canManageSchedules) {
        const { data: managed, error: managedErr } = await supabase
          .from('users')
          .select('id, email, full_name, role, team, scheduled_time_in, scheduled_time_out, total_ojt_hours_required, schedule_configured_at, imported_rendered_minutes')
          .neq('role', 'admin')
          .order('full_name', { ascending: true });
        if (managedErr) console.warn('Attendance managed users fetch error:', managedErr);
        setManagedUsers(Array.isArray(managed) ? managed : []);
      } else {
        setManagedUsers([]);
      }
    } catch (e) {
      console.error('Attendance fetch error:', e);
    } finally {
      setLoading(false);
    }
  };

  const getRenderedSecondsForUser = (userId) => {
    const source = allLogsWithUsers.length > 0 ? allLogsWithUsers : (allLogs || []);
    const fromLogsSec = source
      .filter((l) => l.user_id === userId && (l.total_rendered_seconds != null || l.rendered_seconds != null || l.rendered_minutes != null || (getSegments(l).length > 0)))
      .reduce((acc, l) => acc + getLogRenderedSeconds(l), 0);
    const imported = Number(usersById[userId]?.imported_rendered_minutes) || 0;
    const fromManaged = managedUsers.find((m) => m.id === userId)?.imported_rendered_minutes;
    const importedSec = (imported || Number(fromManaged) || 0) * 60;
    return fromLogsSec + importedSec;
  };

  const handleClockIn = async () => {
    if (!user?.id) return;
    if (clockedInNow) {
      toast.error('Already clocked in. Clock out first to start a new segment.');
      return;
    }
    setClocking(true);
    try {
      const now = new Date();
      const nowIso = now.toISOString();
      const scheduledInMinutes = timeStringToMinutes(mySchedule?.scheduled_time_in || '09:00');
      const clockInMinutes = now.getHours() * 60 + now.getMinutes();
      const isGrace = clockInMinutes >= scheduledInMinutes && clockInMinutes < scheduledInMinutes + GRACE_MINUTES;
      const isLate = clockInMinutes >= scheduledInMinutes + GRACE_MINUTES;

      if (!todayLog) {
        const { error } = await supabase
          .from('attendance_logs')
          .upsert(
            {
              user_id: user.id,
              log_date: today,
              time_in: nowIso,
              segments: [{ time_in: nowIso }],
              total_rendered_seconds: 0,
              is_late: isLate,
              grace_period_notified: isGrace,
              updated_at: nowIso,
            },
            { onConflict: 'user_id,log_date' }
          );
        if (error) throw error;
        queryCache.invalidate('attendance');
        await fetchPageData();
        if (isGrace) {
          toast('You are within the 15-minute grace period. Late arrivals exceeding 15 minutes must be communicated in advance to the supervisor.', { duration: 6000 });
        } else if (isLate) {
          toast('You are marked late (more than 15 minutes after scheduled time). Late arrivals exceeding 15 minutes must be communicated in advance to the supervisor.', { duration: 6000 });
        } else {
          toast.success('Time in recorded.');
        }
        setClocking(false);
        return;
      } else {
        const segments = getSegments(todayLog);
        if (segments.length > 0 && !segments[segments.length - 1].time_out) {
          toast.error('Already clocked in.');
          setClocking(false);
          return;
        }
        const firstTimeIn = segments.length > 0 ? segments[0].time_in : nowIso;
        const newSegments = [...segments, { time_in: nowIso }];
        const { error } = await supabase
          .from('attendance_logs')
          .update({
            time_in: firstTimeIn,
            segments: newSegments,
            updated_at: nowIso,
          })
          .eq('user_id', user.id)
          .eq('log_date', today);
        if (error) throw error;
      }
      queryCache.invalidate('attendance');
      await fetchPageData();
      toast.success('Time in recorded.');
    } catch (e) {
      console.error('Clock in error:', e);
      toast.error(e?.message || 'Failed to record time in.');
    } finally {
      setClocking(false);
    }
  };

  const handleClockOut = async () => {
    if (!user?.id || !todayLog) {
      toast.error('No time in recorded for today.');
      return;
    }
    const segments = getSegments(todayLog);
    if (segments.length === 0 || segments[segments.length - 1].time_out) {
      toast.error('Not clocked in. Clock in first.');
      setClocking(false);
      return;
    }
    setClocking(true);
    try {
      const now = new Date();
      const nowIso = now.toISOString();
      const lastSegment = segments[segments.length - 1];
      const segmentStart = new Date(lastSegment.time_in).getTime();
      const segmentSec = Math.floor((now.getTime() - segmentStart) / 1000);
      const previousTotal = typeof todayLog.total_rendered_seconds === 'number' ? todayLog.total_rendered_seconds : (getLogRenderedSeconds(todayLog) || 0);
      const newTotalSec = previousTotal + segmentSec;

      const updatedSegments = segments.map((s, i) =>
        i === segments.length - 1 ? { ...s, time_out: nowIso } : s
      );

      const { error } = await supabase
        .from('attendance_logs')
        .update({
          time_out: nowIso,
          segments: updatedSegments,
          total_rendered_seconds: newTotalSec,
          rendered_seconds: newTotalSec,
          rendered_minutes: Math.round(newTotalSec / 60),
          updated_at: nowIso,
        })
        .eq('user_id', user.id)
        .eq('log_date', today);
      if (error) throw error;
      queryCache.invalidate('attendance');
      await fetchPageData();
      toast.success('Time out recorded.');
    } catch (e) {
      console.error('Clock out error:', e);
      toast.error(e?.message || 'Failed to record time out.');
    } finally {
      setClocking(false);
    }
  };

  const handleOpenSetSchedule = ({ mode, targetUser } = {}) => {
    const m = mode || 'self';
    setScheduleModalMode(m);

    if (m === 'self') {
      const importedMin = Number(mySchedule?.imported_rendered_minutes) || 0;
      setSetScheduleForm({
        user_id: user?.id || '',
        scheduled_time_in: formatTime(mySchedule?.scheduled_time_in) || '09:00',
        scheduled_time_out: formatTime(mySchedule?.scheduled_time_out) || '18:00',
        total_ojt_hours_required: mySchedule?.total_ojt_hours_required ?? 400,
        current_rendered_hours: canManageSchedules ? (importedMin / 60).toFixed(2) : 0,
      });
      setShowSetScheduleModal(true);
      return;
    }

    // manage
    if (targetUser) {
      const importedMin = Number(targetUser.imported_rendered_minutes) || 0;
      setSetScheduleForm({
        user_id: targetUser.id,
        scheduled_time_in: formatTime(targetUser.scheduled_time_in) || '09:00',
        scheduled_time_out: formatTime(targetUser.scheduled_time_out) || '18:00',
        total_ojt_hours_required: targetUser.total_ojt_hours_required ?? 400,
        current_rendered_hours: (importedMin / 60).toFixed(2),
      });
    } else {
      setSetScheduleForm({
        user_id: '',
        scheduled_time_in: '09:00',
        scheduled_time_out: '18:00',
        total_ojt_hours_required: 400,
        current_rendered_hours: '0',
      });
    }
    setShowSetScheduleModal(true);
  };

  const handleSaveSchedule = async (e) => {
    e.preventDefault();
    const { user_id, scheduled_time_in, scheduled_time_out, total_ojt_hours_required, current_rendered_hours } = setScheduleForm;
    if (!user_id) {
      toast.error('Select an intern.');
      return;
    }
    setSavingSchedule(true);
    try {
      const toTime = (v) => {
        const parts = String(v).trim().split(':');
        const h = parts[0] || '0';
        const m = (parts[1] || '0').padStart(2, '0');
        const s = (parts[2] || '0').padStart(2, '0');
        return `${h.padStart(2, '0')}:${m}:${s}`;
      };
      const includeImported = scheduleModalMode === 'manage' || (scheduleModalMode === 'self' && canManageSchedules);
      const importedMinutes = includeImported ? Math.round((parseFloat(current_rendered_hours) || 0) * 60) : undefined;
      const payload = {
        scheduled_time_in: toTime(scheduled_time_in),
        scheduled_time_out: toTime(scheduled_time_out),
        total_ojt_hours_required: Number(total_ojt_hours_required) || 400,
        schedule_configured_at: new Date().toISOString(),
      };
      if (includeImported && importedMinutes !== undefined) {
        payload.imported_rendered_minutes = Math.max(0, importedMinutes);
      }
      const { error } = await supabase
        .from('users')
        .update(payload)
        .eq('id', user_id);
      if (error) throw error;
      queryCache.invalidate('user_management:users');
      toast.success('Schedule saved.');
      setShowSetScheduleModal(false);
      await fetchPageData();
    } catch (e) {
      console.error('Save schedule error:', e);
      toast.error(e?.message || 'Failed to save schedule.');
    } finally {
      setSavingSchedule(false);
    }
  };

  const notSetupManaged = managedUsers.filter((i) => i.schedule_configured_at == null);
  const setupManaged = managedUsers.filter((i) => i.schedule_configured_at != null);

  const filteredAttendanceLogs = (() => {
    if (!canViewAllAttendanceLogs || !allLogsWithUsers.length) return allLogsWithUsers;
    let list = allLogsWithUsers;
    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);
    if (logDateFilter === 'today') list = list.filter((log) => log.log_date === todayStr);
    else if (logDateFilter === '7' || logDateFilter === '30') {
      const days = logDateFilter === '7' ? 7 : 30;
      const from = new Date(now);
      from.setDate(from.getDate() - days);
      const fromStr = from.toISOString().slice(0, 10);
      list = list.filter((log) => log.log_date >= fromStr && log.log_date <= todayStr);
    } else if (logDateFilter === 'specific' && logSpecificDate) {
      list = list.filter((log) => log.log_date === logSpecificDate);
    }
    if (allInternsRoleFilter) {
      list = list.filter((log) => userMatchesRoleFilter(usersById[log.user_id], allInternsRoleFilter));
    }
    if (allInternsLateFilter === 'late') list = list.filter((log) => log.is_late === true);
    else if (allInternsLateFilter === 'on-time') list = list.filter((log) => !log.is_late);
    list = [...list].sort((a, b) => {
      const segA = getSegments(a);
      const segB = getSegments(b);
      const latestInA = segA.length ? segA[segA.length - 1].time_in : a.time_in;
      const latestInB = segB.length ? segB[segB.length - 1].time_in : b.time_in;
      const tsA = latestInA ? new Date(latestInA).getTime() : 0;
      const tsB = latestInB ? new Date(latestInB).getTime() : 0;
      return tsB - tsA;
    });
    return list;
  })();

  const filteredMyLogs = (() => {
    if (!allLogs.length) return allLogs;
    if (myLogDateFilter === 'all') return allLogs;
    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);
    if (myLogDateFilter === 'today') return allLogs.filter((log) => log.log_date === todayStr);
    if (myLogDateFilter === '7' || myLogDateFilter === '30') {
      const days = myLogDateFilter === '7' ? 7 : 30;
      const from = new Date(now);
      from.setDate(from.getDate() - days);
      const fromStr = from.toISOString().slice(0, 10);
      return allLogs.filter((log) => log.log_date >= fromStr && log.log_date <= todayStr);
    }
    if (myLogDateFilter === 'specific' && myLogSpecificDate) {
      return allLogs.filter((log) => log.log_date === myLogSpecificDate);
    }
    return allLogs;
  })();

  const showCurrentRenderedInModal = scheduleModalMode === 'manage' || (scheduleModalMode === 'self' && (canManageSchedules || canEditMySchedule));

  if (loading && !mySchedule) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="animate-spin rounded-full h-10 w-10 border-2 border-[#6795BE] border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="w-full space-y-4 sm:space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900" style={{ color: PRIMARY }}>Attendance</h1>
        <p className="mt-1 text-sm text-gray-600">
          {canClockInOut
            ? 'Time in and out, rendered hours, and remaining hours'
            : 'View all interns attendance logs (view only)'}
        </p>
      </div>

      {/* Admin: view-only message */}
      {!canClockInOut && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 text-blue-800">
          You are viewing attendance in read-only mode. Only interns and team leads record time in/out.
        </div>
      )}

      {/* My attendance: schedule, clock in/out, timer (only for users who can clock) */}
      {canClockInOut && (
        <>
          {!myScheduleSet && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-amber-800">
              Your official schedule is not set yet. Time in/out will still work, but please confirm your official time frame with your supervisor/TL.
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="rounded-xl border-2 bg-white p-4 shadow-sm" style={{ borderColor: PRIMARY }}>
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Total rendered hours</p>
              <p className="mt-1 text-2xl font-bold text-gray-900">{formatHoursMinutesCard(displayRenderedSeconds)}</p>
            </div>
            <div className="rounded-xl border-2 bg-white p-4 shadow-sm" style={{ borderColor: PRIMARY }}>
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Remaining hours</p>
              <p className="mt-1 text-2xl font-bold text-gray-900">
                {formatHoursMinutesCard(Math.max(0, (mySchedule?.total_ojt_hours_required || 400) * 3600 - displayRenderedSeconds))}
              </p>
            </div>
          </div>

          <div className="rounded-lg border border-gray-200 bg-white p-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div className="flex flex-col gap-2">
                <p className="text-sm text-gray-600">
                  Schedule: {formatScheduleTime(mySchedule?.scheduled_time_in || '09:00')} to {formatScheduleTime(mySchedule?.scheduled_time_out || '18:00')}{' '}
                  (Required: {mySchedule?.total_ojt_hours_required ?? 400} hrs)
                </p>
                <p className="text-xs text-gray-500">
                  Late arrivals exceeding 15 minutes must be communicated in advance to the supervisor.
                </p>
                {canEditMySchedule && (
                  <button
                    type="button"
                    onClick={() => handleOpenSetSchedule({ mode: 'self' })}
                    className="inline-flex w-fit px-3 py-1.5 rounded-lg text-xs font-medium text-white"
                    style={{ backgroundColor: PRIMARY }}
                  >
                    Edit my schedule
                  </button>
                )}
              </div>
              <div className="flex flex-wrap items-center justify-start sm:justify-end gap-3">
                {(todayRenderedBaseSeconds > 0 || clockedInNow) && (
                  <div
                    className="flex items-center gap-2 px-3 py-2 rounded-lg bg-gray-100 text-gray-800 font-mono text-lg"
                    aria-live="polite"
                  >
                    <span className="text-gray-500 text-sm font-sans font-normal">Elapsed:</span>
                    <span>{elapsedDisplay ?? '00:00:00'}</span>
                  </div>
                )}
                {!clockedInNow && (
                  <button
                    type="button"
                    onClick={handleClockIn}
                    disabled={clocking}
                    className="px-4 py-2 rounded-lg font-medium text-white disabled:opacity-50"
                    style={{ backgroundColor: PRIMARY }}
                  >
                    {clocking ? 'Recording…' : 'Time In'}
                  </button>
                )}
                {clockedInNow && (
                  <button
                    type="button"
                    onClick={handleClockOut}
                    disabled={clocking}
                    className="px-4 py-2 rounded-lg font-medium text-white disabled:opacity-50"
                    style={{ backgroundColor: PRIMARY }}
                    title="Pause timer; time in again to continue"
                  >
                    {clocking ? 'Recording…' : 'Time Out (pause)'}
                  </button>
                )}
              </div>
            </div>
          </div>

        </>
      )}

      {/* Tabs: My attendance log | All interns attendance | Set schedule for interns */}
      {(() => {
        const tabs = [];
        if (canClockInOut) tabs.push({ id: 'my-log', label: 'My attendance log' });
        if (canViewAllAttendanceLogs) tabs.push({ id: 'all-interns', label: 'All interns attendance' });
        if (canManageSchedules) tabs.push({ id: 'schedules', label: 'Set schedule for interns' });
        const activeTab = tabs.some((t) => t.id === attendanceTab) ? attendanceTab : (tabs[0]?.id ?? 'my-log');
        if (tabs.length === 0) return null;
        return (
          <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
            <div className="flex border-b border-gray-200 bg-gray-50/80">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setAttendanceTab(tab.id)}
                  className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                    activeTab === tab.id
                      ? 'border-[#6795BE] text-[#6795BE] bg-white'
                      : 'border-transparent text-gray-600 hover:text-gray-900 hover:bg-gray-100/80'
                  }`}
                  style={activeTab === tab.id ? { borderColor: PRIMARY } : {}}
                >
                  {tab.label}
                </button>
              ))}
            </div>
            <div className="p-0 min-h-[200px]">
              {activeTab === 'my-log' && canClockInOut && (() => {
                const totalMy = filteredMyLogs.length;
                const totalPagesMy = Math.ceil(totalMy / PAGE_SIZE) || 1;
                const pageMy = Math.min(Math.max(1, pageMyLog), totalPagesMy);
                const paginatedMy = filteredMyLogs.slice((pageMy - 1) * PAGE_SIZE, pageMy * PAGE_SIZE);
                return (
                  <div className="p-4">
                    <div className="flex flex-wrap items-center gap-3 mb-3">
                      <span className="text-sm text-gray-600">Filter:</span>
                      <select
                        value={myLogDateFilter}
                        onChange={(e) => setMyLogDateFilter(e.target.value)}
                        className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:ring-2 focus:ring-offset-0 focus:ring-[#6795BE]"
                      >
                        <option value="all">All</option>
                        <option value="today">Day (today)</option>
                        <option value="7">Week (last 7 days)</option>
                        <option value="30">Month (last 30 days)</option>
                        <option value="specific">Specific date</option>
                      </select>
                      {myLogDateFilter === 'specific' && (
                        <input
                          type="date"
                          value={myLogSpecificDate}
                          onChange={(e) => setMyLogSpecificDate(e.target.value)}
                          className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:ring-2 focus:ring-[#6795BE]"
                        />
                      )}
                    </div>
                    <p className="text-xs text-gray-500 mb-3">Rendered time = total for that day only. Time out pauses; time in again to continue.</p>
                    <div className="rounded-lg border border-gray-200 overflow-hidden overflow-x-auto">
                      <table className="min-w-full divide-y divide-gray-200">
                        <thead>
                          <tr className="bg-gray-50">
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">Date</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">First in</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">Latest in</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">Latest out</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">Rendered time</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">Late</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200">
                          {paginatedMy.length > 0 ? paginatedMy.map((log) => {
                            const seg = getSegments(log);
                            const firstInLog = seg.length > 0 ? seg[0].time_in : log.time_in;
                            const latestInLog = seg.length > 0 ? seg[seg.length - 1].time_in : log.time_in;
                            const lastOutLog = seg.length > 0 ? seg[seg.length - 1].time_out : log.time_out;
                            const isTodayRow = log.log_date === today && log.user_id === user?.id && isClockedIn(log);
                            const dayTotalSec = getLogRenderedSeconds(log) + (isTodayRow ? currentSegmentSeconds : 0);
                            const hasRendered = (log.total_rendered_seconds != null || log.rendered_seconds != null || log.rendered_minutes != null) || isTodayRow;
                            return (
                              <tr key={log.id ?? `${log.user_id}-${log.log_date}`} className="hover:bg-gray-50">
                                <td className="px-4 py-3 text-sm text-gray-900">{log.log_date}</td>
                                <td className="px-4 py-3 text-sm">{formatTimeHHMM(firstInLog)}</td>
                                <td className="px-4 py-3 text-sm">{formatTimeHHMM(latestInLog)}</td>
                                <td className="px-4 py-3 text-sm">{formatTimeHHMM(lastOutLog)}</td>
                                <td className="px-4 py-3 text-sm">{hasRendered ? formatHoursMinutesLabel(dayTotalSec) : '—'}</td>
                                <td className="px-4 py-3 text-sm">{log.is_late ? 'Yes' : '—'}</td>
                              </tr>
                            );
                          }) : (
                            <tr><td colSpan={6} className="px-4 py-6 text-center text-gray-500 text-sm">No attendance records yet.</td></tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                    <Pagination total={totalMy} page={pageMyLog} setPage={setPageMyLog} pageSize={PAGE_SIZE} />
                  </div>
                );
              })()}
              {activeTab === 'all-interns' && canViewAllAttendanceLogs && (() => {
                const totalAll = filteredAttendanceLogs.length;
                const totalPagesAll = Math.ceil(totalAll / PAGE_SIZE) || 1;
                const pageAll = Math.min(Math.max(1, pageAllInterns), totalPagesAll);
                const paginatedAll = filteredAttendanceLogs.slice((pageAll - 1) * PAGE_SIZE, pageAll * PAGE_SIZE);
                return (
                  <div className="p-4">
                    <div className="flex flex-wrap items-center gap-3 mb-3">
                      <span className="text-sm text-gray-600">Date:</span>
                      <select
                        value={logDateFilter}
                        onChange={(e) => setLogDateFilter(e.target.value)}
                        className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:ring-2 focus:ring-offset-0 focus:ring-[#6795BE]"
                      >
                        <option value="all">All</option>
                        <option value="today">Today</option>
                        <option value="7">Last 7 days</option>
                        <option value="30">Last 30 days</option>
                        <option value="specific">Specific date</option>
                      </select>
                      {logDateFilter === 'specific' && (
                        <input
                          type="date"
                          value={logSpecificDate}
                          onChange={(e) => setLogSpecificDate(e.target.value)}
                          className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:ring-2 focus:ring-[#6795BE]"
                        />
                      )}
                      <span className="text-sm text-gray-600 ml-2">Role:</span>
                      <select
                        value={allInternsRoleFilter}
                        onChange={(e) => setAllInternsRoleFilter(e.target.value)}
                        className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:ring-2 focus:ring-offset-0 focus:ring-[#6795BE]"
                      >
                        <option value="">All roles</option>
                        <option value="tla">Team Lead Assistant (TLA)</option>
                        <option value="monitoring">Monitoring Team</option>
                        <option value="pat1">PAT1</option>
                        <option value="tl">Team Lead</option>
                        <option value="vtl">Vice Team Lead</option>
                      </select>
                      <span className="text-sm text-gray-600">Late:</span>
                      <select
                        value={allInternsLateFilter}
                        onChange={(e) => setAllInternsLateFilter(e.target.value)}
                        className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:ring-2 focus:ring-offset-0 focus:ring-[#6795BE]"
                      >
                        <option value="all">All</option>
                        <option value="late">Late only</option>
                        <option value="on-time">On time only</option>
                      </select>
                    </div>
                    <div className="rounded-lg border border-gray-200 overflow-hidden overflow-x-auto">
                      <table className="min-w-full divide-y divide-gray-200">
                        <thead>
                          <tr className="bg-gray-50">
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">Name</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">Email</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">Role</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">Date</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">First in</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">Latest in</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">Latest out</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">Rendered time</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">Late</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200">
                          {paginatedAll.length > 0 ? paginatedAll.map((log) => {
                            const u = usersById[log.user_id] || {};
                            const seg = getSegments(log);
                            const firstInLog = seg.length > 0 ? seg[0].time_in : log.time_in;
                            const latestInLog = seg.length > 0 ? seg[seg.length - 1].time_in : log.time_in;
                            const lastOutLog = seg.length > 0 ? seg[seg.length - 1].time_out : log.time_out;
                            const isTodayRow = log.log_date === today && log.user_id === user?.id && isClockedIn(log);
                            const dayTotalSec = getLogRenderedSeconds(log) + (isTodayRow ? currentSegmentSeconds : 0);
                            const hasRendered = (log.total_rendered_seconds != null || log.rendered_seconds != null || log.rendered_minutes != null) || isTodayRow;
                            return (
                              <tr key={log.id ?? `${log.user_id}-${log.log_date}`} className="hover:bg-gray-50">
                                <td className="px-4 py-3 text-sm text-gray-900">{u.full_name || '—'}</td>
                                <td className="px-4 py-3 text-sm text-gray-600">{u.email || '—'}</td>
                                <td className="px-4 py-3 text-sm text-gray-600">{getRoleDisplayName(u.role) || '—'}</td>
                                <td className="px-4 py-3 text-sm">{log.log_date}</td>
                                <td className="px-4 py-3 text-sm">{formatTimeHHMM(firstInLog)}</td>
                                <td className="px-4 py-3 text-sm">{formatTimeHHMM(latestInLog)}</td>
                                <td className="px-4 py-3 text-sm">{formatTimeHHMM(lastOutLog)}</td>
                                <td className="px-4 py-3 text-sm">{hasRendered ? formatHoursMinutesLabel(dayTotalSec) : '—'}</td>
                                <td className="px-4 py-3 text-sm">{log.is_late ? 'Yes' : '—'}</td>
                              </tr>
                            );
                          }) : (
                            <tr><td colSpan={9} className="px-4 py-6 text-center text-gray-500 text-sm">No records match the current filters.</td></tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                    <Pagination total={totalAll} page={pageAllInterns} setPage={setPageAllInterns} pageSize={PAGE_SIZE} />
                  </div>
                );
              })()}
              {activeTab === 'schedules' && canManageSchedules && (() => {
                let managedList = [
                  ...setupManaged.map((u) => ({ type: 'setup', user: u })),
                  ...notSetupManaged.map((u) => ({ type: 'not-set', user: u })),
                ];
                if (scheduleRoleFilter) {
                  managedList = managedList.filter(({ user }) => userMatchesRoleFilter(user, scheduleRoleFilter));
                }
                if (scheduleDateFilter) {
                  managedList = managedList.filter(({ type, user }) => {
                    if (type === 'not-set') return true;
                    const setAt = user.schedule_configured_at ? String(user.schedule_configured_at).slice(0, 10) : '';
                    return setAt >= scheduleDateFilter;
                  });
                }
                const totalSched = managedList.length;
                const totalPagesSched = Math.ceil(totalSched / PAGE_SIZE) || 1;
                const pageSched = Math.min(Math.max(1, pageSchedules), totalPagesSched);
                const paginatedSched = managedList.slice((pageSched - 1) * PAGE_SIZE, pageSched * PAGE_SIZE);
                return (
                  <div className="p-4">
                    <div className="flex flex-wrap items-center gap-3 mb-4">
                      <button
                        type="button"
                        onClick={() => handleOpenSetSchedule({ mode: 'manage' })}
                        className="px-4 py-2 rounded-lg text-sm font-medium text-white"
                        style={{ backgroundColor: PRIMARY }}
                      >
                        Set schedule for interns
                      </button>
                      <span className="text-sm text-gray-600">Role:</span>
                      <select
                        value={scheduleRoleFilter}
                        onChange={(e) => setScheduleRoleFilter(e.target.value)}
                        className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:ring-2 focus:ring-offset-0 focus:ring-[#6795BE]"
                      >
                        <option value="">All roles</option>
                        <option value="tla">Team Lead Assistant (TLA)</option>
                        <option value="monitoring">Monitoring Team</option>
                        <option value="pat1">PAT1</option>
                        <option value="tl">Team Lead</option>
                        <option value="vtl">Vice Team Lead</option>
                      </select>
                      <span className="text-sm text-gray-600">Schedule set on/after:</span>
                      <input
                        type="date"
                        value={scheduleDateFilter}
                        onChange={(e) => setScheduleDateFilter(e.target.value)}
                        className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:ring-2 focus:ring-[#6795BE]"
                      />
                      {scheduleDateFilter && (
                        <button
                          type="button"
                          onClick={() => setScheduleDateFilter('')}
                          className="text-sm text-gray-600 hover:underline"
                        >
                          Clear date
                        </button>
                      )}
                    </div>
                    {managedUsers.length === 0 && !loading ? (
                      <p className="px-4 py-6 text-center text-gray-500">No users to manage.</p>
                    ) : (
                      <>
                        <div className="rounded-lg border border-gray-200 overflow-hidden overflow-x-auto">
                          <table className="min-w-full divide-y divide-gray-200">
                            <thead>
                              <tr className="bg-gray-50">
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">Name</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">Email</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">Role</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">Schedule</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">Time In</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">Time Out</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">Required (hrs)</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">Rendered (hrs)</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">Remaining (hrs)</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">Actions</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-200">
                              {paginatedSched.map(({ type, user: i }) =>
                                type === 'setup' ? (
                                  <tr key={i.id} className="hover:bg-gray-50">
                                    <td className="px-4 py-3 text-sm text-gray-900">{i.full_name || '—'}</td>
                                    <td className="px-4 py-3 text-sm text-gray-600">{i.email || '—'}</td>
                                    <td className="px-4 py-3 text-sm text-gray-600">{i.role || '—'}</td>
                                    <td className="px-4 py-3 text-sm text-green-600 font-medium">Setup</td>
                                    <td className="px-4 py-3 text-sm">{formatScheduleTime(i.scheduled_time_in)}</td>
                                    <td className="px-4 py-3 text-sm">{formatScheduleTime(i.scheduled_time_out)}</td>
                                    <td className="px-4 py-3 text-sm">{i.total_ojt_hours_required ?? 400}</td>
                                    <td className="px-4 py-3 text-sm">{formatHoursFromSeconds(getRenderedSecondsForUser(i.id))}</td>
                                    <td className="px-4 py-3 text-sm">{formatHoursFromSeconds(Math.max(0, (i.total_ojt_hours_required || 400) * 3600 - getRenderedSecondsForUser(i.id)))}</td>
                                    <td className="px-4 py-3">
                                      <button
                                        type="button"
                                        onClick={() => handleOpenSetSchedule({ mode: 'manage', targetUser: i })}
                                        className="text-sm font-medium"
                                        style={{ color: PRIMARY }}
                                      >
                                        Edit
                                      </button>
                                    </td>
                                  </tr>
                                ) : (
                                  <tr key={i.id} className="hover:bg-gray-50 bg-amber-50/50">
                                    <td className="px-4 py-3 text-sm text-gray-900">{i.full_name || '—'}</td>
                                    <td className="px-4 py-3 text-sm text-gray-600">{i.email || '—'}</td>
                                    <td className="px-4 py-3 text-sm text-gray-600">{i.role || '—'}</td>
                                    <td className="px-4 py-3 text-sm text-amber-600 font-medium">Not set</td>
                                    <td className="px-4 py-3 text-sm">—</td>
                                    <td className="px-4 py-3 text-sm">—</td>
                                    <td className="px-4 py-3 text-sm">—</td>
                                    <td className="px-4 py-3 text-sm">—</td>
                                    <td className="px-4 py-3 text-sm">—</td>
                                    <td className="px-4 py-3">
                                      <button
                                        type="button"
                                        onClick={() => handleOpenSetSchedule({ mode: 'manage', targetUser: i })}
                                        className="text-sm font-medium"
                                        style={{ color: PRIMARY }}
                                      >
                                        Set schedule
                                      </button>
                                    </td>
                                  </tr>
                                )
                              )}
                            </tbody>
                          </table>
                        </div>
                        <Pagination total={totalSched} page={pageSchedules} setPage={setPageSchedules} pageSize={PAGE_SIZE} />
                      </>
                    )}
                  </div>
                );
              })()}
            </div>
          </div>
        );
      })()}

      {showSetScheduleModal &&
        createPortal(
          <div
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4"
            onClick={() => !savingSchedule && setShowSetScheduleModal(false)}
            role="dialog"
            aria-modal="true"
          >
            <div
              className="bg-white rounded-2xl shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto p-6"
              onClick={(e) => e.stopPropagation()}
            >
              <h2 className="text-lg font-semibold text-gray-900 mb-4" style={{ color: PRIMARY }}>
                Set intern schedule
              </h2>
              <form onSubmit={handleSaveSchedule} className="space-y-4">
                {scheduleModalMode === 'manage' && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">User</label>
                    <select
                      value={setScheduleForm.user_id}
                      onChange={(e) => {
                        const uid = e.target.value;
                        const u = managedUsers.find((i) => i.id === uid);
                        if (!u) {
                          setSetScheduleForm((f) => ({ ...f, user_id: uid, current_rendered_hours: '0' }));
                          return;
                        }
                        const importedMin = Number(u.imported_rendered_minutes) || 0;
                        setSetScheduleForm({
                          user_id: u.id,
                          scheduled_time_in: formatTime(u.scheduled_time_in) || '09:00',
                          scheduled_time_out: formatTime(u.scheduled_time_out) || '18:00',
                          total_ojt_hours_required: u.total_ojt_hours_required ?? 400,
                          current_rendered_hours: (importedMin / 60).toFixed(2),
                        });
                      }}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-offset-0 focus:ring-[#6795BE]"
                      required
                    >
                      <option value="">Select user</option>
                      {managedUsers.map((i) => (
                        <option key={i.id} value={i.id}>
                          {i.full_name || i.email || i.id}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Time In</label>
                    <input
                      type="time"
                      value={setScheduleForm.scheduled_time_in}
                      onChange={(e) => setSetScheduleForm((f) => ({ ...f, scheduled_time_in: e.target.value }))}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Time Out</label>
                    <input
                      type="time"
                      value={setScheduleForm.scheduled_time_out}
                      onChange={(e) => setSetScheduleForm((f) => ({ ...f, scheduled_time_out: e.target.value }))}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Total OJT hours required</label>
                  <input
                    type="number"
                    min={1}
                    step={1}
                    value={setScheduleForm.total_ojt_hours_required}
                    onChange={(e) => setSetScheduleForm((f) => ({ ...f, total_ojt_hours_required: e.target.value }))}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  />
                </div>
                {showCurrentRenderedInModal && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Current rendered hours</label>
                    <input
                      type="number"
                      min={0}
                      step={0.5}
                      value={setScheduleForm.current_rendered_hours ?? ''}
                      onChange={(e) => setSetScheduleForm((f) => ({ ...f, current_rendered_hours: e.target.value }))}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-offset-0 focus:ring-[#6795BE]"
                    />
                    <p className="mt-1 text-xs text-gray-500">Existing OJT hours to carry over (e.g. from previous system). Decimal allowed.</p>
                  </div>
                )}
                <div className="flex gap-2 pt-2">
                  <button
                    type="submit"
                    disabled={savingSchedule}
                    className="px-4 py-2 rounded-lg font-medium text-white disabled:opacity-50"
                    style={{ backgroundColor: PRIMARY }}
                  >
                    {savingSchedule ? 'Saving…' : 'Save'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowSetScheduleModal(false)}
                    className="px-4 py-2 rounded-lg border border-gray-300 text-gray-700"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}
