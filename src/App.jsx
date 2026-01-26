// client/src/App.jsx
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { SupabaseProvider } from './context/supabase.jsx';
import { useSupabase } from './context/supabase.jsx';
import Navbar from './components/Navbar.jsx';
import AdminDashboard from './pages/AdminDashboard';
import LeadDashboard from './pages/LeadDashboard';
import InternDashboard from './pages/InternDashboard';
import Login from './pages/Login';
import Kanban from './pages/Kanban';
import ReportIssue from './pages/ReportIssue';
import OrganizedTickets from './pages/OrganizedTickets';

function AppContent() {
  const { user, userRole, loading } = useSupabase();
  const location = useLocation();
  
  const isAuthPage = location.pathname === '/login' || location.pathname === '/report';

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-50">
        <div className="flex flex-col items-center space-y-4">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
          <div className="text-lg text-gray-600">Loading...</div>
        </div>
      </div>
    );
  }

  // Role-based dashboard routing
  const getDashboardRoute = () => {
    if (!user) return '/report';
    if (userRole === 'admin') return '/admin/dashboard';
    if (userRole === 'lead') return '/lead/dashboard';
    return '/intern/dashboard';
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {!isAuthPage && <Navbar />}
      <main className={isAuthPage ? '' : `w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 ${!isAuthPage ? 'pt-20' : ''}`}>
        <Routes>
          <Route
            path="/"
            element={<Navigate to="/report" replace />}
          />
          <Route
            path="/report"
            element={<ReportIssue />}
          />
          <Route
            path="/admin/dashboard"
            element={user && userRole === 'admin' ? <AdminDashboard /> : <Navigate to="/login" />}
          />
          <Route
            path="/lead/dashboard"
            element={user && userRole === 'lead' ? <LeadDashboard /> : <Navigate to="/login" />}
          />
          <Route
            path="/intern/dashboard"
            element={user && (userRole === 'intern' || !userRole) ? <InternDashboard /> : <Navigate to="/login" />}
          />
          <Route
            path="/dashboard"
            element={<Navigate to={getDashboardRoute()} replace />}
          />
          <Route
            path="/kanban"
            element={user ? <Kanban /> : <Navigate to="/login" />}
          />
          <Route
            path="/organized-tickets"
            element={user ? <OrganizedTickets /> : <Navigate to="/login" />}
          />
          <Route
            path="/login"
            element={!user ? <Login /> : <Navigate to={getDashboardRoute()} replace />}
          />
        </Routes>
      </main>
      <Toaster 
        position="top-right" 
        toastOptions={{
          duration: 3000,
          style: {
            background: '#fff',
            color: '#333',
            borderRadius: '8px',
            boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
          },
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