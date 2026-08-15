import React, { useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { MessageSquare, X } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { CommandConsole } from './CommandConsole';
import { GlassPanel } from '../../components/glass/GlassPanel';
import { GlassButton } from '../../components/glass/GlassButton';
import { tokens } from '../../ui/tokens';

/**
 * Chat option C — une ligne (dernière réplique / transcript) sous l'orbe ;
 * tiroir plein CommandConsole à la demande (brief HUD veille).
 */
export function ChatPeek({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { messages, liveTranscript, aiState } = useApp();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onOpenChange(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onOpenChange]);

  const last = messages.length > 0 ? messages[messages.length - 1] : null;
  const peekText = (() => {
    if (aiState === 'listening' && liveTranscript.trim()) {
      return liveTranscript.trim();
    }
    if (last) {
      const who = last.type === 'user' ? 'Vous' : 'Jarvis';
      const body = last.text.length > 90 ? `${last.text.slice(0, 90)}…` : last.text;
      return `${who} · ${body}`;
    }
    return 'Parlez ou touchez pour ouvrir le chat';
  })();

  return (
    <>
      <button
        type="button"
        onClick={() => onOpenChange(true)}
        className="w-full max-w-md mx-auto cursor-pointer text-left"
        aria-label="Ouvrir le chat"
      >
        <GlassPanel
          level="subtle"
          padding="sm"
          className="flex items-center gap-2 w-full"
          style={{ borderRadius: 16, opacity: 0.92 }}
        >
          <MessageSquare
            className="w-3.5 h-3.5 flex-shrink-0"
            style={{ color: tokens.color.accent }}
          />
          <span
            className="min-w-0 flex-1 truncate"
            style={{
              fontFamily: tokens.font.body,
              color: tokens.color.text,
              fontSize: 13,
              lineHeight: 1.35,
              opacity: 0.88,
            }}
          >
            {peekText}
          </span>
        </GlassPanel>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            key="chat-drawer"
            className="fixed inset-0 z-[120] flex flex-col justify-end sm:justify-center items-center p-3 sm:p-6"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            <button
              type="button"
              className="absolute inset-0 bg-black/45 cursor-pointer border-0"
              aria-label="Fermer le chat"
              onClick={() => onOpenChange(false)}
            />
            <motion.div
              initial={{ y: 48, opacity: 0.85, scale: 0.98 }}
              animate={{ y: 0, opacity: 1, scale: 1 }}
              exit={{ y: 40, opacity: 0 }}
              transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
              className="relative z-[1] w-full max-w-lg h-[min(72vh,560px)] flex flex-col"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="absolute top-2 right-2 z-10">
                <GlassButton
                  tone="neutral"
                  aria-label="Fermer"
                  icon={<X className="w-4 h-4" />}
                  onClick={() => onOpenChange(false)}
                  style={{ width: 32, height: 32, padding: 0, placeContent: 'center', borderRadius: 12 }}
                />
              </div>
              <div className="flex-1 min-h-0 overflow-hidden rounded-[28px]">
                <CommandConsole />
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
