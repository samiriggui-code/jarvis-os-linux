/**
 * VerificationCard — pipeline §7 (brief étape 2).
 * Branche `surface_result.verification` (store HUD). Vide honnête si le Core
 * n'a encore rien envoyé. Dev visuel via ?surface=tool-verify.
 */
import type { AgenticProps } from '../registry/renderers';
import { VisionPane, useVisionText } from './vision';

export interface VerificationCardProps {
  proposition?: string;
  action_requested?: string;
  action_executed?: string;
  result_observed?: string;
  result_validated?: string;
  outcome?: 'verified' | 'disputed' | 'pending' | string;
}

const STEPS: { key: keyof VerificationCardProps; label: string }[] = [
  { key: 'proposition', label: 'Proposition' },
  { key: 'action_requested', label: 'Action demandée' },
  { key: 'action_executed', label: 'Action exécutée' },
  { key: 'result_observed', label: 'Résultat observé' },
  { key: 'result_validated', label: 'Résultat validé' },
];

export const VerificationCard = ({ props, state }: AgenticProps) => {
  const data = props as unknown as VerificationCardProps;
  const { title, body, caption, theme } = useVisionText();
  const outcome = (data.outcome || state || 'pending').toLowerCase();

  const outcomeRgb =
    outcome === 'verified' ? '52, 199, 89'
    : outcome === 'disputed' ? '255, 159, 28'
    : '140, 140, 150';

  const outcomeLabel =
    outcome === 'verified' ? 'Vérifié'
    : outcome === 'disputed' ? 'Contesté'
    : 'En attente';

  const hasAny = STEPS.some(({ key }) => String(data[key] || '').trim());

  return (
    <VisionPane material="regular" style={{ overflow: 'auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
        <span
          style={{
            fontSize: 10,
            fontWeight: 650,
            letterSpacing: '0.02em',
            color: `rgba(${outcomeRgb}, 1)`,
            border: `1px solid rgba(${outcomeRgb}, 0.4)`,
            borderRadius: 999,
            padding: '3px 10px',
            background: `rgba(${outcomeRgb}, 0.12)`,
          }}
        >
          {outcomeLabel}
        </span>
        <strong style={{ ...title, fontSize: 14 }}>Vérification</strong>
      </div>

      {!hasAny ? (
        <p style={body}>
          Pipeline §7 — en attente du Core. Aucune donnée inventée.
        </p>
      ) : (
        <ol style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {STEPS.map(({ key, label }) => {
            const value = String(data[key] || '').trim();
            return (
              <li key={key}>
                <p style={{ ...caption, marginBottom: 2 }}>{label}</p>
                <p style={{ ...body, color: value ? theme.text : theme.textMuted }}>
                  {value || '—'}
                </p>
              </li>
            );
          })}
        </ol>
      )}
    </VisionPane>
  );
};

export const VERIFICATION_CARD_STATES = ['pending', 'verified', 'disputed'] as const;
