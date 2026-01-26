import { useState, useEffect } from 'react';
import { useSupabase } from '../context/supabase.jsx';
import { toast } from 'react-hot-toast';

export default function TicketDetailModal({ isOpen, onClose, ticket, onUpdate }) {
  const { supabase, user, userRole } = useSupabase();
  const [loading, setLoading] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const [starting, setStarting] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [assignedTo, setAssignedTo] = useState(ticket?.assigned_to || '');
  const [imageError, setImageError] = useState(false);

  useEffect(() => {
    if (isOpen && ticket) {
      setAssignedTo(ticket.assigned_to || '');
      setImageError(false);
    }
  }, [isOpen, ticket?.id, ticket?.assigned_to]);

  const handleAssign = async () => {
    if (!assignedTo.trim()) {
      toast.error('Please enter a name to assign');
      return;
    }

    setAssigning(true);
    try {
      const assignmentName = assignedTo.trim();
      
      // Update the ticket with the assigned name (as text, not requiring user ID)
      // The assigned_to field should accept any text value for naming purposes
      const { data, error } = await supabase
        .from('tickets')
        .update({ assigned_to: assignmentName })
        .eq('id', ticket.id)
        .select();

      if (error) {
        console.error('Assignment error details:', error);
        // Log full error for debugging
        console.error('Full error object:', JSON.stringify(error, null, 2));
        
        // Check if it's a constraint error
        if (error.code === '23503' || error.message?.includes('foreign key')) {
          toast.error('Database constraint error. The assigned_to field may need to be configured as a text field in the database.');
        } else if (error.message) {
          toast.error(`Failed to assign ticket: ${error.message}`);
        } else {
          toast.error('Failed to assign ticket. Please check the console for details.');
        }
        return;
      }

      toast.success(`Ticket assigned to ${assignmentName} successfully`);
      // Update local ticket state
      if (data && data[0]) {
        ticket.assigned_to = data[0].assigned_to;
      } else {
        ticket.assigned_to = assignmentName;
      }
      if (onUpdate) onUpdate();
    } catch (error) {
      console.error('Unexpected error assigning ticket:', error);
      toast.error('Failed to assign ticket. Please try again.');
    } finally {
      setAssigning(false);
    }
  };

  const handleDelete = async () => {
    if (!window.confirm('Are you sure you want to delete this ticket? This action cannot be undone.')) {
      return;
    }

    setDeleting(true);
    try {
      const { error } = await supabase
        .from('tickets')
        .delete()
        .eq('id', ticket.id);

      if (error) throw error;

      toast.success('Ticket deleted successfully');
      if (onUpdate) onUpdate();
      onClose();
    } catch (error) {
      toast.error('Failed to delete ticket');
      console.error('Error:', error);
    } finally {
      setDeleting(false);
    }
  };

  const handleStart = async () => {
    const currentAssignedTo = assignedTo || ticket.assigned_to;
    if (!currentAssignedTo) {
      toast.error('Please assign the ticket to someone first');
      return;
    }

    setStarting(true);
    try {
      const { error } = await supabase
        .from('tickets')
        .update({ status: 'in-progress' })
        .eq('id', ticket.id);

      if (error) throw error;

      toast.success('Ticket started successfully');
      ticket.status = 'in-progress';
      if (onUpdate) onUpdate();
    } catch (error) {
      toast.error('Failed to start ticket');
      console.error('Error:', error);
    } finally {
      setStarting(false);
    }
  };

  const handleComplete = async () => {
    setCompleting(true);
    try {
      const { error } = await supabase
        .from('tickets')
        .update({ status: 'closed' })
        .eq('id', ticket.id);

      if (error) throw error;

      toast.success('Ticket marked as completed');
      if (onUpdate) onUpdate();
      ticket.status = 'closed';
    } catch (error) {
      toast.error('Failed to complete ticket');
      console.error('Error:', error);
    } finally {
      setCompleting(false);
    }
  };

  const getUrgencyColor = (urgency) => {
    switch (urgency) {
      case 'critical':
        return 'bg-red-100 text-red-800';
      case 'high':
        return 'bg-orange-100 text-orange-800';
      case 'normal':
        return 'bg-blue-100 text-blue-800';
      case 'low':
        return 'bg-gray-100 text-gray-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'open':
        return 'bg-green-100 text-green-800';
      case 'in-progress':
        return 'bg-blue-100 text-blue-800';
      case 'closed':
        return 'bg-gray-100 text-gray-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  if (!isOpen || !ticket) return null;

  const currentAssignedTo = assignedTo || ticket.assigned_to;
  const canAssign = userRole === 'admin' || userRole === 'lead';
  const canStart = canAssign && ticket.status === 'open' && currentAssignedTo;
  const canComplete = (canAssign || currentAssignedTo) && ticket.status === 'in-progress';
  const canDelete = userRole === 'admin' && ticket.status === 'closed';

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto" onClick={onClose}>
      <div className="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:block sm:p-0">
        <div className="fixed inset-0 transition-opacity bg-gray-500 bg-opacity-75" onClick={onClose}></div>

        <div
          className="inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-4xl sm:w-full"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="bg-gradient-to-r from-blue-600 to-indigo-600 px-4 sm:px-6 py-4 sm:py-5">
            <div className="flex items-center justify-between">
              <h3 className="text-lg sm:text-xl font-bold text-white">Ticket Details</h3>
              <button
                onClick={onClose}
                className="text-white hover:text-gray-200 transition-colors"
              >
                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>

          {/* Content */}
          <div className="px-4 sm:px-6 py-4 sm:py-6 max-h-[calc(100vh-200px)] overflow-y-auto">
            <div className="space-y-4 sm:space-y-6">
              {/* Title and Status */}
              <div>
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-3">
                  <h2 className="text-xl sm:text-2xl font-bold text-gray-900">{ticket.title}</h2>
                  <div className="flex flex-wrap gap-2">
                    <span className={`px-3 py-1 rounded-full text-xs sm:text-sm font-medium ${getStatusColor(ticket.status)}`}>
                      {ticket.status === 'open' ? 'Open' : ticket.status === 'in-progress' ? 'In Progress' : 'Closed'}
                    </span>
                    {ticket.priority && (
                      <span className={`px-3 py-1 rounded-full text-xs sm:text-sm font-medium ${getUrgencyColor(ticket.priority)}`}>
                        {ticket.priority.charAt(0).toUpperCase() + ticket.priority.slice(1)}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Assignment Section */}
              {canAssign && (
                <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Assign To
                  </label>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <input
                      type="text"
                      value={assignedTo}
                      onChange={(e) => setAssignedTo(e.target.value)}
                      placeholder="Enter assignee name..."
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-sm"
                    />
                    <button
                      onClick={handleAssign}
                      disabled={assigning || !assignedTo.trim()}
                      className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm font-medium"
                    >
                      {assigning ? 'Assigning...' : 'Assign'}
                    </button>
                  </div>
                  {currentAssignedTo && (
                    <p className="mt-2 text-sm text-gray-600">
                      Currently assigned to: <span className="font-medium">{currentAssignedTo}</span>
                    </p>
                  )}
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex flex-wrap gap-2">
                {canStart && (
                  <button
                    onClick={handleStart}
                    disabled={starting}
                    className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm font-medium"
                  >
                    {starting ? 'Starting...' : 'Start Ticket'}
                  </button>
                )}
                {canComplete && (
                  <button
                    onClick={handleComplete}
                    disabled={completing}
                    className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm font-medium"
                  >
                    {completing ? 'Completing...' : 'Mark as Done'}
                  </button>
                )}
                {canDelete && (
                  <button
                    onClick={handleDelete}
                    disabled={deleting}
                    className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm font-medium"
                  >
                    {deleting ? 'Deleting...' : 'Delete Ticket'}
                  </button>
                )}
              </div>

              {/* Ticket Information Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                    Reported By
                  </label>
                  <p className="text-sm text-gray-900">{ticket.reporter_name || 'N/A'}</p>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                    Department
                  </label>
                  <p className="text-sm text-gray-900">{ticket.department || 'N/A'}</p>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                    Affected System
                  </label>
                  <p className="text-sm text-gray-900">{ticket.affected_system || 'N/A'}</p>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                    Created Date
                  </label>
                  <p className="text-sm text-gray-900">
                    {ticket.created_at ? new Date(ticket.created_at).toLocaleString() : 'N/A'}
                  </p>
                </div>
                {ticket.assigned_to && (
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                      Assigned To
                    </label>
                    <p className="text-sm text-gray-900">{ticket.assigned_to}</p>
                  </div>
                )}
              </div>

              {/* Description */}
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                  Description
                </label>
                <p className="text-sm text-gray-900 whitespace-pre-wrap">{ticket.description || 'No description provided'}</p>
              </div>

              {/* Screenshot */}
              {ticket.screenshot_url && (
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                    Screenshot / Evidence
                  </label>
                  <div className="mt-2">
                    {!imageError ? (
                      <img
                        src={ticket.screenshot_url}
                        alt="Ticket screenshot"
                        className="max-w-full h-auto rounded-lg border border-gray-200 shadow-sm"
                        onError={() => setImageError(true)}
                        loading="lazy"
                      />
                    ) : (
                      <div className="p-4 bg-gray-100 rounded-lg border border-gray-200 text-sm text-gray-600">
                        Failed to load image. The image may have been deleted or the URL is invalid.
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Footer */}
          <div className="bg-gray-50 px-4 sm:px-6 py-3 sm:py-4 flex justify-end">
            <button
              onClick={onClose}
              className="px-4 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300 transition-colors text-sm font-medium"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
