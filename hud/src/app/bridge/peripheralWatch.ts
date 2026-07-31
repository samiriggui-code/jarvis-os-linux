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
import { subscribeMedia, type MediaDevicesState } from './mediaDevices';

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

let started = false;

export function startPeripheralWatch(): () => void {
  if (started || typeof navigator === 'undefined') return () => { /* déjà armé */ };
  started = true;

  let media: MediaDevicesState = { mic: 'idle', camera: 'idle' };

  const report = async () => {
    const kinds = await listKinds();
    send('camera', resolve((kinds.videoinput ?? 0) > 0, media.camera));
    send('mic', resolve((kinds.audioinput ?? 0) > 0, media.mic));
    // Pas de permission à demander pour une SORTIE : sa seule question est
    // « existe-t-elle ». Sur un NUC en HDMI, la liste se vide quand l'écran
    // s'éteint — c'est exactement le cas qu'on veut entendre annoncer.
    send('audio_out', (kinds.audiooutput ?? 0) > 0
      ? { ok: true, reason: '' }
      : { ok: false, reason: 'absent' });
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
  };
}
