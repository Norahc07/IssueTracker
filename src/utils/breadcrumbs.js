/**
 * Build breadcrumb trail for main app shell.
 * Starts from the current section (e.g. Tracker, Attendance), not from Dashboard.
 * Each item: { label: string, to: string | null } — null `to` = current page.
 */

function isRoleDashboard(pathname, userRole) {
  if (userRole === 'superadmin') {
    return pathname === '/superadmin/overview' || pathname === '/user-management';
  }
  return (
    pathname === '/admin/dashboard' ||
    pathname === '/lead/dashboard' ||
    pathname === '/intern/dashboard'
  );
}

function dashboardPageLabel(userRole) {
  if (userRole === 'admin' || userRole === 'tla') return 'Admin Dashboard';
  if (
    userRole === 'lead' ||
    userRole === 'tl' ||
    userRole === 'vtl' ||
    userRole === 'monitoring_team' ||
    userRole === 'pat1'
  ) {
    return 'Lead Dashboard';
  }
  return 'Dashboard';
}

const TASK_TAB_LABELS = {
  domains: 'Domains',
  'domain-claims': 'Domain Claims',
  'domain-updates': 'Domain Updates',
  'udemy-course': 'Udemy Course',
  'course-list': 'Course List',
};

const TRACKER_TAB_LABELS = {
  'tl-vtl': 'TL/VTL',
  'intern-records': 'Intern Records (TLA)',
  schedule: 'Schedule',
  leave: 'Leave',
};

const ONBOARDING_INNER_LABELS = {
  records: 'Records',
  requirements: 'Requirements',
  requirementsTracker: 'Requirements tracker',
  internStatus: 'Intern Status',
};

/**
 * @param {string} pathname
 * @param {string} search — leading `?` optional
 * @param {string} [userRole]
 * @returns {{ label: string, to: string | null }[]}
 */
export function buildBreadcrumbTrail(pathname, search = '', userRole = 'intern') {
  const sp = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);

  if (userRole === 'superadmin') {
    if (pathname === '/superadmin/overview') {
      return [{ label: 'OJT Overview', to: null }];
    }
    if (pathname === '/user-management') {
      return [{ label: 'User Management', to: null }];
    }
  }

  if (isRoleDashboard(pathname, userRole)) {
    return [{ label: dashboardPageLabel(userRole), to: null }];
  }

  if (pathname === '/tasks') {
    const adminTab = userRole === 'admin' ? (sp.get('admin_tasks_tab') || 'tla').toLowerCase() : null;
    const tab = sp.get('tab');
    const subLabel = tab && TASK_TAB_LABELS[tab] ? TASK_TAB_LABELS[tab] : null;

    if (adminTab === 'monitoring') {
      return [
        { label: 'Tasks', to: '/tasks' },
        { label: 'Monitoring Tasks', to: null },
      ];
    }
    if (subLabel) {
      return [
        { label: 'Tasks', to: '/tasks' },
        { label: subLabel, to: null },
      ];
    }
    return [{ label: 'Tasks', to: null }];
  }

  if (pathname === '/monitoring-tasks') {
    return [{ label: 'Monitoring Tasks', to: null }];
  }

  if (pathname === '/tracker') {
    const tab = sp.get('tab') || 'tl-vtl';
    const tabLabel = TRACKER_TAB_LABELS[tab] || tab;
    const sched = sp.get('schedule');
    if (tab === 'schedule' && sched) {
      return [
        { label: 'Tracker', to: '/tracker' },
        { label: tabLabel, to: '/tracker?tab=schedule' },
        {
          label: sched === 'interns' ? 'Interns schedule' : 'Staff schedule',
          to: null,
        },
      ];
    }
    return [
      { label: 'Tracker', to: '/tracker' },
      { label: tabLabel, to: null },
    ];
  }

  if (pathname === '/onboarding') {
    const offTab = sp.get('offboarding_tab');
    const onTab = sp.get('onboarding_tab');
    if (offTab) {
      const inner = ONBOARDING_INNER_LABELS[offTab] || offTab;
      return [
        { label: 'Onboarding / Offboarding', to: '/onboarding' },
        { label: `Offboarding · ${inner}`, to: null },
      ];
    }
    if (onTab) {
      const inner = ONBOARDING_INNER_LABELS[onTab] || onTab;
      return [
        { label: 'Onboarding / Offboarding', to: '/onboarding' },
        { label: `Onboarding · ${inner}`, to: null },
      ];
    }
    return [{ label: 'Onboarding / Offboarding', to: null }];
  }

  const simpleMap = {
    '/attendance': 'Attendance',
    '/report': 'Report Issue',
    '/kanban': 'Kanban',
    '/organized-tickets': 'Organize Tickets',
    '/repository': 'Repository',
    '/daily-report': 'Daily Report',
    '/daily-report/manage': 'Manage Daily Report',
    '/role-permissions': 'Permissions',
    '/user-management': 'User Management',
  };

  if (simpleMap[pathname]) {
    return [{ label: simpleMap[pathname], to: null }];
  }

  if (pathname.startsWith('/repository/view/')) {
    const slug = pathname.slice('/repository/view/'.length) || 'View';
    return [
      { label: 'Repository', to: '/repository' },
      { label: decodeURIComponent(slug), to: null },
    ];
  }

  const seg = pathname.replace(/^\//, '').split('/').filter(Boolean);
  const fallback = seg.length ? seg[seg.length - 1].replace(/-/g, ' ') : 'Page';
  return [{ label: fallback.charAt(0).toUpperCase() + fallback.slice(1), to: null }];
}
