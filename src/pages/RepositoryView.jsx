import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useSupabase } from '../context/supabase.jsx';
import { getRepositoryItemBySlug } from '../data/officialRepository.js';
import { permissions } from '../utils/rolePermissions.js';
import RepositoryFormModal from '../components/RepositoryFormModal.jsx';
import { toast } from 'react-hot-toast';

const PRIMARY = '#6795BE';

export default function RepositoryView() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const { supabase, userRole } = useSupabase();
  const [item, setItem] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showEditModal, setShowEditModal] = useState(false);

  const canManage = permissions.canEditRepository(userRole);

  useEffect(() => {
    let cancelled = false;
    async function fetchItem() {
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from('repository_items')
          .select('id, slug, title, type, description, tags, content, updated_at')
          .eq('slug', slug)
          .maybeSingle();
        if (cancelled) return;
        if (!error && data) {
          setItem(data);
          return;
        }
        const staticItem = getRepositoryItemBySlug(slug);
        if (staticItem) {
          setItem({ ...staticItem, id: `static-${slug}`, isStatic: true });
        } else {
          setItem(null);
        }
      } catch (_) {
        if (cancelled) return;
        const staticItem = getRepositoryItemBySlug(slug);
        setItem(staticItem ? { ...staticItem, id: `static-${slug}`, isStatic: true } : null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    fetchItem();
    return () => { cancelled = true; };
  }, [slug, supabase]);

  const handleEditSuccess = async (payload) => {
    if (item?.isStatic) {
      toast.error('Seeded items cannot be edited from the UI.');
      return;
    }
    const { id, slug: _s, title, type, description, tags, content } = payload;
    const { error } = await supabase
      .from('repository_items')
      .update({ title, type, description, tags: tags || [], content: content || '' })
      .eq('id', id);
    if (error) throw error;
    toast.success('Updated.');
    setItem((prev) => (prev ? { ...prev, title, type, description, tags: tags || [], content } : null));
    setShowEditModal(false);
  };

  if (loading) {
    return (
      <div className="w-full flex items-center justify-center py-12">
        <div className="text-gray-600">Loading…</div>
      </div>
    );
  }

  if (!item) {
    return (
      <div className="w-full space-y-4">
        <button
          type="button"
          onClick={() => navigate('/repository')}
          className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
          Back
        </button>
        <p className="text-gray-500">Repository item not found.</p>
      </div>
    );
  }

  return (
    <div className="w-full space-y-4 sm:space-y-6">
      <div className="flex items-center gap-2 text-sm">
        <button
          type="button"
          onClick={() => navigate('/repository')}
          className="flex items-center gap-1.5 text-gray-600 hover:text-gray-900 focus:outline-none"
          aria-label="Back to repository"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
          <span>Back</span>
        </button>
        <span className="text-gray-400">/</span>
        <span className="text-gray-500">repository</span>
        <span className="text-gray-400">/</span>
        <span className="font-medium text-gray-900" style={{ color: PRIMARY }}>
          {item.title}
        </span>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
        <div className="p-6 sm:p-8">
          <div className="flex justify-between items-start gap-4">
            <div className="flex-1 min-w-0">
              <h1 className="text-2xl font-bold text-gray-900" style={{ color: PRIMARY }}>
                {item.title}
              </h1>
              {item.description && (
                <p className="mt-2 text-base text-gray-600">{item.description}</p>
              )}
              {item.tags && item.tags.length > 0 && (
                <div className="mt-4 flex flex-wrap gap-2">
                  {item.tags.map((tag, index) => (
                    <span
                      key={index}
                      className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-700"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              )}
            </div>
            {canManage && !item.isStatic && (
              <button
                type="button"
                onClick={() => setShowEditModal(true)}
                className="shrink-0 px-4 py-2 rounded-lg text-sm font-medium text-white hover:opacity-90"
                style={{ backgroundColor: PRIMARY }}
              >
                Edit
              </button>
            )}
          </div>
          <hr className="my-6 border-gray-200" />
          <div
            className="prose prose-sm max-w-none text-gray-700 repository-content"
            dangerouslySetInnerHTML={{ __html: item.content || '' }}
          />
        </div>
      </div>

      {canManage && (
        <RepositoryFormModal
          open={showEditModal}
          onClose={() => setShowEditModal(false)}
          initialItem={item}
          onSuccess={handleEditSuccess}
        />
      )}
    </div>
  );
}
