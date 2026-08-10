/** FX communs chat / voix → openHudApp + Dashboard nav */
import { useMemo } from 'react';
import { useApp } from '../context/AppContext';
import type { ChatSideEffects } from './chatPipeline';
import { postDashboardNavigate } from './dashboardBridge';
import { getCoreClient } from './coreClient';

export function useChatFx(): ChatSideEffects {
  const {
    setScanningActive, setSettingsOpen, setAppGridOpen, setGestureOpen,
    launchApp, requestDashboard, openSettings, addNotification, coreAuth,
    setInputMode, openMissionControlDev, closeMissionControlDev,
  } = useApp();

  const role = coreAuth?.user?.role ?? null;
  const isAdmin =
    role === 'ADMIN' ||
    (coreAuth?.user?.permissions ?? []).includes('dashboard_access');

  return useMemo(
    () => ({
      setScanningActive,
      setSettingsOpen,
      setAppGridOpen,
      setGestureOpen,
      launchApp,
      requestDashboard,
      openSettings,
      addNotification,
      isAdmin,
      role,
      setInputMode,
      openMissionControlDev,
      closeMissionControlDev,
      navigateDashboard: (page: string) => postDashboardNavigate(page),
      onLocaleSticky: (lang: 'fr' | 'en') => {
        try {
          const raw = localStorage.getItem('jarvis.hud_preferences');
          const prefs = raw ? JSON.parse(raw) : {};
          const locale = {
            ...(prefs.locale || {}),
            stickyLanguage: lang,
            mode: 'sticky',
            preferredLanguage: prefs.locale?.preferredLanguage || 'fr',
            secondaryLanguages: prefs.locale?.secondaryLanguages || ['en'],
            voicePreset: prefs.locale?.voicePreset || 'jarvis_fr',
            faceId: prefs.locale?.faceId ?? null,
          };
          const next = { ...prefs, locale };
          localStorage.setItem('jarvis.hud_preferences', JSON.stringify(next));
          const client = getCoreClient();
          if (client.connected) {
            client.send({ type: 'save_hud_preferences', prefs: next });
          }
        } catch { /* */ }
      },
    }),
    [
      setScanningActive, setSettingsOpen, setAppGridOpen, setGestureOpen,
      launchApp, requestDashboard, openSettings, addNotification, isAdmin, role,
      setInputMode, openMissionControlDev, closeMissionControlDev,
    ],
  );
}
