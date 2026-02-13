import { Link } from 'react-router-dom';
import { useSupabase } from '../context/supabase.jsx';
import {
  ROLES,
  permissions,
  getRoleDisplayName,
  getRoleDescription,
  getRoleColor,
} from '../utils/rolePermissions.js';

const PRIMARY = '#6795BE';

// Small visual chip for yes/no permissions
function PermissionChip({ allowed }) {
  if (allowed) {
    return (
      <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-green-100 text-green-700 text-[10px] font-semibold">
        ✓
      </span>
    );
  }
  return (
    <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-gray-100 text-gray-500 text-[10px] font-semibold">
      ✗
    </span>
  );
}

export default function RolePermissions() {
  const { userRole } = useSupabase();

  const getPermissionSummary = (role) => {
    return {
      userManagement: {
        createAccounts: permissions.canCreateAccounts(role),
        approveAccounts: permissions.canApproveAccounts(role),
      },
      attendance: {
        editAttendance: permissions.canEditAttendance(role),
        verifyOffboarding: permissions.canVerifyOffboarding(role),
      },
      wordPressTasks: {
        updateTasks: permissions.canUpdateWordPressTasks(role),
        monitorProgress: permissions.canMonitorWordPressProgress(role),
      },
      credentialVault: {
        manage: permissions.canManageCredentials(role),
        view: permissions.canViewCredentials(role),
      },
      repository: {
        view: permissions.canViewRepository(role),
        upload: permissions.canUploadRepository(role),
        edit: permissions.canEditRepository(role),
      },
      issueTicketing: {
        report: permissions.canReportIssues(role),
        resolve: permissions.canResolveIssues(role),
        assign: permissions.canAssignTickets(role),
        delete: permissions.canDeleteTickets(role),
      },
      tasks: {
        claim: permissions.canClaimTasks(role),
        create: permissions.canCreateTasks(role),
      },
    };
  };

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
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900" style={{ color: PRIMARY }}>Role Permissions</h1>
        <p className="mt-1 text-sm text-gray-600">
          Overview of permissions for each role in the KTI Portal
        </p>
        <p className="mt-2 text-xs text-gray-500">
          Green circles indicate **allowed** actions for that role; gray circles indicate actions that are **not allowed**.
        </p>
      </div>

      {/* Role Permissions Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
        {Object.values(ROLES).map((role) => {
          const permSummary = getPermissionSummary(role);
          return (
            <div
              key={role}
              className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 sm:p-6 hover:border-[#6795BE]/70 hover:shadow-md transition"
            >
              <div className="flex items-start justify-between gap-3 mb-3">
                <div className="min-w-0">
                  <h2 className="text-lg sm:text-xl font-semibold text-gray-900 truncate">
                    {getRoleDisplayName(role)}
                  </h2>
                  <p className="mt-1 text-xs text-gray-500">{getRoleDescription(role)}</p>
                </div>
                <span className={`px-3 py-1 text-xs font-medium rounded-full whitespace-nowrap ${getRoleColor(role)}`}>
                  {role}
                </span>
              </div>

              <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* User Management */}
                <div>
                  <h3 className="text-sm font-semibold text-gray-700 mb-2">User Management</h3>
                  <div className="space-y-1 text-xs">
                    <div className="flex items-center gap-2">
                      <PermissionChip allowed={permSummary.userManagement.createAccounts} />
                      <span>Create/Approve Accounts</span>
                    </div>
                  </div>
                </div>

                {/* Attendance & Onboarding */}
                <div>
                  <h3 className="text-sm font-semibold text-gray-700 mb-2">Attendance & Onboarding</h3>
                  <div className="space-y-1 text-xs">
                    <div className="flex items-center gap-2">
                      <PermissionChip allowed={permSummary.attendance.editAttendance} />
                      <span>Edit Attendance Logs</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <PermissionChip allowed={permSummary.attendance.verifyOffboarding} />
                      <span>Verify Offboarding Checklists</span>
                    </div>
                  </div>
                </div>

                {/* WordPress Task Log */}
                <div>
                  <h3 className="text-sm font-semibold text-gray-700 mb-2">WordPress Task Log</h3>
                  <div className="space-y-1 text-xs">
                    <div className="flex items-center gap-2">
                      <PermissionChip allowed={permSummary.wordPressTasks.updateTasks} />
                      <span>Update WordPress Tasks</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <PermissionChip allowed={permSummary.wordPressTasks.monitorProgress} />
                      <span>Monitor Progress (for Supervisor)</span>
                    </div>
                  </div>
                </div>

                {/* Credential Vault */}
                <div>
                  <h3 className="text-sm font-semibold text-gray-700 mb-2">Credential Vault</h3>
                  <div className="space-y-1 text-xs">
                    <div className="flex items-center gap-2">
                      <PermissionChip allowed={permSummary.credentialVault.view} />
                      <span>View (All Teams)</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <PermissionChip allowed={permSummary.credentialVault.manage} />
                      <span>Manage (Highly Restricted)</span>
                    </div>
                  </div>
                </div>

                {/* SOP Repository */}
                <div>
                  <h3 className="text-sm font-semibold text-gray-700 mb-2">SOP Repository</h3>
                  <div className="space-y-1 text-xs">
                    <div className="flex items-center gap-2">
                      <PermissionChip allowed={permSummary.repository.view} />
                      <span>View (All Teams)</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <PermissionChip allowed={permSummary.repository.upload} />
                      <span>Upload/Edit (TL/VTL)</span>
                    </div>
                  </div>
                </div>

                {/* Issue Ticketing */}
                <div>
                  <h3 className="text-sm font-semibold text-gray-700 mb-2">Issue Ticketing</h3>
                  <div className="space-y-1 text-xs">
                    <div className="flex items-center gap-2">
                      <PermissionChip allowed={permSummary.issueTicketing.report} />
                      <span>Report Issues (All Teams)</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <PermissionChip allowed={permSummary.issueTicketing.resolve} />
                      <span>Resolve Issues (TL/VTL)</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <PermissionChip allowed={permSummary.issueTicketing.assign} />
                      <span>Assign Tickets</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <PermissionChip allowed={permSummary.issueTicketing.delete} />
                      <span>Delete Tickets</span>
                    </div>
                  </div>
                </div>

                {/* Task Assignment */}
                <div>
                  <h3 className="text-sm font-semibold text-gray-700 mb-2">Task Assignment</h3>
                  <div className="space-y-1 text-xs">
                    <div className="flex items-center gap-2">
                      <PermissionChip allowed={permSummary.tasks.claim} />
                      <span>Claim Tasks</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <PermissionChip allowed={permSummary.tasks.create} />
                      <span>Create Tasks</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <p className="text-sm text-gray-500">
        To view and edit users by role, go to <Link to="/user-management" className="font-medium underline" style={{ color: PRIMARY }}>User Management</Link> (Admin, Team Lead, Vice Team Lead).
      </p>
    </div>
  );
}
