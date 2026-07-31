import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { Radar } from 'lucide-react';
import { authLogout, authRevokeAdmin, type AuthUser } from '../bridge/authClient';
import { CHAT_STORAGE_KEY } from '../bridge/chatPipeline';

export type AIState = 'idle' | 'listening' | 'processing' | 'responding';

/** État User Manager (Core WS) — source de vérité pour first_run / profil. */
export type CoreAuthState = {
  ready: boolean;
  online: boolean;
  firstRun: boolean | null;
  userCount: number;
  user: AuthUser | null;
};

export interface Message {
  id: string;
  type: 'user' | 'ai' | 'system';
  text: string;
  timestamp: Date;
  /** Origine — voix transcrite, clavier, local stub, core */
  source?: 'voice' | 'text' | 'local' | 'core' | 'system';
}

export interface Notification {
  id: string;
  type: 'info' | 'warning' | 'success' | 'error';
  title: string;
  message: string;
}

export interface MemoryItem {
  id: string;
  title: string;
  content: string;
  tags: string[];
  timestamp: Date;
  synced: boolean;
}

/** Application ouverte dans le HUD (volet lanceur d'apps → scène « time capsule »). */
export interface OpenApp {
  id: string;
  name: string;
  color: string;
  icon: React.ElementType;
  /** Réduite : sortie de la scène mais toujours ouverte (point dans le dock). */
  minimized?: boolean;
}

/** Étape Mission Control (§15) */
export type MissionStepStatus = 'pending' | 'running' | 'done' | 'error';
export type MissionStep = { id: string; label: string; status: MissionStepStatus };
export type MissionScenario = 'cursor' | 'generic';

export type MissionControlState = {
  open: boolean;
  scenario: MissionScenario | null;
  title: string;
  subtitle: string;
  projectName: string;
  steps: MissionStep[];
};

export const CURSOR_MISSION_STEPS: MissionStep[] = [
  { id: 'memory', label: 'Création mémoire projet (DB)', status: 'pending' },
  { id: 'hermes', label: 'Hermès — analyse & routage', status: 'pending' },
  { id: 'agent-dev', label: 'Agent Dev (simulation)', status: 'pending' },
  { id: 'cursor', label: 'Cursor — contexte projet', status: 'pending' },
  { id: 'git', label: 'Git — dépôt prêt', status: 'pending' },
  { id: 'ready', label: 'Prêt pour développement', status: 'pending' },
];

