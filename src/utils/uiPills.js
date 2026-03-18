// Centralized Tailwind pill styles for consistent status/priority UI

export function ticketStatusPill(status) {
  const s = String(status || '').toLowerCase();
  if (s === 'open') return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200';
  if (s === 'in-progress' || s === 'in progress') return 'bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-200';
  if (s === 'review') return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-200';
  if (s === 'closed' || s === 'completed')
    return 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200';
  if (s === 'cancelled' || s === 'canceled')
    return 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200';
  return 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200';
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
  if (p === 'critical') return 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200';
  if (p === 'high') return 'bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-200';
  if (p === 'normal') return 'bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-200';
  if (p === 'low') return 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200';
  return 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200';
}

export function requestStatusPill(status) {
  const s = String(status || '').toLowerCase();
  if (s === 'approved') return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200';
  if (s === 'rejected') return 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200';
  if (s === 'pending') return 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200';
  return 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200';
}

// Task Assignment Log style mappings
export function taskStatusPill(status) {
  const s = String(status || '').toLowerCase();
  if (s === 'to-do' || s === 'todo')
    return 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200';
  if (s === 'in-progress' || s === 'in progress')
    return 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200';
  if (s === 'review')
    return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-200';
  if (s === 'done')
    return 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200';
  if (s === 'cancelled' || s === 'canceled')
    return 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200';
  return 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200';
}

export function taskPriorityPill(priority) {
  const p = String(priority || '').toLowerCase();
  if (p === 'high') return 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200';
  if (p === 'medium') return 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200';
  if (p === 'low') return 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-200';
  return 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-200';
}

