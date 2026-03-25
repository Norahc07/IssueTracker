import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useSupabase } from '../context/supabase.jsx';
import { toast } from 'react-hot-toast';

const PRIMARY = '#6795BE';
const UPDATE_STATUS_OPTIONS = ['Updated', 'Skipped', 'Failed'];
const POST_UPDATE_CHECK_OPTIONS = ['Ok', 'Issue Found'];
const DOMAIN_ROW_STATUS_OPTIONS = ['done', 'need verification', 'blocked access'];

export default function DomainUpdates() {
  const { supabase, user, userRole, userTeam } = useSupabase();
  const [domains, setDomains] = useState([]);
  const [updates, setUpdates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [myDisplayName, setMyDisplayName] = useState('');
  const [updatesLoading, setUpdatesLoading] = useState(false);
  const [domainTypeFilter, setDomainTypeFilter] = useState('old'); // 'old' | 'new'
  const [createUpdateForm, setCreateUpdateForm] = useState({
    domain_id: '',
    plugin_names: '',
    version_before: '',
    version_after: '',
    update_status: 'Updated',
    post_update_check: 'Ok',
    status: '',
    notes: '',
  });
  const [savingUpdate, setSavingUpdate] = useState(false);
  const [showAddUpdateModal, setShowAddUpdateModal] = useState(false);
  const isAdmin = userRole === 'admin';
  const isTlaTeam = String(userTeam || '').toLowerCase().includes('tla') || String(userTeam || '').toLowerCase().includes('team lead assistant');
  const canAddDomainUpdate =
    userRole === 'admin' ||
    userRole === 'tla' ||
    ((userRole === 'intern' || userRole === 'tl' || userRole === 'vtl') && isTlaTeam);

  const canEditDomainUpdate = canAddDomainUpdate;

  // Edit drawer (slider) state
  const [editRow, setEditRow] = useState(null);
  const [editSaving, setEditSaving] = useState(false);
  const [editForm, setEditForm] = useState({
    plugin_names: '',
    version_before: '',
    version_after: '',
    update_status: 'Updated',
    post_update_check: 'Ok',
    status: '',
    notes: '',
  });
  const [editDrawerOpen, setEditDrawerOpen] = useState(false);

  // After successfully adding one plugin update row, ask whether the user wants to add another
  // update row for the same domain.
  const [addAnotherPromptOpen, setAddAnotherPromptOpen] = useState(false);
  const [promptDomainId, setPromptDomainId] = useState('');

  useEffect(() => {
    if (!user?.id) return;
    supabase.from('users').select('full_name').eq('id', user.id).maybeSingle().then(({ data }) => {
      setMyDisplayName(data?.full_name || user?.email || '');
    });
  }, [user?.id, supabase]);

  useEffect(() => {
    const fetchDomainsAndUpdates = async () => {
      try {
        setLoading(true);
        const [{ data: domainsData, error: domainsError }, { data: updatesData, error: updatesError }] =
          await Promise.all([
            supabase.from('domains').select('*').order('country', { ascending: true }),
            supabase.from('task_plugin_update_rows').select('*').order('created_at', { ascending: false }),
          ]);

        if (domainsError) {
          console.warn('DomainUpdates: domains error', domainsError);
          toast.error('Could not load domains. Run task_domains_migration.sql in Supabase.');
          setDomains([]);
        } else {
          setDomains(Array.isArray(domainsData) ? domainsData : []);
        }

        if (updatesError) {
          console.warn('DomainUpdates: task_plugin_update_rows error', updatesError);
          toast.error('Could not load domain plugin updates. Run task_domains_migration.sql in Supabase.');
          setUpdates([]);
        } else {
          setUpdates(Array.isArray(updatesData) ? updatesData : []);
        }
      } catch (err) {
        console.error('DomainUpdates fetch error:', err);
        toast.error('Failed to load domains or plugin updates.');
        setDomains([]);
        setUpdates([]);
      } finally {
        setLoading(false);
        setUpdatesLoading(false);
      }
    };

    fetchDomainsAndUpdates();
  }, [supabase]);

  const domainsById = useMemo(() => {
    const map = {};
    domains.forEach((d) => {
      if (d?.id) map[d.id] = d;
    });
    return map;
  }, [domains]);

  const filteredDomains = useMemo(
    () => domains.filter((d) => d.type === domainTypeFilter),
    [domains, domainTypeFilter]
  );

  const updatesForView = useMemo(() => {
    if (!updates.length) return [];
    const idsForType = new Set(filteredDomains.map((d) => d.id));
    return updates.filter((row) => {
      if (!row?.domain_id) return false;
      if (!idsForType.has(row.domain_id)) return false;
      return true;
    });
  }, [updates, filteredDomains]);

  const domainsWithUpdates = useMemo(() => {
    const set = new Set();
    updates.forEach((row) => {
      if (row?.domain_id) set.add(row.domain_id);
    });
    return set;
  }, [updates]);

  const availableDomainsForNewUpdate = useMemo(
    () => filteredDomains.filter((d) => !domainsWithUpdates.has(d.id)),
    [filteredDomains, domainsWithUpdates]
  );

  const handleQuickAddForDomain = (domainId) => {
    if (!canAddDomainUpdate) return;
    if (!domainId) return;
    setCreateUpdateForm((prev) => ({
      ...prev,
      domain_id: domainId,
    }));
    setShowAddUpdateModal(true);
  };

  const closeAddUpdateModal = () => {
    setShowAddUpdateModal(false);
    setAddAnotherPromptOpen(false);
    setPromptDomainId('');
    setCreateUpdateForm({
      domain_id: '',
      plugin_names: '',
      version_before: '',
      version_after: '',
      update_status: 'Updated',
      post_update_check: 'Ok',
      status: '',
      notes: '',
    });
  };

  const handleCreateUpdate = async (e) => {
    e.preventDefault();
    if (!canAddDomainUpdate) {
      toast.error('You do not have permission to add domain updates.');
      return;
    }
    if (!createUpdateForm.domain_id) {
      toast.error('Select a domain.');
      return;
    }
    const domain = domainsById[createUpdateForm.domain_id];
    if (!domain) {
      toast.error('Selected domain not found.');
      return;
    }
    const pluginNames = String(createUpdateForm.plugin_names || '').trim();
    if (!pluginNames) {
      toast.error('Enter a plugin name.');
      return;
    }
    if (pluginNames.includes(',')) {
      toast.error('Enter one plugin at a time. Use "Add another" after saving to add more plugins.');
      return;
    }
    try {
      setSavingUpdate(true);
      const payload = {
        task_id: null,
        domain_id: createUpdateForm.domain_id,
        country: domain.country || null,
        admin_url: domain.url || null,
        admin_username: null,
        admin_password: null,
        plugin_names: pluginNames || null,
        version_before: (createUpdateForm.version_before || '').trim() || null,
        version_after: (createUpdateForm.version_after || '').trim() || null,
        update_status: createUpdateForm.update_status || null,
        post_update_check: createUpdateForm.post_update_check || null,
        status: domainTypeFilter === 'new' ? (createUpdateForm.status || null) : null,
        notes: (createUpdateForm.notes || '').trim() || null,
        updated_by: user?.id || null,
        updated_by_name: (myDisplayName || user?.email || '').trim() || null,
      };
      const { error } = await supabase.from('task_plugin_update_rows').insert(payload);
      if (error) throw error;
      // Sync update_status and post_update_check to domain_claims for this domain (if claimed)
      await supabase
        .from('domain_claims')
        .update({
          update_status: payload.update_status ?? null,
          post_update_check: payload.post_update_check ?? null,
          updated_at: new Date().toISOString(),
        })
        .eq('domain_id', createUpdateForm.domain_id);
      toast.success('Domain update row added.');
      // Refresh updates
      setUpdatesLoading(true);
      const { data: updatesData, error: updatesError } = await supabase
        .from('task_plugin_update_rows')
        .select('*')
        .order('created_at', { ascending: false });
      if (!updatesError && Array.isArray(updatesData)) {
        setUpdates(updatesData);
      }
      // Keep modal open and keep the selected domain, so user can add another plugin update row
      const domainId = createUpdateForm.domain_id;
      setCreateUpdateForm((prev) => ({
        ...prev,
        domain_id: domainId,
        plugin_names: '',
        version_before: '',
        version_after: '',
        update_status: 'Updated',
        post_update_check: 'Ok',
        status: '',
        notes: '',
      }));
      setPromptDomainId(domainId);
      setAddAnotherPromptOpen(true);
    } catch (err) {
      console.error('Create domain update error:', err);
      toast.error(err?.message || 'Failed to add domain update row.');
    } finally {
      setSavingUpdate(false);
      setUpdatesLoading(false);
    }
  };

  const handleRemoveAllUpdatesForDomain = async (domainId) => {
    if (!isAdmin) return;
    if (!domainId) return;
    // eslint-disable-next-line no-alert
    const ok = window.confirm('Remove ALL plugin updates for this domain and reset it back to start?');
    if (!ok) return;
    try {
      setUpdatesLoading(true);
      const { error } = await supabase.from('task_plugin_update_rows').delete().eq('domain_id', domainId);
      if (error) throw error;

      // Sync reset to domain_claims for this domain (if claimed)
      await supabase
        .from('domain_claims')
        .update({
          update_status: null,
          post_update_check: null,
          updated_at: new Date().toISOString(),
        })
        .eq('domain_id', domainId);

      // Refresh updates list
      const { data: updatesData, error: updatesError } = await supabase
        .from('task_plugin_update_rows')
        .select('*')
        .order('created_at', { ascending: false });
      if (updatesError) throw updatesError;
      setUpdates(Array.isArray(updatesData) ? updatesData : []);
      toast.success('Domain updates removed');
    } catch (err) {
      console.error('Remove domain updates error:', err);
      toast.error(err?.message || 'Failed to remove domain updates');
    } finally {
      setUpdatesLoading(false);
    }
  };

  const closeEditDrawer = () => {
    setEditDrawerOpen(false);
    setEditRow(null);
    setEditSaving(false);
    setEditForm({
      plugin_names: '',
      version_before: '',
      version_after: '',
      update_status: 'Updated',
      post_update_check: 'Ok',
      status: '',
      notes: '',
    });
  };

  const openEditDrawerForRow = (row) => {
    if (!canEditDomainUpdate || !row) return;
    setEditRow(row);
    setEditForm({
      plugin_names: row.plugin_names || '',
      version_before: row.version_before || '',
      version_after: row.version_after || '',
      update_status: row.update_status || 'Updated',
      post_update_check: row.post_update_check || 'Ok',
      status: row.status || '',
      notes: row.notes || '',
    });
    setEditDrawerOpen(true);
  };

  const handleSaveEditRow = async (e) => {
    e.preventDefault();
    if (!canEditDomainUpdate) {
      toast.error('You do not have permission to edit domain updates.');
      return;
    }
    if (!editRow?.id) return;
    const domainId = editRow.domain_id;
    if (!domainId) return;

    const pluginNames = String(editForm.plugin_names || '').trim();
    if (!pluginNames) {
      toast.error('Enter plugin name.');
      return;
    }

    const domain = domainsById[domainId] || {};
    const domainType = String(domain?.type || '').toLowerCase();
    const isNew = domainType === 'new';

    setEditSaving(true);
    try {
      const payload = {
        plugin_names: pluginNames,
        version_before: String(editForm.version_before || '').trim() || null,
        version_after: String(editForm.version_after || '').trim() || null,
        update_status: editForm.update_status || null,
        post_update_check: editForm.post_update_check || null,
        status: isNew ? (editForm.status || null) : null,
        notes: String(editForm.notes || '').trim() || null,
        updated_by: user?.id || null,
        updated_by_name: (myDisplayName || user?.email || '').trim() || null,
      };

      const { error } = await supabase.from('task_plugin_update_rows').update(payload).eq('id', editRow.id);
      if (error) throw error;

      // Sync update_status and post_update_check to domain_claims (if claimed)
      await supabase
        .from('domain_claims')
        .update({
          update_status: payload.update_status ?? null,
          post_update_check: payload.post_update_check ?? null,
          updated_at: new Date().toISOString(),
        })
        .eq('domain_id', domainId);

      // Refresh updates list
      setUpdatesLoading(true);
      const { data: updatesData, error: updatesError } = await supabase
        .from('task_plugin_update_rows')
        .select('*')
        .order('created_at', { ascending: false });
      if (!updatesError && Array.isArray(updatesData)) setUpdates(updatesData);

      toast.success('Update saved.');
      closeEditDrawer();
    } catch (err) {
      console.error('Save edit row error:', err);
      toast.error(err?.message || 'Failed to save update.');
    } finally {
      setEditSaving(false);
      setUpdatesLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-10">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-[#6795BE] border-t-transparent" aria-label="Loading" />
      </div>
    );
  }

  return (
    <div className="w-full">
      <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-800 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setDomainTypeFilter('old');
            }}
            className={`px-4 py-2 rounded-lg text-sm font-medium ${
              domainTypeFilter === 'old' ? 'text-white' : 'bg-gray-100 dark:bg-gray-950/40 text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-800'
            }`}
            style={domainTypeFilter === 'old' ? { backgroundColor: PRIMARY } : {}}
          >
            Old Domains
          </button>
          <button
            type="button"
            onClick={() => {
              setDomainTypeFilter('new');
            }}
            className={`px-4 py-2 rounded-lg text-sm font-medium ${
              domainTypeFilter === 'new' ? 'text-white' : 'bg-gray-100 dark:bg-gray-950/40 text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-800'
            }`}
            style={domainTypeFilter === 'new' ? { backgroundColor: PRIMARY } : {}}
          >
            New Domains
          </button>
        </div>
        {canAddDomainUpdate && (
          <button
            type="button"
            onClick={() => setShowAddUpdateModal(true)}
            className="px-4 py-2 rounded-lg text-sm font-medium text-white"
            style={{ backgroundColor: PRIMARY }}
          >
            Add update
          </button>
        )}
      </div>

      {/* Add update modal */}
      {showAddUpdateModal && canAddDomainUpdate && (
        <div
          className="fixed inset-0 z-[9999] bg-black/60 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget && !savingUpdate) closeAddUpdateModal();
          }}
        >
          <div className="min-h-[100dvh] w-full p-4 flex items-center justify-center">
            <div className="bg-white dark:bg-gray-900 rounded-xl shadow-xl w-full max-w-lg border border-gray-200 dark:border-gray-800 max-h-[90vh] overflow-y-auto">
              <div className="p-5 border-b border-gray-200 dark:border-gray-800">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100" style={{ color: PRIMARY }}>
                  Add domain update
                </h3>
              </div>
              <form
                onSubmit={handleCreateUpdate}
                className="p-5 space-y-4"
              >
            <div>
              {createUpdateForm.domain_id ? (
                <>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">Domain</label>
                  <div className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-950 px-3 py-2 text-sm text-gray-800 dark:text-gray-100">
                    {(domainsById[createUpdateForm.domain_id]?.country || 'Unknown') + ''}
                  </div>
                </>
              ) : (
                <>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">
                    Domain (no update yet)
                  </label>
                  <select
                    value={createUpdateForm.domain_id}
                    onChange={(e) => setCreateUpdateForm((f) => ({ ...f, domain_id: e.target.value }))}
                    className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-950 text-gray-900 dark:text-gray-100 px-3 py-2 text-sm focus:ring-2 focus:ring-[#6795BE] focus:border-transparent"
                  >
                    <option value="">Select domain…</option>
                    {availableDomainsForNewUpdate.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.country || 'Unknown'}
                      </option>
                    ))}
                  </select>
                </>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">
                Plugin name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={createUpdateForm.plugin_names}
                onChange={(e) => setCreateUpdateForm((f) => ({ ...f, plugin_names: e.target.value }))}
                className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-950 text-gray-900 dark:text-gray-100 px-3 py-2 text-sm placeholder-gray-400 dark:placeholder-gray-500"
                placeholder="e.g. Yoast SEO"
              />
              <p className="mt-1 text-[12px] text-gray-500 dark:text-gray-400">
                Enter one plugin at a time. To add more plugins for the same domain, use <span className="font-medium">Add another</span> after saving.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">Version before</label>
                <input
                  type="text"
                  value={createUpdateForm.version_before}
                  onChange={(e) => setCreateUpdateForm((f) => ({ ...f, version_before: e.target.value }))}
                  className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-950 text-gray-900 dark:text-gray-100 px-3 py-2 text-sm placeholder-gray-400 dark:placeholder-gray-500"
                  placeholder="e.g. 6.4.2"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">Version after</label>
                <input
                  type="text"
                  value={createUpdateForm.version_after}
                  onChange={(e) => setCreateUpdateForm((f) => ({ ...f, version_after: e.target.value }))}
                  className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-950 text-gray-900 dark:text-gray-100 px-3 py-2 text-sm placeholder-gray-400 dark:placeholder-gray-500"
                  placeholder="e.g. 6.4.3"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">Update status</label>
                <select
                  value={createUpdateForm.update_status}
                  onChange={(e) => setCreateUpdateForm((f) => ({ ...f, update_status: e.target.value }))}
                  className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-950 text-gray-900 dark:text-gray-100 px-3 py-2 text-sm"
                >
                  {UPDATE_STATUS_OPTIONS.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">Post-update check</label>
                <select
                  value={createUpdateForm.post_update_check}
                  onChange={(e) => setCreateUpdateForm((f) => ({ ...f, post_update_check: e.target.value }))}
                  className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-950 text-gray-900 dark:text-gray-100 px-3 py-2 text-sm"
                >
                  {POST_UPDATE_CHECK_OPTIONS.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            {domainTypeFilter === 'new' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">Row Status</label>
                <select
                  value={createUpdateForm.status}
                  onChange={(e) => setCreateUpdateForm((f) => ({ ...f, status: e.target.value }))}
                  className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-950 text-gray-900 dark:text-gray-100 px-3 py-2 text-sm"
                >
                  <option value="">—</option>
                  {DOMAIN_ROW_STATUS_OPTIONS.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">Notes (optional)</label>
              <input
                type="text"
                value={createUpdateForm.notes}
                onChange={(e) => setCreateUpdateForm((f) => ({ ...f, notes: e.target.value }))}
                className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-950 text-gray-900 dark:text-gray-100 px-3 py-2 text-sm placeholder-gray-400 dark:placeholder-gray-500"
                placeholder="Remarks, issues, etc."
              />
            </div>
            <div className="flex justify-end gap-2 pt-2 border-t border-gray-100 dark:border-gray-800">
              <button
                type="button"
                onClick={closeAddUpdateModal}
                disabled={savingUpdate}
                className="px-4 py-2 rounded-lg text-sm font-medium text-gray-700 dark:text-gray-200 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={savingUpdate}
                className="px-4 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-50"
                style={{ backgroundColor: PRIMARY }}
              >
                {savingUpdate ? 'Saving…' : 'Add update'}
              </button>
            </div>
          </form>

            {addAnotherPromptOpen && (
              <div className="fixed inset-0 z-[10001] bg-black/40 backdrop-blur-sm flex items-center justify-center px-4">
                <div className="w-full max-w-md rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-5 shadow-2xl">
                  <h4 className="text-base font-semibold text-gray-900 dark:text-gray-100">
                    Add another plugin update?
                  </h4>
                  <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
                    You added one plugin update for this domain. Do you want to add another plugin update for the same domain, or finish?
                  </p>
                  <div className="mt-4 flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setAddAnotherPromptOpen(false);
                        setPromptDomainId('');
                      }}
                      className="px-4 py-2 rounded-lg text-sm font-medium text-gray-700 dark:text-gray-200 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700"
                    >
                      Add another
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        closeAddUpdateModal();
                      }}
                      className="px-4 py-2 rounded-lg text-sm font-medium text-white"
                      style={{ backgroundColor: PRIMARY }}
                    >
                      Done
                    </button>
                  </div>
                </div>
              </div>
            )}
            </div>
          </div>
        </div>
      )}

      <div className="overflow-x-auto">
          {updatesLoading ? (
            <div className="py-8 text-center text-sm text-gray-500 dark:text-gray-400">Loading domain updates…</div>
          ) : updatesForView.length === 0 ? (
            <div className="py-8 text-center text-sm text-gray-500 dark:text-gray-400">
              No plugin update rows yet for these {domainTypeFilter} domains.
            </div>
          ) : (
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-800">
              <thead className="bg-gray-50 dark:bg-gray-950/40">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Domain</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Plugins</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Version Before</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Version After</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Update Status</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Post-Update Check</th>
                  {domainTypeFilter === 'new' && (
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Row Status</th>
                  )}
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Notes</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Updated At</th>
                  {canEditDomainUpdate && (
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Actions</th>
                  )}
                </tr>
              </thead>
              <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-800">
                {(() => {
                  // Group updates by domain so each country/domain has a header row
                  const groups = new Map();
                  updatesForView.forEach((row) => {
                    const d = domainsById[row.domain_id] || {};
                    const label = d.country || row.country || 'Unknown';
                    const key = row.domain_id || label;
                    if (!groups.has(key)) {
                      groups.set(key, { label, rows: [], domainId: row.domain_id });
                    }
                    groups.get(key).rows.push(row);
                  });

                  const flatRows = [];
                  groups.forEach((group, key) => {
                    flatRows.push({ kind: 'header', key, label: group.label, domainId: group.domainId });
                    group.rows.forEach((row) => {
                      flatRows.push({ kind: 'row', key: row.id, row });
                    });
                  });

                  return flatRows.map((item) => {
                    if (item.kind === 'header') {
                      return (
                        <tr key={item.key} className="bg-gray-50 dark:bg-gray-950/40">
                          <td className="px-4 py-3 text-sm font-semibold text-gray-900 dark:text-gray-100 uppercase tracking-wide">
                            {item.label}
                          </td>
                          <td
                            className="px-4 py-3 text-xs text-gray-500 dark:text-gray-400"
                            colSpan={(domainTypeFilter === 'new' ? 8 : 7) + (canEditDomainUpdate ? 1 : 0)}
                          >
                            <div className="flex items-center justify-between gap-3">
                              <span>Plugin updates for this domain</span>
                              {canAddDomainUpdate && item.domainId && (
                                <div className="flex items-center gap-2">
                                  <button
                                    type="button"
                                    onClick={() => handleQuickAddForDomain(item.domainId)}
                                    className="inline-flex items-center rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-1.5 text-xs font-medium text-gray-700 dark:text-gray-200 shadow-sm hover:bg-gray-50 dark:hover:bg-gray-800"
                                  >
                                    Add plugin
                                  </button>
                                  {isAdmin && (
                                    <button
                                      type="button"
                                      onClick={() => handleRemoveAllUpdatesForDomain(item.domainId)}
                                      className="inline-flex items-center rounded-md border border-red-200 dark:border-red-900/50 bg-white dark:bg-gray-900 px-3 py-1.5 text-xs font-medium text-red-700 dark:text-red-300 shadow-sm hover:bg-red-50 dark:hover:bg-red-950/30"
                                    >
                                      Remove updates
                                    </button>
                                  )}
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    }

                    const row = item.row;
                    return (
                      <tr key={item.key} className="hover:bg-gray-50 dark:hover:bg-gray-800/60">
                        <td className="px-4 py-3 text-sm text-gray-900" />
                        <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-300 break-words">
                          {row.plugin_names || '—'}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-300">{row.version_before || '—'}</td>
                        <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-300">{row.version_after || '—'}</td>
                        <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-300">{row.update_status || '—'}</td>
                        <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-300">{row.post_update_check || '—'}</td>
                        {domainTypeFilter === 'new' && (
                          <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-300">{row.status || '—'}</td>
                        )}
                        <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-300 max-w-xs">
                          {row.notes ? (
                            <span className="line-clamp-2" title={row.notes}>
                              {row.notes}
                            </span>
                          ) : (
                            '—'
                          )}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-300">
                          {row.updated_at
                            ? new Date(row.updated_at).toLocaleString()
                            : row.created_at
                            ? new Date(row.created_at).toLocaleString()
                            : '—'}
                        </td>
                        {canEditDomainUpdate && (
                          <td className="px-4 py-3 text-sm">
                            <button
                              type="button"
                              onClick={() => openEditDrawerForRow(row)}
                              className="px-3 py-1.5 rounded-lg text-xs font-medium border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800"
                            >
                              Edit
                            </button>
                          </td>
                        )}
                      </tr>
                    );
                  });
                })()}
              </tbody>
            </table>
          )}
      </div>

      {/* Edit update drawer (slider) */}
      {editDrawerOpen &&
        createPortal(
          <div
            className="fixed inset-0 z-[10000] bg-black/20 backdrop-blur-sm flex justify-end"
            role="dialog"
            aria-modal="true"
            onMouseDown={(e) => {
              if (e.target === e.currentTarget) closeEditDrawer();
            }}
          >
            <div
              className="h-screen w-full max-w-md bg-white dark:bg-gray-900 shadow-2xl border-l border-gray-200 dark:border-gray-800 flex flex-col"
              onMouseDown={(e) => e.stopPropagation()}
            >
              <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-800 flex items-start justify-between gap-3">
                <div>
                  <h4 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Edit domain update</h4>
                  <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
                    {editRow?.country ? `Country: ${editRow.country}` : 'Update details'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={closeEditDrawer}
                  className="px-3 py-1.5 rounded-lg text-xs bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-700"
                >
                  Close
                </button>
              </div>

              <form onSubmit={handleSaveEditRow} className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">
                    Plugin name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={editForm.plugin_names}
                    onChange={(e) => setEditForm((f) => ({ ...f, plugin_names: e.target.value }))}
                    className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-950 text-gray-900 dark:text-gray-100 px-3 py-2 text-sm"
                    placeholder="e.g. Yoast SEO"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">Version before</label>
                    <input
                      type="text"
                      value={editForm.version_before}
                      onChange={(e) => setEditForm((f) => ({ ...f, version_before: e.target.value }))}
                      className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-950 text-gray-900 dark:text-gray-100 px-3 py-2 text-sm"
                      placeholder="e.g. 6.4.2"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">Version after</label>
                    <input
                      type="text"
                      value={editForm.version_after}
                      onChange={(e) => setEditForm((f) => ({ ...f, version_after: e.target.value }))}
                      className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-950 text-gray-900 dark:text-gray-100 px-3 py-2 text-sm"
                      placeholder="e.g. 6.4.3"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">Update status</label>
                    <select
                      value={editForm.update_status}
                      onChange={(e) => setEditForm((f) => ({ ...f, update_status: e.target.value }))}
                      className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-950 text-gray-900 dark:text-gray-100 px-3 py-2 text-sm"
                    >
                      {UPDATE_STATUS_OPTIONS.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">Post-update check</label>
                    <select
                      value={editForm.post_update_check}
                      onChange={(e) => setEditForm((f) => ({ ...f, post_update_check: e.target.value }))}
                      className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-950 text-gray-900 dark:text-gray-100 px-3 py-2 text-sm"
                    >
                      {POST_UPDATE_CHECK_OPTIONS.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Row Status is only used for new domains */}
                {(() => {
                  const domain = domainsById[editRow?.domain_id];
                  const isNew = String(domain?.type || '').toLowerCase() === 'new';
                  if (!isNew) return null;
                  return (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">Row Status</label>
                      <select
                        value={editForm.status}
                        onChange={(e) => setEditForm((f) => ({ ...f, status: e.target.value }))}
                        className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-950 text-gray-900 dark:text-gray-100 px-3 py-2 text-sm"
                      >
                        <option value="">—</option>
                        {DOMAIN_ROW_STATUS_OPTIONS.map((s) => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ))}
                      </select>
                    </div>
                  );
                })()}

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">Notes (optional)</label>
                  <input
                    type="text"
                    value={editForm.notes}
                    onChange={(e) => setEditForm((f) => ({ ...f, notes: e.target.value }))}
                    className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-950 text-gray-900 dark:text-gray-100 px-3 py-2 text-sm"
                    placeholder="Remarks, issues, etc."
                  />
                </div>

                <div className="pt-2 flex items-center justify-end gap-2 border-t border-gray-200 dark:border-gray-800">
                  <button
                    type="button"
                    onClick={closeEditDrawer}
                    className="px-4 py-2 rounded-lg text-xs font-medium bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-700"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={editSaving}
                    className="px-4 py-2 rounded-lg text-xs font-medium text-white disabled:opacity-60"
                    style={{ backgroundColor: PRIMARY }}
                  >
                    {editSaving ? 'Saving…' : 'Save'}
                  </button>
                </div>
              </form>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}

