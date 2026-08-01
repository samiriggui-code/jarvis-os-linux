import React, { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Waypoints } from 'lucide-react';
import { HERMES_NODES, HERMES_NODE_LIST, type NodeId } from './hermesNodes';
import { NodeDetailPanel } from './NodeDetailPanel';

const orbFont = { fontFamily: 'Orbitron, sans-serif' };
const mono = { fontFamily: 'Share Tech Mono, monospace' };

const SATELLITES = HERMES_NODE_LIST.filter(n => n.id !== 'hermes');
const RX = 43;
const RY = 39;

function polar(index: number, total: number) {
  const angle = (index / total) * Math.PI * 2 - Math.PI / 2;
  return { x: 50 + RX * Math.cos(angle), y: 50 + RY * Math.sin(angle) };
}

const POSITIONS: Record<NodeId, { x: number; y: number }> = {
  hermes: { x: 50, y: 50 },
  ...Object.fromEntries(SATELLITES.map((n, i) => [n.id, polar(i, SATELLITES.length)])),
} as Record<NodeId, { x: number; y: number }>;

// Arêtes secondaires (satellite ↔ satellite), en plus des rayons vers Hermes —
// donne au schéma une vraie allure de réseau plutôt qu'une simple étoile.
const EXTRA_EDGES: [NodeId, NodeId][] = (() => {
  const seen = new Set<string>();
  const edges: [NodeId, NodeId][] = [];
  SATELLITES.forEach(n => {
    n.connections.forEach(cid => {
      if (cid === 'hermes') return;
      const key = [n.id, cid].sort().join('-');
      if (seen.has(key)) return;
      seen.add(key);
      edges.push([n.id, cid]);
    });
  });
  return edges;
})();

/**
 * Contenu de la fenêtre « Noyau JARVIS » — schéma de connectivité Hermes
 * (§13.1) : nœud central + nœuds satellites (cerveau, tokens, objectifs,
 * skills, connexions, réseau, security center, crons, IA, outils). Cliquer
 * un nœud ouvre un tiroir de détail avec ses connexions et ses métriques.
 */
