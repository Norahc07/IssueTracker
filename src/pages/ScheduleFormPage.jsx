import { useEffect, useState } from 'react';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseAnonKey);

const PRIMARY = '#6795BE';
const PRIMARY_LIGHT = 'rgba(103, 149, 190, 0.08)';

const PREFERRED_OPTIONS = [
  { value: 'option_a', label: 'Option A: 5 half-days' },
  { value: 'option_b', label: 'Option B: 3 full days' },
  { value: 'combination', label: 'Suitable combination of both' },
  { value: 'regular_shift', label: 'Regular shift' },
];

const REGULAR_SHIFT_OPTIONS = [
  { value: '7', label: '9:00 AM – 5:00 PM (7 hours/day)' },
  { value: '8', label: '9:00 AM – 6:00 PM (8 hours/day)' },
];

const WEEKDAYS = [
  { value: 'Monday', label: 'Monday' },
  { value: 'Tuesday', label: 'Tuesday' },
  { value: 'Wednesday', label: 'Wednesday' },
  { value: 'Thursday', label: 'Thursday' },
  { value: 'Friday', label: 'Friday' },
];

const inputClass = 'w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:border-[#6795BE] focus:outline-none focus:ring-1 focus:ring-[#6795BE] transition-colors';
const labelClass = 'block text-sm font-medium text-gray-700 mb-1.5';

