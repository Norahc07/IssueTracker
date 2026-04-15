import { useEffect, useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Navigate, useSearchParams } from 'react-router-dom';
import { useSupabase } from '../context/supabase.jsx';
import { toast } from 'react-hot-toast';
import { permissions } from '../utils/rolePermissions.js';
import ScheduleTab from '../components/ScheduleTab.jsx';
import Modal from '../components/Modal.jsx';
import { TEAMS } from '../utils/rolePermissions.js';

const PRIMARY = '#6795BE';
const TL_VTL_DEPARTMENTS = ['IT', 'HR', 'Marketing'];
const TL_VTL_TEAMS = ['Team Lead Assistant', 'Monitoring Team', 'PAT1', 'HR Intern', 'Marketing Intern'];
const TL_VTL_ROLES = ['Team Leader', 'Vice Team Leader', 'Representative'];
const LEAVE_TEMPLATE_URL = 'https://ssgcgroup-my.sharepoint.com/:x:/g/personal/carl_ssgc_group/IQC95nJHfVwAQYLtfdOApPbIAXDs4P-HgyG02kq6fE9BdyY?e=n9HW7j';
const ITD_DEFAULT_OPTIONS = {
  document_type: [
    'Final Appraisal/Evaluation',
    'Monthly Appraisal/Evaluation',
    'Monthly/Weekly Report',
    'ICF',
    'DTR',
    'Partial COC',
    'COC/LOC',
    'Leave Form',
  ],
  addressed_to: [
    'Knowles TLA',
    'Knowles Monitoring',
    'Sir Eugene Monitoring',
    'Sir Eugene TLA',
    'Sir Sancy TLA',
    'Sir Sancy Monitoring',
    'HR Representative',
  ],
  company: ['Knowles', 'Umonics'],
  status: ['Pending', 'For Review', 'Signed', 'Returned'],
};
const formatMdy = (value) => {
  if (!value) return '—';
  const d = new Date(`${value}T00:00:00`);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
};

