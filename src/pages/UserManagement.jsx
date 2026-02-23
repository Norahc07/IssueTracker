import { useEffect, useState } from 'react';
import { useSupabase } from '../context/supabase.jsx';
import { toast } from 'react-hot-toast';
import {
  ROLES,
  getRoleDisplayName,
  getRoleColor,
  TEAMS,
} from '../utils/rolePermissions.js';
import { queryCache } from '../utils/queryCache.js';

const PRIMARY = '#6795BE';
const ROLE_OPTIONS = [...new Set([...Object.values(ROLES), 'lead'])];
const TEAM_OPTIONS = [
  { value: '', label: '—' },
  { value: TEAMS.TLA, label: 'TLA' },
  { value: TEAMS.MONITORING, label: 'Monitoring' },
  { value: TEAMS.PAT1, label: 'PAT1' },
];

// Filter options based on team column
const FILTER_OPTIONS = [
  { value: '', label: 'All roles' },
  { value: TEAMS.TLA, label: 'Team Lead Assistant' },
  { value: TEAMS.MONITORING, label: 'Monitoring Team' },
  { value: TEAMS.PAT1, label: 'PAT1' },
];

function canAccessUserManagement(role) {
  return role === 'admin' || role === 'tla' || role === 'tl' || role === 'vtl';
}

export default function UserManagement() {
  const { supabase, userRole } = useSupabase();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState(null);
  const [editRole, setEditRole] = useState('');
  const [editTeam, setEditTeam] = useState('');
  const [filterTeam, setFilterTeam] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    if (canAccessUserManagement(userRole)) fetchUsers();
    else setLoading(false);
  }, [supabase, userRole]);

  // Normalize row from DB (handles id/email/role/full_name/team/created_at)
  const normalizeUser = (row) => {
    if (!row || typeof row !== 'object') return null;
    return {
      id: row.id,
      email: row.email ?? row.email_address ?? null,
      role: row.role ?? 'intern',
      full_name: row.full_name ?? row.fullname ?? row.name ?? null,
      team: row.team ?? null,
      created_at: row.created_at ?? null,
    };
  };

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

  const handleSaveRole = async (userId) => {
    if (!editingId || editingId !== userId) return;
    try {
      const payload = { role: editRole };
      // TL/VTL and interns can have a team (e.g. TLA interns need team = 'tla' for Domain Updates access)
      if (editRole === 'tl' || editRole === 'vtl' || editRole === 'intern') payload.team = editTeam || null;
      else payload.team = null;

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
    setEditRole(user.role || 'intern');
    setEditTeam(user.team || '');
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditRole('');
    setEditTeam('');
  };

  // Calculate statistics
  const stats = {
    tlaCount: users.filter((u) => u.team === TEAMS.TLA).length,
    pat1Count: users.filter((u) => u.team === TEAMS.PAT1).length,
    monitoringCount: users.filter((u) => u.team === TEAMS.MONITORING).length,
    totalUsers: users.length,
  };

  const filteredUsers = users.filter((u) => {
    // When a team filter is selected, show only users in that team.
    const matchTeam = !filterTeam || u.team === filterTeam;

    const matchSearch =
      !searchQuery.trim() ||
      [u.email, u.full_name, u.role].some(
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
          View and edit user roles. Only Admin and Team Lead / Vice Team Lead can access.
        </p>
      </div>

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
                    <td className="px-4 sm:px-6 py-3 text-sm text-gray-600">{user.full_name || '—'}</td>
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
                        (editRole === 'tl' || editRole === 'vtl' || editRole === 'intern') ? (
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
                        <span className="text-sm text-gray-600">{user.team || '—'}</span>
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
                        <button
                          onClick={() => startEdit(user)}
                          className="text-sm font-medium hover:underline"
                          style={{ color: PRIMARY }}
                        >
                          Edit
                        </button>
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

    </div>
  );
}
