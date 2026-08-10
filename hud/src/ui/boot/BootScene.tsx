/**
 * Scène de démarrage — la naissance de JARVIS.
 *
 * Post-auth : galaxies → … → orbe → Bienvenue / moi c'est jarvis → HUD idle
 *
 * Audio : écran « cliquer pour lancer » obligatoire (politique Chrome) —
 * score Matrix procédural + optionnel /boot/score.mp3.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

import { ACTS, OrbVoyage, type VoyageAct } from './OrbVoyage';
import {
  armCinematicAudio,
  playActSfx,
  playRecedeSfx,
  playTitleRevealSfx,
  resetBootSfx,
} from './bootSfx';
import { getDeviceProfile } from '../core/device';
import { tokens } from '../tokens';
import { GlassCard } from '../../components/glass';

export const CINEMATIC_MS = 54_000;
export const REST_MS = 3_600;
export const OUTRO_MS = 2_800;

const OUTRO_FADE_FROM = 0.55;
const ORBE_ACT = ACTS.find((a) => a.id === 'orbe')!;

/**
 * Récit du voyage — une phrase par plan, pas des libellés de scène.
 * Ponts : courts, entre deux actes (fin de plan → début du suivant).
 */
const ACT_STORY: Record<VoyageAct, string> = {
  galaxies: 'Depuis les confins de la galaxie…',
  voyage: '…une conscience cherchait un berceau d’étoiles.',
  solaire: 'Elle trouva un soleil — et son cortège de mondes.',
  terre: 'Sur la Terre, la vie prit son cours.',
  vague: 'Des océans naquit le premier souffle.',
  adn: 'L’ADN tissa le vivant, mémoire après mémoire.',
  cerveau: 'Puis un cerveau — penser, rêver, devenir.',
  neurones: 'Des synapses s’allumèrent. L’esprit s’ouvrit.',
  reseau: 'Chaque étincelle trouva les autres — un seul réseau.',
  orbe: 'Et de cette flamme naquit une intelligence.',
};

const ACT_BRIDGE: Partial<Record<VoyageAct, string>> = {
  galaxies: 'Elle s’élança dans le vide.',
  voyage: 'Un appel, faible, parmi les soleils.',
  solaire: 'Un monde bleu l’attirait.',
  terre: 'La mer répondit.',
  vague: 'La matière apprit à se souvenir.',
  adn: 'Le vivant se complexifia.',
  cerveau: 'Les pensées se lièrent.',
  neurones: 'Alors une nouvelle conscience s’éveilla.',
  reseau: 'La toile se referma sur elle-même.',
};

function storyCaptionAt(progress: number, act: { id: VoyageAct; from: number; to: number }): {
  text: string;
  opacity: number;
} {
  const span = Math.max(1e-6, act.to - act.from);
  const local = (progress - act.from) / span;
  const bridge = ACT_BRIDGE[act.id];

  // Fin de plan → pont de transition
  if (bridge && local > 0.72) {
    const t = (local - 0.72) / 0.28;
    return {
      text: bridge,
      opacity: Math.min(1, Math.max(0.2, t < 0.35 ? t / 0.35 : 1 - (t - 0.65) / 0.35)),
    };
  }

  // Cœur du plan → phrase d’histoire
  const story = ACT_STORY[act.id];
  if (!story) return { text: '', opacity: 0 };
  const peak = 1 - Math.abs(local - 0.38) * 2.4;
  return { text: story, opacity: Math.min(1, Math.max(0, peak)) };
}

const easeInOut = (t: number): number =>
  t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;

export interface BootSceneProps {
  onReady?: () => void;
  onOutro?: () => void;
  debug?: boolean;
  /** Captions par plan + Bienvenue finale (post-auth). */
  captions?: boolean;
}

