import { type CSSProperties, type ReactNode } from 'react';
import { tokens } from '../../ui/tokens';
import { GlassPanel } from './GlassPanel';

export interface GlassDockProps {
  orientation?: 'horizontal' | 'vertical';
  gap?: keyof typeof tokens.space;
  children: ReactNode;
  style?: CSSProperties;
}

/**
 * Barre flottante en pilule — dock d'apps, contrôles média, etc.
 * Niveau `floating` par défaut (référence : vendor/3JS/Liquid_Glass_NavBar).
 * Un seul GlassDock à l'écran à la fois par convention perf (voir tokens.ts).
 */
export function GlassDock({ orientation = 'horizontal', gap = 'xs', children, style }: GlassDockProps) {
  return (
    <GlassPanel
      level="floating"
      radius="pill"
      padding="xs"
      style={{
        display: 'flex',
        flexDirection: orientation === 'horizontal' ? 'row' : 'column',
        alignItems: 'center',
        gap: tokens.space[gap],
        width: 'fit-content',
        ...style,
      }}
    >
      {children}
    </GlassPanel>
  );
}

export default GlassDock;
