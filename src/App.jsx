// client/src/App.jsx
import { Suspense, lazy } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { SupabaseProvider } from './context/supabase.jsx';
import { useSupabase } from './context/supabase.jsx';
import { PresenceProvider } from './context/PresenceContext.jsx';
import SidebarLayout from './components/SidebarLayout.jsx';
import ErrorBoundary from './components/ErrorBoundary.jsx';

const Login = lazy(() => import('./pages/Login'));
const AdminDashboard = lazy(() => import('./pages/AdminDashboard'));
const LeadDashboard = lazy(() => import('./pages/LeadDashboard'));
const InternDashboard = lazy(() => import('./pages/InternDashboard'));
const Kanban = lazy(() => import('./pages/Kanban'));
const ReportIssue = lazy(() => import('./pages/ReportIssue'));
const OrganizedTickets = lazy(() => import('./pages/OrganizedTickets'));
const TaskAssignmentLog = lazy(() => import('./pages/TaskAssignmentLog'));
const CentralizedRepository = lazy(() => import('./pages/CentralizedRepository'));
const RepositoryView = lazy(() => import('./pages/RepositoryView'));
const RolePermissions = lazy(() => import('./pages/RolePermissions'));
const UserManagement = lazy(() => import('./pages/UserManagement'));
const Attendance = lazy(() => import('./pages/Attendance'));
const OnboardingOffboarding = lazy(() => import('./pages/OnboardingOffboarding'));
const DailyReportForm = lazy(() => import('./pages/DailyReportForm'));
const DailyReportManage = lazy(() => import('./pages/DailyReportManage'));
const ScheduleFormPage = lazy(() => import('./pages/ScheduleFormPage'));
const TrackerPage = lazy(() => import('./pages/TrackerPage'));
const MonitoringTasks = lazy(() => import('./pages/MonitoringTasks'));
const AdminTasks = lazy(() => import('./pages/AdminTasks'));
const SuperAdminOverview = lazy(() => import('./pages/SuperAdminOverview'));

function PageFallback() {
  return (
    <div className="flex items-center justify-center py-16" aria-hidden="true">
      <div className="animate-spin rounded-full h-8 w-8 border-2 border-[#6795BE] border-t-transparent" />
    </div>
  );
}

