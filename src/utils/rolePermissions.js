// Role Permissions Utility for KTI Portal
// IT Department Structure: Supervisor (Mark Erick Cabral), TLA, Monitoring Team, PAT1
// Each position has TL (Team Lead) and VTL (Vice Team Lead)

export const ROLES = {
  ADMIN: 'admin',
  TLA: 'tla',
  MONITORING_TEAM: 'monitoring_team',
  PAT1: 'pat1',
  TL: 'tl', // Team Lead
  VTL: 'vtl', // Vice Team Lead
  INTERN: 'intern',
};

export const TEAMS = {
  TLA: 'tla',
  MONITORING: 'monitoring',
  PAT1: 'pat1',
};

// Role hierarchy for permission checking
const ROLE_HIERARCHY = {
  [ROLES.ADMIN]: 100,
  [ROLES.TLA]: 90,
  [ROLES.MONITORING_TEAM]: 80,
  [ROLES.PAT1]: 70,
  [ROLES.TL]: 60,
  [ROLES.VTL]: 50,
  [ROLES.INTERN]: 10,
};

// Check if user has minimum role level
export const hasMinimumRole = (userRole, requiredRole) => {
  const userLevel = ROLE_HIERARCHY[userRole] || 0;
  const requiredLevel = ROLE_HIERARCHY[requiredRole] || 0;
  return userLevel >= requiredLevel;
};

// Check if user is in specific role
export const isRole = (userRole, role) => {
  return userRole === role;
};

// Check if user is one of the roles
export const isAnyRole = (userRole, roles) => {
  return roles.includes(userRole);
};

// Check if user is TL or VTL
export const isTeamLead = (userRole) => {
  return userRole === ROLES.TL || userRole === ROLES.VTL;
};

// Permission checks for each module
export const permissions = {
  // User Management
  canCreateAccounts: (userRole) => {
    return isAnyRole(userRole, [ROLES.ADMIN, ROLES.TLA]);
  },

  canApproveAccounts: (userRole) => {
    return isAnyRole(userRole, [ROLES.ADMIN, ROLES.TLA]);
  },

  // Attendance & Onboarding
  canEditAttendance: (userRole) => {
    return isAnyRole(userRole, [ROLES.ADMIN, ROLES.MONITORING_TEAM]);
  },

  canVerifyOffboarding: (userRole) => {
    return isAnyRole(userRole, [ROLES.ADMIN, ROLES.MONITORING_TEAM]);
  },

  // WordPress Task Log (PAT1)
  canUpdateWordPressTasks: (userRole, userTeam) => {
    return isAnyRole(userRole, [ROLES.ADMIN, ROLES.TLA, ROLES.PAT1]) ||
           (isTeamLead(userRole) && userTeam === TEAMS.PAT1);
  },

  canMonitorWordPressProgress: (userRole) => {
    return isAnyRole(userRole, [ROLES.ADMIN, ROLES.TLA]);
  },

  // Credential Vault
  canManageCredentials: (userRole) => {
    return isAnyRole(userRole, [ROLES.ADMIN, ROLES.TLA]);
  },

  canViewCredentials: (userRole) => {
    return true; // All authenticated users can view
  },

  // SOP Repository
  canViewRepository: (userRole) => {
    return true; // All authenticated users can view
  },

  canUploadRepository: (userRole) => {
    return isAnyRole(userRole, [ROLES.ADMIN, ROLES.TLA, ROLES.TL, ROLES.VTL]);
  },

  canEditRepository: (userRole) => {
    return isAnyRole(userRole, [ROLES.ADMIN, ROLES.TLA, ROLES.TL, ROLES.VTL]);
  },

  // Issue Ticketing
  canReportIssues: (userRole) => {
    return true; // All authenticated users can report
  },

  canResolveIssues: (userRole, ticketTeam) => {
    // TL/VTL can resolve issues for their team
    if (isTeamLead(userRole)) {
      return true; // Will be filtered by team in the component
    }
    return isAnyRole(userRole, [ROLES.ADMIN, ROLES.TLA]);
  },

  canAssignTickets: (userRole) => {
    return isAnyRole(userRole, [ROLES.ADMIN, ROLES.TLA, ROLES.TL, ROLES.VTL]);
  },

  canDeleteTickets: (userRole) => {
    return isAnyRole(userRole, [ROLES.ADMIN, ROLES.TLA]);
  },

  // Task Assignment
  canClaimTasks: (userRole) => {
    return userRole === ROLES.INTERN || !userRole;
  },

  canCreateTasks: (userRole) => {
    return isAnyRole(userRole, [ROLES.ADMIN, ROLES.TLA, ROLES.TL, ROLES.VTL]);
  },

  canUpdateTaskStatus: (userRole, taskAssignedTo, userId) => {
    // Can update if assigned to them, or if they're admin/tla/tl/vtl
    if (taskAssignedTo === userId) return true;
    return isAnyRole(userRole, [ROLES.ADMIN, ROLES.TLA, ROLES.TL, ROLES.VTL]);
  },

  canDeleteTasks: (userRole) => {
    return isAnyRole(userRole, [ROLES.ADMIN, ROLES.TLA, ROLES.TL, ROLES.VTL]);
  },

  canManageDomains: (userRole) => {
    return isAnyRole(userRole, [ROLES.ADMIN, ROLES.TLA, ROLES.TL, ROLES.VTL]);
  },

  // Attendance: all authenticated users can time in/out & view their own hours
  canUseAttendance: (_userRole) => true,

  // Attendance: who can set *their own* official time frame
  // - TLA can set own time frame
  // - Monitoring TL/VTL can set own time frame
  canEditOwnAttendanceSchedule: (userRole, userTeam) => {
    if (userRole === ROLES.TLA) return true;
    return isTeamLead(userRole) && userTeam === TEAMS.MONITORING;
  },

  // Attendance: who can set time frame for other users (Monitoring TL/VTL only)
  canManageAttendanceSchedules: (userRole, userTeam) => {
    return isTeamLead(userRole) && userTeam === TEAMS.MONITORING;
  },

  // Daily Report: TL/VTL/TLA manage form questions and view who submitted
  canManageDailyReport: (userRole) => {
    return isAnyRole(userRole, [ROLES.ADMIN, ROLES.TLA, ROLES.TL, ROLES.VTL]);
  },

  // Daily Report: interns (and others) can submit their own
  canSubmitDailyReport: (_userRole) => true,
};

