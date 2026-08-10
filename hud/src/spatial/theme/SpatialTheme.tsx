/**
 * Thème spatial light | night.
 * Le verre lit paper/text depuis le mode — pas de couleurs en dur dans les surfaces.
 *
 * Contraste (pas le blur) :
 * - night → texte blanc sur verre blanc très translucide
 * - light → texte sombre sur verre blanc plus dense (frost)
 * Hover/clic → bordure / fill accent, pas un swap de police en bleu pour « lire ».
 */
import React, { createContext, useContext, useEffect, useMemo, type ReactNode } from 'react';

export type SpatialMode = 'night' | 'light';

export type SpatialThemeColors = {
  mode: SpatialMode;
  /** RGB fill verre (nuit = blanc translucide ; jour aussi blanc densifié côté surfaces) */
  paper: string;
  accent: string;
  text: string;
  textMuted: string;
  /** Teinte ambiance derrière le verre */
  void: string;
};

const NIGHT: SpatialThemeColors = {
  mode: 'night',
  paper: '255, 255, 255',
  accent: '10, 132, 255',
  text: 'rgba(255,255,255,0.94)',
  textMuted: 'rgba(255,255,255,0.52)',
  void: '#0b0d12',
};

const LIGHT: SpatialThemeColors = {
  mode: 'light',
  paper: '255, 255, 255',
  accent: '0, 113, 227',
  text: 'rgba(15, 20, 30, 0.92)',
  textMuted: 'rgba(15, 20, 30, 0.55)',
  void: '#d8e4f4',
};

const SpatialThemeContext = createContext<SpatialThemeColors>(NIGHT);

/** Sync CSS vars → tous les `tokens.color.text` / panels héritent sans re-hardcoder. */
export function applySpatialCssVars(theme: SpatialThemeColors) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.dataset.spatialMode = theme.mode;
  root.style.setProperty('--jv-mode', theme.mode);
  root.style.setProperty('--jv-text', theme.text);
  root.style.setProperty('--jv-text-muted', theme.textMuted);
  root.style.setProperty('--jv-accent', `rgb(${theme.accent})`);
  root.style.setProperty('--jv-accent-rgb', theme.accent);
  root.style.setProperty('--jv-paper', theme.paper);
  root.style.setProperty('--jv-void', theme.void);
  if (theme.mode === 'light') {
    root.style.setProperty('--jv-border', 'rgba(15, 20, 30, 0.14)');
    root.style.setProperty('--jv-surface', 'rgba(255, 255, 255, 0.42)');
    root.style.setProperty('--jv-surface-raised', 'rgba(255, 255, 255, 0.58)');
  } else {
    root.style.setProperty('--jv-border', 'rgba(255, 255, 255, 0.18)');
    root.style.setProperty('--jv-surface', 'rgba(255, 255, 255, 0.05)');
    root.style.setProperty('--jv-surface-raised', 'rgba(255, 255, 255, 0.09)');
  }
}

export function SpatialThemeProvider({
  mode,
  children,
}: {
  mode: SpatialMode;
  children: ReactNode;
}) {
  const value = useMemo(() => (mode === 'light' ? LIGHT : NIGHT), [mode]);

  useEffect(() => {
    applySpatialCssVars(value);
  }, [value]);

  return <SpatialThemeContext.Provider value={value}>{children}</SpatialThemeContext.Provider>;
}

export function useSpatialTheme(): SpatialThemeColors {
  return useContext(SpatialThemeContext);
}

export function spatialThemeColors(mode: SpatialMode): SpatialThemeColors {
  return mode === 'light' ? LIGHT : NIGHT;
}

/** Lit `?theme=` puis localStorage, défaut night. */
export function readSpatialMode(): SpatialMode {
  if (typeof window === 'undefined') return 'night';
  const q = new URLSearchParams(window.location.search).get('theme');
  if (q === 'light' || q === 'night') return q;
  try {
    const stored = localStorage.getItem('jarvis.spatialMode');
    if (stored === 'light' || stored === 'night') return stored;
  } catch {
    /* */
  }
  return 'night';
}

export function persistSpatialMode(mode: SpatialMode) {
  try {
    localStorage.setItem('jarvis.spatialMode', mode);
  } catch {
    /* */
  }
}
