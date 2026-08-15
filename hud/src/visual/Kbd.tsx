/**
 * Touche clavier — ADAPTÉ de Metronic
 * (metronic-tailwind-react-starter-kit/typescript/vite/src/components/ui/kbd.tsx) :
 * même forme (kbd + variantes de taille), restylé entièrement aux tokens JARVIS
 * (`tokens.font.mono`, `tokens.color.*`, `tokens.radius.*`) — aucune classe
 * Tailwind/CVA de Metronic conservée. Remplace les indices clavier écrits en
 * texte brut (ex. le "Ctrl+Shift+U"/"Esc" de AgenticDemoStage).
 */
import type { CSSProperties, ReactNode } from 'react';
import { tokens } from '../ui/tokens';

export type KbdSize = 'xs' | 'sm' | 'md';

const SIZE: Record<KbdSize, CSSProperties> = {
  xs: { height: 18, minWidth: 18, padding: '0 4px', fontSize: 10 },
  sm: { height: 22, minWidth: 22, padding: '0 5px', fontSize: 11 },
  md: { height: 26, minWidth: 26, padding: '0 6px', fontSize: 12 },
};

export interface KbdProps {
  size?: KbdSize;
  children: ReactNode;
}

export function Kbd({ size = 'md', children }: KbdProps) {
  return (
    <kbd
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: tokens.font.mono,
        fontWeight: 500,
        borderRadius: tokens.radius.sm,
        background: tokens.color.surfaceRaised,
        border: `1px solid ${tokens.color.border}`,
        color: tokens.color.text,
        lineHeight: 1,
        ...SIZE[size],
      }}
    >
      {children}
    </kbd>
  );
}

export default Kbd;
