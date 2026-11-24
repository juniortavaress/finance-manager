const THEME_KEY = 'atmos_theme';
export const THEME_OPTIONS = ['claro', 'escuro', 'auto'];

export function getThemePref() {
  const saved = localStorage.getItem(THEME_KEY);
  return THEME_OPTIONS.includes(saved) ? saved : 'auto';
}

function resolve(pref) {
  if (pref === 'auto') return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'escuro' : 'claro';
  return pref;
}

export function applyTheme(pref = getThemePref()) {
  document.documentElement.dataset.theme = resolve(pref);
}

export function setThemePref(pref) {
  localStorage.setItem(THEME_KEY, pref);
  applyTheme(pref);
}

// No modo automatico acompanha a troca do sistema em tempo real.
export function watchSystemTheme() {
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (getThemePref() === 'auto') applyTheme('auto');
  });
}
