import React, { useState } from 'react';
import { Grid } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { getPinnedApps, type HudApp } from '../apps/catalog';
import { openHudApp } from '../bridge/openHudApp';

const mono = { fontFamily: 'Share Tech Mono, monospace' };

export function AppDock() {
  const {
    setAppGridOpen, setSettingsOpen, setGestureOpen, addNotification,
    launchApp, openApps, activeAppId, requestDashboard, openSettings, coreAuth,
  } = useApp();
  const [hovered, setHovered] = useState<string | null>(null);
  const pinned = getPinnedApps();
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
    <div
      className="relative z-[60] flex-shrink-0 flex items-center justify-center px-4"
      style={{
        height: 56,
        background: 'rgba(2, 6, 14, 0.88)',
        borderTop: '1px solid rgba(255,255,255,0.06)',
      }}
    >
      <div
        className="flex items-center gap-1 px-2 py-1 rounded-2xl"
        style={{
          background: 'rgba(255,255,255,0.03)',
          border: '1px solid rgba(255,255,255,0.07)',
        }}
      >
        {pinned.map(app => {
          const active = openApps.some(a => a.id === app.id) || activeAppId === app.id;
          const scale = hovered === app.id ? 1.12 : 1;
          return (
            <button
              key={app.id}
              type="button"
              title={`${app.name}${app.vpsLimited ? ' (VPS limité)' : ''}${app.adminOnly ? ' (ADMIN)' : ''}`}
              onClick={() => open(app)}
              onMouseEnter={() => setHovered(app.id)}
              onMouseLeave={() => setHovered(null)}
              className="relative w-10 h-10 rounded-xl flex items-center justify-center cursor-pointer"
              style={{
                transform: `scale(${scale})`,
                transition: 'transform 0.15s ease',
                background: hovered === app.id ? `${app.color}18` : 'transparent',
              }}
            >
              <app.icon className="w-5 h-5" style={{ color: app.color }} strokeWidth={1.7} />
              {active && (
                <span
                  className="absolute bottom-0.5 w-1 h-1 rounded-full"
                  style={{ background: app.color, boxShadow: `0 0 6px ${app.color}` }}
                />
              )}
            </button>
          );
        })}

        <div style={{ width: 1, height: 22, background: 'rgba(255,255,255,0.08)', margin: '0 4px' }} />

        <button
          type="button"
          title="Toutes les apps"
          onClick={() => setAppGridOpen(true)}
          className="w-10 h-10 rounded-xl flex items-center justify-center cursor-pointer"
          style={{ background: 'rgba(0,245,255,0.06)' }}
        >
          <Grid className="w-5 h-5" style={{ color: '#00f5ff' }} strokeWidth={1.7} />
        </button>
      </div>

      <span
        className="absolute right-5 pointer-events-none"
        style={{ ...mono, fontSize: 8, color: 'rgba(255,255,255,0.22)', letterSpacing: '0.12em' }}
      >
        DOCK
      </span>
    </div>
  );
}
