import { useEffect, useState } from 'react';
import { useSupabase } from '../context/supabase.jsx';
import { toast } from 'react-hot-toast';
import CreateAccountModal from '../components/CreateAccountModal.jsx';
import TicketDetailModal from '../components/TicketDetailModal.jsx';

export default function LeadDashboard() {
  const { user, supabase, userRole } = useSupabase();
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedTicket, setSelectedTicket] = useState(null);
  const [stats, setStats] = useState({
    totalTickets: 0,
    openTickets: 0,
    inProgressTickets: 0,
    closedTickets: 0,
  });

  useEffect(() => {
    if (userRole === 'lead') {
      fetchTickets();
    }
  }, [user, userRole, supabase]);

  const fetchTickets = async () => {
    try {
      const { data, error } = await supabase
        .from('tickets')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;

      setTickets(data || []);

      const openTickets = (data || []).filter(t => t.status === 'open').length;
      const inProgressTickets = (data || []).filter(t => t.status === 'in-progress').length;
      const closedTickets = (data || []).filter(t => t.status === 'closed').length;

      setStats({
        totalTickets: data?.length || 0,
        openTickets,
        inProgressTickets,
        closedTickets,
      });
    } catch (error) {
      toast.error('Error loading tickets');
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

      {/* Stats Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
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
      </div>

      {/* Tickets List */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <div className="px-4 sm:px-6 py-4 border-b border-gray-200">
          <h2 className="text-base sm:text-lg font-semibold text-gray-900">All Tickets</h2>
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
          onSuccess={fetchTickets}
        />
      )}

      {selectedTicket && (
        <TicketDetailModal
          isOpen={!!selectedTicket}
          onClose={() => setSelectedTicket(null)}
          ticket={selectedTicket}
          onUpdate={() => {
            fetchTickets();
            setSelectedTicket(null);
          }}
        />
      )}
    </div>
  );
}
