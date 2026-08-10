import { useEffect, type CSSProperties, type ReactNode } from 'react';
import { tokens } from '../../ui/tokens';
import { GlassPanel } from './GlassPanel';

export interface GlassModalProps {
  open: boolean;
  onClose?: () => void;
  title?: ReactNode;
  children?: ReactNode;
  width?: number;
  /** Empêche la fermeture par clic sur le fond / touche Échap (ex. ApprovalCard). */
  dismissible?: boolean;
}

/**
 * Overlay + panneau centré (niveau `strong`). Pas de portail DOM — le
 * parent doit la monter là où le z-index est correct (region `overlay`).
 */
export function GlassModal({ open, onClose, title, children, width = 420, dismissible = true }: GlassModalProps) {
  useEffect(() => {
    if (!open || !dismissible || !onClose) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, dismissible, onClose]);

  if (!open) return null;

  const backdrop: CSSProperties = {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0, 4, 10, 0.55)',
    backdropFilter: 'blur(4px)',
    WebkitBackdropFilter: 'blur(4px)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 200,
  };

  return (
    <div style={backdrop} onClick={dismissible ? onClose : undefined}>
      <div style={{ width, maxWidth: '92vw' }} onClick={e => e.stopPropagation()}>
        <GlassPanel level="strong" radius="lg" padding="lg">
          {title ? (
            <p
              style={{
                fontFamily: tokens.font.display,
                fontSize: 13,
                letterSpacing: '0.08em',
                color: tokens.color.accent,
                margin: '0 0 12px',
              }}
            >
              {title}
            </p>
          ) : null}
          {children}
        </GlassPanel>
      </div>
    </div>
  );
}

export default GlassModal;
