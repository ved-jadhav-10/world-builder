import { useSyncExternalStore } from 'react';

/** What the person chose: follow the device, or always one of the two. */
export type ThemeChoice = 'system' | 'light' | 'dark';
export const THEME_CHOICES: ThemeChoice[] = ['system', 'light', 'dark'];
export const THEME_LABELS: Record<ThemeChoice, string> = {
  system: 'Match my device',
  light: 'Vellum (light)',
  dark: 'Lamplight (dark)',
};

const KEY = 'atlas-theme';
const listeners = new Set<() => void>();

function read(): ThemeChoice {
  try {
    const value = localStorage.getItem(KEY);
    return value === 'light' || value === 'dark' ? value : 'system';
  } catch {
    return 'system';
  }
}

function systemPrefersDark(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches;
}

/** The theme actually shown for a choice. */
export function resolveTheme(choice: ThemeChoice, prefersDark: boolean): 'light' | 'dark' {
  if (choice === 'system') return prefersDark ? 'dark' : 'light';
  return choice;
}

/** Writes the resolved theme onto <html>; the stylesheet keys everything off `data-theme`. */
export function applyTheme(choice: ThemeChoice = read()) {
  document.documentElement.dataset.theme = resolveTheme(choice, systemPrefersDark());
}

export function setThemeChoice(choice: ThemeChoice) {
  try {
    if (choice === 'system') localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, choice);
  } catch {
    // Private windows may refuse storage; the theme still applies for this visit.
  }
  applyTheme(choice);
  listeners.forEach((listener) => listener());
}

/** Call once at start-up: keeps "match my device" in step when the device changes. */
export function watchSystemTheme() {
  applyTheme();
  if (typeof matchMedia !== 'function') return;
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    applyTheme();
    listeners.forEach((listener) => listener());
  });
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useThemeChoice(): ThemeChoice {
  return useSyncExternalStore(subscribe, read, () => 'system');
}
