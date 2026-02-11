import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSupabase } from '../context/supabase.jsx';

const SNOOZE_KEY = 'daily_report_reminder_snooze_until';
const REMINDER_HOUR = 16; // 4pm
const SNOOZE_MINUTES = 30;

export default function DailyReportReminder() {
  const { user, userRole, supabase } = useSupabase();
  const navigate = useNavigate();
  const [show, setShow] = useState(false);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    if (!user || userRole === undefined) return;

    const isIntern = userRole === 'intern' || !userRole;
    if (!isIntern) return;

    const check = async () => {
      const now = new Date();
      const snoozedUntil = parseInt(localStorage.getItem(SNOOZE_KEY), 10);
      if (snoozedUntil && Date.now() < snoozedUntil) return;
      // Show only at exactly 4:00 PM (or within the same minute to avoid missing due to timing)
      if (now.getHours() !== REMINDER_HOUR || now.getMinutes() > 0) return;
      const today = now.toISOString().slice(0, 10);
      const { data } = await supabase
        .from('daily_report_submissions')
        .select('id')
        .eq('user_id', user.id)
        .eq('report_date', today)
        .maybeSingle();
      if (data) return;
      setShow(true);
    };

    check();
    setChecked(true);
    const interval = setInterval(check, 60 * 1000);
    return () => clearInterval(interval);
  }, [user?.id, userRole, supabase]);

  const handleRemindLater = () => {
    localStorage.setItem(SNOOZE_KEY, String(Date.now() + SNOOZE_MINUTES * 60 * 1000));
    setShow(false);
  };

  const handleSendNow = () => {
    setShow(false);
    navigate('/daily-report');
  };

  if (!show || !checked) return null;

  return (
    <div className="fixed inset-0 z-[10001] flex items-center justify-center bg-black/80 backdrop-blur-md p-4">
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-8 text-center border-2 border-amber-200"
        style={{ animation: 'dailyReportFadeIn 0.3s ease-out' }}
      >
        <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-amber-100 flex items-center justify-center ring-4 ring-amber-200">
          <svg className="w-10 h-10 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Daily Report Reminder</h2>
        <p className="text-gray-600 mb-2 text-lg">
          It’s <strong>4:00 PM</strong>. Please submit your daily documentation report.
        </p>
        <p className="text-gray-500 text-sm mb-8">You can fill it now or be reminded again in a bit.</p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <button
            type="button"
            onClick={handleRemindLater}
            className="px-6 py-3.5 rounded-xl text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 transition-colors border border-gray-200"
          >
            Remind me later
          </button>
          <button
            type="button"
            onClick={handleSendNow}
            className="px-6 py-3.5 rounded-xl text-sm font-medium text-white hover:opacity-95 transition-opacity shadow-md"
            style={{ backgroundColor: '#6795BE' }}
          >
            Send now
          </button>
        </div>
      </div>
      <style>{`
        @keyframes dailyReportFadeIn {
          from { opacity: 0; transform: scale(0.95); }
          to { opacity: 1; transform: scale(1); }
        }
      `}</style>
    </div>
  );
}
