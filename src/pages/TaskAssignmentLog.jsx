import { useEffect, useState, useMemo, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { createPortal } from 'react-dom';
import { useSupabase } from '../context/supabase.jsx';
import { toast } from 'react-hot-toast';
import { logAction } from '../utils/auditTrail.js';
import { permissions } from '../utils/rolePermissions.js';
import { queryCache } from '../utils/queryCache.js';

const PRIMARY = '#6795BE';
const TASK_STATUSES = {
  'to-do': 'To Do',
  'in-progress': 'In Progress',
  'review': 'Review',
  'done': 'Done',
};

const TASK_NAMES = [
  'WordPress Plugin Updates',
  'GSC Crawling',
  'Doc Reorganization (internal documentation)',
  'Assisting other teams',
  'Daily report (indiv & team)',
  'Udemy review',
  'Course Price edit (not sure if existing task pa rin ito for interns)',
];

const SCANNING_OPTIONS = ['ok', 'move on', 'ongoing'];
const SCANNING_LABELS = { ok: 'Ok', 'move on': 'Move on', ongoing: 'On-going' };
const DOMAIN_ROW_STATUS_OPTIONS = ['done', 'need verification', 'blocked access'];
const UPDATE_STATUS_OPTIONS = ['Updated', 'Skipped', 'Failed'];
const POST_UPDATE_CHECK_OPTIONS = ['Ok', 'Issue Found'];

function Modal({ open, onClose, children, zIndexClassName = 'z-[9999]' }) {
  if (!open) return null;
  return createPortal(
    <div
      className={`fixed inset-0 ${zIndexClassName} bg-black/60 backdrop-blur-sm`}
      role="dialog"
      aria-modal="true"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose?.();
      }}
    >
      <div className="min-h-[100dvh] w-full p-4 flex items-center justify-center">
        {children}
      </div>
    </div>,
    document.body
  );
}

const canAccessScheduleFormTab = (userRole, userTeam) =>
  userRole === 'admin' || userRole === 'tla' || userRole === 'monitoring_team' ||
  ((userRole === 'tl' || userRole === 'vtl') && userTeam === 'tla');