// Get role display name
export const getRoleDisplayName = (role) => {
  const roleNames = {
    [ROLES.ADMIN]: 'Admin',
    [ROLES.TLA]: 'Team Lead Assistant',
    [ROLES.MONITORING_TEAM]: 'Monitoring Team',
    [ROLES.PAT1]: 'PAT1',
    [ROLES.TL]: 'Team Lead',
    [ROLES.VTL]: 'Vice Team Lead',
    [ROLES.INTERN]: 'Intern',
    lead: 'Lead',
  };
  return roleNames[role] || (role ? String(role) : 'Intern');
};

// Get role description
export const getRoleDescription = (role) => {
  const descriptions = {
    [ROLES.ADMIN]: 'Full system access, can manage all modules and users',
    [ROLES.TLA]: 'Assistant to Supervisor, can create accounts, manage credentials, and monitor WordPress tasks',
    [ROLES.MONITORING_TEAM]: 'Manages attendance logs and verifies offboarding checklists',
    [ROLES.PAT1]: 'WordPress development team, can update WordPress tasks',
    [ROLES.TL]: 'Team Lead - can upload/edit SOPs and resolve issues for their team',
    [ROLES.VTL]: 'Vice Team Lead - can upload/edit SOPs and resolve issues for their team',
    [ROLES.INTERN]: 'Can claim tasks, view repository, and report issues',
  };
  return descriptions[role] || 'Standard intern access';
};

// Get all available roles for dropdowns
export const getAllRoles = () => {
  return Object.values(ROLES);
};

// Get role color for badges
export const getRoleColor = (role) => {
  const colors = {
    [ROLES.ADMIN]: 'bg-purple-100 text-purple-800',
    [ROLES.TLA]: 'bg-blue-100 text-blue-800',
    [ROLES.MONITORING_TEAM]: 'bg-green-100 text-green-800',
    [ROLES.PAT1]: 'bg-indigo-100 text-indigo-800',
    [ROLES.TL]: 'bg-yellow-100 text-yellow-800',
    [ROLES.VTL]: 'bg-orange-100 text-orange-800',
    [ROLES.INTERN]: 'bg-gray-100 text-gray-800',
    lead: 'bg-cyan-100 text-cyan-800',
  };
  return colors[role] || 'bg-gray-100 text-gray-800';
};
