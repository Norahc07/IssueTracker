import React, { useMemo } from 'react';

const STATUS_META = {
  open: { label: 'Open', color: '#3B82F6' }, // blue-500
  'in-progress': { label: 'In Progress', color: '#8B5CF6' }, // violet-500
  closed: { label: 'Completed', color: '#6B7280' }, // gray-500
};

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

function Donut({ segments, size = 140, stroke = 14 }) {
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
        y="48%"
        textAnchor="middle"
        fontSize="20"
        fontWeight="700"
        fill="currentColor"
        className="text-gray-900 dark:text-gray-100"
      >
        {total}
      </text>
      <text
        x="50%"
        y="62%"
        textAnchor="middle"
        fontSize="11"
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
  const mid = Math.max(0, Math.round(max / 2));
  const yMarkers = useMemo(() => {
    const vals = [max, mid, 0].filter((v) => Number.isFinite(v));
    const uniq = Array.from(new Set(vals));
    return uniq;
  }, [max, mid]);
  return (
    <div className="w-full">
      <div className="relative rounded-lg border border-gray-100 dark:border-gray-800 bg-gradient-to-b from-gray-50/60 to-white dark:from-gray-950/40 dark:to-gray-900 px-2 pt-3 pb-12">
        {/* subtle horizontal gridlines */}
        <div
          className="absolute inset-x-0 top-3 bottom-8 pointer-events-none opacity-60 dark:opacity-30"
          style={{
            backgroundImage:
              'linear-gradient(to bottom, rgba(229,231,235,0.9) 1px, transparent 1px)',
            backgroundSize: '100% 25%',
          }}
        />

        {/* y markers */}
        <div className="absolute left-2 top-3 bottom-12 flex flex-col justify-between text-[10px] text-gray-400 dark:text-gray-500 z-20 pointer-events-none">
          {(yMarkers.length >= 3 ? yMarkers : [max, 0]).map((v) => (
            <span key={v}>{v}</span>
          ))}
        </div>

        <div className="flex items-end gap-2 h-36 relative z-10">
        {days.map((d) => {
          const createdH = clamp(Math.round((d.created / max) * 100), 0, 100);
          const completedH = clamp(Math.round((d.completed / max) * 100), 0, 100);
          return (
            <div key={d.key} className="flex-1 min-w-0 flex flex-col items-center gap-0.5">
              <div className="w-full h-32 flex items-end justify-center gap-1">
                <div
                  className="w-2.5 rounded-t bg-blue-400/80"
                  style={{ height: `${createdH}%` }}
                  title={`${d.label}: Created tickets ${d.created}`}
                />
                <div
                  className="w-2.5 rounded-t bg-gray-500/70"
                  style={{ height: `${completedH}%` }}
                  title={`${d.label}: Completed tickets ${d.completed}`}
                />
              </div>
              <div className="w-full h-6 flex items-start justify-center">
                <span className="text-[9px] text-gray-500 dark:text-gray-400 leading-none origin-top-left -rotate-45 whitespace-nowrap">
                  {d.shortLabel}
                </span>
              </div>
            </div>
          );
        })}
      </div>

        {/* bottom legend (user-friendly, not covering bars) */}
        <div className="absolute inset-x-2 bottom-2 flex items-center justify-center">
          <div className="inline-flex items-center gap-3 rounded-full border border-gray-200 dark:border-gray-800 bg-white/90 dark:bg-gray-950/70 px-3 py-1 text-[11px] text-gray-700 dark:text-gray-200 shadow-sm backdrop-blur">
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block w-2.5 h-2.5 rounded bg-blue-400/80" />
              Created tickets
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block w-2.5 h-2.5 rounded bg-gray-500/70" />
              Completed tickets
            </span>
            <span className="text-gray-300 dark:text-gray-700">|</span>
            <span className="text-gray-500 dark:text-gray-400">Tickets/day</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function DashboardTicketCharts({ tickets, title = 'Analytics', daysBack = 14, totalUsers, userRoleCounts }) {
  const { statusSegments, trendDays } = useMemo(() => {
    const list = Array.isArray(tickets) ? tickets : [];
    const statusCounts = { open: 0, 'in-progress': 0, closed: 0 };
    list.forEach((t) => {
      const s = (t?.status || '').toLowerCase();
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

    const statusSegmentsOut = Object.keys(statusCounts).map((key) => ({
      key,
      label: STATUS_META[key]?.label || key,
      color: STATUS_META[key]?.color || '#9CA3AF',
      value: statusCounts[key],
    }));

    return { statusSegments: statusSegmentsOut, trendDays: days.map((k) => byDay.get(k)).filter(Boolean) };
  }, [tickets, daysBack]);

  const hasUsersCard = typeof totalUsers === 'number';

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
      {/* Card 1: Ticket status breakdown (donut) */}
      <div className={`bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 shadow-sm overflow-hidden ${hasUsersCard ? 'lg:col-span-4' : 'lg:col-span-5'}`}>
        <div className="px-4 sm:px-6 py-3.5 border-b border-gray-200 dark:border-gray-800">
          <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">{title}</h2>
          <p className="mt-0.5 text-sm text-gray-600 dark:text-gray-400">Ticket status breakdown</p>
        </div>
        <div className="p-4 sm:p-5 flex flex-col items-center gap-3">
          <Donut segments={statusSegments} />
          <div className="w-full max-w-xs mx-auto space-y-1.5">
            <div className="space-y-0.5">
              {statusSegments.map((s) => (
                <div
                  key={s.key}
                  className="flex items-center justify-between gap-3 text-sm leading-tight"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className="inline-block w-2.5 h-2.5 rounded"
                      style={{ backgroundColor: s.color }}
                    />
                    <span className="text-gray-700 dark:text-gray-200 truncate">{s.label}</span>
                  </div>
                  <span className="text-gray-900 dark:text-gray-100 font-semibold text-right min-w-[1.5rem]">
                    {s.value}
                  </span>
                </div>
              ))}
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 text-center">
              Counts based on current ticket statuses (Open, In Progress, Completed).
            </p>
          </div>
        </div>
      </div>

      {/* Card 2: Recent activity trend (mini bars) */}
      <div className={`bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 shadow-sm overflow-hidden ${hasUsersCard ? 'lg:col-span-5' : 'lg:col-span-7'}`}>
        <div className="px-4 sm:px-6 py-3.5 border-b border-gray-200 dark:border-gray-800">
          <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">Ticket activity (last {daysBack} days)</h2>
          <p className="mt-0.5 text-sm text-gray-600 dark:text-gray-400">Created tickets vs completed tickets (count per day)</p>
        </div>
        <div className="px-3 sm:px-5 py-4 flex flex-col h-full min-h-[320px]">
          <div className="flex-1 flex items-center justify-center">
            <MiniBars days={trendDays} />
          </div>
          <p className="mt-3 text-[11px] text-gray-500 dark:text-gray-400 text-center">
            “Completed tickets” uses ticket <code>updated_at</code> when status is <code>closed</code>.
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

