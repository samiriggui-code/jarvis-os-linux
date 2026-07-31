import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  X, User, Mic, Camera, SlidersHorizontal, ShieldAlert,
  CheckCircle, AlertCircle, Save, RotateCcw, Hand, Unlock, Info, Users,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import {
  DEFAULT_GESTURE_BINDINGS,
  DEFAULT_HUD_PREFS,
  type GestureBinding,
  type GestureProfile,
  type HudExperiencePreferences,
} from '../bridge/hudContracts';
import { getCoreClient } from '../bridge/coreClient';
import { ensureCamera, getMediaState, listAudioInputs, listVideoInputs } from '../bridge/mediaDevices';
import { startAudioBus, pauseWakeWord, resumeWakeWord } from '../bridge/audioBus';
import { authEnroll, authListUsers, type AuthUser } from '../bridge/authClient';
import { CameraPreview } from './CameraPreview';

const orb = { fontFamily: 'Orbitron, sans-serif' };
const mono = { fontFamily: 'Share Tech Mono, monospace' };
const raj = { fontFamily: 'Rajdhani, sans-serif' };

const LS_PREFS = 'jarvis.hud_preferences';
const LS_GESTURE = 'jarvis.gesture_profile';

type Section = 'profil' | 'voix' | 'vision' | 'comportement' | 'coupure' | 'foyer';

const SECTIONS: { id: Section; label: string; icon: React.ElementType; color: string }[] = [
  { id: 'profil', label: 'PROFIL', icon: User, color: '#00f5ff' },
  { id: 'foyer', label: 'FOYER', icon: Users, color: '#38bdf8' },
  { id: 'voix', label: 'VOIX', icon: Mic, color: '#19f0d8' },
  { id: 'vision', label: 'VISION / HOLOMAT', icon: Camera, color: '#a855f7' },
  { id: 'comportement', label: 'COMPORTEMENTS', icon: SlidersHorizontal, color: '#f59e0b' },
  { id: 'coupure', label: 'COUPURES', icon: ShieldAlert, color: '#ef4444' },
];

function loadLocalPrefs(): HudExperiencePreferences {
  try {
    const raw = localStorage.getItem(LS_PREFS);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        ...DEFAULT_HUD_PREFS,
        ...parsed,
        locale: { ...DEFAULT_HUD_PREFS.locale, ...(parsed.locale || {}) },
        voice: { ...DEFAULT_HUD_PREFS.voice, ...(parsed.voice || {}) },
        vision: {
          ...DEFAULT_HUD_PREFS.vision,
          ...(parsed.vision || {}),
          sessionUnlock: {
            ...DEFAULT_HUD_PREFS.vision.sessionUnlock,
            ...(parsed.vision?.sessionUnlock || {}),
          },
        },
        killSwitch: { ...DEFAULT_HUD_PREFS.killSwitch, ...(parsed.killSwitch || {}) },
      };
    }
  } catch { /* */ }
  return { ...DEFAULT_HUD_PREFS, locale: { ...DEFAULT_HUD_PREFS.locale } };
}

function loadLocalGesture(): { bindings: GestureBinding[]; dominantHand: 'left' | 'right'; sensitivity: number } {
  try {
    const raw = localStorage.getItem(LS_GESTURE);
    if (raw) {
      const g = JSON.parse(raw) as GestureProfile;
      return {
        bindings: g.bindings?.length ? g.bindings : DEFAULT_GESTURE_BINDINGS.map(b => ({ ...b })),
        dominantHand: g.dominantHand ?? 'right',
        sensitivity: g.sensitivity ?? 0.7,
      };
    }
  } catch { /* */ }
  return {
    bindings: DEFAULT_GESTURE_BINDINGS.map(b => ({ ...b })),
    dominantHand: 'right',
    sensitivity: 0.7,
  };
}

function Field({ label, value, onChange, placeholder = '', hint }: {
  label: string; value: string; onChange: (v: string) => void;
  placeholder?: string; hint?: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label style={{ ...mono, color: 'rgba(255,255,255,0.4)', fontSize: '10px' }}>{label}</label>
      <div
        className="flex items-center gap-2 rounded-xl px-3 py-2.5"
        style={{ background: 'rgba(0,5,15,0.7)', border: '1px solid rgba(255,255,255,0.08)' }}
      >
        <input
          type="text"
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          className="flex-1 bg-transparent outline-none"
          style={{ ...raj, color: 'rgba(255,255,255,0.85)', fontSize: '13px' }}
        />
      </div>
      {hint && (
        <span style={{ ...mono, color: 'rgba(255,255,255,0.25)', fontSize: '9px' }}>{hint}</span>
      )}
    </div>
  );
}

function Toggle({ label, value, onChange, color = '#00f5ff', hint }: {
  label: string; value: boolean; onChange: (v: boolean) => void; color?: string; hint?: string;
}) {
  return (
    <div className="py-2">
      <div className="flex items-center justify-between">
        <span style={{ ...raj, color: 'rgba(255,255,255,0.7)', fontSize: '13px' }}>{label}</span>
        <motion.button
          type="button"
          onClick={() => onChange(!value)}
          className="w-11 h-6 rounded-full relative cursor-pointer"
          style={{ background: value ? `${color}30` : 'rgba(255,255,255,0.06)', border: `1px solid ${value ? color : 'rgba(255,255,255,0.12)'}` }}
        >
          <motion.div
            animate={{ x: value ? 20 : 2 }}
            transition={{ type: 'spring', stiffness: 500, damping: 30 }}
            className="absolute top-0.5 w-5 h-5 rounded-full"
            style={{ background: value ? color : 'rgba(255,255,255,0.3)', boxShadow: value ? `0 0 8px ${color}` : 'none' }}
          />
        </motion.button>
      </div>
      {hint && (
        <p style={{ ...mono, color: 'rgba(255,255,255,0.28)', fontSize: '9px', marginTop: 4 }}>{hint}</p>
      )}
    </div>
  );
}

