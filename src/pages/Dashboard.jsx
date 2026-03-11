import { useEffect, useState } from 'react';
import { useSupabase } from '../context/supabase.jsx';
import { toast } from 'react-hot-toast';
import { ticketStatusLabel, ticketStatusPill } from '../utils/uiPills.js';

export default function Dashboard() {
  const { user, supabase } = useSupabase();
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
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

    if (user) {
      fetchTickets();
    }
  }, [user, supabase]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-gray-600">Loading dashboard...</div>
      </div>
    );
  }

  return (
    <div className="w-full space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">Dashboard</h1>
        <p className="text-gray-600 dark:text-gray-400">Manage your issues and track progress</p>
      </div>
      
      <div className="bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-gray-200 dark:border-gray-800 overflow-hidden">
        <div className="px-4 sm:px-6 py-3.5 border-b border-gray-200 dark:border-gray-800">
          <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">Recent Tickets</h2>
        </div>
        
        {tickets.length > 0 ? (
          <div className="divide-y divide-gray-200 dark:divide-gray-800">
            {tickets.map((ticket) => (
              <div key={ticket.id} className="px-4 sm:px-6 py-3.5 hover:bg-gray-50 dark:hover:bg-gray-800/60 transition-colors">
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-medium text-gray-900 truncate">
                      {ticket.title}
                    </h3>
                    {ticket.description && (
                      <p className="mt-1 text-sm text-gray-600 dark:text-gray-300 line-clamp-2">
                        {ticket.description}
                      </p>
                    )}
                    <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                      Created {new Date(ticket.created_at).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="ml-4 flex-shrink-0">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${ticketStatusPill(ticket.status)}`}>
                      {ticketStatusLabel(ticket.status)}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="px-4 sm:px-6 py-12 text-center">
            <p className="text-gray-500 dark:text-gray-400">No tickets found. Create your first ticket!</p>
          </div>
        )}
      </div>
    </div>
  );
}