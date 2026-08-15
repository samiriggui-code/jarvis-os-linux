/**
 * `<Badge status="warning">…</Badge>` — façade JARVIS au-dessus de `GlassPill`,
 * qui EST déjà le composant badge du Glass System (tone/dot/icon), jusqu'ici
 * seulement démontré dans VisionOSMaterialLab. On ne crée pas un 3e concept de
 * badge à côté de `StatusBadge` (agentic) et `GlassPill` — voir le plan
 * Metronic vendoring. Migrer `StatusBadge` vers cette façade est un travail
 * séparé, pas fait ici.
 */
import type { ReactNode } from 'react';
import { GlassPill, type GlassPillTone } from '../components/glass';

export type BadgeStatus = 'ok' | 'warning' | 'danger' | 'info' | 'neutral';

const STATUS_TONE: Record<BadgeStatus, GlassPillTone> = {
  ok: 'success',
  warning: 'warning',
  danger: 'danger',
  info: 'accent',
  neutral: 'neutral',
};

export interface BadgeProps {
  status?: BadgeStatus;
  dot?: boolean;
  icon?: ReactNode;
  children: ReactNode;
}

export function Badge({ status = 'neutral', dot = true, icon, children }: BadgeProps) {
  return (
    <GlassPill tone={STATUS_TONE[status]} dot={dot} icon={icon}>
      {children}
    </GlassPill>
  );
}

export default Badge;
