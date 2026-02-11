import { useState, useEffect } from 'react';
import { useSupabase } from '../context/supabase.jsx';
import { toast } from 'react-hot-toast';
import { permissions } from '../utils/rolePermissions.js';
import { getRoleDisplayName } from '../utils/rolePermissions.js';

const PRIMARY = '#6795BE';
const todayStr = () => new Date().toISOString().slice(0, 10);

function formatTime(t) {
  if (!t) return '—';
  const s = String(t);
  if (s.length >= 5) return s.slice(0, 5);
  return s || '—';
}

export default function DailyReportManage() {
  const { supabase, userRole } = useSupabase();
  const canManage = permissions.canManageDailyReport(userRole);
  const [activeTab, setActiveTab] = useState('status');
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState(todayStr());
  const [interns, setInterns] = useState([]);
  const [submissions, setSubmissions] = useState([]);
  const [questions, setQuestions] = useState([]);
  const [savingQuestion, setSavingQuestion] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [newQuestionText, setNewQuestionText] = useState('');
  const [newQuestionRequired, setNewQuestionRequired] = useState(true);

  useEffect(() => {
    if (!canManage) return;
    fetchData();
  }, [canManage, selectedDate, activeTab]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [usersRes, subsRes, qRes] = await Promise.all([
        supabase.from('users').select('id, full_name, email, role, team').eq('role', 'intern').order('full_name'),
        activeTab === 'status'
          ? supabase.from('daily_report_submissions').select('user_id, report_date, submitted_at, time_in, time_out').eq('report_date', selectedDate)
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

  if (!canManage) {
    return (
      <div className="p-6">
        <p className="text-gray-600">You don’t have permission to manage daily reports.</p>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto p-6">
      <h1 className="text-2xl font-bold text-gray-900 mb-6" style={{ color: PRIMARY }}>
        Daily Report Management
      </h1>

      <div className="flex flex-wrap gap-4 items-center border-b border-gray-200 pb-4 mb-6">
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
            Form questions
          </button>
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
      </div>

      {activeTab === 'status' && (
        <div>
          <div className="bg-white rounded-lg border border-gray-200 overflow-x-auto">
            <table className="w-full text-sm min-w-[640px]">
              <thead className="bg-gray-50">
                <tr>
                  <th className="text-left px-4 py-3 font-semibold text-gray-900">Date</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-900">Name</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-900">Team</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-900">Role</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-900">Time in</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-900">Time out</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-900">Submitted</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-gray-500">
                      Loading…
                    </td>
                  </tr>
                ) : interns.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-gray-500">
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
          <p className="text-sm text-gray-600">
            Customize the questions interns see on the daily report form. Only TL, VTL, TLA, and Admin can edit these.
          </p>
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
            {questions.map((q) => (
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
                    <span className="flex-1 text-gray-900">{q.question_text}</span>
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
    </div>
  );
}
