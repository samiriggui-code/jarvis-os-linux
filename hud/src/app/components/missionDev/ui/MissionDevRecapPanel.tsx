import React from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Check } from 'lucide-react';
import type { MissionDevStep } from '../../../context/AppContext';
import { MC_CYAN, mcMono } from '../lib/mcDevTokens';

/**
 * Récap livrables — page courante uniquement, PAS de scrollbar.
 * Débordement → écran jaune (parent) → nouvelle page verte.
 */
export function MissionDevRecapPanel({
  items,
  page,
  totalPages,
  label = 'LIVRABLES — ÉNUMÉRATION',
}: {
  items: MissionDevStep[];
  page: number;
  totalPages: number;
  label?: string;
}) {
  return (
    <div className="flex-1 min-h-0 flex flex-col gap-2 overflow-hidden">
      <div className="flex items-center justify-between gap-2 flex-shrink-0">
        <p style={{ ...mcMono, fontSize: 9, color: `${MC_CYAN}88`, letterSpacing: '0.12em', margin: 0 }}>
          {label}
        </p>
        {totalPages > 1 && (
          <span style={{ ...mcMono, fontSize: 8, color: 'rgba(255,255,255,0.35)' }}>
            PAGE {page + 1}/{totalPages}
          </span>
        )}
      </div>

      <div className="flex-1 min-h-0 overflow-hidden">
        <ul className="flex flex-col gap-2">
          <AnimatePresence initial={false}>
            {items.map((step, i) => (
              <motion.li
                key={`${page}-${step.id}`}
                initial={{ opacity: 0, y: 12, filter: 'blur(6px)' }}
                animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
                className="flex items-center gap-3 rounded-xl px-3 py-2.5"
                style={{
                  background: 'rgba(34,197,94,0.07)',
                  border: '1px solid rgba(34,197,94,0.28)',
                  boxShadow: i === items.length - 1 ? '0 0 16px rgba(34,197,94,0.18)' : undefined,
                }}
              >
                <Check className="w-3.5 h-3.5 flex-shrink-0" style={{ color: '#22c55e' }} />
                <span
                  className="min-w-0 break-words"
                  style={{ ...mcMono, fontSize: 11, color: 'rgba(180,255,200,0.95)', letterSpacing: '0.04em' }}
                >
                  {step.label}  ✓
                </span>
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      </div>
    </div>
  );
}
