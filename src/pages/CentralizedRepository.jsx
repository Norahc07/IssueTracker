import { useState, useMemo, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useSupabase } from '../context/supabase.jsx';
import { toast } from 'react-hot-toast';
import { permissions } from '../utils/rolePermissions.js';
import RepositoryFormModal from '../components/RepositoryFormModal.jsx';
import { OFFICIAL_REPOSITORY_ITEMS } from '../data/officialRepository.js';

const PRIMARY = '#6795BE';

const MAIN_TAGS = ['sop', 'tasks', 'credentials', 'seo'];
const MAIN_TAG_LABELS = { sop: 'SOP', tasks: 'Tasks', credentials: 'Credentials', seo: 'SEO' };

export default function CentralizedRepository() {
  const { supabase, userRole } = useSupabase();
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

  const fetchItems = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('repository_items')
        .select('id, slug, title, type, description, tags, content, created_at, updated_at')
        .order('created_at', { ascending: false });
      if (error) throw error;
      setItems(Array.isArray(data) ? data : []);
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
    if (tagFilter === 'others') {
      list = list.filter((item) =>
        (item.tags || []).some((t) => !MAIN_TAGS.includes(String(t).toLowerCase()))
      );
    } else if (tagFilter !== 'all') {
      const tagLower = tagFilter.toLowerCase();
      list = list.filter((item) =>
        (item.tags || []).some((t) => String(t).toLowerCase() === tagLower)
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
  }, [items, tagFilter, searchQuery]);

  if (loading) {
    return (
      <div className="w-full flex items-center justify-center py-12">
        <div className="text-gray-600">Loading repository…</div>
      </div>
    );
  }

  return (
    <div className="w-full space-y-4 sm:space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900" style={{ color: PRIMARY }}>
            Repository
          </h1>
          <p className="mt-1 text-sm text-gray-600">
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

      <div className="bg-white rounded-lg border border-gray-200 p-4">
        <label className="block text-sm font-medium text-gray-700 mb-2">Search</label>
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search by title, description, or tags..."
          className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:ring-2 focus:ring-[#6795BE] focus:border-transparent"
        />
        <div className="mt-4">
          <label className="block text-sm font-medium text-gray-700 mb-2">Filter</label>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setTagFilter('all')}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${tagFilter === 'all' ? 'text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
              style={tagFilter === 'all' ? { backgroundColor: PRIMARY } : {}}
            >
              All
            </button>
            {MAIN_TAGS.map((tag) => (
              <button
                key={tag}
                type="button"
                onClick={() => setTagFilter(tag)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${tagFilter === tag ? 'text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
                style={tagFilter === tag ? { backgroundColor: PRIMARY } : {}}
              >
                {MAIN_TAG_LABELS[tag] ?? tag}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setTagFilter('others')}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${tagFilter === 'others' ? 'text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
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
              className="bg-white rounded-lg border border-gray-200 p-5 sm:p-6 hover:shadow-md transition-shadow flex flex-col relative"
            >
              {canManage && (
                <div className="absolute top-3 right-3">
                  <button
                    type="button"
                    onClick={() => setMenuOpenId(menuOpenId === item.id ? null : item.id)}
                    className="p-1.5 rounded text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                    aria-label="Options"
                  >
                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z" />
                    </svg>
                  </button>
                  {menuOpenId === item.id && (
                    <>
                      <div className="fixed inset-0 z-10" onClick={() => setMenuOpenId(null)} aria-hidden="true" />
                      <div className="absolute right-0 top-full mt-1 py-1 w-36 bg-white rounded-lg border border-gray-200 shadow-lg z-20">
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
                <h3 className="text-lg font-semibold text-gray-900 mb-2">{item.title}</h3>
                {item.description && (
                  <p className="text-sm text-gray-600 line-clamp-2 mb-4">{item.description}</p>
                )}
                {(item.tags || []).length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {item.tags.map((tag, index) => (
                      <span key={index} className="px-2 py-0.5 text-xs bg-gray-100 text-gray-600 rounded">
                        {tag}
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
          <div className="col-span-full text-center py-12 bg-white rounded-lg border border-gray-200">
            <p className="text-gray-500">No items match your filter or search.</p>
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
