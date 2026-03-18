import { useEffect, useMemo, useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import * as XLSX from 'xlsx';
import { useSupabase } from '../context/supabase.jsx';
import { toast } from 'react-hot-toast';
import { permissions, getRoleDisplayName, ROLES, TEAMS } from '../utils/rolePermissions.js';
import { queryCache } from '../utils/queryCache.js';
import PrettyDatePicker from '../components/PrettyDatePicker.jsx';
import { notifyUser } from '../utils/notifications.js';
import { requestStatusPill } from '../utils/uiPills.js';

const PRIMARY = '#6795BE';
const PAGE_SIZE = 10;

// Map onboarding_records.team (e.g. 'Team Lead Assistant', 'Monitoring Team', 'PAT1', 'TLA', 'Monitoring') to users.team ('tla', 'monitoring', 'pat1')
function onboardingTeamToUserTeam(obTeam) {
  if (!obTeam) return '';
  const v = String(obTeam)
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ');
  if (v.includes('onboarding')) return TEAMS.TLA;
  if (v === 'tla' || v === 'team lead assistant' || v.includes('tla')) return TEAMS.TLA;
  if (v === 'monitoring' || v === 'monitoring team' || v === 'monitoring_team' || v.includes('monitoring')) {
    return TEAMS.MONITORING;
  }
  if (v === 'pat1' || v === 'pat 1' || v.includes('pat1')) {
    return TEAMS.PAT1;
  }
  return '';
}

function teamDisplayLabel(teamValue) {
  if (!teamValue) return '—';
  if (teamValue === TEAMS.TLA) return 'Team Lead Assistant';
  if (teamValue === TEAMS.MONITORING) return 'Monitoring';
  if (teamValue === TEAMS.PAT1) return 'PAT1';
  return teamValue;
}

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

/** Compact label: "Hhr(s) : Mmin(s)" (e.g. "1hr : 1min", "400hrs : 10 mins") */
function formatHoursMinutesCompact(totalSeconds) {
  if (totalSeconds == null || Number.isNaN(totalSeconds)) return '0hrs : 0 mins';
  const totalMinutes = Math.floor(totalSeconds / 60);
  const hrs = Math.floor(totalMinutes / 60);
  const mins = totalMinutes % 60;
  const hourLabel = hrs === 1 ? 'hr' : 'hrs';
  const minLabel = mins === 1 ? 'min' : 'mins';
  const minSpace = mins === 1 ? '' : ' ';
  return `${hrs}${hourLabel} : ${mins}${minSpace}${minLabel}`;
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

/** Date for export/display: "Month day, year" (e.g. March 11, 2025) */
function formatDateMonthDayYear(logDate) {
  if (!logDate) return '—';
  const d = typeof logDate === 'string' ? new Date(logDate + 'T12:00:00') : logDate;
  if (Number.isNaN(d.getTime())) return String(logDate);
  const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  return `${months[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

/** Short hours label for DTR export: "H hr | M mins" */
function formatHoursMinutesShort(totalSeconds) {
  if (totalSeconds == null || Number.isNaN(totalSeconds)) return '';
  const totalMinutes = Math.floor(totalSeconds / 60);
  const hrs = Math.floor(totalMinutes / 60);
  const mins = totalMinutes % 60;
  const hLabel = hrs === 1 ? 'hr' : 'hrs';
  const mLabel = mins === 1 ? 'min' : 'mins';
  return `${hrs} ${hLabel} | ${mins} ${mLabel}`;
}

// Apply styling, borders, column widths, and alignment to the DTR worksheet
function styleDtrSheet(ws, aoa) {
  if (!ws) return;

  // Auto-fit-like column widths (A-G) based on content length
  const colCount = 7;
  const baseWidths = [16, 14, 14, 18, 20, 16, 28];
  const maxWidths = Array(colCount).fill(0);

  if (Array.isArray(aoa)) {
    aoa.forEach((row) => {
      (row || []).forEach((val, cIdx) => {
        if (cIdx >= colCount) return;
        const s = String(val ?? '');
        if (!s) return;
        maxWidths[cIdx] = Math.max(maxWidths[cIdx], s.length);
      });
    });
  }

  ws['!cols'] = baseWidths.map((base, idx) => {
    const len = maxWidths[idx] || 0;
    // Rough heuristic: characters to Excel width units, clamped
    const wch = Math.min(Math.max(base, len + 2), 40);
    return { wch };
  });

  const center = { horizontal: 'center', vertical: 'center' };
  const left = { horizontal: 'left', vertical: 'center' };
  const wrap = { wrapText: true, vertical: 'center' };
  const bold = { bold: true };
  const border = {
    top: { style: 'thin', color: { rgb: 'FFCCCCCC' } },
    bottom: { style: 'thin', color: { rgb: 'FFCCCCCC' } },
    left: { style: 'thin', color: { rgb: 'FFCCCCCC' } },
    right: { style: 'thin', color: { rgb: 'FFCCCCCC' } },
  };

  const headerFill = { fgColor: { rgb: 'FFE5EEF7' }, patternType: 'solid' };
  const titleFill = { fgColor: { rgb: 'FF6795BE' }, patternType: 'solid' };
  const titleFont = { bold: true, color: { rgb: 'FFFFFFFF' }, sz: 14 };

  // Ensure a cell object exists
  const ensureCell = (r, c) => {
    const ref = XLSX.utils.encode_cell({ r, c });
    if (!ws[ref]) {
      ws[ref] = { t: 's', v: '' };
    }
    return ws[ref];
  };

  // Title row (row index 0, col 0)
  const titleCell = ensureCell(0, 0);
  titleCell.s = {
    alignment: center,
    font: titleFont,
    fill: titleFill,
  };

  // Meta rows: 3–6 (index 2–5)
  for (let r = 2; r <= 5; r += 1) {
    for (let c = 0; c <= 6; c += 1) {
      const cell = ws[XLSX.utils.encode_cell({ r, c })];
      if (!cell) continue;
      const isLabelCol = c === 0 || c === 4;
      const existing = cell.s || {};
      cell.s = {
        ...existing,
        alignment: isLabelCol ? left : left,
        font: isLabelCol ? { bold: true } : existing.font,
      };
    }
  }

  // Header row for table: row 8 (index 7)
  for (let c = 0; c <= 6; c += 1) {
    const cell = ensureCell(7, c);
    const existing = cell.s || {};
    cell.s = {
      ...existing,
      alignment: center,
      font: { ...(existing.font || {}), ...bold },
      fill: headerFill,
      border,
    };
  }

  // Data rows start at row 9 (index 8)
  const totalRows = Array.isArray(aoa) ? aoa.length : 0;
  for (let r = 8; r < totalRows; r += 1) {
    for (let c = 0; c <= 6; c += 1) {
      const cell = ensureCell(r, c);
      const isCenter = c === 0 || c === 1 || c === 2 || c === 3 || c === 5;
      const isRemarks = c === 6;
      const existing = cell.s || {};
      cell.s = {
        ...existing,
        alignment: isRemarks ? wrap : isCenter ? center : left,
        border,
      };
    }
  }
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
  const [onboardingRecords, setOnboardingRecords] = useState([]);
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
  const [liveTotalsTick, setLiveTotalsTick] = useState(0);
  const timerRef = useRef(null);
  const [logDateFilter, setLogDateFilter] = useState('all'); // 'all' | 'today' | '7' | '30'
  const [attendanceTab, setAttendanceTab] = useState('my-log'); // 'my-log' | 'all-interns' | 'schedules'
  const [pageMyLog, setPageMyLog] = useState(1);
  const [pageAllInterns, setPageAllInterns] = useState(1);
  const [pageTotalHours, setPageTotalHours] = useState(1);
  const [pageSchedules, setPageSchedules] = useState(1);
  const [myLogDateFilter, setMyLogDateFilter] = useState('all'); // 'all' | 'today' | '7' | '30' | 'specific'
  const [myLogSpecificDate, setMyLogSpecificDate] = useState('');
  const [allInternsRoleFilter, setAllInternsRoleFilter] = useState('');
  const [allInternsLateFilter, setAllInternsLateFilter] = useState('all'); // 'all' | 'late' | 'on-time'
  const [totalHoursRoleFilter, setTotalHoursRoleFilter] = useState('');
  const [totalHoursTeamFilter, setTotalHoursTeamFilter] = useState('');
  const [scheduleRoleFilter, setScheduleRoleFilter] = useState('');
  const [logSpecificDate, setLogSpecificDate] = useState(''); // for logDateFilter === 'specific' (all-interns tab)

  // Import attendance modal
  const [showImportModal, setShowImportModal] = useState(false);
  const [importForUserId, setImportForUserId] = useState('');
  const [importLoading, setImportLoading] = useState(false);
  const [importError, setImportError] = useState('');

  // Late reason / late request modal and state
  const [lateReasonModalLog, setLateReasonModalLog] = useState(null); // { user_id, log_date, late_reason?, is_late }
  const [lateReasonText, setLateReasonText] = useState('');
  const [savingLateReason, setSavingLateReason] = useState(false);
  const [myLateRequests, setMyLateRequests] = useState([]);
  const [lateRequests, setLateRequests] = useState([]); // for managers: pending late requests
  const [lateRequestsLoading, setLateRequestsLoading] = useState(false);

  // DTR Request modal state (interns)
  const [showDtrRequestModal, setShowDtrRequestModal] = useState(false);
  const [dtrFromDate, setDtrFromDate] = useState('');
  const [dtrToDate, setDtrToDate] = useState('');
  const [dtrReason, setDtrReason] = useState('');
  const [submittingDtr, setSubmittingDtr] = useState(false);

  // Intern-side DTR request history
  const [myDtrRequests, setMyDtrRequests] = useState([]);
  const [myDtrRequestsLoading, setMyDtrRequestsLoading] = useState(false);

  // DTR Requests management (admin / monitoring TL/VTL)
  const [dtrRequests, setDtrRequests] = useState([]);
  const [dtrRequestsLoading, setDtrRequestsLoading] = useState(false);
  const [dtrSelected, setDtrSelected] = useState(null);
  const [dtrLogs, setDtrLogs] = useState([]);
  const [dtrLogsLoading, setDtrLogsLoading] = useState(false);

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

  // Live totals for managers: add running segment seconds per user (today only)
  const liveActiveSecondsByUserId = useMemo(() => {
    // Depend on ticks so this recomputes while sessions are active
    void timerTick;
    void liveTotalsTick;
    if (!canViewAllAttendanceLogs || !allLogsWithUsers.length) return {};
    const map = {};
    const now = Date.now();
    for (const log of allLogsWithUsers) {
      if (!log || log.log_date !== today) continue;
      if (!isClockedIn(log)) continue;
      const seg = getSegments(log);
      const last = seg.length ? seg[seg.length - 1] : null;
      const startIso = last?.time_in || log.time_in;
      const startMs = startIso ? new Date(startIso).getTime() : 0;
      if (!startMs) continue;
      map[log.user_id] = Math.max(0, Math.floor((now - startMs) / 1000));
    }
    return map;
  }, [allLogsWithUsers, canViewAllAttendanceLogs, today, timerTick, liveTotalsTick]);

  const hasAnyActiveSessions = useMemo(() => {
    if (!canViewAllAttendanceLogs || !allLogsWithUsers.length) return false;
    return allLogsWithUsers.some((l) => l && l.log_date === today && isClockedIn(l));
  }, [allLogsWithUsers, canViewAllAttendanceLogs, today]);

  // Re-render totals periodically while any intern is clocked in (managers view)
  useEffect(() => {
    if (!canViewAllAttendanceLogs || !hasAnyActiveSessions) return;
    const id = setInterval(() => setLiveTotalsTick((t) => t + 1), 10_000);
    return () => clearInterval(id);
  }, [canViewAllAttendanceLogs, hasAnyActiveSessions]);

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

  const handleOpenDtrRequest = () => {
    const todayStr = new Date().toISOString().slice(0, 10);
    setDtrFromDate(todayStr);
    setDtrToDate(todayStr);
    setDtrReason('');
    setShowDtrRequestModal(true);
  };

  const handleSubmitDtrRequest = async (e) => {
    e?.preventDefault?.();
    if (!user?.id || !supabase) return;
    const from = (dtrFromDate || '').trim();
    const to = (dtrToDate || '').trim();
    if (!from || !to) {
      toast.error('Please select a from and to date for your DTR request.');
      return;
    }
    if (from > to) {
      toast.error('“From” date cannot be after “To” date.');
      return;
    }
    setSubmittingDtr(true);
    try {
      const payload = {
        user_id: user.id,
        requested_by_email: user.email || null,
        date_from: from,
        date_to: to,
        reason: dtrReason?.trim() || null,
        status: 'pending',
      };
      const { error } = await supabase.from('dtr_requests').insert(payload);
      if (error) throw error;
      toast.success('DTR request submitted. Monitoring / TLA will process it.');
      setShowDtrRequestModal(false);
      // Refresh intern's own list
      try {
        const { data, error } = await supabase
          .from('dtr_requests')
          .select('*')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
          .limit(50);
        if (!error && Array.isArray(data)) {
          setMyDtrRequests(data);
        }
      } catch {
        // ignore – not critical
      }
    } catch (err) {
      console.error('DTR request error:', err);
      toast.error(err?.message || 'Failed to submit DTR request. Please contact monitoring if this persists.');
    } finally {
      setSubmittingDtr(false);
    }
  };

  // Load DTR requests for managers (admin + monitoring TL/VTL via canManageSchedules)
  useEffect(() => {
    if (!supabase || !canManageSchedules) return;
    const load = async () => {
      setDtrRequestsLoading(true);
      try {
        const { data, error } = await supabase
          .from('dtr_requests')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(200);
        if (error) throw error;
        setDtrRequests(Array.isArray(data) ? data : []);
      } catch (e) {
        console.warn('DTR requests fetch error:', e);
        toast.error(e?.message || 'Failed to load DTR requests.');
      } finally {
        setDtrRequestsLoading(false);
      }
    };
    load();
  }, [supabase, canManageSchedules]);

  const refreshDtrRequests = async () => {
    if (!supabase || !canManageSchedules) return;
    try {
      const { data, error } = await supabase
        .from('dtr_requests')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(200);
      if (error) throw error;
      setDtrRequests(Array.isArray(data) ? data : []);
    } catch (e) {
      console.warn('DTR requests refresh error:', e);
    }
  };

  const handleViewDtrForRequest = async (req) => {
    if (!supabase || !req?.user_id || !req.date_from || !req.date_to) return;
    setDtrSelected(req);
    setDtrLogs([]);
    setDtrLogsLoading(true);
    try {
      const { data, error } = await supabase
        .from('attendance_logs')
        .select('*')
        .eq('user_id', req.user_id)
        .gte('log_date', req.date_from)
        .lte('log_date', req.date_to)
        .order('log_date', { ascending: true });
      if (error) throw error;
      setDtrLogs(Array.isArray(data) ? data : []);
    } catch (e) {
      console.warn('DTR logs fetch error:', e);
      toast.error(e?.message || 'Failed to load DTR logs for this request.');
    } finally {
      setDtrLogsLoading(false);
    }
  };

  const handleUpdateDtrStatus = async (req, status) => {
    if (!supabase || !req?.id) return;
    try {
      const payload = {
        status,
        reviewed_by: user?.email || null,
        reviewed_at: new Date().toISOString(),
      };
      const { error } = await supabase
        .from('dtr_requests')
        .update(payload)
        .eq('id', req.id);
      if (error) throw error;
      toast.success(`DTR request ${status === 'approved' ? 'approved' : 'rejected'}.`);
      await refreshDtrRequests();
      if (dtrSelected?.id === req.id) {
        setDtrSelected((prev) => (prev ? { ...prev, ...payload } : prev));
      }
    } catch (e) {
      console.error('DTR status update error:', e);
      toast.error(e?.message || 'Failed to update DTR request status.');
    }
  };

  const handleDownloadDtrCsv = () => {
    if (!dtrSelected || !dtrLogs || dtrLogs.length === 0) {
      toast.error('No DTR data to download.');
      return;
    }
    const userForDtr = usersById[dtrSelected.user_id];
    const name = getUserDisplayName(userForDtr);
    const periodCovered = `${formatDateMonthDayYear(dtrSelected.date_from)} to ${formatDateMonthDayYear(dtrSelected.date_to)}`;
    const daysPresent = dtrLogs.length;
    const headerRow = ['Daily Time Record (DTR)', '', '', '', '', '', ''];

    // Meta rows formatted for Excel-style merging (values in B, F, with C/D/G left blank)
    const row3 = ['Name:', name || '', '', '', 'No. of Days Absent:', '', ''];
    const row4 = [
      'Position:',
      getRoleDisplayName(userForDtr?.role) || '',
      '',
      '',
      'No. of Days Present:',
      String(daysPresent),
      '',
    ];
    const row5 = [
      'Team Department:',
      getUserTeam(userForDtr) || '',
      '',
      '',
      'No. of Hours Undertime:',
      '',
      '',
    ];
    const row6 = ['Period Covered:', periodCovered, '', '', '', '', ''];

    const columnsHeader = [
      'Date',
      'Time In',
      'Time Out',
      'No. of Hours',
      'No. of Working Hours',
      'Hours Overtime',
      'Remarks/Signature',
    ];

    const rows = dtrLogs.map((log) => {
      const seg = getSegments(log);
      const firstInLog = seg.length > 0 ? seg[0].time_in : log.time_in;
      const latestInLog = seg.length > 0 ? seg[seg.length - 1].time_in : log.time_in;
      const lastOutLog = seg.length > 0 ? seg[seg.length - 1].time_out : log.time_out;
      const totalSec = getLogRenderedSeconds(log);
      const hoursLabel = formatHoursMinutesShort(totalSec);
      return [
        formatDateMonthDayYear(log.log_date),
        firstInLog ? formatTimeHHMM(firstInLog) : '',
        lastOutLog ? formatTimeHHMM(lastOutLog) : '',
        hoursLabel,
        '', // No. of Working Hours
        '', // Hours Overtime
        log.is_late ? 'Late' : '',
      ];
    });
    const aoa = [headerRow, [], row3, row4, row5, row6, [], columnsHeader, ...rows];
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    // Merges for header/meta rows:
    // Row 1: A1-G1
    // Row 3-5: B-D and F-G, Row 6: B-D
    ws['!merges'] = [
      // Row 1
      { s: { r: 0, c: 0 }, e: { r: 0, c: 6 } },
      // Row 3 (index 2)
      { s: { r: 2, c: 1 }, e: { r: 2, c: 3 } },
      { s: { r: 2, c: 5 }, e: { r: 2, c: 6 } },
      // Row 4 (index 3)
      { s: { r: 3, c: 1 }, e: { r: 3, c: 3 } },
      { s: { r: 3, c: 5 }, e: { r: 3, c: 6 } },
      // Row 5 (index 4)
      { s: { r: 4, c: 1 }, e: { r: 4, c: 3 } },
      { s: { r: 4, c: 5 }, e: { r: 4, c: 6 } },
      // Row 6 (index 5)
      { s: { r: 5, c: 1 }, e: { r: 5, c: 3 } },
    ];
    styleDtrSheet(ws, aoa);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'DTR');
    const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    const blob = new Blob([wbout], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'DTR.xlsx';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const [myDtrSelected, setMyDtrSelected] = useState(null);
  const [myDtrLogs, setMyDtrLogs] = useState([]);
  const [myDtrLogsLoading, setMyDtrLogsLoading] = useState(false);

  // Quick self-DTR generator for Monitoring TL/VTL
  const [selfDtrFrom, setSelfDtrFrom] = useState('');
  const [selfDtrTo, setSelfDtrTo] = useState('');
  const [selfDtrGenerating, setSelfDtrGenerating] = useState(false);

  const handleViewMyDtr = async (req) => {
    if (!supabase || !user?.id || !req) return;
    setMyDtrSelected(req);
    setMyDtrLogs([]);
    setMyDtrLogsLoading(true);
    try {
      const { data, error } = await supabase
        .from('attendance_logs')
        .select('*')
        .eq('user_id', user.id)
        .gte('log_date', req.date_from)
        .lte('log_date', req.date_to)
        .order('log_date', { ascending: true });
      if (error) throw error;
      setMyDtrLogs(Array.isArray(data) ? data : []);
    } catch (e) {
      console.warn('My DTR logs fetch error:', e);
      toast.error(e?.message || 'Failed to load your DTR data for this request.');
    } finally {
      setMyDtrLogsLoading(false);
    }
  };

  const handleDownloadMyDtrCsv = () => {
    if (!myDtrSelected || !myDtrLogs || myDtrLogs.length === 0) {
      toast.error('No DTR data to download for this request.');
      return;
    }
    const headerRow = ['Daily Time Record (DTR)', '', '', '', '', '', ''];
    const name = user?.user_metadata?.full_name || user?.email || '';
    const periodCovered = `${formatDateMonthDayYear(myDtrSelected.date_from)} to ${formatDateMonthDayYear(myDtrSelected.date_to)}`;
    const daysPresent = myDtrLogs.length;

    const row3 = ['Name:', name, '', '', 'No. of Days Absent:', '', ''];
    const row4 = [
      'Position:',
      getRoleDisplayName(userRole) || '',
      '',
      '',
      'No. of Days Present:',
      String(daysPresent),
      '',
    ];
    const row5 = ['Team Department:', myTeam || '', '', '', 'No. of Hours Undertime:', '', ''];
    const row6 = ['Period Covered:', periodCovered, '', '', '', '', ''];

    const columnsHeader = [
      'Date',
      'Time In',
      'Time Out',
      'No. of Hours',
      'No. of Working Hours',
      'Hours Overtime',
      'Remarks/Signature',
    ];

    const rows = myDtrLogs.map((log) => {
      const seg = getSegments(log);
      const firstInLog = seg.length > 0 ? seg[0].time_in : log.time_in;
      const latestInLog = seg.length > 0 ? seg[seg.length - 1].time_in : log.time_in;
      const lastOutLog = seg.length > 0 ? seg[seg.length - 1].time_out : log.time_out;
      const totalSec = getLogRenderedSeconds(log);
      const hoursLabel = formatHoursMinutesShort(totalSec);
      return [
        formatDateMonthDayYear(log.log_date),
        firstInLog ? formatTimeHHMM(firstInLog) : '',
        lastOutLog ? formatTimeHHMM(lastOutLog) : '',
        hoursLabel,
        '', // No. of Working Hours
        '', // Hours Overtime
        log.is_late ? 'Late' : '',
      ];
    });
    const aoa = [headerRow, [], row3, row4, row5, row6, [], columnsHeader, ...rows];
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws['!merges'] = [
      // Row 1
      { s: { r: 0, c: 0 }, e: { r: 0, c: 6 } },
      // Row 3 (index 2)
      { s: { r: 2, c: 1 }, e: { r: 2, c: 3 } },
      { s: { r: 2, c: 5 }, e: { r: 2, c: 6 } },
      // Row 4 (index 3)
      { s: { r: 3, c: 1 }, e: { r: 3, c: 3 } },
      { s: { r: 3, c: 5 }, e: { r: 3, c: 6 } },
      // Row 5 (index 4)
      { s: { r: 4, c: 1 }, e: { r: 4, c: 3 } },
      { s: { r: 4, c: 5 }, e: { r: 4, c: 6 } },
      // Row 6 (index 5)
      { s: { r: 5, c: 1 }, e: { r: 5, c: 3 } },
    ];
    styleDtrSheet(ws, aoa);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'DTR');
    const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    const blob = new Blob([wbout], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'DTR.xlsx';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const canQuickGenerateSelfDtr =
    (userRole === ROLES.TL || userRole === ROLES.VTL) &&
    String(myTeam || '').toLowerCase() === 'monitoring';

  const handleGenerateSelfDtr = async () => {
    if (!supabase || !user?.id) return;
    const from = (selfDtrFrom || '').trim();
    const to = (selfDtrTo || '').trim();
    if (!from || !to) {
      toast.error('Please select both From and To dates for your DTR.');
      return;
    }
    if (from > to) {
      toast.error('“From” date cannot be after “To” date.');
      return;
    }
    setSelfDtrGenerating(true);
    setMyDtrSelected({
      id: `self-${from}-${to}`,
      user_id: user.id,
      date_from: from,
      date_to: to,
      status: 'generated',
      reason: 'Quick self DTR (Monitoring TL/VTL)',
    });
    setMyDtrLogs([]);
    try {
      const { data, error } = await supabase
        .from('attendance_logs')
        .select('*')
        .eq('user_id', user.id)
        .gte('log_date', from)
        .lte('log_date', to)
        .order('log_date', { ascending: true });
      if (error) throw error;
      setMyDtrLogs(Array.isArray(data) ? data : []);
    } catch (e) {
      console.warn('Quick self DTR logs fetch error:', e);
      toast.error(e?.message || 'Failed to load your DTR data for this range.');
    } finally {
      setSelfDtrGenerating(false);
    }
  };

  // --- Attendance Import/Export ---
  /** Build rows for export: Date (Month day, year), First in, Latest in, Latest out, Rendered time, Late; optional Name, Email, Role for "all" view */
  function buildExportRows(logs, forAll = false) {
    return logs.map((log) => {
      const seg = getSegments(log);
      const firstInLog = seg.length > 0 ? seg[0].time_in : log.time_in;
      const latestInLog = seg.length > 0 ? seg[seg.length - 1].time_in : log.time_in;
      const lastOutLog = seg.length > 0 ? seg[seg.length - 1].time_out : log.time_out;
      const isTodayRow = log.log_date === today && log.user_id === user?.id && isClockedIn(log);
      const dayTotalSec = getLogRenderedSeconds(log) + (isTodayRow ? currentSegmentSeconds : 0);
      const hasRendered = (log.total_rendered_seconds != null || log.rendered_seconds != null || log.rendered_minutes != null) || isTodayRow;
      const u = forAll ? usersById[log.user_id] || {} : null;
      const row = {
        Date: formatDateMonthDayYear(log.log_date),
        'First in': firstInLog ? formatTimeHHMM(firstInLog) : '',
        'Latest in': latestInLog ? formatTimeHHMM(latestInLog) : '',
        'Latest out': lastOutLog ? formatTimeHHMM(lastOutLog) : '',
        'Rendered time': hasRendered ? formatHoursMinutesLabel(dayTotalSec) : '',
        Late: log.is_late ? 'Yes' : '',
        Reason: (log.late_reason || '').trim() || '',
      };
      if (forAll && u) {
        row.Name = u.full_name || '—';
        row.Email = u.email || '—';
        row.Role = getRoleDisplayName(u.role) || '—';
        return { Name: row.Name, Email: row.Email, Role: row.Role, ...row };
      }
      return row;
    });
  }

  const handleExportAttendanceCSV = (forAll = false) => {
    const logs = forAll ? filteredAttendanceLogs : filteredMyLogs;
    if (!logs.length) {
      toast.error('No records to export.');
      return;
    }
    const rows = buildExportRows(logs, forAll);
    const headers = forAll ? ['Name', 'Email', 'Role', 'Date', 'First in', 'Latest in', 'Latest out', 'Rendered time', 'Late', 'Reason'] : ['Date', 'First in', 'Latest in', 'Latest out', 'Rendered time', 'Late', 'Reason'];
    const csvLines = [
      headers.join(','),
      ...rows.map((r) =>
        headers.map((h) => {
          const v = r[h];
          const s = String(v ?? '');
          if (s.includes(',') || s.includes('"') || s.includes('\n')) return `"${s.replace(/"/g, '""')}"`;
          return s;
        }).join(',')
      ),
    ].join('\r\n');
    const blob = new Blob([csvLines], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = forAll ? `attendance_all_${today}.csv` : `attendance_my_${today}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success('Export downloaded.');
  };

  const handleExportAttendanceExcel = (forAll = false) => {
    const logs = forAll ? filteredAttendanceLogs : filteredMyLogs;
    if (!logs.length) {
      toast.error('No records to export.');
      return;
    }
    const rows = buildExportRows(logs, forAll);
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Attendance');
    XLSX.writeFile(wb, forAll ? `attendance_all_${today}.xlsx` : `attendance_my_${today}.xlsx`);
    toast.success('Export downloaded.');
  };

  /** Parse time string to minutes since midnight (e.g. "9:00 AM", "09:00") */
  function parseTimeToMinutes(str) {
    if (str == null || String(str).trim() === '') return null;
    const s = String(str).trim();
    const ampmMatch = s.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i);
    if (ampmMatch) {
      let h = parseInt(ampmMatch[1], 10);
      const m = parseInt(ampmMatch[2], 10) || 0;
      const ampm = (ampmMatch[3] || '').toUpperCase();
      if (ampm === 'PM' && h < 12) h += 12;
      if (ampm === 'AM' && h === 12) h = 0;
      return h * 60 + m;
    }
    const parts = s.split(':').map(Number);
    if (parts.length >= 2) {
      const h = parts[0] || 0;
      const m = parts[1] || 0;
      return (h % 24) * 60 + m;
    }
    return null;
  }

  /** Parse rendered time to seconds: "2.5" (hours), "2 hours : 30 mins", "150" (minutes) */
  function parseRenderedToSeconds(str) {
    if (str == null || String(str).trim() === '') return 0;
    const s = String(str).trim();
    const hoursMinsMatch = s.match(/(\d+)\s*hours?\s*:\s*(\d+)\s*mins?/i);
    if (hoursMinsMatch) {
      const h = parseInt(hoursMinsMatch[1], 10) || 0;
      const m = parseInt(hoursMinsMatch[2], 10) || 0;
      return (h * 3600) + (m * 60);
    }
    const num = parseFloat(s);
    if (!Number.isNaN(num)) {
      if (num < 24) return Math.round(num * 3600); // assume hours
      return Math.round(num * 60); // assume minutes if >= 24
    }
    return 0;
  }

  /** Parse date string to YYYY-MM-DD */
  function parseDateToYMD(str) {
    if (str == null || String(str).trim() === '') return null;
    const s = String(str).trim();
    const d = new Date(s);
    if (!Number.isNaN(d.getTime())) {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${y}-${m}-${day}`;
    }
    const isoMatch = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (isoMatch) return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;
    return null;
  }

  /** Read file (CSV or Excel), return array of { log_date, firstInIso, latestOutIso, total_rendered_seconds, is_late } */
  async function parseImportFile(file) {
    const name = (file.name || '').toLowerCase();
    const isCsv = name.endsWith('.csv');
    let data = [];
    if (isCsv) {
      const text = await file.text();
      const wb = XLSX.read(text, { type: 'string', raw: false });
      const sh = wb.Sheets[wb.SheetNames[0]];
      data = XLSX.utils.sheet_to_json(sh, { header: 1, defval: '' });
    } else {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: 'array' });
      const sh = wb.Sheets[wb.SheetNames[0]];
      data = XLSX.utils.sheet_to_json(sh, { header: 1, defval: '' });
    }
    const rows = [];
    if (!data.length || data.length < 2) return rows;
    const headerRow = (data[0] || []).map((h) => String(h ?? '').toLowerCase().trim().replace(/\s+/g, '_'));
    for (let i = 1; i < data.length; i++) {
      const values = data[i] || [];
      const row = {};
      headerRow.forEach((h, j) => { row[h] = values[j] ?? ''; });
      rows.push(row);
    }
    const normalize = (r) => {
      const date = r.date ?? r.log_date ?? r['log_date'] ?? '';
      const firstIn = r.first_in ?? r['first_in'] ?? r.firstin ?? r['first in'] ?? '';
      const latestIn = r.latest_in ?? r['latest_in'] ?? r.latestin ?? r['latest in'] ?? '';
      const latestOut = r.latest_out ?? r['latest_out'] ?? r.latestout ?? r['latest out'] ?? '';
      const rendered = r.rendered_time ?? r['rendered_time'] ?? r.renderedtime ?? r['rendered time'] ?? r.rendered ?? '';
      const late = r.late ?? r.is_late ?? '';
      const reason = r.reason ?? r.late_reason ?? r['late_reason'] ?? r['reason'] ?? '';
      return { date, firstIn, latestIn, latestOut, rendered, late, reason };
    };
    const parsed = rows.map((r) => {
      const n = normalize(r);
      const ymd = parseDateToYMD(n.date);
      if (!ymd) return null;
      const [y, m, d] = ymd.split('-').map(Number);
      const firstMin = parseTimeToMinutes(n.firstIn);
      const outMin = parseTimeToMinutes(n.latestOut) ?? parseTimeToMinutes(n.latestIn);
      const timeIn = firstMin != null ? new Date(y, m - 1, d, Math.floor(firstMin / 60), firstMin % 60) : new Date(y, m - 1, d, 9, 0);
      const timeOut = outMin != null ? new Date(y, m - 1, d, Math.floor(outMin / 60), outMin % 60) : new Date(y, m - 1, d, 18, 0);
      const totalSec = parseRenderedToSeconds(n.rendered);
      const isLate = /^(1|yes|true|late)$/i.test(String(n.late).trim());
      return {
        log_date: ymd,
        firstInIso: timeIn.toISOString(),
        latestOutIso: timeOut.toISOString(),
        total_rendered_seconds: totalSec > 0 ? totalSec : Math.floor((timeOut.getTime() - timeIn.getTime()) / 1000),
        is_late: isLate,
        late_reason: (String(n.reason || '').trim()) || null,
      };
    }).filter(Boolean);
    return parsed;
  }

  const handleOpenImportModal = () => {
    setImportError('');
    setImportForUserId(user?.id || '');
    setShowImportModal(true);
  };

  const handleImportSubmit = async (e) => {
    e?.preventDefault?.();
    const fileInput = document.getElementById('attendance-import-file');
    const file = fileInput?.files?.[0];
    if (!file) {
      setImportError('Please select a file (CSV or Excel).');
      return;
    }
    const targetUserId = (canViewAllAttendanceLogs && importForUserId) ? importForUserId : user?.id;
    if (!targetUserId || !supabase) {
      setImportError('Invalid user.');
      return;
    }
    setImportLoading(true);
    setImportError('');
    try {
      const parsed = await parseImportFile(file);
      if (!parsed.length) {
        setImportError('No valid rows found. Expected columns: date, first in, latest in, latest out, rendered time, late.');
        setImportLoading(false);
        return;
      }
      const nowIso = new Date().toISOString();
      for (const row of parsed) {
        const payload = {
          user_id: targetUserId,
          log_date: row.log_date,
          time_in: row.firstInIso,
          time_out: row.latestOutIso,
          segments: [{ time_in: row.firstInIso, time_out: row.latestOutIso }],
          total_rendered_seconds: row.total_rendered_seconds,
          rendered_seconds: row.total_rendered_seconds,
          rendered_minutes: Math.round(row.total_rendered_seconds / 60),
          is_late: row.is_late,
          late_reason: row.late_reason || null,
          updated_at: nowIso,
        };
        const { error } = await supabase.from('attendance_logs').upsert(payload, { onConflict: 'user_id,log_date' });
        if (error) throw error;
      }
      queryCache.invalidate('attendance');
      await fetchPageData();
      setShowImportModal(false);
      fileInput.value = '';
      toast.success(`Imported ${parsed.length} attendance record(s).`);
    } catch (err) {
      console.error('Import error:', err);
      setImportError(err?.message || 'Import failed.');
      toast.error(err?.message || 'Import failed.');
    } finally {
      setImportLoading(false);
    }
  };

  // --- Late reason & late requests ---
  const handleOpenLateReasonModal = (log) => {
    setLateReasonModalLog({
      user_id: log.user_id,
      log_date: log.log_date,
      late_reason: log.late_reason,
      is_late: log.is_late,
    });
    const pending = myLateRequests.find((r) => r.log_date === log.log_date && r.user_id === log.user_id);
    setLateReasonText(log.late_reason || pending?.reason || '');
  };

  const handleSaveLateReason = async (e) => {
    e?.preventDefault?.();
    if (!supabase || !lateReasonModalLog || savingLateReason) return;
    setSavingLateReason(true);
    try {
      const { error } = await supabase
        .from('attendance_logs')
        .update({ late_reason: (lateReasonText || '').trim() || null, updated_at: new Date().toISOString() })
        .eq('user_id', lateReasonModalLog.user_id)
        .eq('log_date', lateReasonModalLog.log_date);
      if (error) throw error;
      queryCache.invalidate('attendance');
      await fetchPageData();
      setLateReasonModalLog(null);
      setLateReasonText('');
      toast.success('Reason saved.');
    } catch (err) {
      toast.error(err?.message || 'Failed to save reason.');
    } finally {
      setSavingLateReason(false);
    }
  };

  const handleSubmitLateRequest = async (e) => {
    e?.preventDefault?.();
    if (!supabase || !user?.id || !lateReasonModalLog || savingLateReason) return;
    const reason = (lateReasonText || '').trim();
    if (!reason) {
      toast.error('Please enter a reason.');
      return;
    }
    setSavingLateReason(true);
    try {
      const { error } = await supabase
        .from('late_requests')
        .upsert(
          {
            user_id: lateReasonModalLog.user_id,
            log_date: lateReasonModalLog.log_date,
            reason,
            status: 'pending',
            reviewed_by: null,
            reviewed_at: null,
          },
          { onConflict: 'user_id,log_date' }
        );
      if (error) throw error;
      setLateReasonModalLog(null);
      setLateReasonText('');
      toast.success('Late reason submitted for approval.');
      loadMyLateRequests();
      if (canManageSchedules) loadLateRequests();
    } catch (err) {
      toast.error(err?.message || 'Failed to submit.');
    } finally {
      setSavingLateReason(false);
    }
  };

  const loadMyLateRequests = async () => {
    if (!supabase || !user?.id) return;
    const { data } = await supabase.from('late_requests').select('*').eq('user_id', user.id).order('created_at', { ascending: false });
    setMyLateRequests(Array.isArray(data) ? data : []);
  };

  const loadLateRequests = async () => {
    if (!supabase || !canManageSchedules) return;
    setLateRequestsLoading(true);
    try {
      const { data, error } = await supabase
        .from('late_requests')
        .select('*')
        .eq('status', 'pending')
        .order('created_at', { ascending: false });
      if (error) throw error;
      setLateRequests(Array.isArray(data) ? data : []);
    } catch (e) {
      console.warn('Late requests fetch error:', e);
    } finally {
      setLateRequestsLoading(false);
    }
  };

  const handleApproveLateRequest = async (req) => {
    if (!supabase || !user?.id) return;
    try {
      const nowIso = new Date().toISOString();
      const { error: updateReq } = await supabase
        .from('late_requests')
        .update({ status: 'approved', reviewed_by: user.id, reviewed_at: nowIso })
        .eq('id', req.id);
      if (updateReq) throw updateReq;
      const { error: updateLog } = await supabase
        .from('attendance_logs')
        .update({ late_reason: req.reason, updated_at: nowIso })
        .eq('user_id', req.user_id)
        .eq('log_date', req.log_date);
      if (updateLog) throw updateLog;
      queryCache.invalidate('attendance');
      await fetchPageData();
      loadLateRequests();
      // Notify requester
      try {
        await notifyUser(supabase, {
          recipient_user_id: req.user_id,
          sender_user_id: user.id,
          type: 'late_request_approved',
          title: 'Late reason approved',
          body: `Your late reason for ${formatDateMonthDayYear(req.log_date)} was approved.`,
          context_date: req.log_date,
          metadata: { log_date: req.log_date },
        });
      } catch (notifyErr) {
        console.warn('Late approve notify error:', notifyErr);
      }
      toast.success('Late request approved and linked to attendance.');
    } catch (err) {
      toast.error(err?.message || 'Failed to approve.');
    }
  };

  const handleRejectLateRequest = async (req) => {
    if (!supabase || !user?.id) return;
    try {
      const nowIso = new Date().toISOString();
      const { error } = await supabase
        .from('late_requests')
        .update({ status: 'rejected', reviewed_by: user.id, reviewed_at: nowIso })
        .eq('id', req.id);
      if (error) throw error;
      loadLateRequests();
      // Notify requester
      try {
        await notifyUser(supabase, {
          recipient_user_id: req.user_id,
          sender_user_id: user.id,
          type: 'late_request_rejected',
          title: 'Late reason rejected',
          body: `Your late reason for ${formatDateMonthDayYear(req.log_date)} was rejected.`,
          context_date: req.log_date,
          metadata: { log_date: req.log_date },
        });
      } catch (notifyErr) {
        console.warn('Late reject notify error:', notifyErr);
      }
      toast.success('Late request rejected.');
    } catch (err) {
      toast.error(err?.message || 'Failed to reject.');
    }
  };

  useEffect(() => {
    if (supabase && canClockInOut && user?.id) loadMyLateRequests();
  }, [supabase, canClockInOut, user?.id]);

  useEffect(() => {
    if (supabase && canManageSchedules) loadLateRequests();
  }, [supabase, canManageSchedules]);

  // Load intern's own DTR requests history
  useEffect(() => {
    if (!supabase || !canClockInOut || !user?.id) return;
    const loadMine = async () => {
      setMyDtrRequestsLoading(true);
      try {
        const { data, error } = await supabase
          .from('dtr_requests')
          .select('*')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
          .limit(50);
        if (error) throw error;
        setMyDtrRequests(Array.isArray(data) ? data : []);
      } catch (e) {
        console.warn('My DTR requests fetch error:', e);
      } finally {
        setMyDtrRequestsLoading(false);
      }
    };
    loadMine();
  }, [supabase, canClockInOut, user?.id]);

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
          supabase.from('users').select('id, full_name, email, role, team, imported_rendered_minutes, total_ojt_hours_required'),
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
        const [managedRes, onboardingRes] = await Promise.all([
          supabase
            .from('users')
            .select('id, email, full_name, role, team, scheduled_time_in, scheduled_time_out, total_ojt_hours_required, schedule_configured_at, imported_rendered_minutes')
            .neq('role', 'admin')
            .neq('role', 'superadmin')
            .order('full_name', { ascending: true }),
          supabase
            .from('onboarding_records')
            .select('email, name, team')
            .order('onboarding_datetime', { ascending: false }),
        ]);
        if (managedRes.error) console.warn('Attendance managed users fetch error:', managedRes.error);
        setManagedUsers(Array.isArray(managedRes.data) ? managedRes.data : []);
        setOnboardingRecords(Array.isArray(onboardingRes.data) ? onboardingRes.data : []);
      } else {
        setManagedUsers([]);
        setOnboardingRecords([]);
      }
    } catch (e) {
      console.error('Attendance fetch error:', e);
    } finally {
      setLoading(false);
    }
  };

  const onboardingNameByEmail = useMemo(() => {
    const map = new Map();
    (onboardingRecords || []).forEach((r) => {
      const email = (r.email || '').trim().toLowerCase();
      const name = (r.name || '').trim();
      if (email && name && !map.has(email)) map.set(email, name);
    });
    return map;
  }, [onboardingRecords]);

  const onboardingTeamByEmail = useMemo(() => {
    const map = new Map();
    (onboardingRecords || []).forEach((r) => {
      const email = (r.email || '').trim().toLowerCase();
      const team = onboardingTeamToUserTeam(r.team);
      if (email && team && !map.has(email)) map.set(email, team);
    });
    return map;
  }, [onboardingRecords]);

  const getUserEffectiveTeam = (u) => {
    if (!u) return '';
    if (u.team) return u.team;
    // Role fallback for users whose "team" is encoded via role
    if (u.role === ROLES.TLA) return TEAMS.TLA;
    if (u.role === ROLES.MONITORING_TEAM) return TEAMS.MONITORING;
    if (u.role === ROLES.PAT1) return TEAMS.PAT1;
    const emailKey = (u.email || '').trim().toLowerCase();
    return emailKey ? (onboardingTeamByEmail.get(emailKey) || '') : '';
  };

  const getUserDisplayName = (u) => {
    if (!u) return '—';
    const fromUser = (u.full_name || '').trim();
    if (fromUser) return fromUser;
    const emailKey = (u.email || '').trim().toLowerCase();
    const fromOnboarding = emailKey ? onboardingNameByEmail.get(emailKey) : '';
    return (fromOnboarding || '').trim() || (u.email || '—');
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
      // Late if time in is after scheduled start (e.g. 9:01 AM onwards = late; 9:00 AM or earlier = on time)
      const isLate = clockInMinutes > scheduledInMinutes;

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
              updated_at: nowIso,
            },
            { onConflict: 'user_id,log_date' }
          );
        if (error) throw error;
        queryCache.invalidate('attendance');
        await fetchPageData();
        if (isLate) {
          toast('You are marked late. Please provide a reason below.', { duration: 4000 });
          setLateReasonModalLog({
            user_id: user.id,
            log_date: today,
            late_reason: null,
            is_late: true,
            fromClockIn: true,
          });
          setLateReasonText('');
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
        const updatePayload = {
          time_in: firstTimeIn,
          segments: newSegments,
          updated_at: nowIso,
        };
        if (isLate) updatePayload.is_late = true;
        const { error } = await supabase
          .from('attendance_logs')
          .update(updatePayload)
          .eq('user_id', user.id)
          .eq('log_date', today);
        if (error) throw error;
        if (isLate) {
          setLateReasonModalLog({
            user_id: user.id,
            log_date: today,
            late_reason: todayLog.late_reason || null,
            is_late: true,
            fromClockIn: true,
          });
          setLateReasonText(todayLog.late_reason || '');
        }
      }
      queryCache.invalidate('attendance');
      await fetchPageData();
      if (isLate) {
        toast('You are marked late. Please provide a reason below.', { duration: 4000 });
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
      // Rendered time is capped at scheduled end (e.g. 6 PM); actual time out is still recorded
      const scheduledOut = mySchedule?.scheduled_time_out || '18:00';
      const [schedH, schedM] = scheduledOut.trim().split(':').map(Number);
      const [y, mo, day] = today.split('-').map(Number);
      const endOfScheduled = new Date(y, mo - 1, day, schedH ?? 18, schedM ?? 0, 0, 0);
      const endOfScheduledMs = endOfScheduled.getTime();
      const effectiveEndMs = Math.min(now.getTime(), endOfScheduledMs);
      const segmentSec = Math.max(0, Math.floor((effectiveEndMs - segmentStart) / 1000));
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
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100" style={{ color: PRIMARY }}>Attendance</h1>
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
            {canClockInOut
              ? 'Time in and out, rendered hours, and remaining hours'
              : 'View all interns attendance logs (view only)'}
          </p>
        </div>
        {canClockInOut && !canQuickGenerateSelfDtr && (
          <div className="flex flex-wrap gap-2 md:justify-end">
            <button
              type="button"
              onClick={handleOpenDtrRequest}
              className="inline-flex items-center justify-center rounded-lg px-3.5 py-2 text-sm font-semibold text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 shadow-sm hover:bg-gray-50 dark:hover:bg-gray-800 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#6795BE] dark:focus-visible:ring-offset-gray-950"
            >
              Request DTR
            </button>
          </div>
        )}
      </div>

      {/* Admin: view-only message */}
      {!canClockInOut && (
        <div className="rounded-lg border border-blue-200 dark:border-blue-900/60 bg-blue-50 dark:bg-blue-950/30 p-4 text-blue-800 dark:text-blue-200">
          You are viewing attendance in read-only mode. Only interns and team leads record time in/out.
        </div>
      )}

      {/* My attendance: schedule, clock in/out, timer (only for users who can clock) */}
      {canClockInOut && (
        <>
          {!myScheduleSet && (
            <div className="rounded-lg border border-amber-200 dark:border-amber-900/60 bg-amber-50 dark:bg-amber-950/30 p-4 text-amber-800 dark:text-amber-200">
              Your official schedule is not set yet. Time in/out will still work, but please confirm your official time frame with your supervisor/TL.
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="rounded-xl border-2 bg-white dark:bg-gray-900 p-4 shadow-sm" style={{ borderColor: PRIMARY }}>
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Total rendered hours</p>
              <p className="mt-1 text-2xl font-bold text-gray-900 dark:text-gray-100">{formatHoursMinutesCard(displayRenderedSeconds)}</p>
            </div>
            <div className="rounded-xl border-2 bg-white dark:bg-gray-900 p-4 shadow-sm" style={{ borderColor: PRIMARY }}>
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Remaining hours</p>
              <p className="mt-1 text-2xl font-bold text-gray-900 dark:text-gray-100">
                {formatHoursMinutesCard(Math.max(0, (mySchedule?.total_ojt_hours_required || 400) * 3600 - displayRenderedSeconds))}
              </p>
            </div>
          </div>

          <div className="rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div className="flex flex-col gap-2">
                <p className="text-sm text-gray-600 dark:text-gray-300">
                  Schedule: {formatScheduleTime(mySchedule?.scheduled_time_in || '09:00')} to {formatScheduleTime(mySchedule?.scheduled_time_out || '18:00')}{' '}
                  (Required: {mySchedule?.total_ojt_hours_required ?? 400} hrs)
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Time in after your scheduled start (e.g. 9:01 AM) is considered late. Please communicate with your supervisor if you will be late.
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
                    className="flex items-center gap-2 px-3 py-2 rounded-lg bg-gray-100 dark:bg-gray-950 text-gray-800 dark:text-gray-100 font-mono text-lg"
                    aria-live="polite"
                  >
                    <span className="text-gray-500 dark:text-gray-400 text-sm font-sans font-normal">Elapsed:</span>
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
        if (canClockInOut) {
          tabs.push({ id: 'my-log', label: 'Attendance log' });
          tabs.push({ id: 'my-dtr', label: 'My DTR requests' });
        }
        if (canViewAllAttendanceLogs) {
          tabs.push({ id: 'all-interns', label: 'All interns attendance' });
          tabs.push({ id: 'total-hours', label: 'Total hours' });
        }
        if (canManageSchedules) {
          tabs.push({ id: 'schedules', label: 'Set schedule for interns' });
          tabs.push({ id: 'dtr-requests', label: 'DTR management' });
        }
        const activeTab = tabs.some((t) => t.id === attendanceTab) ? attendanceTab : (tabs[0]?.id ?? 'my-log');
        if (tabs.length === 0) return null;
        return (
          <div className="rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 overflow-hidden">
            <div className="flex border-b border-gray-200 dark:border-gray-800 bg-gray-50/80 dark:bg-gray-950/40">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setAttendanceTab(tab.id)}
                  className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                    activeTab === tab.id
                      ? 'border-[#6795BE] text-[#6795BE] bg-white dark:bg-gray-900'
                      : 'border-transparent text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-100/80 dark:hover:bg-gray-800/60'
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
                      <span className="text-sm text-gray-600 dark:text-gray-300">Filter:</span>
                      <select
                        value={myLogDateFilter}
                        onChange={(e) => setMyLogDateFilter(e.target.value)}
                        className="rounded-lg border border-gray-300 dark:border-gray-700 px-3 py-1.5 text-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-offset-0 focus:ring-[#6795BE]"
                      >
                        <option value="all">All</option>
                        <option value="today">Day (today)</option>
                        <option value="7">Week (last 7 days)</option>
                        <option value="30">Month (last 30 days)</option>
                        <option value="specific">Specific date</option>
                      </select>
                      {myLogDateFilter === 'specific' && (
                        <div className="w-[220px]">
                          <PrettyDatePicker
                            value={myLogSpecificDate}
                            onChange={(e) => setMyLogSpecificDate(e.target.value)}
                            ariaLabel="Select specific date"
                          />
                        </div>
                      )}
                      <span className="inline-flex items-center gap-2 ml-2 border-l border-gray-200 dark:border-gray-800 pl-3">
                        <button
                          type="button"
                          onClick={() => handleExportAttendanceCSV(false)}
                          disabled={!filteredMyLogs.length}
                          className="px-2.5 py-1.5 rounded-lg text-xs font-medium border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50"
                        >
                          Export CSV
                        </button>
                        <button
                          type="button"
                          onClick={() => handleExportAttendanceExcel(false)}
                          disabled={!filteredMyLogs.length}
                          className="px-2.5 py-1.5 rounded-lg text-xs font-medium border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50"
                        >
                          Export Excel
                        </button>
                        <button
                          type="button"
                          onClick={handleOpenImportModal}
                          className="px-2.5 py-1.5 rounded-lg text-xs font-medium text-white"
                          style={{ backgroundColor: PRIMARY }}
                        >
                          Import
                        </button>
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">Rendered time = total for that day only. Time out pauses; time in again to continue.</p>
                    <div className="rounded-lg border border-gray-200 dark:border-gray-800 overflow-hidden overflow-x-auto bg-white dark:bg-gray-900">
                      <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-800">
                        <thead>
                          <tr className="bg-gray-50 dark:bg-gray-950/40">
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 dark:text-gray-300 uppercase">Date</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 dark:text-gray-300 uppercase">First in</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 dark:text-gray-300 uppercase">Latest in</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 dark:text-gray-300 uppercase">Latest out</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 dark:text-gray-300 uppercase">Rendered time</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 dark:text-gray-300 uppercase">Late</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 dark:text-gray-300 uppercase">Reason</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200 dark:divide-gray-800">
                          {paginatedMy.length > 0 ? paginatedMy.map((log) => {
                            const seg = getSegments(log);
                            const firstInLog = seg.length > 0 ? seg[0].time_in : log.time_in;
                            const latestInLog = seg.length > 0 ? seg[seg.length - 1].time_in : log.time_in;
                            const lastOutLog = seg.length > 0 ? seg[seg.length - 1].time_out : log.time_out;
                            const isTodayRow = log.log_date === today && log.user_id === user?.id && isClockedIn(log);
                            const dayTotalSec = getLogRenderedSeconds(log) + (isTodayRow ? currentSegmentSeconds : 0);
                            const hasRendered = (log.total_rendered_seconds != null || log.rendered_seconds != null || log.rendered_minutes != null) || isTodayRow;
                            const pendingRequest = myLateRequests.find((r) => r.log_date === log.log_date);
                            return (
                              <tr key={log.id ?? `${log.user_id}-${log.log_date}`} className="hover:bg-gray-50 dark:hover:bg-gray-800/60">
                                <td className="px-4 py-3 text-sm text-gray-900 dark:text-gray-100">{formatDateMonthDayYear(log.log_date)}</td>
                                <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-200">{formatTimeHHMM(firstInLog)}</td>
                                <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-200">{formatTimeHHMM(latestInLog)}</td>
                                <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-200">{formatTimeHHMM(lastOutLog)}</td>
                                <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-200">{hasRendered ? formatHoursMinutesLabel(dayTotalSec) : '—'}</td>
                                <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-200">{log.is_late ? 'Yes' : '—'}</td>
                                <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-200">
                                  {log.is_late ? (
                                    log.late_reason ? (
                                      <span className="text-gray-700 dark:text-gray-200">{log.late_reason}</span>
                                    ) : pendingRequest?.status === 'pending' ? (
                                      <span className="text-amber-600 text-xs">Pending approval</span>
                                    ) : pendingRequest?.status === 'rejected' ? (
                                      <span className="text-red-600 text-xs">Rejected</span>
                                    ) : null
                                  ) : '—'}
                                  {log.is_late && (
                                    <button
                                      type="button"
                                      onClick={() => handleOpenLateReasonModal(log)}
                                      className="ml-1.5 text-xs font-medium"
                                      style={{ color: PRIMARY }}
                                    >
                                      {log.late_reason || pendingRequest ? 'Edit' : 'Add reason'}
                                    </button>
                                  )}
                                </td>
                              </tr>
                            );
                          }) : (
                            <tr><td colSpan={7} className="px-4 py-6 text-center text-gray-500 dark:text-gray-400 text-sm">No attendance records yet.</td></tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                    <Pagination total={totalMy} page={pageMyLog} setPage={setPageMyLog} pageSize={PAGE_SIZE} />
                  </div>
                );
              })()}
              {activeTab === 'my-dtr' && canClockInOut && (
                <div className="p-4 space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">My DTR requests</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        Track the status of your submitted DTR requests and view/download your DTR. Available to interns and TL/VTL of all teams (TLA, PAT1, Monitoring). Monitoring TL/VTL and Admin review requests.
                      </p>
                    </div>
                    {myDtrRequestsLoading && (
                      <span className="text-xs text-gray-500 dark:text-gray-400">Loading…</span>
                    )}
                  </div>

                  {canQuickGenerateSelfDtr && (
                    <div className="rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-3 space-y-2">
                      <p className="text-xs font-semibold text-gray-800 dark:text-gray-100">
                        Quick DTR (Monitoring TL/VTL)
                      </p>
                      <p className="text-[11px] text-gray-500 dark:text-gray-400">
                        Generate your own DTR for a selected date range without submitting a request.
                      </p>
                      <div className="flex flex-wrap items-end gap-3">
                        <div className="flex flex-col gap-1">
                          <label className="text-xs font-medium text-gray-700 dark:text-gray-200">From</label>
                          <PrettyDatePicker
                            value={selfDtrFrom}
                            onChange={(e) => setSelfDtrFrom(e.target.value)}
                            ariaLabel="Quick DTR from date"
                          />
                        </div>
                        <div className="flex flex-col gap-1">
                          <label className="text-xs font-medium text-gray-700 dark:text-gray-200">To</label>
                          <PrettyDatePicker
                            value={selfDtrTo}
                            onChange={(e) => setSelfDtrTo(e.target.value)}
                            ariaLabel="Quick DTR to date"
                          />
                        </div>
                        <button
                          type="button"
                          onClick={handleGenerateSelfDtr}
                          disabled={selfDtrGenerating}
                          className="px-3 py-2 rounded-lg text-xs font-semibold text-white disabled:opacity-60"
                          style={{ backgroundColor: PRIMARY }}
                        >
                          {selfDtrGenerating ? 'Generating…' : 'Generate my DTR'}
                        </button>
                      </div>
                    </div>
                  )}

                  {myDtrRequests.length === 0 && !myDtrRequestsLoading ? (
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      You have not submitted any DTR requests yet.
                    </p>
                  ) : (
                    <div className="rounded-lg border border-gray-200 dark:border-gray-800 overflow-hidden overflow-x-auto bg-white dark:bg-gray-900">
                      <table className="w-full text-xs">
                        <thead className="bg-gray-50 dark:bg-gray-950/40">
                          <tr>
                            <th className="px-3 py-2 text-left font-medium text-gray-600 dark:text-gray-300">Requested</th>
                            <th className="px-3 py-2 text-left font-medium text-gray-600 dark:text-gray-300">Date range</th>
                            <th className="px-3 py-2 text-left font-medium text-gray-600 dark:text-gray-300">Status</th>
                            <th className="px-3 py-2 text-left font-medium text-gray-600 dark:text-gray-300">Action</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                          {myDtrRequests.map((req) => (
                            <tr key={req.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/60">
                              <td className="px-3 py-2 text-gray-700 dark:text-gray-200">
                                {req.created_at ? new Date(req.created_at).toLocaleString() : '—'}
                              </td>
                              <td className="px-3 py-2 text-gray-700 dark:text-gray-200">
                                {req.date_from} – {req.date_to}
                              </td>
                              <td className="px-3 py-2 text-gray-700 dark:text-gray-200">
                                {req.status || 'pending'}
                              </td>
                              <td className="px-3 py-2 text-gray-700 dark:text-gray-200">
                                <button
                                  type="button"
                                  onClick={() => handleViewMyDtr(req)}
                                  className="text-[11px] font-medium"
                                  style={{ color: PRIMARY }}
                                >
                                  View
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
              {activeTab === 'all-interns' && canViewAllAttendanceLogs && (() => {
                const totalAll = filteredAttendanceLogs.length;
                const totalPagesAll = Math.ceil(totalAll / PAGE_SIZE) || 1;
                const pageAll = Math.min(Math.max(1, pageAllInterns), totalPagesAll);
                const paginatedAll = filteredAttendanceLogs.slice((pageAll - 1) * PAGE_SIZE, pageAll * PAGE_SIZE);
                return (
                  <div className="p-4">
                    {canManageSchedules && lateRequests.length > 0 && (
                      <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50/80 p-4">
                        <h3 className="text-sm font-semibold text-amber-900 mb-2">Pending late requests</h3>
                        <p className="text-xs text-amber-800 mb-3">Approve to link the reason to the attendance log.</p>
                        <div className="rounded-lg border border-amber-200 overflow-hidden overflow-x-auto">
                          <table className="min-w-full text-sm">
                            <thead className="bg-amber-100/80">
                              <tr>
                                <th className="px-3 py-2 text-left text-xs font-medium text-amber-900">Requester</th>
                                <th className="px-3 py-2 text-left text-xs font-medium text-amber-900">Date</th>
                                <th className="px-3 py-2 text-left text-xs font-medium text-amber-900">Reason</th>
                                <th className="px-3 py-2 text-left text-xs font-medium text-amber-900">Actions</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-amber-200">
                              {lateRequests.map((req) => {
                                const u = usersById[req.user_id];
                                return (
                                  <tr key={req.id} className="bg-white">
                                    <td className="px-3 py-2 text-gray-900">{u?.full_name || u?.email || req.user_id}</td>
                                    <td className="px-3 py-2 text-gray-700">{formatDateMonthDayYear(req.log_date)}</td>
                                    <td className="px-3 py-2 text-gray-700">{req.reason || '—'}</td>
                                    <td className="px-3 py-2 space-x-2">
                                      <button
                                        type="button"
                                        onClick={() => handleApproveLateRequest(req)}
                                        className="text-xs font-medium text-green-700 hover:text-green-800"
                                      >
                                        Approve
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => handleRejectLateRequest(req)}
                                        className="text-xs font-medium text-red-700 hover:text-red-800"
                                      >
                                        Reject
                                      </button>
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                        <button
                          type="button"
                          onClick={loadLateRequests}
                          disabled={lateRequestsLoading}
                          className="mt-2 text-xs font-medium text-amber-800 hover:text-amber-900"
                        >
                          {lateRequestsLoading ? 'Loading…' : 'Refresh'}
                        </button>
                      </div>
                    )}
                    <div className="flex flex-wrap items-center gap-3 mb-3">
                      <span className="text-sm text-gray-600 dark:text-gray-300">Date:</span>
                      <select
                        value={logDateFilter}
                        onChange={(e) => setLogDateFilter(e.target.value)}
                        className="rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-1.5 text-sm text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-offset-0 focus:ring-[#6795BE]"
                      >
                        <option value="all">All</option>
                        <option value="today">Today</option>
                        <option value="7">Last 7 days</option>
                        <option value="30">Last 30 days</option>
                        <option value="specific">Specific date</option>
                      </select>
                      {logDateFilter === 'specific' && (
                        <div className="w-[220px]">
                          <PrettyDatePicker
                            value={logSpecificDate}
                            onChange={(e) => setLogSpecificDate(e.target.value)}
                            ariaLabel="Select specific date"
                          />
                        </div>
                      )}
                      <span className="text-sm text-gray-600 dark:text-gray-300 ml-2">Role:</span>
                      <select
                        value={allInternsRoleFilter}
                        onChange={(e) => setAllInternsRoleFilter(e.target.value)}
                        className="rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-1.5 text-sm text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-offset-0 focus:ring-[#6795BE]"
                      >
                        <option value="">All roles</option>
                        <option value="tla">Team Lead Assistant (TLA)</option>
                        <option value="monitoring">Monitoring Team</option>
                        <option value="pat1">PAT1</option>
                        <option value="tl">Team Lead</option>
                        <option value="vtl">Vice Team Lead</option>
                      </select>
                      <span className="text-sm text-gray-600 dark:text-gray-300">Late:</span>
                      <select
                        value={allInternsLateFilter}
                        onChange={(e) => setAllInternsLateFilter(e.target.value)}
                        className="rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-1.5 text-sm text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-offset-0 focus:ring-[#6795BE]"
                      >
                        <option value="all">All</option>
                        <option value="late">Late only</option>
                        <option value="on-time">On time only</option>
                      </select>
                      {canManageSchedules && (
                        <span className="inline-flex items-center gap-2 ml-2 border-l border-gray-200 dark:border-gray-800 pl-3">
                          <button
                            type="button"
                            onClick={() => handleExportAttendanceCSV(true)}
                            disabled={!filteredAttendanceLogs.length}
                            className="px-2.5 py-1.5 rounded-lg text-xs font-medium border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50"
                          >
                            Export CSV
                          </button>
                          <button
                            type="button"
                            onClick={() => handleExportAttendanceExcel(true)}
                            disabled={!filteredAttendanceLogs.length}
                            className="px-2.5 py-1.5 rounded-lg text-xs font-medium border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50"
                          >
                            Export Excel
                          </button>
                          <button
                            type="button"
                            onClick={handleOpenImportModal}
                            className="px-2.5 py-1.5 rounded-lg text-xs font-medium text-white"
                            style={{ backgroundColor: PRIMARY }}
                          >
                            Import
                          </button>
                        </span>
                      )}
                    </div>
                    <div className="rounded-lg border border-gray-200 dark:border-gray-800 overflow-hidden overflow-x-auto bg-white dark:bg-gray-900">
                      <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-800">
                        <thead>
                          <tr className="bg-gray-50 dark:bg-gray-950/40">
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 dark:text-gray-300 uppercase">Name</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 dark:text-gray-300 uppercase">Email</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 dark:text-gray-300 uppercase">Role</th>
                            <th className="px-4 py-3 text-center text-xs font-medium text-gray-600 dark:text-gray-300 uppercase">Status</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 dark:text-gray-300 uppercase">Date</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 dark:text-gray-300 uppercase">First in</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 dark:text-gray-300 uppercase">Latest in</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 dark:text-gray-300 uppercase">Latest out</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 dark:text-gray-300 uppercase">Rendered time</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 dark:text-gray-300 uppercase">Late</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 dark:text-gray-300 uppercase">Reason</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200 dark:divide-gray-800">
                          {paginatedAll.length > 0 ? paginatedAll.map((log) => {
                            const u = usersById[log.user_id] || {};
                            const seg = getSegments(log);
                            const firstInLog = seg.length > 0 ? seg[0].time_in : log.time_in;
                            const latestInLog = seg.length > 0 ? seg[seg.length - 1].time_in : log.time_in;
                            const lastOutLog = seg.length > 0 ? seg[seg.length - 1].time_out : log.time_out;
                            const isTodayRow = log.log_date === today && log.user_id === user?.id && isClockedIn(log);
                            const isActiveSession = log.log_date === today && isClockedIn(log);
                            const dayTotalSec = getLogRenderedSeconds(log) + (isTodayRow ? currentSegmentSeconds : 0);
                            const hasRendered = (log.total_rendered_seconds != null || log.rendered_seconds != null || log.rendered_minutes != null) || isTodayRow;
                            return (
                              <tr key={log.id ?? `${log.user_id}-${log.log_date}`} className="hover:bg-gray-50 dark:hover:bg-gray-800/60">
                                <td className="px-4 py-3 text-sm text-gray-900 dark:text-gray-100">{u.full_name || '—'}</td>
                                <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-300">{u.email || '—'}</td>
                                <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-300">{getRoleDisplayName(u.role) || '—'}</td>
                                <td className="px-4 py-3 text-sm text-center">
                                  {isActiveSession ? (
                                    <span className="inline-flex items-center rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800">
                                      Clocked In
                                    </span>
                                  ) : (
                                    <span className="text-gray-400 dark:text-gray-500 text-xs">—</span>
                                  )}
                                </td>
                                <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-200">{formatDateMonthDayYear(log.log_date)}</td>
                                <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-200">{formatTimeHHMM(firstInLog)}</td>
                                <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-200">{formatTimeHHMM(latestInLog)}</td>
                                <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-200">{formatTimeHHMM(lastOutLog)}</td>
                                <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-200">{hasRendered ? formatHoursMinutesLabel(dayTotalSec) : '—'}</td>
                                <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-200">{log.is_late ? 'Yes' : '—'}</td>
                                <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-200">
                                  {log.is_late ? (
                                    <>
                                      {log.late_reason && <span className="text-gray-700 dark:text-gray-200">{log.late_reason}</span>}
                                      {canManageSchedules && (
                                        <button
                                          type="button"
                                          onClick={() => handleOpenLateReasonModal(log)}
                                          className={log.late_reason ? 'ml-1.5 text-xs font-medium' : 'text-xs font-medium'}
                                          style={{ color: PRIMARY }}
                                        >
                                          {log.late_reason ? 'Edit' : 'Add reason'}
                                        </button>
                                      )}
                                    </>
                                  ) : '—'}
                                </td>
                              </tr>
                            );
                          }) : (
                            <tr><td colSpan={11} className="px-4 py-6 text-center text-gray-500 dark:text-gray-400 text-sm">No records match the current filters.</td></tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                    <Pagination total={totalAll} page={pageAllInterns} setPage={setPageAllInterns} pageSize={PAGE_SIZE} />
                  </div>
                );
              })()}
              {activeTab === 'total-hours' && canViewAllAttendanceLogs && (() => {
                let hoursUsers = Object.values(usersById)
                  .filter((u) => u && u.role !== 'admin');
                if (totalHoursRoleFilter) {
                  hoursUsers = hoursUsers.filter((u) => String(u.role || '') === totalHoursRoleFilter);
                }
                if (totalHoursTeamFilter) {
                  hoursUsers = hoursUsers.filter((u) => getUserEffectiveTeam(u) === totalHoursTeamFilter);
                }
                hoursUsers = hoursUsers.sort((a, b) => (getUserDisplayName(a) || '').localeCompare(getUserDisplayName(b) || ''));
                const totalHours = hoursUsers.length;
                const totalPagesHours = Math.ceil(totalHours / PAGE_SIZE) || 1;
                const pageHours = Math.min(Math.max(1, pageTotalHours), totalPagesHours);
                const paginatedHours = hoursUsers.slice((pageHours - 1) * PAGE_SIZE, pageHours * PAGE_SIZE);
                return (
                  <div className="p-4">
                    <div className="flex flex-wrap items-center gap-3 mb-3">
                      <span className="text-sm text-gray-600 dark:text-gray-300">Role:</span>
                      <select
                        value={totalHoursRoleFilter}
                        onChange={(e) => { setTotalHoursRoleFilter(e.target.value); setPageTotalHours(1); }}
                        className="rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-1.5 text-sm text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-offset-0 focus:ring-[#6795BE]"
                      >
                        <option value="">All Intern</option>
                        <option value={ROLES.INTERN}>Intern</option>
                        <option value={ROLES.TL}>Team Lead</option>
                        <option value={ROLES.VTL}>Vice Team Lead</option>
                      </select>
                      <span className="text-sm text-gray-600 dark:text-gray-300 ml-2">Team:</span>
                      <select
                        value={totalHoursTeamFilter}
                        onChange={(e) => { setTotalHoursTeamFilter(e.target.value); setPageTotalHours(1); }}
                        className="rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-1.5 text-sm text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-offset-0 focus:ring-[#6795BE]"
                      >
                        <option value="">All teams</option>
                        <option value={TEAMS.TLA}>Team Lead Assistant</option>
                        <option value={TEAMS.MONITORING}>Monitoring</option>
                        <option value={TEAMS.PAT1}>PAT1</option>
                      </select>
                    </div>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
                      Total rendered hours from attendance logs (including imported). Remaining = required OJT hours − rendered.
                    </p>
                    <div className="rounded-lg border border-gray-200 dark:border-gray-800 overflow-hidden overflow-x-auto bg-white dark:bg-gray-900">
                      <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-800">
                        <thead>
                          <tr className="bg-gray-50 dark:bg-gray-950/40">
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 dark:text-gray-300 uppercase">Name</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 dark:text-gray-300 uppercase">Email</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 dark:text-gray-300 uppercase">Role</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 dark:text-gray-300 uppercase">Team</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 dark:text-gray-300 uppercase">Total rendered hours</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 dark:text-gray-300 uppercase">Remaining hours</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 dark:text-gray-300 uppercase">OJT status</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200 dark:divide-gray-800">
                          {paginatedHours.length > 0 ? paginatedHours.map((u) => {
                            const renderedSec = getRenderedSecondsForUser(u.id) + (liveActiveSecondsByUserId[u.id] || 0);
                            const requiredSec = (Number(u.total_ojt_hours_required) || 400) * 3600;
                            const remainingSec = Math.max(0, requiredSec - renderedSec);
                            const completed = remainingSec <= 0 && renderedSec > 0;
                            return (
                              <tr key={u.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/60">
                                <td className="px-4 py-3 text-sm text-gray-900 dark:text-gray-100">{getUserDisplayName(u)}</td>
                                <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-300">{u.email || '—'}</td>
                                <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-300">{getRoleDisplayName(u.role) || '—'}</td>
                                <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-300">{teamDisplayLabel(getUserEffectiveTeam(u))}</td>
                                <td className="px-4 py-3 text-sm font-medium text-gray-900 dark:text-gray-100">{formatHoursMinutesCompact(renderedSec)}</td>
                                <td className="px-4 py-3 text-sm font-medium text-gray-900 dark:text-gray-100">{formatHoursMinutesCompact(remainingSec)}</td>
                                <td className="px-4 py-3 text-sm">
                                  {completed ? (
                                    <span className="inline-flex items-center rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-800">
                                      Completed
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center rounded-full bg-gray-100 dark:bg-gray-950/40 px-2.5 py-0.5 text-xs font-medium text-gray-700 dark:text-gray-200">
                                      In progress
                                    </span>
                                  )}
                                </td>
                              </tr>
                            );
                          }) : (
                            <tr><td colSpan={7} className="px-4 py-6 text-center text-gray-500 dark:text-gray-400 text-sm">No users to display.</td></tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                    <Pagination total={totalHours} page={pageTotalHours} setPage={setPageTotalHours} pageSize={PAGE_SIZE} />
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
                      <span className="text-sm text-gray-600 dark:text-gray-300">Role:</span>
                      <select
                        value={scheduleRoleFilter}
                        onChange={(e) => setScheduleRoleFilter(e.target.value)}
                        className="rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-1.5 text-sm text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-offset-0 focus:ring-[#6795BE]"
                      >
                        <option value="">All roles</option>
                        <option value="tla">Team Lead Assistant (TLA)</option>
                        <option value="monitoring">Monitoring Team</option>
                        <option value="pat1">PAT1</option>
                        <option value="tl">Team Lead</option>
                        <option value="vtl">Vice Team Lead</option>
                      </select>
                    </div>
                    {managedUsers.length === 0 && !loading ? (
                      <p className="px-4 py-6 text-center text-gray-500 dark:text-gray-400">No users to manage.</p>
                    ) : (
                      <>
                        <div className="rounded-lg border border-gray-200 dark:border-gray-800 overflow-hidden overflow-x-auto bg-white dark:bg-gray-900">
                          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-800">
                            <thead>
                              <tr className="bg-gray-50 dark:bg-gray-950/40">
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 dark:text-gray-300 uppercase">Name</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 dark:text-gray-300 uppercase">Email</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 dark:text-gray-300 uppercase">Role</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 dark:text-gray-300 uppercase">Schedule</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 dark:text-gray-300 uppercase">Time In</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 dark:text-gray-300 uppercase">Time Out</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 dark:text-gray-300 uppercase">Required (hrs)</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 dark:text-gray-300 uppercase">Rendered (hrs)</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 dark:text-gray-300 uppercase">Remaining (hrs)</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 dark:text-gray-300 uppercase">Actions</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-200 dark:divide-gray-800">
                              {paginatedSched.map(({ type, user: i }) =>
                                type === 'setup' ? (
                                  <tr key={i.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/60">
                                    <td className="px-4 py-3 text-sm text-gray-900 dark:text-gray-100">{getUserDisplayName(i)}</td>
                                    <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-300">{i.email || '—'}</td>
                                    <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-300">{i.role || '—'}</td>
                                    <td className="px-4 py-3 text-sm text-green-600 font-medium">Setup</td>
                                    <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-200">{formatScheduleTime(i.scheduled_time_in)}</td>
                                    <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-200">{formatScheduleTime(i.scheduled_time_out)}</td>
                                    <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-200">{i.total_ojt_hours_required ?? 400}</td>
                                    <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-200">{formatHoursFromSeconds(getRenderedSecondsForUser(i.id))}</td>
                                    <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-200">{formatHoursFromSeconds(Math.max(0, (i.total_ojt_hours_required || 400) * 3600 - getRenderedSecondsForUser(i.id)))}</td>
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
                                  <tr key={i.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/60 bg-amber-50/50 dark:bg-amber-950/20">
                                    <td className="px-4 py-3 text-sm text-gray-900 dark:text-gray-100">{getUserDisplayName(i)}</td>
                                    <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-300">{i.email || '—'}</td>
                                    <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-300">{i.role || '—'}</td>
                                    <td className="px-4 py-3 text-sm text-amber-600 font-medium">Not set</td>
                                    <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-300">—</td>
                                    <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-300">—</td>
                                    <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-300">—</td>
                                    <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-300">—</td>
                                    <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-300">—</td>
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
              {activeTab === 'dtr-requests' && canManageSchedules && (() => {
                return (
                  <div className="p-4 space-y-4">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                      <div>
                        <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">DTR management</h3>
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          Review and process DTR requests from interns and TL/VTL (TLA, PAT1, Monitoring). Approve, reject, or export.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={refreshDtrRequests}
                        className="inline-flex items-center rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 px-3 py-1.5 text-xs font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800"
                      >
                        Refresh
                      </button>
                    </div>
                    <div className="rounded-lg border border-gray-200 dark:border-gray-800 overflow-hidden overflow-x-auto bg-white dark:bg-gray-900">
                      <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-800 text-sm">
                        <thead className="bg-gray-50 dark:bg-gray-950/40">
                          <tr>
                            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wide">Requested</th>
                            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wide">Requester</th>
                            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wide">Email</th>
                            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wide">Date range</th>
                            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wide">Status</th>
                            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wide">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200 dark:divide-gray-800">
                          {dtrRequestsLoading ? (
                            <tr>
                              <td colSpan={6} className="px-4 py-6 text-center text-gray-500 dark:text-gray-400">
                                Loading DTR requests…
                              </td>
                            </tr>
                          ) : dtrRequests.length === 0 ? (
                            <tr>
                              <td colSpan={6} className="px-4 py-6 text-center text-gray-500 dark:text-gray-400">
                                No DTR requests yet.
                              </td>
                            </tr>
                          ) : (
                            dtrRequests.map((req) => {
                              const u = usersById[req.user_id];
                              const name = getUserDisplayName(u);
                              return (
                                <tr key={req.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/60">
                                  <td className="px-4 py-3 text-xs text-gray-600 dark:text-gray-300">
                                    {req.created_at ? new Date(req.created_at).toLocaleString() : '—'}
                                  </td>
                                  <td className="px-4 py-3 text-sm text-gray-900 dark:text-gray-100">{name}</td>
                                  <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-300">{req.requested_by_email || u?.email || '—'}</td>
                                  <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-200">
                                    {req.date_from} – {req.date_to}
                                  </td>
                                  <td className="px-4 py-3">
                                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${requestStatusPill(req.status)}`}>
                                      {req.status || 'pending'}
                                    </span>
                                  </td>
                                  <td className="px-4 py-3 space-x-2 whitespace-nowrap">
                                    <button
                                      type="button"
                                      onClick={() => handleViewDtrForRequest(req)}
                                      className="text-xs font-medium"
                                      style={{ color: PRIMARY }}
                                    >
                                      View DTR
                                    </button>
                                    {req.status !== 'approved' && (
                                      <button
                                        type="button"
                                        onClick={() => handleUpdateDtrStatus(req, 'approved')}
                                        className="text-xs font-medium text-green-700 hover:text-green-800"
                                      >
                                        Approve
                                      </button>
                                    )}
                                    {req.status !== 'rejected' && (
                                      <button
                                        type="button"
                                        onClick={() => handleUpdateDtrStatus(req, 'rejected')}
                                        className="text-xs font-medium text-red-700 hover:text-red-800"
                                      >
                                        Reject
                                      </button>
                                    )}
                                  </td>
                                </tr>
                              );
                            })
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>
        );
      })()}

      {showDtrRequestModal &&
        createPortal(
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
            <div className="bg-white rounded-xl shadow-xl max-w-md w-full mx-4">
              <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between">
                <div>
                  <h2 className="text-base font-semibold text-gray-900">Request Daily Time Record (DTR)</h2>
                  <p className="mt-0.5 text-xs text-gray-500">
                    Interns and TL/VTL of any team (TLA, PAT1, Monitoring) can request. Monitoring TL/VTL and Admin will review and process your request.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => !submittingDtr && setShowDtrRequestModal(false)}
                  className="text-gray-400 hover:text-gray-600"
                  aria-label="Close DTR request"
                >
                  ✕
                </button>
              </div>
              <form onSubmit={handleSubmitDtrRequest} className="px-5 py-4 space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">From date</label>
                    <PrettyDatePicker
                      value={dtrFromDate}
                      onChange={(e) => setDtrFromDate(e.target.value)}
                      ariaLabel="DTR from date"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">To date</label>
                    <PrettyDatePicker
                      value={dtrToDate}
                      onChange={(e) => setDtrToDate(e.target.value)}
                      ariaLabel="DTR to date"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Remarks (optional)
                  </label>
                  <textarea
                    rows={3}
                    value={dtrReason}
                    onChange={(e) => setDtrReason(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#6795BE]"
                    placeholder="Example: DTR for visa requirements, internship completion, etc."
                  />
                </div>
                <div className="flex items-center justify-end gap-2 pt-2 border-t border-gray-100 mt-2">
                  <button
                    type="button"
                    onClick={() => !submittingDtr && setShowDtrRequestModal(false)}
                    className="px-3 py-1.5 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-100"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={submittingDtr}
                    className="px-4 py-1.5 rounded-lg text-sm font-semibold text-white disabled:opacity-60"
                    style={{ backgroundColor: PRIMARY }}
                  >
                    {submittingDtr ? 'Submitting…' : 'Submit DTR request'}
                  </button>
                </div>
              </form>
            </div>
          </div>,
          document.body
        )}

      {showImportModal &&
        createPortal(
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
            <div className="bg-white rounded-xl shadow-xl max-w-md w-full mx-4">
              <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between">
                <div>
                  <h2 className="text-base font-semibold text-gray-900">Import attendance records</h2>
                  <p className="mt-0.5 text-xs text-gray-500">
                    Upload a CSV or Excel file with columns: date, first in, latest in, latest out, rendered time, late.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => !importLoading && setShowImportModal(false)}
                  className="text-gray-400 hover:text-gray-600"
                  aria-label="Close import"
                >
                  ✕
                </button>
              </div>
              <form onSubmit={handleImportSubmit} className="px-5 py-4 space-y-4">
                {canViewAllAttendanceLogs && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Import for</label>
                    <select
                      value={importForUserId}
                      onChange={(e) => setImportForUserId(e.target.value)}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-[#6795BE]"
                    >
                      <option value={user?.id}>Myself ({user?.user_metadata?.full_name || user?.email})</option>
                      {Object.values(usersById)
                        .filter((u) => u?.id && u.id !== user?.id)
                        .map((u) => (
                          <option key={u.id} value={u.id}>
                            {u.full_name || u.email || u.id}
                          </option>
                        ))}
                    </select>
                  </div>
                )}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">File (CSV or Excel)</label>
                  <input
                    id="attendance-import-file"
                    type="file"
                    accept=".csv,.xlsx,.xls"
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm file:mr-2 file:rounded file:border-0 file:px-3 file:py-1 file:text-sm file:font-medium file:bg-gray-100 file:text-gray-700"
                  />
                </div>
                {importError && (
                  <p className="text-sm text-red-600">{importError}</p>
                )}
                <div className="flex items-center justify-end gap-2 pt-2 border-t border-gray-100 mt-2">
                  <button
                    type="button"
                    onClick={() => !importLoading && setShowImportModal(false)}
                    className="px-3 py-1.5 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-100"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={importLoading}
                    className="px-4 py-1.5 rounded-lg text-sm font-semibold text-white disabled:opacity-60"
                    style={{ backgroundColor: PRIMARY }}
                  >
                    {importLoading ? 'Importing…' : 'Import'}
                  </button>
                </div>
              </form>
            </div>
          </div>,
          document.body
        )}

      {lateReasonModalLog &&
        createPortal(
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
            <div className="bg-white rounded-xl shadow-xl max-w-md w-full mx-4">
              <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between">
                <div>
                  <h2 className="text-base font-semibold text-gray-900">Late attendance reason</h2>
                  <p className="mt-0.5 text-xs text-gray-500">
                    {formatDateMonthDayYear(lateReasonModalLog.log_date)}
                    {lateReasonModalLog.user_id !== user?.id && usersById[lateReasonModalLog.user_id] && (
                      <> • {usersById[lateReasonModalLog.user_id].full_name || usersById[lateReasonModalLog.user_id].email}</>
                    )}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => !savingLateReason && setLateReasonModalLog(null)}
                  className="text-gray-400 hover:text-gray-600"
                  aria-label="Close"
                >
                  ✕
                </button>
              </div>
              <div className="px-5 py-4 space-y-4">
                {lateReasonModalLog.fromClockIn && (
                  <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                    You were marked late. Please provide a reason for your record. It will be saved to your attendance log and visible to your supervisor.
                  </p>
                )}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Reason</label>
                  <textarea
                    rows={3}
                    value={lateReasonText}
                    onChange={(e) => setLateReasonText(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-[#6795BE]"
                    placeholder="e.g. Traffic, medical appointment, public transport delay"
                  />
                </div>
                <div className="flex flex-wrap items-center justify-end gap-2 pt-2 border-t border-gray-100">
                  <button
                    type="button"
                    onClick={() => !savingLateReason && setLateReasonModalLog(null)}
                    className="px-3 py-1.5 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-100"
                  >
                    {lateReasonModalLog.fromClockIn ? 'Skip' : 'Cancel'}
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveLateReason}
                    disabled={savingLateReason}
                    className="px-4 py-1.5 rounded-lg text-sm font-medium border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-60"
                  >
                    {savingLateReason ? 'Saving…' : 'Save reason'}
                  </button>
                  {lateReasonModalLog.user_id === user?.id && !lateReasonModalLog.fromClockIn && (
                    <button
                      type="button"
                      onClick={handleSubmitLateRequest}
                      disabled={savingLateReason || !lateReasonText.trim()}
                      className="px-4 py-1.5 rounded-lg text-sm font-semibold text-white disabled:opacity-60"
                      style={{ backgroundColor: PRIMARY }}
                    >
                      {savingLateReason ? 'Submitting…' : 'Submit for approval'}
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>,
          document.body
        )}

      {myDtrSelected &&
        createPortal(
          <div className="fixed inset-0 z-[105] flex items-center justify-center bg-black/50 p-4" onClick={() => setMyDtrSelected(null)}>
            <div
              className="bg-white rounded-2xl shadow-xl max-w-3xl w-full max-h-[90vh] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between">
                <div>
                  <h2 className="text-base font-semibold text-gray-900">
                    My DTR – {user?.user_metadata?.full_name || user?.email || 'you'}
                  </h2>
                  <p className="mt-0.5 text-xs text-gray-600">
                    Range: {myDtrSelected.date_from} – {myDtrSelected.date_to} • Status: {myDtrSelected.status || 'pending'}
                  </p>
                  {myDtrSelected.reason && (
                    <p className="mt-1 text-xs text-gray-500">
                      Remarks: {myDtrSelected.reason}
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => setMyDtrSelected(null)}
                  className="text-gray-400 hover:text-gray-600"
                  aria-label="Close my DTR viewer"
                >
                  ✕
                </button>
              </div>
              <div className="px-5 py-4 space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs text-gray-500">
                    This is your DTR based on recorded attendance logs for the selected range.
                  </p>
                  <button
                    type="button"
                    onClick={handleDownloadMyDtrCsv}
                    disabled={myDtrLogsLoading || !myDtrLogs.length}
                    className="inline-flex items-center rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60"
                  >
                    Download DTR (CSV)
                  </button>
                </div>
                <div className="rounded-lg border border-gray-200 overflow-hidden overflow-x-auto">
                  {myDtrLogsLoading ? (
                    <div className="px-4 py-6 text-center text-gray-500 text-sm">
                      Loading your DTR data…
                    </div>
                  ) : myDtrLogs.length === 0 ? (
                    <div className="px-4 py-6 text-center text-gray-500 text-sm">
                      No attendance records found for this date range.
                    </div>
                  ) : (
                    <table className="min-w-full divide-y divide-gray-200 text-sm">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">Date</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">First in</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">Latest in</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">Latest out</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">Rendered time</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">Late</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200">
                        {myDtrLogs.map((log) => {
                          const seg = getSegments(log);
                          const firstInLog = seg.length > 0 ? seg[0].time_in : log.time_in;
                          const latestInLog = seg.length > 0 ? seg[seg.length - 1].time_in : log.time_in;
                          const lastOutLog = seg.length > 0 ? seg[seg.length - 1].time_out : log.time_out;
                          const totalSec = getLogRenderedSeconds(log);
                          return (
                            <tr key={log.id ?? `${log.user_id}-${log.log_date}`}>
                              <td className="px-4 py-3 text-sm text-gray-900">{log.log_date}</td>
                              <td className="px-4 py-3 text-sm">{formatTimeHHMM(firstInLog)}</td>
                              <td className="px-4 py-3 text-sm">{formatTimeHHMM(latestInLog)}</td>
                              <td className="px-4 py-3 text-sm">{formatTimeHHMM(lastOutLog)}</td>
                              <td className="px-4 py-3 text-sm">{formatHoursMinutesLabel(totalSec)}</td>
                              <td className="px-4 py-3 text-sm">{log.is_late ? 'Yes' : '—'}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            </div>
          </div>,
          document.body
        )}

      {dtrSelected &&
        createPortal(
          <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/50 p-4" onClick={() => setDtrSelected(null)}>
            <div
              className="bg-white rounded-2xl shadow-xl max-w-3xl w-full max-h-[90vh] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between">
                <div>
                  <h2 className="text-base font-semibold text-gray-900">
                    DTR for {getUserDisplayName(usersById[dtrSelected.user_id])}
                  </h2>
                  <p className="mt-0.5 text-xs text-gray-600">
                    Range: {dtrSelected.date_from} – {dtrSelected.date_to} • Status: {dtrSelected.status || 'pending'}
                  </p>
                  {dtrSelected.reason && (
                    <p className="mt-1 text-xs text-gray-500">
                      Remarks: {dtrSelected.reason}
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => setDtrSelected(null)}
                  className="text-gray-400 hover:text-gray-600"
                  aria-label="Close DTR viewer"
                >
                  ✕
                </button>
              </div>
              <div className="px-5 py-4 space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs text-gray-500">
                    This view is only visible to Admin and Monitoring TL/VTL.
                  </p>
                  <button
                    type="button"
                    onClick={handleDownloadDtrCsv}
                    disabled={dtrLogsLoading || !dtrLogs.length}
                    className="inline-flex items-center rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60"
                  >
                    Download DTR (CSV)
                  </button>
                </div>
                <div className="rounded-lg border border-gray-200 overflow-hidden overflow-x-auto">
                  {dtrLogsLoading ? (
                    <div className="px-4 py-6 text-center text-gray-500 text-sm">
                      Loading DTR logs…
                    </div>
                  ) : dtrLogs.length === 0 ? (
                    <div className="px-4 py-6 text-center text-gray-500 text-sm">
                      No attendance logs found for this date range.
                    </div>
                  ) : (
                    <table className="min-w-full divide-y divide-gray-200 text-sm">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">Date</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">First in</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">Latest in</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">Latest out</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">Rendered time</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">Late</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200">
                        {dtrLogs.map((log) => {
                          const seg = getSegments(log);
                          const firstInLog = seg.length > 0 ? seg[0].time_in : log.time_in;
                          const latestInLog = seg.length > 0 ? seg[seg.length - 1].time_in : log.time_in;
                          const lastOutLog = seg.length > 0 ? seg[seg.length - 1].time_out : log.time_out;
                          const totalSec = getLogRenderedSeconds(log);
                          return (
                            <tr key={log.id ?? `${log.user_id}-${log.log_date}`}>
                              <td className="px-4 py-3 text-sm text-gray-900">{log.log_date}</td>
                              <td className="px-4 py-3 text-sm">{formatTimeHHMM(firstInLog)}</td>
                              <td className="px-4 py-3 text-sm">{formatTimeHHMM(latestInLog)}</td>
                              <td className="px-4 py-3 text-sm">{formatTimeHHMM(lastOutLog)}</td>
                              <td className="px-4 py-3 text-sm">{formatHoursMinutesLabel(totalSec)}</td>
                              <td className="px-4 py-3 text-sm">{log.is_late ? 'Yes' : '—'}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            </div>
          </div>,
          document.body
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
