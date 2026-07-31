/**
 * Surface Cursor — simulation fenêtre IDE (§15).
 * Prod : Agent Laptop / Cursor natif remplacera ce stub.
 */
import React from 'react';
import { motion } from 'motion/react';

const mono = { fontFamily: 'Share Tech Mono, monospace' };
const orb = { fontFamily: 'Orbitron, sans-serif' };
const ACCENT = '#22c55e';

export function CursorSurface({ projectName }: { projectName?: string }) {
  const name = projectName || 'HoloControl';
  return (
    <div className="h-full min-h-0 flex flex-col overflow-hidden" style={{ background: 'rgba(2,8,4,0.92)' }}>
      <div
        className="flex items-center gap-3 px-4 py-2 flex-shrink-0"
        style={{ borderBottom: `1px solid ${ACCENT}28`, background: 'rgba(0,12,6,0.85)' }}
      >
        <span style={{ ...orb, color: ACCENT, fontSize: 11, letterSpacing: '0.14em' }}>CURSOR</span>
        <span style={{ ...mono, color: 'rgba(255,255,255,0.4)', fontSize: 10 }}>{name}</span>
        <motion.span
          animate={{ opacity: [1, 0.35, 1] }}
          transition={{ duration: 1.4, repeat: Infinity }}
          style={{ ...mono, color: ACCENT, fontSize: 8, marginLeft: 'auto', letterSpacing: '0.1em' }}
        >
          PRÊT
        </motion.span>
      </div>

      <div className="flex-1 min-h-0 flex overflow-hidden">
        <div
          className="w-36 sm:w-44 flex-shrink-0 overflow-y-auto p-2"
          data-jarvis-scrollable
          style={{
            borderRight: `1px solid ${ACCENT}18`,
            background: 'rgba(0,10,4,0.7)',
            scrollbarWidth: 'thin',
            scrollbarColor: 'rgba(34,197,94,0.35) transparent',
          }}
        >
          <p style={{ ...mono, fontSize: 8, color: `${ACCENT}88`, letterSpacing: '0.1em', marginBottom: 8 }}>EXPLORER</p>
          {[`${name}/`, '  src/', '    App.tsx', '    main.tsx', '  package.json', '  README.md', '  .git/'].map(f => (
            <div key={f} style={{ ...mono, fontSize: 10, color: 'rgba(200,255,220,0.55)', lineHeight: 1.7 }}>
              {f}
            </div>
          ))}
        </div>

        <div className="flex-1 min-w-0 p-4 overflow-auto" data-jarvis-scrollable>
          <p style={{ ...mono, fontSize: 9, color: 'rgba(255,255,255,0.3)', marginBottom: 12 }}>
            // contexte projet injecté par Hermès — simulation HUD
          </p>
          <pre
            style={{
              ...mono,
              fontSize: 11,
              color: 'rgba(180,255,200,0.85)',
              lineHeight: 1.55,
              margin: 0,
              whiteSpace: 'pre-wrap',
            }}
          >{`export default function App() {
  return (
    <main>
      <h1>${name}</h1>
      {/* Agent Dev · prêt */}
    </main>
  );
}`}</pre>
        </div>
      </div>

      <div
        className="px-3 py-1.5 flex-shrink-0"
        style={{ borderTop: `1px solid ${ACCENT}18`, background: 'rgba(0,8,4,0.9)' }}
      >
        <span style={{ ...mono, fontSize: 8, color: 'rgba(255,255,255,0.35)' }}>
          Workspace Core · Agent Laptop natif = Phase B
        </span>
      </div>
    </div>
  );
}
