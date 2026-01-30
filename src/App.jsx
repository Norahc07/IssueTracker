// client/src/App.jsx
import { Suspense, lazy } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { SupabaseProvider } from './context/supabase.jsx';
import { useSupabase } from './context/supabase.jsx';
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
const CredentialVault = lazy(() => import('./pages/CredentialVault'));
const RolePermissions = lazy(() => import('./pages/RolePermissions'));

function PageFallback() {
  return (
    <div className="flex items-center justify-center py-16" aria-hidden="true">
      <div className="animate-spin rounded-full h-8 w-8 border-2 border-[#6795BE] border-t-transparent" />
    </div>
  );
}

function AppContent() {
  const { user, userRole, loading } = useSupabase();
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
  const getDashboardRoute = () => {
    if (!user) return '/login';
    if (role === 'admin' || role === 'tla') return '/admin/dashboard';
    if (role === 'lead' || role === 'tl' || role === 'vtl' || role === 'monitoring_team' || role === 'pat1') return '/lead/dashboard';
    return '/intern/dashboard';
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {isAuthPage ? (
        <ErrorBoundary>
          <Suspense fallback={<PageFallback />}>
            <Routes>
              <Route path="/" element={<Navigate to="/login" replace />} />
              <Route path="/login" element={!user ? <Login /> : <Navigate to={getDashboardRoute()} replace />} />
            </Routes>
          </Suspense>
        </ErrorBoundary>
      ) : user ? (
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
                <Route path="/kanban" element={<Kanban />} />
                <Route path="/organized-tickets" element={<OrganizedTickets />} />
                <Route path="/tasks" element={<TaskAssignmentLog />} />
                <Route path="/repository" element={<CentralizedRepository />} />
                <Route path="/credentials" element={<CredentialVault />} />
                <Route path="/role-permissions" element={(role === 'admin' || role === 'tla') ? <RolePermissions /> : <Navigate to={getDashboardRoute()} replace />} />
                <Route path="/login" element={<Navigate to={getDashboardRoute()} replace />} />
              </Route>
            </Routes>
          </Suspense>
        </ErrorBoundary>
      ) : (
        <Navigate to="/login" replace />
      )}
      <Toaster
        position="top-right"
        toastOptions={{
          duration: 3000,
          style: { background: '#fff', color: '#333', borderRadius: '8px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' },
        }}
      />
    </div>
  );
}

function App() {
  return (
    <SupabaseProvider>
      <AppContent />
    </SupabaseProvider>
  );
}

export default App;
