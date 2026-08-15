/**
 * `<Avatar identity="hermes" />` — initiales+tone pour les identités JARVIS
 * connues (même langage visuel que `AvatarChip`,
 * hud/src/agentic/library/Primitives.tsx), photo grise vendorisée en repli
 * pour une identité inconnue. Pas un registre d'identité : ça reste le rôle
 * de `core/` (données d'enrôlement) — cette table est juste les évidences.
 */
import { type CSSProperties } from 'react';
import { tokens } from '../ui/tokens';

import avatar1 from '../../vendor/metronic/avatars/gray/1.png';
import avatar2 from '../../vendor/metronic/avatars/gray/2.png';
import avatar3 from '../../vendor/metronic/avatars/gray/3.png';
import avatar4 from '../../vendor/metronic/avatars/gray/4.png';
import avatar5 from '../../vendor/metronic/avatars/gray/5.png';

const FALLBACK_PHOTOS = [avatar1, avatar2, avatar3, avatar4, avatar5];

export type AvatarTone = 'accent' | 'success' | 'warning' | 'danger' | 'neutral';

const TONE_RGB: Record<AvatarTone, string> = {
  accent: '10, 132, 255',
  success: '52, 199, 89',
  warning: '255, 159, 28',
  danger: '255, 59, 48',
  neutral: '150, 150, 158',
};

const KNOWN: Record<string, { initials: string; tone: AvatarTone }> = {
  hermes: { initials: 'HE', tone: 'accent' },
  samir: { initials: 'SA', tone: 'success' },
  core: { initials: 'CO', tone: 'warning' },
  system: { initials: 'SY', tone: 'neutral' },
};

function hashIndex(s: string, mod: number): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h % mod;
}

export interface AvatarProps {
  identity: string;
  initials?: string;
  tone?: AvatarTone;
  size?: number;
}

export function Avatar({ identity, initials, tone, size = 40 }: AvatarProps) {
  const known = KNOWN[identity.toLowerCase()];
  const resolvedInitials = initials ?? known?.initials;

  if (resolvedInitials) {
    const rgb = TONE_RGB[tone ?? known?.tone ?? 'neutral'];
    const style: CSSProperties = {
      width: size,
      height: size,
      borderRadius: '50%',
      background: `rgba(${rgb}, 0.18)`,
      border: `1px solid rgba(${rgb}, 0.35)`,
      display: 'grid',
      placeItems: 'center',
      fontFamily: tokens.font.body,
      fontSize: Math.round(size * 0.32),
      fontWeight: 650,
      color: `rgb(${rgb})`,
      flexShrink: 0,
    };
    return <div style={style}>{resolvedInitials.toUpperCase()}</div>;
  }

  const photo = FALLBACK_PHOTOS[hashIndex(identity, FALLBACK_PHOTOS.length)];
  return (
    <img
      src={photo}
      alt={identity}
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        objectFit: 'cover',
        border: `1px solid ${tokens.color.border}`,
        flexShrink: 0,
      }}
    />
  );
}

export default Avatar;
