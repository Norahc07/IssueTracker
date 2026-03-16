import { useEffect, useState, useMemo } from 'react';
import { useSupabase } from '../context/supabase.jsx';
import { toast } from 'react-hot-toast';
import {
  ROLES,
  getRoleDisplayName,
  getRoleColor,
  TEAMS,
} from '../utils/rolePermissions.js';
import { queryCache } from '../utils/queryCache.js';
import { createAuthUserAndProfile, deleteUserAccount } from '../utils/userProvisioning.js';

// Map onboarding_records.team (e.g. 'TLA', 'Monitoring', 'PAT1') to users.team ('tla', 'monitoring', 'pat1')
function onboardingTeamToUserTeam(obTeam) {
  if (!obTeam) return '';
  const v = String(obTeam).trim().toLowerCase();
  if (v === 'tla' || v === 'team lead assistant' || v.includes('tla')) return TEAMS.TLA;
  if (v === 'monitoring' || v === 'monitoring team' || v === 'monitoring_team') return TEAMS.MONITORING;
  if (v === 'pat1' || v === 'pat 1') return TEAMS.PAT1;
  return '';
}

const PRIMARY = '#6795BE';
// Roles that can be assigned/edited from the UI.
// We intentionally exclude SUPERADMIN so it can only be set via SQL.
const ROLE_OPTIONS = [
  ROLES.ADMIN,
  ROLES.TLA,
  ROLES.MONITORING_TEAM,
  ROLES.PAT1,
  ROLES.INTERN,
  ROLES.TL,
  ROLES.VTL,
];
const TEAM_OPTIONS = [
  { value: '', label: '—' },
  { value: TEAMS.TLA, label: 'Team Lead Assistant' },
  { value: TEAMS.MONITORING, label: 'Monitoring' },
  { value: TEAMS.PAT1, label: 'PAT1' },
];

// Admin-only team options (organizational group for admins)
const ADMIN_TEAM_OPTIONS = [
  { value: 'HR', label: 'HR' },
  { value: 'Supervisor', label: 'Supervisor' },
];

// Filter options based on team column
const FILTER_OPTIONS = [
  { value: '', label: 'All teams' },
  { value: TEAMS.TLA, label: 'Team Lead Assistant' },
  { value: TEAMS.MONITORING, label: 'Monitoring' },
  { value: TEAMS.PAT1, label: 'PAT1' },
];

function canAccessUserManagement(role) {
  return role === 'superadmin' || role === 'admin' || role === 'tla' || role === 'tl' || role === 'vtl';
}

