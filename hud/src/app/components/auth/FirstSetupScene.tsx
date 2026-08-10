/**
 * FirstSetupScene — formulaire d'enrôlement (clic) puis face + voix.
 * Flux : boot → prénom → civilité → naissance → visage → voix ×3 → done.
 * Après HUD chargé : plus de champs — on parle, Jarvis exécute.
 */
import React, { useEffect, useRef, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import { Mic, User, Check, RotateCcw, Calendar } from 'lucide-react';
import { initTtsDev, stopDev } from '../../bridge/ttsDev';
import { authEnroll, authStatus, setLastUsername } from '../../bridge/authClient';
import { captureEnrollmentPhrase } from '../../bridge/micRecorder';
import { commitVoiceEnroll, VOICE_CHALLENGE } from '../../bridge/voiceAuthLive';
import { runFaceEnrollLive, commitFaceEnroll } from '../../bridge/faceAuthLive';
import { FaceCamView } from './FaceCamView';
import { getCoreClient } from '../../bridge/coreClient';
import { jarvisSay, type CivilTitle } from '../../bridge/voiceConfirm';
import { ensureMic, getMediaState, tryPrimeMic } from '../../bridge/mediaDevices';
import { startAudioBus } from '../../bridge/audioBus';
import {
  INITIAL_BOOT_CHECKS,
  SystemBootOverlay,
  runSystemBootGate,
  type BootCheck,
} from './SystemBootGate';
import { AuthVoiceWave } from './AuthVoiceWave';
import { useMicOrbAnalyser } from './useMicOrbAnalyser';
import { OrbSpatial } from './OrbSpatial';
import { GlassButton, GlassPanel } from '../../../components/glass';
import { tokens } from '../../../ui/tokens';
import { Background } from '../Background';
import { ThemeModeToggle } from '../ThemeModeToggle';
import { visionTitle, visionCaption, visionBody } from '../visionChrome';

function slugUsername(display: string): string {
  const s = display
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 24);
  return s || 'user';
}

const orbF = { fontFamily: tokens.font.display, fontWeight: 600, letterSpacing: '-0.02em' };
const body = { fontFamily: tokens.font.body, letterSpacing: '-0.01em' };

const TITLE_OPTS: { id: CivilTitle; label: string }[] = [
  { id: 'monsieur', label: 'Monsieur' },
  { id: 'madame', label: 'Madame' },
  { id: 'mademoiselle', label: 'Mademoiselle' },
];

type SetupPhase =
  | 'system_boot'
  | 'boot' // homonyme commande WS Core — lu par architecture/phases_interface
  | 'form_name'
  | 'form_title'
  | 'form_birth'
  | 'face_enroll'
  | 'voice_enroll'
  | 'complete';

const PHASE_LABELS: Record<Exclude<SetupPhase, 'boot'>, string> = {
  system_boot: 'Démarrage',
  form_name: 'Prénom',
  form_title: 'Civilité',
  form_birth: 'Naissance',
  face_enroll: 'Visage',
  voice_enroll: 'Voix',
  complete: 'Terminé',
};

const FORM_DOTS: SetupPhase[] = [
  'form_name',
  'form_title',
  'form_birth',
  'face_enroll',
  'voice_enroll',
  'complete',
];

interface Props {
  mode?: 'first_run' | 'add_profile';
  onComplete?: () => void;
  presetName?: string;
}

