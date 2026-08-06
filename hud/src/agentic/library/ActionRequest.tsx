/**
 * ActionRequest — une action que l'agent PROPOSE, que l'utilisateur déclenche.
 *
 * C'est la seule brique de la surface qui existe pour émettre. Les panneaux
 * produit (`SystemMonitor`, `MemoryPanel`…) affichent ; celui-ci demande.
 *
 * Il n'exécute RIEN. Un clic produit une intention, la gravité déclarée au
 * catalogue l'accompagne, et c'est le Core — donc la Policy — qui tranche.
 * Le composant ignore jusqu'à l'existence de la notion d'autorisation : il ne
 * peut donc pas la contourner, même modifié.
 *
 * Écrit ici et non importé du produit : aucun équivalent n'existe côté HUD,
 * puisque jusqu'ici aucune action n'était proposée par un agent.
 */

import { useState } from 'react';

import { tokens } from '../../ui/tokens';
import type { AgenticProps } from '../registry/renderers';

export interface ActionRequestProps {
  label: string;
  action: string;
  detail?: string;
}

export const ActionRequest = ({ props, emit, state }: AgenticProps) => {
  const { label, action, detail } = props as unknown as ActionRequestProps;
  const [sent, setSent] = useState(false);

  const pending = state === 'pending' || sent;

  return (
    <div
      style={{
        border: `1px solid ${tokens.color.border}`,
        borderRadius: tokens.radius.md,
        background: tokens.color.surface,
        padding: '14px 16px',
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
      }}
    >
      <div style={{ color: tokens.color.text, font: `14px ${tokens.font.body}` }}>{label}</div>
      {detail && (
        <div style={{ color: tokens.color.textMuted, font: `12px ${tokens.font.body}`, lineHeight: 1.4 }}>
          {detail}
        </div>
      )}
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          setSent(true);
          emit(action);
        }}
        style={{
          alignSelf: 'flex-start',
          font: `11px ${tokens.font.mono}`,
          letterSpacing: '0.12em',
          textTransform: 'uppercase',
          padding: '7px 16px',
          cursor: pending ? 'default' : 'pointer',
          borderRadius: tokens.radius.sm,
          border: `1px solid ${pending ? tokens.color.border : tokens.color.accent}`,
          background: pending ? 'transparent' : tokens.color.accent,
          color: pending ? tokens.color.textMuted : '#02121f',
        }}
      >
        {pending ? 'en attente…' : action}
      </button>
    </div>
  );
};

export const ACTION_REQUEST_STATES = ['idle', 'pending', 'done', 'refused'] as const;
