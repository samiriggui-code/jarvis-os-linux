/**
 * Panel — wrapper sémantique sur `GlassPanel` (matière), pour du contenu
 * groupé à l'intérieur d'un nœud sans passer par `SectionFrame`.
 */
import type { ReactNode } from 'react';
import { GlassPanel } from '../../../visual/glass/GlassPanel';
import type { GlassSurfaceProps } from '../../../visual/glass/GlassSurface';

export interface PanelProps extends Omit<GlassSurfaceProps, 'children'> {
  children?: ReactNode;
}

export function Panel(props: PanelProps) {
  return <GlassPanel {...props} />;
}

export default Panel;
