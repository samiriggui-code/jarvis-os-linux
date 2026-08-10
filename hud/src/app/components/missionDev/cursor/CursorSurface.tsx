/**
 * Surface Cursor — simulation fenêtre IDE (§15).
 * Prod : Agent Laptop / Cursor natif remplacera ce stub.
 */
import React from 'react';
import { motion } from 'motion/react';
import { SUCCESS, monoFont, orbFont } from '../../hudTheme';
import { tokens } from '../../../../ui/tokens';

const ACCENT = SUCCESS;

export function CursorSurface({ projectName }: { projectName?: string }) {
  const name = projectName || 'HoloControl';
  return (
    <div className="h-full min-h-0 flex flex-col overflow-hidden" style={{ background: tokens.color.surface, backdropFilter: tokens.glass }}>
      <div
        className="flex items-center gap-3 px-4 py-2 flex-shrink-0"
        style={{ borderBottom: `1px solid ${tokens.color.border}`, background: tokens.color.surfaceRaised }}
      >
        <span style={{ ...orbFont, color: ACCENT, fontSize: 11 }}>Cursor</span>
        <span style={{ ...monoFont, color: tokens.color.textMuted, fontSize: 10 }}>{name}</span>
        <motion.span
          animate={{ opacity: [1, 0.35, 1] }}
          transition={{ duration: 1.4, repeat: Infinity }}
          style={{ ...monoFont, color: ACCENT, fontSize: 8, marginLeft: 'auto', letterSpacing: '0.02em' }}
        >
          Prêt
        </motion.span>
      </div>

      <div className="flex-1 min-h-0 flex overflow-hidden">
        <div
          className="w-36 sm:w-44 flex-shrink-0 overflow-y-auto p-2"
          data-jarvis-scrollable
          style={{
            borderRight: `1px solid ${tokens.color.border}`,
            background: tokens.color.surface,
            scrollbarWidth: 'thin',
            scrollbarColor: 'rgba(52,199,89,0.35) transparent',
          }}
        >
          <p style={{ ...monoFont, fontSize: 8, color: tokens.color.textMuted, letterSpacing: '0.02em', marginBottom: 8 }}>Explorer</p>
          {[`${name}/`, '  src/', '    App.tsx', '    main.tsx', '  package.json', '  README.md', '  .git/'].map(f => (
            <div key={f} style={{ ...monoFont, fontSize: 10, color: tokens.color.textMuted, lineHeight: 1.7 }}>
              {f}
            </div>
          ))}
        </div>

        <div className="flex-1 min-w-0 p-4 overflow-auto" data-jarvis-scrollable>
          <p style={{ ...monoFont, fontSize: 9, color: tokens.color.textMuted, marginBottom: 12 }}>
            // contexte projet injecté par Hermès — simulation HUD
          </p>
          <pre
            style={{
              ...monoFont,
              fontSize: 11,
              color: tokens.color.text,
              lineHeight: 1.55,
              margin: 0,
              whiteSpace: 'pre-wrap',
              opacity: 0.85,
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
        style={{ borderTop: `1px solid ${tokens.color.border}`, background: tokens.color.surfaceRaised }}
      >
        <span style={{ ...monoFont, fontSize: 8, color: tokens.color.textMuted }}>
          Workspace Core · Agent Laptop natif = Phase B
        </span>
      </div>
    </div>
  );
}
