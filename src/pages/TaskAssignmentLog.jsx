import { useEffect, useState } from 'react';
import { useSupabase } from '../context/supabase.jsx';
import { toast } from 'react-hot-toast';
import { logAction } from '../utils/auditTrail.js';
import { permissions, ROLES } from '../utils/rolePermissions.js';
import { queryCache } from '../utils/queryCache.js';

const PRIMARY = '#6795BE';
const TASK_STATUSES = {
  'to-do': 'To Do',
  'in-progress': 'In Progress',
  'review': 'Review',
  'done': 'Done'
};

export default function TaskAssignmentLog() {
  const { supabase, user, userRole } = useSupabase();
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [claimingTaskId, setClaimingTaskId] = useState(null);
  const [filter, setFilter] = useState('all'); // all, my-tasks, available

  useEffect(() => {
    fetchTasks();
  }, [supabase, user]);

  const fetchTasks = async (bypassCache = false) => {
    if (!bypassCache) {
      const cached = queryCache.get('tasks');
      if (cached != null) {
        setTasks(cached);
        setLoading(false);
        return;
      }
    }
    try {
      const { data, error } = await supabase
        .from('tasks')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;

      const tasks = data || [];
      queryCache.set('tasks', tasks);
      setTasks(tasks);
    } catch (error) {
      console.error('Error fetching tasks:', error);
      setTasks([]);
    } finally {
      setLoading(false);
    }
  };

  const handleClaimTask = async (task) => {
    if (!user) {
      toast.error('Please log in to claim tasks');
      return;
    }

    if (task.assigned_to && task.assigned_to !== user.id) {
      toast.error('This task is already claimed by another user');
      return;
    }

    setClaimingTaskId(task.id);
    try {
      const { error } = await supabase
        .from('tasks')
        .update({ 
          assigned_to: user.id,
          assigned_to_name: user.email,
          status: 'in-progress',
          claimed_at: new Date().toISOString()
        })
        .eq('id', task.id);

      if (error) throw error;

      // Log action to audit trail
      await logAction(supabase, 'task_claimed', {
        task_id: task.id,
        task_name: task.name,
        user_id: user.id,
        user_email: user.email
      }, user.id);

      toast.success('Task claimed successfully!');
      fetchTasks(true);
    } catch (error) {
      console.error('Error claiming task:', error);
      toast.error('Failed to claim task. Please try again.');
    } finally {
      setClaimingTaskId(null);
    }
  };

  const handleStatusChange = async (task, newStatus) => {
    try {
      const { error } = await supabase
        .from('tasks')
        .update({ status: newStatus })
        .eq('id', task.id);

      if (error) throw error;

      // Log action to audit trail
      await logAction(supabase, 'task_status_changed', {
        task_id: task.id,
        task_name: task.name,
        old_status: task.status,
        new_status: newStatus,
        user_id: user.id
      }, user.id);

      toast.success('Task status updated');
      fetchTasks(true);
    } catch (error) {
      console.error('Error updating status:', error);
      toast.error('Failed to update status');
    }
  };

  const getFilteredTasks = () => {
    if (filter === 'my-tasks') {
      return tasks.filter(t => t.assigned_to === user?.id);
    }
    if (filter === 'available') {
      return tasks.filter(t => !t.assigned_to);
    }
    return tasks;
  };

  const canClaim = (task) => {
    return !task.assigned_to && permissions.canClaimTasks(userRole);
  };

  const canUpdateStatus = (task) => {
    return permissions.canUpdateTaskStatus(userRole, task.assigned_to, user?.id);
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'to-do':
        return 'bg-gray-100 text-gray-800';
      case 'in-progress':
        return 'bg-blue-100 text-blue-800';
      case 'review':
        return 'bg-yellow-100 text-yellow-800';
      case 'done':
        return 'bg-green-100 text-green-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-gray-600">Loading tasks...</div>
      </div>
    );
  }

  const filteredTasks = getFilteredTasks();

  return (
    <div className="w-full space-y-4 sm:space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900" style={{ color: PRIMARY }}>Task Assignment Log</h1>
          <p className="mt-1 text-sm text-gray-600">Claim and manage your assigned tasks</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setFilter('all')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              filter === 'all'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            All Tasks
          </button>
          <button
            onClick={() => setFilter('my-tasks')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              filter === 'my-tasks'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            My Tasks
          </button>
          <button
            onClick={() => setFilter('available')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              filter === 'available'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            Available
          </button>
        </div>
      </div>

      {/* Tasks Table */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Task Name
                </th>
                <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Type
                </th>
                <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Assigned To
                </th>
                <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredTasks.length > 0 ? (
                filteredTasks.map((task) => (
                  <tr key={task.id} className="hover:bg-gray-50">
                    <td className="px-4 sm:px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900">{task.name}</div>
                      {task.description && (
                        <div className="text-xs text-gray-500 mt-1">{task.description}</div>
                      )}
                    </td>
                    <td className="px-4 sm:px-6 py-4 whitespace-nowrap">
                      <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                        task.type === 'domain' 
                          ? 'bg-purple-100 text-purple-800'
                          : 'bg-indigo-100 text-indigo-800'
                      }`}>
                        {task.type === 'domain' ? 'Domain' : 'Task'}
                      </span>
                    </td>
                    <td className="px-4 sm:px-6 py-4 whitespace-nowrap">
                      {canUpdateStatus(task) ? (
                        <select
                          value={task.status || 'to-do'}
                          onChange={(e) => handleStatusChange(task, e.target.value)}
                          className={`px-2 py-1 text-xs font-medium rounded-full border-0 ${getStatusColor(task.status || 'to-do')} cursor-pointer`}
                        >
                          {Object.entries(TASK_STATUSES).map(([key, label]) => (
                            <option key={key} value={key}>{label}</option>
                          ))}
                        </select>
                      ) : (
                        <span className={`px-2 py-1 text-xs font-medium rounded-full ${getStatusColor(task.status || 'to-do')}`}>
                          {TASK_STATUSES[task.status] || 'To Do'}
                        </span>
                      )}
                    </td>
                    <td className="px-4 sm:px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {task.assigned_to_name || task.assigned_to || 'Unassigned'}
                    </td>
                    <td className="px-4 sm:px-6 py-4 whitespace-nowrap text-sm font-medium">
                      {canClaim(task) ? (
                        <button
                          onClick={() => handleClaimTask(task)}
                          disabled={claimingTaskId === task.id}
                          className="px-3 py-1 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-xs font-medium"
                        >
                          {claimingTaskId === task.id ? 'Claiming...' : 'Claim'}
                        </button>
                      ) : task.assigned_to ? (
                        <span className="text-xs text-gray-500">Locked</span>
                      ) : (
                        <span className="text-xs text-gray-400">-</span>
                      )}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="5" className="px-4 sm:px-6 py-12 text-center text-sm text-gray-500">
                    {filter === 'available' 
                      ? 'No available tasks at the moment'
                      : filter === 'my-tasks'
                      ? 'You have no assigned tasks'
                      : 'No tasks found'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
