import { useState, useEffect } from 'react';
import ReactQuill from 'react-quill-new';
import 'react-quill-new/dist/quill.snow.css';
import Modal from './Modal.jsx';

const PRIMARY = '#6795BE';

const TYPE_OPTIONS = [
  { value: 'document', label: 'Document', description: 'SOPs, guides, text-based resources' },
  { value: 'video', label: 'Video', description: 'Tutorials, recordings, screen captures' },
  { value: 'reference', label: 'Reference', description: 'Links, external resources, quick reference' },
];

const COURSE_PRICE_STATUS_OPTIONS = [
  { value: 'in-progress', label: '⏳ In progress' },
  { value: 'double-checked', label: '✅ Double Checked' },
];

function slugFromTitle(title) {
  return (title || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

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

export default function RepositoryFormModal({ open, onClose, initialItem, onSuccess }) {
  const isEdit = !!initialItem?.id;
  const isCoursePriceTable = initialItem?.slug === 'course-price-table';
  const [title, setTitle] = useState('');
  const [type, setType] = useState('document');
  const [tagsInput, setTagsInput] = useState('');
  const [description, setDescription] = useState('');
  const [content, setContent] = useState('');
  const [tableRows, setTableRows] = useState([]);
  const [legendHtml, setLegendHtml] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    if (initialItem) {
      setTitle(initialItem.title || '');
      setType(initialItem.type || 'document');
      setTagsInput(Array.isArray(initialItem.tags) ? initialItem.tags.join(', ') : (initialItem.tags || ''));
      setDescription(initialItem.description || '');
      setContent(initialItem.content || '');
      if (initialItem.slug === 'course-price-table' && initialItem.content) {
        const { legendHtml: leg, rows } = parseCoursePriceTableContent(initialItem.content);
        setLegendHtml(leg);
        setTableRows(rows.length ? rows : []);
      } else {
        setLegendHtml('');
        setTableRows([]);
      }
    } else {
      setTitle('');
      setType('document');
      setTagsInput('');
      setDescription('');
      setContent('');
      setLegendHtml('');
      setTableRows([]);
    }
    setError('');
  }, [open, initialItem]);

  const tagsArray = tagsInput.split(',').map((t) => t.trim()).filter(Boolean);
  const contentTrimmed = content.replace(/<[^>]*>/g, '').trim();
  const hasContent = isCoursePriceTable && isEdit && tableRows.length > 0 ? true : contentTrimmed.length > 0;
  const isComplete = title.trim() && type && description.trim() && hasContent;
  const isDisabled = !isComplete || saving;

  const handleTableRowChange = (index, field, value) => {
    setTableRows((prev) => {
      const next = [...prev];
      if (!next[index]) return prev;
      next[index] = { ...next[index], [field]: value };
      return next;
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!onSuccess || isDisabled) return;
    setSaving(true);
    setError('');
    try {
      let finalContent = content.trim() || '';
      if (isCoursePriceTable && isEdit && tableRows.length > 0) {
        finalContent = buildCoursePriceTableContent(legendHtml, tableRows);
      }
      const payload = {
        title: title.trim(),
        type,
        description: description.trim(),
        tags: tagsArray,
        content: finalContent,
      };
      if (!isEdit) {
        payload.slug = slugFromTitle(title) || `item-${Date.now()}`;
      }
      await onSuccess(isEdit ? { ...initialItem, ...payload } : payload);
      onClose();
    } catch (err) {
      setError(err?.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const quillModules = {
    toolbar: [
      [{ header: [1, 2, 3, 4, 5, 6, false] }],
      ['bold', 'italic', 'underline', 'strike'],
      [{ list: 'ordered' }, { list: 'bullet' }],
      ['link', 'image'],
      [{ align: [] }],
      ['clean'],
    ],
  };

  const quillFormats = [
    'header', 'bold', 'italic', 'underline', 'strike',
    'list', 'link', 'image', 'align',
  ];

  if (!open) return null;

  return (
    <Modal open={open} onClose={onClose} zIndexClassName="z-[10000]">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        <div className="p-5 border-b border-gray-200 shrink-0">
          <div className="flex justify-between items-center">
            <h2 className="text-lg font-semibold text-gray-900" style={{ color: PRIMARY }}>
              {isEdit ? 'Edit repository item' : 'Create new repository item'}
            </h2>
            <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1">
              ✕
            </button>
          </div>
        </div>
        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0 overflow-hidden">
          <div className="p-5 space-y-4 overflow-y-auto flex-1">
            {error && (
              <div className="p-3 rounded-lg bg-red-50 text-red-700 text-sm">
                {error}
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Title *</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Daily Tasks"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-[#6795BE] focus:border-transparent"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Type *</label>
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

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Description *</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Short description for the card"
                rows={2}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-[#6795BE] focus:border-transparent resize-none"
              />
            </div>

            {!isCoursePriceTable || !isEdit || tableRows.length === 0 ? (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Content *</label>
                <div className="rounded-lg border border-gray-300 overflow-hidden focus-within:ring-2 focus-within:ring-[#6795BE] focus-within:border-transparent">
                  <ReactQuill
                    theme="snow"
                    value={content}
                    onChange={setContent}
                    modules={quillModules}
                    formats={quillFormats}
                    placeholder="e.g. Acme is a leading corp..."
                    className="bg-white"
                    style={{ minHeight: 200 }}
                  />
                </div>
              </div>
            ) : null}

            {isCoursePriceTable && isEdit && tableRows.length > 0 && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Table data (edit dropdown, notes, checked by)</label>
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
                <p className="mt-1 text-xs text-gray-500">Changes here are saved to the database when you click Update.</p>
              </div>
            )}
          </div>
          <div className="p-5 border-t border-gray-200 shrink-0 flex justify-end">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 mr-2"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isDisabled}
              className="px-4 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ backgroundColor: PRIMARY }}
            >
              {saving ? 'Saving…' : isEdit ? 'Update' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </Modal>
  );
}
