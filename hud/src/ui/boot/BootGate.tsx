/**
 * Porte d'entrée HUD — monte l'app tout de suite.
 *
 * La cinématique OrbVoyage ne joue PLUS ici : elle part après auth/enrôlement
 * réussi (voir AppContext.welcomeCinematic). Ordre produit :
 *   check services → auth | enroll → cinématique → HUD idle
 *
 * Skip : session déjà ouverte → boot/skip + silence narration.
 */

import { useEffect, type ReactNode } from 'react';

import { getCoreClient } from '../../app/bridge/coreClient';

const HUD_SESSION_KEY = 'jarvis_hud_session';

const hasPersistedSession = (): boolean => {
  if (typeof window === 'undefined') return false;
  try {
    const raw =
      localStorage.getItem(HUD_SESSION_KEY)
      ?? sessionStorage.getItem(HUD_SESSION_KEY);
    if (!raw) return false;
    const parsed = JSON.parse(raw) as { unlocked?: boolean; at?: number };
    if (!parsed?.unlocked) return false;
    if (Date.now() - Number(parsed.at || 0) > 12 * 60 * 60 * 1000) return false;
    return true;
  } catch {
    return false;
  }
};

export interface BootGateProps {
  children: ReactNode;
}

export const BootGate = ({ children }: BootGateProps) => {
  useEffect(() => {
    if (import.meta.env.VITE_CORE_WS === 'false') return;
    getCoreClient().connect();
    if (!hasPersistedSession()) return;
    try {
      getCoreClient().send({ type: 'boot', action: 'skip' });
      getCoreClient().send({ type: 'auth', action: 'sequence_stop' });
      getCoreClient().send({ type: 'voice', action: 'cancel' });
    } catch { /* */ }
  }, []);

  return <>{children}</>;
};
