import { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useSupabase } from '../context/supabase.jsx';
import { toast } from 'react-hot-toast';
import { getRoleDisplayName, permissions } from '../utils/rolePermissions.js';
import { ticketPriorityPill, ticketStatusLabel, ticketStatusPill } from '../utils/uiPills.js';

function normalizeRoleKey(role) {
  return String(role || 'intern')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_');
}

function matchAssigneeTextToUserId(assignedText, users) {
  if (!assignedText || !String(assignedText).trim()) return '';
  const raw = String(assignedText).trim();
  const lower = raw.toLowerCase();
  for (const u of users) {
    const fn = (u.full_name || '').trim();
    const em = (u.email || '').trim().toLowerCase();
    if (em && lower === em) return u.id;
    if (fn && fn.toLowerCase() === lower) return u.id;
  }
  return '';
}

function displayNameForUser(u) {
  if (!u) return '';
  return (u.full_name || '').trim() || (u.email || '').trim() || '';
}

function assigneeGroupLabel(roleKey) {
  if (roleKey === 'monitoring') return getRoleDisplayName('monitoring_team');
  return getRoleDisplayName(roleKey);
}

export default function TicketDetailModal({ isOpen, onClose, ticket, onUpdate }) {
  const { supabase, userRole } = useSupabase();
  const [assigning, setAssigning] = useState(false);
  const [starting, setStarting] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [assignableUsers, setAssignableUsers] = useState([]);
  const [assignUsersLoading, setAssignUsersLoading] = useState(false);
  const [selectedAssigneeId, setSelectedAssigneeId] = useState('');
  const [imageError, setImageError] = useState(false);

  useEffect(() => {
    if (!isOpen || !ticket) return;
    setImageError(false);
  }, [isOpen, ticket?.id]);

  useEffect(() => {
    if (!isOpen || !supabase) return;
    let cancelled = false;
    setAssignUsersLoading(true);
    (async () => {
      const { data, error } = await supabase
        .from('users')
        .select('id, email, full_name, role, team')
        .order('full_name', { ascending: true });
      if (cancelled) return;
      if (error) {
        console.warn('TicketDetailModal: users fetch error', error);
        setAssignableUsers([]);
      } else {
        setAssignableUsers(Array.isArray(data) ? data : []);
      }
      setAssignUsersLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [isOpen, supabase]);

  useEffect(() => {
    if (!isOpen || !ticket) return;
    const id = matchAssigneeTextToUserId(ticket.assigned_to, assignableUsers);
    setSelectedAssigneeId(id);
  }, [isOpen, ticket?.id, ticket?.assigned_to, assignableUsers]);

  const assigneeGroups = useMemo(() => {
    const roleOrder = [
      'superadmin',
      'admin',
      'tla',
      'lead',
      'tl',
      'vtl',
      'monitoring_team',
      'monitoring',
      'pat1',
      'intern',
    ];
    const byRole = new Map();
    for (const u of assignableUsers) {
      const r = normalizeRoleKey(u.role);
      if (!byRole.has(r)) byRole.set(r, []);
      byRole.get(r).push(u);
    }
    for (const list of byRole.values()) {
      list.sort((a, b) =>
        displayNameForUser(a).localeCompare(displayNameForUser(b), undefined, { sensitivity: 'base' })
      );
    }
    const seen = new Set();
    const out = [];
    for (const r of roleOrder) {
      if (byRole.has(r)) {
        out.push({ roleKey: r, users: byRole.get(r) });
        seen.add(r);
      }
    }
    for (const r of [...byRole.keys()].sort()) {
      if (!seen.has(r)) out.push({ roleKey: r, users: byRole.get(r) });
    }
    return out;
  }, [assignableUsers]);

  const resolvedAssigneeDisplay = useMemo(() => {
    if (selectedAssigneeId) {
      const u = assignableUsers.find((x) => String(x.id) === String(selectedAssigneeId));
      if (u) return displayNameForUser(u);
    }
    return (ticket?.assigned_to || '').trim();
  }, [selectedAssigneeId, assignableUsers, ticket?.assigned_to]);

  const legacyAssigneeUnknown =
    !!(ticket?.assigned_to && String(ticket.assigned_to).trim() && !selectedAssigneeId && assignableUsers.length > 0);

  const handleAssign = async () => {
    setAssigning(true);
    try {
      let assignmentName = null;
      if (selectedAssigneeId) {
        const u = assignableUsers.find((x) => String(x.id) === String(selectedAssigneeId));
        assignmentName = u ? displayNameForUser(u) || null : null;
      }

      const { data, error } = await supabase
        .from('tickets')
        .update({ assigned_to: assignmentName })
        .eq('id', ticket.id)
        .select();

      if (error) {
        console.error('Assignment error details:', error);
        const msg = String(error.message || '').toLowerCase();
        if (error.code === '23503' || msg.includes('foreign key')) {
          toast.error(
            'Database constraint error. The assigned_to field may need to be configured as a text field in the database.'
          );
        } else if (msg.includes("could not find") && msg.includes("'assigned_to'") && msg.includes('tickets')) {
          toast.error(
            "Ticket assignment failed because the 'assigned_to' column does not exist in the tickets table. " +
              'Ask an admin to run supabase/tickets_add_assigned_to_column.sql in Supabase, then try again.'
          );
        } else if (error.message) {
          toast.error(`Failed to assign ticket: ${error.message}`);
        } else {
          toast.error('Failed to assign ticket. Please check the console for details.');
        }
        return;
      }

      if (assignmentName) {
        toast.success(`Ticket assigned to ${assignmentName}`);
      } else {
        toast.success('Assignment cleared');
      }
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
    if (!resolvedAssigneeDisplay) {
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

  const getUrgencyColor = (urgency) => ticketPriorityPill(urgency);

  const getStatusColor = (status) => {
    return ticketStatusPill(status);
  };

  if (!isOpen || !ticket) return null;

  const currentAssignedTo = resolvedAssigneeDisplay;
  const canAssign = permissions.canAssignTickets(userRole);
  const canStart = canAssign && ticket.status === 'open' && currentAssignedTo;
  const canComplete = (canAssign || currentAssignedTo) && ticket.status === 'in-progress';
  const canDelete = permissions.canDeleteTickets(userRole) && ticket.status === 'closed';
  const canResolve = permissions.canResolveIssues(userRole, ticket.department);

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div className="fixed inset-0 z-[2147483000] overflow-y-auto">
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-sm"
        aria-hidden="true"
        onClick={onClose}
      />
      <div className="min-h-screen p-4 flex items-center justify-center">
        <div
          className="relative w-full max-w-4xl bg-white dark:bg-gray-900 rounded-2xl text-left overflow-hidden shadow-2xl border border-gray-200 dark:border-gray-800"
          onClick={(e) => e.stopPropagation()}
          role="dialog"
          aria-modal="true"
          aria-label="Ticket Details"
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
                  <h2 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-gray-100">{ticket.title}</h2>
                  <div className="flex flex-wrap gap-2">
                    <span className={`px-3 py-1 rounded-full text-xs sm:text-sm font-medium ${getStatusColor(ticket.status)}`}>
                      {ticketStatusLabel(ticket.status)}
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
              {(canAssign || canResolve) && (
                <div className="bg-gray-50 dark:bg-gray-950/40 rounded-lg p-4 border border-gray-200 dark:border-gray-800">
                  <label htmlFor="ticket-assignee-select" className="block text-sm font-semibold text-gray-700 dark:text-gray-200 mb-2">
                    Assign to (staff)
                  </label>
                  <p className="text-xs text-gray-600 dark:text-gray-400 mb-2">
                    Choose a user by role. The ticket stores their display name (same as before for reporting).
                  </p>
                  <div className="flex flex-col sm:flex-row gap-2 sm:items-stretch">
                    <select
                      id="ticket-assignee-select"
                      value={selectedAssigneeId}
                      onChange={(e) => setSelectedAssigneeId(e.target.value)}
                      disabled={assignUsersLoading || assigning}
                      className="flex-1 min-w-0 px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-900 text-sm text-gray-900 dark:text-gray-100 disabled:opacity-60"
                    >
                      <option value="">{assignUsersLoading ? 'Loading users…' : 'Unassigned'}</option>
                      {assigneeGroups.map(({ roleKey, users: groupUsers }) => (
                        <optgroup key={roleKey} label={assigneeGroupLabel(roleKey)}>
                          {groupUsers.map((u) => (
                            <option key={u.id} value={u.id}>
                              {(u.full_name || '').trim() || 'Unnamed'}
                            </option>
                          ))}
                        </optgroup>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={handleAssign}
                      disabled={assigning || assignUsersLoading}
                      className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm font-medium shrink-0"
                    >
                      {assigning ? 'Saving…' : 'Save assignment'}
                    </button>
                  </div>
                  {legacyAssigneeUnknown && (
                    <p className="mt-2 text-xs text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-md px-2 py-1.5">
                      Stored assignee &quot;{ticket.assigned_to}&quot; does not match a user in the directory. Pick someone
                      above to replace it, or save as Unassigned to clear.
                    </p>
                  )}
                  {currentAssignedTo && (
                    <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">
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
                {canResolve && ticket.status !== 'closed' && (
                  <button
                    onClick={handleComplete}
                    disabled={completing}
                    className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm font-medium"
                  >
                    {completing ? 'Resolving...' : 'Resolve Issue'}
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
                  <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">
                    Reported By
                  </label>
                  <p className="text-sm text-gray-900 dark:text-gray-100">{ticket.reporter_name || 'N/A'}</p>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">
                    Department
                  </label>
                  <p className="text-sm text-gray-900 dark:text-gray-100">{ticket.department || 'N/A'}</p>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">
                    Affected System
                  </label>
                  <p className="text-sm text-gray-900 dark:text-gray-100">{ticket.affected_system || 'N/A'}</p>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">
                    Created Date
                  </label>
                  <p className="text-sm text-gray-900 dark:text-gray-100">
                    {ticket.created_at ? new Date(ticket.created_at).toLocaleString() : 'N/A'}
                  </p>
                </div>
                {ticket.assigned_to && (
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">
                      Assigned To
                    </label>
                    <p className="text-sm text-gray-900 dark:text-gray-100">{ticket.assigned_to}</p>
                  </div>
                )}
              </div>

              {/* Description */}
              <div>
                <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
                  Description
                </label>
                <p className="text-sm text-gray-900 dark:text-gray-100 whitespace-pre-wrap">{ticket.description || 'No description provided'}</p>
              </div>

              {/* Screenshot */}
              {ticket.screenshot_url && (
                <div>
                  <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
                    Screenshot / Evidence
                  </label>
                  <div className="mt-2">
                    {!imageError ? (
                      <img
                        src={ticket.screenshot_url}
                        alt="Ticket screenshot"
                        className="max-w-full h-auto rounded-lg border border-gray-200 dark:border-gray-800 shadow-sm"
                        onError={() => setImageError(true)}
                        loading="lazy"
                      />
                    ) : (
                      <div className="p-4 bg-gray-100 dark:bg-gray-950/40 rounded-lg border border-gray-200 dark:border-gray-800 text-sm text-gray-600 dark:text-gray-300">
                        Failed to load image. The image may have been deleted or the URL is invalid.
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Footer */}
          <div className="bg-gray-50 dark:bg-gray-950/40 px-4 sm:px-6 py-3 sm:py-4 flex justify-end border-t border-gray-100 dark:border-gray-800">
            <button
              onClick={onClose}
              className="px-4 py-2 bg-gray-200 dark:bg-gray-800 text-gray-800 dark:text-gray-100 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-700 transition-colors text-sm font-medium"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