const calculateLeaveDuration = (startDate, endDate, leaveType) => {
  if (!startDate || !endDate) return '—';
  const start = new Date(`${startDate}T00:00:00`);
  const end = new Date(`${endDate}T00:00:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) return '—';
  const diffDays = Math.floor((end.getTime() - start.getTime()) / 86400000) + 1;
  const multiplier = leaveType === 'half' ? 0.5 : 1;
  const days = diffDays * multiplier;
  return `${days % 1 === 0 ? days.toFixed(0) : days.toFixed(1)} day${days === 1 ? '' : 's'}`;
};

const canAccessTracker = (userRole, userTeam) => {
  const isTlaTeam = userTeam && String(userTeam).toLowerCase() === 'tla';
  return (
    userRole === 'admin' ||
    userRole === 'tla' ||
    userRole === 'intern' ||
    isTlaTeam ||
    ((userRole === 'tl' || userRole === 'vtl') && isTlaTeam)
  );
};

export default function TrackerPage() {
  const { supabase, user, userRole, userTeam } = useSupabase();
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get('tab'); // 'tl-vtl' | 'schedule' | 'intern-records' | 'leave' | 'blocked-domains' | 'itd'
  const trackerTab =
    tabParam === 'schedule'
      ? 'schedule'
      : tabParam === 'intern-records'
      ? 'intern-records'
      : tabParam === 'leave'
      ? 'leave'
      : tabParam === 'blocked-domains'
      ? 'blocked-domains'
      : tabParam === 'itd'
      ? 'itd'
      : 'tl-vtl';

  const [users, setUsers] = useState([]);
  const [tlVtlTrackerRows, setTlVtlTrackerRows] = useState([]);
  const [savingTlVtlTracker, setSavingTlVtlTracker] = useState(false);
  const [isTlVtlTrackerEditMode, setIsTlVtlTrackerEditMode] = useState(false);
  const [tlVtlTrackerPendingDeletes, setTlVtlTrackerPendingDeletes] = useState([]); // ids to delete on Save (not Cancel)
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleteConfirmTargetId, setDeleteConfirmTargetId] = useState(null);
  const newTlVtlDraftId = () => {
    try {
      // Prefer uuid when available (modern browsers)
      if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return `tmp-${crypto.randomUUID()}`;
      }
    } catch {
      // ignore
    }
    return `tmp-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  };

  // Intern records (TLA POV)
  const [recordsLoading, setRecordsLoading] = useState(false);
  const [internRecords, setInternRecords] = useState([]);
  const [recordModalOpen, setRecordModalOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState(null);
  const [recordForm, setRecordForm] = useState({
    last_name: '',
    first_name: '',
    hours_per_day: '',
    total_request: '',
    hours_rendered: '',
    start_date: '',
    target_end_1: '',
    target_end_2: '',
  });

  const [leaveRows, setLeaveRows] = useState([]);
  const [leaveModalOpen, setLeaveModalOpen] = useState(false);
  const [leaveSampleModalOpen, setLeaveSampleModalOpen] = useState(false);
  const [leaveForm, setLeaveForm] = useState({
    leave_start_date: '',
    leave_end_date: '',
    leave_type: 'whole',
    leave_form_link: '',
    leave_category: 'Sick Leave',
    leave_category_other: '',
    note: '',
  });
  const [editingLeaveId, setEditingLeaveId] = useState(null);
  const [leaveEditDraft, setLeaveEditDraft] = useState(null);
  const [domains, setDomains] = useState([]);
  const [blockedDomainsRows, setBlockedDomainsRows] = useState([]);
  const [blockedDomainsLoading, setBlockedDomainsLoading] = useState(false);
  const [blockedDomainsModalOpen, setBlockedDomainsModalOpen] = useState(false);
  const [editingBlockedDomain, setEditingBlockedDomain] = useState(null);
  const [blockedDomainForm, setBlockedDomainForm] = useState({
    public_ip: '',
    domain_id: '',
    notes: '',
  });
  const [blockedDomainSaving, setBlockedDomainSaving] = useState(false);

  // Intern Document Tracker (ITD)
  const [itdRows, setItdRows] = useState([]);
  const [itdLoading, setItdLoading] = useState(false);
  const [itdModalOpen, setItdModalOpen] = useState(false);
  const [itdSelectedInternId, setItdSelectedInternId] = useState('');
  const [itdDocumentLinkTouched, setItdDocumentLinkTouched] = useState(false);
  const [itdDetailsOpen, setItdDetailsOpen] = useState(false);
  const [itdDetailsRow, setItdDetailsRow] = useState(null);
  const [itdDetailsMounted, setItdDetailsMounted] = useState(false);
  const [itdSearch, setItdSearch] = useState('');
  const [itdManageOptionsOpen, setItdManageOptionsOpen] = useState(false);
  const [itdOptionsSaving, setItdOptionsSaving] = useState(false);
  const [itdApprovingId, setItdApprovingId] = useState(null);
  const [itdOptionEditor, setItdOptionEditor] = useState({
    document_type: [],
    addressed_to: [],
    company: [],
  });
  const [itdOptions, setItdOptions] = useState({
    document_type: ITD_DEFAULT_OPTIONS.document_type,
    addressed_to: ITD_DEFAULT_OPTIONS.addressed_to,
    company: ITD_DEFAULT_OPTIONS.company,
    status: ITD_DEFAULT_OPTIONS.status,
    handled_by: [],
    designated_team: [],
  });
  const [editingItdId, setEditingItdId] = useState(null);
  const [itdForm, setItdForm] = useState({
    document_link: '',
    intern_name: '',
    document_type: ITD_DEFAULT_OPTIONS.document_type[0],
    addressed_to: ITD_DEFAULT_OPTIONS.addressed_to[0],
    company: ITD_DEFAULT_OPTIONS.company[0],
    contact_address: '',
    designated_team: '',
    due_date: '',
    return_to_whom: '',
  });

  const tlVtlAssignableUsers = useMemo(
    () => users.filter((u) => u.role === 'intern' || u.role === 'tl' || u.role === 'vtl'),
    [users]
  );
  const itdInternOptions = useMemo(
    () => users.filter((u) => u.role === 'intern'),
    [users]
  );

  const isTlaTeam = String(userTeam || '').toLowerCase() === TEAMS.TLA;
  const canAccessTlaInternRecords =
    userRole === 'admin' ||
    userRole === 'tla' ||
    ((userRole === 'tl' || userRole === 'vtl') && isTlaTeam);
  const canManageLeaveApprovals =
    userRole === 'admin' || ((userRole === 'tl' || userRole === 'vtl') && isTlaTeam);
  const isInternRole = userRole === 'intern';
  const isTlVtlRole = userRole === 'tl' || userRole === 'vtl';
  const canManageItd = userRole === 'admin' || ((userRole === 'tl' || userRole === 'vtl') && isTlaTeam);
  const canAddEditBlockedDomain = ['admin', 'intern', 'tl', 'vtl'].includes(String(userRole || '').toLowerCase());
  const canDeleteBlockedDomain = ['admin', 'tl', 'vtl'].includes(String(userRole || '').toLowerCase());
  const canMarkBlockedDomainUnblocked = canDeleteBlockedDomain;

  const currentActorName = useMemo(() => {
    const meta = user?.user_metadata || {};
    const byMeta = [meta.full_name, meta.name, meta.display_name].find(
      (v) => typeof v === 'string' && v.trim()
    );
    if (byMeta) return byMeta.trim();
    const byUsersList = users.find((u) => u.id === user?.id)?.full_name;
    if (byUsersList && String(byUsersList).trim()) return String(byUsersList).trim();
    if (user?.email) return user.email.split('@')[0];
    return 'Unknown user';
  }, [user, users]);

  const currentActorEmail = useMemo(() => {
    const byUsersList = users.find((u) => u.id === user?.id)?.email;
    if (byUsersList && String(byUsersList).trim()) return String(byUsersList).trim();
    if (user?.email && String(user.email).trim()) return String(user.email).trim();
    return '';
  }, [user, users]);

  const fetchUsers = async () => {
    try {
      const { data, error } = await supabase.from('users').select('id, full_name, email, role, team').order('full_name', { ascending: true });
      if (error) throw error;
      setUsers(Array.isArray(data) ? data : []);
    } catch (err) {
      console.warn('TrackerPage: users fetch error', err);
      setUsers([]);
    }
  };

  const fetchTlVtlTracker = async () => {
    try {
      const { data, error } = await supabase
        .from('tl_vtl_tracker')
        .select('*')
        .order('created_at', { ascending: true });
      if (error) throw error;
      setTlVtlTrackerRows(Array.isArray(data) ? data : []);
    } catch (err) {
      console.warn('tl_vtl_tracker fetch error:', err);
      setTlVtlTrackerRows([]);
    }
  };

  useEffect(() => {
    if (permissions.canCreateTasks(userRole)) fetchUsers();
  }, [supabase, userRole]);

  useEffect(() => {
    fetchTlVtlTracker();
  }, [supabase]);

  const fetchInternRecords = async () => {
    if (!supabase) return;
    setRecordsLoading(true);
    try {
      const { data, error } = await supabase
        .from('intern_records')
        .select('*')
        .eq('team', TEAMS.TLA)
        .order('last_name', { ascending: true });
      if (error) throw error;
      setInternRecords(Array.isArray(data) ? data : []);
    } catch (err) {
      console.warn('TrackerPage: intern_records fetch error', err);
      toast.error(err?.message || 'Failed to load intern records.');
      setInternRecords([]);
    } finally {
      setRecordsLoading(false);
    }
  };

  useEffect(() => {
    if (trackerTab !== 'intern-records') return;
    if (!canAccessTlaInternRecords) return;
    fetchInternRecords();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trackerTab, canAccessTlaInternRecords]);

  const fetchLeaveRows = async () => {
    if (!supabase) return;
    try {
      const { data, error } = await supabase
        .from('leave_tracker')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      setLeaveRows(Array.isArray(data) ? data : []);
    } catch (err) {
      console.warn('TrackerPage: leave_tracker fetch error', err);
      toast.error(err?.message || 'Failed to load leave records.');
      setLeaveRows([]);
    }
  };

  const fetchDomains = async () => {
    if (!supabase) return;
    try {
      const { data, error } = await supabase
        .from('domains')
        .select('id, country, url, type')
        .order('country', { ascending: true });
      if (error) throw error;
      setDomains(Array.isArray(data) ? data : []);
    } catch (err) {
      console.warn('TrackerPage: domains fetch error', err);
      setDomains([]);
    }
  };

  const fetchBlockedDomainRows = async () => {
    if (!supabase) return;
    setBlockedDomainsLoading(true);
    try {
      const { data, error } = await supabase
        .from('blocked_domain_tracker')
        .select('*')
        .order('date_blocked', { ascending: false })
        .order('created_at', { ascending: false });
      if (error) throw error;
      setBlockedDomainsRows(Array.isArray(data) ? data : []);
    } catch (err) {
      console.warn('TrackerPage: blocked_domain_tracker fetch error', err);
      toast.error(err?.message || 'Failed to load blocked domains.');
      setBlockedDomainsRows([]);
    } finally {
      setBlockedDomainsLoading(false);
    }
  };

  const resetItdForm = () => {
    setItdSelectedInternId('');
    setItdDocumentLinkTouched(false);
    setItdForm({
      document_link: '',
      intern_name: isInternRole ? currentActorName : '',
      document_type: ITD_DEFAULT_OPTIONS.document_type[0],
      addressed_to: ITD_DEFAULT_OPTIONS.addressed_to[0],
      company: ITD_DEFAULT_OPTIONS.company[0],
      contact_address: isInternRole ? currentActorEmail : '',
      designated_team: isInternRole ? String(userTeam || '').trim() : '',
      due_date: '',
      return_to_whom: '',
    });
  };

  const fetchItdOptions = async () => {
    try {
      const { data, error } = await supabase
        .from('itd_dropdown_options')
        .select('*')
        .order('sort_order', { ascending: true });
      if (error) throw error;
      const rows = Array.isArray(data) ? data : [];
      const byField = rows.reduce((acc, r) => {
        const key = String(r?.field_key || '').trim();
        const val = String(r?.value || '').trim();
        if (!key || !val) return acc;
        if (!acc[key]) acc[key] = [];
        acc[key].push(val);
        return acc;
      }, {});
      setItdOptions((prev) => ({
        document_type: byField.document_type?.length ? byField.document_type : prev.document_type,
        addressed_to: byField.addressed_to?.length ? byField.addressed_to : prev.addressed_to,
        company: byField.company?.length ? byField.company : prev.company,
        status: byField.status?.length ? byField.status : prev.status,
        handled_by: byField.handled_by || [],
        designated_team: byField.designated_team || [],
      }));
    } catch (err) {
      console.warn('TrackerPage: itd_dropdown_options fetch error', err);
      // keep defaults
    }
  };

  const fetchItdRows = async () => {
    if (!supabase) return;
    setItdLoading(true);
    try {
      const { data, error } = await supabase
        .from('intern_document_tracker')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      setItdRows(Array.isArray(data) ? data : []);
    } catch (err) {
      console.warn('TrackerPage: intern_document_tracker fetch error', err);
      toast.error(err?.message || 'Failed to load ITD records.');
      setItdRows([]);
    } finally {
      setItdLoading(false);
    }
  };

  useEffect(() => {
    if (trackerTab !== 'leave') return;
    fetchLeaveRows();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trackerTab, supabase]);

  useEffect(() => {
    if (trackerTab !== 'itd') return;
    fetchItdOptions();
    fetchItdRows();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trackerTab, supabase]);

  useEffect(() => {
    if (trackerTab !== 'blocked-domains') return;
    fetchDomains();
    fetchBlockedDomainRows();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trackerTab, supabase]);

  const resetRecordForm = () => {
    setRecordForm({
      last_name: '',
      first_name: '',
      hours_per_day: '',
      total_request: '',
      hours_rendered: '',
      start_date: '',
      target_end_1: '',
      target_end_2: '',
    });
  };

  const openAddRecord = () => {
    setEditingRecord(null);
    resetRecordForm();
    setRecordModalOpen(true);
  };

  const openEditRecord = (rec) => {
    setEditingRecord(rec);
    setRecordForm({
      last_name: rec?.last_name || '',
      first_name: rec?.first_name || '',
      hours_per_day: rec?.hours_per_day ?? '',
      total_request: rec?.total_request ?? '',
      hours_rendered: rec?.hours_rendered ?? '',
      start_date: rec?.start_date || '',
      target_end_1: rec?.target_end_1 || '',
      target_end_2: rec?.target_end_2 || '',
    });
    setRecordModalOpen(true);
  };

  const closeRecordModal = () => {
    setRecordModalOpen(false);
    setEditingRecord(null);
    resetRecordForm();
  };

  const computeRemainingHours = (rec) => {
    const totalReq = Number(rec?.total_request) || 0;
    const rendered = Number(rec?.hours_rendered) || 0;
    return Math.max(0, totalReq - rendered);
  };

  const saveRecord = async () => {
    if (!supabase) return;
    if (!canAccessTlaInternRecords) return;
    const lastName = String(recordForm.last_name || '').trim();
    const firstName = String(recordForm.first_name || '').trim();
    if (!lastName || !firstName) {
      toast.error('Last Name and First Name are required.');
      return;
    }

    const payload = {
      team: TEAMS.TLA,
      last_name: lastName,
      first_name: firstName,
      hours_per_day: recordForm.hours_per_day === '' ? null : Number(recordForm.hours_per_day),
      total_request: recordForm.total_request === '' ? null : Number(recordForm.total_request),
      hours_rendered: recordForm.hours_rendered === '' ? null : Number(recordForm.hours_rendered),
      start_date: recordForm.start_date || null,
      target_end_1: recordForm.target_end_1 || null,
      target_end_2: recordForm.target_end_2 || null,
      updated_at: new Date().toISOString(),
    };

    try {
      const q = supabase.from('intern_records');
      const { error } = editingRecord?.id
        ? await q.update(payload).eq('id', editingRecord.id)
        : await q.insert({ ...payload, created_at: new Date().toISOString() });
      if (error) throw error;
      toast.success(editingRecord?.id ? 'Record updated.' : 'Record added.');
      closeRecordModal();
      fetchInternRecords();
    } catch (err) {
      console.warn('TrackerPage: save intern record error', err);
      toast.error(err?.message || 'Failed to save record. Check policies for intern_records.');
    }
  };

  const deleteRecord = async (rec) => {
    if (!supabase || !rec?.id) return;
    if (!canAccessTlaInternRecords) return;
    const ok = window.confirm('Delete this intern record? This cannot be undone.');
    if (!ok) return;
    try {
      const { error } = await supabase.from('intern_records').delete().eq('id', rec.id);
      if (error) throw error;
      toast.success('Record removed.');
      fetchInternRecords();
    } catch (err) {
      console.warn('TrackerPage: delete intern record error', err);
      toast.error(err?.message || 'Failed to delete record. Check policies for intern_records.');
    }
  };

  const addTlVtlTrackerRow = () => {
    // Important: do NOT insert to DB on "Add row" — only insert on explicit Save.
    // This ensures Cancel fully discards unsaved rows.
    const draft = {
      id: newTlVtlDraftId(),
      department: 'IT',
      team: 'Team Lead Assistant',
      name: '',
      role: 'Team Leader',
      _isDraft: true,
    };
    setTlVtlTrackerRows((prev) => [...prev, draft]);
    toast.success('Draft row added (not saved yet)');
  };

  const normalizeUserTeamFromTracker = (teamLabel) => {
    const t = (teamLabel || '').toLowerCase();
    if (t.includes('team lead assistant')) return 'tla';
    if (t.includes('monitoring')) return 'monitoring_team';
    if (t.includes('pat1')) return 'pat1';
    if (t.includes('hr')) return 'hr';
    if (t.includes('marketing')) return 'marketing';
    return null;
  };

  const mapTrackerRoleToUserRole = (roleLabel) => {
    if (!roleLabel) return null;
    const r = roleLabel.toLowerCase();
    if (r.includes('team leader')) return 'tl';
    if (r.includes('vice')) return 'vtl';
    return null;
  };

  const saveAllTlVtlTrackerRows = async () => {
    setSavingTlVtlTracker(true);
    try {
      // Delete rows that were "removed" during edit mode.
      // Actual deletion is only applied on Save (Cancel should restore).
      if (tlVtlTrackerPendingDeletes.length > 0) {
        const { error } = await supabase
          .from('tl_vtl_tracker')
          .delete()
          .in('id', tlVtlTrackerPendingDeletes);
        if (error) throw error;
      }

      for (const row of tlVtlTrackerRows) {
        const nowIso = new Date().toISOString();

        const payload = {
          department: row.department || 'IT',
          team: row.team || 'Team Lead Assistant',
          name: (row.name || '').trim(),
          role: row.role || 'Team Leader',
          updated_at: nowIso,
        };

        // Insert drafts; update existing rows
        if (row?._isDraft) {
          const { error } = await supabase
            .from('tl_vtl_tracker')
            .insert({ ...payload, created_at: nowIso })
            .select('id')
            .single();
          if (error) throw error;
        } else {
          const { error } = await supabase
            .from('tl_vtl_tracker')
            .update(payload)
            .eq('id', row.id);
          if (error) throw error;
        }

        const targetRole = mapTrackerRoleToUserRole(row.role);
        const trimmedName = (row.name || '').trim();
        if (targetRole && trimmedName) {
          try {
            const { data: userMatch, error: userErr } = await supabase
              .from('users')
              .select('id, full_name, team')
              .eq('full_name', trimmedName)
              .maybeSingle();

            if (!userErr && userMatch) {
              const mappedTeam = normalizeUserTeamFromTracker(row.team);
              const updatePayload = { role: targetRole, updated_at: nowIso };
              if (mappedTeam) updatePayload.team = mappedTeam;

              await supabase.from('users').update(updatePayload).eq('id', userMatch.id);
            }
          } catch (userUpdateErr) {
            console.warn('User role promotion error:', userUpdateErr);
          }
        }
      }
      toast.success('Changes saved and promotions applied');
      setIsTlVtlTrackerEditMode(false);
      setTlVtlTrackerPendingDeletes([]);
      await fetchTlVtlTracker();
    } catch (err) {
      toast.error(err?.message || 'Failed to save');
    } finally {
      setSavingTlVtlTracker(false);
    }
  };

  const cancelTlVtlTrackerEdit = () => {
    fetchTlVtlTracker();
    setIsTlVtlTrackerEditMode(false);
    setTlVtlTrackerPendingDeletes([]);
    setDeleteConfirmOpen(false);
    setDeleteConfirmTargetId(null);
  };

  const openDeleteConfirmTlVtlTrackerRow = (id) => {
    setDeleteConfirmTargetId(id);
    setDeleteConfirmOpen(true);
  };

  const confirmDeleteTlVtlTrackerRow = () => {
    const id = deleteConfirmTargetId;
    if (!id) return;

    const localRow = tlVtlTrackerRows.find((r) => r?.id === id);

    // Close modal immediately; actual "Save" happens later.
    setDeleteConfirmOpen(false);
    setDeleteConfirmTargetId(null);

    // Draft rows were never inserted into DB; discard locally.
    if (localRow?._isDraft) {
      setTlVtlTrackerRows((prev) => prev.filter((r) => r.id !== id));
      toast.success('Draft row discarded');
      return;
    }

    // Existing rows: remove from UI now, but only delete from DB on "Save".
    setTlVtlTrackerRows((prev) => prev.filter((r) => r.id !== id));
    setTlVtlTrackerPendingDeletes((prev) => (prev.includes(id) ? prev : [...prev, id]));
    toast.success('Row removed (pending Save)');
  };

  const resetLeaveForm = () => {
    setLeaveForm({
      leave_start_date: '',
      leave_end_date: '',
      leave_type: 'whole',
      leave_form_link: '',
      leave_category: 'Sick Leave',
      leave_category_other: '',
      note: '',
    });
  };

  const resetBlockedDomainForm = () => {
    setBlockedDomainForm({
      public_ip: '',
      domain_id: '',
      notes: '',
    });
  };

  const closeBlockedDomainModal = () => {
    setBlockedDomainsModalOpen(false);
    setEditingBlockedDomain(null);
    resetBlockedDomainForm();
  };

  const openAddBlockedDomain = () => {
    if (!canAddEditBlockedDomain) {
      toast.error('You do not have permission to add blocked domains.');
      return;
    }
    setEditingBlockedDomain(null);
    resetBlockedDomainForm();
    setBlockedDomainsModalOpen(true);
  };

  const openEditBlockedDomain = (row) => {
    if (!canAddEditBlockedDomain || !row?.id) return;
    setEditingBlockedDomain(row);
    setBlockedDomainForm({
      public_ip: row.public_ip || '',
      domain_id: row.domain_id || '',
      notes: row.notes || '',
    });
    setBlockedDomainsModalOpen(true);
  };

  const saveBlockedDomain = async () => {
    if (!supabase) return;
    if (!canAddEditBlockedDomain) {
      toast.error('You do not have permission to save blocked domains.');
      return;
    }
    const publicIp = String(blockedDomainForm.public_ip || '').trim();
    const domainId = String(blockedDomainForm.domain_id || '').trim();
    if (!publicIp || !domainId) {
      toast.error('Public IP and Domain Blocked are required.');
      return;
    }
    const todayLocalDate = new Date().toLocaleDateString('en-CA');

    const payload = {
      public_ip: publicIp,
      intern_name: currentActorName,
      domain_id: domainId,
      date_blocked: editingBlockedDomain?.date_blocked || todayLocalDate,
      notes: String(blockedDomainForm.notes || '').trim() || null,
      updated_at: new Date().toISOString(),
    };

    try {
      setBlockedDomainSaving(true);
      const q = supabase.from('blocked_domain_tracker');
      const { error } = editingBlockedDomain?.id
        ? await q.update(payload).eq('id', editingBlockedDomain.id)
        : await q.insert({
            ...payload,
            created_at: new Date().toISOString(),
            date_unblocked: null,
            handled_by: null,
          });
      if (error) throw error;
      toast.success(editingBlockedDomain?.id ? 'Blocked domain updated.' : 'Blocked domain added.');
      closeBlockedDomainModal();
      fetchBlockedDomainRows();
    } catch (err) {
      console.warn('TrackerPage: save blocked domain error', err);
      toast.error(err?.message || 'Failed to save blocked domain.');
    } finally {
      setBlockedDomainSaving(false);
    }
  };

  const deleteBlockedDomain = async (row) => {
    if (!supabase || !row?.id) return;
    if (!canDeleteBlockedDomain) {
      toast.error('You do not have permission to delete blocked domains.');
      return;
    }
    const ok = window.confirm('Delete this blocked domain entry?');
    if (!ok) return;
    try {
      const { error } = await supabase.from('blocked_domain_tracker').delete().eq('id', row.id);
      if (error) throw error;
      toast.success('Blocked domain entry deleted.');
      fetchBlockedDomainRows();
    } catch (err) {
      console.warn('TrackerPage: delete blocked domain error', err);
      toast.error(err?.message || 'Failed to delete blocked domain entry.');
    }
  };

  const markBlockedDomainAsUnblocked = async (row) => {
    if (!supabase || !row?.id) return;
    if (!canMarkBlockedDomainUnblocked) {
      toast.error('Only TL/VTL/Admin can mark a blocked domain as unblocked.');
      return;
    }
    try {
      const today = new Date().toISOString().slice(0, 10);
      const payload = {
        handled_by: currentActorName,
        date_unblocked: row.date_unblocked || today,
        updated_at: new Date().toISOString(),
      };
      const { error } = await supabase.from('blocked_domain_tracker').update(payload).eq('id', row.id);
      if (error) throw error;
      toast.success('Marked as unblocked.');
      fetchBlockedDomainRows();
    } catch (err) {
      console.warn('TrackerPage: unblock blocked domain error', err);
      toast.error(err?.message || 'Failed to mark as unblocked.');
    }
  };

  const domainsById = useMemo(() => {
    return domains.reduce((acc, domain) => {
      if (domain?.id) acc[domain.id] = domain;
      return acc;
    }, {});
  }, [domains]);

  const addLeaveRow = async () => {
    const internName = String(currentActorName || '').trim();
    const start = leaveForm.leave_start_date;
    const end = leaveForm.leave_end_date;
    const link = String(leaveForm.leave_form_link || '').trim();
    const category = String(leaveForm.leave_category || '').trim();
    const otherLabel = String(leaveForm.leave_category_other || '').trim();
    const finalCategory = category === 'Other' ? otherLabel : category;
    if (!internName || !start || !end || !link) {
      toast.error('Please fill in dates and leave form link.');
      return;
    }
    const startDt = new Date(`${start}T00:00:00`);
    const endDt = new Date(`${end}T00:00:00`);
    if (endDt < startDt) {
      toast.error('Leave end date must be on or after leave start date.');
      return;
    }
    const next = {
      intern_name: internName,
      submitter_user_id: user?.id || null,
      submitter_role: userRole || null,
      submitter_team: userTeam || null,
      leave_start_date: start,
      leave_end_date: end,
      leave_type: leaveForm.leave_type === 'half' ? 'half' : 'whole',
      leave_form_link: link,
      leave_category: finalCategory || null,
      signed_by: null,
      signed_by_user_id: null,
      status: 'pending',
      note: String(leaveForm.note || '').trim(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    try {
      const { data, error } = await supabase
        .from('leave_tracker')
        .insert(next)
        .select('*')
        .single();
      if (error) throw error;
      setLeaveRows((prev) => [data, ...prev]);
      resetLeaveForm();
      setLeaveModalOpen(false);
      toast.success('Leave record added.');
    } catch (err) {
      console.warn('TrackerPage: add leave record error', err);
      toast.error(err?.message || 'Failed to add leave record.');
    }
  };

  const beginEditLeaveRow = (row) => {
    setEditingLeaveId(row.id);
    setLeaveEditDraft({ ...row });
  };

  const cancelEditLeaveRow = () => {
    setEditingLeaveId(null);
    setLeaveEditDraft(null);
  };

  const saveEditLeaveRow = async () => {
    if (!editingLeaveId || !leaveEditDraft) return;
    const start = leaveEditDraft.leave_start_date;
    const end = leaveEditDraft.leave_end_date;
    const link = String(leaveEditDraft.leave_form_link || '').trim();
    const category = String(leaveEditDraft.leave_category || '').trim();
    const otherLabel = String(leaveEditDraft.leave_category_other || '').trim();
    const finalCategory = category === 'Other' ? otherLabel : category;
    if (!start || !end || !link) {
      toast.error('Please fill in dates and leave form link.');
      return;
    }
    const startDt = new Date(`${start}T00:00:00`);
    const endDt = new Date(`${end}T00:00:00`);
    if (endDt < startDt) {
      toast.error('Leave end date must be on or after leave start date.');
      return;
    }
    const payload = {
      leave_start_date: start,
      leave_end_date: end,
      leave_type: leaveEditDraft.leave_type === 'half' ? 'half' : 'whole',
      leave_form_link: link,
      leave_category: finalCategory || null,
      note: String(leaveEditDraft.note || '').trim(),
      updated_at: new Date().toISOString(),
    };
    try {
      const { error } = await supabase.from('leave_tracker').update(payload).eq('id', editingLeaveId);
      if (error) throw error;
      setLeaveRows((prev) => prev.map((r) => (r.id === editingLeaveId ? { ...r, ...payload } : r)));
      cancelEditLeaveRow();
      toast.success('Leave record updated.');
    } catch (err) {
      console.warn('TrackerPage: update leave record error', err);
      toast.error(err?.message || 'Failed to update leave record.');
    }
  };

  const canApproveLeaveRow = (row) => {
    if (!canManageLeaveApprovals) return false;
    if (!row) return false;
    if (row.submitter_user_id && row.submitter_user_id === user?.id) return false;
    const submitterRole = String(row.submitter_role || '').toLowerCase();
    const submitterTeam = String(row.submitter_team || '').toLowerCase();
    if (submitterRole === 'tl' && submitterTeam === 'tla') {
      return userRole === 'admin';
    }
    if (submitterRole === 'vtl' && submitterTeam === 'tla') {
      return userRole === 'admin' || (userRole === 'tl' && isTlaTeam);
    }
    return true;
  };

  const canEditDeleteLeaveRow = (row) => {
    if (!row) return false;
    if (String(row.status || '').toLowerCase() === 'approved') return false;
    if (userRole === 'admin') return false; // admin validates only
    return row.submitter_user_id && row.submitter_user_id === user?.id;
  };

  const visibleLeaveRows = useMemo(() => {
    if (userRole === 'admin') {
      return leaveRows.filter((r) => ['intern', 'tl', 'vtl'].includes(String(r.submitter_role || '').toLowerCase()));
    }
    if (isInternRole) {
      return leaveRows.filter((r) => r.submitter_user_id && r.submitter_user_id === user?.id);
    }
    if (isTlVtlRole && isTlaTeam) {
      return leaveRows.filter((r) => {
        const role = String(r.submitter_role || '').toLowerCase();
        const mine = r.submitter_user_id && r.submitter_user_id === user?.id;
        const isIntern = role === 'intern';
        return mine || isIntern;
      });
    }
    return leaveRows;
  }, [leaveRows, userRole, isInternRole, isTlVtlRole, isTlaTeam, user?.id]);

  const updateLeaveStatus = async (row, nextStatus) => {
    if (!row?.id) return;
    if (!['approved', 'declined'].includes(nextStatus)) return;
    if (!canApproveLeaveRow(row)) {
      toast.error('You do not have permission to validate this leave form.');
      return;
    }
    const payload = {
      status: nextStatus,
      signed_by: nextStatus === 'approved' ? currentActorName : null,
      signed_by_user_id: nextStatus === 'approved' ? (user?.id || null) : null,
      validated_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    try {
      const { error } = await supabase.from('leave_tracker').update(payload).eq('id', row.id);
      if (error) throw error;
      setLeaveRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, ...payload } : r)));
      toast.success(nextStatus === 'approved' ? 'Leave form approved.' : 'Leave form declined.');
    } catch (err) {
      console.warn('TrackerPage: approve/decline leave error', err);
      toast.error(err?.message || 'Failed to update leave status.');
    }
  };

  const deleteLeaveRow = async (id) => {
    if (!window.confirm('Delete this leave record?')) return;
    try {
      const { error } = await supabase.from('leave_tracker').delete().eq('id', id);
      if (error) throw error;
      setLeaveRows((prev) => prev.filter((r) => r.id !== id));
      if (editingLeaveId === id) cancelEditLeaveRow();
      toast.success('Leave record deleted.');
    } catch (err) {
      console.warn('TrackerPage: delete leave record error', err);
      toast.error(err?.message || 'Failed to delete leave record.');
    }
  };

  const visibleItdRows = useMemo(() => {
    if (canManageItd) return itdRows;
    // interns: only their own submitted rows
    return itdRows.filter((r) => r.submitter_user_id && r.submitter_user_id === user?.id);
  }, [itdRows, canManageItd, user?.id]);

  const filteredItdRows = useMemo(() => {
    const q = String(itdSearch || '').trim().toLowerCase();
    if (!q) return visibleItdRows;
    return visibleItdRows.filter((r) => {
      const hay = [
        r?.intern_name,
        r?.contact_address,
        r?.document_type,
        r?.designated_team,
        r?.status,
        r?.addressed_to,
        r?.company,
        r?.return_to_whom,
        r?.handled_by,
        r?.requested_by,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    });
  }, [visibleItdRows, itdSearch]);

  const openAddItd = () => {
    setEditingItdId(null);
    resetItdForm();
    setItdModalOpen(true);
  };

  const openItdDetails = (row) => {
    if (!row) return;
    setItdDetailsRow(row);
    setItdDetailsOpen(true);
  };

  useEffect(() => {
    if (itdDetailsOpen) setItdDetailsMounted(true);
    if (!itdDetailsOpen && itdDetailsMounted) {
      const t = window.setTimeout(() => setItdDetailsMounted(false), 260);
      return () => window.clearTimeout(t);
    }
  }, [itdDetailsOpen, itdDetailsMounted]);

  useEffect(() => {
    if (!itdDetailsMounted) return;
    const onKeyDown = (e) => {
      if (e.key === 'Escape') {
        setItdDetailsOpen(false);
        setItdDetailsRow(null);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = prevOverflow;
    };
  }, [itdDetailsMounted]);

  useEffect(() => {
    if (!itdDetailsOpen || !itdDetailsRow?.id) return;
    const freshRow = itdRows.find((r) => r.id === itdDetailsRow.id);
    if (!freshRow) return;
    if (
      freshRow.status !== itdDetailsRow.status ||
      freshRow.handled_by !== itdDetailsRow.handled_by ||
      freshRow.date_signed !== itdDetailsRow.date_signed ||
      freshRow.updated_at !== itdDetailsRow.updated_at
    ) {
      setItdDetailsRow(freshRow);
    }
  }, [itdDetailsOpen, itdDetailsRow, itdRows]);

  const openManageItdOptions = () => {
    setItdOptionEditor({
      document_type: [...(itdOptions.document_type || [])],
      addressed_to: [...(itdOptions.addressed_to || [])],
      company: [...(itdOptions.company || [])],
    });
    setItdManageOptionsOpen(true);
  };

  const updateItdEditorValue = (fieldKey, index, value) => {
    setItdOptionEditor((prev) => {
      const next = [...(prev[fieldKey] || [])];
      next[index] = value;
      return { ...prev, [fieldKey]: next };
    });
  };

  const addItdEditorValue = (fieldKey) => {
    setItdOptionEditor((prev) => ({
      ...prev,
      [fieldKey]: [...(prev[fieldKey] || []), ''],
    }));
  };

  const removeItdEditorValue = (fieldKey, index) => {
    setItdOptionEditor((prev) => ({
      ...prev,
      [fieldKey]: (prev[fieldKey] || []).filter((_, i) => i !== index),
    }));
  };

  const saveItdDropdownOptions = async () => {
    if (!canManageItd) return;
    const fieldKeys = ['document_type', 'addressed_to', 'company'];
    const rows = [];
    fieldKeys.forEach((fieldKey) => {
      const seen = new Set();
      (itdOptionEditor[fieldKey] || []).forEach((raw, i) => {
        const value = String(raw || '').trim();
        if (!value) return;
        const normalized = value.toLowerCase();
        if (seen.has(normalized)) return;
        seen.add(normalized);
        rows.push({ field_key: fieldKey, value, sort_order: i });
      });
    });
    if (!rows.length) {
      toast.error('Please keep at least one value.');
      return;
    }
    setItdOptionsSaving(true);
    try {
      const { error: delError } = await supabase
        .from('itd_dropdown_options')
        .delete()
        .in('field_key', fieldKeys);
      if (delError) throw delError;
      const { error: insError } = await supabase.from('itd_dropdown_options').insert(rows);
      if (insError) throw insError;
      await fetchItdOptions();
      setItdManageOptionsOpen(false);
      toast.success('Dropdown options updated.');
    } catch (err) {
      console.warn('TrackerPage: save ITD dropdown options error', err);
      toast.error(err?.message || 'Failed to update dropdown options.');
    } finally {
      setItdOptionsSaving(false);
    }
  };

  const openEditItd = (row) => {
    const matchedIntern = users.find(
      (u) =>
        u.role === 'intern' &&
        (u.id === row?.submitter_user_id ||
          (u.full_name && String(u.full_name).trim() === String(row?.intern_name || '').trim()) ||
          (u.email && String(u.email).trim().toLowerCase() === String(row?.contact_address || '').trim().toLowerCase()))
    );
    setItdSelectedInternId(matchedIntern?.id || '');
    setItdDocumentLinkTouched(false);
    setEditingItdId(row?.id || null);
    setItdForm({
      document_link: row?.document_link || '',
      intern_name: row?.intern_name || '',
      document_type: row?.document_type || ITD_DEFAULT_OPTIONS.document_type[0],
      addressed_to: row?.addressed_to || ITD_DEFAULT_OPTIONS.addressed_to[0],
      company: row?.company || ITD_DEFAULT_OPTIONS.company[0],
      contact_address: row?.contact_address || '',
      designated_team: row?.designated_team || '',
      due_date: row?.due_date || '',
      return_to_whom: row?.return_to_whom || '',
    });
    setItdModalOpen(true);
  };

  const handleSelectItdIntern = (internId) => {
    setItdSelectedInternId(internId);
    const selected = itdInternOptions.find((u) => u.id === internId);
    if (!selected) return;
    setItdForm((prev) => ({
      ...prev,
      intern_name: String(selected.full_name || '').trim() || String(selected.email || '').trim(),
      contact_address: String(selected.email || '').trim(),
      designated_team: String(selected.team || '').trim(),
    }));
  };

  const isValidHttpUrl = (value) => {
    try {
      const u = new URL(value);
      return u.protocol === 'http:' || u.protocol === 'https:';
    } catch {
      return false;
    }
  };

  const isValidItdDocumentLink = (value) => {
    try {
      const u = new URL(String(value || '').trim());
      if (u.protocol !== 'https:') return false;
      const host = String(u.hostname || '').toLowerCase();
      const allowedHosts = [
        'docs.google.com',
        'drive.google.com',
        'onedrive.live.com',
        '1drv.ms',
        'sharepoint.com',
        'microsoft.com',
        'kti-portal.vercel.app',
      ];
      return allowedHosts.some((h) => host === h || host.endsWith(`.${h}`));
    } catch {
      return false;
    }
  };

  const isValidEmail = (value) => {
    const v = String(value || '').trim();
    if (!v) return false;
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
  };

  const updateItdRow = async (rowId, patch) => {
    if (!rowId) return null;
    const payload = { ...patch, updated_at: new Date().toISOString() };
    const { data, error } = await supabase
      .from('intern_document_tracker')
      .update(payload)
      .eq('id', rowId)
      .select('*')
      .single();
    if (error) throw error;
    setItdRows((prev) => prev.map((r) => (r.id === rowId ? data : r)));
    return data;
  };

  const markItdForReviewOnOpen = async (row) => {
    if (!canManageItd) return;
    if (!row?.id) return;
    const current = String(row.status || '').trim();
    if (!current || current.toLowerCase() === 'pending') {
      try {
        await updateItdRow(row.id, { status: 'For Review' });
      } catch (err) {
        console.warn('TrackerPage: set ITD For Review error', err);
      }
    }
  };

  const approveItd = async (row) => {
    if (!canManageItd) return;
    if (!row?.id) return;
    try {
      setItdApprovingId(row.id);
      const today = new Date().toISOString().slice(0, 10);
      const updated = await updateItdRow(row.id, {
        status: 'Signed',
        handled_by: currentActorName,
        date_signed: today,
      });
      if (itdDetailsOpen && itdDetailsRow?.id === row.id && updated) {
        setItdDetailsRow(updated);
      }
      toast.success('Document approved.');
    } catch (err) {
      console.warn('TrackerPage: approve ITD error', err);
      toast.error(err?.message || 'Failed to approve ITD record.');
    } finally {
      setItdApprovingId((prev) => (prev === row.id ? null : prev));
    }
  };

  const saveItd = async () => {
    const link = String(itdForm.document_link || '').trim();
    const internName = String(itdForm.intern_name || '').trim();
    const docType = String(itdForm.document_type || '').trim();
    const addressedTo = String(itdForm.addressed_to || '').trim();
    const company = String(itdForm.company || '').trim();
    const contact = String(itdForm.contact_address || '').trim();
    const team = String(itdForm.designated_team || '').trim();
    const dueDate = itdForm.due_date || '';

    if (!link || !internName || !docType || !addressedTo || !company || !contact || !team || !dueDate) {
      toast.error('Please complete all required fields.');
      return;
    }
    if (!isInternRole && canManageItd && !itdSelectedInternId) {
      toast.error('Please select an intern.');
      return;
    }
    if (!isValidHttpUrl(link)) {
      toast.error('Document link must be a valid URL (include https://).');
      return;
    }
    if (!isValidItdDocumentLink(link)) {
      toast.error('Document link must be an HTTPS Google Drive/Docs, SharePoint/OneDrive, or Microsoft Teams link.');
      return;
    }
    if (!isValidEmail(contact)) {
      toast.error('Contact address must be a valid email.');
      return;
    }
    const today = new Date().toISOString().slice(0, 10);
    if (dueDate < today) {
      toast.error('Due date cannot be in the past.');
      return;
    }

    const basePayload = {
      submitter_user_id: user?.id || null,
      submitter_name: currentActorName,
      submitter_role: userRole || null,
      submitter_team: userTeam || null,
      document_link: link,
      intern_name: internName,
      document_type: docType,
      addressed_to: addressedTo,
      company,
      contact_address: contact,
      designated_team: team,
      due_date: dueDate,
      return_to_whom: String(itdForm.return_to_whom || '').trim() || null,
      requested_by: userRole === 'admin' ? currentActorName : null,
      updated_at: new Date().toISOString(),
    };

    try {
      const q = supabase.from('intern_document_tracker');
      const { data, error } = editingItdId
        ? await q.update(basePayload).eq('id', editingItdId).select('*').single()
        : await q
            .insert({
              ...basePayload,
              date_submitted: new Date().toISOString().slice(0, 10),
              status: 'Pending',
              created_at: new Date().toISOString(),
            })
            .select('*')
            .single();
      if (error) throw error;
      setItdRows((prev) => {
        if (!data?.id) return prev;
        const exists = prev.some((r) => r.id === data.id);
        return exists ? prev.map((r) => (r.id === data.id ? data : r)) : [data, ...prev];
      });
      toast.success(editingItdId ? 'ITD record updated.' : 'ITD record added.');
      setItdModalOpen(false);
      setEditingItdId(null);
      resetItdForm();
    } catch (err) {
      console.warn('TrackerPage: save ITD error', err);
      // Backward-compat fallback if DB doesn't yet have new columns.
      const msg = String(err?.message || '');
      const maybeMissingColumn = msg.toLowerCase().includes('column') && msg.toLowerCase().includes('does not exist');
      if (maybeMissingColumn && (msg.includes('intern_name') || msg.includes('requested_by'))) {
        try {
          const fallbackPayload = { ...basePayload };
          delete fallbackPayload.intern_name;
          delete fallbackPayload.requested_by;
          const q = supabase.from('intern_document_tracker');
          const { data, error } = editingItdId
            ? await q.update(fallbackPayload).eq('id', editingItdId).select('*').single()
            : await q
                .insert({
                  ...fallbackPayload,
                  date_submitted: new Date().toISOString().slice(0, 10),
                  status: 'Pending',
                  created_at: new Date().toISOString(),
                })
                .select('*')
                .single();
          if (error) throw error;
          setItdRows((prev) => {
            if (!data?.id) return prev;
            const exists = prev.some((r) => r.id === data.id);
            return exists ? prev.map((r) => (r.id === data.id ? data : r)) : [data, ...prev];
          });
          toast.success(editingItdId ? 'ITD record updated.' : 'ITD record added.');
          setItdModalOpen(false);
          setEditingItdId(null);
          resetItdForm();
          return;
        } catch (fallbackErr) {
          console.warn('TrackerPage: save ITD fallback error', fallbackErr);
        }
      }
      toast.error(err?.message || 'Failed to save ITD record.');
    }
  };

  const itdDocumentLinkTrimmed = String(itdForm.document_link || '').trim();
  const itdDocumentLinkInvalid =
    Boolean(itdDocumentLinkTrimmed) && !isValidItdDocumentLink(itdDocumentLinkTrimmed);

  const deleteItd = async (row) => {
    if (!row?.id) return;
    const ok = window.confirm('Delete this ITD record?');
    if (!ok) return;
    try {
      const { error } = await supabase.from('intern_document_tracker').delete().eq('id', row.id);
      if (error) throw error;
      setItdRows((prev) => prev.filter((r) => r.id !== row.id));
      toast.success('ITD record deleted.');
    } catch (err) {
      console.warn('TrackerPage: delete ITD error', err);
      toast.error(err?.message || 'Failed to delete ITD record.');
    }
  };

  const canEditItdRow = (row) => {
    if (!row) return false;
    if (canManageItd) return false;
    return row.submitter_user_id && row.submitter_user_id === user?.id;
  };

  if (!canAccessTracker(userRole, userTeam)) {
    const dashboard = userRole === 'admin' || userRole === 'tla' ? '/admin/dashboard' : '/intern/dashboard';
    return <Navigate to={dashboard} replace />;
  }

  return (
    <div className="w-full space-y-4 sm:space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100" style={{ color: PRIMARY }}>
          Tracker
        </h1>
        <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
          TL/VTL tracker and schedule form. Use the tabs below to switch between views.
        </p>
      </div>

      <div className="relative flex flex-col gap-3 border-b border-gray-200 dark:border-gray-800 sm:block">
        <div className="flex flex-wrap gap-2 pr-0 sm:pr-[18rem]">
          <button
            type="button"
            onClick={() => setSearchParams({ tab: 'tl-vtl' })}
            className={`px-4 py-2 rounded-t-lg text-sm font-medium transition-colors ${
              trackerTab === 'tl-vtl'
                ? 'bg-white dark:bg-gray-900 border border-b-0 border-gray-200 dark:border-gray-800 -mb-px text-gray-900 dark:text-gray-100'
                : 'bg-gray-100 dark:bg-gray-950/40 text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-800'
            }`}
            style={trackerTab === 'tl-vtl' ? { borderTopColor: PRIMARY } : {}}
          >
            TL/VTL
          </button>
          {(userRole === 'admin' || userRole === 'tla' || ((userRole === 'tl' || userRole === 'vtl') && isTlaTeam)) && (
            <button
              type="button"
              onClick={() => setSearchParams({ tab: 'intern-records' })}
              className={`px-4 py-2 rounded-t-lg text-sm font-medium transition-colors ${
                trackerTab === 'intern-records'
                  ? 'bg-white dark:bg-gray-900 border border-b-0 border-gray-200 dark:border-gray-800 -mb-px text-gray-900 dark:text-gray-100'
                  : 'bg-gray-100 dark:bg-gray-950/40 text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-800'
              }`}
              style={trackerTab === 'intern-records' ? { borderTopColor: PRIMARY } : {}}
            >
              Intern Records (TLA)
            </button>
          )}
          <button
            type="button"
            onClick={() => setSearchParams({ tab: 'schedule' })}
            className={`px-4 py-2 rounded-t-lg text-sm font-medium transition-colors ${
              trackerTab === 'schedule'
                ? 'bg-white dark:bg-gray-900 border border-b-0 border-gray-200 dark:border-gray-800 -mb-px text-gray-900 dark:text-gray-100'
                : 'bg-gray-100 dark:bg-gray-950/40 text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-800'
            }`}
            style={trackerTab === 'schedule' ? { borderTopColor: PRIMARY } : {}}
          >
            Schedule
          </button>
          <button
            type="button"
            onClick={() => setSearchParams({ tab: 'leave' })}
            className={`px-4 py-2 rounded-t-lg text-sm font-medium transition-colors ${
              trackerTab === 'leave'
                ? 'bg-white dark:bg-gray-900 border border-b-0 border-gray-200 dark:border-gray-800 -mb-px text-gray-900 dark:text-gray-100'
                : 'bg-gray-100 dark:bg-gray-950/40 text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-800'
            }`}
            style={trackerTab === 'leave' ? { borderTopColor: PRIMARY } : {}}
          >
            Leave
          </button>
          <button
            type="button"
            onClick={() => setSearchParams({ tab: 'blocked-domains' })}
            className={`px-4 py-2 rounded-t-lg text-sm font-medium transition-colors ${
              trackerTab === 'blocked-domains'
                ? 'bg-white dark:bg-gray-900 border border-b-0 border-gray-200 dark:border-gray-800 -mb-px text-gray-900 dark:text-gray-100'
                : 'bg-gray-100 dark:bg-gray-950/40 text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-800'
            }`}
            style={trackerTab === 'blocked-domains' ? { borderTopColor: PRIMARY } : {}}
          >
            Blocked Domains
          </button>
          <button
            type="button"
            onClick={() => setSearchParams({ tab: 'itd' })}
            className={`px-4 py-2 rounded-t-lg text-sm font-medium transition-colors ${
              trackerTab === 'itd'
                ? 'bg-white dark:bg-gray-900 border border-b-0 border-gray-200 dark:border-gray-800 -mb-px text-gray-900 dark:text-gray-100'
                : 'bg-gray-100 dark:bg-gray-950/40 text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-800'
            }`}
            style={trackerTab === 'itd' ? { borderTopColor: PRIMARY } : {}}
          >
            ITD
          </button>
        </div>
        {trackerTab === 'tl-vtl' && (
          <div className="flex flex-wrap items-center gap-2 pb-2 sm:absolute sm:right-0 sm:top-0 sm:pb-0">
            {!isTlVtlTrackerEditMode ? (
              <button
                type="button"
                onClick={() => {
                  setIsTlVtlTrackerEditMode(true);
                  setTlVtlTrackerPendingDeletes([]);
                  setDeleteConfirmOpen(false);
                  setDeleteConfirmTargetId(null);
                }}
                className="px-4 py-2 rounded-lg text-sm font-medium text-white"
                style={{ backgroundColor: PRIMARY }}
              >
                Edit
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={addTlVtlTrackerRow}
                  disabled={savingTlVtlTracker || deleteConfirmOpen}
                  className="px-4 py-2 rounded-lg text-sm font-medium text-gray-700 dark:text-gray-200 border border-gray-300 dark:border-gray-700 bg-transparent hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-60"
                >
                  {savingTlVtlTracker ? 'Adding...' : 'Add row'}
                </button>
                <button
                  type="button"
                  onClick={saveAllTlVtlTrackerRows}
                  disabled={savingTlVtlTracker || deleteConfirmOpen}
                  className="px-4 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-60"
                  style={{ backgroundColor: PRIMARY }}
                >
                  {savingTlVtlTracker ? 'Saving...' : 'Save'}
                </button>
                <button
                  type="button"
                  onClick={cancelTlVtlTrackerEdit}
                  disabled={savingTlVtlTracker}
                  className="px-4 py-2 rounded-lg text-sm font-medium text-gray-700 dark:text-gray-200 border border-gray-300 dark:border-gray-700 bg-transparent hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-60"
                >
                  Cancel
                </button>
              </>
            )}
          </div>
        )}
      </div>

      {trackerTab === 'schedule' ? (
        <ScheduleTab />
      ) : trackerTab === 'intern-records' ? (
        <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 overflow-hidden shadow-sm">
          <div className="px-5 py-4 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Intern Records (TLA POV)</h2>
              <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                This view reads/writes the same <span className="font-mono">intern_records</span> table as Monitoring. Updates are shared.
              </p>
            </div>
            {canAccessTlaInternRecords && (
              <button
                type="button"
                onClick={openAddRecord}
                className="px-4 py-2 rounded-lg text-sm font-medium text-white"
                style={{ backgroundColor: PRIMARY }}
              >
                + Add record
              </button>
            )}
          </div>

          {recordsLoading ? (
            <div className="py-12 text-center text-gray-500 dark:text-gray-400">Loading records...</div>
          ) : internRecords.length === 0 ? (
            <div className="py-12 text-center text-gray-500 dark:text-gray-400">No records yet.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-800">
                <thead className="bg-gray-50 dark:bg-gray-950/40">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 dark:text-gray-300 uppercase">Last Name</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 dark:text-gray-300 uppercase">First Name</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 dark:text-gray-300 uppercase">Hours/Day</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 dark:text-gray-300 uppercase">Total</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 dark:text-gray-300 uppercase">Rendered</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 dark:text-gray-300 uppercase">Remaining</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 dark:text-gray-300 uppercase">Start</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 dark:text-gray-300 uppercase">Target 1</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 dark:text-gray-300 uppercase">Target 2</th>
                    {canAccessTlaInternRecords && (
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-600 dark:text-gray-300 uppercase">Actions</th>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-800 bg-white dark:bg-gray-900">
                  {internRecords.map((rec) => (
                    <tr key={rec.id} className="hover:bg-gray-50/80 dark:hover:bg-gray-800/60">
                      <td className="px-4 py-3 text-sm text-gray-900 dark:text-gray-100">{rec.last_name}</td>
                      <td className="px-4 py-3 text-sm text-gray-900 dark:text-gray-100">{rec.first_name}</td>
                      <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-200">{rec.hours_per_day ?? '—'}</td>
                      <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-200">{rec.total_request ?? '—'}</td>
                      <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-200">{rec.hours_rendered ?? '—'}</td>
                      <td className="px-4 py-3 text-sm font-semibold text-gray-900 dark:text-gray-100">{computeRemainingHours(rec)}</td>
                      <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-200">{formatMdy(rec.start_date)}</td>
                      <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-200">{formatMdy(rec.target_end_1)}</td>
                      <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-200">{formatMdy(rec.target_end_2)}</td>
                      {canAccessTlaInternRecords && (
                        <td className="px-4 py-3 text-sm text-right whitespace-nowrap">
                          <button
                            type="button"
                            onClick={() => openEditRecord(rec)}
                            className="px-2 py-1 rounded-md text-xs font-medium border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => deleteRecord(rec)}
                            className="ml-2 px-2 py-1 rounded-md text-xs font-medium border border-red-200 dark:border-red-900/50 text-red-700 dark:text-red-200 hover:bg-red-50/60 dark:hover:bg-red-950/30"
                          >
                            Delete
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {recordModalOpen && (
            <Modal open={recordModalOpen} onClose={closeRecordModal} zIndexClassName="z-[2147483647]">
              <div className="w-full max-w-2xl bg-white dark:bg-gray-900 rounded-xl shadow-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
                <div className="px-5 py-4 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between">
                  <div>
                    <h3 className="font-semibold text-gray-900 dark:text-gray-100" style={{ color: PRIMARY }}>
                      {editingRecord ? 'Edit intern record' : 'Add intern record'}
                    </h3>
                    <p className="text-xs text-gray-500 dark:text-gray-400">Team: <span className="font-semibold">TLA</span></p>
                  </div>
                  <button
                    type="button"
                    onClick={closeRecordModal}
                    className="px-3 py-2 rounded-lg text-sm font-medium text-gray-700 dark:text-gray-200 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700"
                  >
                    Close
                  </button>
                </div>
                <div className="p-5">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {[
                      { key: 'last_name', label: 'Last Name', type: 'text', placeholder: 'Dela Cruz' },
                      { key: 'first_name', label: 'First Name', type: 'text', placeholder: 'Juan' },
                      { key: 'hours_per_day', label: 'Hours/Day', type: 'number', placeholder: '8' },
                      { key: 'total_request', label: 'Total Request', type: 'number', placeholder: '400' },
                      { key: 'hours_rendered', label: 'Hours Rendered', type: 'number', placeholder: '120' },
                      { key: 'start_date', label: 'Start Date', type: 'date', placeholder: '' },
                      { key: 'target_end_1', label: 'Target End 1', type: 'date', placeholder: '' },
                      { key: 'target_end_2', label: 'Target End 2', type: 'date', placeholder: '' },
                    ].map((f) => (
                      <div key={f.key} className="space-y-1">
                        <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300">{f.label}</label>
                        <input
                          type={f.type}
                          value={recordForm[f.key]}
                          onChange={(e) => setRecordForm((p) => ({ ...p, [f.key]: e.target.value }))}
                          placeholder={f.placeholder}
                          className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 px-3 py-2 text-sm focus:ring-2 focus:ring-[#6795BE] focus:border-transparent"
                        />
                      </div>
                    ))}
                  </div>
                  <div className="mt-5 flex items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={closeRecordModal}
                      className="px-4 py-2 rounded-lg text-sm font-medium border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={saveRecord}
                      className="px-4 py-2 rounded-lg text-sm font-medium text-white"
                      style={{ backgroundColor: PRIMARY }}
                    >
                      Save
                    </button>
                  </div>
                </div>
              </div>
            </Modal>
          )}
        </div>
      ) : trackerTab === 'leave' ? (
        <div className="space-y-4">
          <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 shadow-sm p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100" style={{ color: PRIMARY }}>
                  Leave Tracker
                </h2>
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  Temporary version: create and manage leave entries locally in this browser.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setLeaveSampleModalOpen(true)}
                  className="px-4 py-2 rounded-lg text-sm font-medium border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-200 bg-transparent hover:bg-gray-100 dark:hover:bg-gray-800"
                >
                  Sample leave form
                </button>
                <button
                  type="button"
                  onClick={() => setLeaveModalOpen(true)}
                  className="px-4 py-2 rounded-lg text-sm font-medium text-white"
                  style={{ backgroundColor: PRIMARY }}
                >
                  Add leave record
                </button>
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-800">
                <thead className="bg-gray-50 dark:bg-gray-950/40">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Intern name</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Leave type</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Leave start</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Leave end</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Option</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Duration</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Leave form</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Signed by</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Status</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Note</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-800 bg-white dark:bg-gray-900">
                  {visibleLeaveRows.length === 0 ? (
                    <tr>
                      <td colSpan={11} className="px-4 py-10 text-center text-sm text-gray-500 dark:text-gray-400">
                        No leave records yet.
                      </td>
                    </tr>
                  ) : (
                    visibleLeaveRows.map((row) => {
                      const isEditing = editingLeaveId === row.id;
                      const source = isEditing && leaveEditDraft ? leaveEditDraft : row;
                      return (
                        <tr key={row.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/60">
                          <td className="px-4 py-3 text-sm text-gray-900 dark:text-gray-100">
                            {row.intern_name}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-200">
                            {isEditing ? (
                              <div className="flex flex-col gap-1">
                                <select
                                  value={source.leave_category || 'Sick Leave'}
                                  onChange={(e) =>
                                    setLeaveEditDraft((d) => ({ ...d, leave_category: e.target.value }))
                                  }
                                  className="rounded border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-2 py-1.5 text-sm"
                                >
                                  <option value="Sick Leave">Sick Leave</option>
                                  <option value="Personal Leave">Personal Leave</option>
                                  <option value="Vacation Leave">Vacation Leave</option>
                                  <option value="Academic Commitment">Academic Commitment</option>
                                  <option value="Medical Appointment">Medical Appointment</option>
                                  <option value="Other">Other</option>
                                </select>
                                {source.leave_category === 'Other' && (
                                  <input
                                    type="text"
                                    value={source.leave_category_other || ''}
                                    onChange={(e) =>
                                      setLeaveEditDraft((d) => ({
                                        ...d,
                                        leave_category_other: e.target.value,
                                      }))
                                    }
                                    className="rounded border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-2 py-1.5 text-xs"
                                    placeholder="Specify leave type"
                                  />
                                )}
                              </div>
                            ) : (
                              row.leave_category || '—'
                            )}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-200">
                            {isEditing ? (
                              <input
                                type="date"
                                value={source.leave_start_date || ''}
                                onChange={(e) => setLeaveEditDraft((d) => ({ ...d, leave_start_date: e.target.value }))}
                                className="rounded border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-2 py-1.5 text-sm"
                              />
                            ) : (
                              formatMdy(row.leave_start_date)
                            )}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-200">
                            {isEditing ? (
                              <input
                                type="date"
                                value={source.leave_end_date || ''}
                                onChange={(e) => setLeaveEditDraft((d) => ({ ...d, leave_end_date: e.target.value }))}
                                className="rounded border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-2 py-1.5 text-sm"
                              />
                            ) : (
                              formatMdy(row.leave_end_date)
                            )}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-200">
                            {isEditing ? (
                              <select
                                value={source.leave_type || 'whole'}
                                onChange={(e) => setLeaveEditDraft((d) => ({ ...d, leave_type: e.target.value }))}
                                className="rounded border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-2 py-1.5 text-sm"
                              >
                                <option value="whole">Whole day</option>
                                <option value="half">Half day</option>
                              </select>
                            ) : (
                              row.leave_type === 'half' ? 'Half day' : 'Whole day'
                            )}
                          </td>
                          <td className="px-4 py-3 text-sm font-medium text-gray-900 dark:text-gray-100">
                            {calculateLeaveDuration(source.leave_start_date, source.leave_end_date, source.leave_type)}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-200">
                            {isEditing ? (
                              <input
                                type="url"
                                value={source.leave_form_link || ''}
                                onChange={(e) => setLeaveEditDraft((d) => ({ ...d, leave_form_link: e.target.value }))}
                                className="w-52 rounded border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-2 py-1.5 text-sm"
                              />
                            ) : row.leave_form_link ? (
                              <a
                                href={row.leave_form_link}
                                target="_blank"
                                rel="noreferrer"
                                className="text-[#6795BE] hover:underline"
                              >
                                Open link
                              </a>
                            ) : (
                              '—'
                            )}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-200">
                            {row.signed_by || '—'}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-200">
                            <span
                              className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                                row.status === 'approved'
                                  ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-200'
                                  : row.status === 'declined'
                                  ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-200'
                                  : 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-200'
                              }`}
                            >
                              {row.status || 'pending'}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-200">
                            {isEditing ? (
                              <input
                                type="text"
                                value={source.note || ''}
                                onChange={(e) => setLeaveEditDraft((d) => ({ ...d, note: e.target.value }))}
                                className="w-40 rounded border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-2 py-1.5 text-sm"
                              />
                            ) : (
                              row.note || '—'
                            )}
                          </td>
                          <td className="px-4 py-3 text-right whitespace-nowrap">
                            {isEditing ? (
                              <>
                                <button
                                  type="button"
                                  onClick={saveEditLeaveRow}
                                  className="px-2.5 py-1 rounded-md text-xs font-medium text-white"
                                  style={{ backgroundColor: PRIMARY }}
                                >
                                  Save
                                </button>
                                <button
                                  type="button"
                                  onClick={cancelEditLeaveRow}
                                  className="ml-2 px-2.5 py-1 rounded-md text-xs font-medium border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800"
                                >
                                  Cancel
                                </button>
                              </>
                            ) : (
                              <>
                                {canEditDeleteLeaveRow(row) && (
                                  <>
                                    <button
                                      type="button"
                                      onClick={() => beginEditLeaveRow(row)}
                                      className="px-2.5 py-1 rounded-md text-xs font-medium border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800"
                                    >
                                      Edit
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => deleteLeaveRow(row.id)}
                                      className="ml-2 px-2.5 py-1 rounded-md text-xs font-medium border border-red-200 dark:border-red-900/60 text-red-700 dark:text-red-300 hover:bg-red-50 dark:hover:bg-red-950/30"
                                    >
                                      Delete
                                    </button>
                                  </>
                                )}
                                {canApproveLeaveRow(row) && (
                                  <>
                                    <button
                                      type="button"
                                      onClick={() => updateLeaveStatus(row, 'approved')}
                                      className="ml-2 px-2.5 py-1 rounded-md text-xs font-medium border border-green-200 dark:border-green-900/60 text-green-700 dark:text-green-300 hover:bg-green-50 dark:hover:bg-green-950/30"
                                    >
                                      Approve
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => updateLeaveStatus(row, 'declined')}
                                      className="ml-2 px-2.5 py-1 rounded-md text-xs font-medium border border-yellow-200 dark:border-yellow-900/60 text-yellow-700 dark:text-yellow-200 hover:bg-yellow-50 dark:hover:bg-yellow-950/30"
                                    >
                                      Decline
                                    </button>
                                  </>
                                )}
                              </>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <Modal
            open={leaveModalOpen}
            onClose={() => {
              setLeaveModalOpen(false);
              resetLeaveForm();
            }}
            zIndexClassName="z-[2147483647]"
          >
            <div className="w-full max-w-3xl bg-white dark:bg-gray-900 rounded-xl shadow-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between">
                <h3 className="font-semibold text-gray-900 dark:text-gray-100" style={{ color: PRIMARY }}>
                  Add leave record
                </h3>
                <button
                  type="button"
                  onClick={() => {
                    setLeaveModalOpen(false);
                    resetLeaveForm();
                  }}
                  className="px-3 py-2 rounded-lg text-sm font-medium text-gray-700 dark:text-gray-200 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700"
                >
                  Close
                </button>
              </div>
              <div className="p-5">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="md:col-span-2">
                    <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">Submitted by</label>
                    <div className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-950/40 text-gray-800 dark:text-gray-200 px-3 py-2 text-sm">
                      {currentActorName}
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">Leave start date</label>
                    <input
                      type="date"
                      value={leaveForm.leave_start_date}
                      onChange={(e) => setLeaveForm((p) => ({ ...p, leave_start_date: e.target.value }))}
                      className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 px-3 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">Leave end date</label>
                    <input
                      type="date"
                      value={leaveForm.leave_end_date}
                      onChange={(e) => setLeaveForm((p) => ({ ...p, leave_end_date: e.target.value }))}
                      className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 px-3 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">Leave type</label>
                    <select
                      value={leaveForm.leave_category}
                      onChange={(e) => setLeaveForm((p) => ({ ...p, leave_category: e.target.value }))}
                      className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 px-3 py-2 text-sm"
                    >
                      <option value="Sick Leave">Sick Leave</option>
                      <option value="Personal Leave">Personal Leave</option>
                      <option value="Vacation Leave">Vacation Leave</option>
                      <option value="Academic Commitment">Academic Commitment</option>
                      <option value="Medical Appointment">Medical Appointment</option>
                      <option value="Other">Other</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">Option</label>
                    <select
                      value={leaveForm.leave_type}
                      onChange={(e) => setLeaveForm((p) => ({ ...p, leave_type: e.target.value }))}
                      className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 px-3 py-2 text-sm"
                    >
                      <option value="whole">Whole day</option>
                      <option value="half">Half day</option>
                    </select>
                  </div>
                  {leaveForm.leave_category === 'Other' && (
                    <div className="md:col-span-2">
                      <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">Leave type (Other – specify)</label>
                      <input
                        type="text"
                        value={leaveForm.leave_category_other}
                        onChange={(e) => setLeaveForm((p) => ({ ...p, leave_category_other: e.target.value }))}
                        className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 px-3 py-2 text-sm"
                        placeholder="Type of leave"
                      />
                    </div>
                  )}
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">Duration</label>
                    <div className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-950/40 text-gray-800 dark:text-gray-200 px-3 py-2 text-sm">
                      {calculateLeaveDuration(leaveForm.leave_start_date, leaveForm.leave_end_date, leaveForm.leave_type)}
                    </div>
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">Attached leave form (link)</label>
                    <input
                      type="url"
                      value={leaveForm.leave_form_link}
                      onChange={(e) => setLeaveForm((p) => ({ ...p, leave_form_link: e.target.value }))}
                      className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 px-3 py-2 text-sm"
                      placeholder="https://..."
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">Note (optional)</label>
                    <input
                      type="text"
                      value={leaveForm.note}
                      onChange={(e) => setLeaveForm((p) => ({ ...p, note: e.target.value }))}
                      className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 px-3 py-2 text-sm"
                      placeholder="Optional note"
                    />
                  </div>
                </div>
                <div className="mt-5 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setLeaveModalOpen(false);
                      resetLeaveForm();
                    }}
                    className="px-4 py-2 rounded-lg text-sm font-medium border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={addLeaveRow}
                    className="px-4 py-2 rounded-lg text-sm font-medium text-white"
                    style={{ backgroundColor: PRIMARY }}
                  >
                    Add leave record
                  </button>
                </div>
              </div>
            </div>
          </Modal>

          <Modal
            open={leaveSampleModalOpen}
            onClose={() => setLeaveSampleModalOpen(false)}
            zIndexClassName="z-[2147483647]"
          >
            <div className="w-full max-w-xl bg-white dark:bg-gray-900 rounded-xl shadow-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between">
                <h3 className="font-semibold text-gray-900 dark:text-gray-100" style={{ color: PRIMARY }}>
                  Sample leave form guide
                </h3>
                <button
                  type="button"
                  onClick={() => setLeaveSampleModalOpen(false)}
                  className="px-3 py-2 rounded-lg text-sm font-medium text-gray-700 dark:text-gray-200 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700"
                >
                  Close
                </button>
              </div>
              <div className="p-5 space-y-2 text-sm text-gray-700 dark:text-gray-200">
                <p className="font-medium">Leave Form Template:</p>
                <p>
                  <a
                    href={LEAVE_TEMPLATE_URL}
                    target="_blank"
                    rel="noreferrer"
                    className="text-[#6795BE] hover:underline break-all"
                  >
                    {LEAVE_TEMPLATE_URL}
                  </a>
                </p>
                <p className="font-medium">Instructions:</p>
                <ol className="list-decimal pl-5 space-y-1">
                  <li>Open the template link above.</li>
                  <li>Create your own copy first.</li>
                  <li>Edit only your copied file.</li>
                  <li>Upload/share your completed copy, then paste that link in the leave record form.</li>
                </ol>
                <p className="font-medium">Include these details in your leave form copy:</p>
                <ul className="list-disc pl-5 space-y-1">
                  <li>Intern full name and team</li>
                  <li>Leave type (whole day / half day)</li>
                  <li>Leave start and end date</li>
                  <li>Reason for leave</li>
                  <li>Approver signature section</li>
                </ul>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Use this as a temporary template reference until a final standardized leave form is provided.
                </p>
              </div>
            </div>
          </Modal>
        </div>
      ) : trackerTab === 'blocked-domains' ? (
        <div className="space-y-4">
          <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 shadow-sm p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100" style={{ color: PRIMARY }}>
                  Blocked Domains Tracker
                </h2>
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  Shared visibility for blocked domains so interns and leads can quickly troubleshoot outages.
                </p>
              </div>
              {canAddEditBlockedDomain && (
                <button
                  type="button"
                  onClick={openAddBlockedDomain}
                  className="px-4 py-2 rounded-lg text-sm font-medium text-white"
                  style={{ backgroundColor: PRIMARY }}
                >
                  Add blocked domain
                </button>
              )}
            </div>
          </div>

          <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-800">
                <thead className="bg-gray-50 dark:bg-gray-950/40">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Public IP</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Intern Name</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Domain Blocked</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Date Blocked</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Handled By</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Date Unblocked</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Notes</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-800 bg-white dark:bg-gray-900">
                  {blockedDomainsLoading ? (
                    <tr>
                      <td colSpan={8} className="px-4 py-10 text-center text-sm text-gray-500 dark:text-gray-400">
                        Loading blocked domains...
                      </td>
                    </tr>
                  ) : blockedDomainsRows.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-4 py-10 text-center text-sm text-gray-500 dark:text-gray-400">
                        No blocked domains yet.
                      </td>
                    </tr>
                  ) : (
                    blockedDomainsRows.map((row) => {
                      const domain = domainsById[row.domain_id];
                      const domainLabel = domain?.country || row.domain_name || row.domain_id || '—';
                      const unblocked = Boolean(row.date_unblocked);
                      return (
                        <tr key={row.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/60">
                          <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-200">{row.public_ip || '—'}</td>
                          <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-200">{row.intern_name || '—'}</td>
                          <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-200">
                            <div>{domainLabel}</div>
                            {domain?.url ? (
                              <div className="text-xs text-gray-500 dark:text-gray-400 break-all">{domain.url}</div>
                            ) : null}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-200">{formatMdy(row.date_blocked)}</td>
                          <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-200">{row.handled_by || '—'}</td>
                          <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-200">{formatMdy(row.date_unblocked)}</td>
                          <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-200 max-w-xs">
                            {row.notes ? <span className="line-clamp-2">{row.notes}</span> : '—'}
                          </td>
                          <td className="px-4 py-3 text-right whitespace-nowrap">
                            {canAddEditBlockedDomain && (
                              <button
                                type="button"
                                onClick={() => openEditBlockedDomain(row)}
                                className="px-2.5 py-1 rounded-md text-xs font-medium border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800"
                              >
                                Edit
                              </button>
                            )}
                            {canMarkBlockedDomainUnblocked && !unblocked && (
                              <button
                                type="button"
                                onClick={() => markBlockedDomainAsUnblocked(row)}
                                className="ml-2 px-2.5 py-1 rounded-md text-xs font-medium border border-green-200 dark:border-green-900/60 text-green-700 dark:text-green-300 hover:bg-green-50 dark:hover:bg-green-950/30"
                              >
                                Unblocked
                              </button>
                            )}
                            {canDeleteBlockedDomain && (
                              <button
                                type="button"
                                onClick={() => deleteBlockedDomain(row)}
                                className="ml-2 px-2.5 py-1 rounded-md text-xs font-medium border border-red-200 dark:border-red-900/60 text-red-700 dark:text-red-300 hover:bg-red-50 dark:hover:bg-red-950/30"
                              >
                                Delete
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <Modal open={blockedDomainsModalOpen} onClose={closeBlockedDomainModal} zIndexClassName="z-[2147483647]">
            <div className="w-full max-w-3xl bg-white dark:bg-gray-900 rounded-xl shadow-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between">
                <h3 className="font-semibold text-gray-900 dark:text-gray-100" style={{ color: PRIMARY }}>
                  {editingBlockedDomain?.id ? 'Edit blocked domain' : 'Add blocked domain'}
                </h3>
                <button
                  type="button"
                  onClick={closeBlockedDomainModal}
                  className="px-3 py-2 rounded-lg text-sm font-medium text-gray-700 dark:text-gray-200 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700"
                >
                  Close
                </button>
              </div>
              <div className="p-5">
                <div className="grid grid-cols-1 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">
                      Public IP <span className="text-red-600">*</span>
                    </label>
                    <input
                      type="text"
                      value={blockedDomainForm.public_ip}
                      onChange={(e) => setBlockedDomainForm((p) => ({ ...p, public_ip: e.target.value }))}
                      className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 px-3 py-2 text-sm"
                      placeholder="e.g. 203.0.113.15"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">
                      Domain Blocked <span className="text-red-600">*</span>
                    </label>
                    <select
                      value={blockedDomainForm.domain_id}
                      onChange={(e) => setBlockedDomainForm((p) => ({ ...p, domain_id: e.target.value }))}
                      className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 px-3 py-2 text-sm"
                    >
                      <option value="">Select domain...</option>
                      {domains.map((domain) => (
                        <option key={domain.id} value={domain.id}>
                          {domain.country || 'Unknown'} {domain.type ? `(${domain.type})` : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">Notes (optional)</label>
                    <textarea
                      value={blockedDomainForm.notes}
                      onChange={(e) => setBlockedDomainForm((p) => ({ ...p, notes: e.target.value }))}
                      rows={4}
                      className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 px-3 py-2 text-sm resize-y"
                      placeholder="Describe issue, affected feature, or troubleshooting details"
                    />
                  </div>
                </div>
                <div className="mt-5 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={closeBlockedDomainModal}
                    className="px-4 py-2 rounded-lg text-sm font-medium border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={saveBlockedDomain}
                    disabled={blockedDomainSaving}
                    className="px-4 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-60"
                    style={{ backgroundColor: PRIMARY }}
                  >
                    {blockedDomainSaving ? 'Saving...' : editingBlockedDomain?.id ? 'Save changes' : 'Add blocked domain'}
                  </button>
                </div>
              </div>
            </div>
          </Modal>
        </div>
      ) : trackerTab === 'itd' ? (
        <div className="space-y-4">
          <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 shadow-sm p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100" style={{ color: PRIMARY }}>
                  Intern Document Tracker (ITD)
                </h2>
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  Track documents requested/required from interns and signing/return workflow.
                </p>
              </div>
              <div className="flex flex-col sm:flex-row flex-wrap sm:items-center gap-2">
                <div className="w-full sm:w-[18rem] relative">
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
                    type="search"
                    value={itdSearch}
                    onChange={(e) => setItdSearch(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 pl-10 pr-3 py-2 text-sm"
                    placeholder="Search ITD (intern, email, type, status, team...)"
                  />
                </div>
                {canManageItd && (
                  <button
                    type="button"
                    onClick={openManageItdOptions}
                    className="px-4 py-2 rounded-lg text-sm font-medium border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-200 bg-transparent hover:bg-gray-100 dark:hover:bg-gray-800"
                  >
                    Manage dropdowns
                  </button>
                )}
                <button
                  type="button"
                  onClick={openAddItd}
                  className="px-4 py-2 rounded-lg text-sm font-medium text-white"
                  style={{ backgroundColor: PRIMARY }}
                >
                  Add ITD record
                </button>
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-800">
                <thead className="bg-gray-50 dark:bg-gray-950/40">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Document</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Type</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Requested by</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Addressed to</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Company</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Submitted</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Due</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Status</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Signed</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-800 bg-white dark:bg-gray-900">
                  {itdLoading ? (
                    <tr>
                      <td colSpan={10} className="px-4 py-10 text-center text-sm text-gray-500 dark:text-gray-400">
                        Loading…
                      </td>
                    </tr>
                  ) : filteredItdRows.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="px-4 py-10 text-center text-sm text-gray-500 dark:text-gray-400">
                        {String(itdSearch || '').trim() ? 'No matching ITD records.' : 'No ITD records yet.'}
                      </td>
                    </tr>
                  ) : (
                    filteredItdRows.map((row) => (
                      <tr
                        key={row.id}
                        onClick={() => openItdDetails(row)}
                        className="hover:bg-gray-50 dark:hover:bg-gray-800/60 cursor-pointer"
                        title="Click to view details"
                      >
                        <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-200">
                          {row.document_link && isValidHttpUrl(row.document_link) ? (
                            <a
                              href={row.document_link}
                              target="_blank"
                              rel="noreferrer"
                              onClick={(e) => {
                                e.stopPropagation();
                                markItdForReviewOnOpen(row);
                              }}
                              className="text-[#6795BE] hover:underline"
                            >
                              Open link
                            </a>
                          ) : (
                            row.document_link ? (
                              <span
                                className="text-xs text-gray-500 dark:text-gray-400"
                                title={row.document_link}
                              >
                                Invalid link
                              </span>
                            ) : (
                              '—'
                            )
                          )}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-200">{row.document_type || '—'}</td>
                        <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-200">
                          {row.intern_name || row.submitter_name || row.contact_address || '—'}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-200">{row.addressed_to || '—'}</td>
                        <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-200">{row.company || '—'}</td>
                        <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-200">{formatMdy(row.date_submitted)}</td>
                        <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-200">{formatMdy(row.due_date)}</td>
                        <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-200">{row.status || 'Pending'}</td>
                        <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-200">
                          {row.date_signed ? formatMdy(row.date_signed) : '—'}
                        </td>
                        <td className="px-4 py-3 text-right whitespace-nowrap">
                          {canEditItdRow(row) ? (
                            <>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  openEditItd(row);
                                }}
                                className="px-2.5 py-1 rounded-md text-xs font-medium border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800"
                              >
                                Edit
                              </button>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  deleteItd(row);
                                }}
                                className="ml-2 px-2.5 py-1 rounded-md text-xs font-medium border border-red-200 dark:border-red-900/60 text-red-700 dark:text-red-300 hover:bg-red-50 dark:hover:bg-red-950/30"
                              >
                                Delete
                              </button>
                            </>
                          ) : canManageItd ? (
                            String(row.status || '').toLowerCase() === 'signed' ? (
                              <span className="inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold bg-green-100 text-green-800 dark:bg-green-900/35 dark:text-green-200">
                                Approved
                              </span>
                            ) : (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  approveItd(row);
                                }}
                                disabled={itdApprovingId === row.id}
                                className="px-2.5 py-1 rounded-md text-xs font-medium border border-green-200 dark:border-green-900/60 text-green-700 dark:text-green-300 hover:bg-green-50 dark:hover:bg-green-950/30 active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed"
                              >
                                {itdApprovingId === row.id ? 'Approving…' : 'Approve'}
                              </button>
                            )
                          ) : (
                            <span className="text-xs text-gray-400 dark:text-gray-500">—</span>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {itdDetailsMounted &&
            createPortal(
              <div
                className="fixed inset-0 z-[2147483647]"
                aria-hidden={!itdDetailsOpen}
              >
                <div
                  className={`absolute inset-0 bg-black/50 backdrop-blur-sm transition-opacity duration-250 ${
                    itdDetailsOpen ? 'opacity-100' : 'opacity-0'
                  }`}
                  onMouseDown={() => {
                    setItdDetailsOpen(false);
                    setItdDetailsRow(null);
                  }}
                />
                <div className="absolute inset-0 flex justify-end pointer-events-none">
                  <div
                    className={`h-full w-full max-w-[760px] pointer-events-auto bg-gradient-to-b from-white to-slate-50 dark:from-gray-900 dark:to-gray-950 shadow-2xl border-l border-gray-200 dark:border-gray-800 transform transition-transform duration-250 ease-out ${
                      itdDetailsOpen ? 'translate-x-0' : 'translate-x-full'
                    }`}
                    role="dialog"
                    aria-modal="true"
                  >
                    <div className="h-full flex flex-col">
                      <div className="px-5 py-4 border-b border-gray-200/80 dark:border-gray-800 flex items-start justify-between gap-3 bg-white/80 dark:bg-gray-900/80 backdrop-blur-sm">
                        <div className="min-w-0">
                          <h3 className="font-semibold text-gray-900 dark:text-gray-100" style={{ color: PRIMARY }}>
                            ITD record details
                          </h3>
                          <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400 truncate">
                            {itdDetailsRow?.document_type || '—'} • {itdDetailsRow?.intern_name || itdDetailsRow?.submitter_name || itdDetailsRow?.contact_address || '—'}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setItdDetailsOpen(false);
                            setItdDetailsRow(null);
                          }}
                          className="shrink-0 px-3 py-2 rounded-lg text-sm font-medium text-gray-700 dark:text-gray-200 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700"
                        >
                          Close
                        </button>
                      </div>

                      <div className="flex-1 p-4 sm:p-5 overflow-y-auto">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                          {[
                            {
                              label: 'Document',
                              value:
                                itdDetailsRow?.document_link && isValidHttpUrl(itdDetailsRow.document_link) ? (
                                  <div className="space-y-1">
                                    <a
                                      href={itdDetailsRow.document_link}
                                      target="_blank"
                                      rel="noreferrer"
                                      onClick={() => markItdForReviewOnOpen(itdDetailsRow)}
                                      className="inline-flex items-center px-2.5 py-1 rounded-md bg-[#6795BE]/10 text-[#517a9d] dark:text-[#8bb4d8] text-xs font-semibold hover:underline"
                                    >
                                      Open document
                                    </a>
                                    <p className="text-xs text-gray-500 dark:text-gray-400 break-all">
                                      {itdDetailsRow.document_link}
                                    </p>
                                  </div>
                                ) : (
                                  <span className="break-all">{itdDetailsRow?.document_link || '—'}</span>
                                ),
                            },
                            { label: 'Addressed to', value: itdDetailsRow?.addressed_to || '—' },
                            { label: 'Company', value: itdDetailsRow?.company || '—' },
                            { label: 'Contact', value: itdDetailsRow?.contact_address || '—' },
                            { label: 'Team', value: itdDetailsRow?.designated_team || '—' },
                            { label: 'Submitted', value: formatMdy(itdDetailsRow?.date_submitted) },
                            { label: 'Due', value: formatMdy(itdDetailsRow?.due_date) },
                            { label: 'Return to', value: itdDetailsRow?.return_to_whom || '—' },
                            { label: 'Status', value: itdDetailsRow?.status || 'Pending' },
                            { label: 'Handled by', value: itdDetailsRow?.handled_by || '—' },
                            { label: 'Signed', value: itdDetailsRow?.date_signed ? formatMdy(itdDetailsRow.date_signed) : '—' },
                          ].map((item) => (
                            <div
                              key={item.label}
                              className={`rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/55 px-3.5 py-3 shadow-sm ${
                                item.label === 'Document' ? 'sm:col-span-2' : ''
                              }`}
                            >
                              <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-300 uppercase tracking-wide">
                                {item.label}
                              </p>
                              <div className="mt-1 text-sm text-slate-900 dark:text-slate-100 leading-relaxed">
                                {item.label === 'Status' ? (
                                  <span
                                    className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${
                                      String(item.value || '').toLowerCase() === 'signed'
                                        ? 'bg-green-100 text-green-800 dark:bg-green-900/35 dark:text-green-200'
                                        : String(item.value || '').toLowerCase() === 'for review'
                                          ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/35 dark:text-amber-200'
                                          : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200'
                                    }`}
                                  >
                                    {item.value}
                                  </span>
                                ) : (
                                  item.value
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="px-5 py-4 border-t border-gray-200/80 dark:border-gray-800 flex items-center justify-end gap-2 bg-white/85 dark:bg-gray-900/85 backdrop-blur-sm">
                        {itdDetailsRow && canEditItdRow(itdDetailsRow) ? (
                          <button
                            type="button"
                            onClick={() => {
                              setItdDetailsOpen(false);
                              openEditItd(itdDetailsRow);
                            }}
                            className="px-4 py-2 rounded-lg text-sm font-medium border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800"
                          >
                            Edit
                          </button>
                        ) : null}
                        {itdDetailsRow && canManageItd ? (
                          <button
                            type="button"
                            onClick={() => approveItd(itdDetailsRow)}
                            disabled={itdApprovingId === itdDetailsRow.id || String(itdDetailsRow.status || '').toLowerCase() === 'signed'}
                            className="px-4 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-60 disabled:cursor-not-allowed"
                            style={{ backgroundColor: PRIMARY }}
                          >
                            {String(itdDetailsRow?.status || '').toLowerCase() === 'signed'
                              ? 'Approved'
                              : itdApprovingId === itdDetailsRow?.id
                                ? 'Approving…'
                                : 'Approve'}
                          </button>
                        ) : null}
                      </div>
                    </div>
                  </div>
                </div>
              </div>,
              document.body
            )}

          <Modal
            open={itdModalOpen}
            onClose={() => {
              setItdModalOpen(false);
              setEditingItdId(null);
              resetItdForm();
            }}
            zIndexClassName="z-[2147483647]"
          >
            <div className="w-full max-w-4xl bg-white dark:bg-gray-900 rounded-xl shadow-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between">
                <h3 className="font-semibold text-gray-900 dark:text-gray-100" style={{ color: PRIMARY }}>
                  {editingItdId ? 'Edit ITD record' : 'Add ITD record'}
                </h3>
                <button
                  type="button"
                  onClick={() => {
                    setItdModalOpen(false);
                    setEditingItdId(null);
                    resetItdForm();
                  }}
                  className="px-3 py-2 rounded-lg text-sm font-medium text-gray-700 dark:text-gray-200 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700"
                >
                  Close
                </button>
              </div>
              <div className="p-5">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="md:col-span-2">
                    <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">
                      Document link <span className="text-red-600">*</span>
                    </label>
                    <input
                      type="url"
                      value={itdForm.document_link}
                      onChange={(e) => {
                        if (!itdDocumentLinkTouched) setItdDocumentLinkTouched(true);
                        setItdForm((p) => ({ ...p, document_link: e.target.value }));
                      }}
                      onBlur={() => setItdDocumentLinkTouched(true)}
                      className={`w-full rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 px-3 py-2 text-sm ${
                        itdDocumentLinkTouched && itdDocumentLinkInvalid
                          ? 'border border-red-500 dark:border-red-500 focus:outline-none focus:ring-2 focus:ring-red-500/40'
                          : 'border border-gray-300 dark:border-gray-700'
                      }`}
                      placeholder="Paste HTTPS Google Drive/Docs, SharePoint/OneDrive, or Teams link"
                    />
                    {itdDocumentLinkTouched && itdDocumentLinkInvalid ? (
                      <p className="mt-1 text-[11px] text-red-600 dark:text-red-400">
                        Enter a valid HTTPS link from Google Drive/Docs, SharePoint/OneDrive, or Microsoft Teams.
                      </p>
                    ) : (
                      <p className="mt-1 text-[11px] text-gray-500 dark:text-gray-400">
                        Accepted links: HTTPS Google Drive/Docs, SharePoint/OneDrive, or Microsoft Teams shared links.
                      </p>
                    )}
                  </div>

                  {!isInternRole && canManageItd ? (
                    <div className="md:col-span-2">
                      <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">
                        Select intern <span className="text-red-600">*</span>
                      </label>
                      <select
                        value={itdSelectedInternId}
                        onChange={(e) => handleSelectItdIntern(e.target.value)}
                        className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 px-3 py-2 text-sm"
                      >
                        <option value="">Select intern...</option>
                        {itdInternOptions.map((u) => (
                          <option key={u.id} value={u.id}>
                            {(u.full_name || '').trim() || u.email || 'Unnamed intern'}
                          </option>
                        ))}
                      </select>
                      <p className="mt-1 text-[11px] text-gray-500 dark:text-gray-400">
                        Contact address and designated team are auto-filled from selected intern.
                      </p>
                    </div>
                  ) : (
                    <div className="md:col-span-2">
                      <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">Intern name</label>
                      <div className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50 text-gray-800 dark:text-gray-100 px-3 py-2 text-sm">
                        {itdForm.intern_name || currentActorName}
                      </div>
                    </div>
                  )}

                  <div>
                    <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">
                      Document type <span className="text-red-600">*</span>
                    </label>
                    <select
                      value={itdForm.document_type}
                      onChange={(e) => setItdForm((p) => ({ ...p, document_type: e.target.value }))}
                      className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 px-3 py-2 text-sm"
                    >
                      {(itdOptions.document_type || []).map((opt) => (
                        <option key={opt} value={opt}>
                          {opt}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">
                      Addressed to <span className="text-red-600">*</span>
                    </label>
                    <select
                      value={itdForm.addressed_to}
                      onChange={(e) => setItdForm((p) => ({ ...p, addressed_to: e.target.value }))}
                      className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 px-3 py-2 text-sm"
                    >
                      {(itdOptions.addressed_to || []).map((opt) => (
                        <option key={opt} value={opt}>
                          {opt}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">
                      Company <span className="text-red-600">*</span>
                    </label>
                    <select
                      value={itdForm.company}
                      onChange={(e) => setItdForm((p) => ({ ...p, company: e.target.value }))}
                      className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 px-3 py-2 text-sm"
                    >
                      {(itdOptions.company || []).map((opt) => (
                        <option key={opt} value={opt}>
                          {opt}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">
                      Contact address (MS Teams email) <span className="text-red-600">*</span>
                    </label>
                    {isInternRole || (!isInternRole && canManageItd && Boolean(itdSelectedInternId)) ? (
                      <div className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50 text-gray-800 dark:text-gray-100 px-3 py-2 text-sm">
                        {itdForm.contact_address || '—'}
                      </div>
                    ) : (
                      <input
                        type="email"
                        value={itdForm.contact_address}
                        onChange={(e) => setItdForm((p) => ({ ...p, contact_address: e.target.value }))}
                        className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 px-3 py-2 text-sm"
                        placeholder="e.g. user@company.com"
                      />
                    )}
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">
                      Designated team <span className="text-red-600">*</span>
                    </label>
                    {isInternRole || (!isInternRole && canManageItd && Boolean(itdSelectedInternId)) ? (
                      <div className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50 text-gray-800 dark:text-gray-100 px-3 py-2 text-sm">
                        {itdForm.designated_team || '—'}
                      </div>
                    ) : (
                      itdOptions.designated_team?.length ? (
                        <select
                          value={itdForm.designated_team}
                          onChange={(e) => setItdForm((p) => ({ ...p, designated_team: e.target.value }))}
                          className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 px-3 py-2 text-sm"
                        >
                          <option value="">Select…</option>
                          {itdOptions.designated_team.map((opt) => (
                            <option key={opt} value={opt}>
                              {opt}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <input
                          type="text"
                          value={itdForm.designated_team}
                          onChange={(e) => setItdForm((p) => ({ ...p, designated_team: e.target.value }))}
                          className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 px-3 py-2 text-sm"
                          placeholder="e.g. Team Lead Assistant"
                        />
                      )
                    )}
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">
                      Due date <span className="text-red-600">*</span>
                    </label>
                    <input
                      type="date"
                      min={new Date().toISOString().slice(0, 10)}
                      value={itdForm.due_date}
                      onChange={(e) => setItdForm((p) => ({ ...p, due_date: e.target.value }))}
                      className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 px-3 py-2 text-sm"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">Return to whom (if applicable)</label>
                    <input
                      type="text"
                      value={itdForm.return_to_whom}
                      onChange={(e) => setItdForm((p) => ({ ...p, return_to_whom: e.target.value }))}
                      className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 px-3 py-2 text-sm"
                      placeholder="e.g. HR Representative / Supervisor"
                    />
                  </div>

                </div>

                <div className="mt-5 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setItdModalOpen(false);
                      setEditingItdId(null);
                      resetItdForm();
                    }}
                    className="px-4 py-2 rounded-lg text-sm font-medium border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={saveItd}
                    className="px-4 py-2 rounded-lg text-sm font-medium text-white"
                    style={{ backgroundColor: PRIMARY }}
                  >
                    {editingItdId ? 'Save changes' : 'Add ITD record'}
                  </button>
                </div>
              </div>
            </div>
          </Modal>

          <Modal
            open={itdManageOptionsOpen}
            onClose={() => setItdManageOptionsOpen(false)}
            zIndexClassName="z-[2147483647]"
          >
            <div className="w-full max-w-2xl bg-white dark:bg-gray-900 rounded-xl shadow-xl border border-gray-200 dark:border-gray-800 overflow-hidden max-h-[85vh] flex flex-col">
              <div className="px-5 py-4 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between">
                <h3 className="font-semibold text-gray-900 dark:text-gray-100" style={{ color: PRIMARY }}>
                  Manage ITD dropdown options
                </h3>
                <button
                  type="button"
                  onClick={() => setItdManageOptionsOpen(false)}
                  className="px-3 py-2 rounded-lg text-sm font-medium text-gray-700 dark:text-gray-200 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700"
                >
                  Close
                </button>
              </div>
              <div className="p-5 space-y-4 text-sm text-gray-700 dark:text-gray-200 overflow-y-auto flex-1">
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Admin/TL/VTL can add/update values for Document Type, Addressed To, and Company.
                </p>
                <div className="grid grid-cols-1 gap-3">
                  {[
                    { key: 'document_type', label: 'Document Type' },
                    { key: 'addressed_to', label: 'Addressed To' },
                    { key: 'company', label: 'Company' },
                  ].map((field) => (
                    <div key={field.key} className="rounded-lg border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-950/40 p-3">
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <p className="text-xs font-semibold text-gray-700 dark:text-gray-200">{field.label}</p>
                        <button
                          type="button"
                          onClick={() => addItdEditorValue(field.key)}
                          className="px-2.5 py-1 rounded-md text-xs font-medium border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800"
                        >
                          + Add value
                        </button>
                      </div>
                      <div className="space-y-2">
                        {(itdOptionEditor[field.key] || []).map((value, idx) => (
                          <div key={`${field.key}-${idx}`} className="flex items-center gap-2">
                            <input
                              type="text"
                              value={value}
                              onChange={(e) => updateItdEditorValue(field.key, idx, e.target.value)}
                              className="flex-1 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 px-3 py-1.5 text-sm"
                              placeholder={`Enter ${field.label.toLowerCase()} value`}
                            />
                            <button
                              type="button"
                              onClick={() => removeItdEditorValue(field.key, idx)}
                              className="px-2.5 py-1.5 rounded-md text-xs font-medium border border-red-200 dark:border-red-900/60 text-red-700 dark:text-red-300 hover:bg-red-50 dark:hover:bg-red-950/30"
                            >
                              Remove
                            </button>
                          </div>
                        ))}
                        {(itdOptionEditor[field.key] || []).length === 0 && (
                          <p className="text-xs text-gray-500 dark:text-gray-400">No values yet.</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="px-5 py-4 border-t border-gray-200 dark:border-gray-800 flex items-center justify-end gap-2 bg-white dark:bg-gray-900">
                <button
                  type="button"
                  onClick={() => setItdManageOptionsOpen(false)}
                  className="px-4 py-2 rounded-lg text-sm font-medium border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800"
                  disabled={itdOptionsSaving}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={saveItdDropdownOptions}
                  className="px-4 py-2 rounded-lg text-sm font-medium text-white"
                  style={{ backgroundColor: PRIMARY }}
                  disabled={itdOptionsSaving}
                >
                  {itdOptionsSaving ? 'Saving…' : 'Save dropdown options'}
                </button>
              </div>
            </div>
          </Modal>

        </div>
      ) : (
        <>
      <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          {tlVtlTrackerRows.length === 0 ? (
            <div className="py-12 text-center text-sm text-gray-500 dark:text-gray-400">
              {isTlVtlTrackerEditMode ? 'No rows yet. Click "Add row" to add one.' : 'No rows yet. Click Edit then Add row to add one.'}
            </div>
          ) : (
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-800">
              <thead className="bg-gray-50 dark:bg-gray-950/40">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Department</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Team</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Name</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Role</th>
                  {isTlVtlTrackerEditMode && (
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider w-20">Actions</th>
                  )}
                </tr>
              </thead>
              <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-800">
                {tlVtlTrackerRows.map((row) => (
                  <tr key={row.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/60">
                    {isTlVtlTrackerEditMode ? (
                      <>
                        <td className="px-4 py-2">
                          <select
                            value={row.department || 'IT'}
                            onChange={(e) => setTlVtlTrackerRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, department: e.target.value } : r)))}
                            className="w-full rounded border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 px-2 py-1.5 text-sm focus:ring-2 focus:ring-[#6795BE] focus:border-[#6795BE]"
                          >
                            {TL_VTL_DEPARTMENTS.map((d) => (
                              <option key={d} value={d}>{d}</option>
                            ))}
                          </select>
                        </td>
                        <td className="px-4 py-2">
                          <select
                            value={row.team || 'Team Lead Assistant'}
                            onChange={(e) => setTlVtlTrackerRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, team: e.target.value } : r)))}
                            className="w-full min-w-[160px] rounded border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 px-2 py-1.5 text-sm focus:ring-2 focus:ring-[#6795BE] focus:border-[#6795BE]"
                          >
                            {TL_VTL_TEAMS.map((t) => (
                              <option key={t} value={t}>{t}</option>
                            ))}
                          </select>
                        </td>
                        <td className="px-4 py-2">
                          <select
                            value={row.name || ''}
                            onChange={(e) =>
                              setTlVtlTrackerRows((prev) =>
                                prev.map((r) => (r.id === row.id ? { ...r, name: e.target.value } : r))
                              )
                            }
                            className="w-full min-w-[160px] rounded border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 px-2 py-1.5 text-sm focus:ring-2 focus:ring-[#6795BE] focus:border-[#6795BE]"
                          >
                            <option value="">Select intern / TL / VTL</option>
                            {tlVtlAssignableUsers.map((u) => (
                              <option key={u.id} value={u.full_name || ''}>
                                {(u.full_name || '').trim() || u.email || 'Unnamed'}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="px-4 py-2">
                          <select
                            value={row.role || 'Team Leader'}
                            onChange={(e) => setTlVtlTrackerRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, role: e.target.value } : r)))}
                            className="w-full min-w-[140px] rounded border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 px-2 py-1.5 text-sm focus:ring-2 focus:ring-[#6795BE] focus:border-[#6795BE]"
                          >
                            {TL_VTL_ROLES.map((r) => (
                              <option key={r} value={r}>{r}</option>
                            ))}
                          </select>
                        </td>
                        <td className="px-4 py-2">
                          <button
                            type="button"
                            onClick={() => openDeleteConfirmTlVtlTrackerRow(row.id)}
                            disabled={savingTlVtlTracker}
                            className="p-1.5 rounded text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 disabled:opacity-50"
                            title="Delete row"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="px-4 py-3 text-sm text-gray-900 dark:text-gray-100">{row.department || 'IT'}</td>
                        <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-300">{row.team || 'Team Lead Assistant'}</td>
                        <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-300">{row.name || ''}</td>
                        <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-300">{row.role || 'Team Leader'}</td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
        </>
      )}
      {deleteConfirmOpen && (
        <Modal open={deleteConfirmOpen} onClose={() => setDeleteConfirmOpen(false)} zIndexClassName="z-[2147483647]">
          <div className="w-full max-w-md bg-white dark:bg-gray-900 rounded-xl shadow-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between gap-3">
              <h3 className="font-semibold text-gray-900 dark:text-gray-100" style={{ color: PRIMARY }}>
                Delete row?
              </h3>
              <button
                type="button"
                onClick={() => {
                  setDeleteConfirmOpen(false);
                  setDeleteConfirmTargetId(null);
                }}
                className="px-3 py-2 rounded-lg text-sm font-medium text-gray-700 dark:text-gray-200 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700"
              >
                Close
              </button>
            </div>
            <div className="p-5">
              <p className="text-sm text-gray-700 dark:text-gray-200">
                This row will be removed from the list immediately, but it will only be permanently deleted when you click <span className="font-semibold">Save</span>.
                If you click <span className="font-semibold">Cancel</span>, the row will be restored.
              </p>
              <div className="mt-5 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setDeleteConfirmOpen(false);
                    setDeleteConfirmTargetId(null);
                  }}
                  className="px-4 py-2 rounded-lg text-sm font-medium border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={confirmDeleteTlVtlTrackerRow}
                  className="px-4 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-60"
                  style={{ backgroundColor: PRIMARY }}
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
