import { useEffect, useMemo, useState } from 'react';
import { useSupabase } from '../context/supabase.jsx';
import { toast } from 'react-hot-toast';

const PRIMARY = '#6795BE';
const UPDATE_STATUS_OPTIONS = ['Updated', 'Skipped', 'Failed'];
const POST_UPDATE_CHECK_OPTIONS = ['Ok', 'Issue Found'];
const DOMAIN_ROW_STATUS_OPTIONS = ['done', 'need verification', 'blocked access'];

export default function DomainUpdates() {
  const { supabase, user } = useSupabase();
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
    if (!domainId) return;
    setCreateUpdateForm((prev) => ({
      ...prev,
      domain_id: domainId,
    }));
  };

  const handleCreateUpdate = async (e) => {
    e.preventDefault();
    if (!createUpdateForm.domain_id) {
      toast.error('Select a domain.');
      return;
    }
    const domain = domainsById[createUpdateForm.domain_id];
    if (!domain) {
      toast.error('Selected domain not found.');
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
        plugin_names: (createUpdateForm.plugin_names || '').trim() || null,
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
    } catch (err) {
      console.error('Create domain update error:', err);
      toast.error(err?.message || 'Failed to add domain update row.');
    } finally {
      setSavingUpdate(false);
      setUpdatesLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="animate-spin rounded-full h-10 w-10 border-2 border-[#6795BE] border-t-transparent" aria-label="Loading" />
      </div>
    );
  }

  return (
    <div className="w-full space-y-4 sm:space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900" style={{ color: PRIMARY }}>
            Domain Updates
          </h1>
          <p className="mt-1 text-sm text-gray-600">
            View plugin update history for all old and new domains.
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 border-b border-gray-200 pb-3">
        <button
          type="button"
          onClick={() => {
            setDomainTypeFilter('old');
          }}
          className={`px-4 py-2 rounded-lg text-sm font-medium ${
            domainTypeFilter === 'old' ? 'text-white' : 'bg-gray-100 text-gray-700'
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
            domainTypeFilter === 'new' ? 'text-white' : 'bg-gray-100 text-gray-700'
          }`}
          style={domainTypeFilter === 'new' ? { backgroundColor: PRIMARY } : {}}
        >
          New Domains
        </button>
      </div>

      {/* Add new update row for a domain */}
      <form
        onSubmit={handleCreateUpdate}
        className="bg-white rounded-lg border border-gray-200 shadow-sm p-4 space-y-3"
      >
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[200px]">
            <label className="block text-xs font-medium text-gray-700 mb-1">Domain (no update yet)</label>
            <select
              value={createUpdateForm.domain_id}
              onChange={(e) => setCreateUpdateForm((f) => ({ ...f, domain_id: e.target.value }))}
              className="w-full rounded-lg border border-gray-300 px-2 py-1.5 text-xs focus:ring-2 focus:ring-[#6795BE]"
            >
              <option value="">Select domain…</option>
              {availableDomainsForNewUpdate.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.country || 'Unknown'}
                </option>
              ))}
            </select>
          </div>
          <div className="flex-1 min-w-[160px]">
            <label className="block text-xs font-medium text-gray-700 mb-1">Plugins updated</label>
            <input
              type="text"
              value={createUpdateForm.plugin_names}
              onChange={(e) => setCreateUpdateForm((f) => ({ ...f, plugin_names: e.target.value }))}
              className="w-full rounded-lg border border-gray-300 px-2 py-1.5 text-xs"
              placeholder="e.g. Yoast SEO, WPForms"
            />
          </div>
          <div className="flex-1 min-w-[120px]">
            <label className="block text-xs font-medium text-gray-700 mb-1">Version before</label>
            <input
              type="text"
              value={createUpdateForm.version_before}
              onChange={(e) => setCreateUpdateForm((f) => ({ ...f, version_before: e.target.value }))}
              className="w-full rounded-lg border border-gray-300 px-2 py-1.5 text-xs"
              placeholder="e.g. 6.4.2"
            />
          </div>
          <div className="flex-1 min-w-[120px]">
            <label className="block text-xs font-medium text-gray-700 mb-1">Version after</label>
            <input
              type="text"
              value={createUpdateForm.version_after}
              onChange={(e) => setCreateUpdateForm((f) => ({ ...f, version_after: e.target.value }))}
              className="w-full rounded-lg border border-gray-300 px-2 py-1.5 text-xs"
              placeholder="e.g. 6.4.3"
            />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="min-w-[140px]">
            <label className="block text-xs font-medium text-gray-700 mb-1">Update status</label>
            <select
              value={createUpdateForm.update_status}
              onChange={(e) => setCreateUpdateForm((f) => ({ ...f, update_status: e.target.value }))}
              className="w-full rounded-lg border border-gray-300 px-2 py-1.5 text-xs"
            >
              {UPDATE_STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
          <div className="min-w-[150px]">
            <label className="block text-xs font-medium text-gray-700 mb-1">Post-update check</label>
            <select
              value={createUpdateForm.post_update_check}
              onChange={(e) => setCreateUpdateForm((f) => ({ ...f, post_update_check: e.target.value }))}
              className="w-full rounded-lg border border-gray-300 px-2 py-1.5 text-xs"
            >
              {POST_UPDATE_CHECK_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
          {domainTypeFilter === 'new' && (
            <div className="min-w-[160px]">
              <label className="block text-xs font-medium text-gray-700 mb-1">Row Status</label>
              <select
                value={createUpdateForm.status}
                onChange={(e) => setCreateUpdateForm((f) => ({ ...f, status: e.target.value }))}
                className="w-full rounded-lg border border-gray-300 px-2 py-1.5 text-xs"
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
          <div className="w-full sm:w-72">
            <label className="block text-xs font-medium text-gray-700 mb-1">Notes (optional)</label>
            <input
              type="text"
              value={createUpdateForm.notes}
              onChange={(e) => setCreateUpdateForm((f) => ({ ...f, notes: e.target.value }))}
              className="w-full rounded-lg border border-gray-300 px-2 py-1.5 text-xs"
              placeholder="Remarks, issues, etc."
            />
          </div>
          <div className="flex items-end ml-auto">
            <button
              type="submit"
              disabled={savingUpdate}
              className="px-4 py-2 rounded-lg text-xs font-medium text-white disabled:opacity-50"
              style={{ backgroundColor: PRIMARY }}
            >
              {savingUpdate ? 'Saving…' : 'Add update'}
            </button>
          </div>
        </div>
      </form>

      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          {updatesLoading ? (
            <div className="py-8 text-center text-sm text-gray-500">Loading domain updates…</div>
          ) : updatesForView.length === 0 ? (
            <div className="py-8 text-center text-sm text-gray-500">
              No plugin update rows yet for these {domainTypeFilter} domains.
            </div>
          ) : (
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Domain</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Plugins</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Version Before</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Version After</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Update Status</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Post-Update Check</th>
                  {domainTypeFilter === 'new' && (
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Row Status</th>
                  )}
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Notes</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Updated At</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
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
                        <tr key={item.key} className="bg-gray-50">
                          <td className="px-4 py-3 text-sm font-semibold text-gray-900 uppercase tracking-wide">
                            {item.label}
                          </td>
                          <td
                            className="px-4 py-3 text-xs text-gray-500"
                            colSpan={domainTypeFilter === 'new' ? 8 : 7}
                          >
                            <div className="flex items-center justify-between gap-3">
                              <span>Plugin updates for this domain</span>
                              {item.domainId && (
                                <button
                                  type="button"
                                  onClick={() => handleQuickAddForDomain(item.domainId)}
                                  className="inline-flex items-center rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 shadow-sm hover:bg-gray-50"
                                >
                                  Add plugin
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    }

                    const row = item.row;
                    return (
                      <tr key={item.key} className="hover:bg-gray-50">
                        <td className="px-4 py-3 text-sm text-gray-900" />
                        <td className="px-4 py-3 text-sm text-gray-600 break-words">
                          {row.plugin_names || '—'}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600">{row.version_before || '—'}</td>
                        <td className="px-4 py-3 text-sm text-gray-600">{row.version_after || '—'}</td>
                        <td className="px-4 py-3 text-sm text-gray-600">{row.update_status || '—'}</td>
                        <td className="px-4 py-3 text-sm text-gray-600">{row.post_update_check || '—'}</td>
                        {domainTypeFilter === 'new' && (
                          <td className="px-4 py-3 text-sm text-gray-600">{row.status || '—'}</td>
                        )}
                        <td className="px-4 py-3 text-sm text-gray-600 max-w-xs">
                          {row.notes ? (
                            <span className="line-clamp-2" title={row.notes}>
                              {row.notes}
                            </span>
                          ) : (
                            '—'
                          )}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600">
                          {row.updated_at
                            ? new Date(row.updated_at).toLocaleString()
                            : row.created_at
                            ? new Date(row.created_at).toLocaleString()
                            : '—'}
                        </td>
                      </tr>
                    );
                  });
                })()}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

