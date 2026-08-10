/**
 * Surveillance des périphériques — caméra, microphone, sortie audio.
 *
 * Le Core ne voit aucun de ces trois : ils appartiennent au navigateur. C'est
 * donc le HUD qui les rapporte, et lui seul peut le faire. Sans ça, le Core
 * en était réduit à déduire l'état de la caméra depuis celui des modèles de
 * reconnaissance — deux pannes distinctes confondues en une.
 *
 * ─── DEUX SIGNAUX DIFFÉRENTS ────────────────────────────────────────────
 *
 *   matériel absent   → `enumerateDevices()` ne liste aucune entrée du type
 *   accès refusé      → le matériel est là, c'est la permission qui manque
 *
 * La distinction est tout sauf cosmétique : « Raccordez une caméra sur un
 * port USB » envoie chercher un câble déjà branché quand le vrai problème
 * est une case à cocher dans les réglages du système.
 *
 * ─── ON NE RAPPORTE QUE LES CHANGEMENTS ─────────────────────────────────
 *
 * `devicechange` part en rafale quand on branche un hub USB. Le Core ne parle
 * que sur transition, mais autant ne pas lui envoyer trente messages
 * identiques : le dernier état émis est mémorisé ici.
 */
import { getCoreClient } from './coreClient';
import { ensureMic, subscribeMedia, type MediaDevicesState } from './mediaDevices';

export type PeripheralId = 'camera' | 'mic' | 'audio_out';

type Report = { ok: boolean; reason: string };

/** Dernier état ENVOYÉ, pas dernier état observé — c'est ce qui filtre. */
const lastSent = new Map<PeripheralId, string>();

function send(device: PeripheralId, report: Report) {
  const key = `${report.ok}:${report.reason}`;
  if (lastSent.get(device) === key) return;
  lastSent.set(device, key);
  getCoreClient().send({ type: 'peripheral', device, ...report });
  console.debug('[peripheral]', device, report);
}

async function listKinds(): Promise<Record<string, number>> {
  if (typeof navigator === 'undefined' || !navigator.mediaDevices?.enumerateDevices) {
    return {};
  }
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices.reduce<Record<string, number>>((acc, d) => {
      acc[d.kind] = (acc[d.kind] ?? 0) + 1;
      return acc;
    }, {});
  } catch {
    return {};
  }
}

/**
 * Croise présence matérielle et permission.
 *
 * L'ordre compte : le matériel d'abord. Un `denied` sur un port vide n'a pas
 * de sens à annoncer, et c'est l'état dans lequel Chrome se met quand la
 * demande porte sur un périphérique qui n'existe pas.
 */
function resolve(present: boolean, permission: MediaDevicesState['camera']): Report {
  if (!present) return { ok: false, reason: 'absent' };
  if (permission === 'denied') return { ok: false, reason: 'denied' };
  if (permission === 'granted') return { ok: true, reason: '' };
  // 'idle' / 'requesting' : le matériel est là, on n'a pas encore demandé.
  // Ce n'est PAS une panne — se taire plutôt qu'annoncer un incident qui
  // n'existe que parce que personne n'a encore ouvert le flux.
  return { ok: true, reason: 'present' };
}

/**
 * Sortie audio — la présence n'y est PAS un fait observable directement.
 *
 * Le navigateur n'énumère les sorties qu'une fois le MICRO autorisé : Chrome
 * les masque tant que la permission manque, Firefox ne les expose jamais par
 * défaut. Une liste vide ne veut donc dire « rien n'est branché » que si la
 * permission est accordée ; sinon elle ne veut rien dire du tout.
 *
 * `resolve()` ne convient pas ici : il teste la présence EN PREMIER, et
 * rendrait `absent` sur une liste vide alors que personne n'a encore demandé
 * le micro. C'est ce qui faisait annoncer « Vérifiez le raccordement HDMI »
 * sur une machine dont rien n'était débranché, et envoyait chercher un câble
 * quand il fallait cliquer sur une autorisation — précisément ce que
 * l'en-tête de ce fichier interdit.
 *
 * L'ordre est donc inversé : la permission d'abord, la présence ensuite.
 */
function resolveAudioOut(present: boolean, mic: MediaDevicesState['mic']): Report {
  if (mic === 'denied') return { ok: false, reason: 'denied' };
  // Tant que le micro n'a pas été demandé, on ne sait rien — et on se tait.
  // Annoncer une panne qui n'existe que parce que personne n'a encore ouvert
  // le flux est le mode de panne que ce fichier combat.
  if (mic !== 'granted') return { ok: true, reason: 'present' };
  return present ? { ok: true, reason: '' } : { ok: false, reason: 'absent' };
}

