import { useEffect, useState, useMemo } from 'react';
import { useSupabase } from '../context/supabase.jsx';
import { toast } from 'react-hot-toast';
import { TEAMS } from '../utils/rolePermissions.js';
import PrettyDatePicker from '../components/PrettyDatePicker.jsx';
import { taskStatusPill } from '../utils/uiPills.js';
import { loadUiState, makeUiStateKey, saveUiState } from '../utils/uiState.js';

const PRIMARY = '#6795BE';
const todayStr = () => new Date().toISOString().slice(0, 10);
const formatMdy = (value) => {
  if (!value) return '—';
  const d = new Date(`${value}T00:00:00`);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
};

const MONITORING_TASK_CATEGORIES = [
  {
    category: 'Team Lead/Vice Team Lead Task',
    tasks: [
      'Daily Report',
      'List all remaining hours of PAT1 and send them to their TL by 17:00'
    ]
  },
  {
    category: 'Everyday Tasks',
    tasks: [
      'Attendance check-in',
      'Attendance check-out',
      'Message via MS Teams interns who forgot to check out or didn’t check out on time',
      'Send an email to interns regarding their tardiness in today’s attendance',
      'Send an email to interns who have 200 hours or less, and 100 hours or less remaining, by 17:00',
      'Daily Wordfence scan for knowlesti.sg and send scan result to Sir Erick'
    ]
  },
  {
    category: 'Weekly Updates',
    tasks: [
      'Wordfence scan on the domains list (Done daily until complete)',
      'Update the Notable Lates sheet (Every last day of the week)'
    ]
  },
  {
    category: 'For Absent Interns',
    tasks: [
      'Message via MS Teams interns who were absent',
      'Update the Absent sheet'
    ]
  },
  {
    category: 'First working day of the month',
    tasks: [
      'Monthly changing of password for both domains',
      "Create next month's monitoring attendance sheet"
    ]
  },
  {
    category: 'For No-Task Interns',
    tasks: [
      'Study Calendar Deletion',
      'Review the monthly changing of password for domains'
    ]
  },
  {
    category: 'For New Interns Onboarding',
    tasks: [
      'Update the Intern Main sheet (must be updated when a new intern joins)',
      'Update the Attendance sheet (must be updated when a new intern joins)',
      'Update the Onboarding list (must be updated when a new intern joins)',
      'Create an OfficeTimer account for the new intern (must be updated when a new intern joins)',
      '(Optional) Welcome newly onboarded interns through email (optional - ask for Sir Erick\'s permission before proceeding)',
      'Present the pre-recorded video during the pre-onboarding orientation meeting'
    ]
  },
  {
    category: 'For Interns Offboarding',
    tasks: [
      'Update the Offboarding list & chat (To be done on an interns last day)',
      'Message offboarding instructions (To be done on an interns last day)',
      'Email interns when they check out on their last day (To be done on an interns last day)',
      'Create the DTR and send it through email by 16:30 (To be done on an interns last day, can also when the intern is not yet finished but has less than 20 hours remaining)',
      'Deactivate the OfficeTimer account once the intern is offboarded (To be done when the intern is offboarded, maybe completed after 3 days)',
      'Delete the account of withdrawn interns in OfficeTimer (To be done after 5 days of being withdrawn)'
    ]
  }
];

