import React from 'react';

function formatDateLong(dateStr) {
  if (!dateStr) return '';
  const date = new Date(dateStr + 'T00:00:00');
  if (Number.isNaN(date.getTime())) return String(dateStr);
  return date.toLocaleDateString('en-US', { month: 'long', day: '2-digit', year: 'numeric' });
}

export default function PrettyDatePicker({
  id,
  value,
  onChange,
  ariaLabel,
  placeholder = 'Select date',
  disabled = false,
  min,
  max,
  className = '',
}) {
  const hasValue = !!(value && String(value).trim());
  const display = formatDateLong(value) || value || '';

  return (
    <div className={`relative w-full ${className}`}>
      <div
        className={`w-full inline-flex items-center justify-between gap-2 rounded-lg border border-gray-300 dark:border-gray-700 px-3 py-2 text-sm bg-white dark:bg-gray-900 ${
          disabled
            ? 'opacity-60 cursor-not-allowed'
            : 'cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800'
        }`}
      >
        <div className="min-w-0 flex items-center gap-2">
          <svg className="w-4 h-4 text-gray-500 dark:text-gray-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
            />
          </svg>
          <span className={`${hasValue ? 'text-gray-900 dark:text-gray-100' : 'text-gray-400 dark:text-gray-500'} truncate`}>
            {hasValue ? display : placeholder}
          </span>
        </div>
      </div>

      <input
        id={id}
        type="date"
        value={value || ''}
        onChange={onChange}
        onClick={(e) => e.currentTarget.showPicker && e.currentTarget.showPicker()}
        disabled={disabled}
        min={min}
        max={max}
        aria-label={ariaLabel || 'Select date'}
        className={`absolute inset-0 w-full h-full opacity-0 ${disabled ? 'cursor-not-allowed' : 'cursor-pointer'}`}
      />
    </div>
  );
}

