import { useMemo, useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useSupabase } from '../context/supabase.jsx';
import { toast } from 'react-hot-toast';
import { permissions } from '../utils/rolePermissions.js';
import { getRoleDisplayName } from '../utils/rolePermissions.js';
import DailyReportForm from './DailyReportForm.jsx';
import { queryCache } from '../utils/queryCache.js';
import PrettyDatePicker from '../components/PrettyDatePicker.jsx';
import { useSearchParams } from 'react-router-dom';

const PRIMARY = '#6795BE';
const todayStr = () => new Date().toISOString().slice(0, 10);

const SECTION_HEADINGS = [
  'Attendance',
  'Tasks Accomplished',
  'Task Outputs / Results',
  'Issues Encountered',
  'Assistance Requested / Coordination Made',
  'Pending Tasks',
  'Additional Notes (optional)',
];

function formatTime(t) {
  if (!t) return '—';
  const s = String(t);
  if (s.length >= 5) return s.slice(0, 5);
  return s || '—';
}

function formatDateLong(dateStr) {
  if (!dateStr) return '';
  const date = new Date(dateStr + 'T00:00:00');
  return date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

function prettyDateOrFallback(dateStr) {
  return formatDateLong(dateStr) || dateStr || '';
}

// Helper function to group plugins by country
function groupPluginsByCountry(plugins) {
  const grouped = {};
  plugins.forEach((plugin, idx) => {
    const country = plugin.country || 'Unspecified';
    if (!grouped[country]) {
      grouped[country] = [];
    }
    grouped[country].push({ ...plugin, originalIndex: idx });
  });
  return grouped;
}

function toIsoDateLocal(date) {
  const d = date instanceof Date ? date : new Date(date);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function getFridayIsoDates(dateStr) {
  const date = new Date(`${dateStr}T00:00:00`);
  const FRIDAY_INDEX = 5; // 0=Sun ... 5=Fri
  const day = date.getDay();

  // Previous Friday (including today if it's Friday)
  const daysSinceFriday = (day - FRIDAY_INDEX + 7) % 7;
  const prevFriday = new Date(date);
  prevFriday.setDate(prevFriday.getDate() - daysSinceFriday);

  // Next Friday (if today is Friday, next Friday is next week)
  const daysUntilFriday = (FRIDAY_INDEX - day + 7) % 7;
  const nextFriday = new Date(date);
  nextFriday.setDate(nextFriday.getDate() + (daysUntilFriday === 0 ? 7 : daysUntilFriday));

  return {
    isFriday: day === FRIDAY_INDEX,
    prevFridayIso: toIsoDateLocal(prevFriday),
    nextFridayIso: toIsoDateLocal(nextFriday),
  };
}

export default function DailyReportManage() {
  const { supabase, userRole, user } = useSupabase();
  const canManage = permissions.canManageDailyReport(userRole);
  const showMyFormTab = userRole === 'tl' || userRole === 'vtl';
  const showTeamReportTab = userRole === 'admin' || userRole === 'tla' || userRole === 'tl' || userRole === 'vtl';
  // "Prepared by" is always derived from the logged-in account.
  const preparedByValue = user?.user_metadata?.full_name || user?.email || '';
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState('status'); // 'status' | 'questions' | 'my' | 'team' | 'attendanceReports'
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState(todayStr());
  const [interns, setInterns] = useState([]);
  const [submissions, setSubmissions] = useState([]);
  const [questions, setQuestions] = useState([]);
  const [onboardingRecords, setOnboardingRecords] = useState([]);
  const [savingQuestion, setSavingQuestion] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [newQuestionText, setNewQuestionText] = useState('');
  const [newQuestionRequired, setNewQuestionRequired] = useState(true);
  const [responseOpen, setResponseOpen] = useState(false);
  const [responseUserId, setResponseUserId] = useState(null);
  
  // Team Daily Report state
  const [teamReportDate, setTeamReportDate] = useState(todayStr());
  const [teamReport, setTeamReport] = useState(null);
  const [savingTeamReport, setSavingTeamReport] = useState(false);
  const [isEditingTeamReport, setIsEditingTeamReport] = useState(true);

  // Attendance Reports (from team_daily_report.attendance_counts)
  const [attendanceReportRange, setAttendanceReportRange] = useState('30'); // '30' | '90' | 'all'
  const [attendanceReportTab, setAttendanceReportTab] = useState('late'); // 'late' | 'leave' | 'absent'
  const [attendanceReportRows, setAttendanceReportRows] = useState([]);
  const [attendanceReportsLoading, setAttendanceReportsLoading] = useState(false);

  // Deep-link support: /daily-report/manage?tab=attendanceReports&sub=late|leave|absent&range=30|90|all
  useEffect(() => {
    if (!canManage) return;
    const tab = searchParams.get('tab');
    const sub = searchParams.get('sub');
    const range = searchParams.get('range');

    if (tab === 'attendanceReports') setActiveTab('attendanceReports');
    if (sub === 'late' || sub === 'leave' || sub === 'absent') setAttendanceReportTab(sub);
    if (range === '30' || range === '90' || range === 'all') setAttendanceReportRange(range);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canManage]);

  useEffect(() => {
    if (!canManage) return;
    fetchData();
    if (activeTab === 'team' && showTeamReportTab) {
      fetchTeamReport();
    }
  }, [canManage, selectedDate, activeTab, teamReportDate]);

  useEffect(() => {
    if (!canManage) return;
    if (activeTab !== 'attendanceReports') return;
    fetchAttendanceReports();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canManage, activeTab, attendanceReportRange]);

  // Onboarding records contain department (source of truth for IT/HR/Marketing)
  useEffect(() => {
    if (!supabase || !canManage) return;
    const cached = queryCache.get('onboarding:records');
    if (cached && Array.isArray(cached) && cached.length > 0) {
      setOnboardingRecords(cached);
      return;
    }
    supabase
      .from('onboarding_records')
      .select('email, department, name')
      .order('onboarding_datetime', { ascending: false })
      .then(({ data, error }) => {
        if (error) {
          console.warn('DailyReportManage: onboarding_records fetch error', error);
          return;
        }
        setOnboardingRecords(Array.isArray(data) ? data : []);
      });
  }, [supabase, canManage]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const shouldFetchSubs = activeTab === 'status';
      const [usersRes, subsRes, qRes] = await Promise.all([
        supabase
          .from('users')
          .select('id, full_name, email, role, team')
          .in('role', ['intern', 'tl', 'vtl'])
          .order('full_name'),
        shouldFetchSubs
          ? supabase
              .from('daily_report_submissions')
              .select('user_id, report_date, submitted_at, time_in, time_out, answers')
              .eq('report_date', selectedDate)
          : Promise.resolve({ data: [] }),
        supabase.from('daily_report_questions').select('id, sort_order, question_text, required').order('sort_order'),
      ]);
      setInterns(usersRes.data || []);
      setSubmissions(subsRes.data || []);
      setQuestions(qRes.data || []);
    } catch (e) {
      toast.error('Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const submittedMap = Object.fromEntries((submissions || []).map((s) => [s.user_id, s]));
  const selectedIntern = useMemo(() => interns.find((i) => i.id === responseUserId) || null, [interns, responseUserId]);
  const selectedSubmission = useMemo(() => (responseUserId ? submittedMap[responseUserId] : null), [submittedMap, responseUserId]);

  const onboardingByEmail = useMemo(() => {
    const map = new Map();
    (onboardingRecords || []).forEach((r) => {
      const email = (r.email || '').trim().toLowerCase();
      if (email && !map.has(email)) map.set(email, r);
    });
    return map;
  }, [onboardingRecords]);

  const openResponse = (userId) => {
    setResponseUserId(userId);
    setResponseOpen(true);
  };

  const closeResponse = () => {
    setResponseOpen(false);
    setResponseUserId(null);
  };

  const addQuestion = async () => {
    const text = newQuestionText.trim();
    if (!text) return;
    setSavingQuestion(true);
    try {
      const maxOrder = questions.length ? Math.max(...questions.map((q) => q.sort_order)) : 0;
      await supabase.from('daily_report_questions').insert({
        sort_order: maxOrder + 1,
        question_text: text,
        required: newQuestionRequired,
      });
      setNewQuestionText('');
      setNewQuestionRequired(true);
      toast.success('Question added');
      fetchData();
    } catch (e) {
      toast.error(e?.message || 'Failed to add question');
    } finally {
      setSavingQuestion(false);
    }
  };

  const updateQuestion = async (id, field, value) => {
    setSavingQuestion(true);
    try {
      await supabase.from('daily_report_questions').update({ [field]: value, updated_at: new Date().toISOString() }).eq('id', id);
      setEditingId(null);
      toast.success('Updated');
      fetchData();
    } catch (e) {
      toast.error(e?.message || 'Failed to update');
    } finally {
      setSavingQuestion(false);
    }
  };

  const deleteQuestion = async (id) => {
    if (!confirm('Remove this question?')) return;
    setSavingQuestion(true);
    try {
      await supabase.from('daily_report_questions').delete().eq('id', id);
      toast.success('Question removed');
      fetchData();
    } catch (e) {
      toast.error(e?.message || 'Failed to delete');
    } finally {
      setSavingQuestion(false);
    }
  };

  const fetchAutoPluginUpdatesForDate = async (reportDate) => {
    const empty = { old: [], new: [] };
    if (!supabase || !reportDate) return empty;
    try {
      const [{ data: domainsData, error: domainsErr }, { data: updatesData, error: updatesErr }] =
        await Promise.all([
          supabase.from('domains').select('id, type, country'),
          supabase
            .from('task_plugin_update_rows')
            .select('domain_id, country, status, plugin_names, update_status, post_update_check, notes, created_at, updated_at'),
        ]);
      if (domainsErr) throw domainsErr;
      if (updatesErr) throw updatesErr;

      const domainsById = new Map();
      (Array.isArray(domainsData) ? domainsData : []).forEach((d) => {
        if (d?.id) domainsById.set(d.id, d);
      });

      const old = [];
      const newer = [];

      (Array.isArray(updatesData) ? updatesData : []).forEach((row) => {
        const stamp = row?.updated_at || row?.created_at;
        if (!stamp) return;
        const day = String(stamp).slice(0, 10);
        if (day !== reportDate) return;

        const domain = domainsById.get(row.domain_id);
        const domainType = String(domain?.type || 'old').toLowerCase();
        const normalized = {
          country: row?.country || domain?.country || '',
          country_status: row?.status || '',
          country_reason: row?.post_update_check === 'Issue Found' ? (row?.notes || 'Issue Found') : '',
          plugins_updated: row?.plugin_names || '',
          plugin_status: row?.update_status === 'Updated' ? 'Success' : (row?.update_status ? 'Fail' : ''),
          notes: row?.notes || '',
        };

        if (domainType === 'new') newer.push(normalized);
        else old.push(normalized);
      });

      return { old, new: newer };
    } catch (err) {
      console.warn('Auto plugin updates fetch error:', err);
      return empty;
    }
  };

  const fetchAutoNotableTasksForDate = async (reportDate) => {
    // Auto-fill IT Team Leads Assistants Notable Tasks/Contribution
    // from each intern's Daily Report "Tasks Accomplished" answer.
    if (!supabase || !reportDate) return [];
    try {
      // 1) Find the "Tasks Accomplished" question id.
      // DailyReportForm uses questions[1] as the "Tasks Accomplished" section (2.–7 sections).
      const { data: questionsData } = await supabase
        .from('daily_report_questions')
        .select('id, sort_order, question_text')
        .order('sort_order');

      const taskAccomplishedQuestion = (() => {
        const list = Array.isArray(questionsData) ? questionsData : [];
        const byText = list.find((q) => {
          const text = String(q?.question_text || '').toLowerCase();
          return /tasks.*accomplish/i.test(text) || text.includes('tasks accomplished');
        });
        if (byText?.id) return byText;
        const byOrder = list.find((q) => Number(q?.sort_order) === 2);
        if (byOrder?.id) return byOrder;
        return list[1] || null;
      })();

      const taskQuestionId = taskAccomplishedQuestion?.id;
      if (!taskQuestionId) return [];

      // 2) Fetch TLA-team members for name mapping (intern, tl, vtl).
      const { data: tlaUsers } = await supabase
        .from('users')
        .select('id, full_name, email, role, team')
        .in('role', ['intern', 'tl', 'vtl'])
        .order('full_name');

      const userIdToName = new Map();
      const isTlaTeam = (team) => {
        const t = String(team || '').trim().toLowerCase();
        const tNoSpaces = t.replace(/\s+/g, '');
        if (!t) return false;
        return (
          t === 'tla' ||
          tNoSpaces === 'tla' ||
          t.includes('team lead assistant') ||
          tNoSpaces.includes('teamleadassistant') ||
          tNoSpaces.includes('tla')
        );
      };

      (Array.isArray(tlaUsers) ? tlaUsers : [])
        .filter((u) => isTlaTeam(u?.team))
        .forEach((u) => {
          if (u?.id) userIdToName.set(u.id, u.full_name || u.email || '—');
      });

      // If team filtering is too strict for the stored values, avoid showing an empty table.
      // Fallback to all tl/vtl/intern users if we didn't match anything.
      if (userIdToName.size === 0) {
        console.warn('Auto notable tasks: no users matched TLA team filter; falling back to all tl/vtl/intern.');
        (Array.isArray(tlaUsers) ? tlaUsers : []).forEach((u) => {
          if (u?.id) userIdToName.set(u.id, u.full_name || u.email || '—');
        });
      }

      const internIds = Array.from(userIdToName.keys());
      if (internIds.length === 0) return [];

      // 3) Fetch all TLA-team submissions for the report date.
      const { data: subs } = await supabase
        .from('daily_report_submissions')
        .select('user_id, answers')
        .eq('report_date', reportDate)
        .in('user_id', internIds);

      const rows = Array.isArray(subs) ? subs : [];
      const notable = rows
        .map((s) => {
          const answers = s?.answers || {};
          const contribution = String(answers?.[taskQuestionId] || '').trim();
          if (!contribution) return null;
          return {
            member: userIdToName.get(s.user_id) || '—',
            task_contribution: contribution,
          };
        })
        .filter(Boolean);

      return notable;
    } catch (err) {
      console.warn('Auto notable tasks fetch error:', err);
      return [];
    }
  };

  const fetchTeamReport = async () => {
    try {
      const [autoPluginData, autoNotableTasks] = await Promise.all([
        fetchAutoPluginUpdatesForDate(teamReportDate),
        fetchAutoNotableTasksForDate(teamReportDate),
      ]);
      const { data, error } = await supabase
        .from('team_daily_report')
        .select('*')
        .eq('report_date', teamReportDate)
        .maybeSingle();
      
      if (error && error.code !== 'PGRST116') {
        console.warn('Team report fetch error:', error);
      }
      
      if (data) {
        // Parse JSONB fields if they're strings
        const parsed = {
          ...data,
          tasks: typeof data.tasks === 'string' ? JSON.parse(data.tasks) : (data.tasks || {}),
          old_domains_plugins: autoPluginData.old,
          new_domains_plugins: autoPluginData.new,
          notable_tasks: autoNotableTasks,
          course_price_edits: typeof data.course_price_edits === 'string' ? JSON.parse(data.course_price_edits) : (data.course_price_edits || []),
          attendance_counts: typeof data.attendance_counts === 'string' ? JSON.parse(data.attendance_counts) : (data.attendance_counts || {}),
          reviews: typeof data.reviews === 'string' ? JSON.parse(data.reviews) : (data.reviews || {}),
          interns_remaining_hours: typeof data.interns_remaining_hours === 'string' ? JSON.parse(data.interns_remaining_hours) : (data.interns_remaining_hours || []),
        };
        // Always set "prepared_by" from the logged-in account (no manual editing).
        setTeamReport({ ...parsed, prepared_by: preparedByValue });
        setIsEditingTeamReport(false); // Existing report: start in view mode
      } else {
        // Initialize empty report
        setTeamReport({
          report_date: teamReportDate,
          prepared_by: preparedByValue,
          tasks: {
            onboarding_offboarding: '',
            gsc_crawling: '',
            wp_plugins_updates: '',
          },
          old_domains_plugins_date: teamReportDate,
          old_domains_plugins: autoPluginData.old,
          new_domains_plugins_date: teamReportDate,
          new_domains_plugins: autoPluginData.new,
          course_price_edits: [],
          notable_tasks: autoNotableTasks,
          attendance_counts: {
            late: 0,
            notable_late: 0,
            on_leave: 0,
            half_day: 0,
            absent: 0,
          },
          reviews: {
            google: 0,
            glassdoor: 0,
            trustpilot: 0,
          },
          interns_remaining_hours_date: teamReportDate,
          interns_remaining_hours: [],
        });
      }
    } catch (e) {
      console.error('Error fetching team report:', e);
      toast.error('Failed to load team report');
      // Initialize empty report on error
      setTeamReport({
        report_date: teamReportDate,
        prepared_by: preparedByValue,
        tasks: {
          onboarding_offboarding: '',
          gsc_crawling: '',
          wp_plugins_updates: '',
        },
        old_domains_plugins_date: teamReportDate,
        old_domains_plugins: [],
        new_domains_plugins_date: teamReportDate,
        new_domains_plugins: [],
        course_price_edits: [],
        notable_tasks: [],
        attendance_counts: {
          late: 0,
          notable_late: 0,
          on_leave: 0,
          half_day: 0,
          absent: 0,
        },
        reviews: {
          google: 0,
          glassdoor: 0,
          trustpilot: 0,
        },
        interns_remaining_hours_date: teamReportDate,
        interns_remaining_hours: [],
      });
    }
  };

  const fetchAttendanceReports = async (bypassCache = false) => {
    if (!supabase) return;
    const cacheKey = `daily-report:attendance-reports:${attendanceReportRange}`;
    if (!bypassCache) {
      const cached = queryCache.get(cacheKey);
      if (Array.isArray(cached)) {
        setAttendanceReportRows(cached);
        return;
      }
    }
    setAttendanceReportsLoading(true);
    try {
      let q = supabase
        .from('team_daily_report')
        .select('report_date, attendance_counts, prepared_by, updated_at')
        .order('report_date', { ascending: false });

      if (attendanceReportRange !== 'all') {
        const days = Number(attendanceReportRange) || 30;
        const start = new Date();
        start.setDate(start.getDate() - (days - 1));
        const startStr = start.toISOString().slice(0, 10);
        q = q.gte('report_date', startStr);
      }

      const { data, error } = await q.limit(180);
      if (error) throw error;
      const list = (Array.isArray(data) ? data : []).map((row) => ({
        ...row,
        attendance_counts:
          typeof row.attendance_counts === 'string'
            ? JSON.parse(row.attendance_counts)
            : (row.attendance_counts || {}),
      }));
      queryCache.set(cacheKey, list);
      setAttendanceReportRows(list);
    } catch (e) {
      console.warn('Attendance reports fetch error:', e);
      toast.error(e?.message || 'Failed to load attendance reports.');
    } finally {
      setAttendanceReportsLoading(false);
    }
  };

  const saveTeamReport = async () => {
    if (!teamReport) return;
    setSavingTeamReport(true);
    try {
      const payload = {
        report_date: teamReportDate,
        // Always save the logged-in account name.
        prepared_by: preparedByValue,
        tasks: teamReport.tasks || {},
        old_domains_plugins_date: teamReportDate,
        old_domains_plugins: teamReport.old_domains_plugins || [],
        new_domains_plugins_date: teamReportDate,
        new_domains_plugins: teamReport.new_domains_plugins || [],
        course_price_edits: teamReport.course_price_edits || [],
        notable_tasks: teamReport.notable_tasks || [],
        attendance_counts: teamReport.attendance_counts || {},
        reviews: teamReport.reviews || {},
        interns_remaining_hours_date: teamReportDate,
        interns_remaining_hours: teamReport.interns_remaining_hours || [],
        updated_by: user?.id,
      };
      
      if (teamReport.id) {
        const { error } = await supabase
          .from('team_daily_report')
          .update(payload)
          .eq('id', teamReport.id);
        if (error) throw error;
        toast.success('Team report updated');
        setIsEditingTeamReport(false); // Switch to view mode after saving
        fetchTeamReport();
      } else {
        const { error } = await supabase
          .from('team_daily_report')
          .insert({ ...payload, created_by: user?.id });
        if (error) throw error;
        toast.success('Team report saved');
        setIsEditingTeamReport(false); // Switch to view mode after saving
        fetchTeamReport();
      }
    } catch (e) {
      console.error('Save team report error:', e);
      toast.error(e?.message || 'Failed to save team report');
    } finally {
      setSavingTeamReport(false);
    }
  };

  if (!canManage) {
    return (
      <div className="p-6">
        <p className="text-gray-600">You don’t have permission to manage daily reports.</p>
      </div>
    );
  }

  return (
    <div className="w-full space-y-4 sm:space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100" style={{ color: PRIMARY }}>
            Daily Report Management
          </h1>
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
            Track who submitted, view intern responses, and manage the Daily Report Template.
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-4 items-center border-b border-gray-200 dark:border-gray-800 mb-6 mt-2">
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setActiveTab('status')}
            className={`px-4 py-2 rounded-t-lg text-sm font-medium transition-colors ${
              activeTab === 'status'
                ? 'bg-white dark:bg-gray-900 border border-b-0 border-gray-200 dark:border-gray-800 -mb-px text-gray-900 dark:text-gray-100'
                : 'text-gray-600 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800'
            }`}
            style={activeTab === 'status' ? { borderTopColor: PRIMARY } : {}}
          >
            Submission status
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('questions')}
            className={`px-4 py-2 rounded-t-lg text-sm font-medium transition-colors ${
              activeTab === 'questions'
                ? 'bg-white dark:bg-gray-900 border border-b-0 border-gray-200 dark:border-gray-800 -mb-px text-gray-900 dark:text-gray-100'
                : 'text-gray-600 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800'
            }`}
            style={activeTab === 'questions' ? { borderTopColor: PRIMARY } : {}}
          >
            Daily Report Template
          </button>
          {showMyFormTab && (
            <button
              type="button"
              onClick={() => setActiveTab('my')}
              className={`px-4 py-2 rounded-t-lg text-sm font-medium transition-colors ${
                activeTab === 'my'
                  ? 'bg-white dark:bg-gray-900 border border-b-0 border-gray-200 dark:border-gray-800 -mb-px text-gray-900 dark:text-gray-100'
                  : 'text-gray-600 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800'
              }`}
              style={activeTab === 'my' ? { borderTopColor: PRIMARY } : {}}
            >
              My Daily Report
            </button>
          )}
          {showTeamReportTab && (
            <button
              type="button"
              onClick={() => setActiveTab('team')}
              className={`px-4 py-2 rounded-t-lg text-sm font-medium transition-colors ${
                activeTab === 'team'
                  ? 'bg-white dark:bg-gray-900 border border-b-0 border-gray-200 dark:border-gray-800 -mb-px text-gray-900 dark:text-gray-100'
                  : 'text-gray-600 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800'
              }`}
              style={activeTab === 'team' ? { borderTopColor: PRIMARY } : {}}
            >
              Team Daily Report
            </button>
          )}
          {showTeamReportTab && (
            <button
              type="button"
              onClick={() => setActiveTab('attendanceReports')}
              className={`px-4 py-2 rounded-t-lg text-sm font-medium transition-colors ${
                activeTab === 'attendanceReports'
                  ? 'bg-white dark:bg-gray-900 border border-b-0 border-gray-200 dark:border-gray-800 -mb-px text-gray-900 dark:text-gray-100'
                  : 'text-gray-600 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800'
              }`}
              style={activeTab === 'attendanceReports' ? { borderTopColor: PRIMARY } : {}}
            >
              Attendance Reports
            </button>
          )}
        </div>
        {activeTab === 'status' && (
          <div className="flex items-center gap-2">
            <label htmlFor="report-date" className="text-sm font-medium text-gray-700">
              Date:
            </label>
            <PrettyDatePicker
              id="report-date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              ariaLabel="Select report date"
            />
          </div>
        )}
        {activeTab === 'team' && (
          <div className="flex items-center gap-2">
            <label htmlFor="team-report-date" className="text-sm font-medium text-gray-700">
              Date:
            </label>
            <PrettyDatePicker
              id="team-report-date"
              value={teamReportDate}
              onChange={(e) => setTeamReportDate(e.target.value)}
              ariaLabel="Select team report date"
            />
          </div>
        )}
        {activeTab === 'attendanceReports' && (
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-gray-700 dark:text-gray-200">Range:</span>
              <select
                value={attendanceReportRange}
                onChange={(e) => {
                  const v = e.target.value;
                  setAttendanceReportRange(v);
                  const next = new URLSearchParams(searchParams);
                  next.set('tab', 'attendanceReports');
                  next.set('sub', attendanceReportTab);
                  next.set('range', v);
                  setSearchParams(next, { replace: true });
                }}
                className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-[#6795BE]"
              >
                <option value="30">Last 30 days</option>
                <option value="90">Last 90 days</option>
                <option value="all">All time</option>
              </select>
            </div>
            <div className="flex items-center gap-1 rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-1">
              {[
                { id: 'late', label: 'Lates' },
                { id: 'leave', label: 'Leaves' },
                { id: 'absent', label: 'Absences' },
              ].map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => {
                    setAttendanceReportTab(t.id);
                    const next = new URLSearchParams(searchParams);
                    next.set('tab', 'attendanceReports');
                    next.set('sub', t.id);
                    next.set('range', attendanceReportRange);
                    setSearchParams(next, { replace: true });
                  }}
                  className={`px-3 py-1.5 rounded-md text-sm font-semibold transition ${
                    attendanceReportTab === t.id
                      ? 'text-white'
                      : 'text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800'
                  }`}
                  style={attendanceReportTab === t.id ? { backgroundColor: PRIMARY } : {}}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {activeTab === 'status' && (
        <div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-3" style={{ color: PRIMARY }}>
            Submission status for {prettyDateOrFallback(selectedDate)}
          </h2>
          <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 overflow-x-auto">
            <table className="w-full text-sm min-w-[640px] divide-y divide-gray-200 dark:divide-gray-800">
              <thead className="bg-gray-50 dark:bg-gray-950/40">
                <tr>
                  <th className="text-left px-4 py-3 font-semibold text-gray-900 dark:text-gray-100">Date</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-900 dark:text-gray-100">Name</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-900 dark:text-gray-100">Department</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-900 dark:text-gray-100">Role</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-900 dark:text-gray-100">Time in</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-900 dark:text-gray-100">Time out</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-900 dark:text-gray-100">Submitted</th>
                  <th className="text-right px-4 py-3 font-semibold text-gray-900 dark:text-gray-100">Action</th>
                </tr>
              </thead>
              <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-100 dark:divide-gray-800">
                {loading ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-8 text-center text-gray-500 dark:text-gray-400">
                      Loading…
                    </td>
                  </tr>
                ) : interns.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-8 text-center text-gray-500 dark:text-gray-400">
                      No interns in the system.
                    </td>
                  </tr>
                ) : (
                  interns.map((u) => {
                    const sub = submittedMap[u.id];
                    const submitted = !!sub;
                    const emailKey = (u.email || '').trim().toLowerCase();
                    const ob = onboardingByEmail.get(emailKey);
                    const department = (ob?.department || '').trim() || '—';
                    const displayName = (u.full_name || ob?.name || u.email || '—').trim() || '—';
                    return (
                      <tr key={u.id} className="hover:bg-gray-50/80 dark:hover:bg-gray-800/60">
                        <td className="px-4 py-3 text-gray-700 dark:text-gray-300">
                          {prettyDateOrFallback(selectedDate)}
                        </td>
                        <td className="px-4 py-3 font-medium text-gray-900 dark:text-gray-100">
                          {displayName}
                        </td>
                        <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{department}</td>
                        <td className="px-4 py-3 text-gray-600 dark:text-gray-300">
                          {getRoleDisplayName(u.role)}
                        </td>
                        <td className="px-4 py-3 text-gray-700 dark:text-gray-300">
                          {submitted ? formatTime(sub.time_in) : '—'}
                        </td>
                        <td className="px-4 py-3 text-gray-700 dark:text-gray-300">
                          {submitted ? formatTime(sub.time_out) : '—'}
                        </td>
                        <td className="px-4 py-3">
                          {submitted ? (
                            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-green-800 dark:text-green-300 bg-green-50 dark:bg-green-900/30 px-2 py-1 rounded-full">
                              <span className="w-2 h-2 rounded-full bg-green-500 dark:bg-green-400" />
                              Yes
                              {sub.submitted_at && (
                                <span className="text-gray-500 dark:text-gray-400 font-normal text-[11px]">
                                  {new Date(sub.submitted_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                </span>
                              )}
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-900/30 px-2 py-1 rounded-full">
                              <span className="w-2 h-2 rounded-full bg-amber-500 dark:bg-amber-400" />
                              No
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <button
                            type="button"
                            onClick={() => openResponse(u.id)}
                            disabled={!submitted}
                            className="inline-flex items-center justify-center px-3 py-1.5 rounded-lg text-sm font-medium text-white disabled:opacity-50 shadow-sm"
                            style={{ backgroundColor: PRIMARY }}
                          >
                            View
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'questions' && (
        <div className="space-y-6">
          
          <div className="flex gap-2 flex-wrap items-end">
            <input
              type="text"
              value={newQuestionText}
              onChange={(e) => setNewQuestionText(e.target.value)}
              placeholder="New question text"
              className="flex-1 min-w-[200px] h-10 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm text-gray-900 dark:text-gray-100 px-3 focus:ring-2 focus:ring-[#6795BE] focus:border-transparent"
            />
            <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-200">
              <input
                type="checkbox"
                checked={newQuestionRequired}
                onChange={(e) => setNewQuestionRequired(e.target.checked)}
                className="rounded border-gray-300 dark:border-gray-700 text-[#6795BE] focus:ring-[#6795BE]"
              />
              Required
            </label>
            <button
              type="button"
              onClick={addQuestion}
              disabled={savingQuestion || !newQuestionText.trim()}
              className="h-10 px-4 rounded-lg text-sm font-medium text-white disabled:opacity-50 shadow-sm"
              style={{ backgroundColor: PRIMARY }}
            >
              Add question
            </button>
          </div>
          <ul className="space-y-3">
            {questions.map((q, index) => (
              <li
                key={q.id}
                className="flex items-center gap-3 p-3 rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900"
              >
                {editingId === q.id ? (
                  <>
                    <input
                      type="text"
                      defaultValue={q.question_text}
                      onBlur={(e) => updateQuestion(q.id, 'question_text', e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && (e.target.blur(), setEditingId(null))}
                      className="flex-1 rounded border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 px-2 py-1 text-sm"
                      autoFocus
                    />
                    <button
                      type="button"
                      onClick={() => setEditingId(null)}
                      className="text-sm text-gray-600 dark:text-gray-200 hover:underline"
                    >
                      Done
                    </button>
                  </>
                ) : (
                  <>
                    <span className="flex-1 text-gray-900 dark:text-gray-100">
                      <span className="font-semibold mr-2">{index + 1}.</span>
                      {q.question_text}
                    </span>
                    <span className="text-xs text-gray-500 dark:text-gray-400">
                      {q.required ? 'Required' : 'Optional'}
                    </span>
                    <button
                      type="button"
                      onClick={() => setEditingId(q.id)}
                      className="text-sm hover:underline"
                      style={{ color: PRIMARY }}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteQuestion(q.id)}
                      className="text-sm text-red-600 dark:text-red-300 hover:underline"
                    >
                      Remove
                    </button>
                  </>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {responseOpen &&
        selectedIntern &&
        selectedSubmission &&
        createPortal(
          <div className="fixed inset-0 z-[10000] bg-black/20 backdrop-blur-sm flex items-center justify-center px-4">
          <div className="bg-white dark:bg-gray-900 w-full max-w-3xl rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-800 overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-200 dark:border-gray-800 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 truncate" style={{ color: PRIMARY }}>
                  {selectedIntern.full_name || selectedIntern.email || selectedIntern.id}
                </h3>
                <p className="text-sm text-gray-600 dark:text-gray-300">
                  Report date: <span className="font-medium">{prettyDateOrFallback(selectedDate)}</span>
                  {selectedSubmission.submitted_at ? (
                    <>
                      {' '}• Submitted at{' '}
                      <span className="font-medium">
                        {new Date(selectedSubmission.submitted_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </>
                  ) : null}
                </p>
              </div>
              <button
                type="button"
                onClick={closeResponse}
                className="shrink-0 px-3 py-2 rounded-lg text-sm font-medium text-gray-700 dark:text-gray-200 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700"
              >
                Close
              </button>
            </div>

            <div className="p-5 space-y-6 max-h-[75vh] overflow-y-auto">
              {/* 1. Attendance */}
              <div className="space-y-2">
                <h4 className="text-base font-semibold text-gray-900 dark:text-gray-100" style={{ color: PRIMARY }}>
                  1. {SECTION_HEADINGS[0]}
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="rounded-lg border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900 p-3">
                    <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                      Time IN
                    </p>
                    <p className="mt-1 text-sm text-gray-900 dark:text-gray-100">
                      {formatTime(selectedSubmission.time_in)}
                    </p>
                  </div>
                  <div className="rounded-lg border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900 p-3">
                    <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                      Time OUT
                    </p>
                    <p className="mt-1 text-sm text-gray-900 dark:text-gray-100">
                      {formatTime(selectedSubmission.time_out)}
                    </p>
                  </div>
                </div>
                {questions[0] ? (
                  <div className="rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-3">
                    <p className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-1">Notes</p>
                    <p className="text-sm text-gray-700 dark:text-gray-200 whitespace-pre-wrap">
                      {(selectedSubmission.answers || {})[questions[0].id] || '—'}
                    </p>
                  </div>
                ) : null}
              </div>

              {/* 2.–7 */}
              {questions.slice(1, 7).map((q, idx) => (
                <div key={q.id} className="space-y-2">
                  <h4 className="text-base font-semibold text-gray-900 dark:text-gray-100" style={{ color: PRIMARY }}>
                    {idx + 2}. {SECTION_HEADINGS[idx + 1] || 'Section'}
                  </h4>
                  <p className="text-xs text-gray-500 dark:text-gray-400">{q.question_text}</p>
                  <div className="rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-3">
                    <p className="text-sm text-gray-700 dark:text-gray-200 whitespace-pre-wrap">
                      {(selectedSubmission.answers || {})[q.id] || '—'}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>,
        document.body)}

      {activeTab === 'my' && showMyFormTab && user && (
        <div className="mt-4">
          <DailyReportForm />
        </div>
      )}

      {activeTab === 'team' && showTeamReportTab && teamReport && (
        <div className="space-y-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100" style={{ color: PRIMARY }}>
              IT TEAM LEAD ASSISTANT DAILY REPORT
            </h2>
            {isEditingTeamReport ? (
              <button
                type="button"
                onClick={saveTeamReport}
                disabled={savingTeamReport}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-50 shadow-sm"
                style={{ backgroundColor: PRIMARY }}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                {savingTeamReport ? 'Saving...' : 'Save Report'}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setIsEditingTeamReport(true)}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white shadow-sm"
                style={{ backgroundColor: PRIMARY }}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
                Edit
              </button>
            )}
          </div>

          {/* Header: Prepared By */}
          <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 p-4">
            <div className="grid grid-cols-1 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">
                  Prepared by
                </label>
                <input
                  type="text"
                  value={preparedByValue}
                  disabled
                  tabIndex={-1}
                  className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-950 text-gray-700 dark:text-gray-100 px-3 py-2 text-sm cursor-not-allowed pointer-events-none opacity-100"
                />
              </div>
            </div>
          </div>

          {/* Tasks Table */}
          <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 p-4">
            <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-3">New Tasks</h3>
            <table className="w-full text-sm">
              <thead className="bg-gray-50 dark:bg-gray-950/40">
                <tr>
                  <th className="px-4 py-2 text-left font-semibold text-gray-900 dark:text-gray-100">
                    Onboarding and Offboarding Intern
                  </th>
                  <th className="px-4 py-2 text-left font-semibold text-gray-900 dark:text-gray-100">
                    Google Search Console (GSC) Crawling
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="px-4 py-2 border-t border-gray-200 dark:border-gray-800">
                    {isEditingTeamReport ? (
                      <textarea
                        rows={3}
                        value={teamReport.tasks?.onboarding_offboarding || ''}
                        onChange={(e) =>
                          setTeamReport((prev) => ({
                            ...prev,
                            tasks: { ...prev.tasks, onboarding_offboarding: e.target.value },
                          }))
                        }
                        className="w-full rounded border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 px-2 py-1 text-sm"
                        placeholder="Write a short paragraph/sentence (e.g., onboarding/offboarding actions)"
                      />
                    ) : (
                      <p className="text-sm text-gray-900 dark:text-gray-100 py-1 whitespace-pre-wrap">
                        {teamReport.tasks?.onboarding_offboarding || '—'}
                      </p>
                    )}
                  </td>
                  <td className="px-4 py-2 border-t border-gray-200 dark:border-gray-800">
                    {isEditingTeamReport ? (
                      <textarea
                        rows={3}
                        value={teamReport.tasks?.gsc_crawling || ''}
                        onChange={(e) =>
                          setTeamReport((prev) => ({
                            ...prev,
                            tasks: { ...prev.tasks, gsc_crawling: e.target.value },
                          }))
                        }
                        className="w-full rounded border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 px-2 py-1 text-sm"
                        placeholder="Write a short paragraph/sentence (GSC crawling results/actions)"
                      />
                    ) : (
                      <p className="text-sm text-gray-900 dark:text-gray-100 py-1 whitespace-pre-wrap">
                        {teamReport.tasks?.gsc_crawling || '—'}
                      </p>
                    )}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* WordPress Plugins Updates Summary */}
          <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 p-4">
            <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-1">WordPress Plugins Updates</h3>
            <div className="text-sm text-gray-600 dark:text-gray-300">
              {(() => {
                const teamDate = String(teamReportDate || '');
                const d = getFridayIsoDates(teamDate);
                const lastCheckedIso = d.isFriday ? teamDate : d.prevFridayIso;
                const oldRows = teamReport.old_domains_plugins || [];
                const newRows = teamReport.new_domains_plugins || [];

                const oldAllUpdated =
                  oldRows.length > 0 &&
                  oldRows.every(
                    (r) =>
                      String(r?.plugin_status || '').trim() === 'Success' &&
                      String(r?.plugins_updated || '').trim() !== ''
                  );
                const newAllUpdated =
                  newRows.length > 0 &&
                  newRows.every(
                    (r) =>
                      String(r?.plugin_status || '').trim() === 'Success' &&
                      String(r?.plugins_updated || '').trim() !== ''
                  );

                const oldTagText = oldAllUpdated ? 'Old Updated' : 'Old Not finished';
                const newTagText = newAllUpdated ? 'New Updated' : 'New Not finished';

                const oldTagClass = oldAllUpdated
                  ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
                  : 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-200';
                const newTagClass = newAllUpdated
                  ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
                  : 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-200';

                return (
                  <div className="flex flex-wrap items-center gap-2">
                    <span>
                      Last Checked{' '}
                      <span className="font-semibold">{formatDateLong(lastCheckedIso)}</span>
                    </span>
                    {d.isFriday && (
                      <>
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${oldTagClass}`}
                        >
                          {oldTagText}
                        </span>
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${newTagClass}`}
                        >
                          {newTagText}
                        </span>
                      </>
                    )}
                    <span>
                      Next Update on{' '}
                      <span className="font-semibold">{formatDateLong(d.nextFridayIso)}</span>
                    </span>
                  </div>
                );
              })()}
            </div>
          </div>

          {/* Old Domains Plugins Table */}
          <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 p-4">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">
                1. List of Updated Plugins for migrated old domains as of{' '}
                <span className="font-normal text-gray-700 dark:text-gray-300">{formatDateLong(teamReportDate)}</span>
              </h3>
            </div>
            <table className="w-full text-sm table-fixed">
              {isEditingTeamReport ? (
                <colgroup>
                  <col style={{ width: '160px' }} />
                  <col style={{ width: '120px' }} />
                  <col style={{ width: '180px' }} />
                  <col style={{ width: '220px' }} />
                  <col style={{ width: '120px' }} />
                  <col style={{ width: '180px' }} />
                  <col style={{ width: '80px' }} />
                </colgroup>
              ) : (
                <colgroup>
                  <col style={{ width: '160px' }} />
                  <col style={{ width: '120px' }} />
                  <col style={{ width: '180px' }} />
                  <col style={{ width: '220px' }} />
                  <col style={{ width: '120px' }} />
                  <col style={{ width: '180px' }} />
                </colgroup>
              )}
              <thead className="bg-gray-50/70 dark:bg-gray-950/40">
                <tr>
                  <th className="px-4 py-2 text-left font-semibold text-gray-900 dark:text-gray-100">Country</th>
                  <th className="px-4 py-2 text-left font-semibold text-gray-900 dark:text-gray-100">Status</th>
                  <th className="px-4 py-2 text-left font-semibold text-gray-900 dark:text-gray-100">Reason</th>
                  <th className="px-4 py-2 text-left font-semibold text-gray-900 dark:text-gray-100">Plugins Updated</th>
                  <th className="px-4 py-2 text-left font-semibold text-gray-900 dark:text-gray-100">Plugin Status</th>
                  <th className="px-4 py-2 text-left font-semibold text-gray-900 dark:text-gray-100">Notes/Reason</th>
                  {isEditingTeamReport && (
                    <th className="px-4 py-2 text-left font-semibold text-gray-900 dark:text-gray-100 w-20">Action</th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-800 bg-gray-50/70 dark:bg-gray-950/40">
                {(() => {
                  const plugins = teamReport.old_domains_plugins || [];
                  const colSpan = isEditingTeamReport ? 7 : 6;
                  if (plugins.length === 0) {
                    return (
                      <tr className="bg-gray-50/70 dark:bg-gray-950/40">
                        <td
                          colSpan={colSpan}
                          className="px-4 py-8 text-center text-gray-500 dark:text-gray-400 text-sm"
                        >
                          No data{isEditingTeamReport ? ' (auto from Domain Updates)' : ''}.
                        </td>
                      </tr>
                    );
                  }
                  
                  const grouped = groupPluginsByCountry(plugins);
                  const countries = Object.keys(grouped);
                  
                  return countries.map((country, countryIdx) => {
                    const countryPlugins = grouped[country];
                    return countryPlugins.map((plugin, pluginIdx) => {
                      const isFirstPlugin = pluginIdx === 0;
                      const rowSpan = isFirstPlugin ? countryPlugins.length : 0;
                      const idx = plugin.originalIndex;
                      
                      return (
                        <tr
                          key={`old-${idx}`}
                          className="bg-gray-50/70 dark:bg-gray-950/40 hover:bg-gray-50/80 dark:hover:bg-gray-800/60"
                        >
                          {isFirstPlugin && (
                            <td 
                              rowSpan={rowSpan} 
                              className="px-4 py-2 align-top bg-gray-50/70 dark:bg-gray-950/40 font-medium text-gray-900 dark:text-gray-100"
                              style={{ verticalAlign: 'top' }}
                            >
                              <div className="flex items-start gap-2">
                                {isEditingTeamReport ? (
                                  <>
                                    <input
                                      type="text"
                                      value={country === 'Unspecified' ? '' : country}
                                      onChange={(e) => {
                                        const updated = [...plugins];
                                        countryPlugins.forEach((p) => {
                                          updated[p.originalIndex] = { ...updated[p.originalIndex], country: e.target.value };
                                        });
                                        setTeamReport((prev) => ({ ...prev, old_domains_plugins: updated }));
                                      }}
                                      className="flex-1 rounded border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 px-2 py-1 text-sm font-medium"
                                      placeholder="Enter country"
                                    />
                                    {countryPlugins.length > 0 && (
                                      <button
                                        type="button"
                                        onClick={() => {
                                          // Add new plugin to this country
                                          const updated = [...plugins, { country: country === 'Unspecified' ? '' : country, country_status: '', country_reason: '', plugins_updated: '', plugin_status: '', notes: '' }];
                                          setTeamReport((prev) => ({ ...prev, old_domains_plugins: updated }));
                                        }}
                                        className="text-[#6795BE] hover:text-[#5a7fa8] text-sm"
                                        title="Add plugin to this country"
                                      >
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                                        </svg>
                                      </button>
                                    )}
                                  </>
                                ) : (
                                  <p className="text-sm font-medium text-gray-900 dark:text-gray-100 py-1">
                                    {country === 'Unspecified' ? '—' : country}
                                  </p>
                                )}
                              </div>
                            </td>
                          )}
                          {isFirstPlugin && (
                            <td 
                              rowSpan={rowSpan} 
                              className="px-4 py-2 align-top bg-gray-50/70 dark:bg-gray-950/40"
                              style={{ verticalAlign: 'top' }}
                            >
                              {isEditingTeamReport ? (
                                <select
                                  value={plugin.country_status || ''}
                                  onChange={(e) => {
                                    const updated = [...plugins];
                                    countryPlugins.forEach((p) => {
                                      updated[p.originalIndex] = { ...updated[p.originalIndex], country_status: e.target.value };
                                      if (e.target.value !== 'not working') {
                                        updated[p.originalIndex] = { ...updated[p.originalIndex], country_reason: '' };
                                      }
                                    });
                                    setTeamReport((prev) => ({ ...prev, old_domains_plugins: updated }));
                                  }}
                                  className="w-full rounded border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 px-2 py-1 text-sm"
                                >
                                  <option value="">Select status</option>
                                  <option value="working">Working</option>
                                  <option value="not working">Not Working</option>
                                </select>
                              ) : (
                                <p className="text-sm text-gray-900 dark:text-gray-100 py-1">{plugin.country_status || '—'}</p>
                              )}
                            </td>
                          )}
                          {isFirstPlugin && (
                            <td 
                              rowSpan={rowSpan} 
                              className="px-4 py-2 align-top bg-gray-50/70 dark:bg-gray-950/40"
                              style={{ verticalAlign: 'top' }}
                            >
                              {isEditingTeamReport ? (
                                plugin.country_status === 'not working' ? (
                                  <input
                                    type="text"
                                    value={plugin.country_reason || ''}
                                    onChange={(e) => {
                                      const updated = [...plugins];
                                      countryPlugins.forEach((p) => {
                                        updated[p.originalIndex] = { ...updated[p.originalIndex], country_reason: e.target.value };
                                      });
                                      setTeamReport((prev) => ({ ...prev, old_domains_plugins: updated }));
                                    }}
                                    className="w-full rounded border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 px-2 py-1 text-sm"
                                    placeholder="Enter reason"
                                  />
                                ) : (
                                  <p className="text-sm text-gray-500 dark:text-gray-400 py-1">—</p>
                                )
                              ) : (
                                <p className="text-sm text-gray-900 dark:text-gray-100 py-1">{plugin.country_reason || '—'}</p>
                              )}
                            </td>
                          )}
                          <td className="px-4 py-2">
                            {isEditingTeamReport ? (
                              <input
                                type="text"
                                value={plugin.plugins_updated || ''}
                                onChange={(e) => {
                                  const updated = [...plugins];
                                  updated[idx] = { ...updated[idx], plugins_updated: e.target.value };
                                  setTeamReport((prev) => ({ ...prev, old_domains_plugins: updated }));
                                }}
                                className="w-full rounded border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 px-2 py-1 text-sm"
                                placeholder="Enter plugin name"
                              />
                            ) : (
                              <p className="text-sm text-gray-900 dark:text-gray-100 py-1">{plugin.plugins_updated || '—'}</p>
                            )}
                          </td>
                          <td className="px-4 py-2">
                            {isEditingTeamReport ? (
                              <select
                                value={plugin.plugin_status || ''}
                                onChange={(e) => {
                                  const updated = [...plugins];
                                  updated[idx] = { ...updated[idx], plugin_status: e.target.value };
                                  setTeamReport((prev) => ({ ...prev, old_domains_plugins: updated }));
                                }}
                                className="w-full rounded border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 px-2 py-1 text-sm"
                              >
                                <option value="">Select status</option>
                                <option value="Fail">Fail</option>
                                <option value="Success">Success</option>
                              </select>
                            ) : (
                              <p className="text-sm text-gray-900 dark:text-gray-100 py-1">{plugin.plugin_status || '—'}</p>
                            )}
                          </td>
                          <td className="px-4 py-2">
                            {isEditingTeamReport ? (
                              <input
                                type="text"
                                value={plugin.notes || ''}
                                onChange={(e) => {
                                  const updated = [...plugins];
                                  updated[idx] = { ...updated[idx], notes: e.target.value };
                                  setTeamReport((prev) => ({ ...prev, old_domains_plugins: updated }));
                                }}
                                className="w-full rounded border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 px-2 py-1 text-sm"
                                placeholder="Enter notes"
                              />
                            ) : (
                              <p className="text-sm text-gray-900 dark:text-gray-100 py-1">{plugin.notes || '—'}</p>
                            )}
                          </td>
                          {isEditingTeamReport && (
                            <td className="px-4 py-2 w-20">
                              <button
                                type="button"
                                onClick={() => {
                                  const updated = plugins.filter((_, i) => i !== idx);
                                  setTeamReport((prev) => ({ ...prev, old_domains_plugins: updated }));
                                }}
                                className="text-red-600 dark:text-red-300 hover:underline text-sm"
                              >
                                Remove
                              </button>
                            </td>
                          )}
                        </tr>
                      );
                    });
                  }).flat();
                })()}
              </tbody>
            </table>
          </div>

          {/* New Domains Plugins Table */}
          <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 p-4">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">
                2. List of Updated Plugins for migrated new domains as of{' '}
                <span className="font-normal text-gray-700 dark:text-gray-300">{formatDateLong(teamReportDate)}</span>
              </h3>
            </div>
            <table className="w-full text-sm table-fixed">
              {isEditingTeamReport ? (
                <colgroup>
                  <col style={{ width: '160px' }} />
                  <col style={{ width: '120px' }} />
                  <col style={{ width: '180px' }} />
                  <col style={{ width: '220px' }} />
                  <col style={{ width: '120px' }} />
                  <col style={{ width: '180px' }} />
                  <col style={{ width: '80px' }} />
                </colgroup>
              ) : (
                <colgroup>
                  <col style={{ width: '160px' }} />
                  <col style={{ width: '120px' }} />
                  <col style={{ width: '180px' }} />
                  <col style={{ width: '220px' }} />
                  <col style={{ width: '120px' }} />
                  <col style={{ width: '180px' }} />
                </colgroup>
              )}
              <thead className="bg-gray-50/70 dark:bg-gray-950/40">
                <tr>
                  <th className="px-4 py-2 text-left font-semibold text-gray-900 dark:text-gray-100">Country</th>
                  <th className="px-4 py-2 text-left font-semibold text-gray-900 dark:text-gray-100">Status</th>
                  <th className="px-4 py-2 text-left font-semibold text-gray-900 dark:text-gray-100">Reason</th>
                  <th className="px-4 py-2 text-left font-semibold text-gray-900 dark:text-gray-100">Plugins Updated</th>
                  <th className="px-4 py-2 text-left font-semibold text-gray-900 dark:text-gray-100">Plugin Status</th>
                  <th className="px-4 py-2 text-left font-semibold text-gray-900 dark:text-gray-100">Notes/Reason</th>
                  {isEditingTeamReport && (
                    <th className="px-4 py-2 text-left font-semibold text-gray-900 dark:text-gray-100 w-20">Action</th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-800 bg-gray-50/70 dark:bg-gray-950/40">
                {(() => {
                  const plugins = teamReport.new_domains_plugins || [];
                  const colSpan = isEditingTeamReport ? 7 : 6;
                  if (plugins.length === 0) {
                    return (
                      <tr className="bg-gray-50/70 dark:bg-gray-950/40">
                        <td
                          colSpan={colSpan}
                          className="px-4 py-8 text-center text-gray-500 dark:text-gray-400 text-sm"
                        >
                          No data{isEditingTeamReport ? ' (auto from Domain Updates)' : ''}.
                        </td>
                      </tr>
                    );
                  }
                  
                  const grouped = groupPluginsByCountry(plugins);
                  const countries = Object.keys(grouped);
                  
                  return countries.map((country, countryIdx) => {
                    const countryPlugins = grouped[country];
                    return countryPlugins.map((plugin, pluginIdx) => {
                      const isFirstPlugin = pluginIdx === 0;
                      const rowSpan = isFirstPlugin ? countryPlugins.length : 0;
                      const idx = plugin.originalIndex;
                      
                      return (
                        <tr
                          key={`new-${idx}`}
                          className="bg-gray-50/70 dark:bg-gray-950/40 hover:bg-gray-50/80 dark:hover:bg-gray-800/60"
                        >
                          {isFirstPlugin && (
                            <td 
                              rowSpan={rowSpan} 
                              className="px-4 py-2 align-top bg-gray-50/70 dark:bg-gray-950/40 font-medium text-gray-900 dark:text-gray-100"
                              style={{ verticalAlign: 'top' }}
                            >
                              <div className="flex items-start gap-2">
                                {isEditingTeamReport ? (
                                  <>
                                    <input
                                      type="text"
                                      value={country === 'Unspecified' ? '' : country}
                                      onChange={(e) => {
                                        const updated = [...plugins];
                                        countryPlugins.forEach((p) => {
                                          updated[p.originalIndex] = { ...updated[p.originalIndex], country: e.target.value };
                                        });
                                        setTeamReport((prev) => ({ ...prev, new_domains_plugins: updated }));
                                      }}
                                      className="flex-1 rounded border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 px-2 py-1 text-sm font-medium"
                                      placeholder="Enter country"
                                    />
                                    {countryPlugins.length > 0 && (
                                      <button
                                        type="button"
                                        onClick={() => {
                                          // Add new plugin to this country
                                          const updated = [...plugins, { country: country === 'Unspecified' ? '' : country, country_status: '', country_reason: '', plugins_updated: '', plugin_status: '', notes: '' }];
                                          setTeamReport((prev) => ({ ...prev, new_domains_plugins: updated }));
                                        }}
                                        className="text-[#6795BE] hover:text-[#5a7fa8] text-sm"
                                        title="Add plugin to this country"
                                      >
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                                        </svg>
                                      </button>
                                    )}
                                  </>
                                ) : (
                                  <p className="text-sm font-medium text-gray-900 dark:text-gray-100 py-1">
                                    {country === 'Unspecified' ? '—' : country}
                                  </p>
                                )}
                              </div>
                            </td>
                          )}
                          {isFirstPlugin && (
                            <td 
                              rowSpan={rowSpan} 
                              className="px-4 py-2 align-top bg-gray-50/70 dark:bg-gray-950/40"
                              style={{ verticalAlign: 'top' }}
                            >
                              {isEditingTeamReport ? (
                                <select
                                  value={plugin.country_status || ''}
                                  onChange={(e) => {
                                    const updated = [...plugins];
                                    countryPlugins.forEach((p) => {
                                      updated[p.originalIndex] = { ...updated[p.originalIndex], country_status: e.target.value };
                                      if (e.target.value !== 'not working') {
                                        updated[p.originalIndex] = { ...updated[p.originalIndex], country_reason: '' };
                                      }
                                    });
                                    setTeamReport((prev) => ({ ...prev, new_domains_plugins: updated }));
                                  }}
                                  className="w-full rounded border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 px-2 py-1 text-sm"
                                >
                                  <option value="">Select status</option>
                                  <option value="working">Working</option>
                                  <option value="not working">Not Working</option>
                                </select>
                              ) : (
                                <p className="text-sm text-gray-900 dark:text-gray-100 py-1">{plugin.country_status || '—'}</p>
                              )}
                            </td>
                          )}
                          {isFirstPlugin && (
                            <td 
                              rowSpan={rowSpan} 
                              className="px-4 py-2 align-top bg-gray-50/70 dark:bg-gray-950/40"
                              style={{ verticalAlign: 'top' }}
                            >
                              {isEditingTeamReport ? (
                                plugin.country_status === 'not working' ? (
                                  <input
                                    type="text"
                                    value={plugin.country_reason || ''}
                                    onChange={(e) => {
                                      const updated = [...plugins];
                                      countryPlugins.forEach((p) => {
                                        updated[p.originalIndex] = { ...updated[p.originalIndex], country_reason: e.target.value };
                                      });
                                      setTeamReport((prev) => ({ ...prev, new_domains_plugins: updated }));
                                    }}
                                    className="w-full rounded border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 px-2 py-1 text-sm"
                                    placeholder="Enter reason"
                                  />
                                ) : (
                                  <p className="text-sm text-gray-500 dark:text-gray-400 py-1">—</p>
                                )
                              ) : (
                                <p className="text-sm text-gray-900 dark:text-gray-100 py-1">{plugin.country_reason || '—'}</p>
                              )}
                            </td>
                          )}
                          <td className="px-4 py-2">
                            {isEditingTeamReport ? (
                              <input
                                type="text"
                                value={plugin.plugins_updated || ''}
                                onChange={(e) => {
                                  const updated = [...plugins];
                                  updated[idx] = { ...updated[idx], plugins_updated: e.target.value };
                                  setTeamReport((prev) => ({ ...prev, new_domains_plugins: updated }));
                                }}
                                className="w-full rounded border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 px-2 py-1 text-sm"
                                placeholder="Enter plugin name"
                              />
                            ) : (
                              <p className="text-sm text-gray-900 dark:text-gray-100 py-1">{plugin.plugins_updated || '—'}</p>
                            )}
                          </td>
                          <td className="px-4 py-2">
                            {isEditingTeamReport ? (
                              <select
                                value={plugin.plugin_status || ''}
                                onChange={(e) => {
                                  const updated = [...plugins];
                                  updated[idx] = { ...updated[idx], plugin_status: e.target.value };
                                  setTeamReport((prev) => ({ ...prev, new_domains_plugins: updated }));
                                }}
                                className="w-full rounded border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 px-2 py-1 text-sm"
                              >
                                <option value="">Select status</option>
                                <option value="Fail">Fail</option>
                                <option value="Success">Success</option>
                              </select>
                            ) : (
                              <p className="text-sm text-gray-900 dark:text-gray-100 py-1">{plugin.plugin_status || '—'}</p>
                            )}
                          </td>
                          <td className="px-4 py-2">
                            {isEditingTeamReport ? (
                              <input
                                type="text"
                                value={plugin.notes || ''}
                                onChange={(e) => {
                                  const updated = [...plugins];
                                  updated[idx] = { ...updated[idx], notes: e.target.value };
                                  setTeamReport((prev) => ({ ...prev, new_domains_plugins: updated }));
                                }}
                                className="w-full rounded border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 px-2 py-1 text-sm"
                                placeholder="Enter notes"
                              />
                            ) : (
                              <p className="text-sm text-gray-900 dark:text-gray-100 py-1">{plugin.notes || '—'}</p>
                            )}
                          </td>
                          {isEditingTeamReport && (
                            <td className="px-4 py-2 w-20">
                              <button
                                type="button"
                                onClick={() => {
                                  const updated = plugins.filter((_, i) => i !== idx);
                                  setTeamReport((prev) => ({ ...prev, new_domains_plugins: updated }));
                                }}
                                className="text-red-600 dark:text-red-300 hover:underline text-sm"
                              >
                                Remove
                              </button>
                            </td>
                          )}
                        </tr>
                      );
                    });
                  }).flat();
                })()}
              </tbody>
            </table>
          </div>

          {/* Course Price Edits Progress */}
          <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 p-4">
            <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-3">Course List Price Edits Progress</h3>
            <table className="w-full text-sm">
              <thead className="bg-gray-50 dark:bg-gray-950/40">
                <tr>
                  <th className="px-4 py-2 text-left font-semibold text-gray-900 dark:text-gray-100">Country Name</th>
                  <th className="px-4 py-2 text-left font-semibold text-gray-900 dark:text-gray-100">Status</th>
                  <th className="px-4 py-2 text-left font-semibold text-gray-900 dark:text-gray-100">Issue (optional)</th>
                  <th className="px-4 py-2 text-left font-semibold text-gray-900 dark:text-gray-100">Notes (optional)</th>
                  {isEditingTeamReport && (
                    <th className="px-4 py-2 text-left font-semibold text-gray-900 dark:text-gray-100 w-20">Action</th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-800">
                {(teamReport.course_price_edits || []).length === 0 && !isEditingTeamReport ? (
                  <tr>
                    <td colSpan={isEditingTeamReport ? 5 : 4} className="px-4 py-4 text-center text-gray-500 dark:text-gray-400 text-sm">
                      No data
                    </td>
                  </tr>
                ) : (
                  (teamReport.course_price_edits || []).map((row, idx) => (
                    <tr key={idx} className="hover:bg-gray-50/80 dark:hover:bg-gray-800/60">
                      <td className="px-4 py-2">
                        {isEditingTeamReport ? (
                          <input
                            type="text"
                            value={row.country_name || ''}
                            onChange={(e) => {
                              const updated = [...(teamReport.course_price_edits || [])];
                              updated[idx] = { ...updated[idx], country_name: e.target.value };
                              setTeamReport((prev) => ({ ...prev, course_price_edits: updated }));
                            }}
                            className="w-full rounded border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 px-2 py-1 text-sm"
                            placeholder="Enter country name"
                          />
                        ) : (
                          <p className="text-sm text-gray-900 dark:text-gray-100 py-1">{row.country_name || '—'}</p>
                        )}
                      </td>
                      <td className="px-4 py-2">
                        {isEditingTeamReport ? (
                          <select
                            value={row.status || ''}
                            onChange={(e) => {
                              const updated = [...(teamReport.course_price_edits || [])];
                              updated[idx] = { ...updated[idx], status: e.target.value };
                              setTeamReport((prev) => ({ ...prev, course_price_edits: updated }));
                            }}
                            className="w-full rounded border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 px-2 py-1 text-sm"
                          >
                            <option value="">Select status</option>
                            <option value="ongoing">Ongoing</option>
                            <option value="completed">Completed</option>
                          </select>
                        ) : (
                          <p className="text-sm text-gray-900 dark:text-gray-100 py-1">{row.status || '—'}</p>
                        )}
                      </td>
                      <td className="px-4 py-2">
                        {isEditingTeamReport ? (
                          <input
                            type="text"
                            value={row.issue || ''}
                            onChange={(e) => {
                              const updated = [...(teamReport.course_price_edits || [])];
                              updated[idx] = { ...updated[idx], issue: e.target.value };
                              setTeamReport((prev) => ({ ...prev, course_price_edits: updated }));
                            }}
                            className="w-full rounded border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 px-2 py-1 text-sm"
                            placeholder="Enter issue (optional)"
                          />
                        ) : (
                          <p className="text-sm text-gray-900 dark:text-gray-100 py-1">{row.issue || '—'}</p>
                        )}
                      </td>
                      <td className="px-4 py-2">
                        {isEditingTeamReport ? (
                          <input
                            type="text"
                            value={row.notes || ''}
                            onChange={(e) => {
                              const updated = [...(teamReport.course_price_edits || [])];
                              updated[idx] = { ...updated[idx], notes: e.target.value };
                              setTeamReport((prev) => ({ ...prev, course_price_edits: updated }));
                            }}
                            className="w-full rounded border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 px-2 py-1 text-sm"
                            placeholder="Enter notes (optional)"
                          />
                        ) : (
                          <p className="text-sm text-gray-900 dark:text-gray-100 py-1">{row.notes || '—'}</p>
                        )}
                      </td>
                      <td className="px-4 py-2">
                        {isEditingTeamReport && (
                          <button
                            type="button"
                            onClick={() => {
                              const updated = (teamReport.course_price_edits || []).filter((_, i) => i !== idx);
                              setTeamReport((prev) => ({ ...prev, course_price_edits: updated }));
                            }}
                            className="text-red-600 dark:text-red-300 hover:underline text-sm"
                          >
                            Remove
                          </button>
                        )}
                      </td>
                    </tr>
                  ))
                )}
                {isEditingTeamReport && (
                  <tr>
                    <td colSpan={5} className="px-4 py-2">
                      <button
                        type="button"
                        onClick={() => {
                          const updated = [
                            ...(teamReport.course_price_edits || []),
                            { country_name: '', status: '', issue: '', notes: '' },
                          ];
                          setTeamReport((prev) => ({ ...prev, course_price_edits: updated }));
                        }}
                        className="text-sm text-[#6795BE] hover:underline"
                      >
                        + Add Row
                      </button>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Notable Tasks/Contributions */}
          <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 p-4">
            <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-3">
              IT Team Leads Assistants Notable Tasks/Contribution
            </h3>
            <table className="w-full text-sm">
              <thead className="bg-gray-50 dark:bg-gray-950/40">
                <tr>
                  <th className="px-4 py-2 text-left font-semibold text-gray-900 dark:text-gray-100">Member</th>
                  <th className="px-4 py-2 text-left font-semibold text-gray-900 dark:text-gray-100">Task/Contribution</th>
                  {isEditingTeamReport && (
                    <th className="px-4 py-2 text-left font-semibold text-gray-900 dark:text-gray-100 w-20">Action</th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-800">
                {(teamReport.notable_tasks || []).length === 0 && !isEditingTeamReport ? (
                  <tr>
                          <td colSpan={isEditingTeamReport ? 3 : 2} className="px-4 py-4 text-center text-gray-500 dark:text-gray-400 text-sm">
                      No data
                    </td>
                  </tr>
                ) : (
                  (teamReport.notable_tasks || []).map((row, idx) => (
                    <tr key={idx} className="hover:bg-gray-50/80 dark:hover:bg-gray-800/60">
                      <td className="px-4 py-2">
                        {isEditingTeamReport ? (
                          <input
                            type="text"
                            value={row.member || ''}
                            onChange={(e) => {
                              const updated = [...(teamReport.notable_tasks || [])];
                              updated[idx] = { ...updated[idx], member: e.target.value };
                              setTeamReport((prev) => ({ ...prev, notable_tasks: updated }));
                            }}
                            className="w-full rounded border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 px-2 py-1 text-sm"
                          />
                        ) : (
                          <p className="text-sm text-gray-900 dark:text-gray-100 py-1">{row.member || '—'}</p>
                        )}
                      </td>
                      <td className="px-4 py-2">
                        {isEditingTeamReport ? (
                          <input
                            type="text"
                            value={row.task_contribution || ''}
                            onChange={(e) => {
                              const updated = [...(teamReport.notable_tasks || [])];
                              updated[idx] = { ...updated[idx], task_contribution: e.target.value };
                              setTeamReport((prev) => ({ ...prev, notable_tasks: updated }));
                            }}
                            className="w-full rounded border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 px-2 py-1 text-sm"
                          />
                        ) : (
                          <p className="text-sm text-gray-900 dark:text-gray-100 py-1">{row.task_contribution || '—'}</p>
                        )}
                      </td>
                      {isEditingTeamReport && (
                        <td className="px-4 py-2">
                          <button
                            type="button"
                            onClick={() => {
                              const updated = (teamReport.notable_tasks || []).filter((_, i) => i !== idx);
                              setTeamReport((prev) => ({ ...prev, notable_tasks: updated }));
                            }}
                            className="text-red-600 dark:text-red-300 hover:underline text-sm"
                          >
                            Remove
                          </button>
                        </td>
                      )}
                    </tr>
                  ))
                )}
                {isEditingTeamReport && (
                  <tr>
                    <td colSpan={3} className="px-4 py-2">
                      <button
                        type="button"
                        onClick={() => {
                          const updated = [...(teamReport.notable_tasks || []), { member: '', task_contribution: '' }];
                          setTeamReport((prev) => ({ ...prev, notable_tasks: updated }));
                        }}
                        className="text-sm text-[#6795BE] hover:underline"
                      >
                        + Add Row
                      </button>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <hr className="my-6 border-gray-300 dark:border-gray-800" />

          {/* Monitoring Team Updates */}
          <div className="space-y-6">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Monitoring Team Updates</h3>

            {/* Today's Attendance */}
            <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 p-4">
              <h4 className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-3">Today's Attendance</h4>
              <table className="w-full text-sm">
                <thead className="bg-gray-50 dark:bg-gray-950/40">
                  <tr>
                    <th className="px-4 py-2 text-left font-semibold text-gray-900 dark:text-gray-100">Status</th>
                    <th className="px-4 py-2 text-left font-semibold text-gray-900 dark:text-gray-100">Count</th>
                    <th className="px-4 py-2 text-left font-semibold text-gray-900 dark:text-gray-100">Names</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-800">
                  {[
                    { key: 'late', label: 'Late' },
                    { key: 'notable_late', label: 'Notable Late' },
                    { key: 'on_leave', label: 'On Leave' },
                    { key: 'half_day', label: 'Half Day' },
                    { key: 'absent', label: 'Absent' },
                  ].map(({ key, label }) => (
                    <tr key={key} className="hover:bg-gray-50/80 dark:hover:bg-gray-800/60">
                      <td className="px-4 py-2 text-gray-700 dark:text-gray-300">{label}</td>
                      <td className="px-4 py-2">
                        {isEditingTeamReport ? (
                          <input
                            type="number"
                            min="0"
                            value={teamReport.attendance_counts?.[key] || 0}
                            onChange={(e) => {
                              const count = parseInt(e.target.value) || 0;
                              const namesKey = `${key}_names`;
                              setTeamReport((prev) => {
                                const currentNames = prev.attendance_counts?.[namesKey] || [];
                                const nextNames = [
                                  ...currentNames.slice(0, count),
                                  ...Array(Math.max(0, count - currentNames.length)).fill(''),
                                ];
                                return {
                                  ...prev,
                                  attendance_counts: {
                                    ...prev.attendance_counts,
                                    [key]: count,
                                    [namesKey]: nextNames,
                                  },
                                };
                              });
                            }}
                            className="w-full rounded border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 px-2 py-1 text-sm"
                          />
                        ) : (
                          <p className="text-sm text-gray-900 dark:text-gray-100 py-1">{teamReport.attendance_counts?.[key] || 0}</p>
                        )}
                      </td>
                      <td className="px-4 py-2">
                        {(() => {
                          const count = teamReport.attendance_counts?.[key] || 0;
                          const namesKey = `${key}_names`;
                          const names = teamReport.attendance_counts?.[namesKey] || [];
                          const safeNames = Array.from({ length: count }, (_, i) => names[i] || '');

                          if (!isEditingTeamReport) {
                            const filled = safeNames.filter(Boolean);
                            return (
                              <p className="text-sm text-gray-900 dark:text-gray-100 py-1">
                                {filled.length > 0 ? filled.join(', ') : '—'}
                              </p>
                            );
                          }

                          return (
                            <div className="space-y-2">
                              {safeNames.map((name, idx) => (
                                <input
                                  key={`${key}-name-${idx}`}
                                  type="text"
                                  value={name}
                                  onChange={(e) => {
                                    const nextVal = e.target.value;
                                    setTeamReport((prev) => {
                                      const nextNames = [...(prev.attendance_counts?.[namesKey] || [])];
                                      nextNames[idx] = nextVal;
                                      return {
                                        ...prev,
                                        attendance_counts: {
                                          ...prev.attendance_counts,
                                          [namesKey]: nextNames,
                                        },
                                      };
                                    });
                                  }}
                                  placeholder={`Name ${idx + 1}`}
                                  className="w-full rounded border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 px-2 py-1 text-sm"
                                />
                              ))}
                              {count === 0 && (
                                <p className="text-sm text-gray-500 dark:text-gray-400">No names</p>
                              )}
                            </div>
                          );
                        })()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Reviews */}
            <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 p-4">
              <h4 className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-3">Knowles Training Institute Reviews</h4>
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <label className="text-sm text-gray-700 dark:text-gray-300 w-32">Google:</label>
                  {isEditingTeamReport ? (
                    <>
                      <input
                        type="number"
                        min="0"
                        value={teamReport.reviews?.google || 0}
                        onChange={(e) =>
                          setTeamReport((prev) => ({
                            ...prev,
                            reviews: { ...prev.reviews, google: parseInt(e.target.value) || 0 },
                          }))
                        }
                        className="rounded border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 px-2 py-1 text-sm"
                      />
                      <span className="text-sm text-gray-600 dark:text-gray-300">reviews</span>
                    </>
                  ) : (
                    <span className="text-sm text-gray-900 dark:text-gray-100">
                      There are now {teamReport.reviews?.google || 0} Google reviews.
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <label className="text-sm text-gray-700 dark:text-gray-300 w-32">Glassdoor:</label>
                  {isEditingTeamReport ? (
                    <>
                      <input
                        type="number"
                        min="0"
                        value={teamReport.reviews?.glassdoor || 0}
                        onChange={(e) =>
                          setTeamReport((prev) => ({
                            ...prev,
                            reviews: { ...prev.reviews, glassdoor: parseInt(e.target.value) || 0 },
                          }))
                        }
                        className="rounded border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 px-2 py-1 text-sm"
                      />
                      <span className="text-sm text-gray-600 dark:text-gray-300">reviews</span>
                    </>
                  ) : (
                    <span className="text-sm text-gray-900 dark:text-gray-100">
                      There are now {teamReport.reviews?.glassdoor || 0} Glassdoor reviews.
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <label className="text-sm text-gray-700 dark:text-gray-300 w-32">Trustpilot:</label>
                  {isEditingTeamReport ? (
                    <>
                      <input
                        type="number"
                        min="0"
                        value={teamReport.reviews?.trustpilot || 0}
                        onChange={(e) =>
                          setTeamReport((prev) => ({
                            ...prev,
                            reviews: { ...prev.reviews, trustpilot: parseInt(e.target.value) || 0 },
                          }))
                        }
                        className="rounded border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 px-2 py-1 text-sm"
                      />
                      <span className="text-sm text-gray-600 dark:text-gray-300">reviews</span>
                    </>
                  ) : (
                    <span className="text-sm text-gray-900 dark:text-gray-100">
                      There are now {teamReport.reviews?.trustpilot || 0} Trustpilot reviews.
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Interns Remaining Hours */}
            <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 p-4">
              <div className="mb-3">
                <h4 className="text-base font-semibold text-gray-900 dark:text-gray-100">
                  List of Interns' Remaining Hours (Less than 100){' '}
                  <span className="font-normal text-gray-700 dark:text-gray-300">({formatDateLong(teamReportDate)})</span>
                </h4>
              </div>
              <table className="w-full text-sm">
                <thead className="bg-gray-50 dark:bg-gray-950/40">
                  <tr>
                    <th className="px-4 py-2 text-left font-semibold text-gray-900 dark:text-gray-100">List Of Interns</th>
                    <th className="px-4 py-2 text-left font-semibold text-gray-900 dark:text-gray-100">Hours Remaining</th>
                    <th className="px-4 py-2 text-left font-semibold text-gray-900 dark:text-gray-100">Designation</th>
                    {isEditingTeamReport && (
                      <th className="px-4 py-2 text-left font-semibold text-gray-900 dark:text-gray-100 w-20">Action</th>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-800">
                  {(teamReport.interns_remaining_hours || []).length === 0 && !isEditingTeamReport ? (
                    <tr>
                      <td colSpan={isEditingTeamReport ? 4 : 3} className="px-4 py-4 text-center text-gray-500 dark:text-gray-400 text-sm">
                        No data
                      </td>
                    </tr>
                  ) : (
                    (teamReport.interns_remaining_hours || []).map((row, idx) => (
                      <tr key={idx} className="hover:bg-gray-50/80 dark:hover:bg-gray-800/60">
                        <td className="px-4 py-2">
                          {isEditingTeamReport ? (
                            <input
                              type="text"
                              value={row.intern_name || ''}
                              onChange={(e) => {
                                const updated = [...(teamReport.interns_remaining_hours || [])];
                                updated[idx] = { ...updated[idx], intern_name: e.target.value };
                                setTeamReport((prev) => ({ ...prev, interns_remaining_hours: updated }));
                              }}
                              className="w-full rounded border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 px-2 py-1 text-sm"
                              placeholder="e.g., Christian Chuck"
                            />
                          ) : (
                            <p className="text-sm text-gray-900 dark:text-gray-100 py-1">{row.intern_name || '—'}</p>
                          )}
                        </td>
                        <td className="px-4 py-2">
                          {isEditingTeamReport ? (
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              value={row.hours_remaining || ''}
                              onChange={(e) => {
                                const updated = [...(teamReport.interns_remaining_hours || [])];
                                updated[idx] = { ...updated[idx], hours_remaining: parseFloat(e.target.value) || 0 };
                                setTeamReport((prev) => ({ ...prev, interns_remaining_hours: updated }));
                              }}
                              className="w-full rounded border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 px-2 py-1 text-sm"
                              placeholder="e.g., 24.5"
                            />
                          ) : (
                            <p className="text-sm text-gray-900 dark:text-gray-100 py-1">{row.hours_remaining || '—'}</p>
                          )}
                        </td>
                        <td className="px-4 py-2">
                          {isEditingTeamReport ? (
                            <input
                              type="text"
                              value={row.designation || ''}
                              onChange={(e) => {
                                const updated = [...(teamReport.interns_remaining_hours || [])];
                                updated[idx] = { ...updated[idx], designation: e.target.value };
                                setTeamReport((prev) => ({ ...prev, interns_remaining_hours: updated }));
                              }}
                              className="w-full rounded border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 px-2 py-1 text-sm"
                              placeholder="e.g., Intern / Team Member"
                            />
                          ) : (
                            <p className="text-sm text-gray-900 dark:text-gray-100 py-1">{row.designation || '—'}</p>
                          )}
                        </td>
                        <td className="px-4 py-2">
                          {isEditingTeamReport && (
                            <button
                              type="button"
                              onClick={() => {
                                const updated = (teamReport.interns_remaining_hours || []).filter((_, i) => i !== idx);
                                setTeamReport((prev) => ({ ...prev, interns_remaining_hours: updated }));
                              }}
                              className="text-red-600 dark:text-red-300 hover:underline text-sm"
                            >
                              Remove
                            </button>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                  {isEditingTeamReport && (
                    <tr>
                      <td colSpan={4} className="px-4 py-2">
                        <button
                          type="button"
                          onClick={() => {
                            const updated = [...(teamReport.interns_remaining_hours || []), { intern_name: '', hours_remaining: 0, designation: '' }];
                            setTeamReport((prev) => ({ ...prev, interns_remaining_hours: updated }));
                          }}
                          className="text-sm text-[#6795BE] hover:underline"
                        >
                          + Add Row
                        </button>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'attendanceReports' && showTeamReportTab && (
        <div>
          <div className="flex items-baseline justify-between mb-3">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100" style={{ color: PRIMARY }}>
              Attendance Reports
            </h2>
            <p className="text-sm text-gray-600 dark:text-gray-300">
              Click a date row to open that day’s Team Daily Report.
            </p>
          </div>

          <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 overflow-x-auto">
            <table className="w-full text-sm min-w-[720px] divide-y divide-gray-200 dark:divide-gray-800">
              <thead className="bg-gray-50 dark:bg-gray-950/40">
                <tr>
                  <th className="text-left px-4 py-3 font-semibold text-gray-900 dark:text-gray-100">Date</th>
                  {attendanceReportTab === 'late' && (
                    <>
                      <th className="text-left px-4 py-3 font-semibold text-gray-900 dark:text-gray-100">Late</th>
                      <th className="text-left px-4 py-3 font-semibold text-gray-900 dark:text-gray-100">Notable late</th>
                    </>
                  )}
                  {attendanceReportTab === 'leave' && (
                    <th className="text-left px-4 py-3 font-semibold text-gray-900 dark:text-gray-100">On leave</th>
                  )}
                  {attendanceReportTab === 'absent' && (
                    <>
                      <th className="text-left px-4 py-3 font-semibold text-gray-900 dark:text-gray-100">Absent</th>
                      <th className="text-left px-4 py-3 font-semibold text-gray-900 dark:text-gray-100">Half-day</th>
                    </>
                  )}
                  <th className="text-left px-4 py-3 font-semibold text-gray-900 dark:text-gray-100">Prepared by</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-900 dark:text-gray-100">Updated</th>
                </tr>
              </thead>
              <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-100 dark:divide-gray-800">
                {attendanceReportsLoading ? (
                  <tr>
                    <td
                      colSpan={attendanceReportTab === 'leave' ? 4 : 5}
                      className="px-4 py-8 text-center text-gray-500 dark:text-gray-400"
                    >
                      Loading…
                    </td>
                  </tr>
                ) : attendanceReportRows.length === 0 ? (
                  <tr>
                    <td
                      colSpan={attendanceReportTab === 'leave' ? 4 : 5}
                      className="px-4 py-8 text-center text-gray-500 dark:text-gray-400"
                    >
                      No team daily reports found for the selected range.
                    </td>
                  </tr>
                ) : (
                  attendanceReportRows.map((row) => {
                    const counts = row.attendance_counts || {};
                    const onClick = () => {
                      setTeamReportDate(row.report_date);
                      setActiveTab('team');
                    };
                    return (
                      <tr
                        key={row.report_date}
                        className="hover:bg-gray-50/80 dark:hover:bg-gray-800/60 cursor-pointer"
                        onClick={onClick}
                        title="Open Team Daily Report"
                      >
                        <td className="px-4 py-3 font-medium text-gray-900 dark:text-gray-100">
                          {prettyDateOrFallback(row.report_date)}
                        </td>
                        {attendanceReportTab === 'late' && (
                          <>
                            <td className="px-4 py-3 text-gray-700 dark:text-gray-300">{Number(counts.late) || 0}</td>
                            <td className="px-4 py-3 text-gray-700 dark:text-gray-300">{Number(counts.notable_late) || 0}</td>
                          </>
                        )}
                        {attendanceReportTab === 'leave' && (
                          <td className="px-4 py-3 text-gray-700 dark:text-gray-300">{Number(counts.on_leave) || 0}</td>
                        )}
                        {attendanceReportTab === 'absent' && (
                          <>
                            <td className="px-4 py-3 text-gray-700 dark:text-gray-300">{Number(counts.absent) || 0}</td>
                            <td className="px-4 py-3 text-gray-700 dark:text-gray-300">{Number(counts.half_day) || 0}</td>
                          </>
                        )}
                        <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{row.prepared_by || '—'}</td>
                        <td className="px-4 py-3 text-gray-600 dark:text-gray-300">
                          {row.updated_at ? new Date(row.updated_at).toLocaleString() : '—'}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