function AppContent() {
  const { user, userRole, userTeam, loading } = useSupabase();
  const location = useLocation();
  const isAuthPage = location.pathname === '/login';

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-10 w-10 border-2 border-[#6795BE] border-t-transparent" aria-label="Loading" />
      </div>
    );
  }

  const role = userRole ?? 'intern';
  const isScheduleFormPage = location.pathname === '/schedule-form';

  const getDashboardRoute = () => {
    if (!user) return '/login';
    if (role === 'superadmin') return '/user-management';
    if (role === 'admin' || role === 'tla') return '/admin/dashboard';
    if (role === 'lead' || role === 'tl' || role === 'vtl' || role === 'monitoring_team' || role === 'pat1') return '/lead/dashboard';
    return '/intern/dashboard';
  };

  const canAccessTasks = () => {
    if (role === 'admin') return true;
    const tStr = String(userTeam || '').toLowerCase();
    if (tStr === 'pat1' || tStr === 'pat 1' || tStr === 'monitoring' || tStr === 'monitoring_team') return false;
    return true; 
  };

  const canAccessMonitoringTasks = () => {
    if (role === 'admin') return true;
    const tStr = String(userTeam || '').toLowerCase();
    return tStr === 'monitoring' || tStr === 'monitoring_team';
  };

  if (isScheduleFormPage) {
    return (
      <ErrorBoundary>
        <Suspense fallback={<PageFallback />}>
          <ScheduleFormPage />
        </Suspense>
      </ErrorBoundary>
    );
  }

  return (
    <div className={isAuthPage ? 'min-h-screen bg-gray-50' : 'min-h-screen bg-gray-50 dark:bg-gray-950'}>
      {isAuthPage ? (
        <ErrorBoundary>
          <Suspense fallback={<PageFallback />}>
            <Routes>
              <Route path="/" element={<Navigate to="/login" replace />} />
              <Route path="/login" element={!user ? <Login /> : <Navigate to={getDashboardRoute()} replace />} />
            </Routes>
          </Suspense>
        </ErrorBoundary>
      ) : user && role === 'superadmin' ? (
        <PresenceProvider>
          <ErrorBoundary>
            <Suspense fallback={<PageFallback />}>
              <Routes>
                <Route path="/" element={<Navigate to="/superadmin/overview" replace />} />
                <Route element={<SidebarLayout />}>
                  <Route path="/superadmin/overview" element={<SuperAdminOverview />} />
                  <Route path="/user-management" element={<UserManagement />} />
                  <Route path="*" element={<Navigate to="/superadmin/overview" replace />} />
                </Route>
              </Routes>
            </Suspense>
          </ErrorBoundary>
        </PresenceProvider>
      ) : user ? (
        <PresenceProvider>
          <ErrorBoundary>
            <Suspense fallback={<PageFallback />}>
              <Routes>
                <Route path="/" element={<Navigate to={getDashboardRoute()} replace />} />
                <Route element={<SidebarLayout />}>
                <Route path="/report" element={<ReportIssue />} />
                <Route path="/admin/dashboard" element={(role === 'admin' || role === 'tla') ? <AdminDashboard /> : <Navigate to={getDashboardRoute()} replace />} />
                <Route path="/lead/dashboard" element={(role === 'lead' || role === 'tl' || role === 'vtl' || role === 'monitoring_team' || role === 'pat1') ? <LeadDashboard /> : <Navigate to={getDashboardRoute()} replace />} />
                <Route path="/intern/dashboard" element={(role === 'intern' || !userRole) ? <InternDashboard /> : <Navigate to={getDashboardRoute()} replace />} />
                <Route path="/dashboard" element={<Navigate to={getDashboardRoute()} replace />} />
                {/* Avoid "No routes matched" flashes if userRole loads late */}
                <Route path="/superadmin/overview" element={<Navigate to={getDashboardRoute()} replace />} />
                <Route path="/kanban" element={<Kanban />} />
                <Route path="/organized-tickets" element={<OrganizedTickets />} />
                <Route
                  path="/tasks"
                  element={
                    canAccessTasks()
                      ? (role === 'admin' ? <AdminTasks /> : <TaskAssignmentLog />)
                      : <Navigate to={getDashboardRoute()} replace />
                  }
                />
                <Route path="/monitoring-tasks" element={<MonitoringTasks />} />
                <Route path="/tracker" element={<TrackerPage />} />
                <Route path="/domain-updates" element={canAccessTasks() ? <Navigate to="/tasks?tab=domain-updates" replace /> : <Navigate to={getDashboardRoute()} replace />} />
                <Route path="/repository" element={<CentralizedRepository />} />
                <Route path="/repository/view/:slug" element={<RepositoryView />} />
                <Route path="/role-permissions" element={(role === 'admin' || role === 'tla') ? <RolePermissions /> : <Navigate to={getDashboardRoute()} replace />} />
                <Route path="/user-management" element={(role === 'superadmin' || role === 'admin' || role === 'tla' || role === 'tl' || role === 'vtl') ? <UserManagement /> : <Navigate to={getDashboardRoute()} replace />} />
                <Route
                  path="/attendance"
                  element={
                    role === 'superadmin'
                      ? <Navigate to={getDashboardRoute()} replace />
                      : <Attendance />
                  }
                />
                <Route path="/daily-report" element={(role === 'admin' || role === 'tla' || role === 'tl' || role === 'vtl') ? <Navigate to="/daily-report/manage" replace /> : <DailyReportForm />} />
                <Route path="/daily-report/manage" element={(role === 'admin' || role === 'tla' || role === 'tl' || role === 'vtl') ? <DailyReportManage /> : <Navigate to="/daily-report" replace />} />
                <Route path="/onboarding" element={<OnboardingOffboarding />} />
                <Route path="/login" element={<Navigate to={getDashboardRoute()} replace />} />
              </Route>
            </Routes>
          </Suspense>
        </ErrorBoundary>
        </PresenceProvider>
      ) : (
        <Navigate to="/login" replace />
      )}
      <Toaster
        position="top-right"
        containerStyle={{ zIndex: 50000 }}
        toastOptions={{
          duration: 3000,
          style: { background: '#fff', color: '#333', borderRadius: '8px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' },
        }}
      />
    </div>
  );
}

export default function App() {
  return (
    <SupabaseProvider>
      <AppContent />
    </SupabaseProvider>
  );
}
