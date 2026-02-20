import { useState, useEffect } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import ReactQuill from 'react-quill-new';
import 'react-quill-new/dist/quill.snow.css';
import { useSupabase } from '../context/supabase.jsx';
import { getRepositoryItemBySlug } from '../data/officialRepository.js';
import { permissions } from '../utils/rolePermissions.js';
import { toast } from 'react-hot-toast';

const PRIMARY = '#6795BE';

/** Set to true to hide repository body content for presentation (title, description, tags remain visible). */
const HIDE_REPOSITORY_CONTENT_FOR_PRESENTATION = true;

const TYPE_OPTIONS = [
  { value: 'document', label: 'Document', description: 'SOPs, guides, text-based resources' },
  { value: 'video', label: 'Video', description: 'Tutorials, recordings, screen captures' },
  { value: 'reference', label: 'Reference', description: 'Links, external resources, quick reference' },
];

const COURSE_PRICE_STATUS_OPTIONS = [
  { value: 'in-progress', label: '⏳ In progress' },
  { value: 'double-checked', label: '✅ Double Checked' },
];

function parseCoursePriceTableContent(html) {
  if (!html || !html.includes('<table')) {
    return { legendHtml: html || '', rows: [] };
  }
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    const table = doc.querySelector('table');
    if (!table) return { legendHtml: html, rows: [] };
    const tableStart = html.indexOf('<table');
    const legendHtml = html.substring(0, tableStart).trim();
    const rows = [];
    table.querySelectorAll('tbody tr').forEach((tr) => {
      const tds = tr.querySelectorAll('td');
      const domain = (tds[0]?.textContent || '').trim();
      const selectEl = tds[1]?.querySelector('select');
      let status = 'in-progress';
      if (selectEl) {
        const selected = selectEl.querySelector('option[selected]') || selectEl.querySelector('option');
        if (selected) status = (selected.getAttribute('value') || 'in-progress').trim();
      }
      const notes = (tds[2]?.textContent || '').trim();
      const checkedBy = (tds[3]?.textContent || '').trim();
      rows.push({ domain, status, notes, checkedBy });
    });
    return { legendHtml, rows };
  } catch (_) {
    return { legendHtml: html, rows: [] };
  }
}

function buildCoursePriceTableContent(legendHtml, rows) {
  const optionHtml = (selected) =>
    COURSE_PRICE_STATUS_OPTIONS.map(
      (o) => `<option value="${o.value}"${o.value === selected ? ' selected' : ''}>${o.label}</option>`
    ).join('');
  const trs = rows
    .map(
      (r) =>
        `<tr>
      <td>${r.domain}</td>
      <td><select>${optionHtml(r.status)}</select></td>
      <td>${r.notes}</td>
      <td>${r.checkedBy}</td>
    </tr>`
    )
    .join('');
  const tableHtml = `<table>
  <thead>
    <tr>
      <th>Domain</th>
      <th>Status</th>
      <th>Notes</th>
      <th>Checked By</th>
    </tr>
  </thead>
  <tbody>
${trs}
  </tbody>
</table>`;
  return (legendHtml ? legendHtml + '\n\n' : '') + tableHtml;
}

const QUILL_MODULES = {
  toolbar: [
    [{ header: [1, 2, 3, 4, 5, 6, false] }],
    ['bold', 'italic', 'underline', 'strike'],
    [{ list: 'ordered' }, { list: 'bullet' }],
    ['link', 'image'],
    [{ align: [] }],
    ['clean'],
  ],
};

const QUILL_FORMATS = [
  'header', 'bold', 'italic', 'underline', 'strike',
  'list', 'link', 'image', 'align',
];