function WireHint({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl p-3 flex gap-2 items-start" style={{ background: 'rgba(0,245,255,0.05)', border: '1px solid rgba(0,245,255,0.15)' }}>
      <Info className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: '#00f5ff' }} />
      <span style={{ ...mono, color: 'rgba(0,245,255,0.65)', fontSize: '10px', lineHeight: 1.45 }}>{children}</span>
    </div>
  );
}

function SelectDevice({ label, value, onChange, options }: {
  label: string; value: string; onChange: (v: string) => void;
  options: { id: string; name: string }[];
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label style={{ ...mono, color: 'rgba(255,255,255,0.4)', fontSize: '10px' }}>{label}</label>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className="rounded-xl px-3 py-2.5 outline-none cursor-pointer"
        style={{
          ...raj,
          fontSize: '13px',
          color: 'rgba(255,255,255,0.85)',
          background: 'rgba(0,5,15,0.7)',
          border: '1px solid rgba(255,255,255,0.08)',
        }}
      >
        <option value="">— Défaut système —</option>
        {options.map(o => (
          <option key={o.id} value={o.id}>{o.name}</option>
        ))}
      </select>
    </div>
  );
}

export function SettingsPanel() {
  const {
    settingsOpen, setSettingsOpen, settingsSection, setSettingsSection,
    setGestureOpen, addNotification, coreAuth, micTestActive, setMicTestActive,
  } = useApp();
  const [section, setSection] = useState<Section>(settingsSection);
  const [saved, setSaved] = useState(false);
  const localG = loadLocalGesture();
  const [prefs, setPrefs] = useState<HudExperiencePreferences>(() => loadLocalPrefs());
  const [bindings, setBindings] = useState<GestureBinding[]>(() => localG.bindings);
  const [dominantHand, setDominantHand] = useState<'left' | 'right'>(() => localG.dominantHand);
  const [sensitivity, setSensitivity] = useState(() => localG.sensitivity);
  const [micOptions, setMicOptions] = useState<{ id: string; name: string }[]>([]);
  const [camOptions, setCamOptions] = useState<{ id: string; name: string }[]>([]);
  const [holoStatus, setHoloStatus] = useState<{ camera: string; calibrated: boolean }>({
    camera: '—',
    calibrated: false,
  });
  const [calibrating, setCalibrating] = useState(false);
  const [camPreviewOn, setCamPreviewOn] = useState(false);
  const [family, setFamily] = useState<AuthUser[]>([]);
  const [enrollName, setEnrollName] = useState('');
  const [enrollUser, setEnrollUser] = useState('');
  const [enrollRole, setEnrollRole] = useState<'USER' | 'CHILD'>('CHILD');
  const [enrollBusy, setEnrollBusy] = useState(false);

  const isAdmin =
    coreAuth?.user?.role === 'ADMIN' ||
    (coreAuth?.user?.permissions ?? []).includes('user_management') ||
    (coreAuth?.user?.permissions ?? []).includes('dashboard_access');

  useEffect(() => {
    if (settingsOpen) setSection(settingsSection);
  }, [settingsOpen, settingsSection]);

  // Fermer Settings → arrête le test micro
  useEffect(() => {
    if (!settingsOpen && micTestActive) {
      setMicTestActive(false);
      resumeWakeWord();
    }
  }, [settingsOpen, micTestActive, setMicTestActive]);

  useEffect(() => {
    if (!settingsOpen) return;
    let cancelled = false;
    (async () => {
      const [cams, mics] = await Promise.all([listVideoInputs(), listAudioInputs()]);
      if (cancelled) return;
      if (cams.length) setCamOptions(cams);
      if (mics.length) setMicOptions(mics);

      const client = getCoreClient();
      const uid = (coreAuth?.user as { id?: string } | undefined)?.id || prefs.userId || 'local';
      if (!client.connected) return;

      try {
        const res = await client.request(
          { type: 'preferences', action: 'get', user_id: uid },
          d => d.type === 'preferences_result',
          5000,
        );
        if (cancelled) return;
        if (res.ok && res.prefs && typeof res.prefs === 'object') {
          setPrefs(p => ({ ...p, ...(res.prefs as HudExperiencePreferences) }));
        }
        const g = res.gesture as GestureProfile | undefined;
        if (g?.bindings?.length) {
          setBindings(g.bindings);
          if (g.dominantHand) setDominantHand(g.dominantHand);
          if (typeof g.sensitivity === 'number') setSensitivity(g.sensitivity);
        }
      } catch { /* offline */ }

      try {
        const st = await client.request(
          { type: 'holomat', action: 'status' },
          d => d.type === 'holomat_status',
          4000,
        );
        if (cancelled) return;
        setHoloStatus({
          camera: String(st.camera ?? '—'),
          calibrated: st.calibrated === true,
        });
      } catch { /* */ }

      if (isAdmin) {
        try {
          const list = await authListUsers();
          if (!cancelled && list.ok) setFamily(list.users);
        } catch { /* */ }
      }
    })();

    return () => { cancelled = true; };
  }, [settingsOpen, coreAuth?.user, prefs.userId, isAdmin]);

  const toggleMicTest = async () => {
    if (micTestActive) {
      setMicTestActive(false);
      resumeWakeWord();
      addNotification({
        type: 'info',
        title: 'Test micro',
        message: 'Fin — orbe bas-gauche éteinte. Wake « Jarvis » reprend.',
      });
      return;
    }
    const ok = await startAudioBus();
    if (!ok) {
      addNotification({
        type: 'error',
        title: 'Micro',
        message: 'Autorise le microphone (navigateur) pour le test.',
      });
      return;
    }
    pauseWakeWord(); // pas de STT / wake pendant le test → orbe niveau seul
    setMicTestActive(true);
    addNotification({
      type: 'success',
      title: 'Test micro',
      message: 'Orbe bas-gauche active — parle : niveau RMS seulement (pas Whisper / commande).',
    });
  };

  const refreshFamily = async () => {
    const list = await authListUsers();
    if (list.ok) setFamily(list.users);
    else {
      addNotification({
        type: 'warning',
        title: 'Foyer',
        message: list.error || 'Liste indisponible (admin + Core requis).',
      });
    }
  };

  const enrollMember = async () => {
    if (!isAdmin) {
      addNotification({ type: 'warning', title: 'Foyer', message: 'Seul l’admin peut enroler la famille.' });
      return;
    }
    const username = (enrollUser || enrollName).trim().toLowerCase().replace(/\s+/g, '_');
    if (!username) {
      addNotification({ type: 'warning', title: 'Foyer', message: 'Nom / username requis.' });
      return;
    }
    setEnrollBusy(true);
    try {
      const res = await authEnroll({
        username,
        display_name: enrollName.trim() || username,
        role: enrollRole,
        face: true,
        voice: true, // timbre : flag pour bascule profil au déverrouillage
        pin: '0000',
      });
      if (!res.ok) {
        addNotification({ type: 'error', title: 'Enrollment', message: res.error || 'échec' });
        return;
      }
      addNotification({
        type: 'success',
        title: 'Membre ajouté',
        message: `${res.user?.display_name || username} (${enrollRole}) — HUD seulement. Au verrouillage : auth → son profil.`,
      });
      setEnrollName('');
      setEnrollUser('');
      await refreshFamily();
    } finally {
      setEnrollBusy(false);
    }
  };

  const selectSection = (id: Section) => {
    setSection(id);
    setSettingsSection(id);
  };

  const outOptions = [
    { id: 'out-default', name: 'Sortie par défaut' },
  ];

  const patch = (fn: (p: HudExperiencePreferences) => HudExperiencePreferences) =>
    setPrefs(p => fn({ ...p }));

  const buildGestureProfile = (): GestureProfile => ({
    userId: (coreAuth?.user as { id?: string } | undefined)?.id || prefs.userId || 'local',
    dominantHand,
    sensitivity,
    bindings,
  });

  const handleSave = async () => {
    const uid = (coreAuth?.user as { id?: string } | undefined)?.id || prefs.userId || 'local';
    const nextPrefs = { ...prefs, userId: uid };
    const profile = buildGestureProfile();

    localStorage.setItem(LS_PREFS, JSON.stringify(nextPrefs));
    localStorage.setItem(LS_GESTURE, JSON.stringify(profile));
    setPrefs(nextPrefs);

    const client = getCoreClient();
    let coreOk = false;
    if (client.connected) {
      client.send({ type: 'save_hud_preferences', prefs: nextPrefs });
      client.send({ type: 'save_gesture_profile', profile });
      coreOk = true;
    }

    setSaved(true);
    addNotification({
      type: coreOk ? 'success' : 'warning',
      title: 'Préférences HUD',
      message: coreOk
        ? `Sauvé Core → data/users/${uid}/ (hud_preferences + gesture_profile)`
        : 'Sauvé localStorage (Core hors ligne — relancer jarvis_core).',
    });
    setTimeout(() => setSaved(false), 3000);
  };

  const openLiveGestures = () => {
    if (prefs.killSwitch.cameraOff) {
      addNotification({ type: 'warning', title: 'Caméra coupée', message: 'Désactive la coupure caméra avant les gestes.' });
      return;
    }
    setSettingsOpen(false);
    setGestureOpen(true);
  };

  const startCalibrate = async () => {
    if (prefs.killSwitch.cameraOff) {
      addNotification({
        type: 'warning',
        title: 'Caméra OFF',
        message: 'Coupe rapide caméra active — Settings → Coupures, puis recalibre.',
      });
      return;
    }
    if (!prefs.vision.holomatEnabled) {
      addNotification({ type: 'warning', title: 'Holomat off', message: 'Active Holomat avant calibration.' });
      return;
    }

    setCalibrating(true);
    setCamPreviewOn(true);
    const stream = await ensureCamera();
    if (!stream) {
      setCalibrating(false);
      addNotification({
        type: 'error',
        title: 'Caméra requise',
        message: 'Autorise la caméra (navigateur) — Holomat ne peut pas calibrer sans flux vidéo.',
      });
      return;
    }

    // Rafraîchir labels devices
    const cams = await listVideoInputs();
    if (cams.length) setCamOptions(cams);

    const client = getCoreClient();
    if (!client.connected) {
      setCalibrating(false);
      // Fallback local machine stub
      localStorage.setItem('jarvis.holomat_calibration', JSON.stringify({
        calibrated: true,
        cameraDeviceId: prefs.vision.cameraDeviceId,
        at: new Date().toISOString(),
      }));
      setHoloStatus({ camera: 'ok', calibrated: true });
      addNotification({
        type: 'warning',
        title: 'Calibration locale',
        message: 'Core hors ligne — marque calibrated en local. Relance jarvis_core pour persister data/holomat/calibration.json',
      });
      return;
    }

    try {
      const res = await client.request(
        { type: 'holomat', action: 'calibrate_start', camera_on: true, cameraDeviceId: prefs.vision.cameraDeviceId },
        d => d.type === 'holomat_calibrate_result',
        8000,
      );
      setCalibrating(false);
      if (res.ok) {
        setHoloStatus({ camera: 'ok', calibrated: true });
        addNotification({
          type: 'success',
          title: 'Calibration enregistrée',
          message: 'Persistance Core : data/holomat/calibration.json',
        });
      } else {
        addNotification({
          type: 'error',
          title: 'Calibration refusée',
          message: String(res.message || res.error || 'erreur'),
        });
      }
    } catch {
      setCalibrating(false);
      addNotification({ type: 'error', title: 'Calibration', message: 'Timeout Core — réessaie.' });
    }
  };

  const enableCameraForHolomat = async () => {
    patch(p => ({
      ...p,
      killSwitch: { ...p.killSwitch, cameraOff: false },
      vision: { ...p.vision, holomatEnabled: true },
    }));
    const s = await ensureCamera();
    setCamPreviewOn(!!s);
    addNotification({
      type: s ? 'success' : 'error',
      title: s ? 'Caméra ON' : 'Caméra refusée',
      message: s ? 'Aperçu ci-dessous — prêt pour calibration Holomat.' : (getMediaState().cameraError || 'Permission refusée'),
    });
  };

  return (
    <AnimatePresence>
      {settingsOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 flex items-center justify-center overflow-hidden p-3"
          style={{ zIndex: 180, background: 'rgba(0, 4, 12, 0.92)', backdropFilter: 'blur(12px)' }}
        >
          <motion.div
            initial={{ scale: 0.92, y: 16 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.92, y: 16 }}
            transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
            className="w-full max-w-3xl rounded-2xl overflow-hidden flex flex-col"
            style={{
              maxHeight: 'calc(100dvh - 1.5rem)',
              background: 'rgba(0, 10, 25, 0.95)',
              border: '1px solid rgba(0,245,255,0.2)',
              boxShadow: '0 0 60px rgba(0,245,255,0.1)',
            }}
          >
            <div
              className="flex items-center justify-between px-5 py-3 flex-shrink-0"
              style={{ borderBottom: '1px solid rgba(0,245,255,0.12)', background: 'rgba(0, 10, 25, 0.98)' }}
            >
              <div>
                <h2 style={{ ...orb, color: '#00f5ff', fontSize: '16px', letterSpacing: '0.2em', margin: 0 }}>
                  PARAMÈTRES
                </h2>
                <p style={{ ...mono, color: 'rgba(0,245,255,0.4)', fontSize: '10px', marginTop: 4 }}>
                  Expérience HUD · Voix · Holomat — admin / clés API → Dashboard
                </p>
              </div>
              <motion.button
                whileHover={{ scale: 1.1, rotate: 90 }}
                whileTap={{ scale: 0.9 }}
                onClick={() => setSettingsOpen(false)}
                className="w-10 h-10 rounded-xl flex items-center justify-center cursor-pointer"
                style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)' }}
              >
                <X className="w-5 h-5" style={{ color: '#ef4444' }} />
              </motion.button>
            </div>

            <div className="flex flex-1 min-h-0 overflow-hidden hud-settings-body">
              <div
                className="w-48 flex flex-col gap-1 p-3 flex-shrink-0 overflow-y-auto hud-settings-nav"
                style={{ borderRight: '1px solid rgba(0,245,255,0.08)' }}
              >
                {SECTIONS.map(s => (
                  <motion.button
                    key={s.id}
                    whileHover={{ x: 2 }}
                    onClick={() => selectSection(s.id)}
                    className="flex items-center gap-3 px-3 py-3 rounded-xl cursor-pointer text-left"
                    style={{
                      background: section === s.id ? `${s.color}12` : 'transparent',
                      border: `1px solid ${section === s.id ? `${s.color}30` : 'transparent'}`,
                    }}
                  >
                    <s.icon className="w-4 h-4" style={{ color: section === s.id ? s.color : 'rgba(255,255,255,0.3)' }} />
                    <span style={{ ...mono, color: section === s.id ? s.color : 'rgba(255,255,255,0.4)', fontSize: '9px' }}>
                      {s.label}
                    </span>
                  </motion.button>
                ))}
              </div>

              <div className="flex-1 min-h-0 overflow-y-auto p-5" style={{ scrollbarWidth: 'thin', scrollbarColor: 'rgba(0,245,255,0.2) transparent' }}>
                <AnimatePresence mode="wait">
                  {section === 'profil' && (
                    <motion.div key="profil" initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }} className="flex flex-col gap-4">
                      <WireHint>
                        Persistera dans users/&lt;id&gt;/hud_preferences — Memory Manager / profil local. Pas de secrets ici.
                      </WireHint>
                      <div className="flex items-center gap-4 mb-1">
                        <div
                          className="w-14 h-14 rounded-2xl flex items-center justify-center"
                          style={{ background: 'rgba(0,245,255,0.08)', border: '1px solid rgba(0,245,255,0.2)' }}
                        >
                          <User className="w-7 h-7" style={{ color: '#00f5ff' }} />
                        </div>
                        <div>
                          <p style={{ ...raj, color: 'rgba(255,255,255,0.8)', fontSize: '16px' }}>{prefs.displayName}</p>
                          <p style={{ ...mono, color: 'rgba(0,245,255,0.6)', fontSize: '11px' }}>
                            {coreAuth?.user?.role || '—'} · {prefs.assistantName}
                          </p>
                        </div>
                      </div>
                      <Field label="NOM AFFICHÉ" value={prefs.displayName} onChange={v => patch(p => ({ ...p, displayName: v }))} />
                      <Field label="NOM DE L'ASSISTANT" value={prefs.assistantName} onChange={v => patch(p => ({ ...p, assistantName: v }))} placeholder="JARVIS" />
                      <Field
                        label="ID UTILISATEUR (profil)"
                        value={prefs.userId}
                        onChange={v => patch(p => ({ ...p, userId: v }))}
                        hint="Lie face + voice + locale + permissions (Core)"
                      />
                      <Field
                        label="FACE ID (Holomat)"
                        value={prefs.locale.faceId || ''}
                        onChange={v => patch(p => ({ ...p, locale: { ...p.locale, faceId: v || null } }))}
                        placeholder="samir_001"
                        hint="Après auth face → charge ce profil + langue + voix TTS"
                      />
                      <SelectDevice
                        label="LANGUE PRINCIPALE"
                        value={prefs.locale.preferredLanguage}
                        onChange={v => patch(p => ({
                          ...p,
                          locale: { ...p.locale, preferredLanguage: (v as 'fr' | 'en') || 'fr' },
                        }))}
                        options={[
                          { id: 'fr', name: 'Français' },
                          { id: 'en', name: 'English' },
                        ]}
                      />
                      <SelectDevice
                        label="LANGUES ACCEPTÉES (secondaires)"
                        value={prefs.locale.secondaryLanguages[0] || ''}
                        onChange={v => patch(p => ({
                          ...p,
                          locale: {
                            ...p.locale,
                            secondaryLanguages: v && v !== p.locale.preferredLanguage
                              ? [v as 'fr' | 'en']
                              : [],
                          },
                        }))}
                        options={[
                          { id: '', name: '— aucune —' },
                          { id: 'en', name: 'Anglais' },
                          { id: 'fr', name: 'Français' },
                        ]}
                      />
                      <SelectDevice
                        label="MODE LANGUE"
                        value={prefs.locale.mode}
                        onChange={v => patch(p => ({
                          ...p,
                          locale: { ...p.locale, mode: (v as 'mirror' | 'preferred' | 'sticky') || 'mirror' },
                        }))}
                        options={[
                          { id: 'mirror', name: 'Miroir — répondre dans la langue parlée' },
                          { id: 'preferred', name: 'Profil — toujours langue principale' },
                          { id: 'sticky', name: 'Sticky — après « passe en anglais »' },
                        ]}
                      />
                      <SelectDevice
                        label="VOIX TTS"
                        value={prefs.locale.voicePreset}
                        onChange={v => patch(p => ({
                          ...p,
                          locale: {
                            ...p.locale,
                            voicePreset: (v as 'jarvis_fr' | 'jarvis_en' | 'jarvis_soft') || 'jarvis_fr',
                          },
                        }))}
                        options={[
                          { id: 'jarvis_fr', name: 'JARVIS FR' },
                          { id: 'jarvis_en', name: 'JARVIS EN' },
                          { id: 'jarvis_soft', name: 'Voix douce (enfant)' },
                        ]}
                      />
                      <WireHint>
                        Flux : caméra → face → Hermes charge profil → langue + voicePreset.
                        « Jarvis passe en anglais » / « Switch to French » = sticky jusqu’à nouvel ordre.
                        Whisper lang_id (STT) remplacera l’heuristique texte.
                      </WireHint>
                    </motion.div>
                  )}

                  {section === 'foyer' && (
                    <motion.div key="foyer" initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }} className="flex flex-col gap-4">
                      <WireHint>
                        Famille : rôles USER / CHILD = HUD + apps (pas Dashboard). Au verrouillage, Holomat / voix
                        sélectionne le profil. Timbre vocal = enrollment voice (Core) — Hermes peut orchestrer
                        l’enrollment via skill family-enroll. Toi seul = ADMIN → Dashboard.
                      </WireHint>
                      {!isAdmin && (
                        <p style={{ ...mono, color: '#f59e0b', fontSize: '11px' }}>
                          Lecture seule — enrollment réservé à l’admin.
                        </p>
                      )}
                      <div className="flex flex-col gap-2">
                        {family.length === 0 ? (
                          <p style={{ ...mono, color: 'rgba(255,255,255,0.35)', fontSize: '10px' }}>
                            Aucun membre listé (Core offline ou pas admin).
                          </p>
                        ) : family.map(u => (
                          <div
                            key={u.id}
                            className="rounded-xl px-3 py-2.5 flex justify-between gap-2"
                            style={{ background: 'rgba(56,189,248,0.06)', border: '1px solid rgba(56,189,248,0.2)' }}
                          >
                            <div>
                              <p style={{ ...raj, color: 'rgba(255,255,255,0.85)', fontSize: '14px' }}>
                                {u.display_name || u.username}
                              </p>
                              <p style={{ ...mono, color: 'rgba(56,189,248,0.7)', fontSize: '10px' }}>
                                @{u.username} · {u.role}
                                {u.biometrics?.voice ? ' · voix' : ''}
                                {u.biometrics?.face ? ' · face' : ''}
                              </p>
                            </div>
                            <span style={{ ...mono, color: u.role === 'ADMIN' ? '#a855f7' : '#38bdf8', fontSize: '9px' }}>
                              {u.role === 'ADMIN' ? 'DASHBOARD' : 'HUD'}
                            </span>
                          </div>
                        ))}
                      </div>
                      {isAdmin && (
                        <div className="flex flex-col gap-3 rounded-xl p-3" style={{ border: '1px solid rgba(56,189,248,0.25)' }}>
                          <span style={{ ...mono, color: '#38bdf8', fontSize: '10px' }}>▸ ENROLER UN MEMBRE</span>
                          <Field label="NOM AFFICHÉ" value={enrollName} onChange={setEnrollName} placeholder="Ma fille" />
                          <Field label="USERNAME" value={enrollUser} onChange={setEnrollUser} placeholder="lea" hint="Optionnel — dérivé du nom si vide" />
                          <SelectDevice
                            label="RÔLE"
                            value={enrollRole}
                            onChange={v => setEnrollRole((v as 'USER' | 'CHILD') || 'CHILD')}
                            options={[
                              { id: 'CHILD', name: 'CHILD — HUD limité' },
                              { id: 'USER', name: 'USER — HUD + maison / média' },
                            ]}
                          />
                          <motion.button
                            type="button"
                            whileTap={{ scale: 0.98 }}
                            disabled={enrollBusy}
                            onClick={() => void enrollMember()}
                            className="rounded-xl px-4 py-2.5 cursor-pointer text-left"
                            style={{ background: 'rgba(56,189,248,0.1)', border: '1px solid rgba(56,189,248,0.35)' }}
                          >
                            <span style={{ ...mono, color: '#38bdf8', fontSize: '10px' }}>
                              {enrollBusy ? '… EN COURS' : '▸ CRÉER PROFIL (+ face / voix stubs)'}
                            </span>
                          </motion.button>
                          <p style={{ ...mono, color: 'rgba(255,255,255,0.3)', fontSize: '9px' }}>
                            Après lock : elle s’authentifie → JARVIS bascule son profil. Voiceprint réel = pipeline Core plus tard.
                          </p>
                        </div>
                      )}
                    </motion.div>
                  )}

                  {section === 'voix' && (
                    <motion.div key="voix" initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }} className="flex flex-col gap-4">
                      <WireHint>
                        Protocole : veille (wake « Jarvis ») → écoute commande « Jarvis … » → réflexion → réponse → micro repos.
                        Tout le reste (TV, autres personnes) est ignoré. Test micro = niveau orbe uniquement (pas STT).
                      </WireHint>
                      <Toggle
                        label="Voix activée"
                        value={prefs.voice.enabled}
                        onChange={v => patch(p => ({ ...p, voice: { ...p.voice, enabled: v } }))}
                        color="#19f0d8"
                      />
                      <Toggle
                        label="Wake word « Jarvis »"
                        value={prefs.voice.wakeWord}
                        onChange={v => patch(p => ({ ...p, voice: { ...p.voice, wakeWord: v } }))}
                        color="#19f0d8"
                        hint="Sort JARVIS de la léthargie — ensuite commande « Jarvis … »"
                      />
                      <Toggle
                        label="TTS (réponse parlée)"
                        value={prefs.voice.ttsEnabled}
                        onChange={v => patch(p => ({ ...p, voice: { ...p.voice, ttsEnabled: v } }))}
                        color="#19f0d8"
                      />
                      <SelectDevice
                        label="MICROPHONE"
                        value={prefs.voice.micDeviceId || ''}
                        onChange={v => patch(p => ({ ...p, voice: { ...p.voice, micDeviceId: v || null } }))}
                        options={micOptions}
                      />
                      <SelectDevice
                        label="SORTIE AUDIO"
                        value={prefs.voice.outputDeviceId || ''}
                        onChange={v => patch(p => ({ ...p, voice: { ...p.voice, outputDeviceId: v || null } }))}
                        options={outOptions}
                      />
                      <motion.button
                        type="button"
                        whileTap={{ scale: 0.98 }}
                        className="rounded-xl px-4 py-2.5 cursor-pointer text-left"
                        style={{
                          background: micTestActive ? 'rgba(34,197,94,0.12)' : 'rgba(25,240,216,0.08)',
                          border: `1px solid ${micTestActive ? 'rgba(34,197,94,0.45)' : 'rgba(25,240,216,0.25)'}`,
                        }}
                        onClick={() => void toggleMicTest()}
                      >
                        <span style={{ ...mono, color: micTestActive ? '#22c55e' : '#19f0d8', fontSize: '10px' }}>
                          {micTestActive
                            ? '▸ ARRÊTER TEST MICRO (orbe bas-gauche)'
                            : '▸ TESTER LE MICRO → orbe bas-gauche (niveau seul)'}
                        </span>
                      </motion.button>
                      {micTestActive && (
                        <p style={{ ...mono, color: 'rgba(34,197,94,0.8)', fontSize: '10px' }}>
                          STT / wake suspendus — parle pour voir l’orbe réagir. Évite de saturer Whisper.
                        </p>
                      )}
                    </motion.div>
                  )}

                  {section === 'vision' && (
                    <motion.div key="vision" initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }} className="flex flex-col gap-4">
                      <WireHint>
                        Contrôle gestuel = caméra ON + Holomat calibré. Préférences → Core
                        data/users/&lt;id&gt;/gesture_profile + hud_preferences. Calibration machine →
                        data/holomat/calibration.json. Admin Holomat (services) = Dashboard, pas ici.
                      </WireHint>

                      <Toggle
                        label="Holomat activé"
                        value={prefs.vision.holomatEnabled}
                        onChange={v => patch(p => ({ ...p, vision: { ...p.vision, holomatEnabled: v } }))}
                        color="#a855f7"
                      />
                      <SelectDevice
                        label="CAMÉRA"
                        value={prefs.vision.cameraDeviceId || ''}
                        onChange={v => patch(p => ({ ...p, vision: { ...p.vision, cameraDeviceId: v || null } }))}
                        options={camOptions.length ? camOptions : [{ id: '', name: '— Autoriser la caméra pour lister —' }]}
                      />

                      <motion.button
                        type="button"
                        whileTap={{ scale: 0.98 }}
                        className="rounded-xl px-4 py-2.5 cursor-pointer text-left"
                        style={{ background: 'rgba(168,85,247,0.1)', border: '1px solid rgba(168,85,247,0.3)' }}
                        onClick={() => void enableCameraForHolomat()}
                      >
                        <span style={{ ...mono, color: '#a855f7', fontSize: '10px' }}>▸ ALLUMER CAMÉRA (requis gestes / calib)</span>
                      </motion.button>

                      {(camPreviewOn || calibrating) && (
                        <div
                          className="relative rounded-xl overflow-hidden"
                          style={{
                            border: `1px solid ${calibrating ? 'rgba(168,85,247,0.55)' : 'rgba(168,85,247,0.25)'}`,
                            background: '#000',
                            aspectRatio: '16 / 10',
                            maxHeight: 220,
                          }}
                        >
                          <CameraPreview
                            active
                            className="w-full h-full"
                            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                          />
                          <div
                            className="absolute left-2 top-2 px-2 py-1 rounded"
                            style={{ background: 'rgba(0,0,0,0.55)', fontFamily: 'Share Tech Mono, monospace', fontSize: 9, color: calibrating ? '#a855f7' : '#22c55e' }}
                          >
                            {calibrating ? 'CALIBRATION · CADRE LE PLAN' : 'APERÇU CAMÉRA'}
                          </div>
                          {calibrating && (
                            <div
                              className="pointer-events-none absolute inset-6 rounded-lg"
                              style={{ border: '1px dashed rgba(168,85,247,0.5)' }}
                            />
                          )}
                        </div>
                      )}

                      <div className="rounded-xl p-3 flex flex-col gap-2" style={{ background: 'rgba(168,85,247,0.06)', border: '1px solid rgba(168,85,247,0.2)' }}>
                        <div className="flex items-center gap-2">
                          <Camera className="w-4 h-4" style={{ color: '#a855f7' }} />
                          <span style={{ ...mono, color: '#a855f7', fontSize: '10px' }}>STATUT HOLOMAT</span>
                        </div>
                        {[
                          { k: 'Caméra', v: prefs.killSwitch.cameraOff ? 'COUPÉE' : holoStatus.camera },
                          { k: 'Calibration', v: holoStatus.calibrated ? 'OK (persistée)' : 'non faite' },
                          { k: 'Main dominante', v: dominantHand === 'right' ? 'droite' : 'gauche' },
                          { k: 'Stockage', v: 'users/…/gesture_profile + holomat/calibration.json' },
                        ].map(row => (
                          <div key={row.k} className="flex justify-between gap-2">
                            <span style={{ ...mono, color: 'rgba(255,255,255,0.35)', fontSize: '10px' }}>{row.k}</span>
                            <span style={{ ...mono, color: 'rgba(168,85,247,0.8)', fontSize: '10px', textAlign: 'right' }}>{row.v}</span>
                          </div>
                        ))}
                        <div className="flex flex-col gap-2 mt-2">
                          <label style={{ ...mono, color: 'rgba(255,255,255,0.4)', fontSize: '10px' }}>
                            SENSIBILITÉ GESTES · {Math.round(sensitivity * 100)}%
                          </label>
                          <input
                            type="range" min={0.2} max={1} step={0.05}
                            value={sensitivity}
                            onChange={e => setSensitivity(parseFloat(e.target.value))}
                            className="w-full"
                          />
                          <div className="flex gap-2">
                            {(['left', 'right'] as const).map(h => (
                              <button
                                key={h}
                                type="button"
                                onClick={() => setDominantHand(h)}
                                className="flex-1 rounded-lg px-2 py-1.5 cursor-pointer"
                                style={{
                                  border: `1px solid ${dominantHand === h ? 'rgba(168,85,247,0.5)' : 'rgba(255,255,255,0.1)'}`,
                                  background: dominantHand === h ? 'rgba(168,85,247,0.2)' : 'transparent',
                                }}
                              >
                                <span style={{ ...mono, color: '#a855f7', fontSize: '9px' }}>{h === 'right' ? 'DROITE' : 'GAUCHE'}</span>
                              </button>
                            ))}
                          </div>
                        </div>
                        <div className="flex gap-2 mt-1">
                          <button
                            type="button"
                            disabled={calibrating}
                            onClick={() => void startCalibrate()}
                            className="flex-1 rounded-lg px-3 py-2 cursor-pointer"
                            style={{ background: 'rgba(168,85,247,0.15)', border: '1px solid rgba(168,85,247,0.35)', opacity: calibrating ? 0.6 : 1 }}
                          >
                            <span style={{ ...mono, color: '#a855f7', fontSize: '9px' }}>
                              {calibrating ? 'CALIBRATION…' : 'LANCER CALIBRATION'}
                            </span>
                          </button>
                          <button
                            type="button"
                            onClick={openLiveGestures}
                            className="flex-1 rounded-lg px-3 py-2 cursor-pointer flex items-center justify-center gap-1"
                            style={{ background: 'rgba(0,245,255,0.08)', border: '1px solid rgba(0,245,255,0.25)' }}
                          >
                            <Hand className="w-3 h-3" style={{ color: '#00f5ff' }} />
                            <span style={{ ...mono, color: '#00f5ff', fontSize: '9px' }}>VUE GESTES LIVE</span>
                          </button>
                        </div>
                      </div>

                      <div className="rounded-xl p-3 flex flex-col gap-2" style={{ background: 'rgba(0,5,15,0.5)', border: '1px solid rgba(168,85,247,0.15)' }}>
                        <div className="flex items-center gap-2 mb-1">
                          <Unlock className="w-4 h-4" style={{ color: '#a855f7' }} />
                          <span style={{ ...mono, color: 'rgba(255,255,255,0.6)', fontSize: '10px' }}>DÉVERROUILLAGE SESSION</span>
                        </div>
                        <Toggle
                          label="Auth caméra / Holomat pour déverrouiller"
                          value={prefs.vision.sessionUnlock.enabled}
                          onChange={v => patch(p => ({
                            ...p,
                            vision: { ...p.vision, sessionUnlock: { ...p.vision.sessionUnlock, enabled: v } },
                          }))}
                          color="#a855f7"
                          hint="Core enverra session_auth { phase, factors, confidence }"
                        />
                        <Toggle
                          label="Exiger visage"
                          value={prefs.vision.sessionUnlock.requireFace}
                          onChange={v => patch(p => ({
                            ...p,
                            vision: { ...p.vision, sessionUnlock: { ...p.vision.sessionUnlock, requireFace: v } },
                          }))}
                          color="#a855f7"
                        />
                        <Toggle
                          label="Exiger voix"
                          value={prefs.vision.sessionUnlock.requireVoice}
                          onChange={v => patch(p => ({
                            ...p,
                            vision: { ...p.vision, sessionUnlock: { ...p.vision.sessionUnlock, requireVoice: v } },
                          }))}
                          color="#a855f7"
                        />
                        <Toggle
                          label="Exiger geste de confirmation"
                          value={prefs.vision.sessionUnlock.requireGesture}
                          onChange={v => patch(p => ({
                            ...p,
                            vision: { ...p.vision, sessionUnlock: { ...p.vision.sessionUnlock, requireGesture: v } },
                          }))}
                          color="#a855f7"
                        />
                        <div className="flex flex-col gap-1.5 pt-1">
                          <div className="flex justify-between">
                            <label style={{ ...mono, color: 'rgba(255,255,255,0.4)', fontSize: '10px' }}>CONFIANCE MIN.</label>
                            <span style={{ ...mono, color: '#a855f7', fontSize: '10px' }}>
                              {Math.round(prefs.vision.sessionUnlock.minConfidence * 100)}%
                            </span>
                          </div>
                          <input
                            type="range" min="0.5" max="0.99" step="0.01"
                            value={prefs.vision.sessionUnlock.minConfidence}
                            onChange={e => patch(p => ({
                              ...p,
                              vision: {
                                ...p.vision,
                                sessionUnlock: { ...p.vision.sessionUnlock, minConfidence: parseFloat(e.target.value) },
                              },
                            }))}
                            className="w-full accent-purple-500"
                          />
                        </div>
                        <div className="flex gap-2 items-start mt-1">
                          <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" style={{ color: '#f59e0b' }} />
                          <span style={{ ...mono, color: 'rgba(245,158,11,0.75)', fontSize: '9px', lineHeight: 1.4 }}>
                            Les droits (admin vs enfant) restent au Policy Engine / Dashboard — ce panneau ne fait que le seuil d’identité.
                          </span>
                        </div>
                      </div>

                      <div className="flex flex-col gap-2">
                        <span style={{ ...mono, color: 'rgba(255,255,255,0.45)', fontSize: '10px' }}>MAPPING GESTES → ACTIONS</span>
                        {bindings.map((b, i) => (
                          <div
                            key={b.id}
                            className="flex items-center justify-between rounded-lg px-3 py-2"
                            style={{ background: 'rgba(0,5,15,0.5)', border: '1px solid rgba(255,255,255,0.06)' }}
                          >
                            <div>
                              <p style={{ ...raj, color: 'rgba(255,255,255,0.75)', fontSize: '13px' }}>{b.label}</p>
                              <p style={{ ...mono, color: 'rgba(168,85,247,0.7)', fontSize: '9px' }}>{b.action}</p>
                            </div>
                            <motion.button
                              type="button"
                              onClick={() => setBindings(list => list.map((x, j) => j === i ? { ...x, enabled: !x.enabled } : x))}
                              className="w-11 h-6 rounded-full relative cursor-pointer flex-shrink-0"
                              style={{
                                background: b.enabled ? 'rgba(168,85,247,0.3)' : 'rgba(255,255,255,0.06)',
                                border: `1px solid ${b.enabled ? '#a855f7' : 'rgba(255,255,255,0.12)'}`,
                              }}
                            >
                              <motion.div
                                animate={{ x: b.enabled ? 20 : 2 }}
                                className="absolute top-0.5 w-5 h-5 rounded-full"
                                style={{ background: b.enabled ? '#a855f7' : 'rgba(255,255,255,0.3)' }}
                              />
                            </motion.button>
                          </div>
                        ))}
                      </div>
                    </motion.div>
                  )}

                  {section === 'comportement' && (
                    <motion.div key="comportement" initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }} className="flex flex-col gap-3">
                      <WireHint>
                        Comportements UI locaux + flags pour le pipeline voix jarvis_ai (barge-in, boot audio).
                      </WireHint>
                      <Toggle
                        label="Afficher le transcript"
                        value={prefs.showTranscript}
                        onChange={v => patch(p => ({ ...p, showTranscript: v }))}
                      />
                      <Toggle
                        label="Boot cinématique"
                        value={prefs.cinematicBoot}
                        onChange={v => patch(p => ({ ...p, cinematicBoot: v }))}
                        hint="Équivalent touche B / ?boot=full du HUD jarvis_ai"
                      />
                      <Toggle
                        label="Barge-in (couper la voix en reparlant)"
                        value={prefs.bargeIn}
                        onChange={v => patch(p => ({ ...p, bargeIn: v }))}
                      />
                      <div className="rounded-xl p-3" style={{ background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.2)' }}>
                        <p style={{ ...mono, color: 'rgba(245,158,11,0.85)', fontSize: '10px', lineHeight: 1.45 }}>
                          Modèle IA, providers, clés API, services jarvis-* → Dashboard (figma2 / admin). Pas dans ce panneau.
                        </p>
                      </div>
                    </motion.div>
                  )}

                  {section === 'coupure' && (
                    <motion.div key="coupure" initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }} className="flex flex-col gap-3">
                      <WireHint>
                        Kill-switch immédiat (risque info) — distinct du modèle de permissions multi-users (Dashboard).
                      </WireHint>
                      <Toggle
                        label="Couper le micro"
                        value={prefs.killSwitch.micMuted}
                        onChange={v => patch(p => ({ ...p, killSwitch: { ...p.killSwitch, micMuted: v } }))}
                        color="#ef4444"
                      />
                      <Toggle
                        label="Éteindre la caméra"
                        value={prefs.killSwitch.cameraOff}
                        onChange={v => patch(p => ({ ...p, killSwitch: { ...p.killSwitch, cameraOff: v } }))}
                        color="#ef4444"
                      />
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>

            <div
              className="flex items-center justify-end gap-3 px-8 py-4 flex-shrink-0"
              style={{ borderTop: '1px solid rgba(0,245,255,0.08)' }}
            >
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => setSettingsOpen(false)}
                className="flex items-center gap-2 px-4 py-2 rounded-xl cursor-pointer"
                style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}
              >
                <RotateCcw className="w-3.5 h-3.5" style={{ color: 'rgba(255,255,255,0.4)' }} />
                <span style={{ ...mono, color: 'rgba(255,255,255,0.4)', fontSize: '10px' }}>FERMER</span>
              </motion.button>
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={handleSave}
                className="flex items-center gap-2 px-5 py-2 rounded-xl cursor-pointer"
                style={{
                  background: saved ? 'rgba(34,197,94,0.15)' : 'rgba(0,245,255,0.12)',
                  border: `1px solid ${saved ? 'rgba(34,197,94,0.4)' : 'rgba(0,245,255,0.35)'}`,
                  boxShadow: saved ? '0 0 12px rgba(34,197,94,0.2)' : '0 0 12px rgba(0,245,255,0.1)',
                }}
              >
                {saved ? (
                  <CheckCircle className="w-3.5 h-3.5" style={{ color: '#22c55e' }} />
                ) : (
                  <Save className="w-3.5 h-3.5" style={{ color: '#00f5ff' }} />
                )}
                <span style={{ ...mono, color: saved ? '#22c55e' : '#00f5ff', fontSize: '10px' }}>
                  {saved ? 'ENREGISTRÉ' : 'ENREGISTRER'}
                </span>
              </motion.button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
