import { useEffect, useState, useMemo } from 'react';
import { Navigate, useSearchParams } from 'react-router-dom';
import { useSupabase } from '../context/supabase.jsx';
import { toast } from 'react-hot-toast';
import { permissions } from '../utils/rolePermissions.js';
import ScheduleTab from '../components/ScheduleTab.jsx';
import Modal from '../components/Modal.jsx';
import { TEAMS } from '../utils/rolePermissions.js';

const PRIMARY = '#6795BE';
const TL_VTL_DEPARTMENTS = ['IT', 'HR', 'Marketing'];
const TL_VTL_TEAMS = ['Team Lead Assistant', 'Monitoring Team', 'PAT1', 'HR Intern', 'Marketing Intern'];
const TL_VTL_ROLES = ['Team Leader', 'Vice Team Leader', 'Representative'];
const formatMdy = (value) => {
  if (!value) return '—';
  const d = new Date(`${value}T00:00:00`);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
};

const canAccessTracker = (userRole, userTeam) => {
  const isTlaTeam = userTeam && String(userTeam).toLowerCase() === 'tla';
  return (
    userRole === 'admin' ||
    userRole === 'tla' ||
    userRole === 'intern' ||
    isTlaTeam ||
    ((userRole === 'tl' || userRole === 'vtl') && isTlaTeam)
  );
};

