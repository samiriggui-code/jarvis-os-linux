import { SpatialWindow } from '../../../../spatial/SpatialWindow/SpatialWindow';
import { useSpatialTheme } from '../../../../spatial/theme/SpatialTheme';

/** Panneau overview — SpatialWindow + Glass System. */
export function ArchitectureOverviewPanel() {
  const theme = useSpatialTheme();

  return (
    <aside className="architecture-overview" aria-label="JARVIS Architecture overview">
      <SpatialWindow
        material="thin"
        elevation="floating"
        parallax
        title="JARVIS Architecture"
        subtitle="Système niveau 5 — active"
        radius="lg"
        padding="md"
        style={{ width: '100%' }}
      >
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: 8,
            marginTop: 4,
            textAlign: 'center',
          }}
        >
          {[
            { v: '9', l: 'processus' },
            { v: 'L5', l: 'niveau' },
            { v: 'ON', l: 'mesh' },
          ].map(({ v, l }) => (
            <div key={l}>
              <div style={{ fontSize: 15, fontWeight: 600, color: theme.text }}>{v}</div>
              <div
                style={{
                  fontSize: 8,
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  color: theme.textMuted,
                }}
              >
                {l}
              </div>
            </div>
          ))}
        </div>
      </SpatialWindow>
    </aside>
  );
}
