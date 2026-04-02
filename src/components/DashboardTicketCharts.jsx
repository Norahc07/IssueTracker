import React, { useMemo } from 'react';

const STATUS_META = {
  open: { label: 'Open', shortLabel: 'OPEN', color: '#3B82F6' }, // blue-500
  'in-progress': { label: 'In Progress', shortLabel: 'IN PROGRESS', color: '#8B5CF6' }, // violet-500
  closed: { label: 'Completed', shortLabel: 'COMPLETE', color: '#6B7280' }, // gray-500
};

const PRIORITY_ROWS = [
  { key: 'critical', label: 'Critical' },
  { key: 'high', label: 'High' },
  { key: 'normal', label: 'Normal' },
  { key: 'low', label: 'Low' },
];

const STATUS_KEYS = ['open', 'in-progress', 'closed'];

function normalizeTicketStatus(raw) {
  const s = String(raw || '').toLowerCase().trim();
  if (s === 'open') return 'open';
  if (s === 'in-progress' || s === 'in progress' || s === 'review') return 'in-progress';
  if (s === 'closed' || s === 'completed' || s === 'done') return 'closed';
  return null;
}

function normalizeTicketPriority(raw) {
  const p = String(raw || '').toLowerCase().trim();
  if (['critical', 'high', 'normal', 'low'].includes(p)) return p;
  if (p === 'medium') return 'normal';
  return 'normal';
}

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function formatDayLabel(d) {
  return d.toLocaleDateString('en-US', { month: 'short', day: '2-digit' });
}

function ymd(d) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function safeDate(value) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function formatDurationDays(hours) {
  const h = Number(hours) || 0;
  const days = h / 24;
  if (days >= 1) return `${days.toFixed(2)} days`;
  return `${h.toFixed(1)} hrs`;
}

function Donut({ segments, size = 120, stroke = 12 }) {
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const total = segments.reduce((acc, s) => acc + s.value, 0) || 0;

  let offset = 0;
  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      role="img"
      aria-label="Ticket status distribution chart"
      className="text-gray-200 dark:text-gray-700"
    >
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="currentColor"
        strokeWidth={stroke}
      />
      {segments.map((s) => {
        const frac = total > 0 ? s.value / total : 0;
        const dash = frac * circumference;
        const dashArray = `${dash} ${circumference - dash}`;
        const dashOffset = -offset;
        offset += dash;
        return (
          <circle
            key={s.key}
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={s.color}
            strokeWidth={stroke}
            strokeDasharray={dashArray}
            strokeDashoffset={dashOffset}
            strokeLinecap="butt"
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
          />
        );
      })}
      <text
        x="50%"
        y="47%"
        textAnchor="middle"
        fontSize="18"
        fontWeight="700"
        fill="currentColor"
        className="text-gray-900 dark:text-gray-100"
      >
        {total}
      </text>
      <text
        x="50%"
        y="61%"
        textAnchor="middle"
        fontSize="10"
        fill="currentColor"
        className="text-gray-500 dark:text-gray-400"
      >
        tickets
      </text>
    </svg>
  );
}

