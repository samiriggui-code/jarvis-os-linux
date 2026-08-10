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
import { VisionChrome, visionBody, visionCaption, visionTitle } from './visionChrome';
import { GlassButton, GlassPanel } from '../../components/glass/';
import { tokens } from '../../ui/tokens';

const labelStyle = {
  ...visionCaption,
  textTransform: 'none',
  letterSpacing: 0,
  fontSize: 12,
};
const compactLabelStyle = { ...labelStyle, fontSize: 11 };
const controlSurface = {
  background: tokens.color.surface,
  border: `1px solid ${tokens.color.border}`,
  color: tokens.color.text,
  fontFamily: tokens.font.body,
  fontSize: 13,
};

const LS_PREFS = 'jarvis.hud_preferences';
const LS_GESTURE = 'jarvis.gesture_profile';

type Section = 'profil' | 'voix' | 'vision' | 'comportement' | 'coupure' | 'foyer';

const SECTIONS: { id: Section; label: string; icon: React.ElementType; color: string }[] = [
  { id: 'profil', label: 'Profil', icon: User, color: tokens.color.accent },
  { id: 'foyer', label: 'Foyer', icon: Users, color: tokens.color.accent },
  { id: 'voix', label: 'Voix', icon: Mic, color: tokens.color.accent },
  { id: 'vision', label: 'Vision et Holomat', icon: Camera, color: tokens.color.accent },
  { id: 'comportement', label: 'Comportement', icon: SlidersHorizontal, color: tokens.color.warning },
  { id: 'coupure', label: 'Coupures', icon: ShieldAlert, color: tokens.color.danger },
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
      <label style={labelStyle}>{label}</label>
      <div
        className="flex items-center gap-2 rounded-xl px-3 py-2.5"
        style={{ ...controlSurface, borderRadius: tokens.radius.md }}
      >
        <input
          type="text"
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          className="flex-1 bg-transparent outline-none"
          style={{ color: tokens.color.text, fontFamily: tokens.font.body, fontSize: '13px' }}
        />
      </div>
      {hint && (
        <span style={{ ...visionBody, fontSize: 11 }}>{hint}</span>
      )}
    </div>
  );
}

function Toggle({ label, value, onChange, color = tokens.color.accent, hint }: {
  label: string; value: boolean; onChange: (v: boolean) => void; color?: string; hint?: string;
}) {
  return (
    <div className="py-2">
      <div className="flex items-center justify-between">
        <span style={visionBody}>{label}</span>
        <motion.button
          type="button"
          onClick={() => onChange(!value)}
          className="w-11 h-6 rounded-full relative cursor-pointer"
          style={{ background: value ? color : tokens.color.surfaceRaised, border: `1px solid ${value ? color : tokens.color.border}` }}
        >
          <motion.div
            animate={{ x: value ? 20 : 2 }}
            transition={{ type: 'spring', stiffness: 500, damping: 30 }}
            className="absolute top-0.5 w-5 h-5 rounded-full"
            style={{ background: value ? '#fff' : tokens.color.textMuted }}
          />
        </motion.button>
      </div>
      {hint && (
        <p style={{ ...visionBody, fontSize: 11, marginTop: 4 }}>{hint}</p>
      )}
    </div>
  );
}

function WireHint({ children }: { children: React.ReactNode }) {
  return (
    <VisionChrome level="subtle">
      <div className="flex gap-2 items-start">
        <Info className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: tokens.color.accent }} />
        <span style={visionBody}>{children}</span>
      </div>
    </VisionChrome>
  );
}

