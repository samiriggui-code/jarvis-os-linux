/**
 * ApprovalCard — Vision glass. Affiche un blocage décidé par le Core.
 */
import type { AgenticProps } from '../registry/renderers';
import { VisionButton, VisionPane, useVisionText } from './vision';

export interface ApprovalCardProps {
  approvalId: string;
  action: string;
  gravity: string;
  reason?: string;
}

const GRAVITY_RGB: Record<string, string> = {
  info: '10, 132, 255',
  media: '94, 92, 230',
  home: '255, 159, 10',
  admin: '255, 59, 48',
};

export const ApprovalCard = ({ props, emit }: AgenticProps) => {
  const { approvalId, action, gravity, reason } = props as unknown as ApprovalCardProps;
  const { title, body, theme } = useVisionText();
  const rgb = GRAVITY_RGB[gravity] ?? GRAVITY_RGB.home;

  return (
    <VisionPane
      material="regular"
      style={{
        borderColor: `rgba(${rgb}, 0.45)`,
        boxShadow: `0 0 0 1px rgba(${rgb}, 0.2), 0 20px 48px rgba(0,0,0,0.25)`,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
        <span
          style={{
            fontSize: 10,
            fontWeight: 650,
            letterSpacing: '0.02em',
            textTransform: 'capitalize',
            color: `rgba(${rgb}, 1)`,
            border: `1px solid rgba(${rgb}, 0.4)`,
            borderRadius: 999,
            padding: '3px 10px',
            background: `rgba(${rgb}, 0.12)`,
          }}
        >
          {gravity}
        </span>
        <strong style={{ ...title, fontSize: 14 }}>Autorisation requise</strong>
      </div>

      <p style={{ ...title, fontSize: 13, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}>
        {action}
      </p>

      {reason ? <p style={{ ...body, marginTop: 8 }}>{reason}</p> : null}

      <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
        <VisionButton onClick={() => emit('approval.deny', { approvalId })}>Refuser</VisionButton>
        <VisionButton tone="accent" onClick={() => emit('approval.grant', { approvalId })}>
          Autoriser
        </VisionButton>
      </div>
    </VisionPane>
  );
};

export const APPROVAL_CARD_STATES = ['pending', 'granted', 'denied'] as const;