export default function TrackerPage() {
  const { supabase, userRole, userTeam } = useSupabase();
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get('tab'); // 'tl-vtl' | 'schedule' | 'intern-records'
  const trackerTab = tabParam === 'schedule' ? 'schedule' : (tabParam === 'intern-records' ? 'intern-records' : 'tl-vtl');

  const [users, setUsers] = useState([]);
  const [tlVtlTrackerRows, setTlVtlTrackerRows] = useState([]);
  const [savingTlVtlTracker, setSavingTlVtlTracker] = useState(false);
  const [isTlVtlTrackerEditMode, setIsTlVtlTrackerEditMode] = useState(false);

  // Intern records (TLA POV)
  const [recordsLoading, setRecordsLoading] = useState(false);
  const [internRecords, setInternRecords] = useState([]);
  const [recordModalOpen, setRecordModalOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState(null);
  const [recordForm, setRecordForm] = useState({
    last_name: '',
    first_name: '',
    hours_per_day: '',
    total_request: '',
    hours_rendered: '',
    start_date: '',
    target_end_1: '',
    target_end_2: '',
  });

  const tlVtlAssignableUsers = useMemo(
    () => users.filter((u) => u.role === 'intern' || u.role === 'tl' || u.role === 'vtl'),
    [users]
  );

  const isTlaTeam = String(userTeam || '').toLowerCase() === TEAMS.TLA;
  const canAccessTlaInternRecords =
    userRole === 'admin' ||
    userRole === 'tla' ||
    ((userRole === 'tl' || userRole === 'vtl') && isTlaTeam);

  const fetchUsers = async () => {
    try {
      const { data, error } = await supabase.from('users').select('id, full_name, email, role, team').order('full_name', { ascending: true });
      if (error) throw error;
      setUsers(Array.isArray(data) ? data : []);
    } catch (err) {
      console.warn('TrackerPage: users fetch error', err);
      setUsers([]);
    }
  };

  const fetchTlVtlTracker = async () => {
    try {
      const { data, error } = await supabase
        .from('tl_vtl_tracker')
        .select('*')
        .order('created_at', { ascending: true });
      if (error) throw error;
      setTlVtlTrackerRows(Array.isArray(data) ? data : []);
    } catch (err) {
      console.warn('tl_vtl_tracker fetch error:', err);
      setTlVtlTrackerRows([]);
    }
  };

  useEffect(() => {
    if (permissions.canCreateTasks(userRole)) fetchUsers();
  }, [supabase, userRole]);

  useEffect(() => {
    fetchTlVtlTracker();
  }, [supabase]);

  const fetchInternRecords = async () => {
    if (!supabase) return;
    setRecordsLoading(true);
    try {
      const { data, error } = await supabase
        .from('intern_records')
        .select('*')
        .eq('team', TEAMS.TLA)
        .order('last_name', { ascending: true });
      if (error) throw error;
      setInternRecords(Array.isArray(data) ? data : []);
    } catch (err) {
      console.warn('TrackerPage: intern_records fetch error', err);
      toast.error(err?.message || 'Failed to load intern records.');
      setInternRecords([]);
    } finally {
      setRecordsLoading(false);
    }
  };

  useEffect(() => {
    if (trackerTab !== 'intern-records') return;
    if (!canAccessTlaInternRecords) return;
    fetchInternRecords();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trackerTab, canAccessTlaInternRecords]);

  const resetRecordForm = () => {
    setRecordForm({
      last_name: '',
      first_name: '',
      hours_per_day: '',
      total_request: '',
      hours_rendered: '',
      start_date: '',
      target_end_1: '',
      target_end_2: '',
    });
  };

  const openAddRecord = () => {
    setEditingRecord(null);
    resetRecordForm();
    setRecordModalOpen(true);
  };

  const openEditRecord = (rec) => {
    setEditingRecord(rec);
    setRecordForm({
      last_name: rec?.last_name || '',
      first_name: rec?.first_name || '',
      hours_per_day: rec?.hours_per_day ?? '',
      total_request: rec?.total_request ?? '',
      hours_rendered: rec?.hours_rendered ?? '',
      start_date: rec?.start_date || '',
      target_end_1: rec?.target_end_1 || '',
      target_end_2: rec?.target_end_2 || '',
    });
    setRecordModalOpen(true);
  };

  const closeRecordModal = () => {
    setRecordModalOpen(false);
    setEditingRecord(null);
    resetRecordForm();
  };

  const computeRemainingHours = (rec) => {
    const totalReq = Number(rec?.total_request) || 0;
    const rendered = Number(rec?.hours_rendered) || 0;
    return Math.max(0, totalReq - rendered);
  };

  const saveRecord = async () => {
    if (!supabase) return;
    if (!canAccessTlaInternRecords) return;
    const lastName = String(recordForm.last_name || '').trim();
    const firstName = String(recordForm.first_name || '').trim();
    if (!lastName || !firstName) {
      toast.error('Last Name and First Name are required.');
      return;
    }

    const payload = {
      team: TEAMS.TLA,
      last_name: lastName,
      first_name: firstName,
      hours_per_day: recordForm.hours_per_day === '' ? null : Number(recordForm.hours_per_day),
      total_request: recordForm.total_request === '' ? null : Number(recordForm.total_request),
      hours_rendered: recordForm.hours_rendered === '' ? null : Number(recordForm.hours_rendered),
      start_date: recordForm.start_date || null,
      target_end_1: recordForm.target_end_1 || null,
      target_end_2: recordForm.target_end_2 || null,
      updated_at: new Date().toISOString(),
    };

    try {
      const q = supabase.from('intern_records');
      const { error } = editingRecord?.id
        ? await q.update(payload).eq('id', editingRecord.id)
        : await q.insert({ ...payload, created_at: new Date().toISOString() });
      if (error) throw error;
      toast.success(editingRecord?.id ? 'Record updated.' : 'Record added.');
      closeRecordModal();
      fetchInternRecords();
    } catch (err) {
      console.warn('TrackerPage: save intern record error', err);
      toast.error(err?.message || 'Failed to save record. Check policies for intern_records.');
    }
  };

  const deleteRecord = async (rec) => {
    if (!supabase || !rec?.id) return;
    if (!canAccessTlaInternRecords) return;
    const ok = window.confirm('Delete this intern record? This cannot be undone.');
    if (!ok) return;
    try {
      const { error } = await supabase.from('intern_records').delete().eq('id', rec.id);
      if (error) throw error;
      toast.success('Record removed.');
      fetchInternRecords();
    } catch (err) {
      console.warn('TrackerPage: delete intern record error', err);
      toast.error(err?.message || 'Failed to delete record. Check policies for intern_records.');
    }
  };

  const addTlVtlTrackerRow = async () => {
    setSavingTlVtlTracker(true);
    try {
      const { data, error } = await supabase
        .from('tl_vtl_tracker')
        .insert({
          department: 'IT',
          team: 'Team Lead Assistant',
          name: '',
          role: 'Team Leader',
          updated_at: new Date().toISOString(),
        })
        .select('*')
        .single();
      if (error) throw error;
      setTlVtlTrackerRows((prev) => [...prev, data]);
      toast.success('Row added');
    } catch (err) {
      toast.error(err?.message || 'Failed to add row');
    } finally {
      setSavingTlVtlTracker(false);
    }
  };

  const normalizeUserTeamFromTracker = (teamLabel) => {
    const t = (teamLabel || '').toLowerCase();
    if (t.includes('team lead assistant')) return 'tla';
    if (t.includes('monitoring')) return 'monitoring_team';
    if (t.includes('pat1')) return 'pat1';
    if (t.includes('hr')) return 'hr';
    if (t.includes('marketing')) return 'marketing';
    return null;
  };

  const mapTrackerRoleToUserRole = (roleLabel) => {
    if (!roleLabel) return null;
    const r = roleLabel.toLowerCase();
    if (r.includes('team leader')) return 'tl';
    if (r.includes('vice')) return 'vtl';
    return null;
  };

  const saveAllTlVtlTrackerRows = async () => {
    setSavingTlVtlTracker(true);
    try {
      for (const row of tlVtlTrackerRows) {
        const nowIso = new Date().toISOString();

        const { error } = await supabase
          .from('tl_vtl_tracker')
          .update({
            department: row.department || 'IT',
            team: row.team || 'Team Lead Assistant',
            name: (row.name || '').trim(),
            role: row.role || 'Team Leader',
            updated_at: nowIso,
          })
          .eq('id', row.id);
        if (error) throw error;

        const targetRole = mapTrackerRoleToUserRole(row.role);
        const trimmedName = (row.name || '').trim();
        if (targetRole && trimmedName) {
          try {
            const { data: userMatch, error: userErr } = await supabase
              .from('users')
              .select('id, full_name, team')
              .eq('full_name', trimmedName)
              .maybeSingle();

            if (!userErr && userMatch) {
              const mappedTeam = normalizeUserTeamFromTracker(row.team);
              const updatePayload = { role: targetRole, updated_at: nowIso };
              if (mappedTeam) updatePayload.team = mappedTeam;

              await supabase.from('users').update(updatePayload).eq('id', userMatch.id);
            }
          } catch (userUpdateErr) {
            console.warn('User role promotion error:', userUpdateErr);
          }
        }
      }
      toast.success('Changes saved and promotions applied');
      setIsTlVtlTrackerEditMode(false);
    } catch (err) {
      toast.error(err?.message || 'Failed to save');
    } finally {
      setSavingTlVtlTracker(false);
    }
  };

  const cancelTlVtlTrackerEdit = () => {
    fetchTlVtlTracker();
    setIsTlVtlTrackerEditMode(false);
  };

  const deleteTlVtlTrackerRow = async (id) => {
    setSavingTlVtlTracker(true);
    try {
      const { error } = await supabase.from('tl_vtl_tracker').delete().eq('id', id);
      if (error) throw error;
      setTlVtlTrackerRows((prev) => prev.filter((r) => r.id !== id));
      toast.success('Row removed');
    } catch (err) {
      toast.error(err?.message || 'Failed to delete');
    } finally {
      setSavingTlVtlTracker(false);
    }
  };

  if (!canAccessTracker(userRole, userTeam)) {
    const dashboard = userRole === 'admin' || userRole === 'tla' ? '/admin/dashboard' : '/intern/dashboard';
    return <Navigate to={dashboard} replace />;
  }

  return (
    <div className="w-full space-y-4 sm:space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100" style={{ color: PRIMARY }}>
            Tracker
          </h1>
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
            TL/VTL tracker and schedule form. Use the tabs below to switch between views.
          </p>
        </div>
      </div>

      <div className="flex gap-2 border-b border-gray-200 dark:border-gray-800">
        <button
          type="button"
          onClick={() => setSearchParams({ tab: 'tl-vtl' })}
          className={`px-4 py-2 rounded-t-lg text-sm font-medium transition-colors ${
            trackerTab === 'tl-vtl'
              ? 'bg-white dark:bg-gray-900 border border-b-0 border-gray-200 dark:border-gray-800 -mb-px text-gray-900 dark:text-gray-100'
              : 'bg-gray-100 dark:bg-gray-950/40 text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-800'
          }`}
          style={trackerTab === 'tl-vtl' ? { borderTopColor: PRIMARY } : {}}
        >
          TL/VTL
        </button>
        {(userRole === 'admin' || userRole === 'tla' || ((userRole === 'tl' || userRole === 'vtl') && isTlaTeam)) && (
          <button
            type="button"
            onClick={() => setSearchParams({ tab: 'intern-records' })}
            className={`px-4 py-2 rounded-t-lg text-sm font-medium transition-colors ${
              trackerTab === 'intern-records'
                ? 'bg-white dark:bg-gray-900 border border-b-0 border-gray-200 dark:border-gray-800 -mb-px text-gray-900 dark:text-gray-100'
                : 'bg-gray-100 dark:bg-gray-950/40 text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-800'
            }`}
            style={trackerTab === 'intern-records' ? { borderTopColor: PRIMARY } : {}}
          >
            Intern Records (TLA)
          </button>
        )}
        <button
          type="button"
          onClick={() => setSearchParams({ tab: 'schedule' })}
          className={`px-4 py-2 rounded-t-lg text-sm font-medium transition-colors ${
            trackerTab === 'schedule'
              ? 'bg-white dark:bg-gray-900 border border-b-0 border-gray-200 dark:border-gray-800 -mb-px text-gray-900 dark:text-gray-100'
              : 'bg-gray-100 dark:bg-gray-950/40 text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-800'
          }`}
          style={trackerTab === 'schedule' ? { borderTopColor: PRIMARY } : {}}
        >
          Schedule
        </button>
      </div>

      {trackerTab === 'schedule' ? (
        <ScheduleTab />
      ) : trackerTab === 'intern-records' ? (
        <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 overflow-hidden shadow-sm">
          <div className="px-5 py-4 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Intern Records (TLA POV)</h2>
              <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                This view reads/writes the same <span className="font-mono">intern_records</span> table as Monitoring. Updates are shared.
              </p>
            </div>
            {canAccessTlaInternRecords && (
              <button
                type="button"
                onClick={openAddRecord}
                className="px-4 py-2 rounded-lg text-sm font-medium text-white"
                style={{ backgroundColor: PRIMARY }}
              >
                + Add record
              </button>
            )}
          </div>

          {recordsLoading ? (
            <div className="py-12 text-center text-gray-500 dark:text-gray-400">Loading records...</div>
          ) : internRecords.length === 0 ? (
            <div className="py-12 text-center text-gray-500 dark:text-gray-400">No records yet.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-800">
                <thead className="bg-gray-50 dark:bg-gray-950/40">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 dark:text-gray-300 uppercase">Last Name</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 dark:text-gray-300 uppercase">First Name</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 dark:text-gray-300 uppercase">Hours/Day</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 dark:text-gray-300 uppercase">Total</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 dark:text-gray-300 uppercase">Rendered</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 dark:text-gray-300 uppercase">Remaining</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 dark:text-gray-300 uppercase">Start</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 dark:text-gray-300 uppercase">Target 1</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 dark:text-gray-300 uppercase">Target 2</th>
                    {canAccessTlaInternRecords && (
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-600 dark:text-gray-300 uppercase">Actions</th>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-800 bg-white dark:bg-gray-900">
                  {internRecords.map((rec) => (
                    <tr key={rec.id} className="hover:bg-gray-50/80 dark:hover:bg-gray-800/60">
                      <td className="px-4 py-3 text-sm text-gray-900 dark:text-gray-100">{rec.last_name}</td>
                      <td className="px-4 py-3 text-sm text-gray-900 dark:text-gray-100">{rec.first_name}</td>
                      <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-200">{rec.hours_per_day ?? '—'}</td>
                      <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-200">{rec.total_request ?? '—'}</td>
                      <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-200">{rec.hours_rendered ?? '—'}</td>
                      <td className="px-4 py-3 text-sm font-semibold text-gray-900 dark:text-gray-100">{computeRemainingHours(rec)}</td>
                      <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-200">{formatMdy(rec.start_date)}</td>
                      <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-200">{formatMdy(rec.target_end_1)}</td>
                      <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-200">{formatMdy(rec.target_end_2)}</td>
                      {canAccessTlaInternRecords && (
                        <td className="px-4 py-3 text-sm text-right whitespace-nowrap">
                          <button
                            type="button"
                            onClick={() => openEditRecord(rec)}
                            className="px-2 py-1 rounded-md text-xs font-medium border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => deleteRecord(rec)}
                            className="ml-2 px-2 py-1 rounded-md text-xs font-medium border border-red-200 dark:border-red-900/50 text-red-700 dark:text-red-200 hover:bg-red-50/60 dark:hover:bg-red-950/30"
                          >
                            Delete
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {recordModalOpen && (
            <Modal open={recordModalOpen} onClose={closeRecordModal} zIndexClassName="z-[2147483647]">
              <div className="w-full max-w-2xl bg-white dark:bg-gray-900 rounded-xl shadow-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
                <div className="px-5 py-4 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between">
                  <div>
                    <h3 className="font-semibold text-gray-900 dark:text-gray-100" style={{ color: PRIMARY }}>
                      {editingRecord ? 'Edit intern record' : 'Add intern record'}
                    </h3>
                    <p className="text-xs text-gray-500 dark:text-gray-400">Team: <span className="font-semibold">TLA</span></p>
                  </div>
                  <button
                    type="button"
                    onClick={closeRecordModal}
                    className="px-3 py-2 rounded-lg text-sm font-medium text-gray-700 dark:text-gray-200 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700"
                  >
                    Close
                  </button>
                </div>
                <div className="p-5">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {[
                      { key: 'last_name', label: 'Last Name', type: 'text', placeholder: 'Dela Cruz' },
                      { key: 'first_name', label: 'First Name', type: 'text', placeholder: 'Juan' },
                      { key: 'hours_per_day', label: 'Hours/Day', type: 'number', placeholder: '8' },
                      { key: 'total_request', label: 'Total Request', type: 'number', placeholder: '400' },
                      { key: 'hours_rendered', label: 'Hours Rendered', type: 'number', placeholder: '120' },
                      { key: 'start_date', label: 'Start Date', type: 'date', placeholder: '' },
                      { key: 'target_end_1', label: 'Target End 1', type: 'date', placeholder: '' },
                      { key: 'target_end_2', label: 'Target End 2', type: 'date', placeholder: '' },
                    ].map((f) => (
                      <div key={f.key} className="space-y-1">
                        <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300">{f.label}</label>
                        <input
                          type={f.type}
                          value={recordForm[f.key]}
                          onChange={(e) => setRecordForm((p) => ({ ...p, [f.key]: e.target.value }))}
                          placeholder={f.placeholder}
                          className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 px-3 py-2 text-sm focus:ring-2 focus:ring-[#6795BE] focus:border-transparent"
                        />
                      </div>
                    ))}
                  </div>
                  <div className="mt-5 flex items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={closeRecordModal}
                      className="px-4 py-2 rounded-lg text-sm font-medium border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={saveRecord}
                      className="px-4 py-2 rounded-lg text-sm font-medium text-white"
                      style={{ backgroundColor: PRIMARY }}
                    >
                      Save
                    </button>
                  </div>
                </div>
              </div>
            </Modal>
          )}
        </div>
      ) : (
        <>
      <div className="flex flex-wrap items-center justify-end gap-2 px-4 py-3">
        {!isTlVtlTrackerEditMode ? (
          <button
            type="button"
            onClick={() => setIsTlVtlTrackerEditMode(true)}
            className="px-4 py-2 rounded-lg text-sm font-medium text-white"
            style={{ backgroundColor: PRIMARY }}
          >
            Edit
          </button>
        ) : (
          <>
                <button
                  type="button"
                  onClick={addTlVtlTrackerRow}
                  disabled={savingTlVtlTracker}
                  className="px-4 py-2 rounded-lg text-sm font-medium text-gray-700 dark:text-gray-200 border border-gray-300 dark:border-gray-700 bg-transparent hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-60"
                >
                  {savingTlVtlTracker ? 'Adding...' : 'Add row'}
                </button>
            <button
              type="button"
              onClick={saveAllTlVtlTrackerRows}
              disabled={savingTlVtlTracker}
              className="px-4 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-60"
              style={{ backgroundColor: PRIMARY }}
            >
              {savingTlVtlTracker ? 'Saving...' : 'Save'}
            </button>
                <button
                  type="button"
                  onClick={cancelTlVtlTrackerEdit}
                  disabled={savingTlVtlTracker}
                  className="px-4 py-2 rounded-lg text-sm font-medium text-gray-700 dark:text-gray-200 border border-gray-300 dark:border-gray-700 bg-transparent hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-60"
                >
                  Cancel
                </button>
          </>
        )}
      </div>

      <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          {tlVtlTrackerRows.length === 0 ? (
            <div className="py-12 text-center text-sm text-gray-500 dark:text-gray-400">
              {isTlVtlTrackerEditMode ? 'No rows yet. Click "Add row" to add one.' : 'No rows yet. Click Edit then Add row to add one.'}
            </div>
          ) : (
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-800">
              <thead className="bg-gray-50 dark:bg-gray-950/40">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Department</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Team</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Name</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Role</th>
                  {isTlVtlTrackerEditMode && (
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider w-20">Actions</th>
                  )}
                </tr>
              </thead>
              <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-800">
                {tlVtlTrackerRows.map((row) => (
                  <tr key={row.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/60">
                    {isTlVtlTrackerEditMode ? (
                      <>
                        <td className="px-4 py-2">
                          <select
                            value={row.department || 'IT'}
                            onChange={(e) => setTlVtlTrackerRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, department: e.target.value } : r)))}
                            className="w-full rounded border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 px-2 py-1.5 text-sm focus:ring-2 focus:ring-[#6795BE] focus:border-[#6795BE]"
                          >
                            {TL_VTL_DEPARTMENTS.map((d) => (
                              <option key={d} value={d}>{d}</option>
                            ))}
                          </select>
                        </td>
                        <td className="px-4 py-2">
                          <select
                            value={row.team || 'Team Lead Assistant'}
                            onChange={(e) => setTlVtlTrackerRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, team: e.target.value } : r)))}
                            className="w-full min-w-[160px] rounded border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 px-2 py-1.5 text-sm focus:ring-2 focus:ring-[#6795BE] focus:border-[#6795BE]"
                          >
                            {TL_VTL_TEAMS.map((t) => (
                              <option key={t} value={t}>{t}</option>
                            ))}
                          </select>
                        </td>
                        <td className="px-4 py-2">
                          <select
                            value={row.name || ''}
                            onChange={(e) =>
                              setTlVtlTrackerRows((prev) =>
                                prev.map((r) => (r.id === row.id ? { ...r, name: e.target.value } : r))
                              )
                            }
                            className="w-full min-w-[160px] rounded border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 px-2 py-1.5 text-sm focus:ring-2 focus:ring-[#6795BE] focus:border-[#6795BE]"
                          >
                            <option value="">Select intern / TL / VTL</option>
                            {tlVtlAssignableUsers.map((u) => (
                              <option key={u.id} value={u.full_name || ''}>
                                {(u.full_name || '').trim() || u.email || 'Unnamed'}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="px-4 py-2">
                          <select
                            value={row.role || 'Team Leader'}
                            onChange={(e) => setTlVtlTrackerRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, role: e.target.value } : r)))}
                            className="w-full min-w-[140px] rounded border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 px-2 py-1.5 text-sm focus:ring-2 focus:ring-[#6795BE] focus:border-[#6795BE]"
                          >
                            {TL_VTL_ROLES.map((r) => (
                              <option key={r} value={r}>{r}</option>
                            ))}
                          </select>
                        </td>
                        <td className="px-4 py-2">
                          <button
                            type="button"
                            onClick={() => deleteTlVtlTrackerRow(row.id)}
                            disabled={savingTlVtlTracker}
                            className="p-1.5 rounded text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 disabled:opacity-50"
                            title="Delete row"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="px-4 py-3 text-sm text-gray-900 dark:text-gray-100">{row.department || 'IT'}</td>
                        <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-300">{row.team || 'Team Lead Assistant'}</td>
                        <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-300">{row.name || ''}</td>
                        <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-300">{row.role || 'Team Leader'}</td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
        </>
      )}
    </div>
  );
}
