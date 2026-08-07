/**
 * Mode INSTALL — écran d’accueil avant l’assistant.
 * Produit : nouveau NUC / réinstall / premier client, zéro hypothèse famille.
 */
import React from 'react';
import { motion } from 'motion/react';
import { UserPlus } from 'lucide-react';

const orbF = { fontFamily: 'Orbitron, sans-serif' };
const mono = { fontFamily: 'Share Tech Mono, monospace' };

export function InstallWelcome({ onStart }: { onStart: () => void }) {
  return (
    <div className="fixed inset-0 z-[200] flex flex-col items-center justify-center bg-black px-6">
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(ellipse 70% 50% at 50% 40%, rgba(0,80,120,0.35), transparent 70%)',
        }}
      />
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="relative z-10 flex flex-col items-center text-center max-w-lg gap-6"
      >
        <p style={{ ...orbF, color: '#00f5ff', fontSize: 13, letterSpacing: '0.28em' }}>
          BIENVENUE DANS JARVIS
        </p>
        <h1
          style={{
            ...orbF,
            color: 'rgba(255,255,255,0.92)',
            fontSize: 'clamp(22px, 4vw, 32px)',
            letterSpacing: '0.06em',
            lineHeight: 1.25,
          }}
        >
          Aucun utilisateur n’est configuré sur cette station.
        </h1>
        <p style={{ ...mono, color: 'rgba(255,255,255,0.45)', fontSize: 12, lineHeight: 1.6 }}>
          Créez le premier profil pour activer l’identification faciale
          et déverrouiller l’interface.
        </p>
        <motion.button
          type="button"
          whileHover={{ scale: 1.03 }}
          whileTap={{ scale: 0.98 }}
          onClick={onStart}
          className="mt-2 flex items-center gap-3 px-6 py-3.5 rounded-xl cursor-pointer"
          style={{
            background: 'rgba(0,245,255,0.1)',
            border: '1px solid rgba(0,245,255,0.45)',
            boxShadow: '0 0 24px rgba(0,245,255,0.15)',
          }}
        >
          <UserPlus className="w-5 h-5" style={{ color: '#00f5ff' }} />
          <span style={{ ...orbF, color: '#00f5ff', fontSize: 12, letterSpacing: '0.14em' }}>
            CRÉER LE PREMIER UTILISATEUR
          </span>
        </motion.button>
      </motion.div>
    </div>
  );
}
