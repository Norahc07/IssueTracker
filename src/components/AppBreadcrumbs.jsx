import { Link, useLocation } from 'react-router-dom';
import { useMemo } from 'react';
import { buildBreadcrumbTrail } from '../utils/breadcrumbs.js';
import { useSupabase } from '../context/supabase.jsx';

export default function AppBreadcrumbs() {
  const { pathname, search } = useLocation();
  const { userRole } = useSupabase();

  const items = useMemo(
    () => buildBreadcrumbTrail(pathname, search, userRole ?? 'intern'),
    [pathname, search, userRole],
  );

  if (!items.length) return null;

  return (
    <nav className="mb-4 text-sm" aria-label="Breadcrumb">
      <ol className="flex flex-wrap items-center gap-x-1 gap-y-1 text-gray-600 dark:text-gray-400">
        {items.map((item, i) => {
          const isLast = i === items.length - 1;
          return (
            <li key={`${item.label}-${i}`} className="flex min-w-0 items-center gap-1">
              {i > 0 && (
                <span className="text-gray-400 dark:text-gray-500 select-none" aria-hidden>
                  /
                </span>
              )}
              {item.to && !isLast ? (
                <Link
                  to={item.to}
                  className="truncate font-medium text-[#356488] hover:text-[#254a62] hover:underline dark:text-[#7eb3d6] dark:hover:text-[#a8d0ef]"
                >
                  {item.label}
                </Link>
              ) : (
                <span
                  className={`truncate ${isLast ? 'font-semibold text-gray-900 dark:text-gray-100' : ''}`}
                  aria-current={isLast ? 'page' : undefined}
                >
                  {item.label}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