export default function RepositoryView() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { supabase, userRole } = useSupabase();
  const [item, setItem] = useState(null);
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState('');
  const [type, setType] = useState('document');
  const [description, setDescription] = useState('');
  const [tagsInput, setTagsInput] = useState('');
  const [content, setContent] = useState('');
  const [tableRows, setTableRows] = useState([]);
  const [legendHtml, setLegendHtml] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const canManage = permissions.canEditRepository(userRole);
  const isEditing = canManage && item && !item.isStatic && searchParams.get('edit') === '1';
  const isCoursePriceTable = item?.slug === 'course-price-table';

  useEffect(() => {
    let cancelled = false;
    async function fetchItem() {
      setLoading(true);
      try {
        const { data, error: err } = await supabase
          .from('repository_items')
          .select('id, slug, title, type, description, tags, content, updated_at')
          .eq('slug', slug)
          .maybeSingle();
        if (cancelled) return;
        if (!err && data) {
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

  // Sync form state when entering edit mode or when item loads in edit mode
  useEffect(() => {
    if (!item || !isEditing) return;
    setTitle(item.title || '');
    setType(item.type || 'document');
    setDescription(item.description || '');
    setTagsInput(Array.isArray(item.tags) ? item.tags.join(', ') : (item.tags || ''));
    setContent(item.content || '');
    if (item.slug === 'course-price-table' && item.content) {
      const { legendHtml: leg, rows } = parseCoursePriceTableContent(item.content);
      setLegendHtml(leg);
      setTableRows(rows.length ? rows : []);
    } else {
      setLegendHtml('');
      setTableRows([]);
    }
    setError('');
  }, [item?.id, isEditing]);

  const handleTableRowChange = (index, field, value) => {
    setTableRows((prev) => {
      const next = [...prev];
      if (!next[index]) return prev;
      next[index] = { ...next[index], [field]: value };
      return next;
    });
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (item?.isStatic || !item?.id || String(item.id).startsWith('static-')) {
      toast.error('This item cannot be edited.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const tagsArray = tagsInput.split(',').map((t) => t.trim()).filter(Boolean);
      let finalContent = content.trim() || '';
      if (isCoursePriceTable && tableRows.length > 0) {
        finalContent = buildCoursePriceTableContent(legendHtml, tableRows);
      }
      const { error: updateErr } = await supabase
        .from('repository_items')
        .update({
          title: title.trim(),
          type,
          description: description.trim(),
          tags: tagsArray,
          content: finalContent,
        })
        .eq('id', item.id);
      if (updateErr) throw updateErr;
      toast.success('Updated.');
      setItem((prev) => (prev ? {
        ...prev,
        title: title.trim(),
        type,
        description: description.trim(),
        tags: tagsArray,
        content: finalContent,
      } : null));
      setSearchParams({});
    } catch (err) {
      setError(err?.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const handleCancelEdit = () => {
    setSearchParams({});
    setError('');
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
          {isEditing ? (
            <form onSubmit={handleSave} className="space-y-6">
              {error && (
                <div className="p-3 rounded-lg bg-red-50 text-red-700 text-sm">
                  {error}
                </div>
              )}

              <div className="flex justify-between items-start gap-4">
                <div className="flex-1 min-w-0 space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Title</label>
                    <input
                      type="text"
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      placeholder="e.g. Daily Tasks"
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-[#6795BE] focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                    <textarea
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder="Short description"
                      rows={2}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-[#6795BE] focus:border-transparent resize-none"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
                    <select
                      value={type}
                      onChange={(e) => setType(e.target.value)}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-[#6795BE] focus:border-transparent"
                    >
                      {TYPE_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label} — {opt.description}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Tags</label>
                    <input
                      type="text"
                      value={tagsInput}
                      onChange={(e) => setTagsInput(e.target.value)}
                      placeholder="Comma-separated, e.g. sop, tasks, daily"
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-[#6795BE] focus:border-transparent"
                    />
                  </div>
                </div>
                <div className="shrink-0 flex gap-2">
                  <button
                    type="button"
                    onClick={handleCancelEdit}
                    className="px-4 py-2 rounded-lg text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={saving}
                    className="px-4 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-50 disabled:cursor-not-allowed"
                    style={{ backgroundColor: PRIMARY }}
                  >
                    {saving ? 'Saving…' : 'Update'}
                  </button>
                </div>
              </div>

              <hr className="border-gray-200" />

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Content</label>
                {!isCoursePriceTable || tableRows.length === 0 ? (
                  <div className="rounded-lg border border-gray-300 overflow-hidden focus-within:ring-2 focus-within:ring-[#6795BE] focus-within:border-transparent">
                    <ReactQuill
                      theme="snow"
                      value={content}
                      onChange={setContent}
                      modules={QUILL_MODULES}
                      formats={QUILL_FORMATS}
                      placeholder="Rich text content..."
                      className="bg-white"
                      style={{ minHeight: 200 }}
                    />
                  </div>
                ) : null}
                {isCoursePriceTable && tableRows.length > 0 && (
                  <div className="mt-4">
                    <div className="rounded-lg border border-gray-300 overflow-x-auto max-h-80 overflow-y-auto">
                      <table className="w-full text-sm border-collapse">
                        <thead>
                          <tr className="bg-gray-100 sticky top-0">
                            <th className="border border-gray-200 px-2 py-1.5 text-left font-semibold">Domain</th>
                            <th className="border border-gray-200 px-2 py-1.5 text-left font-semibold">Status</th>
                            <th className="border border-gray-200 px-2 py-1.5 text-left font-semibold">Notes</th>
                            <th className="border border-gray-200 px-2 py-1.5 text-left font-semibold">Checked By</th>
                          </tr>
                        </thead>
                        <tbody>
                          {tableRows.map((row, index) => (
                            <tr key={index} className="bg-white">
                              <td className="border border-gray-200 px-2 py-1 text-gray-700">{row.domain}</td>
                              <td className="border border-gray-200 p-0">
                                <select
                                  value={row.status}
                                  onChange={(e) => handleTableRowChange(index, 'status', e.target.value)}
                                  className="w-full border-0 rounded-none px-2 py-1.5 text-sm focus:ring-2 focus:ring-[#6795BE] bg-white"
                                >
                                  {COURSE_PRICE_STATUS_OPTIONS.map((o) => (
                                    <option key={o.value} value={o.value}>{o.label}</option>
                                  ))}
                                </select>
                              </td>
                              <td className="border border-gray-200 p-0">
                                <input
                                  type="text"
                                  value={row.notes}
                                  onChange={(e) => handleTableRowChange(index, 'notes', e.target.value)}
                                  className="w-full border-0 rounded-none px-2 py-1.5 text-sm focus:ring-2 focus:ring-[#6795BE]"
                                  placeholder="Notes"
                                />
                              </td>
                              <td className="border border-gray-200 p-0">
                                <input
                                  type="text"
                                  value={row.checkedBy}
                                  onChange={(e) => handleTableRowChange(index, 'checkedBy', e.target.value)}
                                  className="w-full border-0 rounded-none px-2 py-1.5 text-sm focus:ring-2 focus:ring-[#6795BE]"
                                  placeholder="Checked by"
                                />
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <p className="mt-1 text-xs text-gray-500">Table changes are saved when you click Update.</p>
                  </div>
                )}
              </div>
            </form>
          ) : (
            <>
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
                    onClick={() => setSearchParams({ edit: '1' })}
                    className="shrink-0 px-4 py-2 rounded-lg text-sm font-medium text-white hover:opacity-90"
                    style={{ backgroundColor: PRIMARY }}
                  >
                    Edit
                  </button>
                )}
              </div>
              <hr className="my-6 border-gray-200" />
              {HIDE_REPOSITORY_CONTENT_FOR_PRESENTATION ? (
                <div className="py-8 text-center text-gray-400 text-sm border border-dashed border-gray-200 rounded-lg bg-gray-50/50">
                  Content is displayed here.
                </div>
              ) : (
                <div
                  className="prose prose-sm max-w-none text-gray-700 repository-content repository-content-view-only"
                  dangerouslySetInnerHTML={{ __html: item.content || '' }}
                />
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
