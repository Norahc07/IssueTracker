import { useEffect, useState, useMemo } from 'react';
import { useSupabase } from '../context/supabase.jsx';
import { toast } from 'react-hot-toast';
import TicketDetailModal from '../components/TicketDetailModal.jsx';
import { Link } from 'react-router-dom';
import { queryCache } from '../utils/queryCache.js';

const PRIMARY = '#6795BE';

export default function LeadDashboard() {
  const { user, supabase, userRole } = useSupabase();
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedTicket, setSelectedTicket] = useState(null);
  const [ticketFilter, setTicketFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [stats, setStats] = useState({
    totalTickets: 0,
    openTickets: 0,
    inProgressTickets: 0,
    closedTickets: 0,
  });

  useEffect(() => {
    if (userRole === 'lead' || userRole === 'tl' || userRole === 'vtl' || userRole === 'monitoring_team' || userRole === 'pat1') {
      fetchTickets();
    }
  }, [user, userRole, supabase]);

  const fetchTickets = async (bypassCache = false) => {
    if (!bypassCache) {
      const cached = queryCache.get('lead:tickets');
      if (cached != null) {
        setTickets(cached);
        setStats({
          totalTickets: cached.length,
          openTickets: cached.filter(t => t.status === 'open').length,
          inProgressTickets: cached.filter(t => t.status === 'in-progress').length,
          closedTickets: cached.filter(t => t.status === 'closed').length,
        });
        setLoading(false);
        return;
      }
    }
    try {
      const { data, error } = await supabase
        .from('tickets')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      const ticketsList = data || [];
      queryCache.set('lead:tickets', ticketsList);
      setTickets(ticketsList);
      setStats({
        totalTickets: ticketsList.length,
        openTickets: ticketsList.filter(t => t.status === 'open').length,
        inProgressTickets: ticketsList.filter(t => t.status === 'in-progress').length,
        closedTickets: ticketsList.filter(t => t.status === 'closed').length,
      });
    } catch (error) {
      toast.error('Error loading tickets');
      console.error('Error:', error);
    } finally {
      setLoading(false);
    }
  };

  const filteredTickets = useMemo(() => {
    let list = tickets;
    if (ticketFilter === 'open') list = list.filter(t => t.status === 'open');
    else if (ticketFilter === 'in-progress') list = list.filter(t => t.status === 'in-progress');
    else if (ticketFilter === 'closed') list = list.filter(t => t.status === 'closed');
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(t =>
        (t.title && t.title.toLowerCase().includes(q)) ||
        (t.description && t.description.toLowerCase().includes(q))
      );
    }
    return list;
  }, [tickets, ticketFilter, searchQuery]);

  const ticketsToShow = filteredTickets.slice(0, 5);

  const getStatusBadge = (status) => {
    const styles = { open: 'bg-blue-100 text-blue-800', 'in-progress': 'bg-purple-100 text-purple-800', closed: 'bg-gray-100 text-gray-800' };
    const label = status === 'closed' ? 'Complete' : status === 'in-progress' ? 'In Progress' : 'Open';
    return <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${styles[status] || 'bg-gray-100 text-gray-800'}`}>{label}</span>;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-10 w-10 border-2 border-[#6795BE] border-t-transparent" aria-label="Loading" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900" style={{ color: PRIMARY }}>Dashboard</h1>
        <p className="mt-1 text-sm text-gray-600">Overview of team tickets and activity</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Link to="/tasks" className="rounded-xl p-5 text-white shadow-sm transition-all hover:shadow-md flex items-center justify-between" style={{ backgroundColor: PRIMARY }}>
          <div>
            <p className="text-white/90 text-sm font-medium">Task Assignment</p>
            <p className="text-lg font-semibold mt-1">View</p>
          </div>
          <svg className="h-10 w-10 text-white/80" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" /></svg>
        </Link>
        <Link to="/repository" className="rounded-xl p-5 text-white shadow-sm transition-all hover:shadow-md flex items-center justify-between" style={{ backgroundColor: PRIMARY }}>
          <div>
            <p className="text-white/90 text-sm font-medium">Repository</p>
            <p className="text-lg font-semibold mt-1">View</p>
          </div>
          <svg className="h-10 w-10 text-white/80" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 19a2 2 0 01-2 2H3a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H5z" /></svg>
        </Link>
        <Link to="/credentials" className="rounded-xl p-5 text-white shadow-sm transition-all hover:shadow-md flex items-center justify-between" style={{ backgroundColor: PRIMARY }}>
          <div>
            <p className="text-white/90 text-sm font-medium">Credential Vault</p>
            <p className="text-lg font-semibold mt-1">View</p>
          </div>
          <svg className="h-10 w-10 text-white/80" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
        </Link>
      </div>

      <div>
        <h2 className="text-base font-semibold text-gray-900 mb-3">Ticket Overview</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { label: 'Total', value: stats.totalTickets },
            { label: 'Open', value: stats.openTickets },
            { label: 'In Progress', value: stats.inProgressTickets },
            { label: 'Completed', value: stats.closedTickets },
          ].map(({ label, value }) => (
            <div key={label} className="rounded-xl border-2 bg-white p-4 shadow-sm" style={{ borderColor: PRIMARY }}>
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">{label}</p>
              <p className="mt-1 text-2xl font-bold text-gray-900">{value}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-4 sm:px-6 py-4 border-b border-gray-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <h2 className="text-base font-semibold text-gray-900">Tickets</h2>
          <div className="flex flex-wrap items-center gap-2">
            {['all', 'open', 'in-progress', 'closed'].map((f) => (
              <button key={f} onClick={() => setTicketFilter(f)} className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${ticketFilter === f ? 'text-white' : 'text-gray-600 hover:bg-gray-100'}`} style={ticketFilter === f ? { backgroundColor: PRIMARY } : {}}>
                {f === 'all' ? 'All Tickets' : f === 'closed' ? 'Completed' : f === 'in-progress' ? 'In Progress' : 'Open'}
              </button>
            ))}
            <div className="relative flex-1 min-w-[160px] max-w-xs">
              <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400">
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
              </span>
              <input type="text" placeholder="Search Tickets..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="w-full pl-9 pr-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-offset-0 focus:ring-[#6795BE]" />
            </div>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead>
              <tr>
                <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Ticket Name</th>
                <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Description</th>
                <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date Created</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {ticketsToShow.length > 0 ? ticketsToShow.map((ticket) => (
                <tr key={ticket.id} onClick={() => setSelectedTicket(ticket)} className="hover:bg-gray-50 cursor-pointer transition-colors">
                  <td className="px-4 sm:px-6 py-3 text-sm font-medium text-gray-900">{ticket.title || '—'}</td>
                  <td className="px-4 sm:px-6 py-3 text-sm text-gray-600 max-w-xs truncate">{ticket.description || '—'}</td>
                  <td className="px-4 sm:px-6 py-3">{getStatusBadge(ticket.status)}</td>
                  <td className="px-4 sm:px-6 py-3 text-sm text-gray-500">{ticket.created_at ? new Date(ticket.created_at).toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: '2-digit' }) : '—'}</td>
                </tr>
              )) : (
                <tr><td colSpan={4} className="px-4 sm:px-6 py-8 text-center text-gray-500 text-sm">No tickets found</td></tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="px-4 sm:px-6 py-3 border-t border-gray-200 flex justify-end">
          <Link to="/organized-tickets" className="text-sm font-medium transition-colors hover:opacity-90" style={{ color: PRIMARY }}>View all →</Link>
        </div>
      </div>

      {selectedTicket && (
        <TicketDetailModal isOpen={!!selectedTicket} onClose={() => setSelectedTicket(null)} ticket={selectedTicket} onUpdate={() => { fetchTickets(true); setSelectedTicket(null); }} />
      )}
    </div>
  );
}
