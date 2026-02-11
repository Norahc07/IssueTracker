import { useState, useEffect } from 'react';
import { useSupabase } from '../context/supabase.jsx';
import { toast } from 'react-hot-toast';

const PRIMARY = '#6795BE';
const todayStr = () => new Date().toISOString().slice(0, 10);

export default function DailyReportForm() {
  const { supabase, user } = useSupabase();
  const [questions, setQuestions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [existing, setExisting] = useState(null);

  const [reportDate, setReportDate] = useState(todayStr());
  const [timeIn, setTimeIn] = useState('');
  const [timeOut, setTimeOut] = useState('');
  const [answers, setAnswers] = useState({});

  useEffect(() => {
    if (!user) return;
    (async () => {
      setLoading(true);
      try {
        const [qRes, sRes] = await Promise.all([
          supabase.from('daily_report_questions').select('id, sort_order, question_text, required').order('sort_order'),
          supabase.from('daily_report_submissions').select('*').eq('user_id', user.id).eq('report_date', todayStr()).maybeSingle(),
        ]);
        if (qRes.data) setQuestions(qRes.data);
        if (sRes.data) {
          setExisting(sRes.data);
          setReportDate(sRes.data.report_date || todayStr());
          setTimeIn(sRes.data.time_in ? String(sRes.data.time_in).slice(0, 5) : '');
          setTimeOut(sRes.data.time_out ? String(sRes.data.time_out).slice(0, 5) : '');
          setAnswers(sRes.data.answers || {});
        }
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

  return (
    <div className="max-w-2xl mx-auto p-6">
      <h1 className="text-2xl font-bold text-gray-900 mb-6" style={{ color: PRIMARY }}>
        Daily Report
      </h1>
      <form onSubmit={handleSubmit} className="space-y-6">
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
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Time in</label>
            <input
              type="time"
              value={timeIn}
              onChange={(e) => setTimeIn(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:ring-2 focus:ring-[#6795BE] focus:border-transparent"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Time out</label>
            <input
              type="time"
              value={timeOut}
              onChange={(e) => setTimeOut(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:ring-2 focus:ring-[#6795BE] focus:border-transparent"
            />
          </div>
          <div className="sm:col-span-2">
            <button
              type="button"
              onClick={fillFromAttendance}
              className="text-sm font-medium hover:underline"
              style={{ color: PRIMARY }}
            >
              Fill time in/out from attendance
            </button>
          </div>
        </div>

        {questions.length > 0 && (
          <div>
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Questions</h2>
            <div className="space-y-4">
              {questions.map((q) => (
                <div key={q.id}>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {q.question_text} {q.required && <span className="text-red-500">*</span>}
                  </label>
                  <textarea
                    value={answers[q.id] ?? ''}
                    onChange={(e) => handleAnswer(q.id, e.target.value)}
                    required={q.required}
                    rows={3}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:ring-2 focus:ring-[#6795BE] focus:border-transparent resize-none"
                    placeholder="Your answer..."
                  />
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="flex justify-end gap-3 pt-4">
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
    </div>
  );
}
