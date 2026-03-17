// Frontend helper for SuperAdmin user provisioning.
// NOTE: This must call secure Supabase Edge Functions that run with the service key.
// The browser should never hold the service key directly.

export async function createAuthUserAndProfile(supabase, { email, password, fullName, role, team }) {
  if (!supabase) throw new Error('Supabase client is required');
  const payload = { email, password, full_name: fullName, role, team: team || null };
  const { data, error } = await supabase.functions.invoke('provision-user', { body: payload });
  if (error) throw new Error(error.message || 'Failed to provision user');
  return data;
}

export async function promoteUser(supabase, { userId, newRole, newTeam }) {
  if (!supabase) throw new Error('Supabase client is required');
  const payload = { user_id: userId, new_role: newRole, new_team: newTeam || null };
  const { data, error } = await supabase.functions.invoke('promote-user', { body: payload });
  if (error) throw new Error(error.message || 'Failed to promote user');
  return data;
}

export async function deleteUserAccount(supabase, { userId }) {
  if (!supabase) throw new Error('Supabase client is required');
  const payload = { user_id: userId };
  const { data, error } = await supabase.functions.invoke('delete-user', { body: payload });
  if (error) throw new Error(error.message || 'Failed to delete user');
  return data;
}

