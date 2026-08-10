import React, { useState } from 'react';
import { Grid } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { getPinnedApps, type HudApp } from '../apps/catalog';
import { openHudApp } from '../bridge/openHudApp';
import { GlassDock } from '../../components/glass/GlassDock';
import { GlassButton } from '../../components/glass/GlassButton';
import { tokens } from '../../ui/tokens';
import { MUTED, monoFont } from './hudTheme';

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
    <div className="relative z-[60] flex-shrink-0 flex items-center justify-center px-4 py-2">
      <GlassDock gap="xs">
        {pinned.map(app => {
          const active = openApps.some(a => a.id === app.id) || activeAppId === app.id;
          const scale = hovered === app.id ? 1.12 : 1;
          return (
            <button
              key={app.id}
              type="button"
              title={app.name}
              onClick={() => open(app)}
              onMouseEnter={() => setHovered(app.id)}
              onMouseLeave={() => setHovered(null)}
              className="relative w-10 h-10 rounded-xl flex items-center justify-center cursor-pointer glass-btn"
              style={{
                transform: `scale(${scale})`,
                transition: 'transform 0.15s ease',
                background: hovered === app.id ? `${app.color}18` : tokens.color.surface,
                border: `1px solid ${hovered === app.id ? `${app.color}40` : tokens.color.border}`,
              }}
            >
              <app.icon className="w-5 h-5" style={{ color: app.color }} strokeWidth={1.7} />
              {active && (
                <span
                  className="absolute bottom-0.5 w-1 h-1 rounded-full"
                  style={{ background: app.color }}
                />
              )}
            </button>
          );
        })}

        <div style={{ width: 1, height: 22, background: tokens.color.border, margin: '0 2px' }} />

        <GlassButton
          tone="accent"
          icon={<Grid className="w-5 h-5" />}
          onClick={() => setAppGridOpen(true)}
          title="Toutes les apps"
          style={{ width: 40, height: 40, padding: 0, justifyContent: 'center', borderRadius: 14 }}
        />
      </GlassDock>

      <span className="absolute right-5 pointer-events-none" style={{ ...monoFont, fontSize: 8, color: MUTED, opacity: 0.5 }}>
        Apps
      </span>
    </div>
  );
}
