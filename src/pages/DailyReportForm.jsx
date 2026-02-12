import { useState, useEffect } from 'react';
import { useSupabase } from '../context/supabase.jsx';
import { toast } from 'react-hot-toast';

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

export default function DailyReportForm() {
  const { supabase, user } = useSupabase();
  const [questions, setQuestions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [existing, setExisting] = useState(null);
  const [logs, setLogs] = useState([]);
  const [activeTab, setActiveTab] = useState('form'); // 'form' | 'log'
  const [detailIndex, setDetailIndex] = useState(null);
  const [showDetail, setShowDetail] = useState(false);

  const [reportDate, setReportDate] = useState(todayStr());
  const [timeIn, setTimeIn] = useState('');
  const [timeOut, setTimeOut] = useState('');
  const [answers, setAnswers] = useState({});

  useEffect(() => {
    if (!user) return;
    (async () => {
      setLoading(true);
      try {
        const [qRes, sRes, logsRes] = await Promise.all([
          supabase.from('daily_report_questions').select('id, sort_order, question_text, required').order('sort_order'),
          supabase.from('daily_report_submissions').select('*').eq('user_id', user.id).eq('report_date', todayStr()).maybeSingle(),
          supabase
            .from('daily_report_submissions')
            .select('user_id, report_date, submitted_at, time_in, time_out, answers')
            .eq('user_id', user.id)
            .order('report_date', { ascending: false }),
        ]);
        if (qRes.data) setQuestions(qRes.data);
        if (sRes.data) {
          setExisting(sRes.data);
          setReportDate(sRes.data.report_date || todayStr());
          setTimeIn(sRes.data.time_in ? String(sRes.data.time_in).slice(0, 5) : '');
          setTimeOut(sRes.data.time_out ? String(sRes.data.time_out).slice(0, 5) : '');
          setAnswers(sRes.data.answers || {});
        }
        setLogs(logsRes.data || []);
      } catch (e) {
        toast.error('Failed to load form');
      } finally {
        setLoading(false);
      }
    })();
  }, [user?.id, supabase]);

  const handleAnswer = (questionId, value) => {
    setAnswers((prev) => ({ ...prev, [questionId]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!user) return;
    setSaving(true);
    try {
      const payload = {
        user_id: user.id,
        report_date: reportDate,
        time_in: timeIn || null,
        time_out: timeOut || null,
        answers,
      };
      if (existing?.id) {
        await supabase.from('daily_report_submissions').update(payload).eq('id', existing.id);
        toast.success('Report updated.');
      } else {
        await supabase.from('daily_report_submissions').upsert(payload, { onConflict: 'user_id,report_date' });
        toast.success('Report submitted.');
      }
      setExisting({ ...existing, ...payload });
    } catch (err) {
      toast.error(err?.message || 'Failed to save report');
    } finally {
      setSaving(false);
    }
  };

  const displayName = user?.user_metadata?.full_name || user?.email || '';

  const fillFromAttendance = async () => {
    if (!user) return;
    try {
      const { data } = await supabase
        .from('attendance_logs')
        .select('time_in, time_out')
        .eq('user_id', user.id)
        .eq('log_date', reportDate)
        .maybeSingle();
      if (data?.time_in) setTimeIn(String(data.time_in).slice(0, 5));
      if (data?.time_out) setTimeOut(String(data.time_out).slice(0, 5));
      if (data) toast.success('Time in/out filled from attendance.'); else toast('No attendance record for this date.');
    } catch {
      toast.error('Could not load attendance.');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="text-gray-600">Loading form…</div>
      </div>
    );
  }

  const q1 = questions[0];
  const sections2to7 = questions.slice(1, 7);
  const today = todayStr();
  const hasSubmittedToday = !!existing && String(existing.report_date) === today;
  const selectedLog = detailIndex != null ? logs[detailIndex] : null;

  return (
    <div className="max-w-2xl mx-auto p-6">
      <h1 className="text-2xl font-bold text-gray-900 mb-2" style={{ color: PRIMARY }}>
        Daily Report
      </h1>
      <p className="text-sm text-gray-500 mb-4">
        Submit your daily documentation report and review your previous submissions.
      </p>

      {/* Tabs: Form | Log */}
      <div className="flex gap-2 border-b border-gray-200 mb-6">
        <button
          type="button"
          onClick={() => setActiveTab('form')}
          className={`px-4 py-2 rounded-t-lg text-sm font-medium ${
            activeTab === 'form'
              ? 'bg-white border border-b-0 border-gray-200 -mb-px'
              : 'text-gray-600 hover:bg-gray-100'
          }`}
          style={activeTab === 'form' ? { borderTopColor: PRIMARY } : {}}
        >
          Daily Report form
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('log')}
          className={`px-4 py-2 rounded-t-lg text-sm font-medium ${
            activeTab === 'log'
              ? 'bg-white border border-b-0 border-gray-200 -mb-px'
              : 'text-gray-600 hover:bg-gray-100'
          }`}
          style={activeTab === 'log' ? { borderTopColor: PRIMARY } : {}}
        >
          My Daily Report log
        </button>
      </div>

      {/* Form tab */}
      {activeTab === 'form' && (
        <>
          {hasSubmittedToday ? (
            <div className="rounded-lg border border-green-100 bg-green-50 px-4 py-3 text-sm text-green-800 mb-6">
              You have already submitted your daily documentation report for today. Come back tomorrow to submit a new one.
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-8 mb-8">
        {/* Name & Date */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
            <input
              type="text"
              value={displayName}
              readOnly
              className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-gray-700"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
            <input
              type="date"
              value={reportDate}
              onChange={(e) => setReportDate(e.target.value)}
              required
              className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:ring-2 focus:ring-[#6795BE] focus:border-transparent"
            />
          </div>
        </div>

        {/* 1. Attendance */}
        <section className="space-y-4">
          <h2 className="text-lg font-semibold text-gray-900" style={{ color: PRIMARY }}>
            1. Attendance
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Time IN</label>
              <input
                type="time"
                value={timeIn}
                onChange={(e) => setTimeIn(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:ring-2 focus:ring-[#6795BE] focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Time OUT</label>
              <input
                type="time"
                value={timeOut}
                onChange={(e) => setTimeOut(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:ring-2 focus:ring-[#6795BE] focus:border-transparent"
              />
            </div>
          </div>
          <div>
            <button
              type="button"
              onClick={fillFromAttendance}
              className="text-sm font-medium hover:underline mb-2"
              style={{ color: PRIMARY }}
            >
              Fill time in/out from attendance
            </button>
          </div>
          {q1 && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
              <textarea
                value={answers[q1.id] ?? ''}
                onChange={(e) => handleAnswer(q1.id, e.target.value)}
                required={q1.required}
                rows={2}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:ring-2 focus:ring-[#6795BE] focus:border-transparent resize-none"
                placeholder={q1.question_text}
              />
            </div>
          )}
        </section>

        {/* 2.–7. Sections from template */}
        {sections2to7.map((q, idx) => (
          <section key={q.id} className="space-y-2">
            <h2 className="text-lg font-semibold text-gray-900" style={{ color: PRIMARY }}>
              {idx + 2}. {SECTION_HEADINGS[idx + 1] || q.question_text}
            </h2>
            <p className="text-sm text-gray-500">{q.question_text}</p>
            <textarea
              value={answers[q.id] ?? ''}
              onChange={(e) => handleAnswer(q.id, e.target.value)}
              required={q.required}
              rows={4}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:ring-2 focus:ring-[#6795BE] focus:border-transparent resize-none"
              placeholder="Your answer..."
            />
          </section>
        ))}

            {/* If no template yet, show a single generic block so form still works */}
            {questions.length === 0 && (
              <section className="space-y-2">
                <h2 className="text-lg font-semibold text-gray-900" style={{ color: PRIMARY }}>
                  2. Tasks Accomplished
                </h2>
                <textarea
                  value={answers._fallback ?? ''}
                  onChange={(e) => setAnswers((prev) => ({ ...prev, _fallback: e.target.value }))}
                  rows={4}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:ring-2 focus:ring-[#6795BE] focus:border-transparent resize-none"
                  placeholder="List all completed tasks in bullet form."
                />
              </section>
            )}

            <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
              <button
                type="submit"
                disabled={saving}
                className="px-6 py-2.5 rounded-lg text-sm font-medium text-white disabled:opacity-50"
                style={{ backgroundColor: PRIMARY }}
              >
                {saving ? 'Saving…' : existing ? 'Update report' : 'Submit report'}
              </button>
            </div>
          </form>
          )}
        </>
      )}

      {/* Log tab */}
      {activeTab === 'log' && (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-gray-900" style={{ color: PRIMARY }}>
            My Daily Report log
          </h2>
          <p className="text-sm text-gray-500">
            Your submitted reports by date. You can review what you sent previously.
          </p>
          <div className="bg-white rounded-lg border border-gray-200 overflow-x-auto mt-2">
            <table className="w-full text-sm min-w-[540px]">
              <thead className="bg-gray-50">
                <tr>
                  <th className="text-left px-4 py-2 font-semibold text-gray-900">Date</th>
                  <th className="text-left px-4 py-2 font-semibold text-gray-900">Time in</th>
                  <th className="text-left px-4 py-2 font-semibold text-gray-900">Time out</th>
                  <th className="text-left px-4 py-2 font-semibold text-gray-900">Submitted at</th>
                  <th className="text-right px-4 py-2 font-semibold text-gray-900">Action</th>
                </tr>
              </thead>
              <tbody>
                {logs.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-6 text-center text-gray-500">
                      No reports submitted yet.
                    </td>
                  </tr>
                ) : (
                  logs.map((row, index) => (
                    <tr key={`${row.user_id}-${row.report_date}`} className="border-t border-gray-100 hover:bg-gray-50">
                      <td className="px-4 py-2 text-gray-900">{row.report_date}</td>
                      <td className="px-4 py-2 text-gray-700">{row.time_in ? String(row.time_in).slice(0, 5) : '—'}</td>
                      <td className="px-4 py-2 text-gray-700">{row.time_out ? String(row.time_out).slice(0, 5) : '—'}</td>
                      <td className="px-4 py-2 text-gray-700">
                        {row.submitted_at
                          ? new Date(row.submitted_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                          : '—'}
                      </td>
                      <td className="px-4 py-2 text-right">
                        <button
                          type="button"
                          onClick={() => {
                            setDetailIndex(index);
                            setShowDetail(true);
                          }}
                          className="px-3 py-1.5 rounded-lg text-sm font-medium text-white"
                          style={{ backgroundColor: PRIMARY }}
                        >
                          View
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {showDetail && selectedLog && (
        <div className="fixed inset-0 z-[10002] bg-black/60 backdrop-blur-sm p-4 flex items-center justify-center">
          <div className="bg-white w-full max-w-3xl rounded-2xl shadow-2xl border border-gray-200 overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-200 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="text-lg font-semibold text-gray-900" style={{ color: PRIMARY }}>
                  Daily Report – {selectedLog.report_date}
                </h3>
                <p className="text-sm text-gray-600">
                  Submitted at{' '}
                  {selectedLog.submitted_at
                    ? new Date(selectedLog.submitted_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                    : '—'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowDetail(false);
                  setDetailIndex(null);
                }}
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
                    <p className="mt-1 text-sm text-gray-900">
                      {selectedLog.time_in ? String(selectedLog.time_in).slice(0, 5) : '—'}
                    </p>
                  </div>
                  <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                    <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Time OUT</p>
                    <p className="mt-1 text-sm text-gray-900">
                      {selectedLog.time_out ? String(selectedLog.time_out).slice(0, 5) : '—'}
                    </p>
                  </div>
                </div>
                {questions[0] ? (
                  <div className="rounded-lg border border-gray-200 bg-white p-3">
                    <p className="text-sm font-medium text-gray-900 mb-1">Notes</p>
                    <p className="text-sm text-gray-700 whitespace-pre-wrap">
                      {(selectedLog.answers || {})[questions[0].id] || '—'}
                    </p>
                  </div>
                ) : null}
              </div>

              {/* 2.–7 sections */}
              {questions.slice(1, 7).map((q, idx) => (
                <div key={q.id} className="space-y-2">
                  <h4 className="text-base font-semibold text-gray-900" style={{ color: PRIMARY }}>
                    {idx + 2}. {SECTION_HEADINGS[idx + 1] || 'Section'}
                  </h4>
                  <p className="text-xs text-gray-500">{q.question_text}</p>
                  <div className="rounded-lg border border-gray-200 bg-white p-3">
                    <p className="text-sm text-gray-700 whitespace-pre-wrap">
                      {(selectedLog.answers || {})[q.id] || '—'}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}