export default function ScheduleFormPage() {
  const [config, setConfig] = useState(null);
  const [loading, setLoading] = useState(true);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    intern_name: '',
    email: '',
    preferred_option: '',
    start_date_preference: '',
    notes: '',
  });
  const [regular_shift_hours, setRegularShiftHours] = useState('');
  const [option_b_days, setOptionBDays] = useState([]);
  const [option_b_hours, setOptionBHours] = useState('');
  const [option_a_hours_per_half_day, setOptionAHoursPerHalfDay] = useState(4);

  useEffect(() => {
    const load = async () => {
      try {
        const { data } = await supabase.from('schedule_form_config').select('*').eq('id', 'default').maybeSingle();
        if (data) setConfig(data);
      } catch (e) {
        console.error('Schedule form load error:', e);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.intern_name?.trim() || !form.email?.trim()) return;
    const opt = form.preferred_option;
    if (opt === 'regular_shift' && !regular_shift_hours) {
      alert('Please select a regular shift (7 or 8 hours/day).');
      return;
    }
    if (opt === 'option_a') {
      const totalHours = option_a_hours_per_half_day * 5;
      if (totalHours < 20) {
        alert('Option A requires at least 20 hours per week. With 5 half-days, please set at least 4 hours per half-day.');
        return;
      }
    }
    if (opt === 'option_b') {
      if (option_b_days.length !== 3) {
        alert('Please select exactly 3 days for Option B.');
        return;
      }
      if (!option_b_hours) {
        alert('Please select 7 or 8 hours per day for Option B.');
        return;
      }
    }
    setSubmitting(true);
    try {
      let preferred_days = null;
      let hours_per_week = null;
      if (opt === 'regular_shift') {
        preferred_days = 'Mon–Fri';
        hours_per_week = `${regular_shift_hours} hours/day`;
      } else if (opt === 'option_b') {
        preferred_days = option_b_days.sort().join(', ');
        hours_per_week = `${option_b_hours} hours/day`;
      } else if (opt === 'option_a') {
        preferred_days = '5 half-days';
        hours_per_week = `${option_a_hours_per_half_day} hours/half-day (min 20/week)`;
      }
      const { error } = await supabase.from('intern_schedule_responses').insert({
        intern_name: form.intern_name.trim(),
        email: form.email.trim(),
        preferred_option: form.preferred_option || null,
        preferred_days: preferred_days,
        hours_per_week: hours_per_week,
        start_date_preference: form.start_date_preference || null,
        notes: form.notes?.trim() || null,
      });
      if (error) throw error;
      setSubmitSuccess(true);
      setForm({ intern_name: '', email: '', preferred_option: '', start_date_preference: '', notes: '' });
      setRegularShiftHours('');
      setOptionBDays([]);
      setOptionBHours('');
      setOptionAHoursPerHalfDay(4);
    } catch (err) {
      console.error(err);
      alert(err?.message || 'Failed to submit. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const toggleOptionBDay = (day) => {
    setOptionBDays((prev) => {
      if (prev.includes(day)) return prev.filter((d) => d !== day);
      if (prev.length >= 3) return prev;
      return [...prev, day];
    });
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-10 w-10 border-2 border-[#6795BE] border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="border-b border-gray-200 bg-white">
        <div className="max-w-6xl mx-auto px-4 py-5">
          <h1 className="text-xl font-semibold text-gray-900" style={{ color: PRIMARY }}>
            Schedule Form
          </h1>
          <p className="mt-0.5 text-sm text-gray-600">
            Submit your preferred working schedule for your internship.
          </p>
        </div>
      </header>

      {/* Two-column layout */}
      <div className="max-w-6xl mx-auto px-4 py-6 md:py-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 lg:gap-8">
          {/* Left: Working Hours & Schedule */}
          <aside className="lg:order-1">
            <div className="sticky top-6 rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-100" style={{ backgroundColor: PRIMARY_LIGHT }}>
                <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wide" style={{ color: PRIMARY }}>
                  Working Hours & Schedule
                </h2>
              </div>
              <div className="p-5 space-y-5 text-sm">
                <section>
                  <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Office & requirement</h3>
                  <p className="text-gray-700"><span className="font-medium text-gray-900">Office Hours:</span> {config?.office_hours ?? '8:00 AM – 6:00 PM'}</p>
                  <p className="text-gray-700 mt-1"><span className="font-medium text-gray-900">Minimum:</span> {config?.min_requirement ?? '20 hours/week'}</p>
                </section>
                <section>
                  <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Schedule options</h3>
                  <p className="text-gray-700 whitespace-pre-wrap leading-relaxed">
                    {config?.schedule_options_text ?? 'Option A: 5 half-days\nOption B: 3 full days\nOr a suitable combination'}
                  </p>
                </section>
                <section>
                  <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Regular shifts (Mon–Fri)</h3>
                  <p className="text-gray-700 whitespace-pre-wrap leading-relaxed">
                    {config?.regular_shifts_text ?? '9:00 AM – 5:00 PM (7 hours/day) or 9:00 AM – 6:00 PM (8 hours/day)\nNote: Lunch break (1 hour) is not included in working hours.'}
                  </p>
                </section>
                <section>
                  <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Rules & reminders</h3>
                  <p className="text-gray-700 whitespace-pre-wrap leading-relaxed">
                    {config?.other_rules_text ?? 'Attending classes while clocked in is strictly not allowed.\nPlease clock out on time to maintain accurate attendance records.'}
                  </p>
                </section>
                <section>
                  <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Monitoring contacts</h3>
                  <ul className="space-y-1.5 text-gray-700">
                    {config?.contact_knowles_email && (
                      <li>Knowles Monitoring Team – <a href={`mailto:${config.contact_knowles_email}`} className="font-medium hover:underline" style={{ color: PRIMARY }}>{config.contact_knowles_email}</a></li>
                    )}
                    {config?.contact_umonics_email && (
                      <li>Umonics Monitoring Intern TL – <a href={`mailto:${config.contact_umonics_email}`} className="font-medium hover:underline" style={{ color: PRIMARY }}>{config.contact_umonics_email}</a></li>
                    )}
                    {config?.contact_pinnacle_email && (
                      <li>Pinnacle – <a href={`mailto:${config.contact_pinnacle_email}`} className="font-medium hover:underline" style={{ color: PRIMARY }}>{config.contact_pinnacle_email}</a></li>
                    )}
                    {!config?.contact_knowles_email && !config?.contact_umonics_email && !config?.contact_pinnacle_email && (
                      <>
                        <li>Knowles Monitoring Team – rowelakatelhynebarredo@gmail.com</li>
                        <li>Umonics Monitoring Intern TL – johnearl.balabat@gmail.com</li>
                        <li>Pinnacle – bermarvillarazojr@gmail.com</li>
                      </>
                    )}
                  </ul>
                </section>
              </div>
            </div>
          </aside>

          {/* Right: Form */}
          <main className="lg:order-2">
            {submitSuccess ? (
              <div className="rounded-xl border border-green-200 bg-green-50 p-6 text-center">
                <p className="font-medium text-green-800">Thank you. Your preferred schedule has been submitted.</p>
                <p className="mt-1 text-sm text-green-700">You may close this page.</p>
                <button
                  type="button"
                  onClick={() => setSubmitSuccess(false)}
                  className="mt-4 text-sm font-medium hover:underline"
                  style={{ color: PRIMARY }}
                >
                  Submit another response
                </button>
              </div>
            ) : (
              <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
                <div className="px-5 py-4 border-b border-gray-100" style={{ backgroundColor: PRIMARY_LIGHT }}>
                  <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wide" style={{ color: PRIMARY }}>
                    Submit your schedule
                  </h2>
                </div>
                <form onSubmit={handleSubmit} className="p-5 space-y-4">
                  <div>
                    <label className={labelClass}>Name *</label>
                    <input
                      type="text"
                      value={form.intern_name}
                      onChange={(e) => setForm((f) => ({ ...f, intern_name: e.target.value }))}
                      className={inputClass}
                      placeholder="e.g. Juan Dela Cruz"
                      required
                    />
                  </div>
                  <div>
                    <label className={labelClass}>Email *</label>
                    <input
                      type="email"
                      value={form.email}
                      onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                      className={inputClass}
                      placeholder="e.g. juan@email.com"
                      required
                    />
                  </div>
                  <div>
                    <label className={labelClass}>Preferred schedule option</label>
                    <select
                      value={form.preferred_option}
                      onChange={(e) => {
                        setForm((f) => ({ ...f, preferred_option: e.target.value }));
                        setRegularShiftHours('');
                        setOptionBDays([]);
                        setOptionBHours('');
                      }}
                      className={inputClass}
                    >
                      <option value="">Select...</option>
                      {PREFERRED_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                  </div>

                  {form.preferred_option === 'regular_shift' && (
                    <div>
                      <label className={labelClass}>Regular shift *</label>
                      <select
                        value={regular_shift_hours}
                        onChange={(e) => setRegularShiftHours(e.target.value)}
                        className={inputClass}
                        required
                      >
                        <option value="">Select shift...</option>
                        {REGULAR_SHIFT_OPTIONS.map((o) => (
                          <option key={o.value} value={o.value}>{o.label}</option>
                        ))}
                      </select>
                    </div>
                  )}

                  {form.preferred_option === 'option_b' && (
                    <>
                      <div>
                        <label className={labelClass}>Select 3 days (Mon–Fri) *</label>
                        <div className="flex flex-wrap gap-x-4 gap-y-2 pt-1">
                          {WEEKDAYS.map((d) => (
                            <label key={d.value} className="inline-flex items-center gap-2 cursor-pointer text-sm text-gray-700">
                              <input
                                type="checkbox"
                                checked={option_b_days.includes(d.value)}
                                onChange={() => toggleOptionBDay(d.value)}
                                className="rounded border-gray-300 text-[#6795BE] focus:ring-[#6795BE]"
                              />
                              {d.label}
                            </label>
                          ))}
                        </div>
                        <p className="text-xs text-gray-500 mt-1.5">{option_b_days.length}/3 days selected</p>
                      </div>
                      <div>
                        <label className={labelClass}>Hours per day *</label>
                        <select
                          value={option_b_hours}
                          onChange={(e) => setOptionBHours(e.target.value)}
                          className={inputClass}
                          required
                        >
                          <option value="">Select...</option>
                          {REGULAR_SHIFT_OPTIONS.map((o) => (
                            <option key={o.value} value={o.value}>{o.label}</option>
                          ))}
                        </select>
                      </div>
                    </>
                  )}

                  {form.preferred_option === 'option_a' && (
                    <div className="rounded-lg border border-gray-200 p-4 space-y-3" style={{ backgroundColor: PRIMARY_LIGHT }}>
                      <p className="text-sm text-gray-700 leading-relaxed">
                        Set your available time to ensure a minimum of 20 hours per week (e.g. 4 hours for 5 half-days).
                      </p>
                      <div>
                        <label className={labelClass}>Hours per half-day</label>
                        <input
                          type="number"
                          min={1}
                          max={8}
                          value={option_a_hours_per_half_day === 0 ? '' : option_a_hours_per_half_day}
                          onChange={(e) => {
                            const raw = e.target.value;
                            if (raw === '') {
                              setOptionAHoursPerHalfDay(0);
                              return;
                            }
                            const n = Number(raw);
                            if (!Number.isNaN(n)) setOptionAHoursPerHalfDay(Math.min(8, Math.max(1, n)));
                          }}
                          className={`${inputClass} max-w-[120px]`}
                        />
                        <p className="text-xs text-gray-500 mt-1.5">
                          {(option_a_hours_per_half_day || 0)} × 5 half-days = {(option_a_hours_per_half_day || 0) * 5} hours/week
                        </p>
                        {option_a_hours_per_half_day > 0 && (option_a_hours_per_half_day * 5) < 20 && (
                          <p className="text-sm text-red-600 mt-1.5" role="alert">
                            Does not meet the 20 hours/week minimum. Please enter at least 4 hours per half-day.
                          </p>
                        )}
                      </div>
                    </div>
                  )}

                  <div>
                    <label className={labelClass}>Preferred start date</label>
                    <input
                      type="date"
                      value={form.start_date_preference}
                      onChange={(e) => setForm((f) => ({ ...f, start_date_preference: e.target.value }))}
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className={labelClass}>Additional notes</label>
                    <textarea
                      value={form.notes}
                      onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                      className={`${inputClass} min-h-[88px] resize-y`}
                      placeholder="Any conflicts, preferences, or questions..."
                      rows={3}
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="w-full py-3 rounded-lg text-sm font-medium text-white disabled:opacity-60 transition-opacity"
                    style={{ backgroundColor: PRIMARY }}
                  >
                    {submitting ? 'Submitting...' : 'Submit'}
                  </button>
                </form>
              </div>
            )}
          </main>
        </div>
      </div>
    </div>
  );
}