export default function TaskAssignmentLog() {
  const { supabase, user, userRole, userTeam } = useSupabase();
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get('tab'); // 'domains' opens Domains tab
  const scheduleSubTabParam = searchParams.get('schedule'); // 'form' | 'responses'
  const [tasks, setTasks] = useState([]);
  const [domains, setDomains] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [claimingTaskId, setClaimingTaskId] = useState(null);
  const [activeMainTab, setActiveMainTab] = useState(
    tabParam === 'domains' ? 'domains' : tabParam === 'domain-claims' ? 'domain-claims' : tabParam === 'schedule-form' ? 'schedule-form' : 'tasks'
  ); // 'tasks' | 'domains' | 'domain-claims' | 'schedule-form'
  const [scheduleSubTab, setScheduleSubTab] = useState(scheduleSubTabParam === 'responses' ? 'responses' : 'form');
  const [taskFilter, setTaskFilter] = useState('all'); // 'all' | 'my-tasks'
  const [domainTypeFilter, setDomainTypeFilter] = useState('old'); // 'old' | 'new'
  const [showCreateTaskModal, setShowCreateTaskModal] = useState(false);
  const [showCreateDomainModal, setShowCreateDomainModal] = useState(false);
  const [selectedTask, setSelectedTask] = useState(null);
  const [wpPluginRows, setWpPluginRows] = useState([]);
  const [domainPasswordHistory, setDomainPasswordHistory] = useState({});
  const [passwordHistoryModalDomain, setPasswordHistoryModalDomain] = useState(null);
  const [selectedDomainForAccounts, setSelectedDomainForAccounts] = useState(null);
  const [selectedNewDomainDetails, setSelectedNewDomainDetails] = useState(null);
  const [defaultAccounts, setDefaultAccounts] = useState({ intern: { username: '', password: '' }, sg: { username: '', password: '' } });

  // Open Domains, Domain Claims, or Schedule Form tab when URL has ?tab=...
  useEffect(() => {
    if (tabParam === 'domains') setActiveMainTab('domains');
    if (tabParam === 'domain-claims') setActiveMainTab('domain-claims');
    if (tabParam === 'schedule-form') setActiveMainTab('schedule-form');
  }, [tabParam]);

  // Sync Schedule sub-tab with URL
  useEffect(() => {
    if (scheduleSubTabParam === 'responses') setScheduleSubTab('responses');
    else if (scheduleSubTabParam === 'form') setScheduleSubTab('form');
  }, [scheduleSubTabParam]);
  const [showDefaultPassword, setShowDefaultPassword] = useState({ intern: false, sg: false });
  const [editDefaultAccount, setEditDefaultAccount] = useState(null); // 'intern' | 'sg' | null
  const [defaultAccountEditForm, setDefaultAccountEditForm] = useState({ username: '', password: '' });
  const [savingDefaultAccount, setSavingDefaultAccount] = useState(false);
  const [showEditModalPassword, setShowEditModalPassword] = useState(false);
  const [domainUpdates, setDomainUpdates] = useState([]);
  const [isEditingDomainsTable, setIsEditingDomainsTable] = useState(false);
  const [savingDomains, setSavingDomains] = useState(false);
  const [createTaskForm, setCreateTaskForm] = useState({
    name: '',
    domain_migration: '',
    assigned_to: '',
    status: 'to-do',
  });
  const [createDomainForm, setCreateDomainForm] = useState({
    type: 'old',
    country: '',
    url: '',
    status: '',
    scanning_done_date: '',
    scanning_date: '',
    scanning_plugin: '',
    scanning_2fa: '',
    wp_username: '',
    new_password: '',
    sg_username: '',
    sg_password: '',
    recaptcha: false,
    backup: false,
  });

  // Pre-onboarding schedule form (admin, TLA TL/VTL, Monitoring only)
  const [scheduleConfig, setScheduleConfig] = useState(null);
  const [scheduleResponses, setScheduleResponses] = useState([]);
  const [scheduleConfigForm, setScheduleConfigForm] = useState(null);
  const [savingScheduleConfig, setSavingScheduleConfig] = useState(false);

  useEffect(() => {
    fetchTasks();
    fetchDomains();
    if (permissions.canCreateTasks(userRole)) fetchUsers();
  }, [supabase, userRole]);

  useEffect(() => {
    if (activeMainTab === 'domains' && domainTypeFilter === 'old') fetchDefaultAccounts();
  }, [activeMainTab, domainTypeFilter, supabase]);

  useEffect(() => {
    if (activeMainTab === 'domains' || activeMainTab === 'domain-claims') {
      fetchDomainUpdates();
    }
  }, [activeMainTab, supabase]);

  useEffect(() => {
    if (activeMainTab === 'schedule-form') {
      fetchScheduleFormData();
    }
  }, [activeMainTab, supabase]);

  const isTaskFormValid = () => {
    const name = (createTaskForm.name || '').trim();
    const status = (createTaskForm.status || '').trim();
    const assigned = (createTaskForm.assigned_to || '').trim();
    if (!name || !status || !assigned) return false;
    if (name === 'WordPress Plugin Updates' && !createTaskForm.domain_migration) return false;
    return true;
  };

  const isDomainFormValid = () => {
    const f = createDomainForm;
    return Boolean(
      (f.type || '').trim() &&
      (f.country || '').trim() &&
      (f.url || '').trim() &&
      (f.status || '').trim() &&
      (f.scanning_done_date || '').trim() &&
      (f.scanning_date || '').trim() &&
      (f.scanning_plugin || '').trim() &&
      (f.scanning_2fa || '').trim()
    );
  };

  const fetchTasks = async (bypassCache = false) => {
    if (!bypassCache) {
      const cached = queryCache.get('tasks');
      if (cached != null) {
        setTasks(cached);
        setLoading(false);
        return;
      }
    }
    try {
      const { data, error } = await supabase
        .from('tasks')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      const list = data || [];
      queryCache.set('tasks', list);
      setTasks(list);
    } catch (error) {
      console.error('Error fetching tasks:', error);
      setTasks([]);
      const code = error?.code || error?.status;
      if (code === 403 || code === 'PGRST301') {
        toast.error('Permission denied. Try logging out and back in, or ask an admin to run task_domains_migration.sql.');
      }
    } finally {
      setLoading(false);
    }
  };

  const fetchDomains = async (bypassCache = false) => {
    const key = 'domains';
    if (!bypassCache) {
      const cached = queryCache.get(key);
      if (cached != null) {
        setDomains(cached);
        return;
      }
    }
    try {
      const { data, error } = await supabase.from('domains').select('*').order('country', { ascending: true });
      if (error) {
        console.warn('Domains table may not exist:', error);
        setDomains([]);
        return;
      }
      const list = data || [];
      queryCache.set(key, list);
      setDomains(list);
    } catch (error) {
      console.error('Error fetching domains:', error);
      setDomains([]);
    }
  };

  const fetchUsers = async () => {
    try {
      const { data, error } = await supabase.from('users').select('id, email, full_name, role').order('email');
      if (error) {
        console.warn('Could not fetch users:', error);
        setUsers([]);
        const code = error?.code || error?.status;
        if (code === 403 || code === 'PGRST301') {
          toast.error('Permission denied for users table. Run users_table_rls.sql and fix_users_grants.sql in Supabase.');
        }
        return;
      }
      setUsers(data || []);
    } catch (error) {
      setUsers([]);
    }
  };

  const fetchWpPluginRows = async (taskId) => {
    try {
      const { data, error } = await supabase
        .from('task_plugin_update_rows')
        .select('*')
        .eq('task_id', taskId)
        .order('created_at');
      if (error) throw error;
      setWpPluginRows(data || []);
    } catch (error) {
      console.warn('task_plugin_update_rows may not exist:', error);
      setWpPluginRows([]);
    }
  };

  const fetchDomainPasswordHistory = async (domainId) => {
    try {
      const { data, error } = await supabase
        .from('domain_password_history')
        .select('password, recorded_at')
        .eq('domain_id', domainId)
        .order('recorded_at', { ascending: false })
        .limit(20);
      if (error) throw error;
      setDomainPasswordHistory((prev) => ({ ...prev, [domainId]: data || [] }));
    } catch (error) {
      setDomainPasswordHistory((prev) => ({ ...prev, [domainId]: [] }));
    }
  };

  const fetchDomainUpdates = async () => {
    try {
      const { data, error } = await supabase
        .from('task_plugin_update_rows')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      setDomainUpdates(Array.isArray(data) ? data : []);
    } catch (err) {
      console.warn('task_plugin_update_rows fetch error:', err);
      setDomainUpdates([]);
    }
  };

  const fetchScheduleFormData = async () => {
    try {
      const [configRes, responsesRes] = await Promise.all([
        supabase.from('schedule_form_config').select('*').eq('id', 'default').maybeSingle(),
        supabase.from('intern_schedule_responses').select('*').order('submitted_at', { ascending: false }),
      ]);
      if (configRes.data) {
        const data = configRes.data;
        setScheduleConfig(data);
        setScheduleConfigForm({
          ...data,
          contact_knowles_email: data.contact_knowles_email ?? '',
          contact_umonics_email: data.contact_umonics_email ?? '',
          contact_pinnacle_email: data.contact_pinnacle_email ?? '',
        });
      }
      setScheduleResponses(Array.isArray(responsesRes.data) ? responsesRes.data : []);
    } catch (err) {
      console.warn('Schedule form data fetch error:', err);
      toast.error('Could not load schedule form data. Run supabase_schedule_form_migration.sql in Supabase.');
    }
  };

  const scheduleFormLink = `${import.meta.env.VITE_SCHEDULE_FORM_PUBLIC_URL || 'https://kti-portal.vercel.app'}/schedule-form`;

  const handleCopyScheduleFormLink = () => {
    if (!scheduleFormLink) return;
    navigator.clipboard.writeText(scheduleFormLink).then(() => toast.success('Form link copied to clipboard')).catch(() => toast.error('Could not copy'));
  };

  const handleSaveScheduleConfig = async (e) => {
    e.preventDefault();
    if (!scheduleConfigForm) return;
    setSavingScheduleConfig(true);
    try {
      const { error } = await supabase.from('schedule_form_config').update({
        office_hours: scheduleConfigForm.office_hours || '',
        min_requirement: scheduleConfigForm.min_requirement || '',
        schedule_options_text: scheduleConfigForm.schedule_options_text || '',
        regular_shifts_text: scheduleConfigForm.regular_shifts_text || '',
        other_rules_text: scheduleConfigForm.other_rules_text || '',
        contact_knowles_email: scheduleConfigForm.contact_knowles_email?.trim() || null,
        contact_umonics_email: scheduleConfigForm.contact_umonics_email?.trim() || null,
        contact_pinnacle_email: scheduleConfigForm.contact_pinnacle_email?.trim() || null,
        updated_at: new Date().toISOString(),
      }).eq('id', 'default');
      if (error) throw error;
      setScheduleConfig(scheduleConfigForm);
      toast.success('Schedule form content updated');
    } catch (err) {
      toast.error(err?.message || 'Failed to save');
    } finally {
      setSavingScheduleConfig(false);
    }
  };

  // Auto-save monitoring contact emails to schedule form (debounced)
  const scheduleConfigFormContactsRef = useRef({ knowles: '', umonics: '', pinnacle: '' });
  useEffect(() => {
    if (!scheduleConfigForm) return;
    const k = (scheduleConfigForm.contact_knowles_email ?? '').trim();
    const u = (scheduleConfigForm.contact_umonics_email ?? '').trim();
    const p = (scheduleConfigForm.contact_pinnacle_email ?? '').trim();
    const prev = scheduleConfigFormContactsRef.current;
    if (prev.knowles === k && prev.umonics === u && prev.pinnacle === p) return;
    if (scheduleConfig && (scheduleConfig.contact_knowles_email ?? '') === k && (scheduleConfig.contact_umonics_email ?? '') === u && (scheduleConfig.contact_pinnacle_email ?? '') === p) {
      scheduleConfigFormContactsRef.current = { knowles: k, umonics: u, pinnacle: p };
      return;
    }
    scheduleConfigFormContactsRef.current = { knowles: k, umonics: u, pinnacle: p };
    const t = setTimeout(async () => {
      try {
        const { error } = await supabase.from('schedule_form_config').update({
          contact_knowles_email: k || null,
          contact_umonics_email: u || null,
          contact_pinnacle_email: p || null,
          updated_at: new Date().toISOString(),
        }).eq('id', 'default');
        if (error) throw error;
        setScheduleConfig((c) => (c ? { ...c, contact_knowles_email: k || null, contact_umonics_email: u || null, contact_pinnacle_email: p || null } : c));
        toast.success('Monitoring contacts updated on form');
      } catch (err) {
        toast.error(err?.message || 'Failed to update contacts');
      }
    }, 600);
    return () => clearTimeout(t);
  }, [
    scheduleConfigForm?.contact_knowles_email,
    scheduleConfigForm?.contact_umonics_email,
    scheduleConfigForm?.contact_pinnacle_email,
  ]);

  const fetchDefaultAccounts = async () => {
    try {
      const { data, error } = await supabase
        .from('old_domain_default_accounts')
        .select('account_type, username, password');
      if (error) throw error;
      const list = data || [];
      const next = { intern: { username: '', password: '' }, sg: { username: '', password: '' } };
      list.forEach((row) => {
        if (row.account_type === 'intern' || row.account_type === 'sg') {
          next[row.account_type] = { username: row.username || '', password: row.password || '' };
        }
      });
      setDefaultAccounts(next);
    } catch (err) {
      console.warn('fetchDefaultAccounts:', err);
      setDefaultAccounts({ intern: { username: '', password: '' }, sg: { username: '', password: '' } });
    }
  };

  const copyToClipboard = (value, label) => {
    if (!value) return;
    navigator.clipboard.writeText(value).then(
      () => toast.success(`${label} copied to clipboard`),
      () => toast.error('Failed to copy')
    );
  };

  const copyPasswordToClipboard = (password, label) => copyToClipboard(password, label);
  const copyUsernameToClipboard = (username, label) => copyToClipboard(username, label);

  const handleSaveDefaultAccount = async (e) => {
    e.preventDefault();
    if (!editDefaultAccount) return;
    setSavingDefaultAccount(true);
    try {
      const { data: existing } = await supabase
        .from('old_domain_default_accounts')
        .select('id')
        .eq('account_type', editDefaultAccount)
        .maybeSingle();
      const payload = {
        account_type: editDefaultAccount,
        username: (defaultAccountEditForm.username || '').trim() || null,
        password: (defaultAccountEditForm.password || '').trim() || null,
      };
      if (existing?.id) {
        const { error } = await supabase.from('old_domain_default_accounts').update(payload).eq('id', existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('old_domain_default_accounts').insert(payload);
        if (error) throw error;
      }
      setDefaultAccounts((prev) => ({
        ...prev,
        [editDefaultAccount]: { username: payload.username || '', password: payload.password || '' },
      }));
      setEditDefaultAccount(null);
      setDefaultAccountEditForm({ username: '', password: '' });
      toast.success('Default account updated');
    } catch (err) {
      toast.error(err?.message || 'Failed to save');
    } finally {
      setSavingDefaultAccount(false);
    }
  };

  const handleCreateTask = async (e) => {
    e.preventDefault();
    const { name, domain_migration, assigned_to, status } = createTaskForm;
    if (!name) {
      toast.error('Select a task name');
      return;
    }
    const isWpPlugin = name === 'WordPress Plugin Updates';
    if (isWpPlugin && !domain_migration) {
      toast.error('Select Domain Migration (New or Old domain) for WordPress Plugin Updates');
      return;
    }
    setClaimingTaskId('create');
    try {
      const payload = {
        name,
        type: 'task',
        status: status || 'to-do',
        assigned_to: assigned_to || null,
        assigned_to_name: users.find((u) => u.id === assigned_to)?.full_name || users.find((u) => u.id === assigned_to)?.email || null,
      };
      if (isWpPlugin) payload.domain_migration = domain_migration;
      const { data, error } = await supabase.from('tasks').insert(payload).select('id').single();
      if (error) throw error;
      await logAction(supabase, 'task_created', { task_id: data?.id, task_name: name }, user?.id);
      queryCache.invalidate('tasks');
      fetchTasks(true);
      setShowCreateTaskModal(false);
      setCreateTaskForm({ name: '', domain_migration: '', assigned_to: '', status: 'to-do' });
      toast.success('Task created');
    } catch (error) {
      console.error('Error creating task:', error);
      const code = error?.code || error?.status;
      const msg = code === 403 || code === 'PGRST301'
        ? 'Permission denied. Run task_domains_migration.sql and ensure your role (admin/tl/vtl) can insert tasks.'
        : (error?.message || 'Failed to create task');
      toast.error(msg);
    } finally {
      setClaimingTaskId(null);
    }
  };

  const handleCreateDomain = async (e) => {
    e.preventDefault();
    const { type, country, url, status, scanning_done_date, scanning_date, scanning_plugin, scanning_2fa, recaptcha, backup } = createDomainForm;
    if (!country?.trim() || !url?.trim()) {
      toast.error('Country and URL are required');
      return;
    }
    console.log('[Domain Create] User role:', userRole, 'User ID:', user?.id);
    try {
      const payload = {
        type: type || 'old',
        country: country.trim(),
        url: url.trim(),
        status: status || null,
        scanning_date: scanning_date || null,
        scanning_plugin: scanning_plugin || null,
        scanning_2fa: scanning_2fa || null,
        recaptcha: !!recaptcha,
        backup: !!backup,
      };
      if (scanning_done_date) payload.scanning_done_date = scanning_done_date;
      const { error } = await supabase.from('domains').insert(payload);
      if (error) throw error;
      queryCache.invalidate('domains');
      fetchDomains(true);
      setShowCreateDomainModal(false);
      setCreateDomainForm({
        type: 'old',
        country: '',
        url: '',
        status: '',
        scanning_done_date: '',
        scanning_date: '',
        scanning_plugin: '',
        scanning_2fa: '',
        wp_username: '',
        new_password: '',
        sg_username: '',
        sg_password: '',
        recaptcha: false,
        backup: false,
      });
      toast.success('Domain added');
    } catch (error) {
      console.error('Error creating domain:', error);
      const code = error?.code || error?.status;
      if (code === 403 || code === 'PGRST301') {
        const roleMsg = userRole ? `Your current role: ${userRole}` : 'No role detected';
        toast.error(
          `Permission denied (403). ${roleMsg}. Please: 1) Run reset_policies_grants.sql in Supabase SQL Editor, 2) Ensure your user has a row in public.users with id matching auth.uid() and role in (admin, tla, tl, vtl), 3) Log out and log back in.`,
          { duration: 6000 }
        );
      } else {
        toast.error(error?.message || 'Failed to add domain');
      }
    }
  };

  const handleUpdateDomainPassword = async (domainId, newPassword) => {
    try {
      const domain = domains.find((d) => d.id === domainId);
      if (domain?.new_password) {
        await supabase.from('domain_password_history').insert({
          domain_id: domainId,
          password: domain.new_password,
        });
      }
      const { error } = await supabase.from('domains').update({ new_password: newPassword }).eq('id', domainId);
      if (error) throw error;
      queryCache.invalidate('domains');
      fetchDomains(true);
      setDomainPasswordHistory((prev) => ({ ...prev, [domainId]: undefined }));
      toast.success('Password updated; old password saved to history');
    } catch (error) {
      toast.error(error.message || 'Failed to update password');
    }
  };

  const updateDomainInState = (id, updates) => {
    setDomains((prev) => prev.map((d) => (d.id === id ? { ...d, ...updates } : d)));
  };

  const handleSaveDomains = async () => {
    const list = domains.filter((d) => d.type === domainTypeFilter);
    if (list.length === 0) {
      setIsEditingDomainsTable(false);
      return;
    }
    setSavingDomains(true);
    try {
      for (const d of list) {
        const payload = {
          country: d.country ?? '',
          url: d.url ?? '',
          status: d.status || null,
          scanning_date: d.scanning_date || null,
          scanning_plugin: d.scanning_plugin || null,
          scanning_2fa: d.scanning_2fa || null,
          scanning_done_date: d.scanning_done_date || null,
          recaptcha: !!d.recaptcha,
          backup: !!d.backup,
        };
        if (d.type === 'new') {
          payload.wp_username = d.wp_username ?? '';
          if (d.new_password !== undefined) payload.new_password = d.new_password;
        }
        const { error } = await supabase.from('domains').update(payload).eq('id', d.id);
        if (error) throw error;
      }
      queryCache.invalidate('domains');
      await fetchDomains(true);
      setIsEditingDomainsTable(false);
      toast.success('Domains saved');
    } catch (error) {
      toast.error(error?.message || 'Failed to save domains');
    } finally {
      setSavingDomains(false);
    }
  };

  const handleCancelDomainsEdit = () => {
    setIsEditingDomainsTable(false);
    fetchDomains(true);
  };

  const handleStatusChange = async (task, newStatus) => {
    try {
      const { error } = await supabase
        .from('tasks')
        .update({
          status: newStatus,
          updated_by: user?.id,
          updated_by_name: user?.email,
        })
        .eq('id', task.id);
      if (error) throw error;
      await logAction(supabase, 'task_status_changed', { task_id: task.id, new_status: newStatus }, user?.id);
      queryCache.invalidate('tasks');
      fetchTasks(true);
      if (selectedTask?.id === task.id) setSelectedTask((t) => (t ? { ...t, status: newStatus } : null));
      toast.success('Status updated');
    } catch (error) {
      const code = error?.code || error?.status;
      const msg = code === 403 || code === 'PGRST301'
        ? 'Permission denied. Run task_domains_migration.sql so your role can update tasks.'
        : (error?.message || 'Failed to update status');
      toast.error(msg);
    }
  };

  const handleDeleteTask = async (task) => {
    if (!window.confirm(`Delete task "${task.name}"?`)) return;
    try {
      const { error } = await supabase.from('tasks').delete().eq('id', task.id);
      if (error) throw error;
      queryCache.invalidate('tasks');
      fetchTasks(true);
      setSelectedTask(null);
      toast.success('Task deleted');
    } catch (error) {
      toast.error(error.message || 'Failed to delete task');
    }
  };

  const handleSaveWpPluginRow = async (row) => {
    try {
      const payload = {
        country: row.country,
        admin_url: row.admin_url,
        admin_username: row.admin_username,
        admin_password: row.admin_password,
        status: row.status,
        plugin_names: row.plugin_names,
        version_before: row.version_before,
        version_after: row.version_after,
        update_status: row.update_status,
        post_update_check: row.post_update_check,
        notes: row.notes,
      };
      if (row.id) {
        const { error } = await supabase.from('task_plugin_update_rows').update(payload).eq('id', row.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('task_plugin_update_rows').insert({
          task_id: selectedTask.id,
          domain_id: row.domain_id || null,
          ...payload,
        });
        if (error) throw error;
      }
      fetchWpPluginRows(selectedTask.id);
      toast.success('Row saved');
    } catch (error) {
      toast.error(error.message || 'Failed to save row');
    }
  };

  const handleAddDomainToWpTask = (domain) => {
    const newRow = {
      id: null,
      domain_id: domain.id,
      country: domain.country,
      admin_url: domain.url,
      admin_username: domain.wp_username,
      admin_password: domain.new_password,
      status: '',
      plugin_names: '',
      version_before: '',
      version_after: '',
      update_status: '',
      post_update_check: '',
      notes: '',
    };
    setWpPluginRows((prev) => [...prev, newRow]);
  };

  const getFilteredTasks = () => {
    const list = taskFilter === 'my-tasks' ? tasks.filter((t) => t.assigned_to === user?.id) : tasks;
    return list;
  };

  const getFilteredDomains = () => domains.filter((d) => d.type === domainTypeFilter);

  const canUpdateStatus = (task) =>
    permissions.canUpdateTaskStatus(userRole, task.assigned_to, user?.id);

  const getStatusColor = (status) => {
    switch (status) {
      case 'to-do':
        return 'bg-gray-100 text-gray-800';
      case 'in-progress':
        return 'bg-blue-100 text-blue-800';
      case 'review':
        return 'bg-yellow-100 text-yellow-800';
      case 'done':
        return 'bg-green-100 text-green-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const isWpPluginTask = (task) => task?.name === 'WordPress Plugin Updates';

  const latestUpdateByDomainId = useMemo(() => {
    const map = {};
    domainUpdates.forEach((row) => {
      if (!row?.domain_id) return;
      const existing = map[row.domain_id];
      if (!existing) {
        map[row.domain_id] = row;
        return;
      }
      const existingDate = existing.created_at ? new Date(existing.created_at) : null;
      const rowDate = row.created_at ? new Date(row.created_at) : null;
      if (!existingDate || (rowDate && rowDate > existingDate)) {
        map[row.domain_id] = row;
      }
    });
    return map;
  }, [domainUpdates]);

  const getDomainPluginSummary = (domain) => {
    const u = latestUpdateByDomainId[domain.id];
    if (!u) return 'Not updated';

    // New domains can have row-level status (done / need verification / blocked access)
    if (u.status === 'blocked access') return 'Blocked access';
    if (u.status === 'need verification') return 'Needs verification';
    if (u.status === 'done' && u.update_status === 'Updated' && u.post_update_check === 'Ok') {
      return 'OK / Updated';
    }

    if (u.update_status === 'Failed') return 'Failed';
    if (u.post_update_check === 'Issue Found') return 'Issue found';
    if (u.update_status === 'Updated' && u.post_update_check === 'Ok') return 'OK / Updated';

    if (u.update_status === 'Skipped') return 'Skipped';

    return u.update_status || 'Pending';
  };

  if (loading && tasks.length === 0) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-gray-600">Loading tasks...</div>
      </div>
    );
  }

  const filteredTasks = getFilteredTasks();
  const filteredDomains = getFilteredDomains();

  return (
    <div className="w-full space-y-4 sm:space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900" style={{ color: PRIMARY }}>
            Task Assignment Log
          </h1>
          <p className="mt-1 text-sm text-gray-600">Manage tasks and domains</p>
        </div>
      </div>

      {/* Main tabs: Tasks | Domains | Domain Claims (TLA TL/VTL) */}
      <div className="flex gap-2 border-b border-gray-200">
        <button
          type="button"
          onClick={() => { setActiveMainTab('tasks'); setSearchParams({}); }}
          className={`px-4 py-2 rounded-t-lg text-sm font-medium transition-colors ${
            activeMainTab === 'tasks' ? 'bg-white border border-b-0 border-gray-200 -mb-px' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}
          style={activeMainTab === 'tasks' ? { borderTopColor: PRIMARY } : {}}
        >
          Tasks
        </button>
        <button
          type="button"
          onClick={() => { setActiveMainTab('domains'); setSearchParams({ tab: 'domains' }); }}
          className={`px-4 py-2 rounded-t-lg text-sm font-medium transition-colors ${
            activeMainTab === 'domains' ? 'bg-white border border-b-0 border-gray-200 -mb-px' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}
        >
          Domains
        </button>
        {(userRole === 'admin' || userRole === 'tla' || userRole === 'tl' || userRole === 'vtl') && (
          <button
            type="button"
            onClick={() => { setActiveMainTab('domain-claims'); setSearchParams({ tab: 'domain-claims' }); }}
            className={`px-4 py-2 rounded-t-lg text-sm font-medium transition-colors ${
              activeMainTab === 'domain-claims' ? 'bg-white border border-b-0 border-gray-200 -mb-px' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            Domain Claims
          </button>
        )}
        {canAccessScheduleFormTab(userRole, userTeam) && (
          <button
            type="button"
            onClick={() => { setActiveMainTab('schedule-form'); setSearchParams({ tab: 'schedule-form' }); }}
            className={`px-4 py-2 rounded-t-lg text-sm font-medium transition-colors ${
              activeMainTab === 'schedule-form' ? 'bg-white border border-b-0 border-gray-200 -mb-px' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            Schedule
          </button>
        )}
      </div>

      {activeMainTab === 'tasks' && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setTaskFilter('all')}
                className={`px-4 py-2 rounded-lg text-sm font-medium ${
                  taskFilter === 'all' ? 'text-white' : 'bg-gray-100 text-gray-700'
                }`}
                style={taskFilter === 'all' ? { backgroundColor: PRIMARY } : {}}
              >
                All Tasks
              </button>
              <button
                type="button"
                onClick={() => setTaskFilter('my-tasks')}
                className={`px-4 py-2 rounded-lg text-sm font-medium ${
                  taskFilter === 'my-tasks' ? 'text-white' : 'bg-gray-100 text-gray-700'
                }`}
                style={taskFilter === 'my-tasks' ? { backgroundColor: PRIMARY } : {}}
              >
                My Tasks
              </button>
            </div>
            {permissions.canCreateTasks(userRole) && (
              <button
                type="button"
                onClick={() => {
                  setShowCreateTaskModal(true);
                  fetchUsers();
                }}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white"
                style={{ backgroundColor: PRIMARY }}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                </svg>
                Add Task
              </button>
            )}
          </div>

          <div className="bg-white rounded-lg border border-gray-200 overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Task Name
                    </th>
                    <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Assigned To
                    </th>
                    <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-24">
                      Details
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {filteredTasks.length > 0 ? (
                    filteredTasks.map((task) => (
                      <tr key={task.id} className="hover:bg-gray-50">
                        <td className="px-4 sm:px-6 py-4">
                          <div className="text-sm font-medium text-gray-900">{task.name}</div>
                          {task.description && (
                            <div className="text-xs text-gray-500 mt-1">{task.description}</div>
                          )}
                        </td>
                        <td className="px-4 sm:px-6 py-4 whitespace-nowrap">
                          {canUpdateStatus(task) ? (
                            <select
                              value={task.status || 'to-do'}
                              onChange={(e) => handleStatusChange(task, e.target.value)}
                              className={`min-w-[7rem] px-2.5 py-1.5 text-xs font-medium rounded-lg border border-gray-200 ${getStatusColor(task.status || 'to-do')} cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#6795BE] focus:ring-offset-0`}
                            >
                              {Object.entries(TASK_STATUSES).map(([key, label]) => (
                                <option key={key} value={key}>
                                  {label}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <span className={`inline-block px-2.5 py-1 text-xs font-medium rounded-lg ${getStatusColor(task.status || 'to-do')}`}>
                              {TASK_STATUSES[task.status] || 'To Do'}
                            </span>
                          )}
                        </td>
                        <td className="px-4 sm:px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {task.assigned_to_name || task.assigned_to || 'Unassigned'}
                        </td>
                        <td className="px-4 sm:px-6 py-4 whitespace-nowrap">
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedTask(task);
                              if (isWpPluginTask(task)) fetchWpPluginRows(task.id);
                            }}
                            className="text-xs font-medium px-2 py-1 rounded text-white hover:opacity-90 transition-opacity"
                            style={{ backgroundColor: PRIMARY }}
                          >
                            View
                          </button>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={4} className="px-4 sm:px-6 py-12 text-center text-sm text-gray-500">
                        {taskFilter === 'my-tasks' ? 'You have no assigned tasks' : 'No tasks found'}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {activeMainTab === 'domains' && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setDomainTypeFilter('old')}
                className={`px-4 py-2 rounded-lg text-sm font-medium ${
                  domainTypeFilter === 'old' ? 'text-white' : 'bg-gray-100 text-gray-700'
                }`}
                style={domainTypeFilter === 'old' ? { backgroundColor: PRIMARY } : {}}
              >
                Old Domains
              </button>
              <button
                type="button"
                onClick={() => setDomainTypeFilter('new')}
                className={`px-4 py-2 rounded-lg text-sm font-medium ${
                  domainTypeFilter === 'new' ? 'text-white' : 'bg-gray-100 text-gray-700'
                }`}
                style={domainTypeFilter === 'new' ? { backgroundColor: PRIMARY } : {}}
              >
                New Domains
              </button>
            </div>
            {permissions.canManageDomains(userRole) && (
              <div className="flex items-center gap-2">
                {!isEditingDomainsTable ? (
                  <button
                    type="button"
                    onClick={() => setIsEditingDomainsTable(true)}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                    Edit
                  </button>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={handleSaveDomains}
                      disabled={savingDomains}
                      className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-50"
                      style={{ backgroundColor: PRIMARY }}
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                      {savingDomains ? 'Saving...' : 'Save'}
                    </button>
                    <button
                      type="button"
                      onClick={handleCancelDomainsEdit}
                      disabled={savingDomains}
                      className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                    >
                      Cancel
                    </button>
                  </>
                )}
                <button
                  type="button"
                  onClick={() => setShowCreateDomainModal(true)}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white"
                  style={{ backgroundColor: PRIMARY }}
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                  </svg>
                  Add Domain
                </button>
              </div>
            )}
          </div>

          {/* Note for Old Domains only: default accounts (editable) used for WordPress plugin updates */}
          {domainTypeFilter === 'old' && (
            <div className="rounded-lg border border-blue-200 bg-blue-50/80 p-4 text-sm text-gray-800">
              <p className="font-semibold text-gray-900 mb-2">Default accounts for old domains (Intern Account WordPress &amp; SG Domain WordPress)</p>
              <p className="mb-3 text-gray-700">These two accounts are the default credentials used for WordPress plugin updates on old domains. You can view and update the values below.</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-3">
                <div className="bg-white/70 rounded-lg p-3 border border-blue-100 relative">
                  <p className="font-medium text-gray-900 mb-2">Intern Account WordPress</p>
                  <p className="text-gray-800 flex items-center gap-1 flex-wrap">
                    <span>Admin Username:</span>
                    {defaultAccounts.intern?.username ? (
                      <>
                        <span className="font-mono text-xs break-all">{defaultAccounts.intern.username}</span>
                        <button
                          type="button"
                          onClick={() => copyUsernameToClipboard(defaultAccounts.intern?.username, 'Username')}
                          className="p-1 rounded text-gray-500 hover:bg-gray-200 hover:text-gray-700"
                          title="Copy username"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                          </svg>
                        </button>
                      </>
                    ) : '—'}
                  </p>
                  <p className="text-gray-800 flex items-center gap-1 flex-wrap">
                    <span>Admin Password:</span>
                    {defaultAccounts.intern?.password ? (
                      <>
                        <span className="font-mono text-xs break-all">
                          {showDefaultPassword.intern ? defaultAccounts.intern.password : '••••••••••••'}
                        </span>
                        <span className="flex items-center gap-0.5">
                          <button
                            type="button"
                            onClick={() => setShowDefaultPassword((s) => ({ ...s, intern: !s.intern }))}
                            className="p-1 rounded text-gray-500 hover:bg-gray-200 hover:text-gray-700"
                            title={showDefaultPassword.intern ? 'Hide password' : 'Show password'}
                          >
                            {showDefaultPassword.intern ? (
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                              </svg>
                            ) : (
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                              </svg>
                            )}
                          </button>
                          {showDefaultPassword.intern && (
                            <button
                              type="button"
                              onClick={() => copyPasswordToClipboard(defaultAccounts.intern?.password, 'Password')}
                              className="p-1 rounded text-gray-500 hover:bg-gray-200 hover:text-gray-700"
                              title="Copy password"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                              </svg>
                            </button>
                          )}
                        </span>
                      </>
                    ) : '—'}
                  </p>
                  {permissions.canManageDomains(userRole) && (
                    <button
                      type="button"
                      onClick={() => {
                        setEditDefaultAccount('intern');
                        setDefaultAccountEditForm({
                          username: defaultAccounts.intern?.username || '',
                          password: defaultAccounts.intern?.password || '',
                        });
                      }}
                      className="mt-2 flex items-center gap-1.5 px-2 py-1.5 rounded text-xs font-medium text-white hover:opacity-90"
                      style={{ backgroundColor: PRIMARY }}
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                      </svg>
                      Edit
                    </button>
                  )}
                </div>
                <div className="bg-white/70 rounded-lg p-3 border border-amber-100 relative">
                  <p className="font-medium text-gray-900 mb-2">SG Domain WordPress</p>
                  <p className="text-gray-800 flex items-center gap-1 flex-wrap">
                    <span>Admin username:</span>
                    {defaultAccounts.sg?.username ? (
                      <>
                        <span className="font-mono text-xs break-all">{defaultAccounts.sg.username}</span>
                        <button
                          type="button"
                          onClick={() => copyUsernameToClipboard(defaultAccounts.sg?.username, 'Username')}
                          className="p-1 rounded text-gray-500 hover:bg-gray-200 hover:text-gray-700"
                          title="Copy username"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                          </svg>
                        </button>
                      </>
                    ) : '—'}
                  </p>
                  <p className="text-gray-800 flex items-center gap-1 flex-wrap">
                    <span>Admin Password:</span>
                    {defaultAccounts.sg?.password ? (
                      <>
                        <span className="font-mono text-xs break-all">
                          {showDefaultPassword.sg ? defaultAccounts.sg.password : '••••••••••••'}
                        </span>
                        <span className="flex items-center gap-0.5">
                          <button
                            type="button"
                            onClick={() => setShowDefaultPassword((s) => ({ ...s, sg: !s.sg }))}
                            className="p-1 rounded text-gray-500 hover:bg-gray-200 hover:text-gray-700"
                            title={showDefaultPassword.sg ? 'Hide password' : 'Show password'}
                          >
                            {showDefaultPassword.sg ? (
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                              </svg>
                            ) : (
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                              </svg>
                            )}
                          </button>
                          {showDefaultPassword.sg && (
                            <button
                              type="button"
                              onClick={() => copyPasswordToClipboard(defaultAccounts.sg?.password, 'Password')}
                              className="p-1 rounded text-gray-500 hover:bg-gray-200 hover:text-gray-700"
                              title="Copy password"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                              </svg>
                            </button>
                          )}
                        </span>
                      </>
                    ) : '—'}
                  </p>
                  {permissions.canManageDomains(userRole) && (
                    <button
                      type="button"
                      onClick={() => {
                        setEditDefaultAccount('sg');
                        setDefaultAccountEditForm({
                          username: defaultAccounts.sg?.username || '',
                          password: defaultAccounts.sg?.password || '',
                        });
                      }}
                      className="mt-2 flex items-center gap-1.5 px-2 py-1.5 rounded text-xs font-medium text-white hover:opacity-90 bg-amber-600"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                      </svg>
                      Edit
                    </button>
                  )}
                  <p className="mt-2 text-xs font-medium text-amber-800">For SG Domain DO NOT CHANGE the password unless required.</p>
                </div>
              </div>
            </div>
          )}

          <div className="bg-white rounded-lg border border-gray-200 overflow-hidden shadow-sm overflow-x-auto">
            {domainTypeFilter === 'old' ? (
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Country</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">URL</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Scanning</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Plugin</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">2FA</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">reCAPTCHA</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Backup</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {filteredDomains.length > 0 ? (
                    filteredDomains.map((domain) => (
                      <tr key={domain.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 text-sm text-gray-900">
                          {isEditingDomainsTable ? (
                            <input
                              type="text"
                              value={domain.country || ''}
                              onChange={(e) => updateDomainInState(domain.id, { country: e.target.value })}
                              className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
                              placeholder="Country"
                            />
                          ) : (
                            domain.country || '—'
                          )}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600">
                          {!isEditingDomainsTable && (() => {
                            const summary = getDomainPluginSummary(domain);
                            return summary === 'OK / Updated' || summary === 'OK' ? 'Updated' : 'Not updated';
                          })()}
                          {isEditingDomainsTable && <span className="text-gray-400">—</span>}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600 break-all">
                          {isEditingDomainsTable ? (
                            <input
                              type="url"
                              value={domain.url || ''}
                              onChange={(e) => updateDomainInState(domain.id, { url: e.target.value })}
                              className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm break-all"
                              placeholder="https://..."
                            />
                          ) : domain.url ? (
                            <a href={domain.url} target="_blank" rel="noopener noreferrer" className="text-[#6795BE] hover:underline break-all">
                              {domain.url}
                            </a>
                          ) : (
                            '—'
                          )}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600">
                          {isEditingDomainsTable ? (
                            <select
                              value={domain.scanning_date || 'ok'}
                              onChange={(e) => updateDomainInState(domain.id, { scanning_date: e.target.value })}
                              className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
                            >
                              {SCANNING_OPTIONS.map((o) => (
                                <option key={o} value={o}>{SCANNING_LABELS[o] || o}</option>
                              ))}
                            </select>
                          ) : (
                            domain.scanning_date || 'ok'
                          )}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600">
                          {isEditingDomainsTable ? (
                            <input
                              type="date"
                              value={domain.scanning_done_date ? domain.scanning_done_date.slice(0, 10) : ''}
                              onChange={(e) => updateDomainInState(domain.id, { scanning_done_date: e.target.value || null })}
                              className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
                            />
                          ) : (
                            domain.scanning_done_date ? new Date(domain.scanning_done_date).toLocaleDateString() : '—'
                          )}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600">
                          {isEditingDomainsTable ? (
                            <select
                              value={domain.scanning_plugin || 'ok'}
                              onChange={(e) => updateDomainInState(domain.id, { scanning_plugin: e.target.value })}
                              className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
                            >
                              {SCANNING_OPTIONS.map((o) => (
                                <option key={o} value={o}>{SCANNING_LABELS[o] || o}</option>
                              ))}
                            </select>
                          ) : (
                            domain.scanning_plugin || 'ok'
                          )}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600">
                          {isEditingDomainsTable ? (
                            <select
                              value={domain.scanning_2fa || 'ok'}
                              onChange={(e) => updateDomainInState(domain.id, { scanning_2fa: e.target.value })}
                              className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
                            >
                              {SCANNING_OPTIONS.map((o) => (
                                <option key={o} value={o}>{SCANNING_LABELS[o] || o}</option>
                              ))}
                            </select>
                          ) : (
                            domain.scanning_2fa || 'ok'
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <input
                            type="checkbox"
                            checked={!!domain.recaptcha}
                            readOnly={!isEditingDomainsTable}
                            onChange={isEditingDomainsTable ? (e) => updateDomainInState(domain.id, { recaptcha: e.target.checked }) : undefined}
                            className="rounded"
                          />
                        </td>
                        <td className="px-4 py-3">
                          <input
                            type="checkbox"
                            checked={!!domain.backup}
                            readOnly={!isEditingDomainsTable}
                            onChange={isEditingDomainsTable ? (e) => updateDomainInState(domain.id, { backup: e.target.checked }) : undefined}
                            className="rounded"
                          />
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={11} className="px-4 py-12 text-center text-sm text-gray-500">
                        No old domains. Add one with &quot;Add Domain&quot;.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            ) : (
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Country</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">URL</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Scanning</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Plugin</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">2FA</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">WP Username</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">New Password</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">reCAPTCHA</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Backup</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {filteredDomains.length > 0 ? (
                    filteredDomains.map((domain) => (
                      <tr
                        key={domain.id}
                        className={`hover:bg-gray-50 ${!isEditingDomainsTable ? 'cursor-pointer' : ''}`}
                        onClick={!isEditingDomainsTable ? () => setSelectedNewDomainDetails(domain) : undefined}
                      >
                        <td className="px-4 py-3 text-sm text-gray-900" onClick={e => isEditingDomainsTable && e.stopPropagation()}>
                          {isEditingDomainsTable ? (
                            <input
                              type="text"
                              value={domain.country || ''}
                              onChange={(e) => updateDomainInState(domain.id, { country: e.target.value })}
                              className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
                              placeholder="Country"
                            />
                          ) : (
                            domain.country || '—'
                          )}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600 break-all" onClick={e => isEditingDomainsTable && e.stopPropagation()}>
                          {isEditingDomainsTable ? (
                            <input
                              type="url"
                              value={domain.url || ''}
                              onChange={(e) => updateDomainInState(domain.id, { url: e.target.value })}
                              className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm break-all"
                              placeholder="https://..."
                            />
                          ) : domain.url ? (
                            <a href={domain.url} target="_blank" rel="noopener noreferrer" className="text-[#6795BE] hover:underline break-all">
                              {domain.url}
                            </a>
                          ) : (
                            '—'
                          )}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600" onClick={e => isEditingDomainsTable && e.stopPropagation()}>
                          {isEditingDomainsTable ? (
                            <input
                              type="text"
                              value={domain.status || ''}
                              onChange={(e) => updateDomainInState(domain.id, { status: e.target.value })}
                              className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
                              placeholder="Status"
                            />
                          ) : (
                            domain.status || '—'
                          )}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600" onClick={e => isEditingDomainsTable && e.stopPropagation()}>
                          {isEditingDomainsTable ? (
                            <input
                              type="date"
                              value={domain.scanning_done_date ? domain.scanning_done_date.slice(0, 10) : ''}
                              onChange={(e) => updateDomainInState(domain.id, { scanning_done_date: e.target.value || null })}
                              className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
                            />
                          ) : (
                            domain.scanning_done_date ? new Date(domain.scanning_done_date).toLocaleDateString() : '—'
                          )}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600" onClick={e => isEditingDomainsTable && e.stopPropagation()}>
                          {isEditingDomainsTable ? (
                            <select
                              value={domain.scanning_date || ''}
                              onChange={(e) => updateDomainInState(domain.id, { scanning_date: e.target.value })}
                              className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
                            >
                              <option value="">—</option>
                              {SCANNING_OPTIONS.map((o) => (
                                <option key={o} value={o}>{SCANNING_LABELS[o] || o}</option>
                              ))}
                            </select>
                          ) : (
                            domain.scanning_date || '—'
                          )}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600" onClick={e => isEditingDomainsTable && e.stopPropagation()}>
                          {isEditingDomainsTable ? (
                            <select
                              value={domain.scanning_plugin || ''}
                              onChange={(e) => updateDomainInState(domain.id, { scanning_plugin: e.target.value })}
                              className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
                            >
                              <option value="">—</option>
                              {SCANNING_OPTIONS.map((o) => (
                                <option key={o} value={o}>{SCANNING_LABELS[o] || o}</option>
                              ))}
                            </select>
                          ) : (
                            domain.scanning_plugin || '—'
                          )}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600" onClick={e => isEditingDomainsTable && e.stopPropagation()}>
                          {isEditingDomainsTable ? (
                            <select
                              value={domain.scanning_2fa || ''}
                              onChange={(e) => updateDomainInState(domain.id, { scanning_2fa: e.target.value })}
                              className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
                            >
                              <option value="">—</option>
                              {SCANNING_OPTIONS.map((o) => (
                                <option key={o} value={o}>{SCANNING_LABELS[o] || o}</option>
                              ))}
                            </select>
                          ) : (
                            domain.scanning_2fa || '—'
                          )}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600" onClick={e => isEditingDomainsTable && e.stopPropagation()}>
                          {isEditingDomainsTable ? (
                            <input
                              type="text"
                              value={domain.wp_username || ''}
                              onChange={(e) => updateDomainInState(domain.id, { wp_username: e.target.value })}
                              className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
                              placeholder="WP Username"
                            />
                          ) : (
                            <span className="inline-flex items-center gap-1">
                              <span>{domain.wp_username || '—'}</span>
                              {domain.wp_username && !isEditingDomainsTable && (
                                <button
                                  type="button"
                                  onClick={(e) => { e.stopPropagation(); copyUsernameToClipboard(domain.wp_username, 'WP Username'); }}
                                  className="p-1 rounded text-gray-400 hover:text-gray-700 hover:bg-gray-100"
                                  title="Copy WP username"
                                >
                                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                                  </svg>
                                </button>
                              )}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600" onClick={e => isEditingDomainsTable && e.stopPropagation()}>
                          {isEditingDomainsTable ? (
                            <input
                              type="password"
                              value={domain.new_password || ''}
                              onChange={(e) => updateDomainInState(domain.id, { new_password: e.target.value })}
                              className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
                              placeholder="Password"
                            />
                          ) : (
                            <span className="inline-flex items-center gap-1">
                              <span>{domain.new_password ? '••••••' : '—'}</span>
                              {domain.new_password && !isEditingDomainsTable && (
                                <button
                                  type="button"
                                  onClick={(e) => { e.stopPropagation(); copyPasswordToClipboard(domain.new_password, 'WP Password'); }}
                                  className="p-1 rounded text-gray-400 hover:text-gray-700 hover:bg-gray-100"
                                  title="Copy password"
                                >
                                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                                  </svg>
                                </button>
                              )}
                              {permissions.canManageDomains(userRole) && !isEditingDomainsTable && (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    const newPass = window.prompt('Enter new password (current will be saved to history):');
                                    if (newPass != null && newPass !== '') handleUpdateDomainPassword(domain.id, newPass);
                                  }}
                                  className="ml-1 text-xs font-medium"
                                  style={{ color: PRIMARY }}
                                >
                                  Update
                                </button>
                              )}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3" onClick={e => isEditingDomainsTable && e.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={!!domain.recaptcha}
                            readOnly={!isEditingDomainsTable}
                            onChange={isEditingDomainsTable ? (e) => updateDomainInState(domain.id, { recaptcha: e.target.checked }) : undefined}
                            className="rounded"
                          />
                        </td>
                        <td className="px-4 py-3" onClick={e => isEditingDomainsTable && e.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={!!domain.backup}
                            readOnly={!isEditingDomainsTable}
                            onChange={isEditingDomainsTable ? (e) => updateDomainInState(domain.id, { backup: e.target.checked }) : undefined}
                            className="rounded"
                          />
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={13} className="px-4 py-12 text-center text-sm text-gray-500">
                        No new domains. Add one with &quot;Add Domain&quot;.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            )}
          </div>

          {/* View Old Domain Accounts modal (Intern + SG; update Intern only) */}
          {selectedDomainForAccounts && (
            <Modal open={!!selectedDomainForAccounts} onClose={() => setSelectedDomainForAccounts(null)}>
              <div className="bg-white rounded-xl shadow-xl w-full max-w-md border border-gray-200">
                <div className="p-5">
                  <div className="flex justify-between items-center mb-4">
                    <h3 className="font-semibold text-gray-900" style={{ color: PRIMARY }}>
                      Accounts — {selectedDomainForAccounts.country || selectedDomainForAccounts.url || 'Domain'}
                    </h3>
                    <button type="button" onClick={() => setSelectedDomainForAccounts(null)} className="text-gray-400 hover:text-gray-600">✕</button>
                  </div>
                  <div className="space-y-4">
                    <div className="rounded-lg border border-gray-200 p-3 bg-gray-50">
                      <p className="text-xs font-semibold text-gray-500 uppercase mb-2">Intern Account WordPress</p>
                      <p className="text-sm">Admin Username: {selectedDomainForAccounts.wp_username || '—'}</p>
                      <p className="text-sm">Admin Password: {selectedDomainForAccounts.new_password ? '••••••••' : '—'}</p>
                      {permissions.canManageDomains(userRole) && (
                        <button
                          type="button"
                          onClick={() => {
                            const newPass = window.prompt('Enter new password (current will be saved to history):');
                            if (newPass != null && newPass !== '') {
                              handleUpdateDomainPassword(selectedDomainForAccounts.id, newPass);
                              setSelectedDomainForAccounts((d) => (d ? { ...d, new_password: newPass } : null));
                            }
                          }}
                          className="mt-2 text-xs font-medium"
                          style={{ color: PRIMARY }}
                        >
                          Update Intern password
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={async () => {
                          await fetchDomainPasswordHistory(selectedDomainForAccounts.id);
                          setPasswordHistoryModalDomain(selectedDomainForAccounts);
                        }}
                        className="block mt-1 text-xs text-gray-500 hover:underline"
                      >
                        View password history
                      </button>
                    </div>
                    <div className="rounded-lg border border-amber-200 p-3 bg-amber-50/50">
                      <p className="text-xs font-semibold text-amber-800 uppercase mb-2">SG Domain WordPress</p>
                      <p className="text-sm">Admin username: {selectedDomainForAccounts.sg_username || '—'}</p>
                      <p className="text-sm">Admin Password: {selectedDomainForAccounts.sg_password ? '••••••••' : '—'}</p>
                      <p className="text-xs font-medium text-amber-800 mt-1">DO NOT CHANGE the password.</p>
                    </div>
                  </div>
                </div>
              </div>
            </Modal>
          )}

          {/* New Domains – details modal */}
          {selectedNewDomainDetails && (
            <Modal open={!!selectedNewDomainDetails} onClose={() => setSelectedNewDomainDetails(null)}>
              <div className="bg-white rounded-xl shadow-xl w-full max-w-md border border-gray-200">
                <div className="p-5 space-y-4">
                  <div className="flex justify-between items-center">
                    <div className="flex-1 text-center">
                      <h3 className="font-semibold text-gray-900" style={{ color: PRIMARY }}>
                        {selectedNewDomainDetails.country || 'Domain'}
                      </h3>
                      {selectedNewDomainDetails.url && (
                        <a
                          href={selectedNewDomainDetails.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="mt-1 inline-block text-xs text-[#6795BE] hover:underline break-all"
                        >
                          {selectedNewDomainDetails.url}
                        </a>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => setSelectedNewDomainDetails(null)}
                      className="text-gray-400 hover:text-gray-600"
                    >
                      ✕
                    </button>
                  </div>
                  <div className="space-y-2 text-sm text-gray-800">
                    <div className="flex justify-between">
                      <span className="font-medium">WP Username:</span>
                      <span className="font-mono break-all">{selectedNewDomainDetails.wp_username || '—'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="font-medium">New Password:</span>
                      <span className="font-mono break-all">
                        {selectedNewDomainDetails.new_password || '—'}
                      </span>
                    </div>
                    <div className="pt-2">
                      <button
                        type="button"
                        onClick={async () => {
                          await fetchDomainPasswordHistory(selectedNewDomainDetails.id);
                          setPasswordHistoryModalDomain(selectedNewDomainDetails);
                        }}
                        className="text-xs font-medium"
                        style={{ color: PRIMARY }}
                      >
                        View old password history
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </Modal>
          )}

          {/* Password history modal for a specific domain */}
          {passwordHistoryModalDomain && (
            <Modal open={!!passwordHistoryModalDomain} onClose={() => setPasswordHistoryModalDomain(null)}>
              <div className="bg-white rounded-xl shadow-xl w-full max-w-md border border-gray-200">
                <div className="p-5">
                  <div className="mb-4">
                    <div className="flex justify-between items-center">
                      <button
                        type="button"
                        onClick={() => setPasswordHistoryModalDomain(null)}
                        className="text-gray-400 hover:text-gray-600"
                      >
                        ✕
                      </button>
                    </div>
                    <h3 className="mt-1 text-center font-semibold text-gray-900" style={{ color: PRIMARY }}>
                      {passwordHistoryModalDomain.country || passwordHistoryModalDomain.url || 'Domain'}
                    </h3>
                    <p className="mt-1 text-center text-xs text-gray-500">Password history by month and year</p>
                  </div>
                  <div className="space-y-2 max-h-80 overflow-y-auto text-sm text-gray-800">
                    {(() => {
                      const history = domainPasswordHistory[passwordHistoryModalDomain.id] || [];
                      if (!history.length) {
                        return <p className="text-sm text-gray-500">No password history recorded yet for this domain.</p>;
                      }
                      return history.map((h, idx) => {
                        const date = new Date(h.recorded_at);
                        const month = date.toLocaleString('default', { month: 'long' });
                        const year = date.getFullYear();
                        const label = `${month} - ${year}`;
                        return (
                          <div
                            key={idx}
                            className="flex items-center justify-between rounded border border-gray-100 bg-gray-50 px-3 py-2"
                          >
                            <div>
                              <div className="text-xs font-medium text-gray-500 uppercase">{label}</div>
                              <div className="font-mono text-sm break-all">{h.password || '—'}</div>
                            </div>
                          </div>
                        );
                      });
                    })()}
                  </div>
                </div>
              </div>
            </Modal>
          )}

          {/* Edit Default Account modal (Intern or SG) */}
          {editDefaultAccount && (
            <Modal open={!!editDefaultAccount} onClose={() => { setEditDefaultAccount(null); setDefaultAccountEditForm({ username: '', password: '' }); setShowEditModalPassword(false); }}>
              <div className="bg-white rounded-xl shadow-xl w-full max-w-md border border-gray-200">
                <div className="p-5">
                  <div className="flex justify-between items-center mb-4">
                    <h3 className="font-semibold text-gray-900" style={{ color: PRIMARY }}>
                      Edit {editDefaultAccount === 'intern' ? 'Intern Account WordPress' : 'SG Domain WordPress'}
                    </h3>
                    <button type="button" onClick={() => { setEditDefaultAccount(null); setDefaultAccountEditForm({ username: '', password: '' }); setShowEditModalPassword(false); }} className="text-gray-400 hover:text-gray-600">✕</button>
                  </div>
                  <form onSubmit={handleSaveDefaultAccount} className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Admin Username</label>
                      <input
                        type="text"
                        value={defaultAccountEditForm.username}
                        onChange={(e) => setDefaultAccountEditForm((f) => ({ ...f, username: e.target.value }))}
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-[#6795BE]"
                        placeholder="Username"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Admin Password</label>
                      <div className="flex items-center gap-1 rounded-lg border border-gray-300 bg-white focus-within:ring-2 focus-within:ring-[#6795BE] focus-within:border-transparent">
                        <input
                          type={showEditModalPassword ? 'text' : 'password'}
                          value={defaultAccountEditForm.password}
                          onChange={(e) => setDefaultAccountEditForm((f) => ({ ...f, password: e.target.value }))}
                          className="flex-1 min-w-0 rounded-lg border-0 px-3 py-2 text-sm focus:ring-0 focus:outline-none"
                          placeholder="Password"
                        />
                        <button
                          type="button"
                          onClick={() => setShowEditModalPassword((v) => !v)}
                          className="p-2 rounded text-gray-500 hover:bg-gray-100 hover:text-gray-700 shrink-0"
                          title={showEditModalPassword ? 'Hide password' : 'Show password'}
                        >
                          {showEditModalPassword ? (
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                            </svg>
                          ) : (
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                              <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                            </svg>
                          )}
                        </button>
                      </div>
                      {editDefaultAccount === 'sg' && (
                        <p className="mt-1 text-xs text-amber-700">For SG Domain DO NOT CHANGE the password unless required.</p>
                      )}
                    </div>
                    <div className="flex gap-2 pt-2">
                      <button
                        type="submit"
                        disabled={savingDefaultAccount}
                        className="px-4 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-50"
                        style={{ backgroundColor: PRIMARY }}
                      >
                        {savingDefaultAccount ? 'Saving...' : 'Save'}
                      </button>
                      <button
                        type="button"
                        onClick={() => { setEditDefaultAccount(null); setDefaultAccountEditForm({ username: '', password: '' }); setShowEditModalPassword(false); }}
                        className="px-4 py-2 rounded-lg text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200"
                      >
                        Cancel
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            </Modal>
          )}
        </>
      )}

      {activeMainTab === 'domain-claims' && (userRole === 'admin' || userRole === 'tla' || userRole === 'tl' || userRole === 'vtl') && (
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden shadow-sm">
          <div className="p-4 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900" style={{ color: PRIMARY }}>
              Domain Claims
            </h2>
            <p className="mt-1 text-sm text-gray-600">
              Domains updated by TLA interns — who claimed or updated each domain and when.
            </p>
          </div>
          <div className="overflow-x-auto">
            {domainUpdates.length === 0 ? (
              <div className="py-12 text-center text-sm text-gray-500">No domain update rows yet.</div>
            ) : (
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Domain / Country</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">TLA Intern Name</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Update Status</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Post Update Check</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {[...domainUpdates]
                    .sort((a, b) => {
                      const da = a.created_at ? new Date(a.created_at).getTime() : 0;
                      const db = b.created_at ? new Date(b.created_at).getTime() : 0;
                      return db - da;
                    })
                    .map((row) => {
                      const domain = domains.find((d) => d.id === row.domain_id);
                      const country = row.country || domain?.country || '—';
                      return (
                        <tr key={row.id} className="hover:bg-gray-50">
                          <td className="px-4 py-3 text-sm text-gray-900">{country}</td>
                          <td className="px-4 py-3 text-sm text-gray-600">{row.updated_by_name || '—'}</td>
                          <td className="px-4 py-3 text-sm text-gray-600 whitespace-nowrap">
                            {row.created_at ? new Date(row.created_at).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : '—'}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-600">{row.update_status || '—'}</td>
                          <td className="px-4 py-3 text-sm text-gray-600">{row.post_update_check || '—'}</td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {activeMainTab === 'schedule-form' && canAccessScheduleFormTab(userRole, userTeam) && (
        <div className="space-y-4">
          {/* Schedule sub-tabs: Form | Intern responses */}
          <div className="flex gap-2 border-b border-gray-200">
            <button
              type="button"
              onClick={() => { setScheduleSubTab('form'); setSearchParams((p) => { const next = new URLSearchParams(p); next.set('tab', 'schedule-form'); next.set('schedule', 'form'); return next; }); }}
              className={`px-4 py-2 rounded-t-lg text-sm font-medium transition-colors ${
                scheduleSubTab === 'form' ? 'bg-white border border-b-0 border-gray-200 -mb-px' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
              style={scheduleSubTab === 'form' ? { borderTopColor: PRIMARY } : {}}
            >
              Schedule Form
            </button>
            <button
              type="button"
              onClick={() => { setScheduleSubTab('responses'); setSearchParams((p) => { const next = new URLSearchParams(p); next.set('tab', 'schedule-form'); next.set('schedule', 'responses'); return next; }); }}
              className={`px-4 py-2 rounded-t-lg text-sm font-medium transition-colors ${
                scheduleSubTab === 'responses' ? 'bg-white border border-b-0 border-gray-200 -mb-px' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
              style={scheduleSubTab === 'responses' ? { borderTopColor: PRIMARY } : {}}
            >
              Intern responses
            </button>
          </div>

          {scheduleSubTab === 'form' && (
            <div className="space-y-6">
          <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
            <div className="p-4 border-b border-gray-200 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-gray-900" style={{ color: PRIMARY }}>
                  Schedule Form
                </h2>
                <p className="mt-1 text-sm text-gray-600">
                  Share the form link with interns to collect their preferred schedule. No login required.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  readOnly
                  value={scheduleFormLink}
                  className="rounded-lg border border-gray-300 px-3 py-2 text-sm w-72 max-w-full bg-gray-50"
                />
                <button
                  type="button"
                  onClick={handleCopyScheduleFormLink}
                  className="px-4 py-2 rounded-lg text-sm font-medium text-white whitespace-nowrap"
                  style={{ backgroundColor: PRIMARY }}
                >
                  Copy link
                </button>
              </div>
            </div>
          </div>

          {scheduleConfigForm && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Column 1: Editable form content */}
              <div className="lg:order-1">
                <form onSubmit={handleSaveScheduleConfig} className="bg-white rounded-lg border border-gray-200 shadow-sm p-4 space-y-4 h-full flex flex-col">
                  <h3 className="text-base font-semibold text-gray-900" style={{ color: PRIMARY }}>Editable form content</h3>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Office hours</label>
                    <input
                      type="text"
                      value={scheduleConfigForm.office_hours || ''}
                      onChange={(e) => setScheduleConfigForm((f) => ({ ...f, office_hours: e.target.value }))}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                      placeholder="e.g. 8:00 AM – 6:00 PM"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Minimum requirement</label>
                    <input
                      type="text"
                      value={scheduleConfigForm.min_requirement || ''}
                      onChange={(e) => setScheduleConfigForm((f) => ({ ...f, min_requirement: e.target.value }))}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                      placeholder="e.g. 20 hours/week"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Schedule options (Option A/B text)</label>
                    <textarea
                      value={scheduleConfigForm.schedule_options_text || ''}
                      onChange={(e) => setScheduleConfigForm((f) => ({ ...f, schedule_options_text: e.target.value }))}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm min-h-[80px]"
                      rows={3}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Regular shifts text</label>
                    <textarea
                      value={scheduleConfigForm.regular_shifts_text || ''}
                      onChange={(e) => setScheduleConfigForm((f) => ({ ...f, regular_shifts_text: e.target.value }))}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm min-h-[80px]"
                      rows={3}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Other rules & reminders</label>
                    <textarea
                      value={scheduleConfigForm.other_rules_text || ''}
                      onChange={(e) => setScheduleConfigForm((f) => ({ ...f, other_rules_text: e.target.value }))}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm min-h-[60px]"
                      rows={2}
                    />
                  </div>
                  <button type="submit" disabled={savingScheduleConfig} className="mt-auto px-4 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-60 w-fit" style={{ backgroundColor: PRIMARY }}>
                    {savingScheduleConfig ? 'Saving...' : 'Save form content'}
                  </button>
                </form>
              </div>

              {/* Column 2: Monitoring Team contacts */}
              <div className="lg:order-2">
                <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-4 h-full">
                  <h3 className="text-base font-semibold text-gray-900 mb-3" style={{ color: PRIMARY }}>Monitoring Team contacts (shown on form)</h3>
                  <p className="text-sm text-gray-600 mb-3">Edit the email for each slot. Labels are fixed; only the email is stored and shown on the public form.</p>
                  <div className="space-y-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Knowles Monitoring Team</label>
                      <input
                        type="email"
                        value={scheduleConfigForm.contact_knowles_email ?? ''}
                        onChange={(e) => setScheduleConfigForm((f) => ({ ...f, contact_knowles_email: e.target.value }))}
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-[#6795BE] focus:border-[#6795BE]"
                        placeholder="e.g. rowelakatelhynebarredo@gmail.com"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Umonics Monitoring Intern TL</label>
                      <input
                        type="email"
                        value={scheduleConfigForm.contact_umonics_email ?? ''}
                        onChange={(e) => setScheduleConfigForm((f) => ({ ...f, contact_umonics_email: e.target.value }))}
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-[#6795BE] focus:border-[#6795BE]"
                        placeholder="e.g. johnearl.balabat@gmail.com"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Pinnacle</label>
                      <input
                        type="email"
                        value={scheduleConfigForm.contact_pinnacle_email ?? ''}
                        onChange={(e) => setScheduleConfigForm((f) => ({ ...f, contact_pinnacle_email: e.target.value }))}
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-[#6795BE] focus:border-[#6795BE]"
                        placeholder="e.g. bermarvillarazojr@gmail.com"
                      />
                    </div>
                  </div>
                  <p className="mt-3 text-xs text-gray-500">Emails auto-update on the public schedule form a moment after you type.</p>
                </div>
              </div>

              {/* Column 3: Preview (as shown on the form) */}
              <div className="lg:order-3">
                <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-4 h-full sticky top-6">
                  <h3 className="text-base font-semibold text-gray-900 mb-3" style={{ color: PRIMARY }}>Preview (as shown on the form)</h3>
                  <div className="text-sm text-gray-700 space-y-3">
                    <p><strong>Office Hours:</strong> {scheduleConfigForm.office_hours || '—'}</p>
                    <p><strong>Minimum Requirement:</strong> {scheduleConfigForm.min_requirement || '—'}</p>
                    <p>
                      <strong>For those with schedule conflicts or overlapping classes:</strong>
                      <span className="whitespace-pre-wrap block mt-1">{scheduleConfigForm.schedule_options_text || '—'}</span>
                    </p>
                    <p>
                      <strong>Regular Shifts (Mon–Fri):</strong>
                      <span className="whitespace-pre-wrap block mt-1">{scheduleConfigForm.regular_shifts_text || '—'}</span>
                    </p>
                    <p>
                      <strong>Other Rules & Reminders:</strong>
                      <span className="whitespace-pre-wrap block mt-1">{scheduleConfigForm.other_rules_text || '—'}</span>
                    </p>
                    <p className="pt-2 border-t border-gray-100">
                      <strong>Monitoring contacts:</strong>
                      <span className="block mt-1">
                        {scheduleConfigForm.contact_knowles_email && <span className="block">Knowles – {scheduleConfigForm.contact_knowles_email}</span>}
                        {scheduleConfigForm.contact_umonics_email && <span className="block">Umonics TL – {scheduleConfigForm.contact_umonics_email}</span>}
                        {scheduleConfigForm.contact_pinnacle_email && <span className="block">Pinnacle – {scheduleConfigForm.contact_pinnacle_email}</span>}
                        {!scheduleConfigForm.contact_knowles_email && !scheduleConfigForm.contact_umonics_email && !scheduleConfigForm.contact_pinnacle_email && '—'}
                      </span>
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}
            </div>
          )}

          {scheduleSubTab === 'responses' && (
          <div className="bg-white rounded-lg border border-gray-200 overflow-hidden shadow-sm">
            <div className="p-4 border-b border-gray-200">
              <h3 className="text-base font-semibold text-gray-900" style={{ color: PRIMARY }}>Intern responses</h3>
              <p className="mt-1 text-sm text-gray-600">Preferred schedule submissions from the public form.</p>
            </div>
            <div className="overflow-x-auto">
              {scheduleResponses.length === 0 ? (
                <div className="py-12 text-center text-sm text-gray-500">No responses yet.</div>
              ) : (
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Email</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Preferred option</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Preferred days</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Hours/week</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Start date</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Submitted</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Notes</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {scheduleResponses.map((row) => (
                      <tr key={row.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 text-sm text-gray-900">{row.intern_name || ''}</td>
                        <td className="px-4 py-3 text-sm text-gray-600">{row.email || ''}</td>
                        <td className="px-4 py-3 text-sm text-gray-600">{row.preferred_option === 'option_a' ? 'Option A' : row.preferred_option === 'option_b' ? 'Option B' : row.preferred_option === 'combination' ? 'Combination' : row.preferred_option || ''}</td>
                        <td className="px-4 py-3 text-sm text-gray-600">{row.preferred_days || ''}</td>
                        <td className="px-4 py-3 text-sm text-gray-600">{row.hours_per_week || ''}</td>
                        <td className="px-4 py-3 text-sm text-gray-600 whitespace-nowrap">{row.start_date_preference ? new Date(row.start_date_preference).toLocaleDateString() : ''}</td>
                        <td className="px-4 py-3 text-sm text-gray-600 whitespace-nowrap">{row.submitted_at ? new Date(row.submitted_at).toLocaleString() : ''}</td>
                        <td className="px-4 py-3 text-sm text-gray-600 max-w-xs truncate" title={row.notes || ''}>{row.notes || ''}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
          )}
        </div>
      )}

      {/* Create Task Modal */}
      {showCreateTaskModal && (
        <Modal open={showCreateTaskModal} onClose={() => setShowCreateTaskModal(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[85vh] overflow-y-auto border border-gray-100">
            <div className="p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4" style={{ color: PRIMARY }}>
                Add Task
              </h2>
              <form onSubmit={handleCreateTask} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Task Name</label>
                  <select
                    value={createTaskForm.name}
                    onChange={(e) =>
                      setCreateTaskForm((f) => ({ ...f, name: e.target.value, domain_migration: '' }))
                    }
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-[#6795BE]"
                    required
                  >
                    <option value="">Select task</option>
                    {TASK_NAMES.map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                </div>
                {createTaskForm.name === 'WordPress Plugin Updates' && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Domain Migration</label>
                    <select
                      value={createTaskForm.domain_migration}
                      onChange={(e) => setCreateTaskForm((f) => ({ ...f, domain_migration: e.target.value }))}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-[#6795BE]"
                    >
                      <option value="">New or Old domain</option>
                      <option value="new">New domain</option>
                      <option value="old">Old domain</option>
                    </select>
                  </div>
                )}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                  <select
                    value={createTaskForm.status}
                    onChange={(e) => setCreateTaskForm((f) => ({ ...f, status: e.target.value }))}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-[#6795BE]"
                  >
                    {Object.entries(TASK_STATUSES).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Assigned To (Role - Name)</label>
                  <select
                    value={createTaskForm.assigned_to}
                    onChange={(e) => setCreateTaskForm((f) => ({ ...f, assigned_to: e.target.value }))}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-[#6795BE]"
                  >
                    <option value="">Unassigned</option>
                    {users.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.role || 'User'} - {u.full_name || u.email}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex gap-2 pt-2">
                  <button
                    type="submit"
                    disabled={claimingTaskId === 'create' || !isTaskFormValid()}
                    className="px-4 py-2 rounded-lg text-sm font-medium text-white disabled:cursor-not-allowed disabled:bg-gray-300 disabled:text-gray-600"
                    style={isTaskFormValid() ? { backgroundColor: PRIMARY } : {}}
                  >
                    {claimingTaskId === 'create' ? 'Creating...' : 'Create Task'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowCreateTaskModal(false)}
                    className="px-4 py-2 rounded-lg text-sm font-medium text-gray-700 bg-gray-100 hover:bg-red-50 hover:text-red-700 hover:border-red-200 border border-transparent"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          </div>
        </Modal>
      )}

      {/* Create Domain Modal */}
      {showCreateDomainModal && (
        <Modal open={showCreateDomainModal} onClose={() => setShowCreateDomainModal(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] overflow-y-auto border border-gray-100">
            <div className="p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4" style={{ color: PRIMARY }}>
                Add Domain
              </h2>
              <form onSubmit={handleCreateDomain} className="space-y-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
                  <select
                    value={createDomainForm.type}
                    onChange={(e) => setCreateDomainForm((f) => ({ ...f, type: e.target.value }))}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  >
                    <option value="old">Old</option>
                    <option value="new">New</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Country</label>
                  <input
                    type="text"
                    value={createDomainForm.country}
                    onChange={(e) => setCreateDomainForm((f) => ({ ...f, country: e.target.value }))}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                    placeholder="Country"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">URL</label>
                  <input
                    type="url"
                    value={createDomainForm.url}
                    onChange={(e) => setCreateDomainForm((f) => ({ ...f, url: e.target.value }))}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                    placeholder="https://..."
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                  <select
                    value={createDomainForm.status}
                    onChange={(e) => setCreateDomainForm((f) => ({ ...f, status: e.target.value }))}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-[#6795BE]"
                  >
                    <option value="">—</option>
                    {SCANNING_OPTIONS.map((o) => (
                      <option key={o} value={o}>{SCANNING_LABELS[o] || o}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <span className="block text-sm font-medium text-gray-700">Scanning</span>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Date (date of scanning)</label>
                      <input
                        type="date"
                        value={createDomainForm.scanning_done_date}
                        onChange={(e) => setCreateDomainForm((f) => ({ ...f, scanning_done_date: e.target.value }))}
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-[#6795BE]"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Scanning status (ok / move on / on-going)</label>
                      <select
                        value={createDomainForm.scanning_date}
                        onChange={(e) => setCreateDomainForm((f) => ({ ...f, scanning_date: e.target.value }))}
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-[#6795BE]"
                      >
                        <option value="">—</option>
                        {SCANNING_OPTIONS.map((o) => (
                          <option key={o} value={o}>{SCANNING_LABELS[o] || o}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Plugin</label>
                    <select
                      value={createDomainForm.scanning_plugin}
                      onChange={(e) => setCreateDomainForm((f) => ({ ...f, scanning_plugin: e.target.value }))}
                      className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
                    >
                      <option value="">—</option>
                      {SCANNING_OPTIONS.map((o) => (
                        <option key={o} value={o}>{SCANNING_LABELS[o] || o}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">2FA</label>
                    <select
                      value={createDomainForm.scanning_2fa}
                      onChange={(e) => setCreateDomainForm((f) => ({ ...f, scanning_2fa: e.target.value }))}
                      className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
                    >
                      <option value="">—</option>
                      {SCANNING_OPTIONS.map((o) => (
                        <option key={o} value={o}>{SCANNING_LABELS[o] || o}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="flex gap-4">
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={createDomainForm.recaptcha}
                      onChange={(e) => setCreateDomainForm((f) => ({ ...f, recaptcha: e.target.checked }))}
                      className="rounded"
                    />
                    reCAPTCHA
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={createDomainForm.backup}
                      onChange={(e) => setCreateDomainForm((f) => ({ ...f, backup: e.target.checked }))}
                      className="rounded"
                    />
                    Backup
                  </label>
                </div>
                <div className="flex gap-2 pt-2">
                  <button
                    type="submit"
                    disabled={!isDomainFormValid()}
                    className="px-4 py-2 rounded-lg text-sm font-medium text-white disabled:cursor-not-allowed disabled:bg-gray-300 disabled:text-gray-600"
                    style={isDomainFormValid() ? { backgroundColor: PRIMARY } : {}}
                  >
                    Add Domain
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowCreateDomainModal(false)}
                    className="px-4 py-2 rounded-lg text-sm font-medium text-gray-700 bg-gray-100 hover:bg-red-50 hover:text-red-700 hover:border-red-200 border border-transparent"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          </div>
        </Modal>
      )}

      {/* Task Detail Modal (generic or WordPress Plugin Update) */}
      {selectedTask && (
        <Modal open={!!selectedTask} onClose={() => setSelectedTask(null)} zIndexClassName="z-[10000]">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-6xl max-h-[90vh] overflow-y-auto border border-gray-100 flex flex-col">
            <div className="p-6">
              <div className="flex justify-between items-start mb-4">
                <h2 className="text-lg font-semibold text-gray-900" style={{ color: PRIMARY }}>
                  {selectedTask.name}
                </h2>
                <button
                  type="button"
                  onClick={() => setSelectedTask(null)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  ✕
                </button>
              </div>

              {isWpPluginTask(selectedTask) ? (
                <>
                  {/* Top section: Date, Updated By, Status, New/Old Domain, Add domain */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4 p-4 bg-gray-50 rounded-lg">
                    <div>
                      <span className="text-xs font-medium text-gray-500">Date</span>
                      <p className="text-sm text-gray-900">
                        {selectedTask.created_at
                          ? new Date(selectedTask.created_at).toLocaleString()
                          : '—'}
                      </p>
                    </div>
                    <div>
                      <span className="text-xs font-medium text-gray-500">Updated By</span>
                      <p className="text-sm text-gray-900">{selectedTask.updated_by_name || '—'}</p>
                    </div>
                    <div>
                      <span className="text-xs font-medium text-gray-500">Status</span>
                      <p className="text-sm">
                        {canUpdateStatus(selectedTask) ? (
                          <select
                            value={selectedTask.status || 'to-do'}
                            onChange={(e) => handleStatusChange(selectedTask, e.target.value)}
                            className={`text-sm font-medium rounded ${getStatusColor(selectedTask.status || 'to-do')} border-0`}
                          >
                            {Object.entries(TASK_STATUSES).map(([k, v]) => (
                              <option key={k} value={k}>{v}</option>
                            ))}
                          </select>
                        ) : (
                          <span className={getStatusColor(selectedTask.status || 'to-do')}>
                            {TASK_STATUSES[selectedTask.status] || 'To Do'}
                          </span>
                        )}
                      </p>
                    </div>
                    <div>
                      <span className="text-xs font-medium text-gray-500">Domain Type</span>
                      <p className="text-sm text-gray-900">
                        {selectedTask.domain_migration === 'new'
                          ? 'New Domain'
                          : selectedTask.domain_migration === 'old'
                          ? 'Old Domain'
                          : '—'}
                      </p>
                    </div>
                  </div>
                  <div className="mb-4 flex flex-wrap items-center gap-2">
                    {permissions.canManageDomains(userRole) && (
                      <>
                        <span className="text-sm font-medium text-gray-700">Add domain from list:</span>
                        <select
                          className="rounded border border-gray-300 px-3 py-1.5 text-sm"
                          onChange={(e) => {
                            const id = e.target.value;
                            e.target.value = '';
                            if (!id) return;
                            const domain = domains.find((d) => d.id === id);
                            if (domain) handleAddDomainToWpTask(domain);
                          }}
                        >
                          <option value="">Select domain to add...</option>
                          {domains
                            .filter((d) => d.type === selectedTask.domain_migration)
                            .map((d) => (
                              <option key={d.id} value={d.id}>
                                {d.country} - {d.url}
                              </option>
                            ))}
                        </select>
                      </>
                    )}
                    {permissions.canCreateTasks(userRole) && (
                      <button
                        type="button"
                        onClick={() =>
                          setWpPluginRows((prev) => [
                            ...prev,
                            {
                              id: null,
                              domain_id: null,
                              country: '',
                              admin_url: '',
                              admin_username: '',
                              admin_password: '',
                              status: '',
                              plugin_names: '',
                              version_before: '',
                              version_after: '',
                              update_status: '',
                              post_update_check: '',
                              notes: '',
                            },
                          ])
                        }
                        className="px-3 py-1.5 text-sm font-medium text-white rounded-lg"
                        style={{ backgroundColor: PRIMARY }}
                      >
                        Add row
                      </button>
                    )}
                  </div>
                  {/* Table: Domain (Country), Admin URL, Admin Username and Password, Status, Plugin Names, Version Before/After, Update Status, Post-Update Check, Notes, Save */}
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Domain (Country)</th>
                          <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Admin URL</th>
                          <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Admin Username</th>
                          <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Password</th>
                          <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Status</th>
                          <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Plugin Names</th>
                          <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Version Before</th>
                          <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Version After</th>
                          <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Update Status</th>
                          <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Post-Update Check</th>
                          <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Notes</th>
                          <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Action</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {wpPluginRows.map((row, idx) => (
                          <tr key={row.id || `new-${idx}`} className="hover:bg-gray-50">
                            <td className="px-3 py-2">
                              <input
                                type="text"
                                value={row.country || ''}
                                onChange={(e) =>
                                  setWpPluginRows((prev) =>
                                    prev.map((r, i) =>
                                      i === idx ? { ...r, country: e.target.value } : r
                                    )
                                  )
                                }
                                className="w-24 rounded border border-gray-300 px-2 py-1 text-xs"
                                placeholder="Country"
                              />
                            </td>
                            <td className="px-3 py-2">
                              <input
                                type="text"
                                value={row.admin_url || ''}
                                onChange={(e) =>
                                  setWpPluginRows((prev) =>
                                    prev.map((r, i) =>
                                      i === idx ? { ...r, admin_url: e.target.value } : r
                                    )
                                  )
                                }
                                className="w-32 rounded border border-gray-300 px-2 py-1 text-xs"
                                placeholder="URL"
                              />
                            </td>
                            <td className="px-3 py-2">
                              <input
                                type="text"
                                value={row.admin_username || ''}
                                onChange={(e) =>
                                  setWpPluginRows((prev) =>
                                    prev.map((r, i) =>
                                      i === idx ? { ...r, admin_username: e.target.value } : r
                                    )
                                  )
                                }
                                className="w-24 rounded border border-gray-300 px-2 py-1 text-xs"
                              />
                            </td>
                            <td className="px-3 py-2">
                              <input
                                type="password"
                                value={row.admin_password || ''}
                                onChange={(e) =>
                                  setWpPluginRows((prev) =>
                                    prev.map((r, i) =>
                                      i === idx ? { ...r, admin_password: e.target.value } : r
                                    )
                                  )
                                }
                                className="w-24 rounded border border-gray-300 px-2 py-1 text-xs"
                              />
                            </td>
                            <td className="px-3 py-2">
                              <select
                                value={row.status || ''}
                                onChange={(e) =>
                                  setWpPluginRows((prev) =>
                                    prev.map((r, i) =>
                                      i === idx ? { ...r, status: e.target.value } : r
                                    )
                                  )
                                }
                                className="w-28 rounded border border-gray-300 px-2 py-1 text-xs"
                              >
                                <option value="">—</option>
                                {DOMAIN_ROW_STATUS_OPTIONS.map((o) => (
                                  <option key={o} value={o}>{o}</option>
                                ))}
                              </select>
                            </td>
                            <td className="px-3 py-2">
                              <input
                                type="text"
                                value={row.plugin_names || ''}
                                onChange={(e) =>
                                  setWpPluginRows((prev) =>
                                    prev.map((r, i) =>
                                      i === idx ? { ...r, plugin_names: e.target.value } : r
                                    )
                                  )
                                }
                                className="w-32 rounded border border-gray-300 px-2 py-1 text-xs"
                                placeholder="Plugin names"
                              />
                            </td>
                            <td className="px-3 py-2">
                              <input
                                type="text"
                                value={row.version_before || ''}
                                onChange={(e) =>
                                  setWpPluginRows((prev) =>
                                    prev.map((r, i) =>
                                      i === idx ? { ...r, version_before: e.target.value } : r
                                    )
                                  )
                                }
                                className="w-20 rounded border border-gray-300 px-2 py-1 text-xs"
                              />
                            </td>
                            <td className="px-3 py-2">
                              <input
                                type="text"
                                value={row.version_after || ''}
                                onChange={(e) =>
                                  setWpPluginRows((prev) =>
                                    prev.map((r, i) =>
                                      i === idx ? { ...r, version_after: e.target.value } : r
                                    )
                                  )
                                }
                                className="w-20 rounded border border-gray-300 px-2 py-1 text-xs"
                              />
                            </td>
                            <td className="px-3 py-2">
                              <select
                                value={row.update_status || ''}
                                onChange={(e) =>
                                  setWpPluginRows((prev) =>
                                    prev.map((r, i) =>
                                      i === idx ? { ...r, update_status: e.target.value } : r
                                    )
                                  )
                                }
                                className="w-24 rounded border border-gray-300 px-2 py-1 text-xs"
                              >
                                <option value="">—</option>
                                {UPDATE_STATUS_OPTIONS.map((o) => (
                                  <option key={o} value={o}>{o}</option>
                                ))}
                              </select>
                            </td>
                            <td className="px-3 py-2">
                              <select
                                value={row.post_update_check || ''}
                                onChange={(e) =>
                                  setWpPluginRows((prev) =>
                                    prev.map((r, i) =>
                                      i === idx ? { ...r, post_update_check: e.target.value } : r
                                    )
                                  )
                                }
                                className="w-24 rounded border border-gray-300 px-2 py-1 text-xs"
                              >
                                <option value="">—</option>
                                {POST_UPDATE_CHECK_OPTIONS.map((o) => (
                                  <option key={o} value={o}>{o}</option>
                                ))}
                              </select>
                            </td>
                            <td className="px-3 py-2">
                              <input
                                type="text"
                                value={row.notes || ''}
                                onChange={(e) =>
                                  setWpPluginRows((prev) =>
                                    prev.map((r, i) =>
                                      i === idx ? { ...r, notes: e.target.value } : r
                                    )
                                  )
                                }
                                className="w-24 rounded border border-gray-300 px-2 py-1 text-xs"
                                placeholder="Notes"
                              />
                            </td>
                            <td className="px-3 py-2">
                              <button
                                type="button"
                                onClick={() => handleSaveWpPluginRow(row)}
                                className="text-xs font-medium text-white px-2 py-1 rounded"
                                style={{ backgroundColor: PRIMARY }}
                              >
                                Save
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {wpPluginRows.length === 0 && (
                    <p className="text-sm text-gray-500 py-4">
                      No domain rows yet. Add a domain from the dropdown above or add rows manually in the table (add first row by selecting a domain).
                    </p>
                  )}
                </>
              ) : (
                <div className="space-y-2">
                  <p className="text-sm text-gray-600">
                    <span className="font-medium">Status:</span>{' '}
                    {canUpdateStatus(selectedTask) ? (
                      <select
                        value={selectedTask.status || 'to-do'}
                        onChange={(e) => handleStatusChange(selectedTask, e.target.value)}
                        className={`rounded ${getStatusColor(selectedTask.status || 'to-do')} border-0 text-sm`}
                      >
                        {Object.entries(TASK_STATUSES).map(([k, v]) => (
                          <option key={k} value={k}>{v}</option>
                        ))}
                      </select>
                    ) : (
                      TASK_STATUSES[selectedTask.status] || 'To Do'
                    )}
                  </p>
                  <p className="text-sm text-gray-600">
                    <span className="font-medium">Assigned To:</span>{' '}
                    {selectedTask.assigned_to_name || 'Unassigned'}
                  </p>
                  {permissions.canDeleteTasks(userRole) && (
                    <button
                      type="button"
                      onClick={() => handleDeleteTask(selectedTask)}
                      className="mt-2 px-3 py-1.5 text-sm font-medium text-red-700 bg-red-50 rounded-lg hover:bg-red-100"
                    >
                      Delete Task
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
