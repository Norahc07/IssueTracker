import { useEffect, useState } from 'react';
import { useSupabase } from '../context/supabase.jsx';
import { toast } from 'react-hot-toast';
import TicketDetailModal from '../components/TicketDetailModal.jsx';

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

  useEffect(() => {
    fetchTickets();
  }, [supabase]);

  const fetchTickets = async () => {
    try {
      const { data, error } = await supabase
        .from('tickets')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;

      setTickets(data || []);
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
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Organized Tickets</h1>
        <p className="mt-1 text-sm sm:text-base text-gray-600">Browse tickets by year and month</p>
      </div>

      {/* Year Tabs */}
      <div className="bg-white rounded-lg border border-gray-200 p-4">
        <div className="mb-4">
          <h2 className="text-sm font-semibold text-gray-700 mb-2">Select Year</h2>
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
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  selectedYear === year
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {year}
              </button>
            ))}
          </div>
        </div>

        {/* Month Tabs */}
        {selectedYear && (
          <div>
            <h2 className="text-sm font-semibold text-gray-700 mb-2">Select Month</h2>
            <div className="flex flex-wrap gap-2">
              {MONTHS.map((month, index) => {
                const monthNum = index + 1;
                const hasTickets = monthsWithTickets.includes(monthNum);
                return (
                  <button
                    key={monthNum}
                    onClick={() => setSelectedMonth(monthNum)}
                    disabled={!hasTickets}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                      selectedMonth === monthNum
                        ? 'bg-blue-600 text-white'
                        : hasTickets
                        ? 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                        : 'bg-gray-50 text-gray-400 cursor-not-allowed'
                    }`}
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
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <div className="px-4 sm:px-6 py-4 border-b border-gray-200">
          <h2 className="text-base sm:text-lg font-semibold text-gray-900">
            Tickets - {MONTHS[selectedMonth - 1]} {selectedYear}
            <span className="ml-2 text-sm font-normal text-gray-500">
              ({filteredTickets.length} {filteredTickets.length === 1 ? 'ticket' : 'tickets'})
            </span>
          </h2>
        </div>
        <div className="divide-y divide-gray-200">
          {filteredTickets.length > 0 ? (
            filteredTickets.map((ticket) => (
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
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                      ticket.status === 'open' ? 'bg-green-100 text-green-800' :
                      ticket.status === 'in-progress' ? 'bg-blue-100 text-blue-800' :
                      'bg-gray-100 text-gray-800'
                    }`}>
                      {ticket.status}
                    </span>
                    {ticket.priority && (
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        ticket.priority === 'critical' ? 'bg-red-100 text-red-800' :
                        ticket.priority === 'high' ? 'bg-orange-100 text-orange-800' :
                        ticket.priority === 'normal' ? 'bg-blue-100 text-blue-800' :
                        'bg-gray-100 text-gray-800'
                      }`}>
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
            fetchTickets();
            setSelectedTicket(null);
          }}
        />
      )}
    </div>
  );
}