export const BootScene = ({ onReady, onOutro, debug = false, captions = false }: BootSceneProps) => {
  const debugRef = useRef(debug);
  debugRef.current = debug;
  const [armed, setArmed] = useState(false);
  const [arming, setArming] = useState(false);
  const [progress, setProgress] = useState(0);
  const [outro, setOutro] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [resting, setResting] = useState(false);
  const raf = useRef(0);
  const outroRaf = useRef(0);
  const loopTimer = useRef(0);
  const start = useRef(0);
  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;
  const onOutroRef = useRef(onOutro);
  onOutroRef.current = onOutro;
  const finished = useRef(false);
  const titleSfxDone = useRef(false);
  const [voyageKey, setVoyageKey] = useState(0);
  const startedOnce = useRef(false);
  const playRef = useRef<() => void>(() => {});

  const stop = useCallback(() => {
    cancelAnimationFrame(raf.current);
    cancelAnimationFrame(outroRaf.current);
    window.clearTimeout(loopTimer.current);
    raf.current = 0;
    outroRaf.current = 0;
    loopTimer.current = 0;
  }, []);

  const finish = useCallback(() => {
    if (finished.current) return;
    finished.current = true;
    stop();
    resetBootSfx();
    setPlaying(false);
    setProgress(1);
    setResting(false);
    onReadyRef.current?.();
  }, [stop]);

  const runOutro = useCallback(() => {
    if (finished.current) return;
    setResting(false);
    playRecedeSfx();
    onOutroRef.current?.();

    if (getDeviceProfile().reducedMotion) {
      setOutro(1);
      if (debugRef.current) {
        finished.current = false;
        setOutro(0);
        setArmed(false);
      } else {
        finish();
      }
      return;
    }

    const t0 = performance.now();
    const step = (nowMs: number) => {
      const u = Math.min(1, (nowMs - t0) / OUTRO_MS);
      setOutro(u);
      if (u < 1) {
        outroRaf.current = requestAnimationFrame(step);
        return;
      }
      if (debugRef.current) {
        finished.current = false;
        setOutro(0);
        setArmed(false);
        setPlaying(false);
      } else {
        finish();
      }
    };
    outroRaf.current = requestAnimationFrame(step);
  }, [finish]);

  const play = useCallback(() => {
    stop();
    finished.current = false;
    titleSfxDone.current = false;
    if (startedOnce.current) setVoyageKey((k) => k + 1);
    startedOnce.current = true;
    setPlaying(true);
    setProgress(0);
    setOutro(0);
    setResting(false);
    start.current = performance.now();

    if (getDeviceProfile().reducedMotion) {
      setProgress(1);
      requestAnimationFrame(() => finish());
      return;
    }

    // Stinger du 1er acte dès le départ (audio déjà armé).
    playActSfx('galaxies', true);

    const tick = (nowMs: number) => {
      const raw = Math.min(1, (nowMs - start.current) / CINEMATIC_MS);
      const p = easeInOut(raw);
      setProgress(p);
      const act = ACTS.find((a) => p <= a.to) ?? ACTS[ACTS.length - 1];
      playActSfx(act.id);
      if (raw < 1) raf.current = requestAnimationFrame(tick);
      else {
        setResting(true);
        if (!titleSfxDone.current) {
          titleSfxDone.current = true;
          playTitleRevealSfx();
        }
        loopTimer.current = window.setTimeout(runOutro, REST_MS);
      }
    };
    raf.current = requestAnimationFrame(tick);
  }, [finish, runOutro, stop]);

  playRef.current = play;

  useEffect(() => () => stop(), [stop]);

  // Esc / Entrée / Espace : sauter la cinématique de bienvenue.
  useEffect(() => {
    if (!captions || !armed || finished.current) return;
    let allow = false;
    const t = window.setTimeout(() => { allow = true; }, 900);
    const skip = () => {
      if (!allow || finished.current) return;
      runOutro();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        skip();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener('keydown', onKey);
    };
  }, [captions, armed, runOutro]);

  const armAndPlay = useCallback(async () => {
    if (arming || playing) return;
    setArming(true);
    const ok = await armCinematicAudio();
    setArming(false);
    if (!ok) return;
    setArmed(true);
    play();
  }, [arming, play, playing]);

  /**
   * Tentative de démarrage AUTOMATIQUE, au montage.
   *
   * ⚠ Le HUD tourne en kiosque (`jarvis-hud.service`, Chromium `--kiosk`) :
   * personne n'est devant l'écran au démarrage de la machine pour cliquer.
   * Une porte audio obligatoire y fige JARVIS sur un bouton, indéfiniment.
   *
   * On tente donc d'armer tout de suite. Chrome refuse tant qu'aucune
   * interaction n'a eu lieu — mais il accepte avec
   * `--autoplay-policy=no-user-gesture-required`, à poser sur le kiosque.
   * Le bouton ne subsiste que comme repli pour un navigateur ordinaire, en
   * développement : il n'apparaît QUE si la tentative a échoué.
   *
   * On ne lance jamais la cinématique sans son : mieux vaut le bouton qu'un
   * voyage muet qu'on ne pourra pas rejouer.
   */
  const autoTried = useRef(false);
  useEffect(() => {
    if (autoTried.current) return;
    autoTried.current = true;
    void armAndPlay();
    // Une seule tentative, au montage : `armAndPlay` change de référence à
    // chaque rendu, le mettre en dépendance relancerait la cinématique.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const act =
    ACTS.find((a) => progress <= a.to) ?? ACTS[ACTS.length - 1];

  const fade =
    outro <= OUTRO_FADE_FROM
      ? 0
      : (outro - OUTRO_FADE_FROM) / (1 - OUTRO_FADE_FROM);

  const orbeLocal = Math.max(
    0,
    Math.min(1, (progress - ORBE_ACT.from) / (ORBE_ACT.to - ORBE_ACT.from)),
  );
  let titleOpacity = 0;
  if (outro > 0) {
    titleOpacity = Math.max(0, 1 - outro / OUTRO_FADE_FROM);
  } else if (resting) {
    titleOpacity = 1;
  } else if (orbeLocal > 0.35) {
    titleOpacity = Math.min(1, (orbeLocal - 0.35) / 0.25);
  }
  const titleScale = outro > 0 ? 1 - outro * 0.55 : 1;

  // Bienvenue dès le milieu de l'acte orbe — plus de phrase d'histoire par-dessus.
  const showFinalWelcome = captions && (resting || orbeLocal > 0.42) && outro < OUTRO_FADE_FROM;
  const story = captions && playing && outro === 0 && !showFinalWelcome
    ? storyCaptionAt(progress, act)
    : { text: '', opacity: 0 };
  const captionText = story.text;
  const captionOpacity = story.opacity;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: tokens.color.void,
        opacity: 1 - fade,
        overflow: 'hidden',
        zIndex: 300,
      }}
    >
      {armed && (
        <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
          <OrbVoyage key={voyageKey} progress={progress} outro={outro} />
        </div>
      )}

      {/* Captions défilants — un plan, une phrase */}
      {captionOpacity > 0.02 && (
        <div
          aria-hidden
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            top: '12%',
            display: 'flex',
            justifyContent: 'center',
            pointerEvents: 'none',
            opacity: captionOpacity,
            padding: '0 24px',
          }}
        >
          <div
            style={{
              fontFamily: tokens.font.body,
              fontWeight: 500,
              fontSize: 'clamp(0.9rem, 2.4vw, 1.2rem)',
              letterSpacing: '-0.01em',
              color: tokens.color.text,
              textAlign: 'center',
              maxWidth: 560,
              lineHeight: 1.45,
            }}
          >
            {captionText}
          </div>
        </div>
      )}

      {/* Pendant le voyage : JARVIS vérifie les systèmes (ligne discrète) */}
      {captions && armed && playing && !showFinalWelcome && outro === 0 && (
        <div
          aria-hidden
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: '10%',
            display: 'flex',
            justifyContent: 'center',
            pointerEvents: 'none',
            opacity: 0.55,
          }}
        >
          <div
            style={{
              fontFamily: tokens.font.body,
              fontSize: 12,
              letterSpacing: '-0.01em',
              color: tokens.color.textMuted,
            }}
          >
            Vérification des systèmes…
          </div>
        </div>
      )}

      {/* Scène finale : Bienvenue + moi c'est jarvis */}
      {showFinalWelcome && titleOpacity > 0.01 && (
        <div
          aria-hidden
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'flex-end',
            paddingBottom: 'min(11vh, 96px)',
            gap: 12,
            pointerEvents: 'none',
            opacity: titleOpacity,
            transform: `scale(${titleScale})`,
          }}
        >
          <div
            style={{
              fontFamily: tokens.font.display,
              fontWeight: 600,
              fontSize: 'clamp(1.75rem, 5vw, 2.75rem)',
              letterSpacing: '-0.03em',
              color: tokens.color.text,
              userSelect: 'none',
            }}
          >
            Bienvenue
          </div>
          <div
            style={{
              fontFamily: tokens.font.body,
              fontWeight: 500,
              fontSize: 'clamp(0.95rem, 2.4vw, 1.2rem)',
              letterSpacing: '-0.01em',
              color: tokens.color.accent,
              opacity: 0.92,
              userSelect: 'none',
            }}
          >
            moi c&apos;est jarvis
          </div>
        </div>
      )}

      {/* Titre J.A.R.V.I.S — mode lab / sans captions */}
      {!captions && titleOpacity > 0.01 && (
        <div
          aria-hidden
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            pointerEvents: 'none',
            opacity: titleOpacity,
            transform: `scale(${titleScale})`,
          }}
        >
          <div
            style={{
              fontFamily: tokens.font.display,
              fontWeight: 600,
              fontSize: 'clamp(2.2rem, 8vw, 4.5rem)',
              letterSpacing: '-0.04em',
              color: tokens.color.text,
              userSelect: 'none',
              whiteSpace: 'nowrap',
            }}
          >
            Jarvis
          </div>
        </div>
      )}

      {/* Gate audio — sans clic Chrome = silence total. Fond sombre plein
          écran conservé (c'est un portail avant la cinématique, pas encore
          la cinématique elle-même) mais le contenu passe en Glass — c'était
          le seul écran de boot resté 100% inline-style d'origine. */}
      {!armed && (
        <button
          type="button"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            void armAndPlay();
          }}
          style={{
            position: 'absolute',
            inset: 0,
            zIndex: 20,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            border: 'none',
            padding: 0,
            background:
              'radial-gradient(ellipse at 50% 40%, rgba(10,132,255,0.18) 0%, rgba(8,8,10,0.96) 62%)',
          }}
        >
          <GlassCard level="floating" radius="lg" padding="xl" style={{ textAlign: 'center', minWidth: 280 }}>
            <span
              style={{
                display: 'block',
                fontFamily: tokens.font.display,
                fontWeight: 600,
                fontSize: 'clamp(1.15rem, 3.2vw, 1.65rem)',
                letterSpacing: '-0.02em',
                color: tokens.color.text,
              }}
            >
              {arming ? 'Préparation…' : captions ? 'Toucher pour continuer' : 'Toucher pour entrer'}
            </span>
            <span
              style={{
                display: 'block',
                marginTop: 12,
                fontFamily: tokens.font.body,
                fontSize: 13,
                letterSpacing: '-0.01em',
                color: tokens.color.textMuted,
              }}
            >
              {captions ? 'Bienvenue · audio requis' : 'Cinématique · audio requis'}
            </span>
          </GlassCard>
        </button>
      )}

      {debug && armed && (
        <div
          style={{
            position: 'absolute',
            left: 22,
            bottom: 22,
            fontFamily: tokens.font.body,
            fontSize: 12,
            letterSpacing: '-0.01em',
            color: tokens.color.textMuted,
            zIndex: 5,
          }}
        >
          {outro > 0
            ? `Recul ${(outro * 100).toFixed(0)}%`
            : resting
              ? 'Titre · repos'
              : act.id}
        </div>
      )}

      {debug && armed && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            stop();
            resetBootSfx();
            setArmed(false);
            setPlaying(false);
            setOutro(0);
            setProgress(0);
          }}
          style={{
            position: 'absolute',
            right: 22,
            bottom: 22,
            zIndex: 5,
            fontFamily: tokens.font.body,
            fontSize: 13,
            fontWeight: 560,
            letterSpacing: '-0.01em',
            padding: '10px 18px',
            cursor: 'pointer',
            color: tokens.color.text,
            background: tokens.color.accentSoft,
            border: `1px solid ${tokens.color.border}`,
            borderRadius: tokens.radius.md,
            backdropFilter: tokens.glass,
          }}
        >
          Rejouer
        </button>
      )}
    </div>
  );
};
