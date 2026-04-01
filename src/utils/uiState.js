const PREFIX = 'ui-state:v1';

function getStorage() {
  try {
    if (typeof window !== 'undefined' && window.localStorage) return window.localStorage;
  } catch {
    // ignore and fall back
  }
  try {
    if (typeof window !== 'undefined' && window.sessionStorage) return window.sessionStorage;
  } catch {
    // ignore
  }
  return null;
}

function safeParse(json) {
  if (!json) return null;
  try {
    return JSON.parse(json);
  } catch {
    return null;
  }
}

export function makeUiStateKey({ userId, scope }) {
  const u = userId || 'anon';
  return `${PREFIX}:${u}:${scope}`;
}

export function loadUiState(key) {
  if (!key) return null;
  try {
    const storage = getStorage();
    if (!storage) return null;
    return safeParse(storage.getItem(key));
  } catch {
    return null;
  }
}

export function saveUiState(key, value) {
  if (!key) return;
  try {
    const storage = getStorage();
    if (!storage) return;
    storage.setItem(key, JSON.stringify(value ?? null));
  } catch {
    // ignore quota / blocked storage
  }
}

