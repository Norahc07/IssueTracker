// client/src/App.jsx
import { Suspense, lazy } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { SupabaseProvider } from './context/supabase.jsx';
import { useSupabase } from './context/supabase.jsx';
import Navbar from './components/Navbar.jsx';
import ErrorBoundary from './components/ErrorBoundary.jsx';

// Lazy-load pages for faster initial load and code splitting
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
      <div className="animate-spin rounded-full h-8 w-8 border-2 border-blue-500 border-t-transparent" />
    </div>
  );
}

function AppContent() {
  const { user, userRole, loading } = useSupabase();
  const location = useLocation();
  const isAuthPage = location.pathname === '/login';

  // Minimal loading: small spinner, don't block layout
  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-10 w-10 border-2 border-blue-500 border-t-transparent" aria-label="Loading" />
      </div>
    );
  }

  // Use role or fallback to intern so routing works while role loads
  const role = userRole ?? 'intern';

  const getDashboardRoute = () => {
    if (!user) return '/login';
    if (role === 'admin' || role === 'tla') return '/admin/dashboard';
    if (role === 'lead' || role === 'tl' || role === 'vtl' || role === 'monitoring_team' || role === 'pat1') return '/lead/dashboard';
    return '/intern/dashboard';
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {!isAuthPage && <Navbar />}
      <main className={isAuthPage ? '' : `w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 ${!isAuthPage ? 'pt-20' : ''}`}>
        <ErrorBoundary>
          <Suspense fallback={<PageFallback />}>
            <Routes>
              <Route path="/" element={<Navigate to="/login" replace />} />
              <Route path="/report" element={user ? <ReportIssue /> : <Navigate to="/login" />} />
              <Route path="/admin/dashboard" element={user && (role === 'admin' || role === 'tla') ? <AdminDashboard /> : <Navigate to="/login" />} />
              <Route path="/lead/dashboard" element={user && (role === 'lead' || role === 'tl' || role === 'vtl' || role === 'monitoring_team' || role === 'pat1') ? <LeadDashboard /> : <Navigate to="/login" />} />
              <Route path="/intern/dashboard" element={user && (role === 'intern' || !userRole) ? <InternDashboard /> : <Navigate to={getDashboardRoute()} replace />} />
              <Route path="/dashboard" element={<Navigate to={getDashboardRoute()} replace />} />
              <Route path="/kanban" element={user ? <Kanban /> : <Navigate to="/login" />} />
              <Route path="/organized-tickets" element={user ? <OrganizedTickets /> : <Navigate to="/login" />} />
              <Route path="/tasks" element={user ? <TaskAssignmentLog /> : <Navigate to="/login" />} />
              <Route path="/repository" element={user ? <CentralizedRepository /> : <Navigate to="/login" />} />
              <Route path="/credentials" element={user ? <CredentialVault /> : <Navigate to="/login" />} />
              <Route path="/role-permissions" element={user && (role === 'admin' || role === 'tla') ? <RolePermissions /> : <Navigate to="/login" />} />
              <Route path="/login" element={!user ? <Login /> : <Navigate to={getDashboardRoute()} replace />} />
            </Routes>
          </Suspense>
        </ErrorBoundary>
      </main>
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