interface AppContextType {
  aiState: AIState;
  setAiState: (s: AIState) => void;
  messages: Message[];
  addMessage: (msg: Omit<Message, 'id' | 'timestamp'>) => void;
  clearMessages: () => void;
  /** Transcription STT en cours (écoute) — affichée dans la console */
  liveTranscript: string;
  setLiveTranscript: (t: string) => void;
  notifications: Notification[];
  addNotification: (n: Omit<Notification, 'id'>) => void;
  removeNotification: (id: string) => void;
  scanningActive: boolean;
  setScanningActive: (v: boolean) => void;
  appGridOpen: boolean;
  setAppGridOpen: (v: boolean) => void;
  settingsOpen: boolean;
  setSettingsOpen: (v: boolean) => void;
  /** Section initiale du panneau Paramètres (expérience) */
  settingsSection: 'profil' | 'voix' | 'vision' | 'comportement' | 'coupure' | 'foyer';
  setSettingsSection: (v: 'profil' | 'voix' | 'vision' | 'comportement' | 'coupure' | 'foyer') => void;
  openSettings: (section?: 'profil' | 'voix' | 'vision' | 'comportement' | 'coupure' | 'foyer') => void;
  gestureOpen: boolean;
  setGestureOpen: (v: boolean) => void;
  leftPanel: 'monitor' | 'memory';
  setLeftPanel: (v: 'monitor' | 'memory') => void;
  rightPanel: 'console' | 'search';
  setRightPanel: (v: 'console' | 'search') => void;
  memories: MemoryItem[];
  setMemories: (items: MemoryItem[]) => void;
  addMemory: (item: Omit<MemoryItem, 'id' | 'timestamp'> & { id?: string }) => void;
  memorySync: { local: boolean; cloud: boolean; git: boolean };
  setMemorySync: (s: { local: boolean; cloud: boolean; git: boolean }) => void;
  openApps: OpenApp[];
  activeAppId: string | null;
  launchApp: (app: OpenApp) => void;
  closeApp: (id: string) => void;
  focusApp: (id: string) => void;
  minimizeApp: (id: string) => void;
  /** Mode spécial : le HUD entier se retire pour afficher Dashboard Core (figma2) plein écran. */
  dashboardOpen: boolean;
  setDashboardOpen: (v: boolean) => void;
  /** Session HUD déverrouillée (auth Holomat / PIN / dev) */
  sessionUnlocked: boolean;
  sessionWasUnlocked: boolean;
  unlockSession: (meta?: { method: string; confidence?: number; user?: AuthUser }) => void;
  lockSession: () => void;
  /** Accès Dashboard Core (admin) — distinct de la session HUD */
  adminUnlocked: boolean;
  adminGateOpen: boolean;
  requestDashboard: () => void;
  closeAdminGate: () => void;
  grantAdminAccess: (meta?: { method: string }) => void;
  revokeAdminAccess: () => void;
  /** Sync User Manager Core */
  coreAuth: CoreAuthState;
  setCoreAuth: (patch: Partial<CoreAuthState>) => void;
  /** Test micro Settings — orbe bas-gauche, PAS de STT commande */
  micTestActive: boolean;
  setMicTestActive: (v: boolean) => void;
  /**
   * voice = kiosque : pas de clic/clavier sur le chrome (Jarvis commande).
   * recovery = maintenance : boutons souris/clavier réactivés (Ctrl+Alt+R).
   */
  inputMode: 'voice' | 'recovery';
  setInputMode: (m: 'voice' | 'recovery') => void;
  toggleRecoveryMode: () => void;
  /** Mission Control (§15) — actions complexes */
  missionControl: MissionControlState;
  openMissionControl: (opts: {
    scenario?: MissionScenario;
    projectName?: string;
    title?: string;
    subtitle?: string;
  }) => void;
  closeMissionControl: () => void;
  advanceMissionStep: (id: string, status: MissionStepStatus) => void;
}

const AppContext = createContext<AppContextType | null>(null);

