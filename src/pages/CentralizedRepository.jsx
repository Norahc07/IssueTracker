import { useState, useMemo, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useSupabase } from '../context/supabase.jsx';
import { toast } from 'react-hot-toast';
import { permissions } from '../utils/rolePermissions.js';
import RepositoryFormModal from '../components/RepositoryFormModal.jsx';
import { OFFICIAL_REPOSITORY_ITEMS } from '../data/officialRepository.js';

const PRIMARY = '#6795BE';

const MAIN_TAGS = ['sop', 'seo', 'security', 'tasks'];
const MAIN_TAG_LABELS = { sop: 'SOP', tasks: 'Tasks', security: 'Security', seo: 'SEO' };
const TAG_ALIASES = { credentials: 'security' };

const normalizeTag = (tag) => {
  const lower = String(tag || '').trim().toLowerCase();
  return TAG_ALIASES[lower] || lower;
};

const OTHER_TAG_STYLE_PALETTE = [
  'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-200',
  'bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-200',
  'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/40 dark:text-cyan-200',
  'bg-fuchsia-100 text-fuchsia-700 dark:bg-fuchsia-900/40 dark:text-fuchsia-200',
  'bg-lime-100 text-lime-700 dark:bg-lime-900/40 dark:text-lime-200',
  'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-200',
];

const getOtherTagStyle = (tag) => {
  const normalized = normalizeTag(tag);
  if (!normalized) return OTHER_TAG_STYLE_PALETTE[0];
  let hash = 0;
  for (let i = 0; i < normalized.length; i += 1) {
    hash = (hash * 31 + normalized.charCodeAt(i)) >>> 0;
  }
  return OTHER_TAG_STYLE_PALETTE[hash % OTHER_TAG_STYLE_PALETTE.length];
};

const getTagStyles = (tag, isSelected = false) => {
  const normalized = normalizeTag(tag);
  if (isSelected) return 'text-white';
  switch (normalized) {
    case 'sop':
      return 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-200';
    case 'seo':
      return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-200';
    case 'security':
      return 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-200';
    case 'tasks':
      return 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-200';
    default:
      return getOtherTagStyle(normalized);
  }
};

