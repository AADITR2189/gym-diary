import { useEffect, useState } from 'react';
import type { ThemePref } from '../types';

export type ResolvedTheme = 'light' | 'dark';

const mq = () => (typeof window !== 'undefined' ? window.matchMedia('(prefers-color-scheme: dark)') : null);

export function resolveTheme(pref: ThemePref): ResolvedTheme {
  if (pref === 'system') return mq()?.matches ? 'dark' : 'light';
  return pref;
}

let themeApplied = false;

/** Sets <html data-theme> + browser chrome colour, and follows the OS when pref is "system". */
export function applyTheme(pref: ThemePref) {
  try {
    localStorage.setItem('gym-diary-theme', pref);
  } catch {
    /* ignore */
  }
  const set = () => {
    const t = resolveTheme(pref);
    // Ease light ↔ dark instead of an abrupt brightness jump (not on first load).
    const root = document.documentElement;
    if (themeApplied && root.dataset.theme !== t) {
      root.classList.add('theme-fade');
      window.setTimeout(() => root.classList.remove('theme-fade'), 350);
    }
    themeApplied = true;
    document.documentElement.dataset.theme = t;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', PALETTE[t].bg);
    window.dispatchEvent(new CustomEvent('themechange', { detail: t }));
  };
  set();
  if (pref !== 'system') return;
  const m = mq();
  m?.addEventListener('change', set);
  return () => m?.removeEventListener('change', set);
}

/** Chart/JS-side palette. Mirrors the CSS variables in index.css. */
export const PALETTE = {
  light: {
    bg: '#F0EDE4',
    surface: '#FAF8F2',
    ink: '#004741',
    muted: '#4A6763',
    line: '#D4CFBF',
    strength: '#2C6B1F',
    cardio: '#1D5C8C',
    gold: '#8A5300',
    rose: '#A3261F',
    water: '#0B6670',
  },
  dark: {
    bg: '#0C1E29',
    surface: '#112A39',
    ink: '#FFFE15',
    muted: '#C9C88A',
    line: '#24475C',
    strength: '#7EE08A',
    cardio: '#6FC7FF',
    gold: '#FFB44D',
    rose: '#FF8F85',
    water: '#4FE0DA',
  },
} as const;

export type Palette = (typeof PALETTE)[ResolvedTheme];

/** Current resolved palette; re-renders when the theme changes. */
export function usePalette(): Palette {
  const read = () => (document.documentElement.dataset.theme === 'light' ? 'light' : 'dark') as ResolvedTheme;
  const [t, setT] = useState<ResolvedTheme>(read);
  useEffect(() => {
    const on = () => setT(read());
    window.addEventListener('themechange', on);
    return () => window.removeEventListener('themechange', on);
  }, []);
  return PALETTE[t];
}
