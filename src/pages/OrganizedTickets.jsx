import { useEffect, useState, useMemo } from 'react';
import { useSupabase } from '../context/supabase.jsx';
import { toast } from 'react-hot-toast';
import TicketDetailModal from '../components/TicketDetailModal.jsx';
import { queryCache } from '../utils/queryCache.js';
import { ticketPriorityPill, ticketStatusLabel, ticketStatusPill } from '../utils/uiPills.js';

const PRIMARY = '#6795BE';
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

export default function OrganizedTickets() {
  const { supabase, userRole } = useSupabase();
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedTicket, setSelectedTicket] = useState(null);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
  const [sortField, setSortField] = useState('created_desc'); // 'created_desc' | 'created_asc' | 'priority_desc' | 'priority_asc' | 'status' | 'title'

  useEffect(() => {
    fetchTickets();
  }, [supabase]);

  const fetchTickets = async (bypassCache = false) => {
    if (!bypassCache) {
      const cached = queryCache.get('organized:tickets');
      if (cached != null) {
        setTickets(cached);
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

      const tickets = data || [];
      queryCache.set('organized:tickets', tickets);
      setTickets(tickets);
    } catch (error) {
      toast.error('Error loading tickets');
      console.error('Error:', error);
    } finally {
      setLoading(false);
    }
  };

  // Get unique years from tickets
  const getYears = () => {
    const years = new Set();
    tickets.forEach(ticket => {
      if (ticket.created_at) {
        const year = new Date(ticket.created_at).getFullYear();
        years.add(year);
      }
    });
    // Always include current year and 2026 as starting point
    const currentYear = new Date().getFullYear();
    years.add(currentYear);
    if (currentYear >= 2026) {
      for (let y = 2026; y <= currentYear; y++) {
        years.add(y);
      }
    } else {
      years.add(2026);
    }
    return Array.from(years).sort((a, b) => b - a); // Sort descending
  };

  // Get tickets for a specific year and month
  const getTicketsByYearMonth = (year, month) => {
    return tickets.filter(ticket => {
      if (!ticket.created_at) return false;
      const ticketDate = new Date(ticket.created_at);
      return ticketDate.getFullYear() === year && ticketDate.getMonth() + 1 === month;
    });
  };

  // Get months that have tickets for a specific year
  const getMonthsWithTickets = (year) => {
    const months = new Set();
    tickets.forEach(ticket => {
      if (ticket.created_at) {
        const ticketDate = new Date(ticket.created_at);
        if (ticketDate.getFullYear() === year) {
          months.add(ticketDate.getMonth() + 1);
        }
      }
    });
    return Array.from(months).sort((a, b) => a - b);
  };

  const years = getYears();
  const monthsWithTickets = getMonthsWithTickets(selectedYear);
  const filteredTickets = getTicketsByYearMonth(selectedYear, selectedMonth);

  const sortedTickets = useMemo(() => {
    const list = [...filteredTickets];
    const priorityRank = { critical: 3, high: 2, normal: 1, low: 0 };
    const statusRank = { open: 1, 'in-progress': 2, closed: 3 };

    return list.sort((a, b) => {
      const [field, dir] = sortField.split('_'); // e.g. 'created_desc'
      const mul = dir === 'asc' ? 1 : -1;

      if (field === 'created') {
        const da = a.created_at ? new Date(a.created_at).getTime() : 0;
        const db = b.created_at ? new Date(b.created_at).getTime() : 0;
        return (da - db) * mul;
      }

      if (field === 'priority') {
        const pa = priorityRank[(a.priority || '').toLowerCase()] ?? -1;
        const pb = priorityRank[(b.priority || '').toLowerCase()] ?? -1;
        if (pa === pb) return 0;
        return (pa - pb) * mul;
      }

      if (field === 'status') {
        const sa = statusRank[(a.status || '').toLowerCase()] ?? 99;
        const sb = statusRank[(b.status || '').toLowerCase()] ?? 99;
        if (sa === sb) return 0;
        return (sa - sb) * mul;
      }

      if (field === 'title') {
        const ta = (a.title || '').toLowerCase();
        const tb = (b.title || '').toLowerCase();
        if (ta === tb) return 0;
        return ta < tb ? -1 : 1;
      }

      return 0;
    });
  }, [filteredTickets, sortField]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-gray-600">Loading tickets...</div>
      </div>
    );
  }

  return (
    <div className="w-full space-y-4 sm:space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1
            className="text-2xl font-bold text-gray-900"
            style={{ color: PRIMARY }}
          >
            Organized Tickets
          </h1>
          <p className="mt-1 text-sm text-gray-600">
            Browse tickets by year, month, and sort tickets the way you need.
          </p>
        </div>
      </div>

      {/* Year Tabs */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4 sm:p-5 shadow-sm">
        <div className="mb-4">
          <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-2">Select Year</h2>
          <div className="flex flex-wrap gap-2">
            {years.map((year) => (
              <button
                key={year}
                onClick={() => {
                  setSelectedYear(year);
                  // Set to first month with tickets or current month
                  const months = getMonthsWithTickets(year);
                  if (months.length > 0) {
                    setSelectedMonth(months[months.length - 1]); // Most recent month
                  } else {
                    setSelectedMonth(new Date().getMonth() + 1);
                  }
                }}
                className={`px-3.5 py-1.5 rounded-full text-sm font-semibold transition-colors border ${
                  selectedYear === year
                    ? 'text-white border-transparent'
                    : 'text-gray-700 dark:text-gray-200 border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 hover:bg-gray-50 dark:hover:bg-gray-800'
                }`}
                style={selectedYear === year ? { backgroundColor: PRIMARY } : {}}
              >
                {year}
              </button>
            ))}
          </div>
        </div>

        {/* Month Tabs */}
        {selectedYear && (
          <div>
            <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-2">Select Month</h2>
            <div className="flex flex-wrap gap-2">
              {MONTHS.map((month, index) => {
                const monthNum = index + 1;
                const hasTickets = monthsWithTickets.includes(monthNum);
                return (
                  <button
                    key={monthNum}
                    onClick={() => setSelectedMonth(monthNum)}
                    disabled={!hasTickets}
                    className={`px-3 py-1.5 rounded-full text-xs sm:text-sm font-semibold transition-colors border ${
                      selectedMonth === monthNum
                        ? 'text-white border-transparent'
                        : hasTickets
                        ? 'text-gray-700 dark:text-gray-200 border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 hover:bg-gray-50 dark:hover:bg-gray-800'
                        : 'text-gray-400 dark:text-gray-500 border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-950 cursor-not-allowed'
                    }`}
                    style={selectedMonth === monthNum ? { backgroundColor: PRIMARY } : {}}
                  >
                    {month}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Tickets List */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden shadow-sm">
        <div className="px-4 sm:px-6 py-3.5 border-b border-gray-200 dark:border-gray-800 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div>
            <h2 className="text-base sm:text-lg font-semibold text-gray-900 dark:text-gray-100">
              Tickets – {MONTHS[selectedMonth - 1]} {selectedYear}
            </h2>
            <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
              {filteredTickets.length} {filteredTickets.length === 1 ? 'ticket' : 'tickets'} in this month
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 md:justify-end">
            <label className="text-xs font-medium text-gray-600 dark:text-gray-300" htmlFor="ticket-sort">
              Sort by
            </label>
            <select
              id="ticket-sort"
              value={sortField}
              onChange={(e) => setSortField(e.target.value)}
              className="rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 px-3 py-1.5 text-xs sm:text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-[#6795BE]"
            >
              <option value="created_desc">Newest created</option>
              <option value="created_asc">Oldest created</option>
              <option value="priority_desc">Priority (high → low)</option>
              <option value="priority_asc">Priority (low → high)</option>
              <option value="status">Status</option>
              <option value="title">Title (A–Z)</option>
            </select>
          </div>
        </div>
        <div className="divide-y divide-gray-200 dark:divide-gray-800">
          {sortedTickets.length > 0 ? (
            sortedTickets.map((ticket) => (
              <div
                key={ticket.id}
                onClick={() => setSelectedTicket(ticket)}
                className="px-4 sm:px-6 py-4 hover:bg-gray-50 dark:hover:bg-gray-800/60 transition-colors cursor-pointer"
              >
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-medium text-gray-900 break-words">{ticket.title}</h3>
                    {ticket.description && (
                      <p className="mt-1 text-sm text-gray-600 line-clamp-2 break-words">{ticket.description}</p>
                    )}
                    <div className="mt-2 flex flex-wrap gap-2 text-xs text-gray-500">
                      <span>
                        Created {new Date(ticket.created_at).toLocaleDateString()}
                      </span>
                      {ticket.reporter_name && (
                        <span>• Reported by {ticket.reporter_name}</span>
                      )}
                      {ticket.assigned_to && (
                        <span>• Assigned to {ticket.assigned_to}</span>
                      )}
                    </div>
                  </div>
                  <div className="flex-shrink-0 sm:ml-4 flex items-center gap-2">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${ticketStatusPill(ticket.status)}`}>
                      {ticketStatusLabel(ticket.status)}
                    </span>
                    {ticket.priority && (
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${ticketPriorityPill(ticket.priority)}`}>
                        {ticket.priority}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))
          ) : (
            <div className="px-4 sm:px-6 py-12 text-center">
              <p className="text-gray-500">No tickets found for {MONTHS[selectedMonth - 1]} {selectedYear}</p>
            </div>
          )}
        </div>
      </div>

      {selectedTicket && (
        <TicketDetailModal
          isOpen={!!selectedTicket}
          onClose={() => setSelectedTicket(null)}
          ticket={selectedTicket}
          onUpdate={() => {
            fetchTickets(true);
            setSelectedTicket(null);
          }}
        />
      )}
    </div>
  );
}
