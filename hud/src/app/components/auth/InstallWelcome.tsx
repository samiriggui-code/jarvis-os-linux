/**
 * Mode INSTALL — écran d’accueil avant l’assistant.
 * Langage Vision (glass + SF), plus de cyber HUD.
 */
import React from 'react';
import { motion } from 'motion/react';
import { UserPlus } from 'lucide-react';
import { GlassCard, GlassButton } from '../../../components/glass';
import { tokens } from '../../../ui/tokens';
import { visionCaption, visionTitle, visionBody } from '../visionChrome';

export function InstallWelcome({ onStart }: { onStart: () => void }) {
  return (
    <div
      className="fixed inset-0 z-[200] flex flex-col items-center justify-center px-6"
      style={{ background: tokens.color.void }}
    >
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(ellipse 70% 50% at 50% 40%, rgba(10,132,255,0.22), transparent 70%)',
        }}
      />
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="relative z-10"
      >
        <GlassCard level="strong" radius="lg" padding="xl" style={{ maxWidth: 520, textAlign: 'center' }}>
          <p style={{ ...visionCaption, color: tokens.color.accent, fontSize: 12, fontWeight: 560 }}>
            Bienvenue dans Jarvis
          </p>
          <h1
            style={{
              ...visionTitle,
              fontSize: 'clamp(22px, 4vw, 32px)',
              fontWeight: 650,
              lineHeight: 1.25,
              margin: '18px 0 0',
            }}
          >
            Aucun utilisateur sur ce poste.
          </h1>
          <p
            style={{
              ...visionBody,
              fontSize: 14,
              margin: '14px 0 0',
            }}
          >
            Créez le compte administrateur : prénom, civilité, puis la phrase « Jarvis, active-toi ».
            Auth vocale uniquement — pas de caméra.
          </p>
          <div style={{ marginTop: 22, display: 'flex', justifyContent: 'center' }}>
            <GlassButton
              tone="accent"
              active
              icon={<UserPlus className="w-5 h-5" />}
              onClick={onStart}
              style={{ fontFamily: tokens.font.body, fontSize: 14, padding: '14px 24px', fontWeight: 560 }}
            >
              Créer le premier utilisateur
            </GlassButton>
          </div>
        </GlassCard>
      </motion.div>
    </div>
  );
}