export default function UserManagement() {
  const { supabase, userRole } = useSupabase();
  const [users, setUsers] = useState([]);
  const [onboardingRecords, setOnboardingRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState(null);
  const [editRole, setEditRole] = useState('');
  const [editTeam, setEditTeam] = useState('');
  const [filterTeam, setFilterTeam] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [createEmail, setCreateEmail] = useState('');
  const [createName, setCreateName] = useState('');
  const [createRole, setCreateRole] = useState(ROLES.INTERN);
  const [createTeam, setCreateTeam] = useState('');
  const [creating, setCreating] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);

  useEffect(() => {
    if (canAccessUserManagement(userRole)) fetchUsers();
    else setLoading(false);
  }, [supabase, userRole]);

  // Fetch onboarding records for name/team fallback (source of truth for onboarded interns)
  useEffect(() => {
    if (!supabase || !canAccessUserManagement(userRole)) return;
    const cached = queryCache.get('onboarding:records');
    if (cached && Array.isArray(cached)) {
      setOnboardingRecords(cached);
      return;
    }
    supabase
      .from('onboarding_records')
      .select('id, name, email, team')
      .order('onboarding_datetime', { ascending: false })
      .then(({ data, error }) => {
        if (error) {
          console.warn('UserManagement: onboarding_records fetch error', error);
          return;
        }
        setOnboardingRecords(Array.isArray(data) ? data : []);
      });
  }, [supabase, userRole]);

  // Normalize row from DB (handles id/email/role/full_name/team/created_at)
  const normalizeUser = (row) => {
    if (!row || typeof row !== 'object') return null;
    let rawRole = row.role ?? ROLES.INTERN;
    // Never show 'superadmin' inside this table; treat as 'admin' for display/editing.
    if (rawRole === ROLES.SUPERADMIN) rawRole = ROLES.ADMIN;
    return {
      id: row.id,
      email: row.email ?? row.email_address ?? null,
      // Always keep the actual role from the database.
      // ROLE_OPTIONS only controls what can be chosen in the dropdown.
      role: rawRole,
      full_name: row.full_name ?? row.fullname ?? row.name ?? null,
      team: row.team ?? null,
      created_at: row.created_at ?? null,
    };
  };

  const onboardingByEmail = useMemo(() => {
    const map = new Map();
    (onboardingRecords || []).forEach((r) => {
      const email = (r.email || '').trim().toLowerCase();
      if (email && !map.has(email)) map.set(email, r);
    });
    return map;
  }, [onboardingRecords]);

  // Merge onboarding name/team into users for display (onboarding is source of truth when user fields are empty)
  const usersWithOnboarding = useMemo(() => {
    return users.map((u) => {
      const emailKey = (u.email || '').trim().toLowerCase();
      const ob = onboardingByEmail.get(emailKey);
      const displayName = (u.full_name || ob?.name || '').trim() || u.email || '—';
      const effectiveTeam = u.team || onboardingTeamToUserTeam(ob?.team) || '';
      return { ...u, displayName, effectiveTeam };
    });
  }, [users, onboardingByEmail]);

  const fetchUsers = async (bypassCache = false) => {
    const cached = queryCache.get('user_management:users');
    const useCache = !bypassCache && cached != null && Array.isArray(cached) && cached.length > 0;
    if (useCache) {
      setUsers(cached);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .order('email', { ascending: true });

      if (error) {
        console.warn('User management fetch error:', error);
        toast.error(
          'Could not load users. Run users_table_rls.sql in Supabase SQL Editor to create public.users and enable RLS for authenticated users.'
        );
        setUsers([]);
        setLoading(false);
        return;
      }

      const rawList = Array.isArray(data) ? data : [];
      const list = rawList.map(normalizeUser).filter(Boolean);
      queryCache.set('user_management:users', list);
      setUsers(list);
    } catch (err) {
      console.error('Error fetching users:', err);
      toast.error('Failed to load users. Check console and Supabase setup.');
      setUsers([]);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateUser = async (e) => {
    e.preventDefault();
    if (!supabase) {
      toast.error('Supabase client not ready');
      return;
    }
    const email = createEmail.trim().toLowerCase();
    const fullName = createName.trim();
    if (!email) {
      toast.error('Email is required');
      return;
    }
    if (!createRole) {
      toast.error('Role is required');
      return;
    }
    setCreating(true);
    try {
      const created = await createAuthUserAndProfile(supabase, {
        email,
        fullName: fullName || email,
        role: createRole,
        team: createTeam || null,
      });
      // Refresh cache and local list
      queryCache.invalidate('user_management:users');
      const normalized = normalizeUser(created);
      setUsers((prev) => {
        const list = normalized ? [...prev, normalized] : prev;
        return list.sort((a, b) => String(a.email || '').localeCompare(String(b.email || '')));
      });
      setCreateEmail('');
      setCreateName('');
      setCreateRole(ROLES.INTERN);
      setCreateTeam('');
      setShowCreateModal(false);
      toast.success('User created via SuperAdmin');
    } catch (err) {
      console.error('Create user error:', err);
      toast.error(err?.message || 'Failed to create user');
    } finally {
      setCreating(false);
    }
  };

  const handleDeleteUser = async (user) => {
    if (!supabase) {
      toast.error('Supabase client not ready');
      return;
    }
    if (!user?.id) return;
    const confirmMsg = `Delete user "${user.email || user.full_name || user.id}"?\nThis should also remove their Supabase auth account (handled by the backend function).`;
    // eslint-disable-next-line no-alert
    const ok = window.confirm(confirmMsg);
    if (!ok) return;
    try {
      await deleteUserAccount(supabase, { userId: user.id });
      queryCache.invalidate('user_management:users');
      setUsers((prev) => prev.filter((u) => u.id !== user.id));
      toast.success('User deleted');
    } catch (err) {
      console.error('Delete user error:', err);
      toast.error(err?.message || 'Failed to delete user');
    }
  };

  const handleSaveRole = async (userId) => {
    if (!editingId || editingId !== userId) return;
    try {
      const payload = { role: editRole };
      // TL/VTL, interns, and admins can have a team:
      // - TL/VTL/Intern: functional teams (TLA / Monitoring / PAT1)
      // - Admin: organizational group (HR / Supervisor / Founder)
      if (editRole === 'admin' || editRole === 'tl' || editRole === 'vtl' || editRole === 'intern') {
        payload.team = editTeam || null;
      } else {
        payload.team = null;
      }

      const { error } = await supabase
        .from('users')
        .update(payload)
        .eq('id', userId);

      if (error) throw error;

      queryCache.invalidate('user_management:users');
      queryCache.invalidate(`role:${userId}`);
      queryCache.invalidate(`profile:${userId}`);
      setUsers((prev) =>
        prev.map((u) =>
          u.id === userId ? { ...u, role: editRole, team: payload.team } : u
        )
      );
      setEditingId(null);
      setEditRole('');
      setEditTeam('');
      toast.success('Role updated');
    } catch (err) {
      console.error('Update role error:', err);
      toast.error(err.message || 'Failed to update role');
    }
  };

  const startEdit = (user) => {
    setEditingId(user.id);
    setEditRole(user.role || ROLES.INTERN);
    setEditTeam(user.effectiveTeam || user.team || '');
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditRole('');
    setEditTeam('');
  };

  // Team display label (for showing in table)
  const teamDisplayLabel = (teamValue) => {
    if (!teamValue) return '—';
    if (teamValue === TEAMS.TLA) return 'Team Lead Assistant';
    if (teamValue === TEAMS.MONITORING) return 'Monitoring';
    if (teamValue === TEAMS.PAT1) return 'PAT1';
    // Admin groupings: show HR / Supervisor as-is
    if (teamValue === 'HR' || teamValue === 'Supervisor') return teamValue;
    return teamValue;
  };

  // Calculate statistics using effective team (includes onboarding fallback)
  const stats = {
    tlaCount: usersWithOnboarding.filter((u) => u.effectiveTeam === TEAMS.TLA).length,
    pat1Count: usersWithOnboarding.filter((u) => u.effectiveTeam === TEAMS.PAT1).length,
    monitoringCount: usersWithOnboarding.filter((u) => u.effectiveTeam === TEAMS.MONITORING).length,
    totalUsers: usersWithOnboarding.length,
  };

  const filteredUsers = usersWithOnboarding.filter((u) => {
    const matchTeam = !filterTeam || u.effectiveTeam === filterTeam;
    const matchSearch =
      !searchQuery.trim() ||
      [u.email, u.displayName, u.full_name, u.role].some(
        (v) => v && String(v).toLowerCase().includes(searchQuery.toLowerCase())
      );
    return matchTeam && matchSearch;
  });

  if (!canAccessUserManagement(userRole)) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900" style={{ color: PRIMARY }}>
            User Management
          </h1>
          <p className="mt-1 text-sm text-gray-600">
            Access denied. Only Admin and Team Lead / Vice Team Lead can view this page.
          </p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-10 w-10 border-2 border-[#6795BE] border-t-transparent" aria-label="Loading" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900" style={{ color: PRIMARY }}>
          User Management
        </h1>
        <p className="mt-1 text-sm text-gray-600">
          View and edit user roles. Super Admin has full control; Admin and TL/VTL have limited access.
        </p>
      </div>

      {/* SuperAdmin-only: Create user (opens modal) */}
      {userRole === 'superadmin' && (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => setShowCreateModal(true)}
            className="inline-flex items-center rounded-lg px-4 py-2 text-sm font-medium text-white shadow-sm"
            style={{ backgroundColor: PRIMARY }}
          >
            + Create user
          </button>
        </div>
      )}

      {/* Statistics Cards */}
      <div>
        <h2 className="text-base font-semibold text-gray-900 mb-3">Team Statistics</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { label: 'TLA', value: stats.tlaCount },
            { label: 'PAT1', value: stats.pat1Count },
            { label: 'Monitoring Team', value: stats.monitoringCount },
            { label: 'Total Users', value: stats.totalUsers },
          ].map(({ label, value }) => (
            <div key={label} className="rounded-xl border-2 bg-white p-4 shadow-sm" style={{ borderColor: PRIMARY }}>
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">{label}</p>
              <p className="mt-1 text-2xl font-bold text-gray-900">{value}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Filters and Refresh */}
      <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
        <select
          value={filterTeam}
          onChange={(e) => setFilterTeam(e.target.value)}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#6795BE]"
        >
          {FILTER_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <input
          type="text"
          placeholder="Search by email or name..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="flex-1 min-w-0 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#6795BE]"
        />
        <button
          type="button"
          onClick={() => fetchUsers(true)}
          disabled={loading}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#6795BE] disabled:opacity-50"
        >
          {loading ? 'Loading…' : 'Refresh'}
        </button>
      </div>

      {/* Users table with edit */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-4 sm:px-6 py-4 border-b border-gray-200" />
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead>
              <tr>
                <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Email</th>
                <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
                <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Role</th>
                <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Team</th>
                <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredUsers.length > 0 ? (
                filteredUsers.map((user) => (
                  <tr key={user.id} className="hover:bg-gray-50">
                    <td className="px-4 sm:px-6 py-3 text-sm text-gray-900">{user.email || '—'}</td>
                    <td className="px-4 sm:px-6 py-3 text-sm text-gray-600">{user.displayName || '—'}</td>
                    <td className="px-4 sm:px-6 py-3">
                      {editingId === user.id ? (
                        <select
                          value={editRole}
                          onChange={(e) => setEditRole(e.target.value)}
                          className="rounded border border-gray-300 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-[#6795BE]"
                        >
                          {ROLE_OPTIONS.map((r) => (
                            <option key={r} value={r}>{getRoleDisplayName(r)}</option>
                          ))}
                        </select>
                      ) : (
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getRoleColor(user.role)}`}>
                          {getRoleDisplayName(user.role) || user.role || '—'}
                        </span>
                      )}
                    </td>
                    <td className="px-4 sm:px-6 py-3">
                      {editingId === user.id ? (
                        editRole === 'admin' ? (
                          <select
                            value={editTeam}
                            onChange={(e) => setEditTeam(e.target.value)}
                            className="rounded border border-gray-300 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-[#6795BE]"
                          >
                            <option value="">—</option>
                            {ADMIN_TEAM_OPTIONS.map((t) => (
                              <option key={t.value} value={t.value}>{t.label}</option>
                            ))}
                          </select>
                        ) : (editRole === 'tl' || editRole === 'vtl' || editRole === 'intern') ? (
                          <select
                            value={editTeam}
                            onChange={(e) => setEditTeam(e.target.value)}
                            className="rounded border border-gray-300 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-[#6795BE]"
                          >
                            {TEAM_OPTIONS.map((t) => (
                              <option key={t.value || 'none'} value={t.value}>{t.label}</option>
                            ))}
                          </select>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )
                      ) : (
                        <span className="text-sm text-gray-600">{teamDisplayLabel(user.effectiveTeam || user.team) || '—'}</span>
                      )}
                    </td>
                    <td className="px-4 sm:px-6 py-3">
                      {editingId === user.id ? (
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleSaveRole(user.id)}
                            className="text-sm font-medium text-white px-2 py-1 rounded"
                            style={{ backgroundColor: PRIMARY }}
                          >
                            Save
                          </button>
                          <button
                            onClick={cancelEdit}
                            className="text-sm font-medium text-gray-600 hover:text-gray-900"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <div className="flex gap-2">
                          <button
                            onClick={() => startEdit(user)}
                            className="text-sm font-medium hover:underline"
                            style={{ color: PRIMARY }}
                          >
                            Edit
                          </button>
                          {userRole === 'superadmin' && (
                            <button
                              type="button"
                              onClick={() => handleDeleteUser(user)}
                              className="text-sm font-medium text-red-600 hover:text-red-800"
                            >
                              Delete
                            </button>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={5} className="px-4 sm:px-6 py-8 text-center text-gray-500 text-sm">
                    {users.length === 0
                      ? 'No users found. Ensure the public.users table exists and RLS allows your role (admin, tla, tl, vtl) to SELECT.'
                      : 'No users match the filter.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create user modal (SuperAdmin only) */}
      {userRole === 'superadmin' && showCreateModal && (
        <div className="fixed inset-0 z-[10000] bg-black/20 backdrop-blur-sm flex items-center justify-center px-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-gray-200 w-full max-w-lg my-6">
            <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between gap-2">
              <div>
                <h2 className="text-base font-semibold text-gray-900">Create user</h2>
                <p className="text-xs text-gray-500">
                  This will create a Supabase auth account and a <code>public.users</code> record.
                </p>
              </div>
              <button
                type="button"
                onClick={() => !creating && setShowCreateModal(false)}
                className="text-gray-400 hover:text-gray-700 text-lg leading-none"
                aria-label="Close"
              >
                ×
              </button>
            </div>
            <form onSubmit={handleCreateUser} className="px-5 py-4 space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Email</label>
                <input
                  type="email"
                  required
                  value={createEmail}
                  onChange={(e) => setCreateEmail(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#6795BE]"
                  placeholder="user@example.com"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Full name (optional)</label>
                <input
                  type="text"
                  value={createName}
                  onChange={(e) => setCreateName(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#6795BE]"
                  placeholder="Full name"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Role</label>
                  <select
                    value={createRole}
                    onChange={(e) => setCreateRole(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#6795BE]"
                  >
                    <option value={ROLES.INTERN}>{getRoleDisplayName(ROLES.INTERN)}</option>
                    <option value={ROLES.TL}>{getRoleDisplayName(ROLES.TL)}</option>
                    <option value={ROLES.VTL}>{getRoleDisplayName(ROLES.VTL)}</option>
                    <option value={ROLES.ADMIN}>{getRoleDisplayName(ROLES.ADMIN)}</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Team (for TL/VTL/Intern/Admin)</label>
                  <select
                    value={createTeam}
                    onChange={(e) => setCreateTeam(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#6795BE]"
                  >
                    <option value="">—</option>
                    {TEAM_OPTIONS.map((t) => (
                      <option key={t.value || 'none'} value={t.value}>{t.label}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => !creating && setShowCreateModal(false)}
                  className="rounded-lg px-4 py-2 text-sm font-medium text-gray-700 border border-gray-300 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  className="inline-flex items-center rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
                  style={{ backgroundColor: PRIMARY }}
                >
                  {creating ? 'Creating…' : 'Create user'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
