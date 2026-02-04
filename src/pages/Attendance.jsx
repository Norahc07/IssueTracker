import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useSupabase } from '../context/supabase.jsx';
import { toast } from 'react-hot-toast';
import { permissions } from '../utils/rolePermissions.js';
import { queryCache } from '../utils/queryCache.js';

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

export default function Attendance() {
  const { supabase, user, userRole } = useSupabase();
  const [myTeam, setMyTeam] = useState(null);
  const canEditMySchedule = permissions.canEditOwnAttendanceSchedule(userRole, myTeam);
  const canManageSchedules = permissions.canManageAttendanceSchedules(userRole, myTeam);

  const [loading, setLoading] = useState(true);
  const [mySchedule, setMySchedule] = useState(null);
  const [myScheduleSet, setMyScheduleSet] = useState(false);
  const [todayLog, setTodayLog] = useState(null);
  const [allLogs, setAllLogs] = useState([]);
  const [managedUsers, setManagedUsers] = useState([]);
  const [renderedMinutes, setRenderedMinutes] = useState(0);
  const [showSetScheduleModal, setShowSetScheduleModal] = useState(false);
  const [scheduleModalMode, setScheduleModalMode] = useState('self'); // 'self' | 'manage'
  const [setScheduleForm, setSetScheduleForm] = useState({
    user_id: '',
    scheduled_time_in: '09:00',
    scheduled_time_out: '18:00',
    total_ojt_hours_required: 400,
  });
  const [savingSchedule, setSavingSchedule] = useState(false);
  const [clocking, setClocking] = useState(false);

  const today = new Date().toISOString().slice(0, 10);

  useEffect(() => {
    if (user?.id) fetchPageData();
    else setLoading(false);
  }, [user?.id, canManageSchedules]);

  const fetchPageData = async () => {
    setLoading(true);
    try {
      // Profile/schedule (everyone)
      const { data: userData, error: userErr } = await supabase
        .from('users')
        .select('team, scheduled_time_in, scheduled_time_out, total_ojt_hours_required, schedule_configured_at')
        .eq('id', user.id)
        .single();

      if (userErr) console.warn('Attendance user profile fetch error:', userErr);
      setMyTeam(userData?.team ?? null);
      setMySchedule(userData ?? null);
      setMyScheduleSet(userData?.schedule_configured_at != null);

      // My logs
      const { data: logs, error: logsErr } = await supabase
        .from('attendance_logs')
        .select('*')
        .eq('user_id', user.id)
        .order('log_date', { ascending: false });
      if (logsErr) console.warn('Attendance logs fetch error:', logsErr);

      const list = Array.isArray(logs) ? logs : [];
      setAllLogs(list);
      setTodayLog(list.find((l) => l.log_date === today) || null);
      const totalRendered = list
        .filter((l) => l.rendered_minutes != null)
        .reduce((acc, l) => acc + (l.rendered_minutes || 0), 0);
      setRenderedMinutes(totalRendered);

      // Managed users + all logs for staff calculations
      if (canManageSchedules) {
        const { data: managed, error: managedErr } = await supabase
          .from('users')
          .select('id, email, full_name, role, team, scheduled_time_in, scheduled_time_out, total_ojt_hours_required, schedule_configured_at')
          .or('team.eq.monitoring,role.eq.monitoring_team')
          .order('full_name', { ascending: true });
        if (managedErr) console.warn('Attendance managed users fetch error:', managedErr);
        setManagedUsers(Array.isArray(managed) ? managed : []);

        const { data: all, error: allErr } = await supabase
          .from('attendance_logs')
          .select('*');
        if (allErr) console.warn('Attendance all logs fetch error:', allErr);
        const allList = Array.isArray(all) ? all : [];
        setAllLogs((prev) => (prev.length ? prev : allList));
      } else {
        setManagedUsers([]);
      }
    } catch (e) {
      console.error('Attendance fetch error:', e);
    } finally {
      setLoading(false);
    }
  };

  const getRenderedForUser = (userId) => {
    return (allLogs || [])
      .filter((l) => l.user_id === userId && l.rendered_minutes != null)
      .reduce((acc, l) => acc + (l.rendered_minutes || 0), 0);
  };

  const handleClockIn = async () => {
    if (!user?.id) return;
    setClocking(true);
    try {
      const now = new Date();
      // If schedule is not configured, we still allow time in and use the saved/default time for late computation.
      const scheduledInMinutes = timeStringToMinutes(mySchedule?.scheduled_time_in || '09:00');
      const clockInMinutes = now.getHours() * 60 + now.getMinutes();
      const isGrace = clockInMinutes >= scheduledInMinutes && clockInMinutes < scheduledInMinutes + GRACE_MINUTES;
      const isLate = clockInMinutes >= scheduledInMinutes + GRACE_MINUTES;

      const { error } = await supabase
        .from('attendance_logs')
        .upsert(
          {
            user_id: user.id,
            log_date: today,
            time_in: now.toISOString(),
            is_late: isLate,
            grace_period_notified: isGrace,
            updated_at: now.toISOString(),
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
    } catch (e) {
      console.error('Clock in error:', e);
      toast.error(e?.message || 'Failed to record time in.');
    } finally {
      setClocking(false);
    }
  };

  const handleClockOut = async () => {
    if (!user?.id || !todayLog?.time_in) {
      toast.error('No time in recorded for today.');
      return;
    }
    setClocking(true);
    try {
      const now = new Date();
      const timeIn = new Date(todayLog.time_in);
      const renderedMin = Math.round((now - timeIn) / 60000);

      const { error } = await supabase
        .from('attendance_logs')
        .update({
          time_out: now.toISOString(),
          rendered_minutes: renderedMin,
          updated_at: now.toISOString(),
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
      setSetScheduleForm({
        user_id: user?.id || '',
        scheduled_time_in: formatTime(mySchedule?.scheduled_time_in) || '09:00',
        scheduled_time_out: formatTime(mySchedule?.scheduled_time_out) || '18:00',
        total_ojt_hours_required: mySchedule?.total_ojt_hours_required ?? 400,
      });
      setShowSetScheduleModal(true);
      return;
    }

    // manage
    if (targetUser) {
      setSetScheduleForm({
        user_id: targetUser.id,
        scheduled_time_in: formatTime(targetUser.scheduled_time_in) || '09:00',
        scheduled_time_out: formatTime(targetUser.scheduled_time_out) || '18:00',
        total_ojt_hours_required: targetUser.total_ojt_hours_required ?? 400,
      });
    } else {
      setSetScheduleForm({
        user_id: '',
        scheduled_time_in: '09:00',
        scheduled_time_out: '18:00',
        total_ojt_hours_required: 400,
      });
    }
    setShowSetScheduleModal(true);
  };

  const handleSaveSchedule = async (e) => {
    e.preventDefault();
    const { user_id, scheduled_time_in, scheduled_time_out, total_ojt_hours_required } = setScheduleForm;
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
      const { error } = await supabase
        .from('users')
        .update({
          scheduled_time_in: toTime(scheduled_time_in),
          scheduled_time_out: toTime(scheduled_time_out),
          total_ojt_hours_required: Number(total_ojt_hours_required) || 400,
          schedule_configured_at: new Date().toISOString(),
        })
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
          Time in and out, rendered hours, and remaining hours
        </p>
      </div>

      {/* My attendance (all roles) */}
      {!myScheduleSet && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-amber-800">
          Your official schedule is not set yet. Time in/out will still work, but please confirm your official time frame with your supervisor/TL.
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="rounded-xl border-2 bg-white p-4 shadow-sm" style={{ borderColor: PRIMARY }}>
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Rendered hours</p>
          <p className="mt-1 text-2xl font-bold text-gray-900">{formatHours(renderedMinutes)}</p>
        </div>
        <div className="rounded-xl border-2 bg-white p-4 shadow-sm" style={{ borderColor: PRIMARY }}>
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Remaining hours</p>
          <p className="mt-1 text-2xl font-bold text-gray-900">
            {formatHours(Math.max(0, (mySchedule?.total_ojt_hours_required || 400) * 60 - renderedMinutes))}
          </p>
        </div>
      </div>

      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <p className="text-sm text-gray-600">
            Schedule: {formatTime(mySchedule?.scheduled_time_in || '09:00')} – {formatTime(mySchedule?.scheduled_time_out || '18:00')}{' '}
            (Required: {mySchedule?.total_ojt_hours_required ?? 400} hrs)
          </p>
          {canEditMySchedule && (
            <button
              type="button"
              onClick={() => handleOpenSetSchedule({ mode: 'self' })}
              className="px-3 py-2 rounded-lg text-sm font-medium text-white"
              style={{ backgroundColor: PRIMARY }}
            >
              Edit my schedule
            </button>
          )}
        </div>
        <div className="flex flex-wrap gap-3 pt-3">
          {!todayLog?.time_in && (
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
          {todayLog?.time_in && !todayLog?.time_out && (
            <button
              type="button"
              onClick={handleClockOut}
              disabled={clocking}
              className="px-4 py-2 rounded-lg font-medium text-white disabled:opacity-50"
              style={{ backgroundColor: PRIMARY }}
            >
              {clocking ? 'Recording…' : 'Time Out'}
            </button>
          )}
          {todayLog?.time_in && (
            <span className="text-gray-600 text-sm py-2">
              Today: In {new Date(todayLog.time_in).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              {todayLog.time_out ? ` · Out ${new Date(todayLog.time_out).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : ''}
            </span>
          )}
        </div>
      </div>

      {/* Monitoring TL/VTL management */}
      {canManageSchedules && (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => handleOpenSetSchedule({ mode: 'manage' })}
              className="px-4 py-2 rounded-lg text-sm font-medium text-white"
              style={{ backgroundColor: PRIMARY }}
            >
              Set schedule (Monitoring)
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
                  const rendered = getRenderedForUser(i.id);
                  const requiredMin = (i.total_ojt_hours_required || 400) * 60;
                  const remaining = Math.max(0, requiredMin - rendered);
                  return (
                    <tr key={i.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-sm text-gray-900">{i.full_name || '—'}</td>
                      <td className="px-4 py-3 text-sm text-gray-600">{i.email || '—'}</td>
                      <td className="px-4 py-3 text-sm text-gray-600">{i.role || '—'}</td>
                      <td className="px-4 py-3 text-sm text-green-600 font-medium">Setup</td>
                      <td className="px-4 py-3 text-sm">{formatTime(i.scheduled_time_in)}</td>
                      <td className="px-4 py-3 text-sm">{formatTime(i.scheduled_time_out)}</td>
                      <td className="px-4 py-3 text-sm">{i.total_ojt_hours_required ?? 400}</td>
                      <td className="px-4 py-3 text-sm">{formatHours(rendered)}</td>
                      <td className="px-4 py-3 text-sm">{formatHours(remaining)}</td>
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
              <p className="px-4 py-6 text-center text-gray-500">No monitoring users found.</p>
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
                      onChange={(e) => setSetScheduleForm((f) => ({ ...f, user_id: e.target.value }))}
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
