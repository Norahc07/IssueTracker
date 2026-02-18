import { useEffect, useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useSupabase } from '../context/supabase.jsx';
import { toast } from 'react-hot-toast';
import { permissions } from '../utils/rolePermissions.js';
import { queryCache } from '../utils/queryCache.js';
import { getRoleDisplayName } from '../utils/rolePermissions.js';

const PRIMARY = '#6795BE';
const GRACE_MINUTES = 15;

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
          supabase.from('users').select('id, full_name, email, role, imported_rendered_minutes'),
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
          toast('You are within the grace period (9:00–9:15). Please message your supervisor or TL if needed.', { duration: 5000 });
        } else if (isLate) {
          toast('You are marked late. Please inform your supervisor or TL.', { duration: 4000 });
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
    if (logDateFilter === 'all') return allLogsWithUsers;
    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);
    if (logDateFilter === 'today') return allLogsWithUsers.filter((log) => log.log_date === todayStr);
    const days = logDateFilter === '7' ? 7 : 30;
    const from = new Date(now);
    from.setDate(from.getDate() - days);
    const fromStr = from.toISOString().slice(0, 10);
    return allLogsWithUsers.filter((log) => log.log_date >= fromStr && log.log_date <= todayStr);
  })();

  const showCurrentRenderedInModal = scheduleModalMode === 'manage' || (scheduleModalMode === 'self' && canManageSchedules);

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

          {/* Personal attendance log: each row = that day's total rendered; card above = all days + imported */}
          <div>
            <h2 className="text-base font-semibold text-gray-900 mb-1">My attendance log</h2>
            <p className="text-xs text-gray-500 mb-3">Rendered (hrs) = total for that day only. Time out pauses; time in again to continue.</p>
            <div className="rounded-lg border border-gray-200 bg-white overflow-hidden overflow-x-auto">
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
                  {allLogs.length > 0 ? allLogs.map((log) => {
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
          </div>
        </>
      )}

      {/* All interns attendance log (admin, TLA, TL, VTL, Monitoring) */}
      {canViewAllAttendanceLogs && (
        <div>
          <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
            <h2 className="text-base font-semibold text-gray-900">
              {canClockInOut ? 'All interns attendance' : 'Attendance log'}
            </h2>
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-600">Filter by date:</span>
              <select
                value={logDateFilter}
                onChange={(e) => setLogDateFilter(e.target.value)}
                className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:ring-2 focus:ring-offset-0 focus:ring-[#6795BE]"
              >
                <option value="all">All</option>
                <option value="today">Today</option>
                <option value="7">Last 7 days</option>
                <option value="30">Last 30 days</option>
              </select>
            </div>
          </div>
          <div className="rounded-lg border border-gray-200 bg-white overflow-hidden overflow-x-auto">
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
                {filteredAttendanceLogs.length > 0 ? filteredAttendanceLogs.map((log) => {
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
                  <tr><td colSpan={9} className="px-4 py-6 text-center text-gray-500 text-sm">{logDateFilter !== 'all' ? 'No records in this date range.' : 'No attendance records.'}</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Monitoring TL/VTL / Admin management */}
      {canManageSchedules && (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => handleOpenSetSchedule({ mode: 'manage' })}
              className="px-4 py-2 rounded-lg text-sm font-medium text-white"
              style={{ backgroundColor: PRIMARY }}
            >
              Set schedule for interns
            </button>
          </div>
          <div className="rounded-lg border border-gray-200 bg-white overflow-hidden shadow-sm overflow-x-auto">
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
                {setupManaged.map((i) => {
                  const renderedSec = getRenderedSecondsForUser(i.id);
                  const requiredSec = (i.total_ojt_hours_required || 400) * 3600;
                  const remainingSec = Math.max(0, requiredSec - renderedSec);
                  return (
                    <tr key={i.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-sm text-gray-900">{i.full_name || '—'}</td>
                      <td className="px-4 py-3 text-sm text-gray-600">{i.email || '—'}</td>
                      <td className="px-4 py-3 text-sm text-gray-600">{i.role || '—'}</td>
                    <td className="px-4 py-3 text-sm text-green-600 font-medium">Setup</td>
                    <td className="px-4 py-3 text-sm">{formatScheduleTime(i.scheduled_time_in)}</td>
                    <td className="px-4 py-3 text-sm">{formatScheduleTime(i.scheduled_time_out)}</td>
                      <td className="px-4 py-3 text-sm">{i.total_ojt_hours_required ?? 400}</td>
                      <td className="px-4 py-3 text-sm">{formatHoursFromSeconds(renderedSec)}</td>
                      <td className="px-4 py-3 text-sm">{formatHoursFromSeconds(remainingSec)}</td>
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
                  );
                })}
                {notSetupManaged.map((i) => (
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
                ))}
              </tbody>
            </table>
            {managedUsers.length === 0 && !loading && (
              <p className="px-4 py-6 text-center text-gray-500">No users to manage.</p>
            )}
          </div>
        </>
      )}

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
