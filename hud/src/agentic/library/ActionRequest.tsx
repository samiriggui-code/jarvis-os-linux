/**
 * ActionRequest — Vision glass. Émet une intention, n'exécute rien.
 */
import { useState } from 'react';
import type { AgenticProps } from '../registry/renderers';
import { VisionButton, VisionPane, useVisionText } from './vision';

export interface ActionRequestProps {
  label: string;
  action: string;
  detail?: string;
}

export const ActionRequest = ({ props, emit, state }: AgenticProps) => {
  const { label, action, detail } = props as unknown as ActionRequestProps;
  const [sent, setSent] = useState(false);
  const { title, body } = useVisionText();
  const pending = state === 'pending' || sent;

  return (
    <VisionPane material="thin">
      <p style={title}>{label}</p>
      {detail ? <p style={{ ...body, marginTop: 6 }}>{detail}</p> : null}
      <div style={{ marginTop: 14 }}>
        <VisionButton
          tone="accent"
          disabled={pending}
          onClick={() => {
            setSent(true);
            emit(action);
          }}
        >
          {pending ? 'En attente…' : action}
        </VisionButton>
      </div>
    </VisionPane>
  );
};

export const ACTION_REQUEST_STATES = ['idle', 'pending', 'done', 'refused'] as const;
