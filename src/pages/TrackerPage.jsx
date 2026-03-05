import { useEffect, useState, useMemo } from 'react';
import { Navigate } from 'react-router-dom';
import { useSupabase } from '../context/supabase.jsx';
import { toast } from 'react-hot-toast';
import { permissions } from '../utils/rolePermissions.js';

const PRIMARY = '#6795BE';
const TL_VTL_DEPARTMENTS = ['IT', 'HR', 'Marketing'];
const TL_VTL_TEAMS = ['Team Lead Assistant', 'Monitoring Team', 'PAT1', 'HR Intern', 'Marketing Intern'];
const TL_VTL_ROLES = ['Team Leader', 'Vice Team Leader', 'Representative'];

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
  const [users, setUsers] = useState([]);
  const [tlVtlTrackerRows, setTlVtlTrackerRows] = useState([]);
  const [savingTlVtlTracker, setSavingTlVtlTracker] = useState(false);
  const [isTlVtlTrackerEditMode, setIsTlVtlTrackerEditMode] = useState(false);

  const tlVtlAssignableUsers = useMemo(
    () => users.filter((u) => u.role === 'intern' || u.role === 'tl' || u.role === 'vtl'),
    [users]
  );

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
          <h1 className="text-2xl font-bold text-gray-900" style={{ color: PRIMARY }}>
            TL/VTL Tracker
          </h1>
          <p className="mt-1 text-sm text-gray-600">
            Track Team Leaders, Vice Team Leaders, and Representatives by department and team. Click Edit to change data, then Save.
          </p>
        </div>
      </div>

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
                  className="px-4 py-2 rounded-lg text-sm font-medium text-gray-700 border border-gray-300 bg-transparent hover:bg-gray-100 disabled:opacity-60"
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
                  className="px-4 py-2 rounded-lg text-sm font-medium text-gray-700 border border-gray-300 bg-transparent hover:bg-gray-100 disabled:opacity-60"
                >
                  Cancel
                </button>
          </>
        )}
      </div>

      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          {tlVtlTrackerRows.length === 0 ? (
            <div className="py-12 text-center text-sm text-gray-500">
              {isTlVtlTrackerEditMode ? 'No rows yet. Click "Add row" to add one.' : 'No rows yet. Click Edit then Add row to add one.'}
            </div>
          ) : (
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Department</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Team</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Role</th>
                  {isTlVtlTrackerEditMode && (
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-20">Actions</th>
                  )}
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {tlVtlTrackerRows.map((row) => (
                  <tr key={row.id} className="hover:bg-gray-50">
                    {isTlVtlTrackerEditMode ? (
                      <>
                        <td className="px-4 py-2">
                          <select
                            value={row.department || 'IT'}
                            onChange={(e) => setTlVtlTrackerRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, department: e.target.value } : r)))}
                            className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm focus:ring-2 focus:ring-[#6795BE] focus:border-[#6795BE]"
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
                            className="w-full min-w-[160px] rounded border border-gray-300 px-2 py-1.5 text-sm focus:ring-2 focus:ring-[#6795BE] focus:border-[#6795BE]"
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
                            className="w-full min-w-[160px] rounded border border-gray-300 px-2 py-1.5 text-sm focus:ring-2 focus:ring-[#6795BE] focus:border-[#6795BE]"
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
                            className="w-full min-w-[140px] rounded border border-gray-300 px-2 py-1.5 text-sm focus:ring-2 focus:ring-[#6795BE] focus:border-[#6795BE]"
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
                            className="p-1.5 rounded text-red-600 hover:bg-red-50 disabled:opacity-50"
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
                        <td className="px-4 py-3 text-sm text-gray-900">{row.department || 'IT'}</td>
                        <td className="px-4 py-3 text-sm text-gray-600">{row.team || 'Team Lead Assistant'}</td>
                        <td className="px-4 py-3 text-sm text-gray-600">{row.name || ''}</td>
                        <td className="px-4 py-3 text-sm text-gray-600">{row.role || 'Team Leader'}</td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
