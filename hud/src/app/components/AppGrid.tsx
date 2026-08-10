import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X } from 'lucide-react';
import { useApp } from '../context/AppContext';
import {
  APP_CATEGORIES,
  HUD_APPS,
  riskLabel,
  statusLabel,
  type AppCat,
  type HudApp,
} from '../apps/catalog';
import { openHudApp } from '../bridge/openHudApp';
import { GlassButton } from '../../components/glass';
import { tokens } from '../../ui/tokens';
import { bodyFont, monoFont, orbFont, MUTED, TEXT } from './hudTheme';
import { visionCaption } from './visionChrome';

export function AppGrid() {
  const {
    appGridOpen, setAppGridOpen, setSettingsOpen, setGestureOpen,
    addNotification, launchApp, requestDashboard, openSettings, coreAuth,
  } = useApp();
  const [cat, setCat] = useState<'Tout' | AppCat>('Tout');

  const filtered = HUD_APPS.filter(a => cat === 'Tout' || a.cat === cat);
  const isAdmin =
    coreAuth?.user?.role === 'ADMIN' ||
    (coreAuth?.user?.permissions ?? []).includes('dashboard_access');

  const open = (app: HudApp) => {
    openHudApp(app, {
      launchApp,
      setSettingsOpen,
      setGestureOpen,
      setAppGridOpen,
      requestDashboard,
      openSettings,
      addNotification,
      isAdmin,
      role: coreAuth?.user?.role,
    });
  };

  return (
    <AnimatePresence>
      {appGridOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 flex flex-col"
          style={{ zIndex: 150, background: 'rgba(8, 8, 10, 0.78)', backdropFilter: tokens.glass }}
        >
          <header className="flex items-center justify-between px-8 py-5 flex-shrink-0" style={{ borderBottom: `1px solid ${tokens.color.border}` }}>
            <div>
              <h2 style={{ ...orbFont, color: TEXT, fontSize: 18, margin: 0 }}>
                Applications
              </h2>
              <p style={{ ...visionCaption, fontSize: 10, marginTop: 6 }}>
                Hermes commande · VPS limité · Admin = Dashboard
              </p>
            </div>
            <GlassButton
              tone="neutral"
              onClick={() => setAppGridOpen(false)}
              className="w-9 h-9 !p-0 !rounded-full justify-center"
              aria-label="Fermer les applications"
            >
              <X className="w-4 h-4" style={{ color: MUTED }} />
            </GlassButton>
          </header>

          <div className="flex gap-2 px-8 py-4 flex-shrink-0 flex-wrap">
            {APP_CATEGORIES.map(c => {
              const on = cat === c;
              return (
                <button
                  key={c}
                  type="button"
                  onClick={() => setCat(c)}
                  className="px-3.5 py-1.5 rounded-full cursor-pointer"
                  style={{
                    background: on ? tokens.color.accentSoft : 'transparent',
                    border: `1px solid ${on ? tokens.color.borderActive : tokens.color.border}`,
                  }}
                >
                    <span style={{ ...monoFont, color: on ? tokens.color.accent : MUTED, fontSize: 10, letterSpacing: '0.02em' }}>
                    {c}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="flex-1 overflow-y-auto px-8 pb-10">
            <div
              className="grid gap-3"
              style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(108px, 1fr))' }}
            >
              {filtered.map(app => {
                const soon = app.status === 'soon';
                const locked = Boolean(app.adminOnly && !isAdmin);
                return (
                  <button
                    key={app.id}
                    type="button"
                    onClick={() => open(app)}
                    className="group flex flex-col items-center gap-2.5 p-3 rounded-2xl cursor-pointer text-center"
                    style={{
                      background: tokens.color.surface,
                      border: `1px solid ${tokens.color.border}`,
                      opacity: soon || locked ? 0.45 : 1,
                      transition: 'background 0.2s, border-color 0.2s, transform 0.2s',
                    }}
                    onMouseEnter={e => {
                      e.currentTarget.style.background = `color-mix(in srgb, ${app.color} 10%, transparent)`;
                      e.currentTarget.style.borderColor = `${app.color}33`;
                    }}
                    onMouseLeave={e => {
                      e.currentTarget.style.background = tokens.color.surface;
                      e.currentTarget.style.borderColor = tokens.color.border;
                    }}
                  >
                    <div
                      className="w-12 h-12 rounded-xl flex items-center justify-center"
                      style={{
                        background: `linear-gradient(160deg, ${app.color}22, rgba(0,0,0,0.35))`,
                        border: `1px solid ${app.color}28`,
                      }}
                    >
                      <app.icon className="w-6 h-6" style={{ color: app.color }} strokeWidth={1.6} />
                    </div>
                    <span style={{ ...bodyFont, color: TEXT, fontSize: 13, lineHeight: 1.15 }}>
                      {app.name}
                    </span>
                    <span style={{ ...monoFont, color: soon ? MUTED : `${app.color}99`, fontSize: 8, letterSpacing: '0.02em' }}>
                      {locked ? 'Admin' : app.vpsLimited ? 'VPS limité' : statusLabel(app.status)}
                    </span>
                    {(app.risk === 'vps' || app.risk === 'admin') && !soon && (
                      <span style={{ ...monoFont, color: MUTED, fontSize: 7, letterSpacing: '0.02em' }}>
                        {riskLabel(app.risk)}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
