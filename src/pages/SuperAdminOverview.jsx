import { useEffect, useState } from 'react';
import { useSupabase } from '../context/supabase.jsx';
import { ROLES, TEAMS, getRoleDisplayName } from '../utils/rolePermissions.js';

const PRIMARY = '#6795BE';

function teamDisplayLabel(teamValue) {
  if (!teamValue) return '—';
  if (teamValue === TEAMS.TLA) return 'Team Lead Assistant';
  if (teamValue === TEAMS.MONITORING) return 'Monitoring';
  if (teamValue === TEAMS.PAT1) return 'PAT1';
  if (teamValue === 'HR' || teamValue === 'Supervisor') return teamValue;
  return teamValue;
}

function getSegments(log) {
  if (!log) return [];
  const seg = log.segments;
  if (Array.isArray(seg) && seg.length > 0) return seg;
  if (log.time_in) return [{ time_in: log.time_in, time_out: log.time_out || null }];
  return [];
}

function getLogRenderedSeconds(log) {
  const seg = getSegments(log);
  if (!seg.length) return 0;
  let total = 0;
  seg.forEach((s) => {
    const start = s.time_in ? new Date(s.time_in) : null;
    const end = s.time_out ? new Date(s.time_out) : null;
    if (start && end && !Number.isNaN(start.getTime()) && !Number.isNaN(end.getTime())) {
      const diff = (end.getTime() - start.getTime()) / 1000;
      if (diff > 0) total += diff;
    }
  });
  return total;
}

export default function SuperAdminOverview() {
  const { supabase, userRole } = useSupabase();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  const isSuperAdmin = userRole === ROLES.SUPERADMIN;

  useEffect(() => {
    if (!supabase || !isSuperAdmin) {
      setRows([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const { data: userData, error: userErr } = await supabase
          .from('users')
          .select('id, email, full_name, role, team, imported_rendered_minutes, total_ojt_hours_required')
          .in('role', [ROLES.INTERN, ROLES.TL, ROLES.VTL]);
        if (userErr) {
          console.warn('SuperAdminOverview users error:', userErr);
          if (!cancelled) setRows([]);
          return;
        }
        const list = Array.isArray(userData) ? userData : [];
        const ids = list.map((u) => u.id).filter(Boolean);

        let logsByUser = {};
        if (ids.length) {
          const { data: logsData, error: logsErr } = await supabase
            .from('attendance_logs')
            .select('user_id, log_date, segments, time_in, time_out')
            .in('user_id', ids);
          if (logsErr) {
            console.warn('SuperAdminOverview logs error:', logsErr);
            logsByUser = {};
          } else {
            logsByUser = {};
            (Array.isArray(logsData) ? logsData : []).forEach((l) => {
              if (!logsByUser[l.user_id]) logsByUser[l.user_id] = [];
              logsByUser[l.user_id].push(l);
            });
          }
        }

        const computed = list.map((u) => {
          const logs = logsByUser[u.id] || [];
          const fromLogsSec = logs.reduce((acc, l) => acc + getLogRenderedSeconds(l), 0);
          const importedSec = (Number(u.imported_rendered_minutes) || 0) * 60;
          const totalSec = fromLogsSec + importedSec;
          const totalHours = totalSec / 3600;
          const requiredHours = Number(u.total_ojt_hours_required) || 0;
          const remaining = requiredHours > 0 ? Math.max(0, requiredHours - totalHours) : 0;
          return {
            id: u.id,
            name: (u.full_name || u.email || '').trim() || '—',
            email: u.email || '—',
            role: u.role || ROLES.INTERN,
            team: u.team || '',
            totalHours,
            remainingHours: remaining,
          };
        });

        if (!cancelled) {
          computed.sort((a, b) => a.name.localeCompare(b.name));
          setRows(computed);
        }
      } catch (e) {
        console.warn('SuperAdminOverview error:', e);
        if (!cancelled) setRows([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [supabase, isSuperAdmin]);

  if (!isSuperAdmin) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100" style={{ color: PRIMARY }}>
          Super Admin Overview
        </h1>
        <p className="text-sm text-gray-600 dark:text-gray-300">Access denied. Only Super Admin can view this page.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100" style={{ color: PRIMARY }}>
          Interns / TL / VTL OJT overview
        </h1>
        <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
          Summary of rendered OJT hours based on attendance logs and imported minutes.
        </p>
      </div>

      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 shadow-sm overflow-hidden">
        <div className="px-4 sm:px-6 py-3 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between">
          <span className="text-sm font-medium text-gray-900 dark:text-gray-100">OJT progress</span>
          {loading && <span className="text-xs text-gray-500 dark:text-gray-400">Loading…</span>}
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-800 text-sm">
            <thead className="bg-gray-50 dark:bg-gray-950/40">
              <tr>
                <th className="px-4 py-2 text-left font-semibold text-gray-700 dark:text-gray-300">Name</th>
                <th className="px-4 py-2 text-left font-semibold text-gray-700 dark:text-gray-300">Email</th>
                <th className="px-4 py-2 text-left font-semibold text-gray-700 dark:text-gray-300">Role</th>
                <th className="px-4 py-2 text-left font-semibold text-gray-700 dark:text-gray-300">Team</th>
                <th className="px-4 py-2 text-right font-semibold text-gray-700 dark:text-gray-300">Total rendered hours</th>
                <th className="px-4 py-2 text-right font-semibold text-gray-700 dark:text-gray-300">Remaining hours</th>
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-100 dark:divide-gray-800">
              {rows.length === 0 && !loading ? (
                <tr>
                  <td colSpan={6} className="px-4 py-4 text-center text-gray-500 dark:text-gray-400 text-sm">
                    No interns / TL / VTL found.
                  </td>
                </tr>
              ) : (
                rows.map((r) => (
                  <tr key={r.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/60">
                    <td className="px-4 py-2 text-gray-900 dark:text-gray-100">{r.name}</td>
                    <td className="px-4 py-2 text-gray-700 dark:text-gray-300">{r.email}</td>
                    <td className="px-4 py-2 text-gray-700 dark:text-gray-300">{getRoleDisplayName(r.role)}</td>
                    <td className="px-4 py-2 text-gray-700 dark:text-gray-300">
                      {r.team ? teamDisplayLabel(r.team) : '—'}
                    </td>
                    <td className="px-4 py-2 text-right text-gray-900 dark:text-gray-100">
                      {r.totalHours.toFixed(2)}
                    </td>
                    <td className="px-4 py-2 text-right text-gray-900 dark:text-gray-100">
                      {r.remainingHours.toFixed(2)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

