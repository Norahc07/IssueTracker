import { useMemo, useState, useEffect } from 'react';
import { useSupabase } from '../context/supabase.jsx';
import { toast } from 'react-hot-toast';
import { permissions } from '../utils/rolePermissions.js';
import { getRoleDisplayName } from '../utils/rolePermissions.js';
import DailyReportForm from './DailyReportForm.jsx';

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

export default function DailyReportManage() {
  const { supabase, userRole, user } = useSupabase();
  const canManage = permissions.canManageDailyReport(userRole);
  const showMyFormTab = userRole === 'tl' || userRole === 'vtl';
  const showTeamReportTab = userRole === 'admin' || userRole === 'tla' || userRole === 'tl' || userRole === 'vtl';
  const [activeTab, setActiveTab] = useState('status'); // 'status' | 'questions' | 'my' | 'team'
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState(todayStr());
  const [interns, setInterns] = useState([]);
  const [submissions, setSubmissions] = useState([]);
  const [questions, setQuestions] = useState([]);
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

  useEffect(() => {
    if (!canManage) return;
    fetchData();
    if (activeTab === 'team' && showTeamReportTab) {
      fetchTeamReport();
    }
  }, [canManage, selectedDate, activeTab, teamReportDate]);

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

  const fetchTeamReport = async () => {
    try {
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
          old_domains_plugins: typeof data.old_domains_plugins === 'string' ? JSON.parse(data.old_domains_plugins) : (data.old_domains_plugins || []),
          new_domains_plugins: typeof data.new_domains_plugins === 'string' ? JSON.parse(data.new_domains_plugins) : (data.new_domains_plugins || []),
          course_price_edits: typeof data.course_price_edits === 'string' ? JSON.parse(data.course_price_edits) : (data.course_price_edits || []),
          notable_tasks: typeof data.notable_tasks === 'string' ? JSON.parse(data.notable_tasks) : (data.notable_tasks || []),
          attendance_counts: typeof data.attendance_counts === 'string' ? JSON.parse(data.attendance_counts) : (data.attendance_counts || {}),
          reviews: typeof data.reviews === 'string' ? JSON.parse(data.reviews) : (data.reviews || {}),
          interns_remaining_hours: typeof data.interns_remaining_hours === 'string' ? JSON.parse(data.interns_remaining_hours) : (data.interns_remaining_hours || []),
        };
        setTeamReport(parsed);
        setIsEditingTeamReport(false); // Existing report: start in view mode
      } else {
        // Initialize empty report
        setTeamReport({
          report_date: teamReportDate,
          prepared_by: user?.user_metadata?.full_name || user?.email || '',
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
    } catch (e) {
      console.error('Error fetching team report:', e);
      toast.error('Failed to load team report');
      // Initialize empty report on error
      setTeamReport({
        report_date: teamReportDate,
        prepared_by: user?.user_metadata?.full_name || user?.email || '',
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

  const saveTeamReport = async () => {
    if (!teamReport) return;
    setSavingTeamReport(true);
    try {
      const payload = {
        report_date: teamReportDate,
        prepared_by: teamReport.prepared_by || '',
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
    <div className="max-w-6xl mx-auto p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-1" style={{ color: PRIMARY }}>
          Daily Report Management
        </h1>
        <p className="text-sm text-gray-600">
          Track who submitted, view intern responses, and manage the Daily Report Template.
        </p>
      </div>

      <div className="flex flex-wrap gap-4 items-center border-b border-gray-200 mb-6">
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setActiveTab('status')}
            className={`px-4 py-2 rounded-t-lg text-sm font-medium ${activeTab === 'status' ? 'bg-white border border-b-0 border-gray-200 -mb-px' : 'text-gray-600 hover:bg-gray-100'}`}
            style={activeTab === 'status' ? { borderTopColor: PRIMARY } : {}}
          >
            Submission status
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('questions')}
            className={`px-4 py-2 rounded-t-lg text-sm font-medium ${activeTab === 'questions' ? 'bg-white border border-b-0 border-gray-200 -mb-px' : 'text-gray-600 hover:bg-gray-100'}`}
            style={activeTab === 'questions' ? { borderTopColor: PRIMARY } : {}}
          >
            Daily Report Template
          </button>
          {showMyFormTab && (
            <button
              type="button"
              onClick={() => setActiveTab('my')}
              className={`px-4 py-2 rounded-t-lg text-sm font-medium ${activeTab === 'my' ? 'bg-white border border-b-0 border-gray-200 -mb-px' : 'text-gray-600 hover:bg-gray-100'}`}
              style={activeTab === 'my' ? { borderTopColor: PRIMARY } : {}}
            >
              My Daily Report
            </button>
          )}
          {showTeamReportTab && (
            <button
              type="button"
              onClick={() => setActiveTab('team')}
              className={`px-4 py-2 rounded-t-lg text-sm font-medium ${activeTab === 'team' ? 'bg-white border border-b-0 border-gray-200 -mb-px' : 'text-gray-600 hover:bg-gray-100'}`}
              style={activeTab === 'team' ? { borderTopColor: PRIMARY } : {}}
            >
              Team Daily Report
            </button>
          )}
        </div>
        {activeTab === 'status' && (
          <div className="flex items-center gap-2">
            <label htmlFor="report-date" className="text-sm font-medium text-gray-700">
              Date:
            </label>
            <input
              id="report-date"
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-[#6795BE] focus:border-transparent"
            />
          </div>
        )}
        {activeTab === 'team' && (
          <div className="flex items-center gap-2">
            <label htmlFor="team-report-date" className="text-sm font-medium text-gray-700">
              Date:
            </label>
            <input
              id="team-report-date"
              type="date"
              value={teamReportDate}
              onChange={(e) => setTeamReportDate(e.target.value)}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-[#6795BE] focus:border-transparent"
            />
          </div>
        )}
      </div>

      {activeTab === 'status' && (
        <div>
          <h2 className="text-lg font-semibold text-gray-900 mb-3" style={{ color: PRIMARY }}>
            Submission status for {selectedDate}
          </h2>
          <div className="bg-white rounded-lg border border-gray-200 overflow-x-auto">
            <table className="w-full text-sm min-w-[640px]">
              <thead className="bg-gray-50">
                <tr>
                  <th className="text-left px-4 py-3 font-semibold text-gray-900">Date</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-900">Name</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-900">Department</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-900">Role</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-900">Time in</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-900">Time out</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-900">Submitted</th>
                  <th className="text-right px-4 py-3 font-semibold text-gray-900">Action</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-8 text-center text-gray-500">
                      Loading…
                    </td>
                  </tr>
                ) : interns.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-8 text-center text-gray-500">
                      No interns in the system.
                    </td>
                  </tr>
                ) : (
                  interns.map((u) => {
                    const sub = submittedMap[u.id];
                    const submitted = !!sub;
                    return (
                      <tr key={u.id} className="border-t border-gray-100 hover:bg-gray-50">
                        <td className="px-4 py-3 text-gray-700">{selectedDate}</td>
                        <td className="px-4 py-3 font-medium text-gray-900">{u.full_name || u.email || '—'}</td>
                        <td className="px-4 py-3 text-gray-600">{u.team || '—'}</td>
                        <td className="px-4 py-3 text-gray-600">{getRoleDisplayName(u.role)}</td>
                        <td className="px-4 py-3 text-gray-700">{submitted ? formatTime(sub.time_in) : '—'}</td>
                        <td className="px-4 py-3 text-gray-700">{submitted ? formatTime(sub.time_out) : '—'}</td>
                        <td className="px-4 py-3">
                          {submitted ? (
                            <span className="inline-flex items-center gap-1.5 text-green-700 font-medium">
                              <span className="w-2 h-2 rounded-full bg-green-500" />
                              Yes
                              {sub.submitted_at && (
                                <span className="text-gray-500 font-normal text-xs">
                                  {new Date(sub.submitted_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                </span>
                              )}
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 text-amber-700">
                              <span className="w-2 h-2 rounded-full bg-amber-500" />
                              No
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <button
                            type="button"
                            onClick={() => openResponse(u.id)}
                            disabled={!submitted}
                            className="px-3 py-1.5 rounded-lg text-sm font-medium text-white disabled:opacity-50"
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
              className="flex-1 min-w-[200px] rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-[#6795BE] focus:border-transparent"
            />
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input type="checkbox" checked={newQuestionRequired} onChange={(e) => setNewQuestionRequired(e.target.checked)} />
              Required
            </label>
            <button
              type="button"
              onClick={addQuestion}
              disabled={savingQuestion || !newQuestionText.trim()}
              className="px-4 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-50"
              style={{ backgroundColor: PRIMARY }}
            >
              Add question
            </button>
          </div>
          <ul className="space-y-3">
            {questions.map((q, index) => (
              <li key={q.id} className="flex items-center gap-3 p-3 rounded-lg border border-gray-200 bg-white">
                {editingId === q.id ? (
                  <>
                    <input
                      type="text"
                      defaultValue={q.question_text}
                      onBlur={(e) => updateQuestion(q.id, 'question_text', e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && (e.target.blur(), setEditingId(null))}
                      className="flex-1 rounded border border-gray-300 px-2 py-1 text-sm"
                      autoFocus
                    />
                    <button type="button" onClick={() => setEditingId(null)} className="text-sm text-gray-600">
                      Done
                    </button>
                  </>
                ) : (
                  <>
                    <span className="flex-1 text-gray-900">
                      <span className="font-semibold mr-2">{index + 1}.</span>
                      {q.question_text}
                    </span>
                    <span className="text-xs text-gray-500">{q.required ? 'Required' : 'Optional'}</span>
                    <button type="button" onClick={() => setEditingId(q.id)} className="text-sm hover:underline" style={{ color: PRIMARY }}>
                      Edit
                    </button>
                    <button type="button" onClick={() => deleteQuestion(q.id)} className="text-sm text-red-600 hover:underline">
                      Remove
                    </button>
                  </>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {responseOpen && selectedIntern && selectedSubmission && (
        <div className="fixed inset-0 z-[10002] bg-black/60 backdrop-blur-sm p-4 flex items-center justify-center">
          <div className="bg-white w-full max-w-3xl rounded-2xl shadow-2xl border border-gray-200 overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-200 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="text-lg font-semibold text-gray-900 truncate" style={{ color: PRIMARY }}>
                  {selectedIntern.full_name || selectedIntern.email || selectedIntern.id}
                </h3>
                <p className="text-sm text-gray-600">
                  Report date: <span className="font-medium">{selectedDate}</span>
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
                className="shrink-0 px-3 py-2 rounded-lg text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200"
              >
                Close
              </button>
            </div>

            <div className="p-5 space-y-6 max-h-[75vh] overflow-y-auto">
              {/* 1. Attendance */}
              <div className="space-y-2">
                <h4 className="text-base font-semibold text-gray-900" style={{ color: PRIMARY }}>
                  1. {SECTION_HEADINGS[0]}
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                    <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Time IN</p>
                    <p className="mt-1 text-sm text-gray-900">{formatTime(selectedSubmission.time_in)}</p>
                  </div>
                  <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                    <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Time OUT</p>
                    <p className="mt-1 text-sm text-gray-900">{formatTime(selectedSubmission.time_out)}</p>
                  </div>
                </div>
                {questions[0] ? (
                  <div className="rounded-lg border border-gray-200 bg-white p-3">
                    <p className="text-sm font-medium text-gray-900 mb-1">Notes</p>
                    <p className="text-sm text-gray-700 whitespace-pre-wrap">
                      {(selectedSubmission.answers || {})[questions[0].id] || '—'}
                    </p>
                  </div>
                ) : null}
              </div>

              {/* 2.–7 */}
              {questions.slice(1, 7).map((q, idx) => (
                <div key={q.id} className="space-y-2">
                  <h4 className="text-base font-semibold text-gray-900" style={{ color: PRIMARY }}>
                    {idx + 2}. {SECTION_HEADINGS[idx + 1] || 'Section'}
                  </h4>
                  <p className="text-xs text-gray-500">{q.question_text}</p>
                  <div className="rounded-lg border border-gray-200 bg-white p-3">
                    <p className="text-sm text-gray-700 whitespace-pre-wrap">
                      {(selectedSubmission.answers || {})[q.id] || '—'}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'my' && showMyFormTab && user && (
        <div className="mt-4">
          <DailyReportForm />
        </div>
      )}

      {activeTab === 'team' && showTeamReportTab && teamReport && (
        <div className="space-y-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900" style={{ color: PRIMARY }}>
              IT TEAM LEAD ASSISTANT DAILY REPORT
            </h2>
            {isEditingTeamReport ? (
              <button
                type="button"
                onClick={saveTeamReport}
                disabled={savingTeamReport}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-50"
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
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white"
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
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <div className="grid grid-cols-1 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Prepared by</label>
                {isEditingTeamReport ? (
                  <input
                    type="text"
                    value={teamReport.prepared_by || ''}
                    onChange={(e) =>
                      setTeamReport((prev) => ({ ...prev, prepared_by: e.target.value }))
                    }
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-[#6795BE] focus:border-transparent"
                    placeholder="Enter name"
                  />
                ) : (
                  <p className="text-sm text-gray-900 py-2">{teamReport.prepared_by || '—'}</p>
                )}
              </div>
            </div>
          </div>

          {/* Tasks Table */}
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <h3 className="text-base font-semibold text-gray-900 mb-3">Tasks</h3>
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-2 text-left font-semibold text-gray-900">Onboarding and Offboarding Interns</th>
                  <th className="px-4 py-2 text-left font-semibold text-gray-900">Google Search Console (GSC) Crawling</th>
                  <th className="px-4 py-2 text-left font-semibold text-gray-900">WordPress Plugins Updates</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="px-4 py-2 border-t border-gray-200">
                    {isEditingTeamReport ? (
                      <input
                        type="text"
                        value={teamReport.tasks?.onboarding_offboarding || ''}
                        onChange={(e) =>
                          setTeamReport((prev) => ({
                            ...prev,
                            tasks: { ...prev.tasks, onboarding_offboarding: e.target.value },
                          }))
                        }
                        className="w-full rounded border border-gray-300 px-2 py-1 text-sm"
                        placeholder="Enter name"
                      />
                    ) : (
                      <p className="text-sm text-gray-900 py-1">{teamReport.tasks?.onboarding_offboarding || '—'}</p>
                    )}
                  </td>
                  <td className="px-4 py-2 border-t border-gray-200">
                    {isEditingTeamReport ? (
                      <input
                        type="text"
                        value={teamReport.tasks?.gsc_crawling || ''}
                        onChange={(e) =>
                          setTeamReport((prev) => ({
                            ...prev,
                            tasks: { ...prev.tasks, gsc_crawling: e.target.value },
                          }))
                        }
                        className="w-full rounded border border-gray-300 px-2 py-1 text-sm"
                        placeholder="Enter name"
                      />
                    ) : (
                      <p className="text-sm text-gray-900 py-1">{teamReport.tasks?.gsc_crawling || '—'}</p>
                    )}
                  </td>
                  <td className="px-4 py-2 border-t border-gray-200">
                    {isEditingTeamReport ? (
                      <input
                        type="text"
                        value={teamReport.tasks?.wp_plugins_updates || ''}
                        onChange={(e) =>
                          setTeamReport((prev) => ({
                            ...prev,
                            tasks: { ...prev.tasks, wp_plugins_updates: e.target.value },
                          }))
                        }
                        className="w-full rounded border border-gray-300 px-2 py-1 text-sm"
                        placeholder="Enter name"
                      />
                    ) : (
                      <p className="text-sm text-gray-900 py-1">{teamReport.tasks?.wp_plugins_updates || '—'}</p>
                    )}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Old Domains Plugins Table */}
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-base font-semibold text-gray-900">
                1. List of Updated Plugins for migrated old domains as of{' '}
                <span className="font-normal text-gray-700">{formatDateLong(teamReportDate)}</span>
              </h3>
              {isEditingTeamReport && (
                <button
                  type="button"
                  onClick={() => {
                    const updated = [...(teamReport.old_domains_plugins || []), { country: '', country_status: '', country_reason: '', plugins_updated: '', plugin_status: '', notes: '' }];
                    setTeamReport((prev) => ({ ...prev, old_domains_plugins: updated }));
                  }}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm font-medium text-white"
                  style={{ backgroundColor: PRIMARY }}
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  Add Country
                </button>
              )}
            </div>
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-2 text-left font-semibold text-gray-900">Country</th>
                  <th className="px-4 py-2 text-left font-semibold text-gray-900">Status</th>
                  <th className="px-4 py-2 text-left font-semibold text-gray-900">Reason</th>
                  <th className="px-4 py-2 text-left font-semibold text-gray-900">Plugins Updated</th>
                  <th className="px-4 py-2 text-left font-semibold text-gray-900">Plugin Status</th>
                  <th className="px-4 py-2 text-left font-semibold text-gray-900">Notes/Reason</th>
                  {isEditingTeamReport && (
                    <th className="px-4 py-2 text-left font-semibold text-gray-900 w-20">Action</th>
                  )}
                </tr>
              </thead>
              <tbody>
                {(() => {
                  const plugins = teamReport.old_domains_plugins || [];
                  const colSpan = isEditingTeamReport ? 7 : 6;
                  if (plugins.length === 0 && !isEditingTeamReport) {
                    return (
                      <tr>
                        <td colSpan={colSpan} className="px-4 py-4 text-center text-gray-500 text-sm">No data</td>
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
                        <tr key={`old-${idx}`} className="border-t border-gray-200">
                          {isFirstPlugin && (
                            <td 
                              rowSpan={rowSpan} 
                              className="px-4 py-2 align-top bg-gray-50 font-medium text-gray-900"
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
                                      className="flex-1 rounded border border-gray-300 px-2 py-1 text-sm font-medium"
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
                                  <p className="text-sm font-medium py-1">{country === 'Unspecified' ? '—' : country}</p>
                                )}
                              </div>
                            </td>
                          )}
                          {isFirstPlugin && (
                            <td 
                              rowSpan={rowSpan} 
                              className="px-4 py-2 align-top bg-gray-50"
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
                                  className="w-full rounded border border-gray-300 px-2 py-1 text-sm"
                                >
                                  <option value="">Select status</option>
                                  <option value="working">Working</option>
                                  <option value="not working">Not Working</option>
                                </select>
                              ) : (
                                <p className="text-sm text-gray-900 py-1">{plugin.country_status || '—'}</p>
                              )}
                            </td>
                          )}
                          {isFirstPlugin && (
                            <td 
                              rowSpan={rowSpan} 
                              className="px-4 py-2 align-top bg-gray-50"
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
                                    className="w-full rounded border border-gray-300 px-2 py-1 text-sm"
                                    placeholder="Enter reason"
                                  />
                                ) : (
                                  <p className="text-sm text-gray-500 py-1">—</p>
                                )
                              ) : (
                                <p className="text-sm text-gray-900 py-1">{plugin.country_reason || '—'}</p>
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
                                className="w-full rounded border border-gray-300 px-2 py-1 text-sm"
                                placeholder="Enter plugin name"
                              />
                            ) : (
                              <p className="text-sm text-gray-900 py-1">{plugin.plugins_updated || '—'}</p>
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
                                className="w-full rounded border border-gray-300 px-2 py-1 text-sm"
                              >
                                <option value="">Select status</option>
                                <option value="Fail">Fail</option>
                                <option value="Success">Success</option>
                              </select>
                            ) : (
                              <p className="text-sm text-gray-900 py-1">{plugin.plugin_status || '—'}</p>
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
                                className="w-full rounded border border-gray-300 px-2 py-1 text-sm"
                                placeholder="Enter notes"
                              />
                            ) : (
                              <p className="text-sm text-gray-900 py-1">{plugin.notes || '—'}</p>
                            )}
                          </td>
                          {isEditingTeamReport && (
                            <td className="px-4 py-2">
                              <button
                                type="button"
                                onClick={() => {
                                  const updated = plugins.filter((_, i) => i !== idx);
                                  setTeamReport((prev) => ({ ...prev, old_domains_plugins: updated }));
                                }}
                                className="text-red-600 hover:text-red-800 text-sm"
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
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-base font-semibold text-gray-900">
                2. List of Updated Plugins for migrated new domains as of{' '}
                <span className="font-normal text-gray-700">{formatDateLong(teamReportDate)}</span>
              </h3>
              {isEditingTeamReport && (
                <button
                  type="button"
                  onClick={() => {
                    const updated = [...(teamReport.new_domains_plugins || []), { country: '', country_status: '', country_reason: '', plugins_updated: '', plugin_status: '', notes: '' }];
                    setTeamReport((prev) => ({ ...prev, new_domains_plugins: updated }));
                  }}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm font-medium text-white"
                  style={{ backgroundColor: PRIMARY }}
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  Add Country
                </button>
              )}
            </div>
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-2 text-left font-semibold text-gray-900">Country</th>
                  <th className="px-4 py-2 text-left font-semibold text-gray-900">Status</th>
                  <th className="px-4 py-2 text-left font-semibold text-gray-900">Reason</th>
                  <th className="px-4 py-2 text-left font-semibold text-gray-900">Plugins Updated</th>
                  <th className="px-4 py-2 text-left font-semibold text-gray-900">Plugin Status</th>
                  <th className="px-4 py-2 text-left font-semibold text-gray-900">Notes/Reason</th>
                  {isEditingTeamReport && (
                    <th className="px-4 py-2 text-left font-semibold text-gray-900 w-20">Action</th>
                  )}
                </tr>
              </thead>
              <tbody>
                {(() => {
                  const plugins = teamReport.new_domains_plugins || [];
                  const colSpan = isEditingTeamReport ? 7 : 6;
                  if (plugins.length === 0 && !isEditingTeamReport) {
                    return (
                      <tr>
                        <td colSpan={colSpan} className="px-4 py-4 text-center text-gray-500 text-sm">No data</td>
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
                        <tr key={`new-${idx}`} className="border-t border-gray-200">
                          {isFirstPlugin && (
                            <td 
                              rowSpan={rowSpan} 
                              className="px-4 py-2 align-top bg-gray-50 font-medium text-gray-900"
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
                                      className="flex-1 rounded border border-gray-300 px-2 py-1 text-sm font-medium"
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
                                  <p className="text-sm font-medium py-1">{country === 'Unspecified' ? '—' : country}</p>
                                )}
                              </div>
                            </td>
                          )}
                          {isFirstPlugin && (
                            <td 
                              rowSpan={rowSpan} 
                              className="px-4 py-2 align-top bg-gray-50"
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
                                  className="w-full rounded border border-gray-300 px-2 py-1 text-sm"
                                >
                                  <option value="">Select status</option>
                                  <option value="working">Working</option>
                                  <option value="not working">Not Working</option>
                                </select>
                              ) : (
                                <p className="text-sm text-gray-900 py-1">{plugin.country_status || '—'}</p>
                              )}
                            </td>
                          )}
                          {isFirstPlugin && (
                            <td 
                              rowSpan={rowSpan} 
                              className="px-4 py-2 align-top bg-gray-50"
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
                                    className="w-full rounded border border-gray-300 px-2 py-1 text-sm"
                                    placeholder="Enter reason"
                                  />
                                ) : (
                                  <p className="text-sm text-gray-500 py-1">—</p>
                                )
                              ) : (
                                <p className="text-sm text-gray-900 py-1">{plugin.country_reason || '—'}</p>
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
                                className="w-full rounded border border-gray-300 px-2 py-1 text-sm"
                                placeholder="Enter plugin name"
                              />
                            ) : (
                              <p className="text-sm text-gray-900 py-1">{plugin.plugins_updated || '—'}</p>
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
                                className="w-full rounded border border-gray-300 px-2 py-1 text-sm"
                              >
                                <option value="">Select status</option>
                                <option value="Fail">Fail</option>
                                <option value="Success">Success</option>
                              </select>
                            ) : (
                              <p className="text-sm text-gray-900 py-1">{plugin.plugin_status || '—'}</p>
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
                                className="w-full rounded border border-gray-300 px-2 py-1 text-sm"
                                placeholder="Enter notes"
                              />
                            ) : (
                              <p className="text-sm text-gray-900 py-1">{plugin.notes || '—'}</p>
                            )}
                          </td>
                          <td className="px-4 py-2">
                            {isEditingTeamReport && (
                              <button
                                type="button"
                                onClick={() => {
                                  const updated = plugins.filter((_, i) => i !== idx);
                                  setTeamReport((prev) => ({ ...prev, new_domains_plugins: updated }));
                                }}
                                className="text-red-600 hover:text-red-800 text-sm"
                              >
                                Remove
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    });
                  }).flat();
                })()}
              </tbody>
            </table>
          </div>

          {/* Course Price Edits Progress */}
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <h3 className="text-base font-semibold text-gray-900 mb-3">Course List Price Edits Progress</h3>
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-2 text-left font-semibold text-gray-900">Country Name</th>
                  <th className="px-4 py-2 text-left font-semibold text-gray-900">Status</th>
                  <th className="px-4 py-2 text-left font-semibold text-gray-900">Notes</th>
                  {isEditingTeamReport && (
                    <th className="px-4 py-2 text-left font-semibold text-gray-900 w-20">Action</th>
                  )}
                </tr>
              </thead>
              <tbody>
                {(teamReport.course_price_edits || []).length === 0 && !isEditingTeamReport ? (
                  <tr>
                    <td colSpan={isEditingTeamReport ? 4 : 3} className="px-4 py-4 text-center text-gray-500 text-sm">No data</td>
                  </tr>
                ) : (
                  (teamReport.course_price_edits || []).map((row, idx) => (
                    <tr key={idx} className="border-t border-gray-200">
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
                            className="w-full rounded border border-gray-300 px-2 py-1 text-sm"
                          />
                        ) : (
                          <p className="text-sm text-gray-900 py-1">{row.country_name || '—'}</p>
                        )}
                      </td>
                      <td className="px-4 py-2">
                        {isEditingTeamReport ? (
                          <input
                            type="text"
                            value={row.status || ''}
                            onChange={(e) => {
                              const updated = [...(teamReport.course_price_edits || [])];
                              updated[idx] = { ...updated[idx], status: e.target.value };
                              setTeamReport((prev) => ({ ...prev, course_price_edits: updated }));
                            }}
                            className="w-full rounded border border-gray-300 px-2 py-1 text-sm"
                          />
                        ) : (
                          <p className="text-sm text-gray-900 py-1">{row.status || '—'}</p>
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
                            className="w-full rounded border border-gray-300 px-2 py-1 text-sm"
                          />
                        ) : (
                          <p className="text-sm text-gray-900 py-1">{row.notes || '—'}</p>
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
                            className="text-red-600 hover:text-red-800 text-sm"
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
                          const updated = [...(teamReport.course_price_edits || []), { country_name: '', status: '', notes: '' }];
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
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <h3 className="text-base font-semibold text-gray-900 mb-3">IT Team Leads Assistants Notable Tasks/Contribution</h3>
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-2 text-left font-semibold text-gray-900">Member</th>
                  <th className="px-4 py-2 text-left font-semibold text-gray-900">Task/Contribution</th>
                  {isEditingTeamReport && (
                    <th className="px-4 py-2 text-left font-semibold text-gray-900 w-20">Action</th>
                  )}
                </tr>
              </thead>
              <tbody>
                {(teamReport.notable_tasks || []).length === 0 && !isEditingTeamReport ? (
                  <tr>
                    <td colSpan={isEditingTeamReport ? 3 : 2} className="px-4 py-4 text-center text-gray-500 text-sm">No data</td>
                  </tr>
                ) : (
                  (teamReport.notable_tasks || []).map((row, idx) => (
                    <tr key={idx} className="border-t border-gray-200">
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
                            className="w-full rounded border border-gray-300 px-2 py-1 text-sm"
                          />
                        ) : (
                          <p className="text-sm text-gray-900 py-1">{row.member || '—'}</p>
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
                            className="w-full rounded border border-gray-300 px-2 py-1 text-sm"
                          />
                        ) : (
                          <p className="text-sm text-gray-900 py-1">{row.task_contribution || '—'}</p>
                        )}
                      </td>
                      <td className="px-4 py-2">
                        {isEditingTeamReport && (
                          <button
                            type="button"
                            onClick={() => {
                              const updated = (teamReport.notable_tasks || []).filter((_, i) => i !== idx);
                              setTeamReport((prev) => ({ ...prev, notable_tasks: updated }));
                            }}
                            className="text-red-600 hover:text-red-800 text-sm"
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

          <hr className="my-6 border-gray-300" />

          {/* Monitoring Team Updates */}
          <div className="space-y-6">
            <h3 className="text-lg font-semibold text-gray-900">Monitoring Team Updates</h3>

            {/* Today's Attendance */}
            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <h4 className="text-base font-semibold text-gray-900 mb-3">Today's Attendance</h4>
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-2 text-left font-semibold text-gray-900">Counts</th>
                    <th className="px-4 py-2 text-left font-semibold text-gray-900">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    { key: 'late', label: 'Late' },
                    { key: 'notable_late', label: 'Notable Late' },
                    { key: 'on_leave', label: 'On Leave' },
                    { key: 'half_day', label: 'Half Day' },
                    { key: 'absent', label: 'Absent' },
                  ].map(({ key, label }) => (
                    <tr key={key} className="border-t border-gray-200">
                      <td className="px-4 py-2">
                        {isEditingTeamReport ? (
                          <input
                            type="number"
                            min="0"
                            value={teamReport.attendance_counts?.[key] || 0}
                            onChange={(e) =>
                              setTeamReport((prev) => ({
                                ...prev,
                                attendance_counts: {
                                  ...prev.attendance_counts,
                                  [key]: parseInt(e.target.value) || 0,
                                },
                              }))
                            }
                            className="w-full rounded border border-gray-300 px-2 py-1 text-sm"
                          />
                        ) : (
                          <p className="text-sm text-gray-900 py-1">{teamReport.attendance_counts?.[key] || 0}</p>
                        )}
                      </td>
                      <td className="px-4 py-2 text-gray-700">{label}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Reviews */}
            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <h4 className="text-base font-semibold text-gray-900 mb-3">Knowles Training Institute Reviews</h4>
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <label className="text-sm text-gray-700 w-32">Google:</label>
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
                        className="rounded border border-gray-300 px-2 py-1 text-sm"
                      />
                      <span className="text-sm text-gray-600">reviews</span>
                    </>
                  ) : (
                    <span className="text-sm text-gray-900">There are now {teamReport.reviews?.google || 0} Google reviews.</span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <label className="text-sm text-gray-700 w-32">Glassdoor:</label>
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
                        className="rounded border border-gray-300 px-2 py-1 text-sm"
                      />
                      <span className="text-sm text-gray-600">reviews</span>
                    </>
                  ) : (
                    <span className="text-sm text-gray-900">There are now {teamReport.reviews?.glassdoor || 0} Glassdoor reviews.</span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <label className="text-sm text-gray-700 w-32">Trustpilot:</label>
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
                        className="rounded border border-gray-300 px-2 py-1 text-sm"
                      />
                      <span className="text-sm text-gray-600">reviews</span>
                    </>
                  ) : (
                    <span className="text-sm text-gray-900">There are now {teamReport.reviews?.trustpilot || 0} Trustpilot reviews.</span>
                  )}
                </div>
              </div>
            </div>

            {/* Interns Remaining Hours */}
            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <div className="mb-3">
                <h4 className="text-base font-semibold text-gray-900">
                  List of Interns' Remaining Hours (Less than 100){' '}
                  <span className="font-normal text-gray-700">({formatDateLong(teamReportDate)})</span>
                </h4>
              </div>
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-2 text-left font-semibold text-gray-900">List Of Interns</th>
                    <th className="px-4 py-2 text-left font-semibold text-gray-900">Hours Remaining</th>
                    <th className="px-4 py-2 text-left font-semibold text-gray-900">Designation</th>
                    {isEditingTeamReport && (
                      <th className="px-4 py-2 text-left font-semibold text-gray-900 w-20">Action</th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {(teamReport.interns_remaining_hours || []).length === 0 && !isEditingTeamReport ? (
                    <tr>
                      <td colSpan={isEditingTeamReport ? 4 : 3} className="px-4 py-4 text-center text-gray-500 text-sm">No data</td>
                    </tr>
                  ) : (
                    (teamReport.interns_remaining_hours || []).map((row, idx) => (
                      <tr key={idx} className="border-t border-gray-200">
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
                              className="w-full rounded border border-gray-300 px-2 py-1 text-sm"
                            />
                          ) : (
                            <p className="text-sm text-gray-900 py-1">{row.intern_name || '—'}</p>
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
                              className="w-full rounded border border-gray-300 px-2 py-1 text-sm"
                            />
                          ) : (
                            <p className="text-sm text-gray-900 py-1">{row.hours_remaining || '—'}</p>
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
                              className="w-full rounded border border-gray-300 px-2 py-1 text-sm"
                            />
                          ) : (
                            <p className="text-sm text-gray-900 py-1">{row.designation || '—'}</p>
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
                              className="text-red-600 hover:text-red-800 text-sm"
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
    </div>
  );
}