export function NeuralMap() {
  const [selected, setSelected] = useState<NodeId | null>(null);
  const related = useMemo(() => (selected ? new Set(HERMES_NODES[selected].connections) : null), [selected]);

  const isDimmed = (id: NodeId) => {
    if (!selected) return false;
    if (id === selected) return false;
    return !related?.has(id);
  };

  return (
    <div className="relative w-full h-full min-h-0 flex">
      {/* Scène graphe */}
      <div className="relative flex-1 min-w-0 h-full" onClick={() => setSelected(null)}>
        <div
          className="absolute top-2 left-1/2 -translate-x-1/2 flex items-center gap-1.5 px-2.5 py-1 rounded-full pointer-events-none"
          style={{ zIndex: 20, background: 'rgba(0,8,22,0.8)', border: '1px solid rgba(0,245,255,0.2)' }}
        >
          <Waypoints className="w-2.5 h-2.5" style={{ color: '#00f5ff' }} />
          <span style={{ ...mono, color: 'rgba(0,245,255,0.7)', fontSize: 8, letterSpacing: '0.08em' }}>
            SCHÉMA DE CONNECTIVITÉ HERMES — CLIQUER UN NŒUD
          </span>
        </div>

        {/* Arêtes */}
        <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 100 100" preserveAspectRatio="none">
          {SATELLITES.map(n => {
            const a = POSITIONS.hermes;
            const b = POSITIONS[n.id];
            const dim = selected && selected !== 'hermes' && n.id !== selected && !related?.has(n.id);
            return (
              <line
                key={`spoke-${n.id}`}
                x1={a.x} y1={a.y} x2={b.x} y2={b.y}
                stroke={n.color}
                strokeWidth={0.25}
                opacity={dim ? 0.08 : selected === n.id || related?.has(n.id) ? 0.55 : 0.22}
                vectorEffect="non-scaling-stroke"
              />
            );
          })}
          {EXTRA_EDGES.map(([aId, bId]) => {
            const a = POSITIONS[aId];
            const b = POSITIONS[bId];
            const dim = selected && aId !== selected && bId !== selected;
            return (
              <line
                key={`edge-${aId}-${bId}`}
                x1={a.x} y1={a.y} x2={b.x} y2={b.y}
                stroke="rgba(0,245,255,0.5)"
                strokeWidth={0.15}
                strokeDasharray="1 1.4"
                opacity={dim ? 0.05 : 0.3}
                vectorEffect="non-scaling-stroke"
              />
            );
          })}
        </svg>

        {/* Nœud central */}
        <div
          className="absolute flex flex-col items-center"
          style={{ left: `${POSITIONS.hermes.x}%`, top: `${POSITIONS.hermes.y}%`, transform: 'translate(-50%, -50%)', zIndex: 10 }}
        >
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 14, repeat: Infinity, ease: 'linear' }}
            className="absolute rounded-full"
            style={{ width: 74, height: 74, border: '1px dashed rgba(0,245,255,0.3)' }}
          />
          <motion.button
            onClick={e => { e.stopPropagation(); setSelected('hermes'); }}
            whileHover={{ scale: 1.06 }}
            animate={{ boxShadow: ['0 0 16px rgba(0,245,255,0.4)', '0 0 28px rgba(0,245,255,0.7)', '0 0 16px rgba(0,245,255,0.4)'] }}
            transition={{ boxShadow: { duration: 2.5, repeat: Infinity } }}
            className="w-14 h-14 rounded-full flex items-center justify-center cursor-pointer relative"
            style={{
              background: 'radial-gradient(circle, rgba(0,245,255,0.25) 0%, rgba(0,8,20,0.9) 100%)',
              border: `1.5px solid ${selected === 'hermes' ? '#ffffff' : 'rgba(0,245,255,0.6)'}`,
            }}
          >
            <HERMES_NODES.hermes.icon className="w-6 h-6" style={{ color: '#00f5ff' }} />
          </motion.button>
          <span style={{ ...orbFont, color: '#00f5ff', fontSize: 9, letterSpacing: '0.15em', marginTop: 6, textShadow: '0 0 8px #00f5ff' }}>
            HERMES
          </span>
        </div>

        {/* Nœuds satellites */}
        {SATELLITES.map(n => {
          const pos = POSITIONS[n.id];
          const dim = isDimmed(n.id);
          const isSelected = selected === n.id;
          return (
            <div
              key={n.id}
              className="absolute flex flex-col items-center"
              style={{ left: `${pos.x}%`, top: `${pos.y}%`, transform: 'translate(-50%, -50%)', zIndex: isSelected ? 12 : 8 }}
            >
              <motion.button
                onClick={e => { e.stopPropagation(); setSelected(n.id); }}
                whileHover={{ scale: 1.12 }}
                animate={{ opacity: dim ? 0.35 : 1, scale: isSelected ? 1.12 : 1 }}
                transition={{ duration: 0.25 }}
                className="w-10 h-10 rounded-xl flex items-center justify-center cursor-pointer relative"
                style={{
                  background: `radial-gradient(circle, ${n.color}22 0%, rgba(0,4,12,0.85) 100%)`,
                  border: `1.5px solid ${isSelected ? '#ffffff' : `${n.color}55`}`,
                  boxShadow: isSelected ? `0 0 16px ${n.color}90` : `0 0 6px ${n.color}20`,
                }}
              >
                <n.icon className="w-4 h-4" style={{ color: n.color }} />
                {n.status === 'attention' && (
                  <motion.div
                    animate={{ opacity: [1, 0.3, 1] }}
                    transition={{ duration: 1, repeat: Infinity }}
                    className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full"
                    style={{ background: '#ef4444', boxShadow: '0 0 6px #ef4444' }}
                  />
                )}
              </motion.button>
              <span
                className="whitespace-nowrap"
                style={{ ...mono, color: dim ? 'rgba(255,255,255,0.25)' : n.color, fontSize: 7.5, letterSpacing: '0.05em', marginTop: 4 }}
              >
                {n.name.toUpperCase()}
              </span>
            </div>
          );
        })}
      </div>

      {/* Tiroir de détail */}
      <AnimatePresence>
        {selected && (
          <motion.div
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 260, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
            className="flex-shrink-0 h-full overflow-hidden"
            style={{ borderLeft: '1px solid rgba(0,245,255,0.12)', background: 'rgba(0,6,18,0.7)' }}
          >
            <div className="w-[260px] h-full flex flex-col">
              <div className="flex justify-end p-1.5 flex-shrink-0">
                <motion.button
                  whileHover={{ scale: 1.1 }}
                  onClick={() => setSelected(null)}
                  className="w-6 h-6 rounded-lg flex items-center justify-center cursor-pointer"
                  style={{ background: 'rgba(255,255,255,0.04)' }}
                >
                  <X className="w-3 h-3" style={{ color: 'rgba(255,255,255,0.4)' }} />
                </motion.button>
              </div>
              <div className="flex-1 min-h-0">
                <NodeDetailPanel id={selected} onSelectNode={setSelected} />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