function MiniBars({ days }) {
  const max = Math.max(1, ...days.map((d) => Math.max(d.created, d.completed)));
  const totalCreated = days.reduce((acc, d) => acc + (d.created || 0), 0);
  const totalCompleted = days.reduce((acc, d) => acc + (d.completed || 0), 0);
  const yTicks = [max, Math.max(0, Math.round(max / 2)), 0];

  return (
    <div className="w-full h-full flex flex-col">
      <div className="flex-1 rounded-xl border border-gray-200 dark:border-gray-800 bg-gray-50/60 dark:bg-gray-950/40 p-2 flex flex-col min-h-0">
        <div className="flex-1 min-h-0 rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 px-2 py-2 flex flex-col">
          <div className="grid grid-cols-[2rem_1fr] gap-2 h-full">
            <div className="flex flex-col justify-between text-[10px] text-gray-400 dark:text-gray-500">
              {yTicks.map((v) => (
                <span key={v} className="leading-none">{v}</span>
              ))}
            </div>
            <div className="overflow-x-auto">
              <div className="min-w-[520px] h-full flex flex-col">
                <div
                  className="relative flex-1 grid items-end gap-1.5 min-h-[160px]"
                  style={{ gridTemplateColumns: `repeat(${Math.max(days.length, 1)}, minmax(0, 1fr))` }}
                >
                  <div
                    className="absolute inset-0 pointer-events-none opacity-60 dark:opacity-30"
                    style={{
                      backgroundImage: 'linear-gradient(to bottom, rgba(229,231,235,0.9) 1px, transparent 1px)',
                      backgroundSize: '100% 33.33%',
                    }}
                  />
                  {days.map((d) => {
                    const createdH = clamp(Math.round((d.created / max) * 100), 0, 100);
                    const completedH = clamp(Math.round((d.completed / max) * 100), 0, 100);
                    return (
                      <div key={d.key} className="relative z-10 flex items-end justify-center gap-1">
                        <div
                          className="w-2.5 sm:w-3 rounded-t bg-blue-500/85"
                          style={{ height: `${createdH}%` }}
                          title={`${d.label}: Created ${d.created}`}
                        />
                        <div
                          className="w-2.5 sm:w-3 rounded-t bg-gray-500/80"
                          style={{ height: `${completedH}%` }}
                          title={`${d.label}: Completed ${d.completed}`}
                        />
                      </div>
                    );
                  })}
                </div>
                <div
                  className="mt-2 grid gap-1.5"
                  style={{ gridTemplateColumns: `repeat(${Math.max(days.length, 1)}, minmax(0, 1fr))` }}
                >
                  {days.map((d) => (
                    <span
                      key={`${d.key}-label`}
                      className="text-[10px] text-center text-gray-500 dark:text-gray-400 whitespace-nowrap"
                    >
                      {d.label}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
        <p className="mt-2 text-[10px] text-gray-500 dark:text-gray-400 text-center">
          Tickets/day
        </p>
      </div>
    </div>
  );
}

function StatusPriorityMatrixTable({ matrix }) {
  return (
    <div className="w-full">
      <p className="text-[11px] font-medium text-gray-500 dark:text-gray-400 mb-2 text-center sm:text-left">
        By priority and status
      </p>
      <div className="rounded-xl border border-gray-200 dark:border-gray-700/80 bg-gray-50/80 dark:bg-gray-950/50 overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[280px] table-fixed border-collapse text-sm">
            <colgroup>
              <col className="w-[32%] sm:w-[30%]" />
              <col className="w-[22.6%]" />
              <col className="w-[22.6%]" />
              <col className="w-[22.6%]" />
            </colgroup>
            <thead>
              <tr>
                <th
                  scope="col"
                  className="px-2 sm:px-3 py-2.5 text-left align-bottom border-b border-gray-200 dark:border-gray-800 bg-white/90 dark:bg-gray-900/90"
                >
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                    Priority
                  </span>
                </th>
                {STATUS_KEYS.map((sk) => (
                  <th
                    key={sk}
                    scope="col"
                    className="p-1.5 sm:p-2 align-bottom border-b border-gray-200 dark:border-gray-800 bg-white/90 dark:bg-gray-900/90"
                  >
                    <div
                      className="flex h-full min-h-[2.5rem] w-full items-center justify-center rounded-lg px-1.5 py-1.5 text-center text-[9px] sm:text-[10px] font-bold uppercase leading-snug tracking-wide text-white shadow-inner"
                      style={{ backgroundColor: STATUS_META[sk]?.color || '#9CA3AF' }}
                    >
                      {STATUS_META[sk]?.shortLabel || sk}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {PRIORITY_ROWS.map(({ key, label }, rowIdx) => (
                <tr
                  key={key}
                  className={`border-b border-gray-100 dark:border-gray-800/80 last:border-b-0 ${
                    rowIdx % 2 === 0
                      ? 'bg-white dark:bg-gray-900/35'
                      : 'bg-gray-50/90 dark:bg-gray-950/45'
                  }`}
                >
                  <th
                    scope="row"
                    className="px-2 sm:px-3 py-2.5 text-left text-[11px] sm:text-xs font-bold uppercase tracking-wide text-gray-900 dark:text-gray-100"
                  >
                    {label}
                  </th>
                  {STATUS_KEYS.map((sk) => (
                    <td
                      key={sk}
                      className="px-1 py-2.5 text-center tabular-nums text-sm sm:text-base font-semibold text-gray-900 dark:text-gray-100"
                    >
                      {matrix[key]?.[sk] ?? 0}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-3 text-center leading-relaxed px-0.5">
        Counts by priority and status (Open, In Progress, Completed). Unknown priorities are grouped under Normal.
      </p>
    </div>
  );
}

export default function DashboardTicketCharts({ tickets, title = 'Analytics', daysBack = 14, totalUsers, userRoleCounts }) {
  const { statusSegments, statusPriorityMatrix, trendDays, avgCompletionHours, avgCompletionCount } = useMemo(() => {
    const list = Array.isArray(tickets) ? tickets : [];
    const statusCounts = { open: 0, 'in-progress': 0, closed: 0 };
    list.forEach((t) => {
      const s = normalizeTicketStatus(t?.status);
      if (s === 'open') statusCounts.open += 1;
      else if (s === 'in-progress') statusCounts['in-progress'] += 1;
      else if (s === 'closed') statusCounts.closed += 1;
    });

    const today = new Date();
    const start = new Date(today);
    start.setDate(start.getDate() - (daysBack - 1));
    start.setHours(0, 0, 0, 0);

    const days = [];
    const byDay = new Map();
    for (let i = 0; i < daysBack; i += 1) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      const key = ymd(d);
      const label = formatDayLabel(d);
      byDay.set(key, { key, label, shortLabel: label.replace(',', ''), created: 0, completed: 0 });
      days.push(key);
    }

    list.forEach((t) => {
      const createdAt = safeDate(t?.created_at);
      if (createdAt) {
        const k = ymd(createdAt);
        const row = byDay.get(k);
        if (row) row.created += 1;
      }
      const status = (t?.status || '').toLowerCase();
      if (status === 'closed') {
        const closedAt = safeDate(t?.updated_at) || safeDate(t?.closed_at) || safeDate(t?.resolved_at);
        if (closedAt) {
          const k = ymd(closedAt);
          const row = byDay.get(k);
          if (row) row.completed += 1;
        }
      }
    });

    // Average completion time (closed tickets resolved within last `daysBack` days)
    const now = new Date();
    const completionStart = new Date(now);
    completionStart.setDate(completionStart.getDate() - (daysBack - 1));
    completionStart.setHours(0, 0, 0, 0);

    const completionDurationsMs = [];
    list.forEach((t) => {
      const status = String(t?.status || '').toLowerCase();
      if (status !== 'closed') return;
      const createdAt = safeDate(t?.created_at);
      if (!createdAt) return;
      const resolvedAt = safeDate(t?.updated_at) || safeDate(t?.closed_at) || safeDate(t?.resolved_at);
      if (!resolvedAt) return;
      if (resolvedAt < completionStart) return;
      completionDurationsMs.push(resolvedAt.getTime() - createdAt.getTime());
    });

    const avgMs = completionDurationsMs.length
      ? completionDurationsMs.reduce((a, b) => a + b, 0) / completionDurationsMs.length
      : null;
    const avgHours = avgMs != null ? avgMs / (1000 * 60 * 60) : null;
    const completionCount = completionDurationsMs.length;

    const statusSegmentsOut = Object.keys(statusCounts).map((key) => ({
      key,
      label: STATUS_META[key]?.label || key,
      color: STATUS_META[key]?.color || '#9CA3AF',
      value: statusCounts[key],
    }));

    const statusPriorityMatrix = {};
    PRIORITY_ROWS.forEach(({ key }) => {
      statusPriorityMatrix[key] = { open: 0, 'in-progress': 0, closed: 0 };
    });
    list.forEach((t) => {
      const st = normalizeTicketStatus(t?.status);
      if (!st) return;
      const pr = normalizeTicketPriority(t?.priority);
      if (statusPriorityMatrix[pr]) statusPriorityMatrix[pr][st] += 1;
    });

    return {
      statusSegments: statusSegmentsOut,
      statusPriorityMatrix,
      trendDays: days.map((k) => byDay.get(k)).filter(Boolean),
      avgCompletionHours: avgHours,
      avgCompletionCount: completionCount,
    };
  }, [tickets, daysBack]);

  const hasUsersCard = typeof totalUsers === 'number';
  const breakdownPeriodLabel = new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  const trendTotalCreated = trendDays.reduce((acc, d) => acc + (d.created || 0), 0);
  const trendTotalCompleted = trendDays.reduce((acc, d) => acc + (d.completed || 0), 0);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
      {/* Card 1: Ticket status breakdown (donut) + priority × status matrix */}
      <div className={`bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 shadow-sm overflow-hidden ${hasUsersCard ? 'lg:col-span-4' : 'lg:col-span-5'}`}>
        <div className="px-4 sm:px-6 py-3.5 border-b border-gray-200 dark:border-gray-800">
          <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">{title}</h2>
          <p className="mt-0.5 text-sm text-gray-600 dark:text-gray-400">
            Ticket status breakdown ({breakdownPeriodLabel})
          </p>
        </div>
        <div className="p-4 sm:p-5 flex flex-col gap-5">
          <div className="flex justify-center">
            <Donut segments={statusSegments} />
          </div>
          <StatusPriorityMatrixTable matrix={statusPriorityMatrix} />
        </div>
      </div>

      {/* Card 2: Recent activity trend (mini bars) */}
      <div className={`bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 shadow-sm overflow-visible ${hasUsersCard ? 'lg:col-span-5' : 'lg:col-span-7'} flex flex-col h-full`}>
        <div className="px-4 sm:px-6 py-3.5 border-b border-gray-200 dark:border-gray-800">
          <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">Ticket activity (last {daysBack} days)</h2>
          <p className="mt-0.5 text-sm text-gray-600 dark:text-gray-400">
            Created vs completed tickets per day
          </p>
        </div>
        <div className="px-3 sm:px-5 py-3 flex flex-col flex-1 min-h-0">
          <div className="mb-1 grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <div className="rounded-lg border border-blue-200 dark:border-blue-900/60 bg-blue-50/70 dark:bg-blue-950/25 px-3 py-2">
              <p className="text-[11px] font-medium text-blue-700 dark:text-blue-300">Created (last {daysBack} days)</p>
              <p className="text-lg font-semibold text-blue-900 dark:text-blue-100 tabular-nums">{trendTotalCreated}</p>
            </div>
            <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50/80 dark:bg-gray-950/45 px-3 py-2">
              <p className="text-[11px] font-medium text-gray-600 dark:text-gray-300">Completed (last {daysBack} days)</p>
              <p className="text-lg font-semibold text-gray-900 dark:text-gray-100 tabular-nums">{trendTotalCompleted}</p>
            </div>
          </div>
          <div className="flex-1 min-h-0 mt-1">
            <MiniBars days={trendDays} />
          </div>
          <p className="mt-1 text-[11px] text-gray-500 dark:text-gray-400 text-center">
            Completed uses <code>updated_at</code> for tickets currently in <code>closed</code> status.
          </p>
        </div>
      </div>

      {hasUsersCard && (
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 shadow-sm overflow-hidden flex flex-col lg:col-span-3">
          <div className="px-4 sm:px-6 py-3.5 border-b border-gray-200 dark:border-gray-800">
            <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">Users</h2>
            <p className="mt-0.5 text-sm text-gray-600 dark:text-gray-400">Total users in the system</p>
          </div>
          <div className="flex-1 px-4 sm:px-6 py-6 flex flex-col items-center justify-center text-center gap-4">
            <div>
              <p className="text-xs sm:text-[11px] font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                Total Users
              </p>
              <p className="mt-2 text-4xl sm:text-5xl font-extrabold text-gray-900 dark:text-gray-100">
                {totalUsers}
              </p>
            </div>
            <div className="w-full max-w-sm mx-auto grid grid-cols-3 gap-2">
              <div className="rounded-lg border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-950/40 px-2.5 py-2">
                <p className="text-[11px] text-gray-500 dark:text-gray-400">TLA</p>
                <p className="mt-0.5 text-lg font-bold text-gray-900 dark:text-gray-100">{userRoleCounts?.tla ?? 0}</p>
              </div>
              <div className="rounded-lg border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-950/40 px-2.5 py-2">
                <p className="text-[11px] text-gray-500 dark:text-gray-400">PAT1</p>
                <p className="mt-0.5 text-lg font-bold text-gray-900 dark:text-gray-100">{userRoleCounts?.pat1 ?? 0}</p>
              </div>
              <div className="rounded-lg border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-950/40 px-2.5 py-2">
                <p className="text-[11px] text-gray-500 dark:text-gray-400">Monitoring</p>
                <p className="mt-0.5 text-lg font-bold text-gray-900 dark:text-gray-100">{userRoleCounts?.monitoring_team ?? 0}</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

