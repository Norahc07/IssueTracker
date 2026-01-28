import { useEffect, useState } from 'react';
import { useSupabase } from '../context/supabase.jsx';
import { toast } from 'react-hot-toast';
import TicketDetailModal from '../components/TicketDetailModal.jsx';
import { Link } from 'react-router-dom';

export default function InternDashboard() {
  const { user, supabase, userRole } = useSupabase();
  const [tickets, setTickets] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedTicket, setSelectedTicket] = useState(null);
  const [stats, setStats] = useState({
    myTickets: 0,
    openTickets: 0,
    inProgressTickets: 0,
    completedTickets: 0,
    myTasks: 0,
    tasksInProgress: 0,
    tasksDone: 0,
    tasksPending: 0,
    updatedToday: 0,
  });

  useEffect(() => {
    if (userRole === 'intern' || !userRole) {
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

      if (ticketsError) {
        console.warn('Error fetching tickets:', ticketsError);
      }

      // Fetch tasks
      const { data: tasksData, error: tasksError } = await supabase
        .from('tasks')
        .select('*')
        .eq('assigned_to', user?.id)
        .order('created_at', { ascending: false });

      if (tasksError) {
        console.warn('Error fetching tasks:', tasksError);
      }

      setTickets(ticketsData || []);
      setTasks(tasksData || []);

      // Calculate ticket stats
      const myTickets = (ticketsData || []).length;
      const openTickets = (ticketsData || []).filter(t => t.status === 'open').length;
      const inProgressTickets = (ticketsData || []).filter(t => t.status === 'in-progress').length;
      const completedTickets = (ticketsData || []).filter(t => t.status === 'closed').length;

      // Calculate task stats
      const myTasks = (tasksData || []).length;
      const tasksInProgress = (tasksData || []).filter(t => t.status === 'in-progress').length;
      const tasksDone = (tasksData || []).filter(t => t.status === 'done').length;
      const tasksPending = (tasksData || []).filter(t => t.status === 'to-do' || t.status === 'review').length;
      
      // Calculate updated today
      const today = new Date().toDateString();
      const updatedToday = (tasksData || []).filter(t => {
        if (!t.updated_at) return false;
        return new Date(t.updated_at).toDateString() === today;
      }).length;

      setStats({
        myTickets,
        openTickets,
        inProgressTickets,
        completedTickets,
        myTasks,
        tasksInProgress,
        tasksDone,
        tasksPending,
        updatedToday,
      });
    } catch (error) {
      toast.error('Error loading data');
      console.error('Error:', error);
    } finally {
      setLoading(false);
    }
  };

  const calculateProgress = () => {
    if (stats.myTasks === 0) return 0;
    return Math.round((stats.tasksDone / stats.myTasks) * 100);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-gray-600">Loading dashboard...</div>
      </div>
    );
  }

  const progress = calculateProgress();

  return (
    <div className="w-full space-y-4 sm:space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">KTI Portal - My Dashboard</h1>
        <p className="mt-1 text-sm sm:text-base text-gray-600">Track your assigned tasks, tickets, and daily progress</p>
      </div>

      {/* Quick Access Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Link
          to="/tasks"
          className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-lg p-6 text-white hover:shadow-lg transition-shadow"
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-blue-100 text-sm font-medium">Task Assignment</p>
              <p className="text-2xl font-bold mt-1">{stats.myTasks} Tasks</p>
            </div>
            <svg className="h-12 w-12 text-blue-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
          </div>
        </Link>

        <Link
          to="/repository"
          className="bg-gradient-to-br from-purple-500 to-purple-600 rounded-lg p-6 text-white hover:shadow-lg transition-shadow"
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-purple-100 text-sm font-medium">Repository</p>
              <p className="text-2xl font-bold mt-1">Resources</p>
            </div>
            <svg className="h-12 w-12 text-purple-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
            </svg>
          </div>
        </Link>

        <Link
          to="/credentials"
          className="bg-gradient-to-br from-indigo-500 to-indigo-600 rounded-lg p-6 text-white hover:shadow-lg transition-shadow"
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-indigo-100 text-sm font-medium">Credential Vault</p>
              <p className="text-2xl font-bold mt-1">Tools</p>
            </div>
            <svg className="h-12 w-12 text-indigo-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>
        </Link>
      </div>

      {/* Progress Section */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900">Daily Progress</h2>
          <span className="text-2xl font-bold text-blue-600">{progress}%</span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-4 mb-4">
          <div
            className="bg-gradient-to-r from-blue-500 to-blue-600 h-4 rounded-full transition-all duration-300"
            style={{ width: `${progress}%` }}
          ></div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div>
            <p className="text-xs text-gray-500">Updated Today</p>
            <p className="text-xl font-bold text-gray-900">{stats.updatedToday}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500">Pending</p>
            <p className="text-xl font-bold text-gray-900">{stats.tasksPending}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500">In Progress</p>
            <p className="text-xl font-bold text-blue-600">{stats.tasksInProgress}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500">Completed</p>
            <p className="text-xl font-bold text-green-600">{stats.tasksDone}</p>
          </div>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <div className="text-sm font-medium text-gray-600">My Tickets</div>
          <div className="mt-2 text-3xl font-bold text-gray-900">{stats.myTickets}</div>
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
          <div className="text-sm font-medium text-gray-600">Completed</div>
          <div className="mt-2 text-3xl font-bold text-gray-900">{stats.completedTickets}</div>
        </div>
      </div>

      {/* Recent Tasks */}
      {tasks.length > 0 && (
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <div className="px-4 sm:px-6 py-4 border-b border-gray-200 flex items-center justify-between">
            <h2 className="text-base sm:text-lg font-semibold text-gray-900">My Tasks</h2>
            <Link
              to="/tasks"
              className="text-sm text-blue-600 hover:text-blue-700 font-medium"
            >
              View All →
            </Link>
          </div>
          <div className="divide-y divide-gray-200">
            {tasks.slice(0, 5).map((task) => (
              <div key={task.id} className="px-4 sm:px-6 py-4">
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <h3 className="text-sm font-medium text-gray-900">{task.name}</h3>
                    <p className="text-xs text-gray-500 mt-1">
                      {task.type === 'domain' ? 'Domain Task' : 'Regular Task'}
                    </p>
                  </div>
                  <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                    task.status === 'done' ? 'bg-green-100 text-green-800' :
                    task.status === 'in-progress' ? 'bg-blue-100 text-blue-800' :
                    task.status === 'review' ? 'bg-yellow-100 text-yellow-800' :
                    'bg-gray-100 text-gray-800'
                  }`}>
                    {task.status || 'to-do'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tickets List */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <div className="px-4 sm:px-6 py-4 border-b border-gray-200">
          <h2 className="text-base sm:text-lg font-semibold text-gray-900">My Tickets</h2>
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
              <p className="text-gray-500">No tickets assigned yet</p>
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
            fetchData();
            setSelectedTicket(null);
          }}
        />
      )}
    </div>
  );
}
