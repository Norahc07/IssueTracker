import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { toast } from 'react-hot-toast';
import { useSupabase } from '../context/supabase.jsx';

const PRIMARY = '#6795BE';

const DEFAULT_UDEMY_COURSES = [
  {
    title: 'Neuroplasticity Training: Sculpt Your Brain Like a Pro Fast',
    link: 'https://www.udemy.com/course/neuroplasticity-training-sculpt-your-brain-like-a-pro-fast/?couponCode=760C65C87C00E11C16BD',
  },
  {
    title: 'Brain Power- The Neuroscience of Peak Mental Performance',
    link: 'https://www.udemy.com/course/brain-power-the-neuroscience-of-peak-mental-performance/?couponCode=6622EA28A93AB600F562',
  },
  {
    title: 'University/College Students Memory Training Course',
    link: 'https://www.udemy.com/course/university-college-students-memory-training-course/?couponCode=69E0371D67C3E9577607',
  },
  {
    title: 'Public Speaking Memory Technique- Memorize Your Talks Easily',
    link: 'https://www.udemy.com/course/public-speaking-memory-technique/?couponCode=A59009E3D2ED2643DEB3',
  },
  {
    title: 'Memory Training- Memorize & Remember Names & Faces Easily',
    link: 'https://www.udemy.com/course/how-to-remember-names-faces/?couponCode=47533687969BD1E235C2',
  },
  {
    title: 'How to Study – Master Smart Study Habits in Just 7 Days',
    link: 'https://www.udemy.com/course/how-to-study-master-smart-study-habits/?couponCode=4F36B4CCD3B7EBEE66F4',
  },
  {
    title: 'Method of Loci: Master This Ancient Memory Skills in 7 Days',
    link: 'https://www.udemy.com/course/method-of-loci-master-method-of-loci/?couponCode=DCA2EC72651BF52A84F7',
  },
  {
    title: 'Memory Palace Masterclass: Detailed Memory Palace Blueprint',
    link: 'https://www.udemy.com/course/memory-palace-masterclass-memory-palace/?couponCode=9B4E898B2C8E437219D2',
  },
];

const ROTATION_REVIEW_STATUS = ['Not Started', 'In Progress', 'Completed'];
const ROTATION_SCREENSHOT_STATUS = ['Pending', 'Done'];
const INTERN_REVIEW_STATUS = ['', 'in-progress', 'done'];
const INTERN_REVIEW_LABELS = { '': '—', 'in-progress': 'In Progress', done: 'Done' };

