import { useEffect, useMemo, useState } from 'react';
import { useSupabase } from '../context/supabase.jsx';
import { toast } from 'react-hot-toast';
import { queryCache } from '../utils/queryCache.js';

const PRIMARY = '#6795BE';

function getYear(d) {
  if (!d) return null;
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return null;
  return dt.getFullYear();
}

export default function OnboardingOffboarding() {
  const { supabase, user, userRole } = useSupabase();
  const [loading, setLoading] = useState(true);
  const [onboarding, setOnboarding] = useState([]);
  const [offboarding, setOffboarding] = useState([]);
  const [activeYear, setActiveYear] = useState(() => new Date().getFullYear());
  const [activeTab, setActiveTab] = useState('onboarding'); // 'onboarding' | 'offboarding'
  const [userTeam, setUserTeam] = useState(null);

  const [onboardingForm, setOnboardingForm] = useState({
    onboarding_date: '',
    onboarding_time: '',
    name: '',
    email: '',
    department: '',
    team: '',
    start_date: '',
  });

  const [offboardingForm, setOffboardingForm] = useState({
    department: '',
    last_name: '',
    first_name: '',
    actual_end_date: '',
    hours: '',
    email: '',
  });

  const canManage =
    userRole === 'admin' ||
    ((userRole === 'tl' || userRole === 'vtl') && userTeam === 'tla');

  useEffect(() => {
    fetchData();
  }, [supabase, user?.id]);

  const fetchData = async (bypassCache = false) => {
    setLoading(true);
    try {
      if (user?.id) {
        const { data: profile } = await supabase
          .from('users')
          .select('team')
          .eq('id', user.id)
          .single();
        setUserTeam(profile?.team ?? null);
      }

      if (!bypassCache) {
        const cachedOn = queryCache.get('onboarding:records');
        const cachedOff = queryCache.get('offboarding:records');
        if (cachedOn && cachedOff) {
          setOnboarding(cachedOn);
          setOffboarding(cachedOff);
          setLoading(false);
          return;
        }
      }

      const { data: onData, error: onErr } = await supabase
        .from('onboarding_records')
        .select('*')
        .order('onboarding_datetime', { ascending: false });
      if (onErr) {
        console.warn('Onboarding fetch error:', onErr);
        toast.error('Could not load onboarding records. Run onboarding_offboarding_migration.sql in Supabase.');
      }

      const { data: offData, error: offErr } = await supabase
        .from('offboarding_records')
        .select('*')
        .order('actual_end_date', { ascending: false });
      if (offErr) {
        console.warn('Offboarding fetch error:', offErr);
        toast.error('Could not load offboarding records. Run onboarding_offboarding_migration.sql in Supabase.');
      }

      const onList = Array.isArray(onData) ? onData : [];
      const offList = Array.isArray(offData) ? offData : [];
      setOnboarding(onList);
      setOffboarding(offList);
      queryCache.set('onboarding:records', onList);
      queryCache.set('offboarding:records', offList);
    } catch (e) {
      console.error('Onboarding/Offboarding fetch error:', e);
      toast.error('Failed to load onboarding/offboarding data.');
    } finally {
      setLoading(false);
    }
  };

  const allYears = useMemo(() => {
    const years = new Set();
    onboarding.forEach((r) => {
      const y = getYear(r.onboarding_datetime);
      if (y) years.add(y);
    });
    offboarding.forEach((r) => {
      const y = getYear(r.actual_end_date);
      if (y) years.add(y);
    });
    if (years.size === 0) years.add(new Date().getFullYear());
    return Array.from(years).sort((a, b) => b - a);
  }, [onboarding, offboarding]);

  useEffect(() => {
    if (!allYears.includes(activeYear) && allYears.length > 0) {
      setActiveYear(allYears[0]);
    }
  }, [allYears, activeYear]);

  const filteredOnboarding = onboarding.filter((r) => getYear(r.onboarding_datetime) === activeYear);
  const filteredOffboarding = offboarding.filter((r) => getYear(r.actual_end_date) === activeYear);

  const handleOnboardingSubmit = async (e) => {
    e.preventDefault();
    const { onboarding_date, onboarding_time, name, email, department, team, start_date } = onboardingForm;
    if (!onboarding_date || !name.trim()) {
      toast.error('Onboarding date and name are required.');
      return;
    }
    try {
      const datetime = onboarding_time
        ? new Date(`${onboarding_date}T${onboarding_time}`)
        : new Date(`${onboarding_date}T00:00:00`);

      const payload = {
        onboarding_datetime: datetime.toISOString(),
        name: name.trim(),
        email: email?.trim() || null,
        department: department?.trim() || null,
        team: team?.trim() || null,
        start_date: start_date || null,
      };

      const { error } = await supabase.from('onboarding_records').insert(payload);
      if (error) throw error;
      toast.success('Onboarding record added.');
      setOnboardingForm({
        onboarding_date: '',
        onboarding_time: '',
        name: '',
        email: '',
        department: '',
        team: '',
        start_date: '',
      });
      queryCache.invalidate('onboarding:records');
      await fetchData(true);
    } catch (err) {
      console.error('Onboarding insert error:', err);
      toast.error(err?.message || 'Failed to add onboarding record.');
    }
  };

  const handleOffboardingSubmit = async (e) => {
    e.preventDefault();
    const { department, last_name, first_name, actual_end_date, hours, email } = offboardingForm;
    if (!actual_end_date || !last_name.trim() || !first_name.trim()) {
      toast.error('Actual end date, last name, and first name are required.');
      return;
    }
    try {
      const payload = {
        department: department?.trim() || null,
        last_name: last_name.trim(),
        first_name: first_name.trim(),
        actual_end_date,
        hours: hours ? Number(hours) : null,
        email: email?.trim() || null,
      };
      const { error } = await supabase.from('offboarding_records').insert(payload);
      if (error) throw error;
      toast.success('Offboarding record added.');
      setOffboardingForm({
        department: '',
        last_name: '',
        first_name: '',
        actual_end_date: '',
        hours: '',
        email: '',
      });
      queryCache.invalidate('offboarding:records');
      await fetchData(true);
    } catch (err) {
      console.error('Offboarding insert error:', err);
      toast.error(err?.message || 'Failed to add offboarding record.');
    }
  };

  if (loading && onboarding.length === 0 && offboarding.length === 0) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-10 w-10 border-2 border-[#6795BE] border-t-transparent" aria-label="Loading" />
      </div>
    );
  }

  return (
    <div className="w-full space-y-4 sm:space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900" style={{ color: PRIMARY }}>Onboarding & Offboarding</h1>
        <p className="mt-1 text-sm text-gray-600">
          Track intern onboarding and offboarding records by year.
        </p>
      </div>

      {/* Year tabs */}
      <div className="flex flex-wrap gap-2 border-b border-gray-200 pb-2">
        {allYears.map((year) => (
          <button
            key={year}
            type="button"
            onClick={() => setActiveYear(year)}
            className={`px-4 py-1.5 rounded-full text-sm font-medium ${
              activeYear === year ? 'text-white' : 'text-gray-700 hover:bg-gray-100'
            }`}
            style={activeYear === year ? { backgroundColor: PRIMARY } : {}}
          >
            {year}
          </button>
        ))}
      </div>

      {/* Inner tabs: Onboarding / Offboarding */}
      <div className="flex flex-wrap gap-2 mt-3">
        {[
          { id: 'onboarding', label: 'Onboarding' },
          { id: 'offboarding', label: 'Offboarding' },
        ].map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${
              activeTab === tab.id
                ? 'bg-white text-gray-900 border-gray-300 shadow-sm'
                : 'bg-gray-100 text-gray-700 border-transparent hover:bg-gray-200'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Onboarding */}
      {activeTab === 'onboarding' && (
        <div className="space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <h2 className="text-base font-semibold text-gray-900">Onboarding ({activeYear})</h2>
          </div>

          {canManage && (
            <form onSubmit={handleOnboardingSubmit} className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Onboarding date</label>
              <input
                type="date"
                value={onboardingForm.onboarding_date}
                onChange={(e) => setOnboardingForm((f) => ({ ...f, onboarding_date: e.target.value }))}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Onboarding time (optional)</label>
              <input
                type="time"
                value={onboardingForm.onboarding_time}
                onChange={(e) => setOnboardingForm((f) => ({ ...f, onboarding_time: e.target.value }))}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Start date</label>
              <input
                type="date"
                value={onboardingForm.start_date}
                onChange={(e) => setOnboardingForm((f) => ({ ...f, start_date: e.target.value }))}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
              <input
                type="text"
                value={onboardingForm.name}
                onChange={(e) => setOnboardingForm((f) => ({ ...f, name: e.target.value }))}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <input
                type="email"
                value={onboardingForm.email}
                onChange={(e) => setOnboardingForm((f) => ({ ...f, email: e.target.value }))}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Department</label>
              <input
                type="text"
                value={onboardingForm.department}
                onChange={(e) => setOnboardingForm((f) => ({ ...f, department: e.target.value }))}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Team</label>
              <input
                type="text"
                value={onboardingForm.team}
                onChange={(e) => setOnboardingForm((f) => ({ ...f, team: e.target.value }))}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
            </div>
          </div>
              <div className="flex justify-end">
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg text-sm font-medium text-white"
                  style={{ backgroundColor: PRIMARY }}
                >
                  Add onboarding
                </button>
              </div>
            </form>
          )}

          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead>
                <tr className="bg-gray-50">
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">Onboarding date</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">Name</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">Email</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">Department</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">Team</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">Start date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {filteredOnboarding.map((r) => (
                  <tr key={r.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm text-gray-900">
                      {r.onboarding_datetime
                        ? new Date(r.onboarding_datetime).toLocaleString([], {
                            year: 'numeric',
                            month: 'short',
                            day: '2-digit',
                            hour: '2-digit',
                            minute: '2-digit',
                          })
                        : '—'}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-900">{r.name || '—'}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">{r.email || '—'}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">{r.department || '—'}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">{r.team || '—'}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      {r.start_date ? new Date(r.start_date).toLocaleDateString() : '—'}
                    </td>
                  </tr>
                ))}
                {filteredOnboarding.length === 0 && (
                  <tr>
                    <td className="px-4 py-4 text-sm text-gray-500 text-center" colSpan={6}>
                      No onboarding records for {activeYear}.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Offboarding */}
      {activeTab === 'offboarding' && (
        <div className="space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <h2 className="text-base font-semibold text-gray-900">Offboarding ({activeYear})</h2>
          </div>

          {canManage && (
            <form onSubmit={handleOffboardingSubmit} className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Actual end date</label>
              <input
                type="date"
                value={offboardingForm.actual_end_date}
                onChange={(e) => setOffboardingForm((f) => ({ ...f, actual_end_date: e.target.value }))}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Hours</label>
              <input
                type="number"
                min="0"
                step="0.5"
                value={offboardingForm.hours}
                onChange={(e) => setOffboardingForm((f) => ({ ...f, hours: e.target.value }))}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Department</label>
              <input
                type="text"
                value={offboardingForm.department}
                onChange={(e) => setOffboardingForm((f) => ({ ...f, department: e.target.value }))}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Last name</label>
              <input
                type="text"
                value={offboardingForm.last_name}
                onChange={(e) => setOffboardingForm((f) => ({ ...f, last_name: e.target.value }))}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">First name</label>
              <input
                type="text"
                value={offboardingForm.first_name}
                onChange={(e) => setOffboardingForm((f) => ({ ...f, first_name: e.target.value }))}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <input
                type="email"
                value={offboardingForm.email}
                onChange={(e) => setOffboardingForm((f) => ({ ...f, email: e.target.value }))}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
            </div>
          </div>
            <div className="flex justify-end">
              <button
                type="submit"
                className="px-4 py-2 rounded-lg text-sm font-medium text-white"
                style={{ backgroundColor: PRIMARY }}
              >
                Add offboarding
              </button>
            </div>
          </form>
          )}

          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead>
                <tr className="bg-gray-50">
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">Department</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">Last name</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">First name</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">Actual end date</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">Hours</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">Email</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {filteredOffboarding.map((r) => (
                  <tr key={r.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm text-gray-900">{r.department || '—'}</td>
                    <td className="px-4 py-3 text-sm text-gray-900">{r.last_name || '—'}</td>
                    <td className="px-4 py-3 text-sm text-gray-900">{r.first_name || '—'}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      {r.actual_end_date ? new Date(r.actual_end_date).toLocaleDateString() : '—'}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">{r.hours ?? '—'}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">{r.email || '—'}</td>
                  </tr>
                ))}
                {filteredOffboarding.length === 0 && (
                  <tr>
                    <td className="px-4 py-4 text-sm text-gray-500 text-center" colSpan={6}>
                      No offboarding records for {activeYear}.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