/**
 * Demande d'autorisation quand un capteur semble ABSENT — une fois par type.
 *
 * ─── LE SERPENT QUI SE MORD LA QUEUE ────────────────────────────────────
 *
 * `enumerateDevices()` ne révèle pas un périphérique tant qu'aucune
 * autorisation n'a été accordée sur l'origine : la liste revient vide, ou
 * peuplée d'entrées anonymes. La sonde en concluait « absent », et comme rien
 * n'ouvrait jamais de flux, aucune invite n'apparaissait — donc l'énumération
 * restait muette. Rien ne sortait de cette boucle.
 *
 * C'est ce qui donne « pas de caméra détectée, uniquement l'audio » sur une
 * machine dont la webcam est parfaitement branchée : le micro avait été
 * autorisé à un moment, la caméra jamais.
 *
 * Seul `getUserMedia()` déclenche l'invite du navigateur. On la demande donc
 * AVANT de conclure à une absence.
 *
 * ─── TROIS PRÉCAUTIONS ──────────────────────────────────────────────────
 *
 * · UNE SEULE FOIS par type. Chrome bloque définitivement une origine après
 *   trois demandes congédiées : redemander à chaque `devicechange`
 *   condamnerait l'origine en quelques secondes, sans que personne comprenne.
 *
 * · On ne demande QUE si la permission est `idle`. Un `denied` explicite est
 *   une décision de l'utilisateur, pas un état à forcer.
 *
 * · La caméra passe par `withCamera()`, qui la REND. Une sonde de permission
 *   ne doit pas laisser la webcam allumée derrière elle, diode comprise.
 *   Le micro, lui, suit son propre contrat (cf. bas de `mediaDevices.ts`).
 */
const probed = { mic: false };

async function probeIfSilent(
  kinds: Record<string, number>,
  media: MediaDevicesState,
): Promise<void> {
  const tasks: Promise<unknown>[] = [];

  // Ne PAS sonder la caméra avec getUserMedia au démarrage HUD.
  // Auth = voix ; cameraSleepByDefault. enumerateDevices suffit pour « présente ».
  if (!probed.mic && (kinds.audioinput ?? 0) === 0 && media.mic === 'idle') {
    probed.mic = true;
    console.info('[peripheral] aucun micro listé — demande d’autorisation');
    tasks.push(ensureMic());
  }

  // `allSettled` : un refus sur l'un ne doit pas empêcher l'autre d'aboutir.
  // `ensureMic` et `ensureCamera` avalent déjà leurs erreurs, mais la
  // garantie est ici, à l'endroit où on l'attend en lisant.
  if (tasks.length) await Promise.allSettled(tasks);
}

let started = false;

export function startPeripheralWatch(): () => void {
  if (started || typeof navigator === 'undefined') return () => { /* déjà armé */ };
  started = true;

  let media: MediaDevicesState = { mic: 'idle', camera: 'idle' };

  const report = async () => {
    const kinds = await listKinds();

    // ⚠ Avant de conclure à une absence, DEMANDER. Voir `probeIfSilent`.
    await probeIfSilent(kinds, media);

    // La sonde a pu débloquer l'énumération : on relit plutôt que de
    // rapporter la photo d'avant, sinon le premier verdict serait toujours
    // « absent » et il faudrait attendre un `devicechange` pour le corriger.
    const after = (kinds.videoinput ?? 0) > 0 && (kinds.audioinput ?? 0) > 0
      ? kinds
      : await listKinds();

    send('camera', resolve((after.videoinput ?? 0) > 0, media.camera));
    send('mic', resolve((after.audioinput ?? 0) > 0, media.mic));
    send('audio_out', resolveAudioOut((after.audiooutput ?? 0) > 0, media.mic));
  };

  const unsubMedia = subscribeMedia(s => {
    media = s;
    void report();
  });

  const onDeviceChange = () => { void report(); };
  navigator.mediaDevices?.addEventListener?.('devicechange', onDeviceChange);
  void report();

  return () => {
    started = false;
    unsubMedia();
    navigator.mediaDevices?.removeEventListener?.('devicechange', onDeviceChange);
    lastSent.clear();
    // Le drapeau de sonde se relâche avec la surveillance : un remontage
    // complet (rechargement de scène) a le droit de redemander une fois.
    probed.camera = false;
    probed.mic = false;
  };
}
