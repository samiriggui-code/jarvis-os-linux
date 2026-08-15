/**
 * GlassOverlay — matière élevée + scrim dismissible, pour les composants qui
 * doivent paraître posés au-dessus du reste (ApprovalCard, ConfirmationCard,
 * toasts). Remplit tout l'espace que le Layout Engine lui a donné
 * (`position:absolute; inset:0` relatif au conteneur, jamais au viewport) —
 * le Glass ne déplace jamais rien, il habille le rectangle déjà décidé.
 */
import React, { type ReactNode } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { GlassSurface, type GlassSurfaceProps } from './GlassSurface';

export interface GlassOverlayProps {
  children: ReactNode;
  dismissible?: boolean;
  onDismiss?: () => void;
  material?: GlassSurfaceProps['material'];
  elevation?: GlassSurfaceProps['elevation'];
}

export function GlassOverlay({
  children,
  dismissible = false,
  onDismiss,
  material = 'thick',
  elevation = 'floating',
}: GlassOverlayProps) {
  return (
    <AnimatePresence>
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 5,
        }}
      >
        <motion.div
          aria-hidden
          onClick={dismissible ? onDismiss : undefined}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          style={{
            position: 'absolute',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.45)',
            backdropFilter: 'blur(3px)',
            cursor: dismissible ? 'pointer' : 'default',
          }}
        />
        <motion.div
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.96 }}
          transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
          style={{ position: 'relative', zIndex: 1, maxWidth: '92%', maxHeight: '92%' }}
        >
          <GlassSurface material={material} elevation={elevation} focused radius="lg" padding="lg">
            {children}
          </GlassSurface>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}

export default GlassOverlay;
