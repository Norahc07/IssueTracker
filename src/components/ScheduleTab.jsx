import { useEffect, useState, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useSearchParams } from 'react-router-dom';
import { useSupabase } from '../context/supabase.jsx';
import { toast } from 'react-hot-toast';
import { queryCache } from '../utils/queryCache.js';

const PRIMARY = '#6795BE';
const INTERN_SCHEDULE_DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
const INTERN_SCHEDULE_HOURS = [9, 10, 11, 12, 13, 14, 15, 16, 17, 18];

const canAccessScheduleFormTab = (userRole, userTeam) => {
  const team = String(userTeam || '').toLowerCase();
  if (userRole === 'admin' || userRole === 'tla' || userRole === 'monitoring_team') return true;
  if ((userRole === 'tl' || userRole === 'vtl') && team === 'tla') return true;
  if (userRole === 'intern' && team === 'tla') return true;
  return false;
};

const formatHourLabel = (hour24) => {
  const h = ((hour24 + 11) % 12) + 1;
  const ampm = hour24 >= 12 ? 'PM' : 'AM';
  return `${String(h).padStart(2, '0')}:00 ${ampm}`;
};

const createEmptyInternScheduleGrid = () => {
  const grid = {};
  INTERN_SCHEDULE_DAYS.forEach((day) => {
    const hours = {};
    INTERN_SCHEDULE_HOURS.forEach((h) => {
      hours[String(h)] = 'unavailable';
    });
    grid[day] = hours;
  });
  return grid;
};

const getAggregateScheduleCounts = (schedules) => {
  const aggregate = {};
  INTERN_SCHEDULE_DAYS.forEach((day) => {
    aggregate[day] = {};
    INTERN_SCHEDULE_HOURS.forEach((h) => {
      aggregate[day][String(h)] = { available: 0, unavailable: 0 };
    });
  });
  (schedules || []).forEach((row) => {
    const grid = row.schedule && typeof row.schedule === 'object' ? row.schedule : createEmptyInternScheduleGrid();
    INTERN_SCHEDULE_DAYS.forEach((day) => {
      INTERN_SCHEDULE_HOURS.forEach((h) => {
        const v = grid?.[day]?.[String(h)] ?? 'unavailable';
        if (v === 'available') aggregate[day][String(h)].available += 1;
        else aggregate[day][String(h)].unavailable += 1;
      });
    });
  });
  return aggregate;
};

function Modal({ open, onClose, children, zIndexClassName = 'z-[9999]' }) {
  if (!open) return null;
  return createPortal(
    <div
      className={`fixed inset-0 ${zIndexClassName} bg-black/60 backdrop-blur-sm`}
      role="dialog"
      aria-modal="true"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose?.();
      }}
    >
      <div className="min-h-[100dvh] w-full p-4 flex items-center justify-center">
        {children}
      </div>
    </div>,
    document.body
  );
}

