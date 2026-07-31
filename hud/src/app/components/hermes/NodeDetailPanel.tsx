import React from 'react';
import { motion } from 'motion/react';
import { HERMES_NODES, type NodeId } from './hermesNodes';

const orbFont = { fontFamily: 'Orbitron, sans-serif' };
const mono = { fontFamily: 'Share Tech Mono, monospace' };
const raj = { fontFamily: 'Rajdhani, sans-serif' };

const STATUS_LABEL: Record<string, string> = { actif: 'ACTIF', veille: 'VEILLE', attention: 'ATTENTION REQUISE' };
const STATUS_COLOR: Record<string, string> = { actif: '#22c55e', veille: '#64748b', attention: '#f59e0b' };

function Bar({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between">
        <span style={{ ...mono, color: 'rgba(255,255,255,0.4)', fontSize: 9 }}>{label}</span>
        <span style={{ ...mono, color, fontSize: 9 }}>{value}%</span>
      </div>
      <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
        <motion.div
          className="h-full rounded-full"
          initial={{ width: 0 }}
          animate={{ width: `${value}%` }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
          style={{ background: `linear-gradient(90deg, ${color}80, ${color})`, boxShadow: `0 0 6px ${color}` }}
        />
      </div>
    </div>
  );
}

/**
 * Détail d'un nœud Hermes — utilisé comme tiroir dans NeuralMap (clic sur un
 * nœud) et comme contenu plein-fenêtre quand l'app satellite correspondante
 * est lancée directement depuis le lanceur (§13.11/§13.12 — icônes auto).
 */
export function NodeDetailPanel({
  id,
  onSelectNode,
  variant = 'panel',
}: {
  id: NodeId;
  onSelectNode?: (id: NodeId) => void;
  variant?: 'panel' | 'window';
}) {
  const node = HERMES_NODES[id];
  const connected = node.connections.map(cid => HERMES_NODES[cid]);

  return (
    <div className={variant === 'window' ? 'h-full overflow-y-auto p-5' : 'h-full overflow-y-auto p-4'}>
      <motion.div
        key={id}
        initial={{ opacity: 0, x: 12 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.2 }}
        className="flex flex-col gap-4"
      >
        {/* En-tête */}
        <div className="flex items-center gap-3">
          <div
            className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{ background: `radial-gradient(circle, ${node.color}25 0%, rgba(0,0,0,0.5) 100%)`, border: `1px solid ${node.color}45` }}
          >
            <node.icon className="w-5 h-5" style={{ color: node.color }} />
          </div>
          <div className="min-w-0">
            <p style={{ ...orbFont, color: node.color, fontSize: 13, letterSpacing: '0.1em', textShadow: `0 0 8px ${node.color}` }}>
              {node.name.toUpperCase()}
            </p>
            <p style={{ ...mono, color: 'rgba(255,255,255,0.3)', fontSize: 9 }}>cf. {node.ref}</p>
          </div>
        </div>

        {/* Statut */}
        <div
          className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg w-fit"
          style={{ background: `${STATUS_COLOR[node.status]}12`, border: `1px solid ${STATUS_COLOR[node.status]}35` }}
        >
          <div
            className="w-1.5 h-1.5 rounded-full"
            style={{ background: STATUS_COLOR[node.status], boxShadow: `0 0 6px ${STATUS_COLOR[node.status]}` }}
          />
          <span style={{ ...mono, color: STATUS_COLOR[node.status], fontSize: 9 }}>{STATUS_LABEL[node.status]}</span>
          <span style={{ ...mono, color: 'rgba(255,255,255,0.35)', fontSize: 9 }}>— {node.metric}</span>
        </div>

        {/* Rôle */}
        <p style={{ ...raj, color: 'rgba(255,255,255,0.6)', fontSize: 12, lineHeight: 1.6 }}>{node.role}</p>

        {/* Jauges */}
        {node.consumption > 0 && <Bar label="CONSOMMATION" value={node.consumption} color={node.color} />}
        {node.progression > 0 && <Bar label="PROGRESSION" value={node.progression} color={node.color} />}

        {/* Connexions */}
        <div>
          <p style={{ ...mono, color: 'rgba(255,255,255,0.3)', fontSize: 9, marginBottom: 8 }}>
            CONNEXIONS ({connected.length})
          </p>
          <div className="flex flex-col gap-1.5">
            {connected.map(c => (
              <motion.button
                key={c.id}
                whileHover={{ x: onSelectNode ? 3 : 0 }}
                onClick={() => onSelectNode?.(c.id)}
                disabled={!onSelectNode}
                className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-left"
                style={{
                  background: 'rgba(255,255,255,0.02)',
                  border: '1px solid rgba(255,255,255,0.06)',
                  cursor: onSelectNode ? 'pointer' : 'default',
                }}
              >
                <c.icon className="w-3.5 h-3.5 flex-shrink-0" style={{ color: c.color }} />
                <span style={{ ...raj, color: 'rgba(255,255,255,0.6)', fontSize: 11 }}>{c.name}</span>
                <span style={{ ...mono, color: 'rgba(255,255,255,0.25)', fontSize: 8, marginLeft: 'auto' }}>{c.metric}</span>
              </motion.button>
            ))}
          </div>
        </div>
      </motion.div>
    </div>
  );
}
