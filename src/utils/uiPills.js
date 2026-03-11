// Centralized Tailwind pill styles for consistent status/priority UI

export function ticketStatusPill(status) {
  const s = String(status || '').toLowerCase();
  if (s === 'open') return 'bg-emerald-100 text-emerald-800';
  if (s === 'in-progress' || s === 'in progress') return 'bg-sky-100 text-sky-800';
  if (s === 'review') return 'bg-yellow-100 text-yellow-800';
  if (s === 'closed' || s === 'completed') return 'bg-gray-100 text-gray-800';
  if (s === 'cancelled' || s === 'canceled') return 'bg-red-100 text-red-800';
  return 'bg-gray-100 text-gray-800';
}

export function ticketStatusLabel(status) {
  const s = String(status || '').toLowerCase();
  if (s === 'open' || s === 'to-do' || s === 'todo') return 'Not Started';
  if (s === 'in-progress' || s === 'in progress') return 'In Progress';
  if (s === 'review') return 'Review';
  if (s === 'closed' || s === 'completed' || s === 'done') return 'Completed';
  if (s === 'cancelled' || s === 'canceled') return 'Cancelled';
  return status || 'Not Started';
}

export function ticketPriorityPill(priority) {
  const p = String(priority || '').toLowerCase();
  if (p === 'critical') return 'bg-red-100 text-red-800';
  if (p === 'high') return 'bg-orange-100 text-orange-800';
  if (p === 'normal') return 'bg-sky-100 text-sky-800';
  if (p === 'low') return 'bg-gray-100 text-gray-800';
  return 'bg-gray-100 text-gray-800';
}

export function requestStatusPill(status) {
  const s = String(status || '').toLowerCase();
  if (s === 'approved') return 'bg-emerald-100 text-emerald-800';
  if (s === 'rejected') return 'bg-red-100 text-red-800';
  if (s === 'pending') return 'bg-amber-100 text-amber-800';
  return 'bg-gray-100 text-gray-800';
}

// Task Assignment Log style mappings
export function taskStatusPill(status) {
  const s = String(status || '').toLowerCase();
  if (s === 'to-do' || s === 'todo') return 'bg-gray-100 text-gray-800';
  if (s === 'in-progress' || s === 'in progress') return 'bg-blue-100 text-blue-800';
  if (s === 'review') return 'bg-yellow-100 text-yellow-800';
  if (s === 'done') return 'bg-green-100 text-green-800';
  if (s === 'cancelled' || s === 'canceled') return 'bg-red-100 text-red-800';
  return 'bg-gray-100 text-gray-800';
}

export function taskPriorityPill(priority) {
  const p = String(priority || '').toLowerCase();
  if (p === 'high') return 'bg-red-100 text-red-800';
  if (p === 'medium') return 'bg-amber-100 text-amber-800';
  if (p === 'low') return 'bg-gray-100 text-gray-700';
  return 'bg-gray-100 text-gray-700';
}

