// client/src/pages/Kanban.jsx
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, useDroppable } from '@dnd-kit/core';
import { SortableContext, useSortable, sortableKeyboardCoordinates, arrayMove, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useSupabase } from '../context/supabase.jsx';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { toast } from 'react-hot-toast';
import TicketDetailModal from '../components/TicketDetailModal.jsx';
import { queryCache } from '../utils/queryCache.js';
import { ticketPriorityPill, ticketStatusLabel, ticketStatusPill } from '../utils/uiPills.js';

const PRIMARY = '#6795BE';

function SortableItem({ id, ticket, onTicketClick }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const handleClick = (e) => {
    // Don't open modal if dragging
    if (!isDragging) {
      e.stopPropagation();
      onTicketClick(ticket);
    }
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      onClick={handleClick}
      className="bg-white dark:bg-gray-950 p-3 sm:p-4 rounded-lg border border-gray-200 dark:border-gray-800 shadow-sm hover:shadow-md transition-all"
    >
      <div className="flex items-start justify-between gap-2">
        <button
          type="button"
          {...attributes}
          {...listeners}
          className="shrink-0 mt-0.5 p-1.5 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-900 cursor-grab active:cursor-grabbing"
          aria-label="Drag ticket"
          title="Drag"
          onClick={(e) => e.stopPropagation()}
        >
          <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
            <path d="M7 4a1 1 0 11-2 0 1 1 0 012 0zm0 6a1 1 0 11-2 0 1 1 0 012 0zm0 6a1 1 0 11-2 0 1 1 0 012 0zm8-12a1 1 0 11-2 0 1 1 0 012 0zm0 6a1 1 0 11-2 0 1 1 0 012 0zm0 6a1 1 0 11-2 0 1 1 0 012 0z" />
          </svg>
        </button>
        <h3 className="text-sm font-semibold text-gray-900 mb-1 flex-1 min-w-0">
          <span className="block truncate">{ticket.title}</span>
        </h3>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onTicketClick(ticket);
          }}
          className="shrink-0 p-1.5 rounded-md text-gray-500 hover:text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:text-gray-100 dark:hover:bg-gray-900"
          aria-label="View ticket details"
          title="View details"
        >
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.477 0 8.268 2.943 9.542 7-1.274 4.057-5.065 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
          </svg>
        </button>
      </div>
      {ticket.description && (
        <p className="text-xs text-gray-600 dark:text-gray-300 line-clamp-2 mb-2">
          {ticket.description}
        </p>
      )}
      {ticket.priority && (
        <div className="mt-2">
          <span className={`inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full ${ticketPriorityPill(ticket.priority)}`}>
            {String(ticket.priority).replace(/(^|\s|-)\S/g, (m) => m.toUpperCase())}
          </span>
        </div>
      )}
      <div className="flex items-center justify-between mt-2">
        <span className="text-xs text-gray-500 dark:text-gray-400">
          {new Date(ticket.created_at).toLocaleDateString()}
        </span>
        <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${ticketStatusPill(ticket.status)}`}>
          {ticketStatusLabel(ticket.status)}
        </span>
      </div>
    </div>
  );
}

function KanbanColumn({ column, tickets, onTicketClick }) {
  const { setNodeRef } = useDroppable({
    id: column.id,
  });

  const columnTickets = tickets.filter((t) =>
    column.status === 'open'
      ? t.status === 'open'
      : column.status === 'in-progress'
      ? t.status === 'in-progress'
      : t.status === 'closed'
  );

  return (
    <div
      key={column.id}
      className="flex-1 min-w-[280px] sm:min-w-[320px] bg-gray-50 dark:bg-gray-900/40 rounded-lg border border-gray-200 dark:border-gray-800 p-3 sm:p-4"
      ref={setNodeRef}
    >
      <div className="flex items-center justify-between mb-3 sm:mb-4">
        <h2 className="text-xs sm:text-sm font-semibold text-gray-900 dark:text-gray-100 uppercase tracking-wide">
          {column.title}
        </h2>
        <span className="px-2 py-1 text-xs font-medium bg-white dark:bg-gray-950 rounded-full text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-800">
          {columnTickets.length}
        </span>
      </div>
      <SortableContext items={columnTickets.map((t) => t.id)} strategy={verticalListSortingStrategy}>
        <div className="space-y-2 sm:space-y-3 min-h-[150px] sm:min-h-[200px]">
          {columnTickets.map((ticket) => (
            <SortableItem
              key={ticket.id}
              id={ticket.id}
              ticket={ticket}
              onTicketClick={onTicketClick}
            />
          ))}
          {columnTickets.length === 0 && (
            <div className="text-center py-8 sm:py-12 text-xs sm:text-sm text-gray-400 dark:text-gray-500 border-2 border-dashed border-gray-300 dark:border-gray-700 rounded-lg">
              No tickets
            </div>
          )}
        </div>
      </SortableContext>
    </div>
  );
}

const Kanban = () => {
  const { supabase, userRole } = useSupabase();
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedTicket, setSelectedTicket] = useState(null);
  const [pendingMove, setPendingMove] = useState(null); // { ticketId, fromStatus, toStatus }
  const [confirmMoving, setConfirmMoving] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  useEffect(() => {
    fetchTickets();
  }, [supabase]);

  const fetchTickets = async (bypassCache = false) => {
    if (!bypassCache) {
      const cached = queryCache.get('kanban:tickets');
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
      queryCache.set('kanban:tickets', tickets);
      setTickets(tickets);
    } catch (error) {
      toast.error('Error loading tickets');
      console.error('Error:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDragEnd = async (event) => {
    const { active, over } = event;

    if (!over || active.id === over.id) return;

    const activeId = active.id;
    const overId = over.id;

    const activeTicket = tickets.find((t) => t.id === activeId);
    if (!activeTicket) return;

    // Determine target status:
    // 1) If dropped on a column container, use that column's status.
    // 2) If dropped on another ticket, use that ticket's column/status.
    let targetStatus = activeTicket.status;

    const overColumn = columns.find((col) => col.id === overId);
    if (overColumn) {
      targetStatus = overColumn.status;
    } else {
      const overTicket = tickets.find((t) => t.id === overId);
      if (!overTicket) return;
      const overTicketColumn = columns.find(
        (col) =>
          (col.status === 'open' && overTicket.status === 'open') ||
          (col.status === 'in-progress' && overTicket.status === 'in-progress') ||
          (col.status === 'closed' && overTicket.status === 'closed')
      );
      if (overTicketColumn) {
        targetStatus = overTicketColumn.status;
      }
    }

    // If status changed, update Supabase and local state
    if (targetStatus !== activeTicket.status) {
      setPendingMove({ ticketId: activeId, fromStatus: activeTicket.status, toStatus: targetStatus });
      return;
    }

    // Reorder within same column (or overall list) if status didn't change
    setTickets((items) => {
      const oldIndex = items.findIndex((item) => item.id === activeId);
      const newIndex = items.findIndex((item) => item.id === overId);

      if (oldIndex === -1 || newIndex === -1) return items;
      return arrayMove(items, oldIndex, newIndex);
    });
  };

  const columns = [
    { id: 'todo', title: 'Not Started', status: 'open', color: 'green' },
    { id: 'in-progress', title: 'In Progress', status: 'in-progress', color: 'blue' },
    { id: 'done', title: 'Completed', status: 'closed', color: 'gray' },
  ];

  const statusLabel = (status) => ticketStatusLabel(status);

  const confirmMove = async () => {
    if (!pendingMove?.ticketId || !pendingMove?.toStatus) return;
    setConfirmMoving(true);
    try {
      const { error } = await supabase
        .from('tickets')
        .update({ status: pendingMove.toStatus })
        .eq('id', pendingMove.ticketId);

      if (error) throw error;

      setTickets((prev) =>
        prev.map((t) => (t.id === pendingMove.ticketId ? { ...t, status: pendingMove.toStatus } : t))
      );
      queryCache.invalidate?.('kanban:tickets');
      setPendingMove(null);
    } catch (error) {
      toast.error('Failed to update ticket status');
      console.error('Error:', error);
    } finally {
      setConfirmMoving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-gray-600">Loading kanban board...</div>
      </div>
    );
  }

  return (
    <div className="w-full">
      <div className="mb-4 sm:mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100" style={{ color: PRIMARY }}>Kanban Board</h1>
        <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">Drag and drop tickets to organize your workflow</p>
      </div>
      
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <div className="flex gap-3 sm:gap-6 overflow-x-auto pb-4 -mx-4 sm:mx-0 px-4 sm:px-0">
          {columns.map((column) => (
            <KanbanColumn
              key={column.id}
              column={column}
              tickets={tickets}
              onTicketClick={setSelectedTicket}
            />
          ))}
        </div>
      </DndContext>

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

      {pendingMove &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            className="fixed inset-0 z-[2147483000] bg-black/60 backdrop-blur-sm"
            role="dialog"
            aria-modal="true"
            aria-label="Confirm move ticket"
            onClick={() => (confirmMoving ? null : setPendingMove(null))}
          >
            <div className="min-h-screen w-full p-4 flex items-center justify-center">
              <div
                className="w-full max-w-md rounded-2xl border border-gray-200 bg-white shadow-2xl overflow-hidden"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="px-5 py-4 border-b border-gray-200 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="text-base font-semibold text-gray-900">Confirm move</h2>
                    <p className="mt-1 text-sm text-gray-600">
                      Move this ticket from{' '}
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${ticketStatusPill(pendingMove.fromStatus)}`}>
                        {statusLabel(pendingMove.fromStatus)}
                      </span>{' '}
                      to{' '}
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${ticketStatusPill(pendingMove.toStatus)}`}>
                        {statusLabel(pendingMove.toStatus)}
                      </span>
                      ?
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => (confirmMoving ? null : setPendingMove(null))}
                    className="shrink-0 px-3 py-2 rounded-lg text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 disabled:opacity-60"
                    disabled={confirmMoving}
                    aria-label="Close"
                  >
                    ×
                  </button>
                </div>
                <div className="p-5 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setPendingMove(null)}
                    disabled={confirmMoving}
                    className="px-4 py-2 rounded-lg text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 disabled:opacity-60"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={confirmMove}
                    disabled={confirmMoving}
                    className="px-4 py-2 rounded-lg text-sm font-semibold text-white shadow-sm disabled:opacity-60"
                    style={{ backgroundColor: PRIMARY }}
                  >
                    {confirmMoving ? 'Moving…' : 'Confirm'}
                  </button>
                </div>
              </div>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
};

export default Kanban;