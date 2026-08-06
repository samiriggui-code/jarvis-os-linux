/**
 * ApprovalCard — le blocage rendu VISIBLE.
 *
 * ⚠ Ce composant **n'implémente pas** le contrôle d'accès, il l'affiche. Ce qui
 * bloque, c'est le Core : tant qu'aucun `APPROVAL_RESPONSE` positif ne lui
 * revient, il n'exécute rien. Supprimer cette carte, la modifier, ou l'appeler
 * depuis la console ne débloque donc rien — on ne contourne pas une décision
 * en cachant le message qui l'annonce.
 *
 * C'est la différence entre une confirmation d'interface (« êtes-vous sûr ? »,
 * contournable) et une autorisation (arbitrée ailleurs).
 *
 * La demande vit dans `pending.approvals` du document de surface, donc elle
 * survit à une reconnexion et à une resynchronisation : une action en attente
 * ne disparaît pas parce que le HUD a rechargé.
 */

import { tokens } from '../../ui/tokens';
import type { AgenticProps } from '../registry/renderers';

export interface ApprovalCardProps {
  /** Identifiant de la demande — c'est lui qui repart au Core. */
  approvalId: string;
  action: string;
  /** `info | media | home | admin` — décidée au catalogue, jamais ici. */
  gravity: string;
  reason?: string;
}

const GRAVITY_COLOR: Record<string, string> = {
  info: tokens.color.accent,
  media: tokens.color.pending,
  home: tokens.color.warning,
  admin: tokens.color.danger,
};

export const ApprovalCard = ({ props, emit }: AgenticProps) => {
  const { approvalId, action, gravity, reason } = props as unknown as ApprovalCardProps;
  const accent = GRAVITY_COLOR[gravity] ?? tokens.color.warning;

  return (
    <div
      style={{
        border: `1px solid ${accent}`,
        borderLeft: `3px solid ${accent}`,
        borderRadius: tokens.radius.md,
        background: tokens.color.surfaceRaised,
        padding: '14px 16px',
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
        <span
          style={{
            font: `10px ${tokens.font.mono}`,
            letterSpacing: '0.14em',
            textTransform: 'uppercase',
            color: accent,
            border: `1px solid ${accent}`,
            borderRadius: tokens.radius.sm,
            padding: '2px 7px',
          }}
        >
          {gravity}
        </span>
        <strong style={{ color: tokens.color.text, font: `13px ${tokens.font.body}` }}>
          Autorisation requise
        </strong>
      </div>

      <div style={{ color: tokens.color.text, font: `13px ${tokens.font.mono}` }}>{action}</div>

      {reason && (
        <div style={{ color: tokens.color.textMuted, font: `12px ${tokens.font.body}`, lineHeight: 1.4 }}>
          {reason}
        </div>
      )}

      <div style={{ display: 'flex', gap: 8 }}>
        {/* Le refus est un choix explicite, pas une absence de réponse : sans
            lui, une demande resterait en attente indéfiniment et le Core ne
            saurait jamais qu'elle a été vue. */}
        <button
          type="button"
          onClick={() => emit('approval.deny', { approvalId })}
          style={{
            font: `11px ${tokens.font.mono}`,
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            padding: '6px 14px',
            cursor: 'pointer',
            borderRadius: tokens.radius.sm,
            border: `1px solid ${tokens.color.border}`,
            background: 'transparent',
            color: tokens.color.textMuted,
          }}
        >
          refuser
        </button>
        <button
          type="button"
          onClick={() => emit('approval.grant', { approvalId })}
          style={{
            font: `11px ${tokens.font.mono}`,
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            padding: '6px 14px',
            cursor: 'pointer',
            borderRadius: tokens.radius.sm,
            border: `1px solid ${accent}`,
            background: accent,
            color: '#02121f',
          }}
        >
          autoriser
        </button>
      </div>
    </div>
  );
};

export const APPROVAL_CARD_STATES = ['pending', 'granted', 'denied'] as const;
