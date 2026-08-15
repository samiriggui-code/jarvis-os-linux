import type { Graph3DModel, GraphNode } from '../../types';

export type ArchitectureAnchor = {
  id: string;
  index: string;
  label: string;
  side: 'left' | 'right';
  top: number;
};

/** Réf. vendor — ids canoniques architecture. */
export const VENDOR_ARCHITECTURE_ANCHORS: ArchitectureAnchor[] = [
  { id: 'core', index: '01', label: 'CORE SYSTEM', side: 'left', top: 22 },
  { id: 'hermes', index: '02', label: 'HERMES AGENT', side: 'left', top: 36 },
  { id: 'memory', index: '03', label: 'MEMORY PALACE', side: 'left', top: 50 },
  { id: 'policy', index: '04', label: 'POLICY ENGINE', side: 'left', top: 64 },
  { id: 'hud', index: '05', label: 'HUD SURFACE', side: 'left', top: 78 },
  { id: 'devices', index: '06', label: 'DEVICES & AGENTS', side: 'right', top: 39 },
  { id: 'home', index: '07', label: 'HOME AUTOMATION', side: 'right', top: 54 },
  { id: 'voice', index: '08', label: 'VOICE SYSTEM', side: 'right', top: 62 },
  { id: 'vision', index: '09', label: 'VISION SYSTEM', side: 'right', top: 69 },
];

const VENDOR_BY_ID = new Map(VENDOR_ARCHITECTURE_ANCHORS.map((a) => [a.id, a]));

export function anchorsFromModel(model: Graph3DModel): ArchitectureAnchor[] {
  return model.nodes.map((node, i) => {
    const vendor = VENDOR_BY_ID.get(node.id);
    const side = node.uiSide ?? vendor?.side ?? 'left';
    const top = node.uiAnchorTop ?? vendor?.top ?? 22 + i * 8;
    return {
      id: node.id,
      index: vendor?.index ?? String(i + 1).padStart(2, '0'),
      label: node.label,
      side,
      top,
    };
  });
}

export function nodeById(model: Graph3DModel, id: string | null): GraphNode | null {
  if (!id) return null;
  return model.nodes.find((n) => n.id === id) ?? null;
}
