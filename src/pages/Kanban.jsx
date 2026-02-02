// client/src/pages/Kanban.jsx
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext, useSortable, sortableKeyboardCoordinates, arrayMove, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useSupabase } from '../context/supabase.jsx';
import { useEffect, useState } from 'react';
import { toast } from 'react-hot-toast';
import TicketDetailModal from '../components/TicketDetailModal.jsx';
import { queryCache } from '../utils/queryCache.js';

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
      {...attributes}
      {...listeners}
      onClick={handleClick}
      className="bg-white p-3 sm:p-4 rounded-lg border border-gray-200 shadow-sm hover:shadow-md transition-all cursor-grab active:cursor-grabbing"
    >
      <h3 className="text-sm font-semibold text-gray-900 mb-1">
        {ticket.title}
      </h3>
      {ticket.description && (
        <p className="text-xs text-gray-600 line-clamp-2 mb-2">
          {ticket.description}
        </p>
      )}
      <div className="flex items-center justify-between mt-2">
        <span className="text-xs text-gray-500">
          {new Date(ticket.created_at).toLocaleDateString()}
        </span>
        <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${
          ticket.status === 'open' ? 'bg-green-100 text-green-800' :
          ticket.status === 'in-progress' ? 'bg-blue-100 text-blue-800' :
          'bg-gray-100 text-gray-800'
        }`}>
          {ticket.status}
        </span>
      </div>
    </div>
  );
}

const Kanban = () => {
  const { supabase, userRole } = useSupabase();
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedTicket, setSelectedTicket] = useState(null);

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

    const activeTicket = tickets.find(t => t.id === active.id);
    const overTicket = tickets.find(t => t.id === over.id);

    if (!activeTicket || !overTicket) return;

    // Determine target status based on column
    let targetStatus = activeTicket.status;
    const activeColumn = columns.find(col => {
      const colTickets = tickets.filter(t => 
        col.status === 'open' ? t.status === 'open' :
        col.status === 'in-progress' ? t.status === 'in-progress' :
        t.status === 'closed'
      );
      return colTickets.some(t => t.id === active.id);
    });

    const overColumn = columns.find(col => {
      const colTickets = tickets.filter(t => 
        col.status === 'open' ? t.status === 'open' :
        col.status === 'in-progress' ? t.status === 'in-progress' :
        t.status === 'closed'
      );
      return colTickets.some(t => t.id === over.id);
    });

    if (activeColumn && overColumn && activeColumn.id !== overColumn.id) {
      // Move ticket to different column
      targetStatus = overColumn.status;
      
      // Update in database
      try {
        const { error } = await supabase
          .from('tickets')
          .update({ status: targetStatus })
          .eq('id', active.id);

        if (error) throw error;

        setTickets(prevTickets => 
          prevTickets.map(ticket => 
            ticket.id === active.id 
              ? { ...ticket, status: targetStatus }
              : ticket
          )
        );
      } catch (error) {
        toast.error('Failed to update ticket status');
        console.error('Error:', error);
      }
    } else {
      // Reorder within same column
      setTickets((items) => {
        const oldIndex = items.findIndex(item => item.id === active.id);
        const newIndex = items.findIndex(item => item.id === over.id);
        
        return arrayMove(items, oldIndex, newIndex);
      });
    }
  };

  const columns = [
    { id: 'todo', title: 'To Do', status: 'open', color: 'green' },
    { id: 'in-progress', title: 'In Progress', status: 'in-progress', color: 'blue' },
    { id: 'done', title: 'Done', status: 'closed', color: 'gray' },
  ];

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
        <h1 className="text-2xl font-bold text-gray-900" style={{ color: PRIMARY }}>Kanban Board</h1>
        <p className="mt-1 text-sm text-gray-600">Drag and drop tickets to organize your workflow</p>
      </div>
      
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <div className="flex gap-3 sm:gap-6 overflow-x-auto pb-4 -mx-4 sm:mx-0 px-4 sm:px-0">
          {columns.map((column) => {
            const columnTickets = tickets.filter(t => 
              column.status === 'open' ? t.status === 'open' :
              column.status === 'in-progress' ? t.status === 'in-progress' :
              t.status === 'closed'
            );
            
            return (
              <div key={column.id} className="flex-1 min-w-[280px] sm:min-w-[320px] bg-gray-50 rounded-lg border border-gray-200 p-3 sm:p-4">
                <div className="flex items-center justify-between mb-3 sm:mb-4">
                  <h2 className="text-xs sm:text-sm font-semibold text-gray-900 uppercase tracking-wide">
                    {column.title}
                  </h2>
                  <span className="px-2 py-1 text-xs font-medium bg-white rounded-full text-gray-600 border border-gray-200">
                    {columnTickets.length}
                  </span>
                </div>
                <SortableContext
                  items={columnTickets.map(t => t.id)}
                  strategy={verticalListSortingStrategy}
                >
                  <div className="space-y-2 sm:space-y-3 min-h-[150px] sm:min-h-[200px]">
                    {columnTickets.map((ticket) => (
                      <SortableItem
                        key={ticket.id}
                        id={ticket.id}
                        ticket={ticket}
                        onTicketClick={setSelectedTicket}
                      />
                    ))}
                    {columnTickets.length === 0 && (
                      <div className="text-center py-8 sm:py-12 text-xs sm:text-sm text-gray-400 border-2 border-dashed border-gray-300 rounded-lg">
                        No tickets
                      </div>
                    )}
                  </div>
                </SortableContext>
              </div>
            );
          })}
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
    </div>
  );
};

export default Kanban;