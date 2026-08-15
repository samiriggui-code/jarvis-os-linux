/**
 * `<Illustration name="1" />` — vendorisées telles quelles (pas de passe de
 * recoloration, style flat multicolore différent du glass/holographique
 * JARVIS — voir hud/vendor/metronic/README.md). Utile pour des écrans vides
 * existants (ex. « Core hors ligne »).
 *
 * Noms = numéro du fichier source, PAS de nom sémantique inventé (« offline »,
 * « empty »…) avant qu'une vraie revue visuelle n'assigne un sens — zéro
 * donnée inventée s'applique aussi au nommage.
 */
import { useSpatialTheme } from '../spatial/theme/SpatialTheme';

import illustration1 from '../../vendor/metronic/illustrations/1.svg';
import illustration1Dark from '../../vendor/metronic/illustrations/1-dark.svg';
import illustration10 from '../../vendor/metronic/illustrations/10.svg';
import illustration10Dark from '../../vendor/metronic/illustrations/10-dark.svg';

const SET = {
  '1': { light: illustration1, dark: illustration1Dark },
  '10': { light: illustration10, dark: illustration10Dark },
} satisfies Record<string, { light: string; dark: string }>;

export type IllustrationName = keyof typeof SET;

export interface IllustrationProps {
  name: IllustrationName;
  width?: number | string;
  alt?: string;
}

export function Illustration({ name, width = 240, alt = '' }: IllustrationProps) {
  const { mode } = useSpatialTheme();
  const entry = SET[name];
  if (!entry) return null;
  const src = mode === 'light' ? entry.light : entry.dark;
  return <img src={src} alt={alt} style={{ width, height: 'auto', display: 'block' }} />;
}

export default Illustration;