function SelectDevice({ label, value, onChange, options }: {
  label: string; value: string; onChange: (v: string) => void;
  options: { id: string; name: string }[];
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label style={labelStyle}>{label}</label>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className="rounded-xl px-3 py-2.5 outline-none cursor-pointer"
        style={{
          fontFamily: tokens.font.body,
          fontSize: '13px',
          color: tokens.color.text,
          background: tokens.color.surface,
          border: `1px solid ${tokens.color.border}`,
          borderRadius: tokens.radius.md,
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
          style={{ zIndex: 180, background: 'rgba(8, 8, 10, 0.64)', backdropFilter: tokens.glass }}
        >
          <motion.div
            initial={{ scale: 0.92, y: 16 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.92, y: 16 }}
            transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
            className="w-full max-w-3xl overflow-hidden flex flex-col"
            style={{
              maxHeight: 'calc(100dvh - 1.5rem)',
              borderRadius: tokens.radius.lg,
              background: tokens.color.void,
              border: `1px solid ${tokens.color.border}`,
              boxShadow: '0 28px 64px -20px rgba(0,0,0,0.7)',
            }}
          >
            <div
              className="flex items-center justify-between px-5 py-3 flex-shrink-0"
              style={{ borderBottom: `1px solid ${tokens.color.border}`, background: tokens.color.surface }}
            >
              <div>
                <h2 style={visionTitle}>
                  Paramètres
                </h2>
                <p style={{ ...visionBody, fontSize: 12, marginTop: 4 }}>
                  Expérience HUD · Voix · Holomat — admin / clés API → Dashboard
                </p>
              </div>
              <GlassButton
                aria-label="Fermer les paramètres"
                tone="neutral"
                icon={<X className="w-4 h-4" />}
                onClick={() => setSettingsOpen(false)}
                style={{ padding: 10, color: tokens.color.textMuted }}
              />
            </div>

            <div className="flex flex-1 min-h-0 overflow-hidden hud-settings-body">
              <div
                className="w-48 flex flex-col gap-1 p-3 flex-shrink-0 overflow-y-auto hud-settings-nav"
                style={{ borderRight: `1px solid ${tokens.color.border}` }}
              >
                {SECTIONS.map(s => (
                  <motion.button
                    key={s.id}
                    whileHover={{ x: 2 }}
                    onClick={() => selectSection(s.id)}
                    className="flex items-center gap-3 px-3 py-3 rounded-xl cursor-pointer text-left"
                    style={{
                      background: section === s.id ? tokens.color.surfaceRaised : 'transparent',
                      border: `1px solid ${section === s.id ? tokens.color.borderActive : 'transparent'}`,
                      borderRadius: tokens.radius.md,
                    }}
                  >
                    <s.icon className="w-4 h-4" style={{ color: section === s.id ? s.color : tokens.color.textMuted }} />
                    <span style={{ ...visionBody, color: section === s.id ? tokens.color.text : tokens.color.textMuted, fontSize: 13 }}>
                      {s.label}
                    </span>
                  </motion.button>
                ))}
              </div>

              <GlassPanel
                level="subtle"
                radius="md"
                padding={0}
                className="flex-1 min-h-0 overflow-y-auto m-3"
                style={{ scrollbarWidth: 'thin', scrollbarColor: `${tokens.color.border} transparent` }}
              >
                <div className="p-5">
                <AnimatePresence mode="wait">
                  {section === 'profil' && (
                    <motion.div key="profil" initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }} className="flex flex-col gap-4">
                      <WireHint>
                        Persistera dans users/&lt;id&gt;/hud_preferences — Memory Manager / profil local. Pas de secrets ici.
                      </WireHint>
                      <div className="flex items-center gap-4 mb-1">
                        <div
                          className="w-14 h-14 rounded-2xl flex items-center justify-center"
                          style={{ background: tokens.color.accentSoft, border: `1px solid ${tokens.color.border}`, borderRadius: tokens.radius.lg }}
                        >
                          <User className="w-7 h-7" style={{ color: tokens.color.accent }} />
                        </div>
                        <div>
                          <p style={{ ...visionTitle, fontSize: 16 }}>{prefs.displayName}</p>
                          <p style={{ ...visionBody, fontSize: 12 }}>
                            {coreAuth?.user?.role || '—'} · {prefs.assistantName}
                          </p>
                        </div>
                      </div>
                      <Field label="Nom affiché" value={prefs.displayName} onChange={v => patch(p => ({ ...p, displayName: v }))} />
                      <Field label="Nom de l’assistant" value={prefs.assistantName} onChange={v => patch(p => ({ ...p, assistantName: v }))} placeholder="Jarvis" />
                      <Field
                        label="Identifiant utilisateur"
                        value={prefs.userId}
                        onChange={v => patch(p => ({ ...p, userId: v }))}
                        hint="Lie face + voice + locale + permissions (Core)"
                      />
                      <Field
                        label="Face ID (Holomat)"
                        value={prefs.locale.faceId || ''}
                        onChange={v => patch(p => ({ ...p, locale: { ...p.locale, faceId: v || null } }))}
                        placeholder="samir_001"
                        hint="Après auth face → charge ce profil + langue + voix TTS"
                      />
                      <SelectDevice
                        label="Langue principale"
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
                        label="Langues acceptées"
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
                        label="Mode langue"
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
                        label="Voix TTS"
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
                        <p style={{ ...visionBody, color: tokens.color.warning }}>
                          Lecture seule — enrollment réservé à l’admin.
                        </p>
                      )}
                      <div className="flex flex-col gap-2">
                        {family.length === 0 ? (
                          <p style={{ ...visionBody, fontSize: 12 }}>
                            Aucun membre listé (Core offline ou pas admin).
                          </p>
                        ) : family.map(u => (
                          <div
                            key={u.id}
                            className="rounded-xl px-3 py-2.5 flex justify-between gap-2"
                            style={{ background: tokens.color.surface, border: `1px solid ${tokens.color.border}`, borderRadius: tokens.radius.md }}
                          >
                            <div>
                              <p style={{ ...visionTitle, fontSize: 14 }}>
                                {u.display_name || u.username}
                              </p>
                              <p style={{ ...visionBody, fontSize: 11 }}>
                                @{u.username} · {u.role}
                                {u.biometrics?.voice ? ' · voix' : ''}
                                {u.biometrics?.face ? ' · face' : ''}
                              </p>
                            </div>
                            <span style={{ ...compactLabelStyle, color: u.role === 'ADMIN' ? tokens.color.accent : tokens.color.textMuted }}>
                              {u.role === 'ADMIN' ? 'DASHBOARD' : 'HUD'}
                            </span>
                          </div>
                        ))}
                      </div>
                      {isAdmin && (
                        <VisionChrome title="Enrôler un membre" level="subtle">
                          <div className="flex flex-col gap-3">
                          <Field label="Nom affiché" value={enrollName} onChange={setEnrollName} placeholder="Ma fille" />
                          <Field label="Username" value={enrollUser} onChange={setEnrollUser} placeholder="lea" hint="Optionnel — dérivé du nom si vide" />
                          <SelectDevice
                            label="Rôle"
                            value={enrollRole}
                            onChange={v => setEnrollRole((v as 'USER' | 'CHILD') || 'CHILD')}
                            options={[
                              { id: 'CHILD', name: 'CHILD — HUD limité' },
                              { id: 'USER', name: 'USER — HUD + maison / média' },
                            ]}
                          />
                          <GlassButton
                            tone="accent"
                            active
                            disabled={enrollBusy}
                            onClick={() => void enrollMember()}
                          >
                            {enrollBusy ? 'Création en cours…' : 'Créer le profil'}
                          </GlassButton>
                          <p style={{ ...visionBody, fontSize: 11 }}>
                            Après lock : elle s’authentifie → JARVIS bascule son profil. Voiceprint réel = pipeline Core plus tard.
                          </p>
                          </div>
                        </VisionChrome>
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
                        color={tokens.color.accent}
                      />
                      <Toggle
                        label="Wake word « Jarvis »"
                        value={prefs.voice.wakeWord}
                        onChange={v => patch(p => ({ ...p, voice: { ...p.voice, wakeWord: v } }))}
                        color={tokens.color.accent}
                        hint="Sort JARVIS de la léthargie — ensuite commande « Jarvis … »"
                      />
                      <Toggle
                        label="TTS (réponse parlée)"
                        value={prefs.voice.ttsEnabled}
                        onChange={v => patch(p => ({ ...p, voice: { ...p.voice, ttsEnabled: v } }))}
                        color={tokens.color.accent}
                      />
                      <SelectDevice
                        label="Microphone"
                        value={prefs.voice.micDeviceId || ''}
                        onChange={v => patch(p => ({ ...p, voice: { ...p.voice, micDeviceId: v || null } }))}
                        options={micOptions}
                      />
                      <SelectDevice
                        label="Sortie audio"
                        value={prefs.voice.outputDeviceId || ''}
                        onChange={v => patch(p => ({ ...p, voice: { ...p.voice, outputDeviceId: v || null } }))}
                        options={outOptions}
                      />
                      <GlassButton
                        tone={micTestActive ? 'success' : 'accent'}
                        active={micTestActive}
                        onClick={() => void toggleMicTest()}
                      >
                        {micTestActive ? 'Arrêter le test du micro' : 'Tester le microphone'}
                      </GlassButton>
                      {micTestActive && (
                        <p style={{ ...visionBody, color: tokens.color.success, fontSize: 12 }}>
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
                        color={tokens.color.accent}
                      />
                      <SelectDevice
                        label="Caméra"
                        value={prefs.vision.cameraDeviceId || ''}
                        onChange={v => patch(p => ({ ...p, vision: { ...p.vision, cameraDeviceId: v || null } }))}
                        options={camOptions.length ? camOptions : [{ id: '', name: '— Autoriser la caméra pour lister —' }]}
                      />

                      <GlassButton
                        tone="accent"
                        onClick={() => void enableCameraForHolomat()}
                      >
                        Activer la caméra
                      </GlassButton>

                      {(camPreviewOn || calibrating) && (
                        <div
                          className="relative rounded-xl overflow-hidden"
                          style={{
                            border: `1px solid ${calibrating ? tokens.color.borderActive : tokens.color.border}`,
                            background: '#000',
                            aspectRatio: '16 / 10',
                            maxHeight: 220,
                            borderRadius: tokens.radius.md,
                          }}
                        >
                          <CameraPreview
                            active
                            className="w-full h-full"
                            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                          />
                          <div
                            className="absolute left-2 top-2 px-2 py-1 rounded"
                            style={{ background: 'rgba(0,0,0,0.55)', ...compactLabelStyle, color: calibrating ? tokens.color.accent : tokens.color.success }}
                          >
                            {calibrating ? 'Calibration · Cadrez le plan' : 'Aperçu caméra'}
                          </div>
                          {calibrating && (
                            <div
                              className="pointer-events-none absolute inset-6 rounded-lg"
                              style={{ border: `1px dashed ${tokens.color.borderActive}` }}
                            />
                          )}
                        </div>
                      )}

                      <VisionChrome title="Statut Holomat" level="subtle">
                        <div className="flex flex-col gap-2">
                        <div className="flex items-center gap-2">
                          <Camera className="w-4 h-4" style={{ color: tokens.color.accent }} />
                          <span style={compactLabelStyle}>État actuel</span>
                        </div>
                        {[
                          { k: 'Caméra', v: prefs.killSwitch.cameraOff ? 'Coupée' : holoStatus.camera },
                          { k: 'Calibration', v: holoStatus.calibrated ? 'OK (persistée)' : 'non faite' },
                          { k: 'Main dominante', v: dominantHand === 'right' ? 'droite' : 'gauche' },
                          { k: 'Stockage', v: 'users/…/gesture_profile + holomat/calibration.json' },
                        ].map(row => (
                          <div key={row.k} className="flex justify-between gap-2">
                            <span style={{ ...visionBody, fontSize: 12 }}>{row.k}</span>
                            <span style={{ ...visionBody, color: tokens.color.text, fontSize: 12, textAlign: 'right' }}>{row.v}</span>
                          </div>
                        ))}
                        <div className="flex flex-col gap-2 mt-2">
                          <label style={labelStyle}>
                            Sensibilité des gestes · {Math.round(sensitivity * 100)}%
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
                                  border: `1px solid ${dominantHand === h ? tokens.color.borderActive : tokens.color.border}`,
                                  background: dominantHand === h ? tokens.color.accentSoft : 'transparent',
                                }}
                              >
                                <span style={compactLabelStyle}>{h === 'right' ? 'Droite' : 'Gauche'}</span>
                              </button>
                            ))}
                          </div>
                        </div>
                        <div className="flex gap-2 mt-1">
                          <GlassButton
                            tone="accent"
                            active
                            disabled={calibrating}
                            onClick={() => void startCalibrate()}
                            style={{ flex: 1 }}
                          >
                            {calibrating ? 'Calibration…' : 'Lancer la calibration'}
                          </GlassButton>
                          <GlassButton
                            tone="accent"
                            icon={<Hand className="w-3 h-3" />}
                            onClick={openLiveGestures}
                            style={{ flex: 1, justifyContent: 'center' }}
                          >
                            Vue gestes live
                          </GlassButton>
                        </div>
                        </div>
                      </VisionChrome>

                      <VisionChrome title="Déverrouillage de session" level="subtle">
                        <div className="flex flex-col gap-2">
                        <div className="flex items-center gap-2 mb-1">
                          <Unlock className="w-4 h-4" style={{ color: tokens.color.accent }} />
                          <span style={compactLabelStyle}>Facteurs d’identité</span>
                        </div>
                        <Toggle
                          label="Auth caméra / Holomat pour déverrouiller"
                          value={prefs.vision.sessionUnlock.enabled}
                          onChange={v => patch(p => ({
                            ...p,
                            vision: { ...p.vision, sessionUnlock: { ...p.vision.sessionUnlock, enabled: v } },
                          }))}
                          color={tokens.color.accent}
                          hint="Core enverra session_auth { phase, factors, confidence }"
                        />
                        <Toggle
                          label="Exiger visage"
                          value={prefs.vision.sessionUnlock.requireFace}
                          onChange={v => patch(p => ({
                            ...p,
                            vision: { ...p.vision, sessionUnlock: { ...p.vision.sessionUnlock, requireFace: v } },
                          }))}
                          color={tokens.color.accent}
                        />
                        <Toggle
                          label="Exiger voix"
                          value={prefs.vision.sessionUnlock.requireVoice}
                          onChange={v => patch(p => ({
                            ...p,
                            vision: { ...p.vision, sessionUnlock: { ...p.vision.sessionUnlock, requireVoice: v } },
                          }))}
                          color={tokens.color.accent}
                        />
                        <Toggle
                          label="Exiger geste de confirmation"
                          value={prefs.vision.sessionUnlock.requireGesture}
                          onChange={v => patch(p => ({
                            ...p,
                            vision: { ...p.vision, sessionUnlock: { ...p.vision.sessionUnlock, requireGesture: v } },
                          }))}
                          color={tokens.color.accent}
                        />
                        <div className="flex flex-col gap-1.5 pt-1">
                          <div className="flex justify-between">
                            <label style={labelStyle}>Confiance minimale</label>
                            <span style={{ ...visionBody, color: tokens.color.accent }}>
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
                          <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" style={{ color: tokens.color.warning }} />
                          <span style={{ ...visionBody, color: tokens.color.warning, fontSize: 11 }}>
                            Les droits (admin vs enfant) restent au Policy Engine / Dashboard — ce panneau ne fait que le seuil d’identité.
                          </span>
                        </div>
                        </div>
                      </VisionChrome>

                      <div className="flex flex-col gap-2">
                        <span style={labelStyle}>Gestes et actions</span>
                        {bindings.map((b, i) => (
                          <div
                            key={b.id}
                            className="flex items-center justify-between rounded-lg px-3 py-2"
                            style={{ background: tokens.color.surface, border: `1px solid ${tokens.color.border}`, borderRadius: tokens.radius.md }}
                          >
                            <div>
                              <p style={visionBody}>{b.label}</p>
                              <p style={{ ...visionBody, color: tokens.color.textMuted, fontSize: 11 }}>{b.action}</p>
                            </div>
                            <motion.button
                              type="button"
                              onClick={() => setBindings(list => list.map((x, j) => j === i ? { ...x, enabled: !x.enabled } : x))}
                              className="w-11 h-6 rounded-full relative cursor-pointer flex-shrink-0"
                              style={{
                                background: b.enabled ? tokens.color.accent : tokens.color.surfaceRaised,
                                border: `1px solid ${b.enabled ? tokens.color.accent : tokens.color.border}`,
                              }}
                            >
                              <motion.div
                                animate={{ x: b.enabled ? 20 : 2 }}
                                className="absolute top-0.5 w-5 h-5 rounded-full"
                                style={{ background: b.enabled ? '#fff' : tokens.color.textMuted }}
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
                      <VisionChrome title="Administration" level="subtle">
                        <p style={{ ...visionBody, color: tokens.color.warning }}>
                          Modèle IA, providers, clés API, services jarvis-* → Dashboard (figma2 / admin). Pas dans ce panneau.
                        </p>
                      </VisionChrome>
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
                        color={tokens.color.danger}
                      />
                      <Toggle
                        label="Éteindre la caméra"
                        value={prefs.killSwitch.cameraOff}
                        onChange={v => patch(p => ({ ...p, killSwitch: { ...p.killSwitch, cameraOff: v } }))}
                        color={tokens.color.danger}
                      />
                    </motion.div>
                  )}
                </AnimatePresence>
                </div>
              </GlassPanel>
            </div>

            <div
              className="flex items-center justify-end gap-3 px-8 py-4 flex-shrink-0"
              style={{ borderTop: `1px solid ${tokens.color.border}` }}
            >
              <GlassButton
                onClick={() => setSettingsOpen(false)}
                icon={<RotateCcw className="w-3.5 h-3.5" />}
              >
                Fermer
              </GlassButton>
              <GlassButton
                tone={saved ? 'success' : 'accent'}
                active
                onClick={handleSave}
                icon={saved
                  ? <CheckCircle className="w-3.5 h-3.5" />
                  : <Save className="w-3.5 h-3.5" />}
              >
                {saved ? 'Enregistré' : 'Enregistrer'}
              </GlassButton>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
