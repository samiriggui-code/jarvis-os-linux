/**
 * Mode kiosque voix : bloque souris/clavier sur le chrome HUD.
 * Recovery (Ctrl+Alt+R) réactive les contrôles maintenance.
 * Jarvis peut basculer via « mode recovery » / « mode voix ».
 */
import { useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Wrench, Mic } from 'lucide-react';
import { useApp } from '../context/AppContext';

const mono = { fontFamily: 'Share Tech Mono, monospace' };

export function InteractionLock() {
  const { inputMode, toggleRecoveryMode, setInputMode, addNotification } = useApp();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.altKey && (e.key === 'r' || e.key === 'R')) {
        e.preventDefault();
        e.stopPropagation();
        toggleRecoveryMode();
        return;
      }
      if (inputMode === 'voice') {
        // Laisse passer seulement raccourcis recovery ; bloque le reste du chrome
        const t = e.target as HTMLElement | null;
        if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) {
          e.preventDefault();
          e.stopPropagation();
        }
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [inputMode, toggleRecoveryMode]);

  useEffect(() => {
    document.documentElement.dataset.jarvisInput = inputMode;
    document.body.classList.toggle('jarvis-voice-only', inputMode === 'voice');
    document.body.classList.toggle('jarvis-recovery', inputMode === 'recovery');
  }, [inputMode]);

  // Expose pour iframe Dashboard / Hermes
  useEffect(() => {
    const w = window as Window & { __jarvisSetInputMode?: (m: 'voice' | 'recovery') => void };
    w.__jarvisSetInputMode = (m) => {
      setInputMode(m);
      addNotification({
        type: m === 'recovery' ? 'warning' : 'info',
        title: m === 'recovery' ? 'Recovery' : 'Voix',
        message: m === 'recovery' ? 'Maintenance clavier/souris.' : 'Retour kiosque vocal.',
      });
    };
    return () => { delete w.__jarvisSetInputMode; };
  }, [setInputMode, addNotification]);

  return (
    <AnimatePresence>
      {inputMode === 'recovery' && (
        <motion.div
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -12 }}
          className="fixed top-14 left-1/2 -translate-x-1/2 z-[400] flex items-center gap-3 px-4 py-2 rounded-xl"
          style={{
            background: 'rgba(40,12,8,0.92)',
            border: '1px solid rgba(255,107,74,0.5)',
            boxShadow: '0 0 24px rgba(255,107,74,0.25)',
            pointerEvents: 'auto',
          }}
          data-jarvis-always-interactive
        >
          <Wrench className="w-4 h-4" style={{ color: '#FF6B4A' }} />
          <span style={{ ...mono, color: '#FF6B4A', fontSize: 10, letterSpacing: '0.08em' }}>
            RECOVERY — CLICS / CLAVIER ACTIFS
          </span>
          <button
            type="button"
            onClick={() => setInputMode('voice')}
            className="flex items-center gap-1.5 px-2 py-1 rounded-lg cursor-pointer"
            style={{ background: 'rgba(0,245,255,0.1)', border: '1px solid rgba(0,245,255,0.35)' }}
          >
            <Mic className="w-3 h-3" style={{ color: '#00f5ff' }} />
            <span style={{ ...mono, color: '#00f5ff', fontSize: 9 }}>MODE VOIX</span>
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
