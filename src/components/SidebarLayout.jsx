import { useState } from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useSupabase } from '../context/supabase.jsx';
import { getRoleDisplayName, getRoleColor, permissions } from '../utils/rolePermissions.js';
import { queryCache } from '../utils/queryCache.js';

const PRIMARY = '#6795BE';
const PRIMARY_LIGHT = 'rgba(103, 149, 190, 0.15)';

const navItems = [
  { to: 'dashboard', label: 'Dashboard', icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6' },
  { to: '/report', label: 'Report Issue', icon: 'M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z' },
  { to: '/kanban', label: 'Kanban', icon: 'M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2v10a2 2 0 002 2z' },
  { to: '/organized-tickets', label: 'Organize Tickets', icon: 'M15 5v2m0 4v2m0 4v2M5 5a2 2 0 00-2 2v3a2 2 0 110 4v3a2 2 0 002 2h14a2 2 0 002-2v-3a2 2 0 110-4V7a2 2 0 00-2-2H5z' },
  { to: '/tasks', label: 'Tasks', icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4' },
  { to: '/repository', label: 'Repository', icon: 'M5 19a2 2 0 01-2 2H3a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H5z' },
  { to: '/credentials', label: 'Credentials', icon: 'M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z' },
];

function Icon({ path, className = 'w-5 h-5' }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={path} />
    </svg>
  );
}

export default function SidebarLayout() {
  const { user, userRole, supabase } = useSupabase();
  const location = useLocation();
  const navigate = useNavigate();
  const [notificationsOpen, setNotificationsOpen] = useState(false);

  const getDashboardPath = () => {
    if (userRole === 'admin' || userRole === 'tla') return '/admin/dashboard';
    if (userRole === 'lead' || userRole === 'tl' || userRole === 'vtl' || userRole === 'monitoring_team' || userRole === 'pat1') return '/lead/dashboard';
    return '/intern/dashboard';
  };

  const isActive = (to) => {
    if (to === 'dashboard') return location.pathname === getDashboardPath();
    return location.pathname === to || (to !== '/' && location.pathname.startsWith(to));
  };

  const handleLogout = async () => {
    queryCache.clearAll();
    await supabase.auth.signOut();
    navigate('/login', { replace: true });
  };

  return (
    <div className="flex min-h-screen bg-gray-50">
      {/* Sidebar */}
      <aside
        className="fixed left-0 top-0 z-40 h-screen w-64 flex flex-col transition-transform duration-200 ease-out md:translate-x-0"
        style={{ backgroundColor: PRIMARY }}
      >
        <div className="flex h-30 items-center justify-center border-b border-white/20 px-4 pt-5">
          <Link to={getDashboardPath()} className="flex items-center justify-center focus:outline-none">
            <img src="/white-logo.png" alt="Knowles Training Institute" className="h-35 w-auto max-w-[350px] object-contain" />
          </Link>
        </div>
        <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 py-5">
          {navItems.map((item) => {
            const to = item.to === 'dashboard' ? getDashboardPath() : item.to;
            const active = isActive(item.to);
            return (
              <Link
                key={item.to}
                to={to}
                className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                  active ? 'bg-white/20 text-white' : 'text-white/90 hover:bg-white/10 hover:text-white'
                }`}
              >
                <Icon path={item.icon} className="h-5 w-5 flex-shrink-0" />
                <span>{item.label}</span>
              </Link>
            );
          })}
          {(userRole === 'admin' || userRole === 'tla') && (
            <Link
              to="/role-permissions"
              className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                location.pathname === '/role-permissions' ? 'bg-white/20 text-white' : 'text-white/90 hover:bg-white/10 hover:text-white'
              }`}
            >
              <Icon path="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" className="h-5 w-5 flex-shrink-0" />
              <span>Permissions</span>
            </Link>
          )}
        </nav>
        <div className="border-t border-white/20 p-3">
          <button
            onClick={handleLogout}
            className="flex w-full items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium text-white transition-colors hover:bg-white/20"
            style={{ backgroundColor: PRIMARY_LIGHT }}
          >
            <Icon path="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" className="h-5 w-5" />
            Logout
          </button>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex flex-1 flex-col pl-64">
        {/* Top header */}
        <header className="sticky top-0 z-30 flex h-16 items-center justify-end gap-3 border-b border-gray-200 bg-white px-4 sm:px-6 shadow-sm">
          <button
            type="button"
            onClick={() => setNotificationsOpen((o) => !o)}
            className="rounded-full p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#6795BE]"
            aria-label="Notifications"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
            </svg>
          </button>
          <span className={`rounded-full px-3 py-1 text-xs font-medium ${getRoleColor(userRole)}`}>
            {getRoleDisplayName(userRole) || 'Intern'}
          </span>
          <button
            type="button"
            className="rounded-full p-1.5 text-gray-500 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#6795BE]"
            aria-label="Profile"
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-200 text-sm font-medium text-gray-600">
              {user?.email?.charAt(0).toUpperCase() || '?'}
            </span>
          </button>
        </header>

        <main className="flex-1 p-4 sm:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
