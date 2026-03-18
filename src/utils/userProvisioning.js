// Frontend helper for SuperAdmin user provisioning.
// NOTE: This must call secure Supabase Edge Functions that run with the service key.
// The browser should never hold the service key directly.

async function invokeEdgeFunction(supabase, name, payload) {
  const baseUrl = import.meta.env.VITE_SUPABASE_URL;
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
  if (!baseUrl || !anonKey) throw new Error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY');

  const projectRef = (() => {
    try {
      const u = new URL(baseUrl);
      const host = u.host || '';
      const parts = host.split('.');
      return parts[0] || '';
    } catch {
      return '';
    }
  })();

  const decodeJwt = (token) => {
    try {
      const part = token.split('.')[1];
      if (!part) return null;
      const b64 = part.replace(/-/g, '+').replace(/_/g, '/');
      const pad = b64.length % 4 ? '='.repeat(4 - (b64.length % 4)) : '';
      const json = atob(b64 + pad);
      return JSON.parse(json);
    } catch {
      return null;
    }
  };

  // Ensure we send a fresh JWT (avoids "Invalid JWT" when token is stale/rotated).
  // refreshSession() is safe to call even if the session is already valid.
  await supabase.auth.refreshSession().catch(() => {});

  const { data: { session } } = await supabase.auth.getSession();
  const accessToken = session?.access_token;
  if (!accessToken) throw new Error('Not authenticated. Please re-login and try again.');

  const claims = decodeJwt(accessToken);
  const iss = String(claims?.iss || '');
  if (projectRef && iss && !iss.includes(projectRef)) {
    throw new Error(
      `Your session token is for a different Supabase project (iss=${iss}). ` +
      `Check VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY and clear your saved session, then login again.`
    );
  }

  const res = await fetch(`${baseUrl}/functions/v1/${name}`, {
    method: 'POST',
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload ?? {}),
  });

  const ct = res.headers.get('content-type') || '';
  const body = ct.includes('application/json')
    ? await res.json().catch(() => null)
    : await res.text().catch(() => '');

  if (!res.ok) {
    const detail = typeof body === 'string' ? body : JSON.stringify(body);
    throw new Error(`Edge Function ${name} failed (HTTP ${res.status}): ${detail || res.statusText || 'Request failed'}`);
  }

  return body;
}

export async function createAuthUserAndProfile(supabase, { email, password, fullName, role, team }) {
  if (!supabase) throw new Error('Supabase client is required');
  const payload = { email, password, full_name: fullName, role, team: team || null };
  return await invokeEdgeFunction(supabase, 'provision-user', payload);
}

export async function promoteUser(supabase, { userId, newRole, newTeam }) {
  if (!supabase) throw new Error('Supabase client is required');
  const payload = { user_id: userId, new_role: newRole, new_team: newTeam || null };
  return await invokeEdgeFunction(supabase, 'promote-user', payload);
}

export async function deleteUserAccount(supabase, { userId }) {
  if (!supabase) throw new Error('Supabase client is required');
  const payload = { user_id: userId };
  return await invokeEdgeFunction(supabase, 'delete-user', payload);
}

