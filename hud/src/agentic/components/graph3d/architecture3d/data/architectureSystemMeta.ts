import type { IconName } from '../../../../visual/Icon';

/** Métadonnées UI — 9 systèmes principaux JARVIS. */
export type SystemMeta = {
  id: string;
  index: string;
  title: string;
  line1: string;
  line2: string;
  side: 'left' | 'right';
  top: number;
  icon: IconName;
};

export const ARCHITECTURE_SYSTEM_META: SystemMeta[] = [
  {
    id: 'core',
    index: '01',
    title: 'CORE',
    line1: 'Noyau central',
    line2: 'Calcul & Orchestration',
    side: 'left',
    top: 22,
    icon: 'cpu',
  },
  {
    id: 'bridge',
    index: '02',
    title: 'BRIDGE',
    line1: 'Pont LLM',
    line2: 'Chat & recherche',
    side: 'left',
    top: 36,
    icon: 'brain',
  },
  {
    id: 'memory',
    index: '03',
    title: 'MEMORY',
    line1: 'Mémoire contextuelle',
    line2: 'Apprentissage continu',
    side: 'left',
    top: 50,
    icon: 'database',
  },
  {
    id: 'policy',
    index: '04',
    title: 'POLICY',
    line1: 'Règles & Gouvernance',
    line2: 'Priorités opérationnelles',
    side: 'left',
    top: 64,
    icon: 'shield',
  },
  {
    id: 'hud',
    index: '05',
    title: 'HUD',
    line1: 'Interface adaptative',
    line2: 'Visualisation augmentée',
    side: 'left',
    top: 78,
    icon: 'grid',
  },
  {
    id: 'devices',
    index: '06',
    title: 'DEVICES',
    line1: 'Périphériques connectés',
    line2: 'Capteurs & Actionneurs',
    side: 'right',
    top: 39,
    icon: 'server',
  },
  {
    id: 'home',
    index: '07',
    title: 'HOME',
    line1: 'Maison connectée',
    line2: 'Automatisation locale',
    side: 'right',
    top: 54,
    icon: 'home',
  },
  {
    id: 'voice',
    index: '08',
    title: 'VOICE',
    line1: 'Voix & synthèse',
    line2: 'Commande naturelle',
    side: 'right',
    top: 62,
    icon: 'volume',
  },
  {
    id: 'vision',
    index: '09',
    title: 'VISION',
    line1: 'Gestes & objets',
    line2: 'Perception augmentée',
    side: 'right',
    top: 69,
    icon: 'video',
  },
];

const META_BY_ID = new Map(ARCHITECTURE_SYSTEM_META.map((m) => [m.id, m]));

export function systemMetaFor(id: string): SystemMeta | undefined {
  return META_BY_ID.get(id);
}
