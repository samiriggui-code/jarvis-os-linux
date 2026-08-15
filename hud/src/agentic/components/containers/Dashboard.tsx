/**
 * Dashboard — `GlassHeader` (titre/actions) + `Workspace` en dessous, la
 * hauteur du header retranchée de `space.availableHeight` avant de la passer
 * au solveur (sinon il croit disposer de plus de hauteur qu'il n'en reste).
 */
import { GlassHeader, GLASS_HEADER_HEIGHT } from '../../../visual/glass';
import { Workspace, type WorkspaceProps } from './Workspace';
import type { ReactNode } from 'react';

export interface DashboardProps extends WorkspaceProps {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
}

export function Dashboard({ title, subtitle, actions, space, ...workspaceProps }: DashboardProps) {
  const innerSpace = { ...space, availableHeight: Math.max(0, space.availableHeight - GLASS_HEADER_HEIGHT) };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      <GlassHeader title={title} subtitle={subtitle} actions={actions} />
      <div style={{ flex: 1, minHeight: 0 }}>
        <Workspace {...workspaceProps} space={innerSpace} />
      </div>
    </div>
  );
}

export default Dashboard;
