import { Link } from 'react-router-dom';
import { useSupabase } from '../context/supabase.jsx';
import {
  ROLES,
  permissions,
  getRoleDisplayName,
  getRoleColor,
} from '../utils/rolePermissions.js';

const PRIMARY = '#6795BE';

// Flattened permission rows: { category, label, check(role) }
function getPermissionRows() {
  return [
    { category: 'User Management', label: 'Create / approve accounts', check: (r) => permissions.canCreateAccounts(r) },
    { category: 'Attendance & Onboarding', label: 'Edit attendance logs', check: (r) => permissions.canEditAttendance(r) },
    { category: 'Attendance & Onboarding', label: 'Verify offboarding checklists', check: (r) => permissions.canVerifyOffboarding(r) },
    { category: 'WordPress Task Log', label: 'Update WordPress tasks', check: (r) => permissions.canUpdateWordPressTasks(r) },
    { category: 'WordPress Task Log', label: 'Monitor progress (supervisor)', check: (r) => permissions.canMonitorWordPressProgress(r) },
    { category: 'Credential Vault', label: 'View credentials', check: (r) => permissions.canViewCredentials(r) },
    { category: 'Credential Vault', label: 'Manage credentials', check: (r) => permissions.canManageCredentials(r) },
    { category: 'SOP Repository', label: 'View repository', check: (r) => permissions.canViewRepository(r) },
    { category: 'SOP Repository', label: 'Upload / edit repository', check: (r) => permissions.canUploadRepository(r) },
    { category: 'Issue Ticketing', label: 'Report issues', check: (r) => permissions.canReportIssues(r) },
    { category: 'Issue Ticketing', label: 'Resolve issues', check: (r) => permissions.canResolveIssues(r) },
    { category: 'Issue Ticketing', label: 'Assign tickets', check: (r) => permissions.canAssignTickets(r) },
    { category: 'Issue Ticketing', label: 'Delete tickets', check: (r) => permissions.canDeleteTickets(r) },
    { category: 'Task Assignment', label: 'Claim tasks', check: (r) => permissions.canClaimTasks(r) },
    { category: 'Task Assignment', label: 'Create tasks', check: (r) => permissions.canCreateTasks(r) },
    { category: 'Task Assignment', label: 'Manage domains (Tasks)', check: (r) => permissions.canManageDomains(r) },
    { category: 'Domain Updates', label: 'Access Domain Updates page', check: (r) => permissions.canAccessDomainUpdates(r) },
    { category: 'Attendance', label: 'Clock in / out', check: (r) => permissions.canClockInOut(r) },
    { category: 'Attendance', label: 'View all attendance logs', check: (r) => permissions.canViewAllAttendanceLogs(r) },
    { category: 'Daily Report', label: 'Manage daily report (questions, view submissions)', check: (r) => permissions.canManageDailyReport(r) },
    { category: 'Daily Report', label: 'Submit daily report', check: (r) => permissions.canSubmitDailyReport(r) },
  ];
}

function Cell({ allowed }) {
  if (allowed) {
    return (
      <td className="px-3 py-2 text-center">
        <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-green-100 text-green-700 text-xs font-semibold" title="Allowed">
          ✓
        </span>
      </td>
    );
  }
  return <td className="px-3 py-2 text-center" title="Not allowed" />;
}

export default function RolePermissions() {
  const { userRole } = useSupabase();
  const permissionRows = getPermissionRows();
  const roleList = Object.values(ROLES);

  if (userRole !== 'admin' && userRole !== 'tla') {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center">
          <p className="text-gray-600">Access denied. Only Admin and TLA can view role permissions.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-4 sm:space-y-6 p-4 sm:p-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900" style={{ color: PRIMARY }}>
          Role Permissions
        </h1>
        <p className="mt-1 text-sm text-gray-600">
          Overview of permissions by role. Rows are capabilities; columns are roles.
        </p>
        <p className="mt-2 text-xs text-gray-500">
          ✓ = allowed for that role. Blank = not allowed. Some permissions (e.g. WordPress tasks, resolve issues) may also depend on team assignment.
        </p>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead>
            <tr className="bg-gray-50">
              <th className="px-3 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider w-1/4">
                Category
              </th>
              <th className="px-3 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                Permission
              </th>
              {roleList.map((role) => (
                <th
                  key={role}
                  className="px-3 py-3 text-center text-xs font-semibold text-gray-600 uppercase tracking-wider min-w-[4rem]"
                >
                  <span className={`inline-block px-2 py-0.5 rounded ${getRoleColor(role)}`}>
                    {getRoleDisplayName(role)}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 bg-white">
            {permissionRows.map((row, idx) => (
              <tr key={idx} className="hover:bg-gray-50/80">
                <td className="px-3 py-2 text-sm text-gray-600 whitespace-nowrap">
                  {row.category}
                </td>
                <td className="px-3 py-2 text-sm text-gray-900">
                  {row.label}
                </td>
                {roleList.map((role) => (
                  <Cell key={role} allowed={row.check(role)} />
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-sm text-gray-500">
        To view and edit users by role, go to{' '}
        <Link to="/user-management" className="font-medium underline" style={{ color: PRIMARY }}>
          User Management
        </Link>{' '}
        (Admin, Team Lead, Vice Team Lead).
      </p>
    </div>
  );
}
