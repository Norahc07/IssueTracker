import { useEffect, useState } from 'react';
import { useSupabase } from '../context/supabase.jsx';
import { toast } from 'react-hot-toast';
import CreateAccountModal from '../components/CreateAccountModal.jsx';
import TicketDetailModal from '../components/TicketDetailModal.jsx';
import { Link } from 'react-router-dom';
import { permissions } from '../utils/rolePermissions.js';

export default function AdminDashboard() {
  const { user, supabase, userRole } = useSupabase();
  const [tickets, setTickets] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedTicket, setSelectedTicket] = useState(null);
  const [stats, setStats] = useState({
    totalTickets: 0,
    openTickets: 0,
    inProgressTickets: 0,
    closedTickets: 0,
    totalUsers: 0,
  });

  useEffect(() => {
    if (userRole === 'admin' || userRole === 'tla') {
      fetchData();
    }
  }, [user, userRole, supabase]);

  const fetchData = async () => {
    try {
      // Fetch tickets
      const { data: ticketsData, error: ticketsError } = await supabase
        .from('tickets')
        .select('*')
        .order('created_at', { ascending: false });

      if (ticketsError) throw ticketsError;

      // Fetch users
      const { data: usersData, error: usersError } = await supabase
        .from('users')
        .select('*')
        .order('created_at', { ascending: false });

      if (usersError) {
        console.warn('Could not fetch users:', usersError);
      }

      setTickets(ticketsData || []);
      setUsers(usersData || []);

      // Calculate stats
      const openTickets = (ticketsData || []).filter(t => t.status === 'open').length;
      const inProgressTickets = (ticketsData || []).filter(t => t.status === 'in-progress').length;
      const closedTickets = (ticketsData || []).filter(t => t.status === 'closed').length;

      setStats({
        totalTickets: ticketsData?.length || 0,
        openTickets,
        inProgressTickets,
        closedTickets,
        totalUsers: usersData?.length || 0,
      });
    } catch (error) {
      toast.error('Error loading data');
      console.error('Error:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-gray-600">Loading dashboard...</div>
      </div>
    );
  }

  return (
    <div className="w-full space-y-4 sm:space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Admin Dashboard</h1>
          <p className="mt-1 text-sm sm:text-base text-gray-600">Manage users, tickets, and system settings</p>
        </div>
        <div className="flex gap-2">
          {permissions.canCreateAccounts(userRole) && (
            <button
              onClick={() => setShowCreateModal(true)}
              className="w-full sm:w-auto px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium text-sm sm:text-base"
            >
              Create Account
            </button>
          )}
          <Link
            to="/role-permissions"
            className="w-full sm:w-auto px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors font-medium text-sm sm:text-base text-center"
          >
            View Permissions
          </Link>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 sm:gap-4">
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <div className="text-sm font-medium text-gray-600">Total Tickets</div>
          <div className="mt-2 text-3xl font-bold text-gray-900">{stats.totalTickets}</div>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <div className="text-sm font-medium text-green-600">Open</div>
          <div className="mt-2 text-3xl font-bold text-gray-900">{stats.openTickets}</div>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <div className="text-sm font-medium text-blue-600">In Progress</div>
          <div className="mt-2 text-3xl font-bold text-gray-900">{stats.inProgressTickets}</div>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <div className="text-sm font-medium text-gray-600">Closed</div>
          <div className="mt-2 text-3xl font-bold text-gray-900">{stats.closedTickets}</div>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <div className="text-sm font-medium text-gray-600">Total Users</div>
          <div className="mt-2 text-3xl font-bold text-gray-900">{stats.totalUsers}</div>
        </div>
      </div>

      {/* Users Section */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <div className="px-4 sm:px-6 py-4 border-b border-gray-200">
          <h2 className="text-base sm:text-lg font-semibold text-gray-900">Users</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Email</th>
                <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Role</th>
                <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider hidden sm:table-cell">Created</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {users.length > 0 ? (
                users.map((userItem) => (
                  <tr key={userItem.id} className="hover:bg-gray-50">
                    <td className="px-4 sm:px-6 py-4 text-sm text-gray-900 break-words">{userItem.email || 'N/A'}</td>
                    <td className="px-4 sm:px-6 py-4 whitespace-nowrap">
                      <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                        userItem.role === 'admin' ? 'bg-purple-100 text-purple-800' :
                        userItem.role === 'lead' ? 'bg-blue-100 text-blue-800' :
                        'bg-gray-100 text-gray-800'
                      }`}>
                        {userItem.role?.toUpperCase() || 'INTERN'}
                      </span>
                    </td>
                    <td className="px-4 sm:px-6 py-4 whitespace-nowrap text-sm text-gray-500 hidden sm:table-cell">
                      {userItem.created_at ? new Date(userItem.created_at).toLocaleDateString() : 'N/A'}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="3" className="px-4 sm:px-6 py-4 text-center text-sm text-gray-500">No users found</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Recent Tickets */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <div className="px-4 sm:px-6 py-4 border-b border-gray-200">
          <h2 className="text-base sm:text-lg font-semibold text-gray-900">Recent Tickets</h2>
        </div>
        <div className="divide-y divide-gray-200">
          {tickets.length > 0 ? (
            tickets.slice(0, 5).map((ticket) => (
              <div
                key={ticket.id}
                onClick={() => setSelectedTicket(ticket)}
                className="px-4 sm:px-6 py-4 hover:bg-gray-50 transition-colors cursor-pointer"
              >
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-medium text-gray-900 break-words">{ticket.title}</h3>
                    {ticket.description && (
                      <p className="mt-1 text-sm text-gray-600 line-clamp-2 break-words">{ticket.description}</p>
                    )}
                    <p className="mt-2 text-xs text-gray-500">
                      Created {new Date(ticket.created_at).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="flex-shrink-0 sm:ml-4">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                      ticket.status === 'open' ? 'bg-green-100 text-green-800' :
                      ticket.status === 'in-progress' ? 'bg-blue-100 text-blue-800' :
                      'bg-gray-100 text-gray-800'
                    }`}>
                      {ticket.status}
                    </span>
                  </div>
                </div>
              </div>
            ))
          ) : (
            <div className="px-4 sm:px-6 py-12 text-center">
              <p className="text-gray-500">No tickets found</p>
            </div>
          )}
        </div>
      </div>

      {showCreateModal && (
        <CreateAccountModal
          isOpen={showCreateModal}
          onClose={() => setShowCreateModal(false)}
          onSuccess={fetchData}
        />
      )}

      {selectedTicket && (
        <TicketDetailModal
          isOpen={!!selectedTicket}
          onClose={() => setSelectedTicket(null)}
          ticket={selectedTicket}
          onUpdate={() => {
            fetchData();
            setSelectedTicket(null);
          }}
        />
      )}
    </div>
  );
}
