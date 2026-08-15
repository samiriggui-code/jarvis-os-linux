import { Html } from '@react-three/drei';
import { labelAnchor } from '../focus';
import { LineSegments } from './LineSegments';
import type { GraphNode, Vec3 } from '../types';

export function LabelsLayer({
  nodes,
  positions,
  visible,
  focusId,
  onFocus,
}: {
  nodes: GraphNode[];
  positions: Record<string, Vec3>;
  visible: Set<string>;
  focusId: string | null;
  onFocus: (id: string) => void;
}) {
  const leaders: Array<[Vec3, Vec3]> = [];
  const items: Array<{ node: GraphNode; p: Vec3; labelPos: Vec3 }> = [];

  for (const node of nodes) {
    if (!visible.has(node.id)) continue;
    const p = positions[node.id];
    if (!p) continue;
    if (focusId === node.id) continue;
    const labelPos = labelAnchor(node.id, p);
    leaders.push([p, labelPos]);
    items.push({ node, p, labelPos });
  }

  return (
    <group>
      <LineSegments segments={leaders} color="#c8e4ff" opacity={0.38} />
      {items.map(({ node, labelPos }) => {
        if (focusId === node.id) return null;
        return (
          <Html key={node.id} position={labelPos} center occlude={false} style={{ pointerEvents: 'none' }}>
            <div
              style={{
                fontFamily:
                  '-apple-system, BlinkMacSystemFont, "SF Pro Display", "Segoe UI", sans-serif',
                textAlign: labelPos[0] < 0 ? 'right' : 'left',
                whiteSpace: 'nowrap',
                userSelect: 'none',
                cursor: 'pointer',
                pointerEvents: 'auto',
              }}
              onClick={(e) => {
                e.stopPropagation();
                onFocus(node.id);
              }}
            >
              <div
                style={{
                  fontSize: node.id === 'core' ? 13 : 10,
                  fontWeight: 600,
                  letterSpacing: '0.16em',
                  color: 'rgba(230,244,255,0.95)',
                  textShadow: '0 0 12px rgba(10,132,255,0.7), 0 0 3px #000',
                }}
              >
                {node.label}
              </div>
              {node.caption ? (
                <div
                  style={{
                    marginTop: 2,
                    fontSize: 8,
                    fontWeight: 400,
                    letterSpacing: '0.03em',
                    color: 'rgba(180,210,235,0.68)',
                    textShadow: '0 0 8px rgba(0,0,0,0.9)',
                  }}
                >
                  {node.caption}
                </div>
              ) : null}
            </div>
          </Html>
        );
      })}
    </group>
  );
}
