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
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label="Ticket status distribution chart">
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="#E5E7EB"
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
      <text x="50%" y="48%" textAnchor="middle" fontSize="20" fontWeight="700" fill="#111827">
        {total}
      </text>
      <text x="50%" y="62%" textAnchor="middle" fontSize="11" fill="#6B7280">
        tickets
      </text>
    </svg>
  );
}

function MiniBars({ days }) {
  const max = Math.max(1, ...days.map((d) => Math.max(d.created, d.completed)));
  return (
    <div className="w-full">
      <div className="flex items-end gap-2 h-36">
        {days.map((d) => {
          const createdH = clamp(Math.round((d.created / max) * 100), 0, 100);
          const completedH = clamp(Math.round((d.completed / max) * 100), 0, 100);
          return (
            <div key={d.key} className="flex-1 min-w-0 flex flex-col items-center gap-0.5">
              <div className="w-full h-32 flex items-end justify-center gap-1">
                <div
                  className="w-2.5 rounded-t bg-blue-400/80"
                  style={{ height: `${createdH}%` }}
                  title={`${d.label}: Created ${d.created}`}
                />
                <div
                  className="w-2.5 rounded-t bg-gray-500/70"
                  style={{ height: `${completedH}%` }}
                  title={`${d.label}: Completed ${d.completed}`}
                />
              </div>
              <div className="text-[10px] text-gray-500 truncate w-full text-center leading-tight">
                {d.shortLabel}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function DashboardTicketCharts({ tickets, title = 'Analytics', daysBack = 14, totalUsers }) {
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
    <div className={`grid grid-cols-1 ${hasUsersCard ? 'lg:grid-cols-3' : 'lg:grid-cols-2'} gap-4`}>
      {/* Card 1: Ticket status breakdown (donut) */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-4 sm:px-6 py-4 border-b border-gray-200">
          <h2 className="text-base font-semibold text-gray-900">{title}</h2>
          <p className="mt-0.5 text-sm text-gray-600">Ticket status breakdown</p>
        </div>
        <div className="p-4 sm:p-6 flex flex-col items-center gap-3">
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
                    <span className="text-gray-700 truncate">{s.label}</span>
                  </div>
                  <span className="text-gray-900 font-semibold text-right min-w-[1.5rem]">
                    {s.value}
                  </span>
                </div>
              ))}
            </div>
            <p className="text-xs text-gray-500 mt-1 text-center">
              Counts based on current ticket statuses (Open, In Progress, Completed).
            </p>
          </div>
        </div>
      </div>

      {/* Card 2: Recent activity trend (mini bars) */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-4 sm:px-6 py-4 border-b border-gray-200">
          <h2 className="text-base font-semibold text-gray-900">Ticket activity (last {daysBack} days)</h2>
          <p className="mt-0.5 text-sm text-gray-600">Created vs completed tickets over time</p>
        </div>
        <div className="px-3 sm:px-5 py-4 flex flex-col h-full">
          <div className="flex-1 flex items-center justify-center">
            <MiniBars days={trendDays} />
          </div>
          <div className="mt-3 flex flex-col items-center gap-1">
            <div className="flex items-center gap-4 justify-center text-xs text-gray-600">
              <div className="inline-flex items-center gap-2">
                <span className="inline-block w-2.5 h-2.5 rounded bg-blue-400/80" />
                Created
              </div>
              <div className="inline-flex items-center gap-2">
                <span className="inline-block w-2.5 h-2.5 rounded bg-gray-500/70" />
                Completed
              </div>
            </div>
            <p className="text-[11px] text-gray-500 text-center">
              “Completed” uses ticket <code>updated_at</code> when status is <code>closed</code>.
            </p>
          </div>
        </div>
      </div>

      {hasUsersCard && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden flex flex-col">
          <div className="px-4 sm:px-6 py-4 border-b border-gray-200">
            <h2 className="text-base font-semibold text-gray-900">Users</h2>
            <p className="mt-0.5 text-sm text-gray-600">Total users in the system</p>
          </div>
          <div className="flex-1 px-4 sm:px-6 py-6 flex flex-col items-center justify-center text-center">
            <p className="text-xs sm:text-[11px] font-medium text-gray-500 uppercase tracking-wide">
              Total Users
            </p>
            <p className="mt-2 text-4xl sm:text-5xl font-extrabold text-gray-900">
              {totalUsers}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