function loadPersistedMessages(): Message[] {
  try {
    const raw = localStorage.getItem(CHAT_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Array<{ id: string; type: Message['type']; text: string; timestamp: string; source?: Message['source'] }>;
    if (!Array.isArray(parsed)) return [];
    return parsed.slice(-200).map(m => ({
      ...m,
      timestamp: new Date(m.timestamp),
    }));
  } catch {
    return [];
  }
}

const WELCOME: Message = {
  id: 'welcome',
  type: 'ai',
  text: 'JARVIS en ligne. Parle-moi ou tape ici — tout est transcrit dans cette console (mémoire de session).',
  timestamp: new Date(),
  source: 'system',
};

const initialMemories: MemoryItem[] = [];

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [aiState, setAiState] = useState<AIState>('idle');
  const [messages, setMessages] = useState<Message[]>(() => {
    const saved = typeof window !== 'undefined' ? loadPersistedMessages() : [];
    return saved.length ? saved : [WELCOME];
  });
  const [liveTranscript, setLiveTranscript] = useState('');
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [scanningActive, setScanningActive] = useState(false);
  const [appGridOpen, setAppGridOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsSection, setSettingsSection] = useState<'profil' | 'voix' | 'vision' | 'comportement' | 'coupure' | 'foyer'>('profil');
  const [gestureOpen, setGestureOpen] = useState(false);
  const [leftPanel, setLeftPanel] = useState<'monitor' | 'memory'>('monitor');
  const [rightPanel, setRightPanel] = useState<'console' | 'search'>('console');
  const [memories, setMemories] = useState<MemoryItem[]>(initialMemories);
  const [memorySync, setMemorySync] = useState({ local: false, cloud: false, git: false });
  const [openApps, setOpenApps] = useState<OpenApp[]>([]);
  const [activeAppId, setActiveAppId] = useState<string | null>(null);
  const [dashboardOpen, setDashboardOpen] = useState(false);
  const [sessionUnlocked, setSessionUnlocked] = useState(() => {
    if (typeof window === 'undefined') return false;
    if (new URLSearchParams(window.location.search).get('skipAuth') === '1') return true;
    return false;
  });
  const [sessionWasUnlocked, setSessionWasUnlocked] = useState(() =>
    typeof window !== 'undefined' && (
      new URLSearchParams(window.location.search).get('skipAuth') === '1'
    ),
  );
  const [adminUnlocked, setAdminUnlocked] = useState(false);
  const [adminGateOpen, setAdminGateOpen] = useState(false);
  const [coreAuth, setCoreAuthState] = useState<CoreAuthState>({
    ready: false,
    online: false,
    firstRun: null,
    userCount: 0,
    user: null,
  });
  const [micTestActive, setMicTestActive] = useState(false);
  const [inputMode, setInputMode] = useState<'voice' | 'recovery'>(() => {
    if (typeof window === 'undefined') return 'voice';
    return new URLSearchParams(window.location.search).get('recovery') === '1' ? 'recovery' : 'voice';
  });
  const [missionControl, setMissionControl] = useState<MissionControlState>({
    open: false,
    scenario: null,
    title: '',
    subtitle: '',
    projectName: '',
    steps: [],
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const m = params.get('mission');
    if (m === 'cursor' || m === '1') {
      if (params.get('skipAuth') === '1' || m === 'cursor') {
        setSessionUnlocked(true);
        setSessionWasUnlocked(true);
      }
      setMissionControl({
        open: true,
        scenario: 'cursor',
        title: 'Ouverture environnement Cursor',
        subtitle: 'Hermès prépare le contexte projet via le Core.',
        projectName: 'HoloControl',
        steps: CURSOR_MISSION_STEPS.map(s => ({ ...s, status: 'pending' as const })),
      });
      setOpenApps(prev =>
        prev.some(a => a.id === 'mission-control')
          ? prev.map(a => (a.id === 'mission-control' ? { ...a, minimized: false } : a))
          : [...prev, {
            id: 'mission-control',
            name: 'Mission Ctrl',
            color: '#f43f5e',
            icon: Radar,
            minimized: false,
          }],
      );
      setActiveAppId('mission-control');
    }
  }, []);

  const openMissionControl = useCallback((opts: {
    scenario?: MissionScenario;
    projectName?: string;
    title?: string;
    subtitle?: string;
  }) => {
    const scenario = opts.scenario || 'cursor';
    const projectName = (opts.projectName || 'HoloControl').trim() || 'HoloControl';
    setMissionControl({
      open: true,
      scenario,
      title: opts.title || (scenario === 'cursor'
        ? 'Ouverture environnement Cursor'
        : 'Mission en cours'),
      subtitle: opts.subtitle || (scenario === 'cursor'
        ? 'Hermès orchestre le projet via le Core.'
        : 'Suivi d’une action complexe.'),
      projectName,
      steps: CURSOR_MISSION_STEPS.map(s => ({ ...s, status: 'pending' as const })),
    });
    setOpenApps(prev =>
      prev.some(a => a.id === 'mission-control')
        ? prev.map(a => (a.id === 'mission-control' ? { ...a, minimized: false } : a))
        : [...prev, {
          id: 'mission-control',
          name: 'Mission Ctrl',
          color: '#f43f5e',
          icon: Radar,
          minimized: false,
        }],
    );
    setActiveAppId('mission-control');
  }, []);

  const closeMissionControl = useCallback(() => {
    setMissionControl(prev => ({ ...prev, open: false }));
    setOpenApps(prev => {
      const next = prev.filter(a => a.id !== 'mission-control');
      setActiveAppId(current => {
        if (current !== 'mission-control') return current;
        const visible = next.filter(a => !a.minimized);
        return visible.length ? visible[visible.length - 1].id : null;
      });
      return next;
    });
  }, []);

  const advanceMissionStep = useCallback((id: string, status: MissionStepStatus) => {
    setMissionControl(prev => ({
      ...prev,
      steps: prev.steps.map(s => (s.id === id ? { ...s, status } : s)),
    }));
  }, []);

  const toggleRecoveryMode = useCallback(() => {
    setInputMode(prev => {
      const next = prev === 'voice' ? 'recovery' : 'voice';
      setNotifications(n => [
        ...n,
        {
          id: `mode-${Date.now()}`,
          type: next === 'recovery' ? 'warning' : 'success',
          title: next === 'recovery' ? 'Mode recovery' : 'Mode voix',
          message:
            next === 'recovery'
              ? 'Clics / clavier actifs pour maintenance. Ctrl+Alt+R pour quitter.'
              : 'Chrome masqué — commande via « Jarvis … ». Ctrl+Alt+R = recovery.',
        },
      ]);
      return next;
    });
  }, []);

  const setCoreAuth = useCallback((patch: Partial<CoreAuthState>) => {
    setCoreAuthState(prev => ({ ...prev, ...patch }));
  }, []);

  // Nettoyage legacy : l'ancien AdminAccessGate persistait jarvis_admin_session
  useEffect(() => {
    try { sessionStorage.removeItem('jarvis_admin_session'); } catch { /* */ }
  }, []);

  const unlockSession = useCallback((meta?: { method: string; confidence?: number; user?: AuthUser }) => {
    setSessionUnlocked(true);
    setSessionWasUnlocked(true);
    setAdminUnlocked(false);
    setDashboardOpen(false);
    setAdminGateOpen(false);
    if (meta?.user) {
      setCoreAuthState(prev => ({ ...prev, firstRun: false, user: meta.user!, userCount: Math.max(prev.userCount, 1) }));
    }
    try { sessionStorage.removeItem('jarvis_admin_session'); } catch { /* */ }
    console.debug('[auth] session unlock', meta);
  }, []);

  const lockSession = useCallback(() => {
    void authLogout();
    setSessionUnlocked(false);
    setAdminUnlocked(false);
    setDashboardOpen(false);
    setAdminGateOpen(false);
    setCoreAuthState(prev => ({ ...prev, user: null }));
    try {
      sessionStorage.removeItem('jarvis_admin_session');
    } catch { /* */ }
  }, []);

  const requestDashboard = useCallback(() => {
    if (dashboardOpen) {
      void authRevokeAdmin();
      setDashboardOpen(false);
      setAdminUnlocked(false);
      setAdminGateOpen(false);
      return;
    }
    const u = coreAuth.user;
    const perms = u?.permissions ?? [];
    const canDash =
      u?.role === 'ADMIN' ||
      perms.includes('dashboard_access');
    if (u && !canDash) {
      setNotifications(prev => [
        ...prev,
        {
          id: `dash-${Date.now()}`,
          type: 'warning',
          title: 'Dashboard réservé',
          message: 'Seul l’admin peut ouvrir le Dashboard. HUD + apps restent dispo.',
        },
      ]);
      return;
    }
    setAdminUnlocked(false);
    setAdminGateOpen(true);
  }, [dashboardOpen, coreAuth.user]);

  const closeAdminGate = useCallback(() => setAdminGateOpen(false), []);

  const grantAdminAccess = useCallback((meta?: { method: string }) => {
    setAdminUnlocked(true);
    setAdminGateOpen(false);
    setDashboardOpen(true);
    console.debug('[auth] admin grant', meta);
  }, []);

  const revokeAdminAccess = useCallback(() => {
    void authRevokeAdmin();
    setAdminUnlocked(false);
    setDashboardOpen(false);
    setAdminGateOpen(false);
  }, []);

  const launchApp = useCallback((app: OpenApp) => {
    if (app.id === 'mission-control') {
      setMissionControl(prev => {
        if (prev.open && prev.steps.length) return prev;
        return {
          open: true,
          scenario: 'cursor',
          title: 'Ouverture environnement Cursor',
          subtitle: 'Hermès orchestre Agent Dev → Cursor (simulation HUD).',
          projectName: prev.projectName || 'HoloControl',
          steps: CURSOR_MISSION_STEPS.map(s => ({ ...s, status: 'pending' as const })),
        };
      });
    }
    setOpenApps(prev =>
      prev.some(a => a.id === app.id)
        ? prev.map(a => (a.id === app.id ? { ...a, minimized: false } : a))
        : [...prev, { ...app, minimized: false }]
    );
    setActiveAppId(app.id);
  }, []);

  const closeApp = useCallback((id: string) => {
    if (id === 'mission-control') {
      setMissionControl(prev => ({ ...prev, open: false }));
    }
    setOpenApps(prev => {
      const next = prev.filter(a => a.id !== id);
      setActiveAppId(current => {
        if (current !== id) return current;
        const visible = next.filter(a => !a.minimized);
        return visible.length ? visible[visible.length - 1].id : null;
      });
      return next;
    });
  }, []);

  const focusApp = useCallback((id: string) => {
    setOpenApps(prev => prev.map(a => (a.id === id ? { ...a, minimized: false } : a)));
    setActiveAppId(id);
  }, []);

  const minimizeApp = useCallback((id: string) => {
    setOpenApps(prev => {
      const next = prev.map(a => (a.id === id ? { ...a, minimized: true } : a));
      setActiveAppId(current => {
        if (current !== id) return current;
        const visible = next.filter(a => !a.minimized);
        return visible.length ? visible[visible.length - 1].id : null;
      });
      return next;
    });
  }, []);

  const addMessage = useCallback((msg: Omit<Message, 'id' | 'timestamp'>) => {
    setMessages(prev => {
      const next = [...prev, { ...msg, id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, timestamp: new Date() }];
      try {
        localStorage.setItem(
          CHAT_STORAGE_KEY,
          JSON.stringify(next.map(m => ({ ...m, timestamp: m.timestamp.toISOString() }))),
        );
      } catch { /* quota */ }
      return next;
    });
  }, []);

  const clearMessages = useCallback(() => {
    setMessages([WELCOME]);
    try { localStorage.removeItem(CHAT_STORAGE_KEY); } catch { /* */ }
  }, []);

  const removeNotification = useCallback((id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
  }, []);

  const addNotification = useCallback((n: Omit<Notification, 'id'>) => {
    const id = Date.now().toString();
    setNotifications(prev => [...prev, { ...n, id }]);
    setTimeout(() => removeNotification(id), 6000);
  }, [removeNotification]);

  const addMemory = useCallback((item: Omit<MemoryItem, 'id' | 'timestamp'> & { id?: string }) => {
    setMemories(prev => [
      {
        id: item.id || `${Date.now()}`,
        title: item.title,
        content: item.content,
        tags: item.tags,
        synced: item.synced ?? true,
        timestamp: new Date(),
      },
      ...prev,
    ]);
  }, []);

  const openSettings = useCallback((section?: 'profil' | 'voix' | 'vision' | 'comportement' | 'coupure' | 'foyer') => {
    if (section) setSettingsSection(section);
    setSettingsOpen(true);
  }, []);

  return (
    <AppContext.Provider value={{
      aiState, setAiState,
      messages, addMessage, clearMessages,
      liveTranscript, setLiveTranscript,
      notifications, addNotification, removeNotification,
      scanningActive, setScanningActive,
      appGridOpen, setAppGridOpen,
      settingsOpen, setSettingsOpen,
      settingsSection, setSettingsSection, openSettings,
      gestureOpen, setGestureOpen,
      leftPanel, setLeftPanel,
      rightPanel, setRightPanel,
      memories, setMemories, addMemory, memorySync, setMemorySync,
      openApps, activeAppId, launchApp, closeApp, focusApp, minimizeApp,
      dashboardOpen, setDashboardOpen,
      sessionUnlocked, sessionWasUnlocked, unlockSession, lockSession,
      adminUnlocked, adminGateOpen, requestDashboard, closeAdminGate, grantAdminAccess, revokeAdminAccess,
      coreAuth, setCoreAuth,
      micTestActive, setMicTestActive,
      inputMode, setInputMode, toggleRecoveryMode,
      missionControl, openMissionControl, closeMissionControl, advanceMissionStep,
    }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}
