import { Suspense, lazy, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useSupabase } from '../context/supabase.jsx';

const PRIMARY = '#6795BE';

const TaskAssignmentLog = lazy(() => import('./TaskAssignmentLog.jsx'));
const MonitoringTasks = lazy(() => import('./MonitoringTasks.jsx'));

function PageFallback() {
  return (
    <div className="flex items-center justify-center py-12" aria-hidden="true">
      <div className="animate-spin rounded-full h-8 w-8 border-2 border-[#6795BE] border-t-transparent" />
    </div>
  );
}

export default function AdminTasks() {
  const { userRole } = useSupabase();
  const [searchParams, setSearchParams] = useSearchParams();

  const active = (searchParams.get('admin_tasks_tab') || 'tla').toLowerCase();
  const isAdmin = userRole === 'admin';

  const nextSearchParams = useMemo(() => {
    const sp = new URLSearchParams(searchParams);
    return sp;
  }, [searchParams]);

  if (!isAdmin) {
    // Defensive: route guard is in App.jsx, but keep this safe.
    return null;
  }

  const setTab = (tab) => {
    const sp = new URLSearchParams(nextSearchParams);
    sp.set('admin_tasks_tab', tab);
    setSearchParams(sp, { replace: true });
  };

  return (
    <div className="w-full space-y-4 sm:space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900" style={{ color: PRIMARY }}>
            Tasks
          </h1>
          <p className="mt-1 text-sm text-gray-600">
            Admin view: switch between TLA and Monitoring tasks.
          </p>
        </div>

        <div className="flex gap-2 border border-gray-200 bg-white rounded-lg p-1 shadow-sm">
          <button
            type="button"
            onClick={() => setTab('tla')}
            className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
              active !== 'monitoring' ? 'text-white' : 'text-gray-700 hover:bg-gray-100'
            }`}
            style={active !== 'monitoring' ? { backgroundColor: PRIMARY } : {}}
          >
            TLA Tasks
          </button>
          <button
            type="button"
            onClick={() => setTab('monitoring')}
            className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
              active === 'monitoring' ? 'text-white' : 'text-gray-700 hover:bg-gray-100'
            }`}
            style={active === 'monitoring' ? { backgroundColor: PRIMARY } : {}}
          >
            Monitoring Tasks
          </button>
        </div>
      </div>

      <Suspense fallback={<PageFallback />}>
        {active === 'monitoring' ? <MonitoringTasks embedded /> : <TaskAssignmentLog />}
      </Suspense>
    </div>
  );
}

