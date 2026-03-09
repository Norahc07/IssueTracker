import { useEffect, useState, useMemo } from 'react';
import { useSupabase } from '../context/supabase.jsx';
import { toast } from 'react-hot-toast';
import { TEAMS } from '../utils/rolePermissions.js';

const PRIMARY = '#6795BE';
const todayStr = () => new Date().toISOString().slice(0, 10);

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

export default function MonitoringTasks() {
  const { supabase, user, userRole, userTeam } = useSupabase();
  const [selectedDate, setSelectedDate] = useState(todayStr());
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [tasksData, setTasksData] = useState([]); // Array of { task_name, assigned_to, status, notes }
  const [monitoringUsers, setMonitoringUsers] = useState([]);
  const [myTasksOnly, setMyTasksOnly] = useState(false);
  const [onboardingRecords, setOnboardingRecords] = useState([]);

  // Verify access: Only Monitoring team or Admin
  const isMonitoringTeam = String(userTeam || '').toLowerCase().includes('monitoring');
  const isAdmin = userRole === 'admin';
  const canAccess = isMonitoringTeam || isAdmin;

  useEffect(() => {
    if (!canAccess) return;
    fetchMonitoringUsers();
    fetchOnboardingRecords();
  }, [canAccess]);

  useEffect(() => {
    if (!canAccess) return;
    fetchDailyRecord(selectedDate);
  }, [selectedDate, canAccess]);

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

  const formatDisplayDate = (dateString) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    // Add timezone offset so it correctly uses the local date representation of the ISO string
    const localDate = new Date(date.getTime() + date.getTimezoneOffset() * 60000);
    return localDate.toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric'
    });
  };

  if (!canAccess) {
    return (
      <div className="p-6 text-center text-gray-500">
        You do not have access to the Monitoring Tasks page.
      </div>
    );
  }

  return (
    <div className="w-full space-y-4 sm:space-y-6 max-w-7xl mx-auto p-4 sm:p-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900" style={{ color: PRIMARY }}>
            Monitoring Team Tasks
          </h1>
          <p className="mt-1 text-sm text-gray-600">Track daily progress and assignments for monitoring duties.</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative cursor-pointer hover:bg-gray-50 rounded-lg">
            <input
              id="record-date"
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              onClick={(e) => e.target.showPicker && e.target.showPicker()}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
            />
            <div className="flex items-center gap-2 bg-white px-4 py-2 rounded-lg border border-gray-200 shadow-sm pointer-events-none">
              <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"></path>
              </svg>
              <span className="text-sm font-medium text-gray-700">
                {formatDisplayDate(selectedDate)}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="flex gap-2 border-b border-gray-200">
        <button
          type="button"
          onClick={() => setMyTasksOnly(false)}
          className={`px-4 py-2 rounded-t-lg text-sm font-medium transition-colors ${
            !myTasksOnly ? 'bg-white border border-b-0 border-gray-200 -mb-px' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}
          style={!myTasksOnly ? { borderTopColor: PRIMARY } : {}}
        >
          All Tasks
        </button>
        <button
          type="button"
          onClick={() => setMyTasksOnly(true)}
          className={`px-4 py-2 rounded-t-lg text-sm font-medium transition-colors ${
            myTasksOnly ? 'bg-white border border-b-0 border-gray-200 -mb-px' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}
          style={myTasksOnly ? { borderTopColor: PRIMARY } : {}}
        >
          My Tasks
        </button>
      </div>

      {loading ? (
        <div className="py-12 text-center text-gray-500">Loading records...</div>
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

            return (
              <div key={catIdx} className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                <div className="bg-gray-50 px-4 py-3 border-b border-gray-200">
                  <h2 className="text-base font-semibold text-gray-900">{cat.category}</h2>
                </div>
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead>
                      <tr className="bg-white text-xs font-medium text-gray-500 uppercase tracking-wider">
                        <th className="px-4 py-3 text-left w-1/2">Task Description</th>
                        {!myTasksOnly && <th className="px-4 py-3 text-left w-48">Assigned To</th>}
                        <th className="px-4 py-3 text-left w-40">Status</th>
                        <th className="px-4 py-3 text-left">Notes</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 bg-white">
                      {cat.tasks.map((taskName, tIdx) => {
                        const taskRec = tasksData.find(t => t.task_name === taskName) || {};
                        const isMyTask = taskRec.assigned_to === user?.id;
                        
                        if (myTasksOnly && !isMyTask) return null;

                        return (
                          <tr key={tIdx} className="hover:bg-gray-50 transition-colors">
                            <td className="px-4 py-3 text-sm text-gray-900">
                              {taskName}
                            </td>
                            {!myTasksOnly && (
                              <td className="px-4 py-3 text-sm">
                                {isAdmin || (isMonitoringTeam && (userRole === 'tl' || userRole === 'vtl')) ? (
                                  <div className="flex items-center justify-between group">
                                    <select
                                      value={taskRec.assigned_to || ''}
                                      onChange={(e) => updateTask(taskName, 'assigned_to', e.target.value || null)}
                                      className="text-sm bg-transparent border-none p-0 pr-6 focus:ring-0 cursor-pointer text-gray-700"
                                    >
                                      <option value="">Unassigned</option>
                                      {monitoringUsers.map(u => (
                                        <option key={u.id} value={u.id}>{getUserDisplayName(u.id)}</option>
                                      ))}
                                    </select>
                                  </div>
                                ) : (
                                  taskRec.assigned_to ? (
                                    <span className="text-gray-700">{getUserDisplayName(taskRec.assigned_to)}</span>
                                  ) : (
                                    <button
                                      type="button"
                                      onClick={() => handleClaimTask(taskName)}
                                      className="text-xs font-medium px-2 py-1 rounded bg-gray-100 text-gray-700 hover:bg-gray-200 transition-colors"
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
                                    taskRec.status === 'done' ? 'bg-green-100 text-green-800' :
                                    taskRec.status === 'in-progress' ? 'bg-blue-100 text-blue-800' :
                                    'bg-gray-100 text-gray-800'
                                  }`}
                                >
                                  <option value="to-do">To Do</option>
                                  <option value="in-progress">In Progress</option>
                                  <option value="done">Done</option>
                                </select>
                              ) : (
                                <span className={`inline-block text-xs font-medium rounded-full px-2.5 py-1 ${
                                  taskRec.status === 'done' ? 'bg-green-100 text-green-800' :
                                  taskRec.status === 'in-progress' ? 'bg-blue-100 text-blue-800' :
                                  'bg-gray-100 text-gray-800'
                                }`}>
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
                                  className="w-full text-sm border-gray-300 rounded-md focus:ring-[#6795BE] focus:border-[#6795BE] shadow-sm"
                                />
                              ) : (
                                <span className="text-gray-700">{taskRec.notes || '—'}</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