export function FirstSetupScene({ mode = 'first_run', onComplete, presetName }: Props) {
  const isAddProfile = mode === 'add_profile';
  const isFirstAdmin = !isAddProfile;

  const [phase, setPhase] = useState<SetupPhase>('system_boot');
  const [bootChecks, setBootChecks] = useState<BootCheck[]>(INITIAL_BOOT_CHECKS);
  const [bootBlocked, setBootBlocked] = useState<string | null>(null);
  const [bootSubtext, setBootSubtext] = useState('Verification des systemes');

  const [nameDraft, setNameDraft] = useState(presetName?.trim() || '');
  const [nameConfirm, setNameConfirm] = useState(false);
  const [titleDraft, setTitleDraft] = useState<CivilTitle | null>(null);
  const [titleConfirm, setTitleConfirm] = useState(false);
  const [birthDraft, setBirthDraft] = useState('');
  const [birthConfirm, setBirthConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [hudText, setHudText] = useState('ENROLEMENT');
  const [hudSub, setHudSub] = useState('Remplissez le formulaire');

  const [faceReady, setFaceReady] = useState(false);
  const [faceProgress, setFaceProgress] = useState(0);
  const [voiceReady, setVoiceReady] = useState(false);
  const [voiceTake, setVoiceTake] = useState<{ index: number; total: number } | null>(null);
  const [micOk, setMicOk] = useState(false);
  const [listeningActive, setListeningActive] = useState(false);
  const { micAnalyser, micLevel } = useMicOrbAnalyser(
    micOk && (listeningActive || phase === 'face_enroll' || phase === 'voice_enroll'),
  );

  const aliveRef = useRef(true);
  const nameRef = useRef('');
  const titleRef = useRef<CivilTitle | null>(null);
  const birthRef = useRef<string | null>(null);
  const enrollUserIdRef = useRef<string | null>(null);
  const enrollUsernameSlugRef = useRef<string | null>(null);
  const adminDoneRef = useRef(false);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;
  const runVoiceRef = useRef<() => Promise<void>>(async () => {});

  const ensureMicReady = useCallback(async (): Promise<boolean> => {
    const stream = (await tryPrimeMic()) || (await ensureMic());
    if (!stream || getMediaState().mic !== 'granted') {
      await jarvisSay('Autorisez le microphone pour continuer.');
      return false;
    }
    setMicOk(true);
    void startAudioBus();
    return true;
  }, []);

  const ensureSqlUser = useCallback(async (): Promise<{ id: string; username: string } | null> => {
    if (enrollUserIdRef.current && enrollUsernameSlugRef.current) {
      return { id: enrollUserIdRef.current, username: enrollUsernameSlugRef.current };
    }
    const role = isAddProfile || adminDoneRef.current ? 'USER' : 'ADMIN';
    const name = nameRef.current || (role === 'ADMIN' ? 'admin' : 'membre');
    const slug = slugUsername(name);
    try {
      const res = await authEnroll({
        username: slug,
        display_name: name,
        pin: '0000',
        face: false,
        voice: false,
        role,
        title: titleRef.current || undefined,
        birth_date: birthRef.current || undefined,
      });
      if (!res.ok || !res.user?.id) {
        const err = (res.error || 'echec creation profil').trim();
        const taken = /déjà pris|deja pris|already|taken|exists/i.test(err);
        setHudText(taken ? 'NOM DEJA PRIS' : 'ECHEC ENROLEMENT');
        setHudSub(err);
        await jarvisSay(
          taken
            ? `Le prenom ${name} est deja enregistre. Choisissez un autre prenom.`
            : `Impossible de creer le profil. ${err}`,
        );
        return null;
      }
      enrollUserIdRef.current = res.user.id;
      enrollUsernameSlugRef.current = res.user.username || slug;
      setLastUsername(enrollUsernameSlugRef.current);
      if (titleRef.current) {
        try {
          getCoreClient().send({
            type: 'preferences',
            action: 'save_hud_preferences',
            user_id: enrollUserIdRef.current,
            prefs: { title: titleRef.current, displayName: name },
          });
        } catch { /* */ }
      }
      if (role === 'ADMIN') adminDoneRef.current = true;
      return { id: enrollUserIdRef.current, username: enrollUsernameSlugRef.current };
    } catch (e) {
      console.warn('[first-setup] auth.enroll impossible', e);
      return null;
    }
  }, [isAddProfile]);

  const runFace = useCallback(async () => {
    setPhase('face_enroll');
    setHudText('ENROLEMENT FACIAL');
    setHudSub('Regardez la camera');
    setFaceProgress(0);
    setListeningActive(true);
    await ensureMicReady();
    await jarvisSay('Placez-vous face a la camera. Je capture votre visage.');

    const user = await ensureSqlUser();
    if (!user) {
      setListeningActive(false);
      setPhase('form_name');
      return;
    }

    const ok = await runFaceEnrollLive({
      userId: user.id,
      username: user.username,
      isAlive: () => aliveRef.current,
      patchFace: (update) => {
        if (!aliveRef.current) return;
        if (typeof update.progress === 'number') setFaceProgress(update.progress);
      },
      patchHud: (t, s) => {
        setHudText(t);
        if (s) setHudSub(s);
      },
    });
    if (!aliveRef.current) return;
    if (!ok) {
      setListeningActive(false);
      await jarvisSay('Capture faciale echouee. Reessayons.');
      return runFace();
    }
    const committed = await commitFaceEnroll(user.username, user.id);
    if (!committed) {
      setListeningActive(false);
      await jarvisSay('Enregistrement facial echoue.');
      return;
    }
    setFaceReady(true);
    setFaceProgress(100);
    setListeningActive(false);
    await jarvisSay('Visage enregistre. Passons a la voix.');
    void runVoiceRef.current();
  }, [ensureMicReady, ensureSqlUser]);

  const runVoice = useCallback(async () => {
    setPhase('voice_enroll');
    setHudText('ENROLEMENT VOCAL');
    setHudSub(`Dites : « ${VOICE_CHALLENGE} »`);
    setListeningActive(true);
    if (!(await ensureMicReady())) return;

    const user = await ensureSqlUser();
    if (!user) {
      setListeningActive(false);
      return;
    }

    await jarvisSay(`Repetez trois fois : ${VOICE_CHALLENGE}`);
    const takes = await captureEnrollmentPhrase(3, 5_000, (i, total) => {
      if (!aliveRef.current) return;
      setVoiceTake({ index: i, total });
    });
    if (!aliveRef.current) return;
    setVoiceTake(null);
    const kept = takes.filter((t) => t.ok && t.text.trim());
    if (kept.length < 2) {
      setListeningActive(false);
      await jarvisSay('Pas assez de prises vocales. Reessayons.');
      return runVoice();
    }
    const ok = await commitVoiceEnroll(user.id, kept.map((t) => t.text));
    if (!ok) {
      setListeningActive(false);
      await jarvisSay('Enregistrement vocal echoue.');
      return;
    }
    setVoiceReady(true);
    setListeningActive(false);
    setPhase('complete');
    setHudText('PROFIL CREE');
    setHudSub(`Bienvenue ${nameRef.current}`);
    await jarvisSay(`Profil cree. Bienvenue ${titleRef.current || ''} ${nameRef.current}.`.replace(/\s+/g, ' '));
    try { localStorage.setItem('jarvis_first_run', '1'); } catch { /* */ }
    onCompleteRef.current?.();
  }, [ensureMicReady, ensureSqlUser]);
  runVoiceRef.current = runVoice;

  // Boot puis formulaire
  useEffect(() => {
    initTtsDev();
    aliveRef.current = true;
    let cancelled = false;

    (async () => {
      const blocked = await runSystemBootGate({
        setChecks: setBootChecks,
        setHudSubtext: setBootSubtext,
        onBlocked: setBootBlocked,
      });
      if (cancelled || !aliveRef.current) return;
      if (blocked) return;

      const st = await authStatus().catch(() => null);
      if (st?.first_run === false && isFirstAdmin) {
        setBootBlocked('already_configured');
        return;
      }

      setPhase('form_name');
      setHudText('PRENOM');
      setHudSub('Tapez votre prenom');
      await jarvisSay('Bienvenue. Tapez votre prenom, puis validez.');
    })().catch((e) => console.debug('[first-setup] boot', e));

    return () => {
      cancelled = true;
      aliveRef.current = false;
      stopDev();
    };
  }, [isFirstAdmin]);

  const proposeName = async () => {
    const v = nameDraft.trim();
    if (!v || busy) return;
    setBusy(true);
    try {
      nameRef.current = v;
      setNameConfirm(true);
      setHudText('CONFIRMATION');
      setHudSub(`Prenom : ${v}`);
      await jarvisSay(`Vous avez choisi ${v}. Cliquez sur Valider, ou Reprendre.`);
    } finally {
      setBusy(false);
    }
  };

  const validateName = async () => {
    if (busy) return;
    setBusy(true);
    try {
      setNameConfirm(false);
      setPhase('form_title');
      setHudText('CIVILITE');
      setHudSub('Monsieur, Madame ou Mademoiselle');
      await jarvisSay('Choisissez comment je dois vous appeler : Monsieur, Madame, ou Mademoiselle.');
    } finally {
      setBusy(false);
    }
  };

  const proposeTitle = async (t: CivilTitle) => {
    if (busy) return;
    setBusy(true);
    try {
      setTitleDraft(t);
      titleRef.current = t;
      setTitleConfirm(true);
      const label = TITLE_OPTS.find((x) => x.id === t)?.label || t;
      setHudText('CONFIRMATION');
      setHudSub(label);
      await jarvisSay(`Vous avez choisi ${label}. Cliquez sur Valider, ou Reprendre.`);
    } finally {
      setBusy(false);
    }
  };

  const validateTitle = async () => {
    if (busy) return;
    setBusy(true);
    try {
      setTitleConfirm(false);
      setPhase('form_birth');
      setHudText('DATE DE NAISSANCE');
      setHudSub('Format AAAA-MM-JJ');
      await jarvisSay('Indiquez votre date de naissance, puis validez.');
    } finally {
      setBusy(false);
    }
  };

  const proposeBirth = async () => {
    const v = birthDraft.trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(v) || busy) return;
    setBusy(true);
    try {
      birthRef.current = v;
      setBirthConfirm(true);
      setHudText('CONFIRMATION');
      setHudSub(`Naissance : ${v}`);
      await jarvisSay(`Date de naissance ${v}. Cliquez sur Valider, ou Reprendre.`);
    } finally {
      setBusy(false);
    }
  };

  const validateBirth = async () => {
    if (busy) return;
    setBusy(true);
    try {
      setBirthConfirm(false);
      setHudText('CREATION DU PROFIL');
      setHudSub('Enregistrement…');
      const user = await ensureSqlUser();
      if (!user) {
        setPhase('form_name');
        setNameConfirm(false);
        return;
      }
      await jarvisSay('Profil enregistre. Passons a l enrolement facial.');
      setBusy(false);
      void runFace();
    } finally {
      setBusy(false);
    }
  };

  const accentColor = phase === 'complete' ? tokens.color.success : tokens.color.accent;
  const inSystemBoot = phase === 'system_boot' || bootBlocked !== null;
  const displayName = nameRef.current || nameDraft;
  const protocolLabel = isAddProfile ? 'Enrôlement · Utilisateur' : 'Installation · Administrateur';
  const dotPhase = phase === 'system_boot' ? 'form_name' : phase;
  const dotIndex = Math.max(0, FORM_DOTS.indexOf(dotPhase as typeof FORM_DOTS[number]));

  const waveMode =
    voiceReady || faceReady ? 'ok'
    : phase === 'voice_enroll' || phase === 'face_enroll' || listeningActive ? 'listening'
    : 'idle';

  return (
    <motion.div
      className="fixed inset-0 z-[300] flex flex-col items-center justify-center overflow-hidden"
      style={{ background: `radial-gradient(ellipse at 50% 20%, ${tokens.color.accentSoft} 0%, ${tokens.color.void} 62%)` }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.5 }}
    >
      <Background />
      <div className="absolute top-3 right-3 z-20">
        <ThemeModeToggle compact />
      </div>

      <AnimatePresence>
        {inSystemBoot && (
          <SystemBootOverlay
            checks={bootChecks}
            msg={bootBlocked ?? 'INITIALISATION'}
            subtext={bootBlocked ? 'Utilisez le code de secours ou rechargez' : bootSubtext}
            blocked={bootBlocked !== null}
          />
        )}
      </AnimatePresence>

      {!inSystemBoot && (
        <>
          <div
            className="relative z-10 flex flex-col items-center w-full mx-4"
            style={{
              maxWidth: phase === 'face_enroll' ? 'min(640px, 100%)' : 'min(440px, 100%)',
              gap: 12,
            }}
          >
            <GlassPanel
              level="regular"
              radius="md"
              padding="sm"
              className="w-full flex flex-col items-center gap-3 overflow-y-auto"
              style={{ maxHeight: '92dvh' }}
            >
              <div className="text-center shrink-0">
                <p style={{ ...visionCaption, color: accentColor, fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase', margin: 0 }}>
                  JARVIS
                </p>
                <h1 style={{ ...orbF, color: tokens.color.text, fontSize: 'clamp(18px, 3.2vw, 24px)', margin: '6px 0 0' }}>
                  Enrôlement
                </h1>
                <p style={{ ...visionCaption, marginTop: 4, fontSize: 11 }}>{protocolLabel}</p>
              </div>

              <div className="flex flex-col items-center gap-1.5 shrink-0">
                <div className="flex gap-2 items-center">
                  {FORM_DOTS.map((p, i) => {
                    const isCurrent = i === dotIndex;
                    const isDone = i < dotIndex;
                    return (
                      <React.Fragment key={p}>
                        <div
                          className="w-2 h-2 rounded-full"
                          style={{
                            background: isDone ? tokens.color.success : isCurrent ? accentColor : tokens.color.surfaceRaised,
                          }}
                        />
                        {i < FORM_DOTS.length - 1 && (
                          <div style={{ width: 14, height: 1, background: isDone ? tokens.color.success : tokens.color.border }} />
                        )}
                      </React.Fragment>
                    );
                  })}
                </div>
                <p style={{ ...visionCaption, fontSize: 10 }}>
                  {PHASE_LABELS[phase]} · étape {dotIndex + 1} / {FORM_DOTS.length}
                </p>
              </div>

              <AnimatePresence mode="wait">
                <motion.div
                  key={`${hudText}|${hudSub}`}
                  className="text-center shrink-0"
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                >
                  <p style={{ ...visionTitle, fontSize: 13 }}>{hudText}</p>
                  <p style={{ ...visionBody, fontSize: 11, marginTop: 3 }}>{hudSub}</p>
                </motion.div>
              </AnimatePresence>

              {/* ── Formulaire prénom ── */}
              {phase === 'form_name' && !nameConfirm && (
                <div className="w-full flex flex-col gap-3">
                  <div
                    className="flex items-center gap-2 px-4 py-3 rounded-2xl"
                    style={{ border: `1px solid ${tokens.color.borderActive}`, background: tokens.color.surfaceRaised }}
                  >
                    <User className="w-4 h-4 flex-shrink-0" style={{ color: tokens.color.accent }} />
                    <input
                      type="text"
                      autoFocus
                      value={nameDraft}
                      onChange={(e) => setNameDraft(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && void proposeName()}
                      placeholder="Votre prénom"
                      className="flex-1 bg-transparent outline-none"
                      disabled={busy}
                      style={{ ...body, fontSize: 13, color: tokens.color.text }}
                    />
                  </div>
                  <GlassButton tone="accent" active disabled={!nameDraft.trim() || busy} onClick={() => void proposeName()} style={orbF}>
                    Continuer
                  </GlassButton>
                </div>
              )}
              {phase === 'form_name' && nameConfirm && (
                <div className="flex items-center justify-center gap-3">
                  <GlassButton tone="success" active disabled={busy} icon={<Check className="w-4 h-4" />} onClick={() => void validateName()} style={body}>
                    Valider
                  </GlassButton>
                  <GlassButton
                    tone="warning"
                    active
                    disabled={busy}
                    icon={<RotateCcw className="w-4 h-4" />}
                    onClick={() => { setNameConfirm(false); void jarvisSay('Reprenons. Tapez votre prenom.'); }}
                    style={body}
                  >
                    Reprendre
                  </GlassButton>
                </div>
              )}

              {/* ── Civilité ── */}
              {phase === 'form_title' && !titleConfirm && (
                <div className="w-full flex flex-col gap-2">
                  {TITLE_OPTS.map((opt) => (
                    <GlassButton
                      key={opt.id}
                      tone={titleDraft === opt.id ? 'accent' : 'neutral'}
                      active={titleDraft === opt.id}
                      disabled={busy}
                      onClick={() => void proposeTitle(opt.id)}
                      style={{ ...body, width: '100%', justifyContent: 'center' }}
                    >
                      {opt.label}
                    </GlassButton>
                  ))}
                </div>
              )}
              {phase === 'form_title' && titleConfirm && (
                <div className="flex items-center justify-center gap-3">
                  <GlassButton tone="success" active disabled={busy} icon={<Check className="w-4 h-4" />} onClick={() => void validateTitle()} style={body}>
                    Valider
                  </GlassButton>
                  <GlassButton
                    tone="warning"
                    active
                    disabled={busy}
                    icon={<RotateCcw className="w-4 h-4" />}
                    onClick={() => { setTitleConfirm(false); setTitleDraft(null); void jarvisSay('Choisissez a nouveau la civilite.'); }}
                    style={body}
                  >
                    Reprendre
                  </GlassButton>
                </div>
              )}

              {/* ── Naissance ── */}
              {phase === 'form_birth' && !birthConfirm && (
                <div className="w-full flex flex-col gap-3">
                  <div
                    className="flex items-center gap-2 px-4 py-3 rounded-2xl"
                    style={{ border: `1px solid ${tokens.color.borderActive}`, background: tokens.color.surfaceRaised }}
                  >
                    <Calendar className="w-4 h-4 flex-shrink-0" style={{ color: tokens.color.accent }} />
                    <input
                      type="date"
                      autoFocus
                      value={birthDraft}
                      onChange={(e) => setBirthDraft(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && void proposeBirth()}
                      className="flex-1 bg-transparent outline-none"
                      disabled={busy}
                      style={{ ...body, fontSize: 13, color: tokens.color.text }}
                    />
                  </div>
                  <GlassButton
                    tone="accent"
                    active
                    disabled={!/^\d{4}-\d{2}-\d{2}$/.test(birthDraft) || busy}
                    onClick={() => void proposeBirth()}
                    style={orbF}
                  >
                    Continuer
                  </GlassButton>
                </div>
              )}
              {phase === 'form_birth' && birthConfirm && (
                <div className="flex items-center justify-center gap-3">
                  <GlassButton tone="success" active disabled={busy} icon={<Check className="w-4 h-4" />} onClick={() => void validateBirth()} style={body}>
                    Valider
                  </GlassButton>
                  <GlassButton
                    tone="warning"
                    active
                    disabled={busy}
                    icon={<RotateCcw className="w-4 h-4" />}
                    onClick={() => { setBirthConfirm(false); void jarvisSay('Reprenons la date de naissance.'); }}
                    style={body}
                  >
                    Reprendre
                  </GlassButton>
                </div>
              )}

              {/* ── Face agentic ── */}
              {phase === 'face_enroll' && (
                <div className="flex flex-col items-center gap-3 w-full">
                  <div
                    className="relative w-full overflow-hidden"
                    style={{
                      height: 'clamp(160px, 32dvh, 280px)',
                      maxHeight: 'clamp(160px, 32dvh, 280px)',
                      borderRadius: tokens.radius.md,
                    }}
                  >
                    <FaceCamView
                      active
                      fill
                      progress={faceProgress}
                      label={faceReady ? 'Visage · prêt' : 'Visage · capture'}
                    />
                  </div>
                  <div className="w-full" style={{ maxHeight: 28 }}>
                    <AuthVoiceWave mode={waveMode} level={Math.max(0.08, micLevel)} />
                  </div>
                  {!micOk && (
                    <GlassButton tone="accent" active icon={<Mic className="w-4 h-4" />} onClick={() => void ensureMicReady()} style={{ ...orbF, fontSize: 10 }}>
                      Autoriser le micro
                    </GlassButton>
                  )}
                </div>
              )}

              {/* ── Voix ── */}
              {phase === 'voice_enroll' && (
                <div className="flex flex-col items-center gap-3 w-full">
                  <div className="w-full" style={{ maxHeight: 28 }}>
                    <AuthVoiceWave mode={waveMode} level={micLevel} />
                  </div>
                  {!micOk && (
                    <GlassButton tone="accent" active icon={<Mic className="w-4 h-4" />} onClick={() => void ensureMicReady()} style={{ ...orbF, fontSize: 10 }}>
                      Autoriser le micro
                    </GlassButton>
                  )}
                  {voiceTake && (
                    <div className="text-center">
                      <p style={{ ...visionTitle, color: tokens.color.accent, fontSize: 12 }}>
                        Passe {voiceTake.index} / {voiceTake.total}
                      </p>
                      <p style={{ ...visionBody, fontSize: 11 }}>Dites : « {VOICE_CHALLENGE} »</p>
                    </div>
                  )}
                </div>
              )}

              {phase === 'complete' && (
                <div className="text-center">
                  <p style={{ ...visionTitle, color: tokens.color.success, fontSize: 15 }}>Profil créé</p>
                  <p style={{ ...visionBody, fontSize: 12, marginTop: 6 }}>Bienvenue {displayName}.</p>
                </div>
              )}
            </GlassPanel>
          </div>

          {createPortal(
            <div
              className="pointer-events-none"
              style={{
                position: 'fixed',
                right: 'max(20px, env(safe-area-inset-right))',
                bottom: 'max(28px, calc(env(safe-area-inset-bottom) + 20px))',
                zIndex: 400,
                width: 96,
                height: 96,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                overflow: 'visible',
              }}
              aria-hidden
            >
              <OrbSpatial
                size={72}
                veille={!(phase === 'voice_enroll' || listeningActive || voiceReady)}
                analyser={phase === 'voice_enroll' || phase === 'face_enroll' ? micAnalyser : null}
                state={
                  voiceReady ? 'responding'
                  : phase === 'voice_enroll' || listeningActive ? 'listening'
                  : 'idle'
                }
                volume={listeningActive ? Math.max(0.08, Math.min(0.45, micLevel * 0.85 + 0.06)) : 0.08}
                playbackVolume={0}
              />
            </div>,
            document.body,
          )}
        </>
      )}
    </motion.div>
  );
}

export default FirstSetupScene;
