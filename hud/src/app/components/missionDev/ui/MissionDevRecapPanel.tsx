import React from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Check } from 'lucide-react';
import type { MissionDevStep } from '../../../context/AppContext';
import { mcMono } from '../lib/mcDevTokens';
import { tokens } from '../../../../ui/tokens';
import { SUCCESS } from '../../hudTheme';

/**
 * Récap livrables — page courante uniquement, PAS de scrollbar.
 * Débordement → écran jaune (parent) → nouvelle page verte.
 */
export function MissionDevRecapPanel({
  items,
  page,
  totalPages,
  label = 'Livrables — énumération',
}: {
  items: MissionDevStep[];
  page: number;
  totalPages: number;
  label?: string;
}) {
  return (
    <div className="flex-1 min-h-0 flex flex-col gap-2 overflow-hidden">
      <div className="flex items-center justify-between gap-2 flex-shrink-0">
        <p style={{ ...mcMono, fontSize: 9, color: tokens.color.textMuted, letterSpacing: '0.02em', margin: 0 }}>
          {label}
        </p>
        {totalPages > 1 && (
          <span style={{ ...mcMono, fontSize: 8, color: tokens.color.textMuted }}>
            Page {page + 1}/{totalPages}
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
                  background: 'rgba(52,199,89,0.07)',
                  border: `1px solid rgba(52,199,89,0.28)`,
                }}
              >
                <Check className="w-3.5 h-3.5 flex-shrink-0" style={{ color: SUCCESS }} />
                <span
                  className="min-w-0 break-words"
                  style={{ ...mcMono, fontSize: 11, color: tokens.color.text, letterSpacing: '0.01em' }}
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