export default function UdemyCourseTab() {
  const { supabase, user } = useSupabase();
  const [activeSubTab, setActiveSubTab] = useState('rotation'); // 'rotation' | 'intern'

  const [batches, setBatches] = useState([]);
  const [selectedBatchId, setSelectedBatchId] = useState('');
  const selectedBatch = useMemo(() => batches.find((b) => b.id === selectedBatchId) || null, [batches, selectedBatchId]);

  // Rotation tracker
  const [rotationRows, setRotationRows] = useState([]);
  const [rotationLoading, setRotationLoading] = useState(false);
  const [showRotationModal, setShowRotationModal] = useState(false);
  const [rotationCreate, setRotationCreate] = useState({
    course_link: '',
    course_title: '',
    assigned_intern: '',
    day: '',
    review_status: 'Not Started',
    screenshot_status: 'Pending',
  });
  const [rotationSaving, setRotationSaving] = useState(false);

  // Intern tracker
  const [internNames, setInternNames] = useState([]);
  const [nameModalOpen, setNameModalOpen] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const [internStatusMap, setInternStatusMap] = useState({}); // key: `${course}|${nameId}` -> status
  const [internLoading, setInternLoading] = useState(false);

  const fetchBatches = async () => {
    const { data, error } = await supabase.from('udemy_batches').select('*').order('batch_no', { ascending: false });
    if (error) {
      console.warn('udemy_batches fetch error', error);
      toast.error('Could not load Udemy batches. Run udemy_course_migration.sql in Supabase.');
      setBatches([]);
      return;
    }
    const list = Array.isArray(data) ? data : [];
    setBatches(list);
    if (!selectedBatchId && list[0]?.id) setSelectedBatchId(list[0].id);
  };

  const fetchRotationRows = async (batchId) => {
    if (!batchId) {
      setRotationRows([]);
      return;
    }
    setRotationLoading(true);
    try {
      const { data, error } = await supabase
        .from('udemy_rotation_assignments')
        .select('*')
        .eq('batch_id', batchId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      setRotationRows(Array.isArray(data) ? data : []);
    } catch (err) {
      console.warn('udemy_rotation_assignments fetch error', err);
      toast.error('Could not load course assignments.');
      setRotationRows([]);
    } finally {
      setRotationLoading(false);
    }
  };

  const fetchInternTracker = async (batchId) => {
    if (!batchId) {
      setInternNames([]);
      setInternStatusMap({});
      return;
    }
    setInternLoading(true);
    try {
      const [{ data: names, error: namesErr }, { data: statuses, error: statusesErr }] = await Promise.all([
        supabase.from('udemy_intern_names').select('*').eq('batch_id', batchId).order('name', { ascending: true }),
        supabase.from('udemy_intern_course_status').select('*').eq('batch_id', batchId),
      ]);
      if (namesErr) throw namesErr;
      if (statusesErr) throw statusesErr;
      const n = Array.isArray(names) ? names : [];
      setInternNames(n);
      const map = {};
      (Array.isArray(statuses) ? statuses : []).forEach((row) => {
        const k = `${row.course_title}|${row.name_id}`;
        map[k] = row.status || '';
      });
      setInternStatusMap(map);
    } catch (err) {
      console.warn('Intern tracker fetch error', err);
      toast.error('Could not load intern tracker.');
      setInternNames([]);
      setInternStatusMap({});
    } finally {
      setInternLoading(false);
    }
  };

  useEffect(() => {
    if (!user?.id) return;
    fetchBatches();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  useEffect(() => {
    if (activeSubTab === 'rotation') fetchRotationRows(selectedBatchId);
    if (activeSubTab === 'intern') fetchInternTracker(selectedBatchId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSubTab, selectedBatchId]);

  const handleAddBatch = async () => {
    const raw = window.prompt('Enter batch number (e.g. Batch 7):');
    const batchNo = (raw || '').trim();
    if (!batchNo) return;
    try {
      const { data, error } = await supabase
        .from('udemy_batches')
        .insert({ batch_no: batchNo })
        .select('*')
        .single();
      if (error) throw error;
      toast.success('Batch added.');
      await fetchBatches();
      if (data?.id) setSelectedBatchId(data.id);
    } catch (err) {
      console.warn('Add batch error', err);
      toast.error(err?.message || 'Failed to add batch.');
    }
  };

  const handleCreateRotationRow = async (e) => {
    e.preventDefault();
    if (!selectedBatchId) {
      toast.error('Select a batch first.');
      return;
    }
    const courseTitle = (rotationCreate.course_title || '').trim();
    const courseLink = (rotationCreate.course_link || '').trim();
    if (!courseTitle || !courseLink) {
      toast.error('Course title and course link are required.');
      return;
    }

    try {
      setRotationSaving(true);

      const payload = {
        batch_id: selectedBatchId,
        course_link: courseLink,
        course_title: courseTitle,
        assigned_intern: (rotationCreate.assigned_intern || '').trim() || null,
        day: (rotationCreate.day || '').trim() || null,
        review_status: rotationCreate.review_status || 'Not Started',
        screenshot_status: rotationCreate.screenshot_status || 'Pending',
      };

      const { error } = await supabase.from('udemy_rotation_assignments').insert(payload);
      if (error) throw error;
      toast.success('Course assignment added.');
      setShowRotationModal(false);
      setRotationCreate({
        course_link: '',
        course_title: '',
        assigned_intern: '',
        day: '',
        review_status: 'Not Started',
        screenshot_status: 'Pending',
      });
      await fetchRotationRows(selectedBatchId);
    } catch (err) {
      console.warn('Create rotation row error', err);
      toast.error(err?.message || 'Failed to add assignment.');
    } finally {
      setRotationSaving(false);
    }
  };

  const handleUpdateRotationRow = async (rowId, patch) => {
    if (!rowId || !patch || typeof patch !== 'object') return;
    // Optimistic UI
    setRotationRows((prev) => prev.map((r) => (r.id === rowId ? { ...r, ...patch } : r)));
    try {
      const { error } = await supabase
        .from('udemy_rotation_assignments')
        .update({ ...patch, updated_at: new Date().toISOString() })
        .eq('id', rowId);
      if (error) throw error;
    } catch (err) {
      console.warn('Update rotation row error', err);
      toast.error(err?.message || 'Failed to update row.');
      await fetchRotationRows(selectedBatchId);
    }
  };

  const handleAddInternName = async () => {
    if (!selectedBatchId) {
      toast.error('Select a batch first.');
      return;
    }
    const name = (nameDraft || '').trim();
    if (!name) return;
    try {
      const { error } = await supabase.from('udemy_intern_names').insert({ batch_id: selectedBatchId, name });
      if (error) throw error;
      toast.success('Name added.');
      setNameDraft('');
      await fetchInternTracker(selectedBatchId);
    } catch (err) {
      console.warn('Add name error', err);
      toast.error(err?.message || 'Failed to add name.');
    }
  };

  const handleRenameInternName = async (row) => {
    if (!row?.id) return;
    const next = window.prompt('Edit name:', row.name || '');
    const name = (next || '').trim();
    if (!name) return;
    try {
      const { error } = await supabase.from('udemy_intern_names').update({ name, updated_at: new Date().toISOString() }).eq('id', row.id);
      if (error) throw error;
      toast.success('Name updated.');
      await fetchInternTracker(selectedBatchId);
    } catch (err) {
      console.warn('Rename name error', err);
      toast.error(err?.message || 'Failed to update name.');
    }
  };

  const handleDeleteInternName = async (row) => {
    if (!row?.id) return;
    const ok = window.confirm(`Delete "${row.name}" column? This will also remove its statuses.`);
    if (!ok) return;
    try {
      // statuses are ON DELETE CASCADE via FK
      const { error } = await supabase.from('udemy_intern_names').delete().eq('id', row.id);
      if (error) throw error;
      toast.success('Name deleted.');
      await fetchInternTracker(selectedBatchId);
    } catch (err) {
      console.warn('Delete name error', err);
      toast.error(err?.message || 'Failed to delete name.');
    }
  };

  const handleCellStatusChange = async (courseTitle, nameId, nextStatus) => {
    if (!selectedBatchId || !courseTitle || !nameId) return;
    const status = (nextStatus || '').trim();
    const key = `${courseTitle}|${nameId}`;

    // Optimistic UI
    setInternStatusMap((m) => ({ ...m, [key]: status }));

    try {
      if (!status) {
        const { error } = await supabase
          .from('udemy_intern_course_status')
          .delete()
          .eq('batch_id', selectedBatchId)
          .eq('course_title', courseTitle)
          .eq('name_id', nameId);
        if (error) throw error;
        return;
      }
      const { error } = await supabase
        .from('udemy_intern_course_status')
        .upsert(
          {
            batch_id: selectedBatchId,
            course_title: courseTitle,
            name_id: nameId,
            status,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'batch_id,course_title,name_id' }
        );
      if (error) throw error;
    } catch (err) {
      console.warn('Cell update error', err);
      toast.error(err?.message || 'Failed to save status.');
      await fetchInternTracker(selectedBatchId);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-gray-900" style={{ color: PRIMARY }}>
            Udemy Course
          </h2>
          <p className="mt-1 text-sm text-gray-600">Track assignments and course review progress per batch.</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="min-w-[220px]">
            <label className="block text-xs font-medium text-gray-700 mb-1">Batch</label>
            <select
              value={selectedBatchId}
              onChange={(e) => setSelectedBatchId(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-2 py-1.5 text-xs"
            >
              <option value="">Select batch…</option>
              {batches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.batch_no}
                </option>
              ))}
            </select>
          </div>
          <button
            type="button"
            onClick={handleAddBatch}
            className="mt-5 px-3 py-2 rounded-lg text-xs font-medium text-white"
            style={{ backgroundColor: PRIMARY }}
          >
            Add batch
          </button>
        </div>
      </div>

      <div className="flex gap-2 border-b border-gray-200">
        <button
          type="button"
          onClick={() => setActiveSubTab('rotation')}
          className={`px-4 py-2 rounded-t-lg text-sm font-medium transition-colors ${
            activeSubTab === 'rotation'
              ? 'bg-white border border-b-0 border-gray-200 -mb-px'
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}
          style={activeSubTab === 'rotation' ? { borderTopColor: PRIMARY } : {}}
        >
          Rotation tracker
        </button>
        <button
          type="button"
          onClick={() => setActiveSubTab('intern')}
          className={`px-4 py-2 rounded-t-lg text-sm font-medium transition-colors ${
            activeSubTab === 'intern'
              ? 'bg-white border border-b-0 border-gray-200 -mb-px'
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}
          style={activeSubTab === 'intern' ? { borderTopColor: PRIMARY } : {}}
        >
          Intern Tracker
        </button>
      </div>

      {activeSubTab === 'rotation' && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-lg font-semibold text-gray-900" style={{ color: PRIMARY }}>
              Course Assignment
            </h3>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setShowRotationModal(true)}
                disabled={!selectedBatchId}
                className="px-4 py-2 rounded-lg text-xs font-medium text-white disabled:opacity-60"
                style={{ backgroundColor: PRIMARY }}
              >
                Add course
              </button>
            </div>
          </div>

          {showRotationModal &&
            createPortal(
              <div
                className="fixed inset-0 z-[10000] bg-black/10 backdrop-blur-sm flex justify-end"
                onMouseDown={(e) => {
                  if (e.target === e.currentTarget) setShowRotationModal(false);
                }}
              >
                {/* Right slide-over panel (full viewport height) */}
                <div
                  className="h-screen w-full max-w-md bg-white shadow-2xl border-l border-gray-200 flex flex-col"
                  onMouseDown={(e) => e.stopPropagation()}
                >
                  <div className="px-4 py-3 border-b border-gray-200 flex items-start justify-between gap-3">
                    <div>
                      <h4 className="text-lg font-semibold text-gray-900">Add course assignment</h4>
                      <p className="mt-1 text-sm text-gray-600">
                        Batch: <span className="font-medium">{selectedBatch?.batch_no || '—'}</span>
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowRotationModal(false)}
                      className="px-3 py-1.5 rounded-lg text-xs bg-gray-100 text-gray-700 hover:bg-gray-200"
                    >
                      Close
                    </button>
                  </div>

                  <div className="flex-1 overflow-y-auto px-4 py-3">
                    <form onSubmit={handleCreateRotationRow} className="space-y-4">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-medium text-gray-700 mb-1">
                            Course link <span className="text-red-500">*</span>
                          </label>
                          <input
                            type="url"
                            value={rotationCreate.course_link}
                            onChange={(e) => setRotationCreate((s) => ({ ...s, course_link: e.target.value }))}
                            className="w-full rounded-lg border border-gray-300 px-2 py-1.5 text-xs"
                            placeholder="https://www.udemy.com/course/..."
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-700 mb-1">
                            Course title <span className="text-red-500">*</span>
                          </label>
                          <input
                            type="text"
                            value={rotationCreate.course_title}
                            onChange={(e) => setRotationCreate((s) => ({ ...s, course_title: e.target.value }))}
                            className="w-full rounded-lg border border-gray-300 px-2 py-1.5 text-xs"
                            placeholder="Course title"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-medium text-gray-700 mb-1">Assigned intern</label>
                          <input
                            type="text"
                            value={rotationCreate.assigned_intern}
                            onChange={(e) => setRotationCreate((s) => ({ ...s, assigned_intern: e.target.value }))}
                            className="w-full rounded-lg border border-gray-300 px-2 py-1.5 text-xs"
                            placeholder="Intern name"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-700 mb-1">Day</label>
                          <input
                            type="text"
                            value={rotationCreate.day}
                            onChange={(e) => setRotationCreate((s) => ({ ...s, day: e.target.value }))}
                            className="w-full rounded-lg border border-gray-300 px-2 py-1.5 text-xs"
                            placeholder="e.g. Day 1"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-medium text-gray-700 mb-1">Review status</label>
                          <select
                            value={rotationCreate.review_status}
                            onChange={(e) => setRotationCreate((s) => ({ ...s, review_status: e.target.value }))}
                            className="w-full rounded-lg border border-gray-300 px-2 py-1.5 text-xs"
                          >
                            {ROTATION_REVIEW_STATUS.map((s) => (
                              <option key={s} value={s}>
                                {s}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-700 mb-1">Screenshot status</label>
                          <select
                            value={rotationCreate.screenshot_status}
                            onChange={(e) => setRotationCreate((s) => ({ ...s, screenshot_status: e.target.value }))}
                            className="w-full rounded-lg border border-gray-300 px-2 py-1.5 text-xs"
                          >
                            {ROTATION_SCREENSHOT_STATUS.map((s) => (
                              <option key={s} value={s}>
                                {s}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>
                    </form>
                  </div>

                  <div className="px-4 py-3 border-t border-gray-200 flex items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setShowRotationModal(false)}
                      className="px-4 py-2 rounded-lg text-xs font-medium bg-gray-100 text-gray-700 hover:bg-gray-200"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleCreateRotationRow}
                      disabled={rotationSaving}
                      className="px-4 py-2 rounded-lg text-xs font-medium text-white disabled:opacity-60"
                      style={{ backgroundColor: PRIMARY }}
                    >
                      {rotationSaving ? 'Saving…' : 'Save'}
                    </button>
                  </div>
                </div>
              </div>,
              document.body
            )}

          <div className="bg-white rounded-lg border border-gray-200 overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              {rotationLoading ? (
                <div className="py-8 text-center text-sm text-gray-500">Loading assignments…</div>
              ) : rotationRows.length === 0 ? (
                <div className="py-8 text-center text-sm text-gray-500">
                  {selectedBatch ? 'No assignments yet for this batch.' : 'Select a batch to view assignments.'}
                </div>
              ) : (
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Batch No.</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Course Link</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Course Title</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Assigned Intern</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Day</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Review Status</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Screenshot Status</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {rotationRows.map((row) => (
                      <tr key={row.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 text-sm text-gray-900">{selectedBatch?.batch_no || '—'}</td>
                        <td className="px-4 py-3 text-sm text-gray-600 max-w-xs">
                          {row.course_link ? (
                            <a
                              className="text-blue-600 hover:underline inline-block max-w-xs truncate"
                              href={row.course_link}
                              target="_blank"
                              rel="noreferrer"
                              title={row.course_link}
                            >
                              {row.course_link}
                            </a>
                          ) : (
                            '—'
                          )}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600">{row.course_title || '—'}</td>
                        <td className="px-4 py-3 text-sm text-gray-600">{row.assigned_intern || '—'}</td>
                        <td className="px-4 py-3 text-sm text-gray-600">{row.day || '—'}</td>
                        <td className="px-4 py-3 text-sm text-gray-600">
                          <select
                            value={row.review_status || 'Not Started'}
                            onChange={(e) => handleUpdateRotationRow(row.id, { review_status: e.target.value })}
                            className="w-full min-w-[150px] rounded-lg border border-gray-300 px-2 py-1.5 text-xs"
                          >
                            {ROTATION_REVIEW_STATUS.map((s) => (
                              <option key={s} value={s}>
                                {s}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600">
                          <select
                            value={row.screenshot_status || 'Pending'}
                            onChange={(e) => handleUpdateRotationRow(row.id, { screenshot_status: e.target.value })}
                            className="w-full min-w-[140px] rounded-lg border border-gray-300 px-2 py-1.5 text-xs"
                          >
                            {ROTATION_SCREENSHOT_STATUS.map((s) => (
                              <option key={s} value={s}>
                                {s}
                              </option>
                            ))}
                          </select>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}

      {activeSubTab === 'intern' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-lg font-semibold text-gray-900" style={{ color: PRIMARY }}>
                Udemy review
              </h3>
              <p className="mt-1 text-sm text-gray-600">
                Rows are default courses; columns are intern names. Pick a batch to view/edit statuses.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setNameModalOpen(true)}
              className="px-4 py-2 rounded-lg text-xs font-medium text-white"
              style={{ backgroundColor: PRIMARY }}
              disabled={!selectedBatchId}
            >
              Manage names
            </button>
          </div>

          {nameModalOpen &&
            createPortal(
              <div
                className="fixed inset-0 z-[10000] bg-black/20 backdrop-blur-sm flex items-center justify-center px-4"
                role="dialog"
                aria-modal="true"
                onMouseDown={(e) => {
                  if (e.target === e.currentTarget) setNameModalOpen(false);
                }}
              >
                <div
                  className="w-full max-w-xl max-h-[90vh] bg-white rounded-xl shadow-lg border border-gray-200 p-4 flex flex-col"
                  onMouseDown={(e) => e.stopPropagation()}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h4 className="text-lg font-semibold text-gray-900">Intern names</h4>
                      <p className="mt-1 text-sm text-gray-600">
                        Batch: <span className="font-medium">{selectedBatch?.batch_no || '—'}</span>
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setNameModalOpen(false)}
                      className="px-3 py-2 rounded-lg text-sm bg-gray-100 text-gray-700 hover:bg-gray-200"
                    >
                      Close
                    </button>
                  </div>

                  <div className="mt-4 flex items-end gap-2">
                    <div className="flex-1">
                      <label className="block text-xs font-medium text-gray-700 mb-1">Add name</label>
                      <input
                        type="text"
                        value={nameDraft}
                        onChange={(e) => setNameDraft(e.target.value)}
                        className="w-full rounded-lg border border-gray-300 px-2 py-1.5 text-xs"
                        placeholder="e.g. Juan D."
                      />
                    </div>
                    <button
                      type="button"
                      onClick={handleAddInternName}
                      className="px-4 py-2 rounded-lg text-xs font-medium text-white"
                      style={{ backgroundColor: PRIMARY }}
                    >
                      Add
                    </button>
                  </div>

                  <div className="mt-4 border rounded-lg overflow-y-auto">
                    {internNames.length === 0 ? (
                      <div className="p-3 text-sm text-gray-600">No names yet.</div>
                    ) : (
                      <ul className="divide-y divide-gray-200">
                        {internNames.map((n) => (
                          <li key={n.id} className="p-3 flex items-center justify-between gap-3">
                            <span className="text-sm text-gray-900">{n.name}</span>
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => handleRenameInternName(n)}
                                className="px-3 py-1.5 rounded-md text-xs font-medium bg-gray-100 text-gray-700 hover:bg-gray-200"
                              >
                                Edit
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteInternName(n)}
                                className="px-3 py-1.5 rounded-md text-xs font-medium bg-red-50 text-red-700 hover:bg-red-100"
                              >
                                Delete
                              </button>
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              </div>,
              document.body
            )}

          <div className="bg-white rounded-lg border border-gray-200 overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              {internLoading ? (
                <div className="py-8 text-center text-sm text-gray-500">Loading intern tracker…</div>
              ) : !selectedBatchId ? (
                <div className="py-8 text-center text-sm text-gray-500">Select a batch to view the tracker.</div>
              ) : (
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Udemy Courses</th>
                      {internNames.map((n) => (
                        <th key={n.id} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                          {n.name}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {DEFAULT_UDEMY_COURSES.map((course) => (
                      <tr key={course.title} className="hover:bg-gray-50">
                        <td className="px-4 py-3 text-sm text-gray-900 min-w-[420px]">
                          {course.link ? (
                            <a
                              href={course.link}
                              target="_blank"
                              rel="noreferrer"
                              className="text-blue-600 hover:underline"
                            >
                              {course.title}
                            </a>
                          ) : (
                            course.title
                          )}
                        </td>
                        {internNames.map((n) => {
                          const key = `${course.title}|${n.id}`;
                          const v = internStatusMap[key] ?? '';
                          return (
                            <td key={n.id} className="px-4 py-3 text-sm text-gray-600">
                              <select
                                value={v}
                                onChange={(e) => handleCellStatusChange(course.title, n.id, e.target.value)}
                                className="w-full min-w-[140px] rounded-lg border border-gray-300 px-2 py-1.5 text-xs"
                              >
                                {INTERN_REVIEW_STATUS.map((opt) => (
                                  <option key={opt} value={opt}>
                                    {INTERN_REVIEW_LABELS[opt]}
                                  </option>
                                ))}
                              </select>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

