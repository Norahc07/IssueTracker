// In-app notifications helper (Supabase: public.notifications)

export async function getUserIdsByRoles(supabase, roles = []) {
  if (!supabase || !Array.isArray(roles) || roles.length === 0) return [];
  const { data, error } = await supabase.from('users').select('id').in('role', roles);
  if (error) throw error;
  return (Array.isArray(data) ? data : []).map((r) => r.id).filter(Boolean);
}

export async function createNotifications(supabase, rows = []) {
  if (!supabase || !Array.isArray(rows) || rows.length === 0) return;
  const payload = rows
    .filter(Boolean)
    .map((r) => ({
      recipient_user_id: r.recipient_user_id,
      sender_user_id: r.sender_user_id ?? null,
      type: r.type || 'general',
      title: r.title || 'Notification',
      body: r.body ?? null,
      context_date: r.context_date ?? null,
      metadata: r.metadata ?? {},
    }))
    .filter((r) => !!r.recipient_user_id);
  if (payload.length === 0) return;
  const { error } = await supabase.from('notifications').insert(payload);
  if (error) throw error;
}

export async function notifyUser(supabase, { recipient_user_id, sender_user_id, type, title, body, context_date, metadata }) {
  return createNotifications(supabase, [{ recipient_user_id, sender_user_id, type, title, body, context_date, metadata }]);
}

// Notification scopes (based on team responsibilities)
// - 'tla': Admin + anyone in TLA team (incl. role='tla')
// - 'monitoring': Admin + anyone in Monitoring team (incl. role='monitoring_team')
// - 'pat1': Admin + anyone in PAT1 team (incl. role='pat1')
export async function getUserIdsByScope(supabase, scope) {
  if (!supabase || !scope) return [];
  const { data, error } = await supabase.from('users').select('id, role, team');
  if (error) throw error;
  const list = Array.isArray(data) ? data : [];
  const s = String(scope).toLowerCase();
  const ids = new Set();
  list.forEach((u) => {
    if (!u?.id) return;
    const role = String(u.role || '').toLowerCase();
    const team = String(u.team || '').toLowerCase();
    if (role === 'admin') ids.add(u.id);
    if (s === 'tla') {
      if (team === 'tla' || role === 'tla') ids.add(u.id);
    } else if (s === 'monitoring') {
      if (team === 'monitoring' || role === 'monitoring_team') ids.add(u.id);
    } else if (s === 'pat1') {
      if (team === 'pat1' || role === 'pat1') ids.add(u.id);
    }
  });
  return Array.from(ids);
}

export function scopeFromDepartment(department) {
  const v = String(department || '').toLowerCase();
  if (v.includes('monitoring')) return 'monitoring';
  if (v.includes('pat1') || v.includes('pat 1')) return 'pat1';
  if (v.includes('team lead assistant') || v.includes('tla')) return 'tla';
  return '';
}

export function scopeFromUserProfile(profile) {
  const role = String(profile?.role || '').toLowerCase();
  const team = String(profile?.team || '').toLowerCase();
  if (team === 'monitoring' || role === 'monitoring_team') return 'monitoring';
  if (team === 'pat1' || role === 'pat1') return 'pat1';
  if (team === 'tla' || role === 'tla') return 'tla';
  return '';
}

