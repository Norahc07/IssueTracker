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
  const { supabase, user, userRole, userTeam } = useSupabase();
  const [activeSubTab, setActiveSubTab] = useState('rotation'); // 'rotation' | 'intern'

  const [batches, setBatches] = useState([]);
  const [selectedBatchId, setSelectedBatchId] = useState('');
  const selectedBatch = useMemo(() => batches.find((b) => b.id === selectedBatchId) || null, [batches, selectedBatchId]);

  const isTlaTeam = userTeam && String(userTeam).toLowerCase() === 'tla';
  const canManageUdemy =
    userRole === 'admin' ||
    userRole === 'tla' ||
    ((userRole === 'tl' || userRole === 'vtl') && isTlaTeam);
  /** Only admins may delete entire batches (rotation + related tracker data). */
  const canDeleteUdemyBatch = userRole === 'admin';
  // Who can edit progress in Intern Tracker (per-cell, only their own column):
  // - Interns in TLA team
  // - TL/VTL in TLA team
  const canEditInternProgress =
    isTlaTeam && (userRole === 'intern' || userRole === 'tl' || userRole === 'vtl');

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
  const [batchDeleting, setBatchDeleting] = useState(false);
  const [editingRotationRow, setEditingRotationRow] = useState(null);

  // Intern tracker
  const [internNames, setInternNames] = useState([]);
  const [nameModalOpen, setNameModalOpen] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const [internStatusMap, setInternStatusMap] = useState({}); // key: `${course}|${nameId}` -> status
  const [internLoading, setInternLoading] = useState(false);
  const [tlaPeople, setTlaPeople] = useState([]); // assignable interns sourced from onboarding records
  const [currentInternName, setCurrentInternName] = useState('');

  const fetchBatches = async (options) => {
    const afterDeletingId = options?.afterDeletingId;
    const { data, error } = await supabase.from('udemy_batches').select('*').order('batch_no', { ascending: false });
    if (error) {
      console.warn('udemy_batches fetch error', error);
      toast.error('Could not load Udemy batches. Run udemy_course_migration.sql in Supabase.');
      setBatches([]);
      return;
    }
    const list = Array.isArray(data) ? data : [];
    setBatches(list);
    if (afterDeletingId) {
      setSelectedBatchId((prev) => {
        if (prev !== afterDeletingId) return prev;
        return list[0]?.id || '';
      });
    } else if (!selectedBatchId && list[0]?.id) {
      setSelectedBatchId(list[0].id);
    }
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
    const fetchTlaPeople = async () => {
      try {
        const { data, error } = await supabase
          .from('onboarding_records')
          .select('id, name, email, department, team');
        if (error) {
          console.warn('TLA people fetch error', error);
          return;
        }
        const rows = Array.isArray(data) ? data : [];
        const map = new Map();
        rows.forEach((r) => {
          const name = (r.name || '').trim();
          const email = (r.email || '').trim();
          if (!name) return;
          // Include all onboarded IT interns/people so "Assigned Intern" dropdown
          // doesn't miss names due to inconsistent team values in onboarding records.
          const key = email || name;
          if (!map.has(key)) {
            map.set(key, { name, email });
          }
        });
        const people = Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
        setTlaPeople(people);

        // derive current intern name for matching cells in Intern Tracker
        const myEmail = (user?.email || '').toLowerCase();
        const fromEmail = people.find((p) => (p.email || '').toLowerCase() === myEmail);
        if (fromEmail?.name) {
          setCurrentInternName(fromEmail.name);
        } else {
          setCurrentInternName(
            (user?.user_metadata && user.user_metadata.full_name) || user?.email || ''
          );
        }
      } catch (err) {
        console.warn('TLA people fetch error', err);
      }
    };
    fetchTlaPeople();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  useEffect(() => {
    if (activeSubTab === 'rotation' || activeSubTab === 'intern') fetchRotationRows(selectedBatchId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSubTab, selectedBatchId]);

  // Intern Tracker: courses and names derived from Course Assignment (rotation rows)
  const internTrackerCourses = useMemo(() => {
    const seen = new Set();
    return (rotationRows || [])
      .filter((r) => {
        const t = (r.course_title || '').trim();
        if (!t || seen.has(t)) return false;
        seen.add(t);
        return true;
      })
      .map((r) => ({ course_title: r.course_title || '', course_link: r.course_link || '' }))
      .sort((a, b) => a.course_title.localeCompare(b.course_title));
  }, [rotationRows]);

  const internTrackerNames = useMemo(() => {
    const set = new Set();
    (rotationRows || []).forEach((r) => {
      const n = (r.assigned_intern || '').trim();
      if (n) set.add(n);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [rotationRows]);

  const getRotationRowForCell = (courseTitle, assignedName) =>
    (rotationRows || []).find(
      (r) =>
        (r.course_title || '').trim() === (courseTitle || '').trim() &&
        (r.assigned_intern || '').trim() === (assignedName || '').trim()
    );

  // Course Assignment: aggregate Review Status per course (read-only) from interns' statuses in Intern Tracker
  const courseAggregateReviewStatus = useMemo(() => {
    const map = {};
    const rows = rotationRows || [];
    const byCourse = {};
    rows.forEach((r) => {
      const t = (r.course_title || '').trim();
      if (!t) return;
      if (!byCourse[t]) byCourse[t] = [];
      byCourse[t].push(r.review_status || 'Not Started');
    });
    Object.keys(byCourse).forEach((courseTitle) => {
      const statuses = byCourse[courseTitle];
      const allCompleted = statuses.length > 0 && statuses.every((s) => s === 'Completed');
      const anyCompletedOrInProgress = statuses.some((s) => s === 'Completed' || s === 'In Progress');
      if (allCompleted) map[courseTitle] = 'Completed';
      else if (anyCompletedOrInProgress) map[courseTitle] = 'In Progress';
      else map[courseTitle] = 'Not Started';
    });
    return map;
  }, [rotationRows]);

  const getReviewStatusPillClasses = (status) => {
    const s = String(status || '').toLowerCase();
    if (s === 'completed')
      return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300';
    if (s === 'in progress')
      return 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-200';
    return 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-200';
  };

  const getScreenshotStatusSelectClasses = (status) => {
    const s = String(status || '').toLowerCase();
    if (s === 'done')
      return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200';
    // Pending / default
    return 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200';
  };

  const handleAddBatch = async () => {
    if (!canManageUdemy) {
      toast.error('You do not have permission to manage Udemy batches.');
      return;
    }
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

  const handleDeleteSelectedBatch = async () => {
    if (!canDeleteUdemyBatch) {
      toast.error('Only admins can remove Udemy batches.');
      return;
    }
    if (!selectedBatchId) {
      toast.error('Select a batch first.');
      return;
    }
    const id = selectedBatchId;
    const label = selectedBatch?.batch_no || 'this batch';
    const assignmentCount = rotationRows.length;
    const detail =
      assignmentCount > 0
        ? `\n\nThis will permanently delete ${assignmentCount} course assignment(s) and all related intern tracker data for this batch.`
        : '\n\nAll related tracker data for this batch will be removed.';
    const ok = window.confirm(
      `Remove batch "${label}"? This cannot be undone.${detail}`
    );
    if (!ok) return;
    setBatchDeleting(true);
    try {
      const { error } = await supabase.from('udemy_batches').delete().eq('id', id);
      if (error) throw error;
      toast.success('Batch removed.');
      setShowRotationModal(false);
      setEditingRotationRow(null);
      setRotationRows([]);
      setInternNames([]);
      setInternStatusMap({});
      await fetchBatches({ afterDeletingId: id });
      // Rotation rows reload via useEffect when selectedBatchId updates.
    } catch (err) {
      console.warn('Delete batch error', err);
      toast.error(err?.message || 'Failed to remove batch.');
    } finally {
      setBatchDeleting(false);
    }
  };

  const handleCreateRotationRow = async (e) => {
    e.preventDefault();
    if (!canManageUdemy) {
      toast.error('You do not have permission to add course assignments.');
      return;
    }
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

  const handleSaveRotationForm = async (e) => {
    e?.preventDefault();
    if (!canManageUdemy) {
      toast.error('You do not have permission to edit course assignments.');
      return;
    }
    const courseTitle = (rotationCreate.course_title || '').trim();
    const courseLink = (rotationCreate.course_link || '').trim();
    if (!courseTitle || !courseLink) {
      toast.error('Course title and course link are required.');
      return;
    }
    if (editingRotationRow) {
      try {
        setRotationSaving(true);
        const payload = {
          course_link: courseLink,
          course_title: courseTitle,
          assigned_intern: (rotationCreate.assigned_intern || '').trim() || null,
          day: (rotationCreate.day || '').trim() || null,
          screenshot_status: rotationCreate.screenshot_status || 'Pending',
        };
        await handleUpdateRotationRow(editingRotationRow.id, payload);
        toast.success('Course assignment updated.');
        setShowRotationModal(false);
        setEditingRotationRow(null);
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
        // error already shown in handleUpdateRotationRow
      } finally {
        setRotationSaving(false);
      }
      return;
    }
    handleCreateRotationRow(e);
  };

  const handleDeleteRotationRow = async (row) => {
    if (!canManageUdemy) {
      toast.error('You do not have permission to delete course assignments.');
      return;
    }
    if (!row?.id) return;
    const ok = window.confirm(`Delete this course assignment?\n\n"${row.course_title || 'Untitled'}"`);
    if (!ok) return;
    try {
      const { error } = await supabase.from('udemy_rotation_assignments').delete().eq('id', row.id);
      if (error) throw error;
      toast.success('Course assignment deleted.');
      setRotationRows((prev) => prev.filter((r) => r.id !== row.id));
      await fetchRotationRows(selectedBatchId);
    } catch (err) {
      console.warn('Delete rotation row error', err);
      toast.error(err?.message || 'Failed to delete assignment.');
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
    if (!canManageUdemy) return;
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
          <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100" style={{ color: PRIMARY }}>
            Udemy Course
          </h2>
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">Track assignments and course review progress per batch.</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="min-w-[220px]">
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-200 mb-1">Batch</label>
            <select
              value={selectedBatchId}
              onChange={(e) => setSelectedBatchId(e.target.value)}
              className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 px-2 py-1.5 text-xs"
            >
              <option value="">Select batch…</option>
              {batches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.batch_no}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-wrap items-end gap-2 mt-5">
            {canManageUdemy && (
              <button
                type="button"
                onClick={handleAddBatch}
                className="px-3 py-2 rounded-lg text-xs font-medium text-white"
                style={{ backgroundColor: PRIMARY }}
              >
                Add batch
              </button>
            )}
            {canDeleteUdemyBatch && (
              <button
                type="button"
                onClick={handleDeleteSelectedBatch}
                disabled={!selectedBatchId || batchDeleting}
                title={
                  !selectedBatchId
                    ? 'Select a batch to remove'
                    : 'Delete this batch and all course assignments / tracker data'
                }
                className="px-3 py-2 rounded-lg text-xs font-medium border border-red-300 dark:border-red-800 text-red-700 dark:text-red-300 bg-white dark:bg-gray-900 hover:bg-red-50 dark:hover:bg-red-950/40 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {batchDeleting ? 'Removing…' : 'Remove batch'}
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="flex gap-2 border-b border-gray-200 dark:border-gray-800">
        <button
          type="button"
          onClick={() => setActiveSubTab('rotation')}
          className={`px-4 py-2 rounded-t-lg text-sm font-medium transition-colors ${
            activeSubTab === 'rotation'
              ? 'bg-white dark:bg-gray-900 border border-b-0 border-gray-200 dark:border-gray-800 -mb-px text-gray-900 dark:text-gray-100'
              : 'bg-gray-100 dark:bg-gray-950/40 text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-800'
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
              ? 'bg-white dark:bg-gray-900 border border-b-0 border-gray-200 dark:border-gray-800 -mb-px text-gray-900 dark:text-gray-100'
              : 'bg-gray-100 dark:bg-gray-950/40 text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-800'
          }`}
          style={activeSubTab === 'intern' ? { borderTopColor: PRIMARY } : {}}
        >
          Intern Tracker
        </button>
      </div>

      {activeSubTab === 'rotation' && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100" style={{ color: PRIMARY }}>
              Course Assignment
            </h3>
            {canManageUdemy && (
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setEditingRotationRow(null);
                    setRotationCreate({
                      course_link: '',
                      course_title: '',
                      assigned_intern: '',
                      day: '',
                      review_status: 'Not Started',
                      screenshot_status: 'Pending',
                    });
                    setShowRotationModal(true);
                  }}
                  disabled={!selectedBatchId}
                  className="px-4 py-2 rounded-lg text-xs font-medium text-white disabled:opacity-60"
                  style={{ backgroundColor: PRIMARY }}
                >
                  Add course
                </button>
              </div>
            )}
          </div>

          {showRotationModal &&
            createPortal(
              <div
                className="fixed inset-0 z-[10000] bg-black/20 backdrop-blur-sm flex justify-end"
                onMouseDown={(e) => {
                  if (e.target === e.currentTarget) {
                    setShowRotationModal(false);
                    setEditingRotationRow(null);
                  }
                }}
              >
                {/* Right slide-over panel (full viewport height) */}
                <div
                  className="h-screen w-full max-w-md bg-white dark:bg-gray-900 shadow-2xl border-l border-gray-200 dark:border-gray-800 flex flex-col"
                  onMouseDown={(e) => e.stopPropagation()}
                >
                  <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-800 flex items-start justify-between gap-3">
                    <div>
                      <h4 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                        {editingRotationRow ? 'Edit course assignment' : 'Add course assignment'}
                      </h4>
                      <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
                        Batch: <span className="font-medium">{selectedBatch?.batch_no || '—'}</span>
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setShowRotationModal(false);
                        setEditingRotationRow(null);
                      }}
                      className="px-3 py-1.5 rounded-lg text-xs bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-700"
                    >
                      Close
                    </button>
                  </div>

                  <div className="flex-1 overflow-y-auto px-4 py-3">
                    <form onSubmit={handleSaveRotationForm} className="space-y-4">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-medium text-gray-700 dark:text-gray-200 mb-1">
                            Course link <span className="text-red-500">*</span>
                          </label>
                          <input
                            type="url"
                            value={rotationCreate.course_link}
                            onChange={(e) => setRotationCreate((s) => ({ ...s, course_link: e.target.value }))}
                            className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-950 text-gray-900 dark:text-gray-100 px-2 py-1.5 text-xs"
                            placeholder="https://www.udemy.com/course/..."
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-700 dark:text-gray-200 mb-1">
                            Course title <span className="text-red-500">*</span>
                          </label>
                          <input
                            type="text"
                            value={rotationCreate.course_title}
                            onChange={(e) => setRotationCreate((s) => ({ ...s, course_title: e.target.value }))}
                            className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-950 text-gray-900 dark:text-gray-100 px-2 py-1.5 text-xs"
                            placeholder="Course title"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-medium text-gray-700 dark:text-gray-200 mb-1">Assigned intern</label>
                          <select
                            value={rotationCreate.assigned_intern || ''}
                            onChange={(e) =>
                              setRotationCreate((s) => ({
                                ...s,
                                assigned_intern: e.target.value || '',
                              }))
                            }
                            className="w-full rounded-lg border border-gray-300 dark:border-gray-700 px-2 py-1.5 text-xs bg-white dark:bg-gray-950 text-gray-900 dark:text-gray-100"
                          >
                            <option value="">Unassigned</option>
                            {tlaPeople.map((p) => {
                              const label = p.name || 'Unnamed';
                              return (
                                <option key={label} value={label}>
                                  {label}
                                </option>
                              );
                            })}
                            {rotationCreate.assigned_intern &&
                              !tlaPeople.some(
                                (p) => (p.name || '').trim() === rotationCreate.assigned_intern.trim()
                              ) && (
                                <option value={rotationCreate.assigned_intern}>
                                  {rotationCreate.assigned_intern}
                                </option>
                              )}
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-700 dark:text-gray-200 mb-1">Day</label>
                          <select
                            value={rotationCreate.day || ''}
                            onChange={(e) =>
                              setRotationCreate((s) => ({
                                ...s,
                                day: e.target.value || '',
                              }))
                            }
                            className="w-full rounded-lg border border-gray-300 dark:border-gray-700 px-2 py-1.5 text-xs bg-white dark:bg-gray-950 text-gray-900 dark:text-gray-100"
                          >
                            <option value="">Select day</option>
                            <option value="1">1</option>
                            <option value="2">2</option>
                            <option value="3">3</option>
                            <option value="4">4</option>
                          </select>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-medium text-gray-700 dark:text-gray-200 mb-1">Screenshot status</label>
                          <select
                            value={rotationCreate.screenshot_status}
                            onChange={(e) => setRotationCreate((s) => ({ ...s, screenshot_status: e.target.value }))}
                            className={`w-full min-w-[8rem] px-2.5 py-1.5 text-xs font-medium rounded-full border border-gray-300 dark:border-gray-700 cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#6795BE] ${getScreenshotStatusSelectClasses(
                              rotationCreate.screenshot_status
                            )}`}
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

                  <div className="px-4 py-3 border-t border-gray-200 dark:border-gray-800 flex items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setShowRotationModal(false);
                        setEditingRotationRow(null);
                      }}
                      className="px-4 py-2 rounded-lg text-xs font-medium bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-700"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleSaveRotationForm}
                      disabled={rotationSaving}
                      className="px-4 py-2 rounded-lg text-xs font-medium text-white disabled:opacity-60"
                      style={{ backgroundColor: PRIMARY }}
                    >
                      {rotationSaving ? 'Saving…' : editingRotationRow ? 'Update' : 'Save'}
                    </button>
                  </div>
                </div>
              </div>,
              document.body
            )}

          <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              {rotationLoading ? (
                <div className="py-8 text-center text-sm text-gray-500 dark:text-gray-400">Loading assignments…</div>
              ) : rotationRows.length === 0 ? (
                <div className="py-8 text-center text-sm text-gray-500 dark:text-gray-400">
                  {selectedBatch ? 'No assignments yet for this batch.' : 'Select a batch to view assignments.'}
                </div>
              ) : (
                <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-800">
                  <thead className="bg-gray-50 dark:bg-gray-950/40">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Batch No.</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Course Link</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Assigned Intern</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Day</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Review Status</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Screenshot Status</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase w-28">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-800">
                    {rotationRows.map((row) => (
                      <tr key={row.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/60">
                        <td className="px-4 py-3 text-sm text-gray-900 dark:text-gray-100">{selectedBatch?.batch_no || '—'}</td>
                        <td className="px-4 py-3 text-sm text-gray-600 max-w-xs">
                          {row.course_link ? (
                            <a
                              className="text-blue-600 dark:text-blue-400 hover:underline inline-block max-w-xs truncate"
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
                        <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-300">{row.assigned_intern || '—'}</td>
                        <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-300">{row.day || '—'}</td>
                        <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-300">
                          {(() => {
                            const label =
                              courseAggregateReviewStatus[(row.course_title || '').trim()] ||
                              'Not Started';
                            return (
                              <span
                                className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getReviewStatusPillClasses(
                                  label
                                )}`}
                              >
                                {label}
                              </span>
                            );
                          })()}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-300">
                          {canManageUdemy ? (
                            <select
                              value={row.screenshot_status || 'Pending'}
                              onChange={(e) =>
                                handleUpdateRotationRow(row.id, { screenshot_status: e.target.value })
                              }
                              className={`w-full min-w-[8rem] px-2.5 py-1.5 text-xs font-medium rounded-full border border-gray-300 dark:border-gray-700 cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#6795BE] ${getScreenshotStatusSelectClasses(
                                row.screenshot_status || 'Pending'
                              )}`}
                            >
                              {ROTATION_SCREENSHOT_STATUS.map((s) => (
                                <option key={s} value={s}>
                                  {s}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <span
                              className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getScreenshotStatusSelectClasses(
                                row.screenshot_status || 'Pending'
                              )}`}
                            >
                              {row.screenshot_status || 'Pending'}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-300 align-middle">
                          {canManageUdemy ? (
                            <div className="flex items-center gap-2 flex-nowrap">
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingRotationRow(row);
                                  setRotationCreate({
                                    course_link: row.course_link || '',
                                    course_title: row.course_title || '',
                                    assigned_intern: row.assigned_intern || '',
                                    day: row.day || '',
                                    review_status: row.review_status || 'Not Started',
                                    screenshot_status: row.screenshot_status || 'Pending',
                                  });
                                  setShowRotationModal(true);
                                }}
                                className="px-2.5 py-1.5 rounded-lg text-xs font-medium text-gray-700 dark:text-gray-200 border border-gray-300 dark:border-gray-700 bg-transparent hover:bg-gray-100 dark:hover:bg-gray-800 shrink-0"
                              >
                                Edit
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteRotationRow(row)}
                                className="px-2.5 py-1.5 rounded-lg text-xs font-medium text-red-700 dark:text-red-300 border border-red-200 dark:border-red-900/60 bg-white dark:bg-gray-900 hover:bg-red-50 dark:hover:bg-red-950/40 shrink-0"
                              >
                                Delete
                              </button>
                            </div>
                          ) : (
                            <span className="inline-block text-xs text-gray-400 dark:text-gray-500">View only</span>
                          )}
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
          <div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100" style={{ color: PRIMARY }}>
              Intern Tracker
            </h3>
            <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
              Courses and intern names come from Course Assignment. Progress dropdown only appears when an intern is assigned to that course.
            </p>
          </div>

          <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              {rotationLoading ? (
                <div className="py-8 text-center text-sm text-gray-500 dark:text-gray-400">Loading…</div>
              ) : !selectedBatchId ? (
                <div className="py-8 text-center text-sm text-gray-500 dark:text-gray-400">Select a batch to view the tracker.</div>
              ) : internTrackerCourses.length === 0 || internTrackerNames.length === 0 ? (
                <div className="py-8 text-center text-sm text-gray-500 dark:text-gray-400">
                  Add course assignments in the Rotation Tracker tab to see courses and assigned interns here.
                </div>
              ) : (
                <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-800">
                  <thead className="bg-gray-50 dark:bg-gray-950/40">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Course</th>
                      {internTrackerNames.map((name) => (
                        <th key={name} className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                          {name}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-800">
                    {internTrackerCourses.map((course) => (
                      <tr key={course.course_title} className="hover:bg-gray-50 dark:hover:bg-gray-800/60">
                        <td className="px-4 py-3 text-sm text-gray-900 dark:text-gray-100 min-w-[280px]">
                          {course.course_link ? (
                            <a
                              href={course.course_link}
                              target="_blank"
                              rel="noreferrer"
                              className="text-blue-600 dark:text-blue-400 hover:underline"
                            >
                              {course.course_title || '—'}
                            </a>
                          ) : (
                            course.course_title || '—'
                          )}
                        </td>
                        {internTrackerNames.map((assignedName) => {
                          const row = getRotationRowForCell(course.course_title, assignedName);
                          const isCurrentInternCell =
                            canEditInternProgress &&
                            currentInternName &&
                            assignedName.trim().toLowerCase() === currentInternName.trim().toLowerCase();
                          return (
                            <td key={assignedName} className="px-4 py-3 text-sm text-gray-600 dark:text-gray-300">
                              {row ? (
                                isCurrentInternCell ? (
                                  <select
                                    value={row.review_status || 'Not Started'}
                                    onChange={(e) =>
                                      handleUpdateRotationRow(row.id, { review_status: e.target.value })
                                    }
                                    className="w-full min-w-[140px] rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-950 text-gray-900 dark:text-gray-100 px-2 py-1.5 text-xs"
                                  >
                                    {ROTATION_REVIEW_STATUS.map((s) => (
                                      <option key={s} value={s}>
                                        {s}
                                      </option>
                                    ))}
                                  </select>
                                ) : (
                                  <span
                                    className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getReviewStatusPillClasses(
                                      row.review_status || 'Not Started'
                                    )}`}
                                  >
                                    {row.review_status || 'Not Started'}
                                  </span>
                                )
                              ) : (
                                <span className="text-gray-400 dark:text-gray-500">—</span>
                              )}
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

