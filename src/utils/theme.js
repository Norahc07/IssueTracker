export const THEME_STORAGE_KEY = 'theme';

export function getStoredTheme() {
  try {
    const v = localStorage.getItem(THEME_STORAGE_KEY);
    return v === 'dark' ? 'dark' : v === 'light' ? 'light' : 'light';
  } catch {
    return 'light';
  }
}

export function applyTheme(theme) {
  if (typeof document === 'undefined') return;
  const t = theme === 'dark' ? 'dark' : 'light';
  const root = document.documentElement;
  // Use explicit add/remove (more reliable than toggle in some environments).
  root.classList.remove('dark');
  if (t === 'dark') root.classList.add('dark');
  root.style.colorScheme = t;

  // Some components/styles may key off body as well.
  if (document.body) {
    document.body.classList.remove('dark');
    if (t === 'dark') document.body.classList.add('dark');
  }
}

export function setStoredTheme(theme) {
  const t = theme === 'dark' ? 'dark' : 'light';
  try {
    localStorage.setItem(THEME_STORAGE_KEY, t);
  } catch {
    // ignore
  }
  applyTheme(t);
  return t;
}