export default function ScheduleTab() {
  const { supabase, userRole, userTeam } = useSupabase();
  const [searchParams, setSearchParams] = useSearchParams();
  const scheduleSubTabParam = searchParams.get('schedule');
  const isTlaIntern = userRole === 'intern' && String(userTeam || '').toLowerCase() === 'tla';

  const [scheduleConfig, setScheduleConfig] = useState(null);
  const [scheduleResponses, setScheduleResponses] = useState([]);
  const [scheduleConfigForm, setScheduleConfigForm] = useState(null);
  const [savingScheduleConfig, setSavingScheduleConfig] = useState(false);
  const [scheduleOnboardingRecords, setScheduleOnboardingRecords] = useState([]);
  const [internSchedules, setInternSchedules] = useState([]);
  const [editingInternSchedule, setEditingInternSchedule] = useState(null);
  const [internScheduleDraft, setInternScheduleDraft] = useState(null);
  const [showInternScheduleModal, setShowInternScheduleModal] = useState(false);
  const [savingInternSchedule, setSavingInternSchedule] = useState(false);
  const [internScheduleDayTab, setInternScheduleDayTab] = useState('Monday');
  const [selectedInternOnboardingId, setSelectedInternOnboardingId] = useState('');

  const [scheduleSubTab, setScheduleSubTab] = useState(
    isTlaIntern
      ? 'interns'
      : scheduleSubTabParam === 'responses'
      ? 'responses'
      : scheduleSubTabParam === 'interns'
      ? 'interns'
      : 'form'
  );

  useEffect(() => {
    if (isTlaIntern) {
      setScheduleSubTab('interns');
      return;
    }
    if (scheduleSubTabParam === 'responses') setScheduleSubTab('responses');
    else if (scheduleSubTabParam === 'interns') setScheduleSubTab('interns');
    else setScheduleSubTab('form');
  }, [scheduleSubTabParam, isTlaIntern]);

  const fetchScheduleFormData = async () => {
    try {
      const [configRes, responsesRes, internsRes] = await Promise.all([
        supabase.from('schedule_form_config').select('*').eq('id', 'default').maybeSingle(),
        supabase.from('intern_schedule_responses').select('*').order('submitted_at', { ascending: false }),
        supabase.from('intern_schedules').select('*').order('name', { ascending: true }),
      ]);
      if (configRes.data) {
        const data = configRes.data;
        setScheduleConfig(data);
        setScheduleConfigForm({
          ...data,
          contact_knowles_email: data.contact_knowles_email ?? '',
          contact_umonics_email: data.contact_umonics_email ?? '',
          contact_pinnacle_email: data.contact_pinnacle_email ?? '',
        });
      }
      setScheduleResponses(Array.isArray(responsesRes.data) ? responsesRes.data : []);
      setInternSchedules(Array.isArray(internsRes.data) ? internsRes.data : []);
    } catch (err) {
      console.warn('Schedule form data fetch error:', err);
      toast.error('Could not load schedule form data.');
    }
  };

  const fetchScheduleOnboardingRecords = async () => {
    try {
      const cached = queryCache.get('onboarding:records');
      if (cached) {
        setScheduleOnboardingRecords(cached);
        return;
      }
      const { data, error } = await supabase
        .from('onboarding_records')
        .select('*')
        .order('onboarding_datetime', { ascending: false });
      if (error) throw error;
      const list = Array.isArray(data) ? data : [];
      setScheduleOnboardingRecords(list);
      queryCache.set('onboarding:records', list);
    } catch (err) {
      console.warn('Onboarding fetch error (schedule):', err);
    }
  };

  useEffect(() => {
    fetchScheduleFormData();
    fetchScheduleOnboardingRecords();
  }, [supabase]);

  const scheduleFormLink = `${import.meta.env.VITE_SCHEDULE_FORM_PUBLIC_URL || 'https://kti-portal.vercel.app'}/schedule-form`;

  const handleCopyScheduleFormLink = () => {
    if (!scheduleFormLink) return;
    navigator.clipboard.writeText(scheduleFormLink).then(() => toast.success('Form link copied to clipboard')).catch(() => toast.error('Could not copy'));
  };

  const updateScheduleSubTab = (tab) => {
    setScheduleSubTab(tab);
    setSearchParams((p) => {
      const next = new URLSearchParams(p);
      next.set('tab', 'schedule');
      next.set('schedule', tab);
      return next;
    });
  };

  const availableInternOnboardingOptions = useMemo(() => {
    if (!Array.isArray(scheduleOnboardingRecords)) return [];
    const existingNames = new Set(
      internSchedules.map((r) => (r.name || '').trim().toLowerCase()).filter(Boolean)
    );
    return scheduleOnboardingRecords
      .filter((r) => {
        const name = (r.name || '').trim();
        if (!name) return false;
        if (existingNames.has(name.toLowerCase())) return false;
        const dept = (r.department || '').toLowerCase();
        const team = (r.team || '').toLowerCase();
        if (!dept.includes('intern') && !team.includes('intern')) return false;
        return true;
      })
      .map((r) => ({ id: r.id, name: (r.name || '').trim(), email: r.email || '' }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [scheduleOnboardingRecords, internSchedules]);

  const handleSaveScheduleConfig = async (e) => {
    e.preventDefault();
    if (!scheduleConfigForm) return;
    setSavingScheduleConfig(true);
    try {
      const { error } = await supabase.from('schedule_form_config').update({
        office_hours: scheduleConfigForm.office_hours || '',
        min_requirement: scheduleConfigForm.min_requirement || '',
        schedule_options_text: scheduleConfigForm.schedule_options_text || '',
        regular_shifts_text: scheduleConfigForm.regular_shifts_text || '',
        other_rules_text: scheduleConfigForm.other_rules_text || '',
        contact_knowles_email: scheduleConfigForm.contact_knowles_email?.trim() || null,
        contact_umonics_email: scheduleConfigForm.contact_umonics_email?.trim() || null,
        contact_pinnacle_email: scheduleConfigForm.contact_pinnacle_email?.trim() || null,
        updated_at: new Date().toISOString(),
      }).eq('id', 'default');
      if (error) throw error;
      setScheduleConfig(scheduleConfigForm);
      toast.success('Schedule form content updated');
    } catch (err) {
      toast.error(err?.message || 'Failed to save');
    } finally {
      setSavingScheduleConfig(false);
    }
  };

  const scheduleConfigFormContactsRef = useRef({ knowles: '', umonics: '', pinnacle: '' });
  useEffect(() => {
    if (!scheduleConfigForm) return;
    const k = (scheduleConfigForm.contact_knowles_email ?? '').trim();
    const u = (scheduleConfigForm.contact_umonics_email ?? '').trim();
    const p = (scheduleConfigForm.contact_pinnacle_email ?? '').trim();
    const prev = scheduleConfigFormContactsRef.current;
    if (prev.knowles === k && prev.umonics === u && prev.pinnacle === p) return;
    if (scheduleConfig && (scheduleConfig.contact_knowles_email ?? '') === k && (scheduleConfig.contact_umonics_email ?? '') === u && (scheduleConfig.contact_pinnacle_email ?? '') === p) {
      scheduleConfigFormContactsRef.current = { knowles: k, umonics: u, pinnacle: p };
      return;
    }
    scheduleConfigFormContactsRef.current = { knowles: k, umonics: u, pinnacle: p };
    const t = setTimeout(async () => {
      try {
        const { error } = await supabase.from('schedule_form_config').update({
          contact_knowles_email: k || null,
          contact_umonics_email: u || null,
          contact_pinnacle_email: p || null,
          updated_at: new Date().toISOString(),
        }).eq('id', 'default');
        if (error) throw error;
        setScheduleConfig((c) => (c ? { ...c, contact_knowles_email: k || null, contact_umonics_email: u || null, contact_pinnacle_email: p || null } : c));
        toast.success('Monitoring contacts updated on form');
      } catch (err) {
        toast.error(err?.message || 'Failed to update contacts');
      }
    }, 600);
    return () => clearTimeout(t);
  }, [
    scheduleConfigForm?.contact_knowles_email,
    scheduleConfigForm?.contact_umonics_email,
    scheduleConfigForm?.contact_pinnacle_email,
  ]);

  if (!canAccessScheduleFormTab(userRole, userTeam)) {
    return (
      <div className="py-8 text-center text-sm text-gray-500 dark:text-gray-400">
        You do not have access to the Schedule tab.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-2 border-b border-gray-200 dark:border-gray-800">
        {!isTlaIntern && (
          <>
            <button
              type="button"
              onClick={() => updateScheduleSubTab('form')}
              className={`px-4 py-2 rounded-t-lg text-sm font-medium transition-colors ${
                scheduleSubTab === 'form'
                  ? 'bg-white dark:bg-gray-900 border border-b-0 border-gray-200 dark:border-gray-800 -mb-px text-gray-900 dark:text-gray-100'
                  : 'bg-gray-100 dark:bg-gray-950/40 text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-800'
              }`}
              style={scheduleSubTab === 'form' ? { borderTopColor: PRIMARY } : {}}
            >
              Schedule Form
            </button>
            <button
              type="button"
              onClick={() => updateScheduleSubTab('responses')}
              className={`px-4 py-2 rounded-t-lg text-sm font-medium transition-colors ${
                scheduleSubTab === 'responses'
                  ? 'bg-white dark:bg-gray-900 border border-b-0 border-gray-200 dark:border-gray-800 -mb-px text-gray-900 dark:text-gray-100'
                  : 'bg-gray-100 dark:bg-gray-950/40 text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-800'
              }`}
              style={scheduleSubTab === 'responses' ? { borderTopColor: PRIMARY } : {}}
            >
              Intern responses
            </button>
          </>
        )}
        <button
          type="button"
          onClick={() => updateScheduleSubTab('interns')}
          className={`px-4 py-2 rounded-t-lg text-sm font-medium transition-colors ${
            scheduleSubTab === 'interns'
              ? 'bg-white dark:bg-gray-900 border border-b-0 border-gray-200 dark:border-gray-800 -mb-px text-gray-900 dark:text-gray-100'
              : 'bg-gray-100 dark:bg-gray-950/40 text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-800'
          }`}
          style={scheduleSubTab === 'interns' ? { borderTopColor: PRIMARY } : {}}
        >
          Interns schedule
        </button>
      </div>

      {scheduleSubTab === 'form' && (
        <div className="space-y-6">
          <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 shadow-sm overflow-hidden">
            <div className="p-4 border-b border-gray-200 dark:border-gray-800 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100" style={{ color: PRIMARY }}>Schedule Form</h2>
                <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">Share the form link with interns to collect their preferred schedule. No login required.</p>
              </div>
              <div className="flex items-center gap-2">
                <input type="text" readOnly value={scheduleFormLink} className="rounded-lg border border-gray-300 dark:border-gray-700 px-3 py-2 text-sm w-72 max-w-full bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100" />
                <button type="button" onClick={handleCopyScheduleFormLink} className="px-4 py-2 rounded-lg text-sm font-medium text-white whitespace-nowrap disabled:opacity-60" style={{ backgroundColor: PRIMARY }}>Copy link</button>
              </div>
            </div>
          </div>
          {scheduleConfigForm && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:order-1">
                <form onSubmit={handleSaveScheduleConfig} className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 shadow-sm p-4 space-y-4 h-full flex flex-col">
                  <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100" style={{ color: PRIMARY }}>Editable form content</h3>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">Office hours</label>
                    <input type="text" value={scheduleConfigForm.office_hours || ''} onChange={(e) => setScheduleConfigForm((f) => ({ ...f, office_hours: e.target.value }))} className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 px-3 py-2 text-sm" placeholder="e.g. 8:00 AM – 6:00 PM" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">Minimum requirement</label>
                    <input type="text" value={scheduleConfigForm.min_requirement || ''} onChange={(e) => setScheduleConfigForm((f) => ({ ...f, min_requirement: e.target.value }))} className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 px-3 py-2 text-sm" placeholder="e.g. 20 hours/week" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">Schedule options (Option A/B text)</label>
                    <textarea value={scheduleConfigForm.schedule_options_text || ''} onChange={(e) => setScheduleConfigForm((f) => ({ ...f, schedule_options_text: e.target.value }))} className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 px-3 py-2 text-sm min-h-[80px]" rows={3} />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">Regular shifts text</label>
                    <textarea value={scheduleConfigForm.regular_shifts_text || ''} onChange={(e) => setScheduleConfigForm((f) => ({ ...f, regular_shifts_text: e.target.value }))} className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 px-3 py-2 text-sm min-h-[80px]" rows={3} />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">Other rules & reminders</label>
                    <textarea value={scheduleConfigForm.other_rules_text || ''} onChange={(e) => setScheduleConfigForm((f) => ({ ...f, other_rules_text: e.target.value }))} className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 px-3 py-2 text-sm min-h-[60px]" rows={2} />
                  </div>
                  <button type="submit" disabled={savingScheduleConfig} className="mt-auto px-4 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-60 w-fit" style={{ backgroundColor: PRIMARY }}>{savingScheduleConfig ? 'Saving...' : 'Save form content'}</button>
                </form>
              </div>
              <div className="lg:order-2">
                <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 shadow-sm p-4 h-full">
                  <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-3" style={{ color: PRIMARY }}>Monitoring Team contacts (shown on form)</h3>
                  <p className="text-sm text-gray-600 dark:text-gray-300 mb-3">Edit the email for each slot.</p>
                  <div className="space-y-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">Knowles Monitoring Team</label>
                      <input type="email" value={scheduleConfigForm.contact_knowles_email ?? ''} onChange={(e) => setScheduleConfigForm((f) => ({ ...f, contact_knowles_email: e.target.value }))} className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 px-3 py-2 text-sm focus:ring-2 focus:ring-[#6795BE] focus:border-[#6795BE]" placeholder="e.g. rowelakatelhynebarredo@gmail.com" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">Umonics Monitoring Intern TL</label>
                      <input type="email" value={scheduleConfigForm.contact_umonics_email ?? ''} onChange={(e) => setScheduleConfigForm((f) => ({ ...f, contact_umonics_email: e.target.value }))} className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 px-3 py-2 text-sm focus:ring-2 focus:ring-[#6795BE] focus:border-[#6795BE]" placeholder="e.g. johnearl.balabat@gmail.com" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">Pinnacle</label>
                      <input type="email" value={scheduleConfigForm.contact_pinnacle_email ?? ''} onChange={(e) => setScheduleConfigForm((f) => ({ ...f, contact_pinnacle_email: e.target.value }))} className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 px-3 py-2 text-sm focus:ring-2 focus:ring-[#6795BE] focus:border-[#6795BE]" placeholder="e.g. bermarvillarazojr@gmail.com" />
                    </div>
                  </div>
                  <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">Emails auto-update on the public schedule form a moment after you type.</p>
                </div>
              </div>
              <div className="lg:order-3">
                <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 shadow-sm p-4 h-full sticky top-6">
                  <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-3" style={{ color: PRIMARY }}>Preview (as shown on the form)</h3>
                  <div className="text-sm text-gray-700 dark:text-gray-200 space-y-3">
                    <p><strong>Office Hours:</strong> {scheduleConfigForm.office_hours || '—'}</p>
                    <p><strong>Minimum Requirement:</strong> {scheduleConfigForm.min_requirement || '—'}</p>
                    <p><strong>For those with schedule conflicts or overlapping classes:</strong><span className="whitespace-pre-wrap block mt-1">{scheduleConfigForm.schedule_options_text || '—'}</span></p>
                    <p><strong>Regular Shifts (Mon–Fri):</strong><span className="whitespace-pre-wrap block mt-1">{scheduleConfigForm.regular_shifts_text || '—'}</span></p>
                    <p><strong>Other Rules & Reminders:</strong><span className="whitespace-pre-wrap block mt-1">{scheduleConfigForm.other_rules_text || '—'}</span></p>
                    <p className="pt-2 border-t border-gray-100 dark:border-gray-800"><strong>Monitoring contacts:</strong><span className="block mt-1">
                      {scheduleConfigForm.contact_knowles_email && <span className="block">Knowles – {scheduleConfigForm.contact_knowles_email}</span>}
                      {scheduleConfigForm.contact_umonics_email && <span className="block">Umonics TL – {scheduleConfigForm.contact_umonics_email}</span>}
                      {scheduleConfigForm.contact_pinnacle_email && <span className="block">Pinnacle – {scheduleConfigForm.contact_pinnacle_email}</span>}
                      {!scheduleConfigForm.contact_knowles_email && !scheduleConfigForm.contact_umonics_email && !scheduleConfigForm.contact_pinnacle_email && '—'}
                    </span></p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {scheduleSubTab === 'responses' && (
        <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 shadow-sm overflow-hidden">
          <div className="px-4 sm:px-6 py-4 border-b border-gray-100 dark:border-gray-800 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100" style={{ color: PRIMARY }}>Intern schedule responses</h2>
              <p className="mt-1 text-xs sm:text-sm text-gray-600 dark:text-gray-300">View preferred schedule submissions from the public form.</p>
            </div>
            <div className="flex items-center gap-3 text-xs sm:text-sm text-gray-600 dark:text-gray-300">
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700">
                <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" />
                <span className="font-medium text-gray-900 dark:text-gray-100">{scheduleResponses.length || 0}</span>
                <span className="text-gray-500 dark:text-gray-400">{scheduleResponses.length === 1 ? 'response' : 'responses'}</span>
              </div>
            </div>
          </div>
          <div className="overflow-x-auto">
            {scheduleResponses.length === 0 ? (
              <div className="py-16 text-center text-sm text-gray-500 dark:text-gray-400">
                <p className="font-medium text-gray-700 dark:text-gray-200 mb-1">No responses yet</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">Share the schedule form link to start collecting preferred schedules.</p>
              </div>
            ) : (
              <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-800 text-sm">
                <thead className="bg-gray-50 dark:bg-gray-950/40">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Name</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Email</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Preferred option</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Preferred days</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Hours / week</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Start date</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Submitted</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Notes</th>
                  </tr>
                </thead>
                <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-100 dark:divide-gray-800">
                  {[...scheduleResponses]
                    .sort((a, b) => {
                      const da = a.submitted_at ? new Date(a.submitted_at).getTime() : 0;
                      const db = b.submitted_at ? new Date(b.submitted_at).getTime() : 0;
                      return db - da;
                    })
                    .map((row) => {
                      const preferredOptionLabel = row.preferred_option === 'option_a' ? 'Option A' : row.preferred_option === 'option_b' ? 'Option B' : row.preferred_option === 'combination' ? 'Combination' : row.preferred_option || '';
                      return (
                        <tr key={row.id} className="hover:bg-gray-50/80 dark:hover:bg-gray-800/60">
                          <td className="px-4 py-3 text-gray-900 dark:text-gray-100 font-medium">{row.intern_name || '—'}</td>
                          <td className="px-4 py-3 text-gray-600 dark:text-gray-300">
                            {row.email ? <a href={`mailto:${row.email}`} className="text-[#6795BE] dark:text-blue-400 hover:underline break-all">{row.email}</a> : '—'}
                          </td>
                          <td className="px-4 py-3 text-gray-600 dark:text-gray-300">
                            {preferredOptionLabel ? <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-200">{preferredOptionLabel}</span> : '—'}
                          </td>
                          <td className="px-4 py-3 text-gray-600 dark:text-gray-300 whitespace-pre-line">{row.preferred_days || '—'}</td>
                          <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{row.hours_per_week || '—'}</td>
                          <td className="px-4 py-3 text-gray-600 dark:text-gray-300 whitespace-nowrap">{row.start_date_preference ? new Date(row.start_date_preference).toLocaleDateString() : '—'}</td>
                          <td className="px-4 py-3 text-gray-600 dark:text-gray-300 whitespace-nowrap">{row.submitted_at ? new Date(row.submitted_at).toLocaleString() : '—'}</td>
                          <td className="px-4 py-3 text-gray-600 dark:text-gray-300 max-w-xs">{row.notes ? <span className="block truncate" title={row.notes}>{row.notes}</span> : <span className="text-gray-400 dark:text-gray-500">—</span>}</td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {scheduleSubTab === 'interns' && (
        <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 shadow-sm">
          <div className="p-4 border-b border-gray-200 dark:border-gray-800 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100" style={{ color: PRIMARY }}>Interns schedule</h2>
              <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">Only fill in your columns, always update when needed.</p>
            </div>
            <button
              type="button"
              onClick={() => {
                setInternScheduleDraft({ name: '', schedule: createEmptyInternScheduleGrid() });
                setEditingInternSchedule(null);
                setSelectedInternOnboardingId('');
                setShowInternScheduleModal(true);
              }}
              className="px-4 py-2 rounded-lg text-sm font-medium text-white"
              style={{ backgroundColor: PRIMARY }}
            >
              Add intern
            </button>
          </div>
          <div className="flex gap-1 px-4 pt-2 border-b border-gray-200 dark:border-gray-800">
            {INTERN_SCHEDULE_DAYS.map((day) => (
              <button
                key={day}
                type="button"
                onClick={() => setInternScheduleDayTab(day)}
                className={`px-3 py-2 text-sm font-medium rounded-t-lg transition-colors ${
                  internScheduleDayTab === day
                    ? 'bg-white dark:bg-gray-900 border border-b-0 border-gray-200 dark:border-gray-800 -mb-px text-gray-900 dark:text-gray-100'
                    : 'bg-gray-100 dark:bg-gray-950/40 text-gray-600 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-800'
                }`}
                style={internScheduleDayTab === day ? { borderTopColor: PRIMARY, borderTopWidth: 2 } : {}}
              >
                {day}
              </button>
            ))}
          </div>
          <div className="p-4 overflow-x-auto">
            {internSchedules.length === 0 ? (
              <div className="py-12 text-center text-sm text-gray-500 dark:text-gray-400">No intern schedules yet.</div>
            ) : (
              <>
                <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-800 border border-gray-200 dark:border-gray-800 rounded-lg overflow-hidden">
                  <thead className="bg-gray-50 dark:bg-gray-950/40">
                    <tr>
                      <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-36 sticky left-0 bg-gray-50 z-10">Name</th>
                      {INTERN_SCHEDULE_HOURS.map((hour) => (
                        <th key={hour} className="px-2 py-2.5 text-center text-xs font-medium text-gray-500 uppercase tracking-wider min-w-[4.5rem]">{formatHourLabel(hour)}</th>
                      ))}
                      <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-28 min-w-[7rem]">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-800">
                    {internSchedules.map((row) => {
                      const grid = row.schedule && typeof row.schedule === 'object' ? row.schedule : createEmptyInternScheduleGrid();
                      const daySchedule = grid[internScheduleDayTab] || {};
                      return (
                        <tr key={row.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/60">
                          <td className="px-3 py-2 text-sm text-gray-900 dark:text-gray-100 font-medium sticky left-0 bg-white dark:bg-gray-900 z-10">
                            {row.name}
                          </td>
                          {INTERN_SCHEDULE_HOURS.map((hour) => {
                            const v = daySchedule[String(hour)] ?? 'unavailable';
                            const label = v === 'available' ? 'Available' : v === 'lunch' ? 'Lunch' : 'Unavailable';
                            const bg =
                              v === 'available'
                                ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-200'
                                : v === 'lunch'
                                ? 'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-200'
                                : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-200';
                            return (
                              <td key={hour} className="px-2 py-1.5 text-xs text-center">
                                <span className={`inline-flex items-center justify-center px-2 py-0.5 rounded-full ${bg}`}>
                                  {label}
                                </span>
                              </td>
                            );
                          })}
                          <td className="px-3 py-2 text-sm text-gray-600 dark:text-gray-300 align-middle">
                            <div className="flex items-center gap-2 flex-nowrap">
                              <button
                                type="button"
                                onClick={() => {
                                  const schedule = row.schedule && typeof row.schedule === 'object' ? row.schedule : createEmptyInternScheduleGrid();
                                  setEditingInternSchedule(row);
                                  setInternScheduleDraft({ name: row.name, schedule });
                                  setSelectedInternOnboardingId('');
                                  setShowInternScheduleModal(true);
                                }}
                                className="px-2.5 py-1.5 rounded-lg text-xs font-medium text-gray-700 dark:text-gray-200 border border-gray-300 dark:border-gray-700 bg-transparent hover:bg-gray-100 dark:hover:bg-gray-800 shrink-0"
                              >
                                Edit
                              </button>
                              <button
                                type="button"
                                onClick={async () => {
                                  if (!confirm('Delete this intern schedule?')) return;
                                  try {
                                    await supabase.from('intern_schedules').delete().eq('id', row.id);
                                    setInternSchedules((prev) => prev.filter((r) => r.id !== row.id));
                                    toast.success('Intern schedule deleted');
                                  } catch (err) {
                                    toast.error(err?.message || 'Failed to delete');
                                  }
                                }}
                                className="px-2.5 py-1.5 rounded-lg text-xs font-medium text-red-600 dark:text-red-300 border border-red-200 dark:border-red-900/60 bg-white dark:bg-gray-900 hover:bg-red-50 dark:hover:bg-red-950/40 shrink-0"
                              >
                                Delete
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot className="bg-gray-50 dark:bg-gray-950/40 border-t-2 border-gray-200 dark:border-gray-800">
                    <tr>
                        <td className="px-3 py-2 text-xs font-semibold text-gray-700 dark:text-gray-200 sticky left-0 bg-gray-50 dark:bg-gray-950/40 z-10">
                          Availability
                        </td>
                      {INTERN_SCHEDULE_HOURS.map((hour) => {
                        const aggregate = getAggregateScheduleCounts(internSchedules);
                        const cell = aggregate[internScheduleDayTab]?.[String(hour)] || { available: 0, unavailable: 0 };
                        return (
                          <td key={hour} className="px-2 py-2 text-xs text-gray-700 dark:text-gray-200 text-center">
                            <span className="text-emerald-600 dark:text-emerald-300 font-medium">{cell.available} available</span>
                            <span className="text-gray-400 dark:text-gray-500 mx-1">/</span>
                            <span className="text-gray-500 dark:text-gray-300">{cell.unavailable} unavailable</span>
                          </td>
                        );
                      })}
                      <td className="px-3 py-2" />
                    </tr>
                  </tfoot>
                </table>
              </>
            )}
          </div>
        </div>
      )}

      {showInternScheduleModal && internScheduleDraft && (
        <Modal open={showInternScheduleModal} onClose={() => !savingInternSchedule && setShowInternScheduleModal(false)}>
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto border border-gray-100 dark:border-gray-800">
            <div className="p-6 space-y-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100" style={{ color: PRIMARY }}>{editingInternSchedule ? 'Edit intern schedule' : 'Add intern schedule'}</h2>
                  <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">Set availability for each hour (Available / Unavailable / Lunch).</p>
                </div>
                <button type="button" onClick={() => !savingInternSchedule && setShowInternScheduleModal(false)} className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200">✕</button>
              </div>
              <div className="space-y-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">Intern name</label>
                  {editingInternSchedule || availableInternOnboardingOptions.length === 0 ? (
                    <input type="text" value={internScheduleDraft.name} onChange={(e) => setInternScheduleDraft((draft) => ({ ...draft, name: e.target.value }))} placeholder={availableInternOnboardingOptions.length === 0 ? 'Enter your name' : 'Intern name'} className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 px-3 py-2 text-sm" />
                  ) : (
                    <select
                      value={selectedInternOnboardingId}
                      onChange={(e) => {
                        const id = e.target.value;
                        setSelectedInternOnboardingId(id);
                        const selected = availableInternOnboardingOptions.find((opt) => String(opt.id) === id);
                        setInternScheduleDraft((draft) => ({ ...draft, name: selected?.name || '' }));
                      }}
                      className="w-full rounded-lg border border-gray-300 dark:border-gray-700 px-3 py-2 text-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100"
                    >
                      <option value="">Select intern</option>
                      {availableInternOnboardingOptions.map((opt) => (
                        <option key={opt.id} value={opt.id}>{opt.name}{opt.email ? ` (${opt.email})` : ''}</option>
                      ))}
                    </select>
                  )}
                </div>
                <div className="overflow-x-auto border border-gray-200 dark:border-gray-800 rounded-lg">
                  <table className="min-w-full text-xs">
                    <thead className="bg-gray-50 dark:bg-gray-950/40">
                      <tr>
                        <th className="px-2 py-2 text-left font-medium text-gray-500 uppercase tracking-wider w-24">Time</th>
                        {INTERN_SCHEDULE_DAYS.map((day) => (
                          <th key={day} className="px-2 py-2 text-left font-medium text-gray-500 uppercase tracking-wider">{day}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-100 dark:divide-gray-800">
                      {INTERN_SCHEDULE_HOURS.map((hour) => {
                        const label = formatHourLabel(hour);
                        return (
                          <tr key={hour}>
                            <td className="px-2 py-1.5 text-gray-700 dark:text-gray-200 whitespace-nowrap font-medium">{label}</td>
                            {INTERN_SCHEDULE_DAYS.map((day) => (
                              <td key={day} className="px-2 py-1.5">
                                <select
                                  value={internScheduleDraft.schedule?.[day]?.[String(hour)] ?? 'unavailable'}
                                  onChange={(e) => {
                                    const value = e.target.value;
                                    setInternScheduleDraft((draft) => {
                                      const next = { ...draft };
                                      const schedule = { ...(next.schedule || {}) };
                                      const dayRow = { ...(schedule[day] || {}) };
                                      dayRow[String(hour)] = value;
                                      schedule[day] = dayRow;
                                      next.schedule = schedule;
                                      return next;
                                    });
                                  }}
                                  className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-1 py-1 text-xs text-gray-900 dark:text-gray-100 focus:ring-1 focus:ring-[#6795BE] focus:border-[#6795BE]"
                                >
                                  <option value="available">Available</option>
                                  <option value="unavailable">Unavailable</option>
                                  <option value="lunch">Lunch</option>
                                </select>
                              </td>
                            ))}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => !savingInternSchedule && setShowInternScheduleModal(false)} className="px-4 py-2 rounded-lg text-sm font-medium text-gray-700 dark:text-gray-200 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700">Close</button>
                <button
                  type="button"
                  disabled={savingInternSchedule || !internScheduleDraft.name.trim()}
                  onClick={async () => {
                    if (!internScheduleDraft || !internScheduleDraft.name.trim()) return;
                    setSavingInternSchedule(true);
                    try {
                      if (editingInternSchedule) {
                        const { error } = await supabase.from('intern_schedules').update({
                          name: internScheduleDraft.name.trim(),
                          schedule: internScheduleDraft.schedule || createEmptyInternScheduleGrid(),
                          updated_at: new Date().toISOString(),
                        }).eq('id', editingInternSchedule.id);
                        if (error) throw error;
                        setInternSchedules((prev) => prev.map((row) => (row.id === editingInternSchedule.id ? { ...row, name: internScheduleDraft.name.trim(), schedule: internScheduleDraft.schedule } : row)));
                        toast.success('Intern schedule updated');
                      } else {
                        const { data, error } = await supabase.from('intern_schedules').insert({
                          name: internScheduleDraft.name.trim(),
                          schedule: internScheduleDraft.schedule || createEmptyInternScheduleGrid(),
                          updated_at: new Date().toISOString(),
                        }).select('*').single();
                        if (error) throw error;
                        setInternSchedules((prev) => [...prev, data]);
                        toast.success('Intern schedule added');
                      }
                      setShowInternScheduleModal(false);
                    } catch (err) {
                      toast.error(err?.message || 'Failed to save intern schedule');
                    } finally {
                      setSavingInternSchedule(false);
                    }
                  }}
                  className="px-4 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-60"
                  style={{ backgroundColor: PRIMARY }}
                >
                  {savingInternSchedule ? 'Saving...' : 'Save schedule'}
                </button>
              </div>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