export default function MonitoringTasks({ embedded = false }) {
  const { supabase, user, userRole, userTeam } = useSupabase();
  const [selectedDate, setSelectedDate] = useState(todayStr());
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [tasksData, setTasksData] = useState([]); // Array of { task_name, assigned_to, status, notes }
  const [monitoringUsers, setMonitoringUsers] = useState([]);
  const [myTasksOnly, setMyTasksOnly] = useState(false);
  const [onboardingRecords, setOnboardingRecords] = useState([]);
  const [viewTab, setViewTab] = useState('tasks'); // 'tasks' | 'intern-records'

  // Interns record state (admin/monitoring leads)
  const [recordsTeamTab, setRecordsTeamTab] = useState(TEAMS.MONITORING); // 'tla' | 'monitoring' | 'pat1'
  const [recordsLoading, setRecordsLoading] = useState(false);
  const [internRecords, setInternRecords] = useState([]);
  const [recordModalOpen, setRecordModalOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState(null);
  const [recordForm, setRecordForm] = useState({
    last_name: '',
    first_name: '',
    hours_per_day: '',
    total_request: '',
    hours_rendered: '',
    start_date: '',
    target_end_1: '',
    target_end_2: '',
  });

  // UI: which task categories are expanded (for dropdown-style view)
  const [openCategories, setOpenCategories] = useState(() => new Set(MONITORING_TASK_CATEGORIES.map((c) => c.category)));

  // Persist UI state across navigation within this session
  useEffect(() => {
    const key = makeUiStateKey({ userId: user?.id, scope: embedded ? 'monitoringTasks:embedded' : 'monitoringTasks' });
    const cached = loadUiState(key);
    if (!cached) return;
    if (cached.selectedDate) setSelectedDate(cached.selectedDate);
    if (cached.viewTab) setViewTab(cached.viewTab);
    if (typeof cached.myTasksOnly === 'boolean') setMyTasksOnly(cached.myTasksOnly);
    if (Array.isArray(cached.openCategories)) setOpenCategories(new Set(cached.openCategories));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, embedded]);

  useEffect(() => {
    const key = makeUiStateKey({ userId: user?.id, scope: embedded ? 'monitoringTasks:embedded' : 'monitoringTasks' });
    saveUiState(key, {
      selectedDate,
      viewTab,
      myTasksOnly,
      openCategories: Array.from(openCategories),
    });
  }, [user?.id, embedded, selectedDate, viewTab, myTasksOnly, openCategories]);

  const persistUiStateNow = (next) => {
    const key = makeUiStateKey({
      userId: user?.id,
      scope: embedded ? 'monitoringTasks:embedded' : 'monitoringTasks',
    });
    saveUiState(key, {
      selectedDate: next?.selectedDate ?? selectedDate,
      viewTab: next?.viewTab ?? viewTab,
      myTasksOnly: next?.myTasksOnly ?? myTasksOnly,
      openCategories: next?.openCategories ?? Array.from(openCategories),
    });
  };

  // Verify access: Only Monitoring team or Admin
  const isMonitoringTeam = String(userTeam || '').toLowerCase().includes('monitoring');
  const isAdmin = userRole === 'admin';
  const canAccess = isMonitoringTeam || isAdmin;
  // Intern records (team tab switch): Admin OR Monitoring staff leads/members (same as admin per request)
  // - Admin: all
  // - Monitoring Team role: all (TLA/Monitoring/PAT1)
  // - Monitoring TL/VTL: all (TLA/Monitoring/PAT1)
  // - Monitoring Intern: all (TLA/Monitoring/PAT1)
  const isMonitoringLead = isMonitoringTeam && (userRole === 'tl' || userRole === 'vtl');
  const isMonitoringStaff = userRole === 'monitoring_team' && isMonitoringTeam;
  const isMonitoringIntern = userRole === 'intern' && isMonitoringTeam;
  const canManageAllTeamsInternRecords = isAdmin || isMonitoringStaff || isMonitoringLead || isMonitoringIntern;

  useEffect(() => {
    if (!canAccess) return;
    fetchMonitoringUsers();
    fetchOnboardingRecords();
  }, [canAccess]);

  useEffect(() => {
    if (!canAccess) return;
    fetchDailyRecord(selectedDate);
  }, [selectedDate, canAccess]);

  useEffect(() => {
    if (!canAccess) return;
    if (viewTab !== 'intern-records') return;
    fetchInternRecords();
  }, [canAccess, viewTab, recordsTeamTab]);

  useEffect(() => {
    // Non-admin monitoring members can manage Monitoring records only
    if (!canAccess) return;
    if (canManageAllTeamsInternRecords) return;
    setRecordsTeamTab(TEAMS.MONITORING);
  }, [canAccess, canManageAllTeamsInternRecords]);

  const fetchMonitoringUsers = async () => {
    const { data } = await supabase
      .from('users')
      .select('id, full_name, email, role, team')
      .order('full_name', { ascending: true });
    
    if (data) {
      // Filter for monitoring team only (or include all if we want, but usually just monitoring)
      const filtered = data.filter(u => String(u.team || '').toLowerCase().includes('monitoring') || u.role === 'admin');
      setMonitoringUsers(filtered);
    }
  };

  const fetchOnboardingRecords = async () => {
    const { data } = await supabase
      .from('onboarding_records')
      .select('name, email')
      .order('onboarding_datetime', { ascending: false });
    if (data) setOnboardingRecords(data);
  };

  const onboardingByNameByEmail = useMemo(() => {
    const map = new Map();
    (onboardingRecords || []).forEach((r) => {
      const email = (r.email || '').trim().toLowerCase();
      const name = (r.name || '').trim();
      if (email && name && !map.has(email)) map.set(email, name);
    });
    return map;
  }, [onboardingRecords]);

  const getUserDisplayName = (uId) => {
    if (!uId) return 'Unassigned';
    const u = monitoringUsers.find(x => x.id === uId);
    if (!u) return 'Unknown User';
    
    const fromUser = (u?.full_name || '').trim();
    if (fromUser) return fromUser;
    
    const email = (u?.email || '').trim().toLowerCase();
    const fromOnboarding = email ? onboardingByNameByEmail.get(email) : null;
    return (fromOnboarding || '').trim() || u.email || 'Unnamed';
  };

  const fetchDailyRecord = async (date) => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('monitoring_daily_records')
        .select('*')
        .eq('record_date', date)
        .maybeSingle();

      if (error && error.code !== 'PGRST116') throw error;

      if (data && data.tasks_data) {
        setTasksData(typeof data.tasks_data === 'string' ? JSON.parse(data.tasks_data) : data.tasks_data);
      } else {
        setTasksData([]); // Empty for new day
      }
    } catch (err) {
      console.error('Fetch monitoring records error:', err);
      toast.error('Failed to load records.');
    } finally {
      setLoading(false);
    }
  };

  const resetRecordForm = () => {
    setRecordForm({
      last_name: '',
      first_name: '',
      hours_per_day: '',
      total_request: '',
      hours_rendered: '',
      start_date: '',
      target_end_1: '',
      target_end_2: '',
    });
  };

  const openAddRecord = () => {
    setEditingRecord(null);
    resetRecordForm();
    setRecordModalOpen(true);
  };

  const openEditRecord = (rec) => {
    setEditingRecord(rec);
    setRecordForm({
      last_name: rec?.last_name || '',
      first_name: rec?.first_name || '',
      hours_per_day: rec?.hours_per_day ?? '',
      total_request: rec?.total_request ?? '',
      hours_rendered: rec?.hours_rendered ?? '',
      start_date: rec?.start_date || '',
      target_end_1: rec?.target_end_1 || '',
      target_end_2: rec?.target_end_2 || '',
    });
    setRecordModalOpen(true);
  };

  const closeRecordModal = () => {
    setRecordModalOpen(false);
    setEditingRecord(null);
    resetRecordForm();
  };

  const fetchInternRecords = async () => {
    if (!supabase) return;
    setRecordsLoading(true);
    try {
      const { data, error } = await supabase
        .from('intern_records')
        .select('*')
        .eq('team', recordsTeamTab)
        .order('last_name', { ascending: true });
      if (error) throw error;
      setInternRecords(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Fetch intern_records error:', err);
      toast.error('Failed to load interns record.');
      setInternRecords([]);
    } finally {
      setRecordsLoading(false);
    }
  };

  const computeRemainingHours = (rec) => {
    const totalReq = Number(rec?.total_request) || 0;
    const rendered = Number(rec?.hours_rendered) || 0;
    return Math.max(0, totalReq - rendered);
  };

  const computeDaysRemaining = (rec) => {
    const pick = rec?.target_end_2 || rec?.target_end_1;
    if (!pick) return '—';
    const end = new Date(`${pick}T00:00:00`);
    if (Number.isNaN(end.getTime())) return '—';
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const diffMs = end.getTime() - today.getTime();
    return String(Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
  };

  const saveRecord = async () => {
    if (!supabase) return;
    const lastName = String(recordForm.last_name || '').trim();
    const firstName = String(recordForm.first_name || '').trim();
    if (!lastName || !firstName) {
      toast.error('Last Name and First Name are required.');
      return;
    }

    const payload = {
      team: recordsTeamTab,
      last_name: lastName,
      first_name: firstName,
      hours_per_day: recordForm.hours_per_day === '' ? null : Number(recordForm.hours_per_day),
      total_request: recordForm.total_request === '' ? null : Number(recordForm.total_request),
      hours_rendered: recordForm.hours_rendered === '' ? null : Number(recordForm.hours_rendered),
      start_date: recordForm.start_date || null,
      target_end_1: recordForm.target_end_1 || null,
      target_end_2: recordForm.target_end_2 || null,
      updated_at: new Date().toISOString(),
      updated_by: user?.id || null,
    };

    try {
      const q = supabase.from('intern_records');
      const { error } = editingRecord?.id
        ? await q.update(payload).eq('id', editingRecord.id)
        : await q.insert({ ...payload, created_at: new Date().toISOString() });
      if (error) throw error;
      toast.success(editingRecord?.id ? 'Record updated.' : 'Record added.');
      closeRecordModal();
      fetchInternRecords();
    } catch (err) {
      console.error('Save intern record error:', err);
      toast.error('Failed to save record. Check policies for intern_records.');
    }
  };

  const deleteRecord = async (rec) => {
    if (!supabase || !rec?.id) return;
    try {
      const { error } = await supabase.from('intern_records').delete().eq('id', rec.id);
      if (error) throw error;
      toast.success('Record removed.');
      fetchInternRecords();
    } catch (err) {
      console.error('Delete intern record error:', err);
      toast.error('Failed to delete record. Check policies for intern_records.');
    }
  };

  const saveDailyRecord = async (newData) => {
    setSaving(true);
    try {
      const payload = {
        record_date: selectedDate,
        tasks_data: newData,
        updated_by: user?.id,
        updated_at: new Date().toISOString()
      };

      const { error } = await supabase
        .from('monitoring_daily_records')
        .upsert(payload, { onConflict: 'record_date' });

      if (error) throw error;
      setTasksData(newData);
      toast.success('Progress saved');
    } catch (err) {
      console.error('Save monitoring records error:', err);
      toast.error('Failed to save records.');
    } finally {
      setSaving(false);
    }
  };

  const updateTask = (taskName, field, value) => {
    const existing = [...tasksData];
    const idx = existing.findIndex(t => t.task_name === taskName);
    
    if (idx >= 0) {
      existing[idx] = { ...existing[idx], [field]: value };
    } else {
      existing.push({
        task_name: taskName,
        assigned_to: field === 'assigned_to' ? value : null,
        status: field === 'status' ? value : 'to-do',
        notes: field === 'notes' ? value : ''
      });
    }
    
    saveDailyRecord(existing);
  };

  const handleClaimTask = (taskName) => {
    updateTask(taskName, 'assigned_to', user?.id);
  };

  if (!canAccess) {
    return (
      <div className="p-6 text-center text-gray-500 dark:text-gray-400">
        You do not have access to the Monitoring Tasks page.
      </div>
    );
  }

  return (
    <div className="w-full space-y-4 sm:space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100" style={{ color: PRIMARY }}>
            Monitoring Team Tasks
          </h1>
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">Track daily progress and assignments for monitoring duties.</p>
        </div>
        <div className="flex items-center gap-3">
          <PrettyDatePicker
            id="record-date"
            value={selectedDate}
            onChange={(e) => {
              const next = e.target.value;
              setSelectedDate(next);
              persistUiStateNow({ selectedDate: next });
            }}
            ariaLabel="Select record date"
            className="shadow-sm"
          />
        </div>
      </div>

      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-gray-200 dark:border-gray-800">
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => {
              setViewTab('tasks');
              persistUiStateNow({ viewTab: 'tasks' });
            }}
            className={`px-4 py-2 rounded-t-lg text-sm font-medium transition-colors ${
              viewTab === 'tasks'
                ? 'bg-white dark:bg-gray-900 border border-b-0 border-gray-200 dark:border-gray-800 -mb-px text-gray-900 dark:text-gray-100'
                : 'bg-gray-100 dark:bg-gray-950/40 text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-800'
            }`}
            style={viewTab === 'tasks' ? { borderTopColor: PRIMARY } : {}}
          >
            Tasks
          </button>
          <button
            type="button"
            onClick={() => {
              setViewTab('intern-records');
              persistUiStateNow({ viewTab: 'intern-records' });
            }}
            className={`px-4 py-2 rounded-t-lg text-sm font-medium transition-colors ${
              viewTab === 'intern-records'
                ? 'bg-white dark:bg-gray-900 border border-b-0 border-gray-200 dark:border-gray-800 -mb-px text-gray-900 dark:text-gray-100'
                : 'bg-gray-100 dark:bg-gray-950/40 text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-800'
            }`}
            style={viewTab === 'intern-records' ? { borderTopColor: PRIMARY } : {}}
          >
            Interns Record
          </button>
        </div>
      </div>

      {viewTab === 'tasks' && (
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setMyTasksOnly(false);
              persistUiStateNow({ myTasksOnly: false });
            }}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              !myTasksOnly
                ? 'text-white'
                : 'text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 hover:bg-gray-100 dark:hover:bg-gray-800'
            }`}
            style={!myTasksOnly ? { backgroundColor: PRIMARY } : {}}
          >
            All Tasks
          </button>
          <button
            type="button"
            onClick={() => {
              setMyTasksOnly(true);
              persistUiStateNow({ myTasksOnly: true });
            }}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              myTasksOnly
                ? 'text-white'
                : 'text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 hover:bg-gray-100 dark:hover:bg-gray-800'
            }`}
            style={myTasksOnly ? { backgroundColor: PRIMARY } : {}}
          >
            My Tasks
          </button>
        </div>
      )}

      {viewTab === 'tasks' && (loading ? (
        <div className="py-12 text-center text-gray-500 dark:text-gray-400">Loading records...</div>
      ) : (
        <div className="space-y-6">
          {MONITORING_TASK_CATEGORIES.map((cat, catIdx) => {
            // Check if there's any task for me in this category if filtering
            if (myTasksOnly) {
              const hasMyTask = cat.tasks.some(taskName => {
                const td = tasksData.find(t => t.task_name === taskName);
                return td && td.assigned_to === user?.id;
              });
              if (!hasMyTask) return null;
            }

            const isOpen = openCategories.has(cat.category);
            return (
              <div key={catIdx} className="bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-gray-200 dark:border-gray-800 overflow-hidden">
                <button
                  type="button"
                  onClick={() => {
                    setOpenCategories((prev) => {
                      const next = new Set(prev);
                      if (next.has(cat.category)) next.delete(cat.category);
                      else next.add(cat.category);
                      // Persist immediately (avoid missing the save effect if user navigates away quickly)
                      persistUiStateNow({ openCategories: Array.from(next) });
                      return next;
                    });
                  }}
                  className="w-full bg-gray-50 dark:bg-gray-950/40 px-4 py-3 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between text-left"
                >
                  <div>
                    <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">{cat.category}</h2>
                    <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                      {cat.tasks.length} task{cat.tasks.length !== 1 ? 's' : ''}
                    </p>
                  </div>
                  <span className="ml-3 inline-flex h-7 w-7 items-center justify-center rounded-full bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-300 text-xs">
                    {isOpen ? '−' : '+'}
                  </span>
                </button>
                {isOpen && (
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-800">
                      <thead>
                        <tr className="bg-white dark:bg-gray-900 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                          <th className="px-4 py-3 text-left w-1/2">Task Description</th>
                          {!myTasksOnly && <th className="px-4 py-3 text-left w-48">Assigned To</th>}
                          <th className="px-4 py-3 text-left w-40">Status</th>
                          <th className="px-4 py-3 text-left">Notes</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100 dark:divide-gray-800 bg-white dark:bg-gray-900">
                        {cat.tasks.map((taskName, tIdx) => {
                        const taskRec = tasksData.find(t => t.task_name === taskName) || {};
                        const isMyTask = taskRec.assigned_to === user?.id;
                        
                        if (myTasksOnly && !isMyTask) return null;

                        return (
                          <tr key={tIdx} className="hover:bg-gray-50 dark:hover:bg-gray-800/60 transition-colors">
                            <td className="px-4 py-3 text-sm text-gray-900 dark:text-gray-100">
                              {taskName}
                            </td>
                            {!myTasksOnly && (
                              <td className="px-4 py-3 text-sm">
                                {isAdmin || (isMonitoringTeam && (userRole === 'tl' || userRole === 'vtl')) ? (
                                  <div className="flex items-center justify-between group">
                                    <select
                                      value={taskRec.assigned_to || ''}
                                      onChange={(e) => updateTask(taskName, 'assigned_to', e.target.value || null)}
                                      className="min-w-[11rem] rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-2.5 py-1.5 pr-7 text-sm text-gray-700 dark:text-gray-100 cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#6795BE]"
                                    >
                                      <option value="">Unassigned</option>
                                      {monitoringUsers.map(u => (
                                        <option key={u.id} value={u.id}>{getUserDisplayName(u.id)}</option>
                                      ))}
                                    </select>
                                  </div>
                                ) : (
                                  taskRec.assigned_to ? (
                                    <span className="text-gray-700 dark:text-gray-200">{getUserDisplayName(taskRec.assigned_to)}</span>
                                  ) : (
                                    <button
                                      type="button"
                                      onClick={() => handleClaimTask(taskName)}
                                      className="text-xs font-medium px-2 py-1 rounded bg-gray-100 dark:bg-gray-950/40 text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-800 transition-colors"
                                    >
                                      Claim
                                    </button>
                                  )
                                )}
                              </td>
                            )}
                            <td className="px-4 py-3 text-sm">
                              {myTasksOnly ? (
                                <select
                                  value={taskRec.status || 'to-do'}
                                  onChange={(e) => updateTask(taskName, 'status', e.target.value)}
                                  className={`text-xs font-medium rounded-full px-2.5 py-1 border-0 cursor-pointer focus:ring-2 focus:ring-[#6795BE] ${
                                    taskStatusPill(taskRec.status)
                                  }`}
                                >
                                  <option value="to-do">To Do</option>
                                  <option value="in-progress">In Progress</option>
                                  <option value="done">Done</option>
                                </select>
                              ) : (
                                <span className={`inline-block text-xs font-medium rounded-full px-2.5 py-1 ${taskStatusPill(taskRec.status)}`}>
                                  {taskRec.status === 'done' ? 'Done' :
                                   taskRec.status === 'in-progress' ? 'In Progress' : 'To Do'}
                                </span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-sm">
                              {myTasksOnly ? (
                                <input
                                  key={`${selectedDate}-${taskName}`}
                                  type="text"
                                  placeholder="Add note..."
                                  defaultValue={taskRec.notes || ''}
                                  onBlur={(e) => {
                                    if (e.target.value !== (taskRec.notes || '')) {
                                      updateTask(taskName, 'notes', e.target.value);
                                    }
                                  }}
                                  className="w-full text-sm border-gray-300 dark:border-gray-700 rounded-md bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:ring-[#6795BE] focus:border-[#6795BE] shadow-sm"
                                />
                              ) : (
                                <span className="text-gray-700 dark:text-gray-200">{taskRec.notes || '—'}</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                )}
              </div>
            );
          })}
        </div>
      ))}

      {viewTab === 'intern-records' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            {canManageAllTeamsInternRecords ? (
              <div className="flex gap-2 border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 rounded-lg p-1 shadow-sm">
                {[
                  { id: TEAMS.TLA, label: 'Team Lead Assistant' },
                  { id: TEAMS.MONITORING, label: 'Monitoring Team' },
                  { id: TEAMS.PAT1, label: 'PAT1' },
                ].map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setRecordsTeamTab(t.id)}
                    className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                      recordsTeamTab === t.id
                        ? 'text-white'
                        : 'text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800'
                    }`}
                    style={recordsTeamTab === t.id ? { backgroundColor: PRIMARY } : {}}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            ) : (
              <div className="inline-flex items-center rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 px-3 py-2 text-sm text-gray-700 dark:text-gray-200">
                Team: <span className="ml-1 font-semibold">Monitoring Team</span>
              </div>
            )}

            <button
              type="button"
              onClick={openAddRecord}
              className="px-4 py-2 rounded-lg text-sm font-medium text-white shadow-sm"
              style={{ backgroundColor: PRIMARY }}
            >
              + Add record
            </button>
          </div>

          <div className="rounded-lg border border-gray-200 dark:border-gray-800 overflow-hidden overflow-x-auto bg-white dark:bg-gray-900">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-800">
              <thead className="bg-gray-50 dark:bg-gray-950/40">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 dark:text-gray-300 uppercase">Last Name</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 dark:text-gray-300 uppercase">First Name</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 dark:text-gray-300 uppercase">Hours/Day</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 dark:text-gray-300 uppercase">Total Request</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 dark:text-gray-300 uppercase">Hours Rendered</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 dark:text-gray-300 uppercase">Remaining Hours</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 dark:text-gray-300 uppercase">Start Date</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 dark:text-gray-300 uppercase">Target End 1</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 dark:text-gray-300 uppercase">Target End 2</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 dark:text-gray-300 uppercase">Days Remaining</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-600 dark:text-gray-300 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-800">
                {recordsLoading ? (
                  <tr>
                    <td colSpan={11} className="px-4 py-8 text-center text-sm text-gray-500 dark:text-gray-400">
                      Loading…
                    </td>
                  </tr>
                ) : internRecords.length === 0 ? (
                  <tr>
                    <td colSpan={11} className="px-4 py-8 text-center text-sm text-gray-500 dark:text-gray-400">
                      No records yet.
                    </td>
                  </tr>
                ) : (
                  internRecords.map((rec) => (
                    <tr key={rec.id} className="hover:bg-gray-50/80 dark:hover:bg-gray-800/60">
                      <td className="px-4 py-3 text-sm text-gray-900 dark:text-gray-100">{rec.last_name || '—'}</td>
                      <td className="px-4 py-3 text-sm text-gray-900 dark:text-gray-100">{rec.first_name || '—'}</td>
                      <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300">{rec.hours_per_day ?? '—'}</td>
                      <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300">{rec.total_request ?? '—'}</td>
                      <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300">{rec.hours_rendered ?? '—'}</td>
                      <td className="px-4 py-3 text-sm font-medium text-gray-900 dark:text-gray-100">
                        {computeRemainingHours(rec)}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300">{formatMdy(rec.start_date)}</td>
                      <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300">{formatMdy(rec.target_end_1)}</td>
                      <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300">{formatMdy(rec.target_end_2)}</td>
                      <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300">{computeDaysRemaining(rec)}</td>
                      <td className="px-4 py-3 text-sm text-right whitespace-nowrap space-x-2">
                        <button
                          type="button"
                          onClick={() => openEditRecord(rec)}
                          className="px-3 py-1.5 rounded-lg text-sm font-medium border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => deleteRecord(rec)}
                          className="px-3 py-1.5 rounded-lg text-sm font-medium border border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-300 hover:bg-red-100 dark:hover:bg-red-900/40"
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {recordModalOpen && (
            <div className="fixed inset-0 z-[10000] bg-black/20 backdrop-blur-sm flex items-center justify-center px-4">
              <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-2xl">
                <div className="px-5 py-4 border-b border-gray-200 dark:border-gray-800 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100" style={{ color: PRIMARY }}>
                      {editingRecord ? 'Edit intern record' : 'Add intern record'}
                    </h3>
                    <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
                      Team: <span className="font-medium">{recordsTeamTab}</span>
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={closeRecordModal}
                    className="shrink-0 px-3 py-2 rounded-lg text-sm font-medium text-gray-700 dark:text-gray-200 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700"
                  >
                    Close
                  </button>
                </div>

                <div className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {[
                    { key: 'last_name', label: 'Last Name', type: 'text', required: true, placeholder: 'Dela Cruz' },
                    { key: 'first_name', label: 'First Name', type: 'text', required: true, placeholder: 'Juan' },
                    { key: 'hours_per_day', label: 'Hours/Day', type: 'number', placeholder: '8' },
                    { key: 'total_request', label: 'Total Request', type: 'number', placeholder: '400' },
                    { key: 'hours_rendered', label: 'Hours Rendered', type: 'number', placeholder: '120' },
                    { key: 'start_date', label: 'Start Date', type: 'date', placeholder: '' },
                    { key: 'target_end_1', label: 'Target End 1', type: 'date', placeholder: '' },
                    { key: 'target_end_2', label: 'Target End 2', type: 'date', placeholder: '' },
                  ].map((f) => (
                    <div key={f.key} className="space-y-1">
                      <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300">
                        {f.label}{f.required ? ' *' : ''}
                      </label>
                      <input
                        type={f.type}
                        value={recordForm[f.key]}
                        onChange={(e) => setRecordForm((p) => ({ ...p, [f.key]: e.target.value }))}
                        placeholder={f.placeholder}
                        className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 px-3 py-2 text-sm focus:ring-2 focus:ring-[#6795BE] focus:border-transparent"
                      />
                    </div>
                  ))}
                </div>

                <div className="px-5 py-4 border-t border-gray-200 dark:border-gray-800 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={closeRecordModal}
                    className="px-4 py-2 rounded-lg text-sm font-medium border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={saveRecord}
                    className="px-4 py-2 rounded-lg text-sm font-medium text-white shadow-sm"
                    style={{ backgroundColor: PRIMARY }}
                  >
                    Save
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
