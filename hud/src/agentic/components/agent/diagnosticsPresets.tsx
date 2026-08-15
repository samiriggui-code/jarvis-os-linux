/**
 * DiagnosticCard/DiagnosticResult/RecoveryCard/RecoveryActions — addendum
 * admin/observabilité. Presets de StatusCard/ToolResult, pas de nouveaux
 * renderers. RecoveryCard doit fonctionner sans dépendance à un Core
 * atteignable (c'est justement pour le cas où il ne l'est pas).
 */
import type { ReactNode } from 'react';
import { GlassButton } from '../../../visual/glass';
import { StatusCard, type StatusCardProps } from './StatusCard';

export { ToolResult as DiagnosticResult } from './ToolResult';
export type { ToolResultProps as DiagnosticResultProps } from './ToolResult';

export interface DiagnosticCardProps extends Omit<StatusCardProps, 'tone' | 'icon'> {
  outcome: 'ok' | 'warning' | 'error';
}

export function DiagnosticCard({ outcome, ...rest }: DiagnosticCardProps) {
  const tone = outcome === 'ok' ? 'success' : outcome === 'warning' ? 'warning' : 'danger';
  return <StatusCard tone={tone} {...rest} />;
}

export interface RecoveryCardProps {
  title: string;
  lastHeartbeat?: string;
  actions?: ReactNode;
}

/** Ne suppose jamais que le Core est nécessaire pour s'afficher — c'est le point. */
export function RecoveryCard({ title, lastHeartbeat, actions }: RecoveryCardProps) {
  return (
    <StatusCard
      title={title}
      tone="danger"
      body={lastHeartbeat ? `Dernier battement : ${lastHeartbeat}` : undefined}
      actions={actions}
    />
  );
}

export interface RecoveryAction {
  label: string;
  action: string;
  tone?: 'neutral' | 'accent' | 'danger';
}

export interface RecoveryActionsProps {
  actions: RecoveryAction[];
  onIntent?: (action: string) => void;
}

export function RecoveryActions({ actions, onIntent }: RecoveryActionsProps) {
  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      {actions.map((a) => (
        <GlassButton key={a.action} tone={a.tone ?? 'neutral'} onClick={() => onIntent?.(a.action)}>
          {a.label}
        </GlassButton>
      ))}
    </div>
  );
}
