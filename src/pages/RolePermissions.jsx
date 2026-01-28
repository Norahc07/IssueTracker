import { useEffect, useState } from 'react';
import { useSupabase } from '../context/supabase.jsx';
import { toast } from 'react-hot-toast';
import {
  ROLES,
  permissions,
  getRoleDisplayName,
  getRoleDescription,
  getRoleColor,
} from '../utils/rolePermissions.js';

export default function RolePermissions() {
  const { supabase, userRole } = useSupabase();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (userRole === 'admin' || userRole === 'tla') {
      fetchUsers();
    }
  }, [supabase, userRole]);

  const fetchUsers = async () => {
    try {
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .order('email', { ascending: true });

      if (error) {
        console.warn('Could not fetch users:', error);
        setUsers([]);
      } else {
        setUsers(data || []);
      }
    } catch (error) {
      console.error('Error fetching users:', error);
      setUsers([]);
    } finally {
      setLoading(false);
    }
  };

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

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-gray-600">Loading role permissions...</div>
      </div>
    );
  }

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
    <div className="w-full space-y-4 sm:space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Role Permissions</h1>
        <p className="mt-1 text-sm sm:text-base text-gray-600">
          Overview of permissions for each role in the KTI Portal
        </p>
      </div>

      {/* Role Permissions Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
        {Object.values(ROLES).map((role) => {
          const permSummary = getPermissionSummary(role);
          return (
            <div key={role} className="bg-white rounded-lg border border-gray-200 p-4 sm:p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg sm:text-xl font-bold text-gray-900">
                  {getRoleDisplayName(role)}
                </h2>
                <span className={`px-3 py-1 text-xs font-medium rounded-full ${getRoleColor(role)}`}>
                  {role}
                </span>
              </div>
              
              <p className="text-sm text-gray-600 mb-4">{getRoleDescription(role)}</p>

              <div className="space-y-3">
                {/* User Management */}
                <div>
                  <h3 className="text-sm font-semibold text-gray-700 mb-2">User Management</h3>
                  <div className="space-y-1 text-xs">
                    <div className="flex items-center gap-2">
                      {permSummary.userManagement.createAccounts ? (
                        <span className="text-green-600">✓</span>
                      ) : (
                        <span className="text-gray-400">✗</span>
                      )}
                      <span>Create/Approve Accounts</span>
                    </div>
                  </div>
                </div>

                {/* Attendance & Onboarding */}
                <div>
                  <h3 className="text-sm font-semibold text-gray-700 mb-2">Attendance & Onboarding</h3>
                  <div className="space-y-1 text-xs">
                    <div className="flex items-center gap-2">
                      {permSummary.attendance.editAttendance ? (
                        <span className="text-green-600">✓</span>
                      ) : (
                        <span className="text-gray-400">✗</span>
                      )}
                      <span>Edit Attendance Logs</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {permSummary.attendance.verifyOffboarding ? (
                        <span className="text-green-600">✓</span>
                      ) : (
                        <span className="text-gray-400">✗</span>
                      )}
                      <span>Verify Offboarding Checklists</span>
                    </div>
                  </div>
                </div>

                {/* WordPress Task Log */}
                <div>
                  <h3 className="text-sm font-semibold text-gray-700 mb-2">WordPress Task Log</h3>
                  <div className="space-y-1 text-xs">
                    <div className="flex items-center gap-2">
                      {permSummary.wordPressTasks.updateTasks ? (
                        <span className="text-green-600">✓</span>
                      ) : (
                        <span className="text-gray-400">✗</span>
                      )}
                      <span>Update WordPress Tasks</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {permSummary.wordPressTasks.monitorProgress ? (
                        <span className="text-green-600">✓</span>
                      ) : (
                        <span className="text-gray-400">✗</span>
                      )}
                      <span>Monitor Progress (for Supervisor)</span>
                    </div>
                  </div>
                </div>

                {/* Credential Vault */}
                <div>
                  <h3 className="text-sm font-semibold text-gray-700 mb-2">Credential Vault</h3>
                  <div className="space-y-1 text-xs">
                    <div className="flex items-center gap-2">
                      {permSummary.credentialVault.view ? (
                        <span className="text-green-600">✓</span>
                      ) : (
                        <span className="text-gray-400">✗</span>
                      )}
                      <span>View (All Teams)</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {permSummary.credentialVault.manage ? (
                        <span className="text-green-600">✓</span>
                      ) : (
                        <span className="text-gray-400">✗</span>
                      )}
                      <span>Manage (Highly Restricted)</span>
                    </div>
                  </div>
                </div>

                {/* SOP Repository */}
                <div>
                  <h3 className="text-sm font-semibold text-gray-700 mb-2">SOP Repository</h3>
                  <div className="space-y-1 text-xs">
                    <div className="flex items-center gap-2">
                      {permSummary.repository.view ? (
                        <span className="text-green-600">✓</span>
                      ) : (
                        <span className="text-gray-400">✗</span>
                      )}
                      <span>View (All Teams)</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {permSummary.repository.upload ? (
                        <span className="text-green-600">✓</span>
                      ) : (
                        <span className="text-gray-400">✗</span>
                      )}
                      <span>Upload/Edit (TL/VTL)</span>
                    </div>
                  </div>
                </div>

                {/* Issue Ticketing */}
                <div>
                  <h3 className="text-sm font-semibold text-gray-700 mb-2">Issue Ticketing</h3>
                  <div className="space-y-1 text-xs">
                    <div className="flex items-center gap-2">
                      {permSummary.issueTicketing.report ? (
                        <span className="text-green-600">✓</span>
                      ) : (
                        <span className="text-gray-400">✗</span>
                      )}
                      <span>Report Issues (All Teams)</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {permSummary.issueTicketing.resolve ? (
                        <span className="text-green-600">✓</span>
                      ) : (
                        <span className="text-gray-400">✗</span>
                      )}
                      <span>Resolve Issues (TL/VTL)</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {permSummary.issueTicketing.assign ? (
                        <span className="text-green-600">✓</span>
                      ) : (
                        <span className="text-gray-400">✗</span>
                      )}
                      <span>Assign Tickets</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {permSummary.issueTicketing.delete ? (
                        <span className="text-green-600">✓</span>
                      ) : (
                        <span className="text-gray-400">✗</span>
                      )}
                      <span>Delete Tickets</span>
                    </div>
                  </div>
                </div>

                {/* Task Assignment */}
                <div>
                  <h3 className="text-sm font-semibold text-gray-700 mb-2">Task Assignment</h3>
                  <div className="space-y-1 text-xs">
                    <div className="flex items-center gap-2">
                      {permSummary.tasks.claim ? (
                        <span className="text-green-600">✓</span>
                      ) : (
                        <span className="text-gray-400">✗</span>
                      )}
                      <span>Claim Tasks</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {permSummary.tasks.create ? (
                        <span className="text-green-600">✓</span>
                      ) : (
                        <span className="text-gray-400">✗</span>
                      )}
                      <span>Create Tasks</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Users by Role */}
      <div className="bg-white rounded-lg border border-gray-200 p-4 sm:p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Users by Role</h2>
        <div className="space-y-4">
          {Object.values(ROLES).map((role) => {
            const roleUsers = users.filter(u => u.role === role);
            return (
              <div key={role} className="border-b border-gray-200 pb-4 last:border-b-0 last:pb-0">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-semibold text-gray-700">
                    {getRoleDisplayName(role)}
                  </h3>
                  <span className="text-xs text-gray-500">{roleUsers.length} users</span>
                </div>
                {roleUsers.length > 0 ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 mt-2">
                    {roleUsers.map((user) => (
                      <div key={user.id} className="text-xs text-gray-600 bg-gray-50 p-2 rounded">
                        {user.email || user.full_name || 'N/A'}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-gray-400 mt-2">No users with this role</p>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