export default function CentralizedRepository() {
  const { supabase, userRole, userTeam } = useSupabase();
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [tagFilter, setTagFilter] = useState('all');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [menuOpenId, setMenuOpenId] = useState(null);
  const [deletingId, setDeletingId] = useState(null);

  const canManage = permissions.canEditRepository(userRole);
  const canViewOffboardingIntern =
    userRole === 'admin' ||
    ((userRole === 'tl' || userRole === 'vtl') && String(userTeam || '').toLowerCase() === 'tla');

  const fetchItems = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('repository_items')
        .select('id, slug, title, type, description, tags, content, created_at, updated_at')
        .order('created_at', { ascending: false });
      if (error) throw error;
      const dbItems = Array.isArray(data) ? data : [];
      const staticSlugs = new Set(OFFICIAL_REPOSITORY_ITEMS.map((item) => item.slug));
      const dbBySlug = new Map(dbItems.map((r) => [r.slug, r]));

      // Merge: use DB row if exists for slug, else use static; add DB-only items
      const merged = OFFICIAL_REPOSITORY_ITEMS.map((item, i) => {
        const dbRow = dbBySlug.get(item.slug);
        if (dbRow) return { ...dbRow, isStatic: false };
        return {
          id: `static-${i}`,
          slug: item.slug,
          title: item.title,
          type: 'document',
          description: item.description,
          tags: item.tags || [],
          content: item.content,
          isStatic: true,
        };
      });
      dbItems.forEach((dbRow) => {
        if (!staticSlugs.has(dbRow.slug)) merged.push({ ...dbRow, isStatic: false });
      });
      setItems(merged);
    } catch (err) {
      console.warn('Repository fetch failed, using static data:', err);
      setItems(
        OFFICIAL_REPOSITORY_ITEMS.map((item, i) => ({
          id: `static-${i}`,
          slug: item.slug,
          title: item.title,
          type: 'document',
          description: item.description,
          tags: item.tags || [],
          content: item.content,
          isStatic: true,
        }))
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchItems();
  }, [supabase]);

  const handleCreateOrUpdate = async (payload) => {
    const isEdit = !!payload.id && !String(payload.id).startsWith('static-');
    if (isEdit) {
      const { id, slug, title, type, description, tags, content } = payload;
      const { error } = await supabase.from('repository_items').update({
        slug,
        title,
        type,
        description,
        tags: tags || [],
        content: content || '',
      }).eq('id', id);
      if (error) throw error;
      toast.success('Repository item updated.');
    } else {
      const { slug, title, type, description, tags, content } = payload;
      const { error } = await supabase.from('repository_items').insert({
        slug,
        title,
        type,
        description,
        tags: tags || [],
        content: content || '',
      });
      if (error) throw error;
      toast.success('Repository item created.');
    }
    await fetchItems();
    setEditItem(null);
    setShowCreateModal(false);
  };

  const handleDelete = async (item) => {
    if (item.isStatic) {
      toast.error('Cannot delete seeded items from the UI. Use Supabase to modify.');
      return;
    }
    if (!window.confirm(`Delete "${item.title}"?`)) return;
    setDeletingId(item.id);
    try {
      const { error } = await supabase.from('repository_items').delete().eq('id', item.id);
      if (error) throw error;
      toast.success('Deleted.');
      await fetchItems();
      setMenuOpenId(null);
    } catch (err) {
      toast.error(err?.message || 'Delete failed');
    } finally {
      setDeletingId(null);
    }
  };

  const filteredItems = useMemo(() => {
    let list = items;
    // Restricted visibility: Offboarding Intern is only for Admin and TL/VTL under TLA.
    if (!canViewOffboardingIntern) {
      list = list.filter((item) => String(item.slug || '').toLowerCase() !== 'offboarding-intern');
    }
    if (tagFilter === 'others') {
      list = list.filter((item) =>
        (item.tags || []).some((t) => !MAIN_TAGS.includes(normalizeTag(t)))
      );
    } else if (tagFilter !== 'all') {
      const tagLower = tagFilter.toLowerCase();
      list = list.filter((item) =>
        (item.tags || []).some((t) => normalizeTag(t) === tagLower)
      );
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (item) =>
          item.title?.toLowerCase().includes(q) ||
          item.description?.toLowerCase().includes(q) ||
          (item.tags || []).some((t) => String(t).toLowerCase().includes(q))
      );
    }
    return list;
  }, [items, tagFilter, searchQuery, canViewOffboardingIntern]);

  if (loading) {
    return (
      <div className="w-full flex items-center justify-center py-12">
        <div className="text-gray-600 dark:text-gray-400">Loading repository…</div>
      </div>
    );
  }

  return (
    <div className="w-full space-y-4 sm:space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100" style={{ color: PRIMARY }}>
            Repository
          </h1>
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
            Official company resources, SOPs, and guides
          </p>
        </div>
        {canManage && (
          <button
            type="button"
            onClick={() => { setEditItem(null); setShowCreateModal(true); }}
            className="shrink-0 inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white transition-colors hover:opacity-90"
            style={{ backgroundColor: PRIMARY }}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            Create
          </button>
        )}
      </div>

      <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 p-4">
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-2">Search</label>
        <div className="relative">
          <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-gray-400 dark:text-gray-500">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 20 20"
              fill="currentColor"
              className="h-4 w-4"
              aria-hidden="true"
            >
              <path
                fillRule="evenodd"
                d="M9 3a6 6 0 104.472 10.03l2.249 2.25a.75.75 0 101.06-1.06l-2.25-2.249A6 6 0 009 3zm-4.5 6a4.5 4.5 0 118.999 0A4.5 4.5 0 014.5 9z"
                clipRule="evenodd"
              />
            </svg>
          </div>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by title, description, or tags..."
            className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm text-gray-900 dark:text-gray-100 pl-10 pr-4 py-2.5 focus:ring-2 focus:ring-[#6795BE] focus:border-transparent"
          />
        </div>
        <div className="mt-4">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-2">Filter</label>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setTagFilter('all')}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                tagFilter === 'all'
                  ? 'text-white'
                  : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-700'
              }`}
              style={tagFilter === 'all' ? { backgroundColor: PRIMARY } : {}}
            >
              All
            </button>
            {MAIN_TAGS.map((tag) => (
              <button
                key={tag}
                type="button"
                onClick={() => setTagFilter(tag)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  tagFilter === tag
                    ? getTagStyles(tag, true)
                    : `${getTagStyles(tag)} hover:brightness-95 dark:hover:brightness-110`
                }`}
                style={tagFilter === tag ? { backgroundColor: PRIMARY } : {}}
              >
                {MAIN_TAG_LABELS[tag] ?? tag}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setTagFilter('others')}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                tagFilter === 'others'
                  ? 'text-white'
                  : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-700'
              }`}
              style={tagFilter === 'others' ? { backgroundColor: PRIMARY } : {}}
            >
              Others
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredItems.length > 0 ? (
          filteredItems.map((item) => (
            <div
              key={item.id}
              className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 p-5 sm:p-6 hover:shadow-md transition-shadow flex flex-col relative"
            >
              {canManage && (
                <div className="absolute top-3 right-3">
                  <button
                    type="button"
                    onClick={() => setMenuOpenId(menuOpenId === item.id ? null : item.id)}
                    className="p-1.5 rounded text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-800 dark:hover:text-gray-200"
                    aria-label="Options"
                  >
                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z" />
                    </svg>
                  </button>
                  {menuOpenId === item.id && (
                    <>
                      <div className="fixed inset-0 z-10" onClick={() => setMenuOpenId(null)} aria-hidden="true" />
                      <div className="absolute right-0 top-full mt-1 py-1 w-36 bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 shadow-lg z-20">
                        <button
                          type="button"
                          onClick={() => {
                            navigate(`/repository/view/${item.slug}?edit=1`);
                            setMenuOpenId(null);
                          }}
                          className="block w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(item)}
                          disabled={deletingId === item.id}
                          className="block w-full text-left px-3 py-2 text-sm text-red-600 hover:bg-red-50 disabled:opacity-50"
                        >
                          {deletingId === item.id ? 'Deleting…' : 'Delete'}
                        </button>
                      </div>
                    </>
                  )}
                </div>
              )}
              <div className="flex-1 pr-8">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">
                  {item.title}
                </h3>
                {item.description && (
                  <p className="text-sm text-gray-600 dark:text-gray-300 line-clamp-2 mb-4">
                    {item.description}
                  </p>
                )}
                {(item.tags || []).length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {item.tags.map((tag, index) => (
                      <span
                        key={index}
                        className={`px-2 py-0.5 text-xs rounded font-medium ${getTagStyles(tag)}`}
                      >
                        {MAIN_TAG_LABELS[normalizeTag(tag)] || tag}
                      </span>
                    ))}
                  </div>
                )}
              </div>
              <div className="mt-4 pt-4 border-t border-gray-100">
                <Link
                  to={`/repository/view/${item.slug}`}
                  className="inline-flex items-center justify-center w-full px-4 py-2.5 rounded-lg text-sm font-medium text-white transition-colors hover:opacity-90"
                  style={{ backgroundColor: PRIMARY }}
                >
                  View
                </Link>
              </div>
            </div>
          ))
        ) : (
          <div className="col-span-full text-center py-12 bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800">
            <p className="text-gray-500 dark:text-gray-400">
              No items match your filter or search.
            </p>
          </div>
        )}
      </div>

      {canManage && (
        <>
          <RepositoryFormModal
            open={showCreateModal}
            onClose={() => { setShowCreateModal(false); setEditItem(null); }}
            initialItem={editItem}
            onSuccess={handleCreateOrUpdate}
          />
        </>
      )}
    </div>
  );
}
