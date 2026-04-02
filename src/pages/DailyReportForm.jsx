import { useState, useEffect } from 'react';
import { useSupabase } from '../context/supabase.jsx';
import { toast } from 'react-hot-toast';
import { createNotifications, getUserIdsByScope, scopeFromUserProfile } from '../utils/notifications.js';

const PRIMARY = '#6795BE';
const todayStr = () => new Date().toISOString().slice(0, 10);

/** Local time: editable until 17:00 (5:00 PM). */
function isBeforeFivePMCutoff() {
  return new Date().getHours() < 17;
}

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
  const [submitAttempted, setSubmitAttempted] = useState(false);
  /** True only after user clicks Edit for today's report (before 5 PM). */
  const [formUnlocked, setFormUnlocked] = useState(false);
  const [confirmSubmitOpen, setConfirmSubmitOpen] = useState(false);

  useEffect(() => {
    if (!user) return;
    (async () => {
      setLoading(true);
      try {
        const [qRes, logsRes] = await Promise.all([
          supabase.from('daily_report_questions').select('id, sort_order, question_text, required').order('sort_order'),
          supabase
            .from('daily_report_submissions')
            .select('id, user_id, report_date, submitted_at, time_in, time_out, answers')
            .eq('user_id', user.id)
            .order('report_date', { ascending: false }),
        ]);
        if (qRes.data) setQuestions(qRes.data);
        setLogs(logsRes.data || []);
      } catch (e) {
        toast.error('Failed to load form');
      } finally {
        setLoading(false);
      }
    })();
  }, [user?.id, supabase]);

  useEffect(() => {
    if (!user || !supabase) return;
    setFormUnlocked(false);
    (async () => {
      try {
        const { data } = await supabase
          .from('daily_report_submissions')
          .select('*')
          .eq('user_id', user.id)
          .eq('report_date', reportDate)
          .maybeSingle();
        if (data) {
          setExisting(data);
          setTimeIn(data.time_in ? String(data.time_in).slice(0, 5) : '');
          setTimeOut(data.time_out ? String(data.time_out).slice(0, 5) : '');
          setAnswers(data.answers || {});
        } else {
          setExisting(null);
          setTimeIn('');
          setTimeOut('');
          setAnswers({});
        }
      } catch (e) {
        console.warn('Daily report load for date:', e);
      }
    })();
  }, [user?.id, supabase, reportDate]);

  useEffect(() => {
    if (activeTab === 'form') setReportDate(todayStr());
  }, [activeTab]);

  useEffect(() => {
    if (activeTab === 'log') setFormUnlocked(false);
  }, [activeTab]);

  const handleAnswer = (questionId, value) => {
    setAnswers((prev) => ({ ...prev, [questionId]: value }));
  };

  const refreshLogs = async () => {
    if (!user || !supabase) return;
    const { data } = await supabase
      .from('daily_report_submissions')
      .select('id, user_id, report_date, submitted_at, time_in, time_out, answers')
      .eq('user_id', user.id)
      .order('report_date', { ascending: false });
    setLogs(Array.isArray(data) ? data : []);
  };

  const submitNow = async () => {
    if (!user) return;
    if (!isFormValid) return;
    setSaving(true);
    try {
      const payload = {
        user_id: user.id,
        report_date: reportDate,
        time_in: timeIn || null,
        time_out: timeOut || null,
        answers,
      };
      const isUpdate = !!existing?.id;
      let savedRow = null;
      if (existing?.id) {
        const { data, error } = await supabase
          .from('daily_report_submissions')
          .update(payload)
          .eq('id', existing.id)
          .select()
          .single();
        if (error) throw error;
        savedRow = data;
        toast.success('Changes saved.');
      } else {
        const { data, error } = await supabase
          .from('daily_report_submissions')
          .upsert(payload, { onConflict: 'user_id,report_date' })
          .select()
          .single();
        if (error) throw error;
        savedRow = data;
        toast.success('Report submitted.');
      }
      if (savedRow) {
        setExisting(savedRow);
        setTimeIn(savedRow.time_in ? String(savedRow.time_in).slice(0, 5) : '');
        setTimeOut(savedRow.time_out ? String(savedRow.time_out).slice(0, 5) : '');
        setAnswers(savedRow.answers || {});
      }
      setFormUnlocked(false);
      setSubmitAttempted(false);
      await refreshLogs();

      // System notification: route by submitter scope (TLA vs Monitoring vs PAT1) + Admin
      try {
        const { data: me } = await supabase.from('users').select('role, team').eq('id', user.id).maybeSingle();
        const scope = scopeFromUserProfile(me) || 'tla';
        const recipientIds = await getUserIdsByScope(supabase, scope);
        const displayName = user?.user_metadata?.full_name || user?.email || 'User';
        await createNotifications(
          supabase,
          recipientIds.map((id) => ({
            recipient_user_id: id,
            sender_user_id: user.id,
            type: isUpdate ? 'daily_report_updated' : 'daily_report_submitted',
            title: isUpdate ? 'Daily report updated' : 'Daily report submitted',
            body: `${displayName} • ${reportDate}`,
            context_date: reportDate,
            metadata: { user_id: user.id, report_date: reportDate },
          }))
        );
      } catch (notifyErr) {
        console.warn('Daily report notification error:', notifyErr);
      }
    } catch (err) {
      toast.error(err?.message || 'Failed to save report');
    } finally {
      setSaving(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!user) return;
    if (confirmSubmitOpen) return;
    const t = todayStr();
    if (
      existing?.id &&
      (String(reportDate) !== t || !formUnlocked || !isBeforeFivePMCutoff())
    ) {
      return;
    }
    setSubmitAttempted(true);
    if (!isFormValid) return;

    const isFirstTimeSubmit = !existing?.id;
    if (isFirstTimeSubmit) {
      setConfirmSubmitOpen(true);
      return;
    }

    await submitNow();
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

  const q1 = questions[0];
  const sections2to7 = questions.slice(1, 7);
  const today = todayStr();
  const selectedLog = detailIndex != null ? logs[detailIndex] : null;
  const hasSubmission = !!existing?.id;
  const isReportForToday = String(reportDate) === today;
  const beforeCutoff = isBeforeFivePMCutoff();
  const canUnlockTodayEdit = hasSubmission && isReportForToday && beforeCutoff;
  const isReadOnly =
    hasSubmission && (!isReportForToday || !formUnlocked || !beforeCutoff);
  const showPrimarySave = !isReadOnly;
  const primaryButtonLabel = saving
    ? 'Saving…'
    : hasSubmission && formUnlocked && beforeCutoff
      ? 'Save changes'
      : 'Submit report';

  const requiredQuestions = Array.isArray(questions) ? questions.filter((q) => q?.required) : [];
  const requiredMissingById = (() => {
    const map = {};
    requiredQuestions.forEach((q) => {
      const v = String(answers?.[q.id] ?? '').trim();
      if (!v) map[q.id] = 'Required.';
    });
    return map;
  })();
  const isFormValid = (() => {
    if (!String(reportDate || '').trim()) return false;
    if (requiredQuestions.length === 0) return true;
    return Object.keys(requiredMissingById).length === 0;
  })();

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="text-gray-600 dark:text-gray-300">Loading form…</div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto p-6 dark:text-gray-100">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-2" style={{ color: PRIMARY }}>
        Daily Report
      </h1>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
        Submit your daily documentation report and review your previous submissions.
      </p>

      {/* Tabs: Form | Log */}
      <div className="flex gap-2 border-b border-gray-200 mb-6">
        <button
          type="button"
          onClick={() => setActiveTab('form')}
          className={`px-4 py-2 rounded-t-lg text-sm font-medium ${
            activeTab === 'form'
              ? 'bg-white border border-b-0 border-gray-200 -mb-px dark:bg-gray-900 dark:border-gray-700 dark:text-gray-100'
              : 'text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800/60'
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
              ? 'bg-white border border-b-0 border-gray-200 -mb-px dark:bg-gray-900 dark:border-gray-700 dark:text-gray-100'
              : 'text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800/60'
          }`}
          style={activeTab === 'log' ? { borderTopColor: PRIMARY } : {}}
        >
          My Daily Report log
        </button>
      </div>

      {/* Form tab — date is always today; past reports are view-only under My Daily Report log */}
      {activeTab === 'form' && (
        <>
          {hasSubmission && isReadOnly && isReportForToday && beforeCutoff && (
            <div className="rounded-lg border border-green-100 bg-green-50 px-4 py-3 text-sm text-green-800 dark:border-green-900/60 dark:bg-green-950/30 dark:text-green-200 mb-4">
              Submitted for today. Use <span className="font-semibold">Edit</span> (before 5:00 PM) if you need to fix a mistake.
            </div>
          )}
          {hasSubmission && isReadOnly && isReportForToday && !beforeCutoff && (
            <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-700 dark:border-gray-700 dark:bg-gray-950/40 dark:text-gray-200 mb-4">
              Today&apos;s report is locked after 5:00 PM. For corrections, contact your TL/VTL or admin.
            </div>
          )}
          <form onSubmit={handleSubmit} className="space-y-8 mb-8">
        {submitAttempted && !isFormValid && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-200">
            Please complete all required fields before submitting.
          </div>
        )}
        {/* Name & Date */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Name</label>
            <input
              type="text"
              value={displayName}
              readOnly
              className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-gray-700 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Date</label>
            <p className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-800 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100">
              {reportDate}
              <span className="block text-xs text-gray-500 dark:text-gray-400 mt-0.5">Always today — use My Daily Report log to review past days.</span>
            </p>
          </div>
        </div>

        {/* 1. Attendance */}
        <section className="space-y-4">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100" style={{ color: PRIMARY }}>
            1. Attendance
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Time IN</label>
              <input
                type="time"
                value={timeIn}
                onChange={(e) => setTimeIn(e.target.value)}
                readOnly={isReadOnly}
                className={`w-full rounded-lg border border-gray-300 bg-white dark:bg-gray-900 dark:border-gray-700 px-3 py-2 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-[#6795BE] focus:border-transparent ${
                  isReadOnly ? 'opacity-90 cursor-not-allowed bg-gray-50 dark:bg-gray-950/40' : ''
                }`}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Time OUT</label>
              <input
                type="time"
                value={timeOut}
                onChange={(e) => setTimeOut(e.target.value)}
                readOnly={isReadOnly}
                className={`w-full rounded-lg border border-gray-300 bg-white dark:bg-gray-900 dark:border-gray-700 px-3 py-2 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-[#6795BE] focus:border-transparent ${
                  isReadOnly ? 'opacity-90 cursor-not-allowed bg-gray-50 dark:bg-gray-950/40' : ''
                }`}
              />
            </div>
          </div>
          <div>
            <button
              type="button"
              onClick={fillFromAttendance}
              disabled={isReadOnly}
              className="text-sm font-medium hover:underline mb-2 text-gray-700 dark:text-gray-200 disabled:opacity-50 disabled:cursor-not-allowed disabled:no-underline"
              style={{ color: PRIMARY }}
            >
              Fill time in/out from attendance
            </button>
          </div>
          {q1 && (
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Notes</label>
              <textarea
                value={answers[q1.id] ?? ''}
                onChange={(e) => handleAnswer(q1.id, e.target.value)}
                readOnly={isReadOnly}
                required={q1.required}
                rows={2}
                className={`w-full rounded-lg border border-gray-300 bg-white dark:bg-gray-900 dark:border-gray-700 px-3 py-2 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-[#6795BE] focus:border-transparent resize-none ${
                  isReadOnly ? 'opacity-90 cursor-not-allowed bg-gray-50 dark:bg-gray-950/40' : ''
                }`}
                placeholder={q1.question_text}
              />
              {q1.required && submitAttempted && requiredMissingById[q1.id] && (
                <p className="mt-1 text-xs font-medium text-red-600 dark:text-red-300">{requiredMissingById[q1.id]}</p>
              )}
            </div>
          )}
        </section>

        {/* 2.–7. Sections from template */}
        {sections2to7.map((q, idx) => (
          <section key={q.id} className="space-y-2">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100" style={{ color: PRIMARY }}>
              {idx + 2}. {SECTION_HEADINGS[idx + 1] || q.question_text}
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400">{q.question_text}</p>
            <textarea
              value={answers[q.id] ?? ''}
              onChange={(e) => handleAnswer(q.id, e.target.value)}
              readOnly={isReadOnly}
              required={q.required}
              rows={4}
              className={`w-full rounded-lg border border-gray-300 bg-white dark:bg-gray-900 dark:border-gray-700 px-3 py-2 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-[#6795BE] focus:border-transparent resize-none ${
                isReadOnly ? 'opacity-90 cursor-not-allowed bg-gray-50 dark:bg-gray-950/40' : ''
              }`}
              placeholder="Your answer..."
            />
            {q.required && submitAttempted && requiredMissingById[q.id] && (
              <p className="text-xs font-medium text-red-600 dark:text-red-300">{requiredMissingById[q.id]}</p>
            )}
          </section>
        ))}

            {/* If no template yet, show a single generic block so form still works */}
            {questions.length === 0 && (
              <section className="space-y-2">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100" style={{ color: PRIMARY }}>
                  2. Tasks Accomplished
                </h2>
                <textarea
                  value={answers._fallback ?? ''}
                  onChange={(e) => setAnswers((prev) => ({ ...prev, _fallback: e.target.value }))}
                  readOnly={isReadOnly}
                  rows={4}
                  className={`w-full rounded-lg border border-gray-300 bg-white dark:bg-gray-900 dark:border-gray-700 px-3 py-2 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-[#6795BE] focus:border-transparent resize-none ${
                    isReadOnly ? 'opacity-90 cursor-not-allowed bg-gray-50 dark:bg-gray-950/40' : ''
                  }`}
                  placeholder="List all completed tasks in bullet form."
                />
              </section>
            )}

            <div className="flex flex-wrap items-center justify-end gap-3 pt-4 border-t border-gray-200 dark:border-gray-800">
              {canUnlockTodayEdit && isReadOnly && (
                <button
                  type="button"
                  onClick={() => setFormUnlocked(true)}
                  className="px-5 py-2.5 rounded-lg text-sm font-medium border border-gray-300 dark:border-gray-600 text-gray-800 dark:text-gray-100 hover:bg-gray-50 dark:hover:bg-gray-800"
                >
                  Edit
                </button>
              )}
              {showPrimarySave && (
                <button
                  type="submit"
                  disabled={saving || !isFormValid || confirmSubmitOpen}
                  className="px-6 py-2.5 rounded-lg text-sm font-medium text-white disabled:opacity-50"
                  style={{ backgroundColor: PRIMARY }}
                >
                  {primaryButtonLabel}
                </button>
              )}
            </div>
          </form>
        </>
      )}

      {/* Log tab */}
      {activeTab === 'log' && (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100" style={{ color: PRIMARY }}>
            My Daily Report log
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Your submitted reports by date. You can review what you sent previously.
          </p>
          <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 overflow-x-auto mt-2">
            <table className="w-full text-sm min-w-[540px]">
              <thead className="bg-gray-50 dark:bg-gray-950/40">
                <tr>
                  <th className="text-left px-4 py-2 font-semibold text-gray-900 dark:text-gray-100">Date</th>
                  <th className="text-left px-4 py-2 font-semibold text-gray-900 dark:text-gray-100">Time in</th>
                  <th className="text-left px-4 py-2 font-semibold text-gray-900 dark:text-gray-100">Time out</th>
                  <th className="text-left px-4 py-2 font-semibold text-gray-900 dark:text-gray-100">Submitted at</th>
                  <th className="text-right px-4 py-2 font-semibold text-gray-900 dark:text-gray-100">Action</th>
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
                    <tr key={`${row.user_id}-${row.report_date}`} className="border-t border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/60">
                      <td className="px-4 py-2 text-gray-900 dark:text-gray-100">{row.report_date}</td>
                      <td className="px-4 py-2 text-gray-700 dark:text-gray-200">{row.time_in ? String(row.time_in).slice(0, 5) : '—'}</td>
                      <td className="px-4 py-2 text-gray-700 dark:text-gray-200">{row.time_out ? String(row.time_out).slice(0, 5) : '—'}</td>
                      <td className="px-4 py-2 text-gray-700 dark:text-gray-200">
                        {row.submitted_at
                          ? new Date(row.submitted_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                          : '—'}
                      </td>
                      <td className="px-4 py-2 text-right">
                        <div className="inline-flex flex-wrap items-center justify-end gap-2">
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
                          {String(row.report_date) === todayStr() && isBeforeFivePMCutoff() && (
                            <button
                              type="button"
                              onClick={() => {
                                setActiveTab('form');
                                setFormUnlocked(true);
                              }}
                              className="px-3 py-1.5 rounded-lg text-sm font-medium border border-gray-300 dark:border-gray-600 text-gray-800 dark:text-gray-100 hover:bg-gray-50 dark:hover:bg-gray-800"
                            >
                              Edit
                            </button>
                          )}
                        </div>
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
          <div className="bg-white dark:bg-gray-900 w-full max-w-3xl rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-800 overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-200 dark:border-gray-800 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100" style={{ color: PRIMARY }}>
                  Daily Report – {selectedLog.report_date}
                </h3>
                <p className="text-sm text-gray-600 dark:text-gray-300">
                  Submitted at{' '}
                  {selectedLog.submitted_at
                    ? new Date(selectedLog.submitted_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                    : '—'}
                </p>
              </div>
              <div className="shrink-0 flex flex-wrap items-center gap-2">
                {String(selectedLog.report_date) === todayStr() && isBeforeFivePMCutoff() && (
                  <button
                    type="button"
                    onClick={() => {
                      setShowDetail(false);
                      setDetailIndex(null);
                      setActiveTab('form');
                      setFormUnlocked(true);
                    }}
                    className="px-3 py-2 rounded-lg text-sm font-medium border border-gray-300 dark:border-gray-600 text-gray-800 dark:text-gray-100 hover:bg-gray-50 dark:hover:bg-gray-800"
                  >
                    Edit
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setShowDetail(false);
                    setDetailIndex(null);
                  }}
                  className="px-3 py-2 rounded-lg text-sm font-medium text-gray-700 dark:text-gray-200 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700"
                >
                  Close
                </button>
              </div>
            </div>

            <div className="p-5 space-y-6 max-h-[75vh] overflow-y-auto">
              {/* 1. Attendance */}
              <div className="space-y-2">
                <h4 className="text-base font-semibold text-gray-900 dark:text-gray-100" style={{ color: PRIMARY }}>
                  1. {SECTION_HEADINGS[0]}
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="rounded-lg border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-950/40 p-3">
                    <p className="text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wide">Time IN</p>
                    <p className="mt-1 text-sm text-gray-900 dark:text-gray-100">
                      {selectedLog.time_in ? String(selectedLog.time_in).slice(0, 5) : '—'}
                    </p>
                  </div>
                  <div className="rounded-lg border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-950/40 p-3">
                    <p className="text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wide">Time OUT</p>
                    <p className="mt-1 text-sm text-gray-900 dark:text-gray-100">
                      {selectedLog.time_out ? String(selectedLog.time_out).slice(0, 5) : '—'}
                    </p>
                  </div>
                </div>
                {questions[0] ? (
                  <div className="rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-3">
                    <p className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-1">Notes</p>
                    <p className="text-sm text-gray-700 dark:text-gray-200 whitespace-pre-wrap">
                      {(selectedLog.answers || {})[questions[0].id] || '—'}
                    </p>
                  </div>
                ) : null}
              </div>

              {/* 2.–7 sections */}
              {questions.slice(1, 7).map((q, idx) => (
                <div key={q.id} className="space-y-2">
                  <h4 className="text-base font-semibold text-gray-900 dark:text-gray-100" style={{ color: PRIMARY }}>
                    {idx + 2}. {SECTION_HEADINGS[idx + 1] || 'Section'}
                  </h4>
                  <p className="text-xs text-gray-500 dark:text-gray-300">{q.question_text}</p>
                  <div className="rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-3">
                    <p className="text-sm text-gray-700 dark:text-gray-200 whitespace-pre-wrap">
                      {(selectedLog.answers || {})[q.id] || '—'}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Confirm submit modal (first-time submit only) */}
      {confirmSubmitOpen && (
        <div className="fixed inset-0 z-[10003] bg-black/60 backdrop-blur-sm p-4 flex items-center justify-center">
          <div className="bg-white dark:bg-gray-900 w-full max-w-md rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-800 overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-200 dark:border-gray-800 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Confirm submission</h3>
                <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
                  Are you sure? After submission, you can&apos;t cancel it. You may still edit before 5:00 PM using <span className="font-medium">Edit</span> if applicable.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setConfirmSubmitOpen(false)}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 text-xl leading-none"
                aria-label="Close confirmation"
              >
                ×
              </button>
            </div>
            <div className="px-5 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmSubmitOpen(false)}
                className="px-4 py-2 rounded-lg text-sm font-medium text-gray-700 dark:text-gray-200 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={async () => {
                  setConfirmSubmitOpen(false);
                  await submitNow();
                }}
                disabled={saving}
                className="px-4 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-60"
                style={{ backgroundColor: PRIMARY }}
              >
                {saving ? 'Submitting…' : 'Yes, submit report'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}