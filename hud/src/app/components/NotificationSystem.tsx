import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Info, CheckCircle, AlertTriangle, XCircle, Loader2 } from 'lucide-react';
import { useApp, type Notification, type NotificationAction } from '../context/AppContext';
import { getAppById } from '../apps/catalog';
import { getCoreClient } from '../bridge/coreClient';
import { GlassPanel } from '../../components/glass';
import { ACCENT, DANGER, MUTED, SUCCESS, WARNING, bodyFont } from './hudTheme';

const typeConfig = {
  info: { icon: Info, color: ACCENT, tone: 'regular' as const },
  success: { icon: CheckCircle, color: SUCCESS, tone: 'subtle' as const },
  warning: { icon: AlertTriangle, color: WARNING, tone: 'regular' as const },
  error: { icon: XCircle, color: DANGER, tone: 'strong' as const },
  pending: { icon: Loader2, color: ACCENT, tone: 'regular' as const },
};

function runNotificationAction(
  notif: Notification,
  launchApp: ReturnType<typeof useApp>['launchApp'],
  action?: NotificationAction,
) {
  const act = action ?? notif.action;
  if (!act) return;
  act.onClick?.();
  if (act.app) {
    const app = getAppById(act.app);
    if (app) {
      launchApp({
        id: app.id,
        name: app.name,
        color: app.color,
        icon: app.icon,
      });
    }
  }
  if (act.intent) {
    try {
      getCoreClient().send({ type: 'intent', intent: act.intent, prompt: notif.message });
    } catch {
      /* Core offline */
    }
  }
}

function ActionButton({
  label,
  color,
  muted,
  onClick,
}: {
  label: string;
  color: string;
  muted?: boolean;
  onClick: () => void;
}) {
  return (
    <motion.button
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.96 }}
      onClick={onClick}
      className="px-2 py-0.5 rounded cursor-pointer"
      style={{
        ...bodyFont,
        fontSize: 10,
        fontWeight: 600,
        color: muted ? MUTED : color,
        background: muted ? 'rgba(255,255,255,0.04)' : `${color}18`,
        border: muted ? '1px solid rgba(255,255,255,0.12)' : `1px solid ${color}40`,
      }}
    >
      {label}
    </motion.button>
  );
}

function NotifCard({ notif }: { notif: Notification }) {
  const { removeNotification, launchApp } = useApp();
  const cfg = typeConfig[notif.type] ?? typeConfig.info;
  const Icon = cfg.icon;
  const pending = notif.type === 'pending';

  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: -40, scale: 0.96 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={{ opacity: 0, x: -40, scale: 0.94 }}
      transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
      style={{ width: 236 }}
    >
      <GlassPanel level={cfg.tone} radius="md" padding="xs" style={{ overflow: 'hidden' }}>
        <div className="flex items-start gap-2">
          <div
            className="w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0"
            style={{ background: `${cfg.color}14`, border: `1px solid ${cfg.color}28` }}
          >
            <Icon
              className={`w-3 h-3 ${pending ? 'animate-spin' : ''}`}
              style={{ color: cfg.color }}
            />
          </div>
          <div className="flex-1 min-w-0">
            <p style={{ ...bodyFont, color: cfg.color, fontSize: 11, fontWeight: 600, margin: 0, lineHeight: 1.25 }}>
              {notif.title}
            </p>
            {notif.message ? (
              <p style={{ ...bodyFont, color: MUTED, fontSize: 10, marginTop: 2, lineHeight: 1.35 }}>
                {notif.message}
              </p>
            ) : null}
            {notif.action || notif.secondaryAction ? (
              <div className="mt-1.5 flex flex-wrap gap-1">
                {notif.action ? (
                  <ActionButton
                    label={notif.action.label}
                    color={cfg.color}
                    onClick={() => {
                      runNotificationAction(notif, launchApp, notif.action);
                      removeNotification(notif.id);
                    }}
                  />
                ) : null}
                {notif.secondaryAction ? (
                  <ActionButton
                    label={notif.secondaryAction.label}
                    color={cfg.color}
                    muted
                    onClick={() => {
                      runNotificationAction(notif, launchApp, notif.secondaryAction);
                      removeNotification(notif.id);
                    }}
                  />
                ) : null}
              </div>
            ) : null}
          </div>
          {!pending ? (
            <motion.button
              whileHover={{ scale: 1.08 }}
              whileTap={{ scale: 0.92 }}
              onClick={() => removeNotification(notif.id)}
              className="w-5 h-5 rounded-md flex items-center justify-center flex-shrink-0 cursor-pointer"
              style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}
            >
              <X className="w-2.5 h-2.5" style={{ color: MUTED }} />
            </motion.button>
          ) : null}
        </div>
        {notif.durationMs != null ? (
          <motion.div
            initial={{ width: '100%' }}
            animate={{ width: '0%' }}
            transition={{ duration: Math.max(0.5, (notif.durationMs || 6000) / 1000), ease: 'linear' }}
            className="h-px mt-1.5"
            style={{ background: `${cfg.color}50` }}
          />
        ) : (
          <div className="h-px mt-1.5" style={{ background: `${cfg.color}22` }} />
        )}
      </GlassPanel>
    </motion.div>
  );
}

export function NotificationSystem() {
  const { notifications } = useApp();

  return (
    <div
      className="fixed flex flex-col gap-1.5 pointer-events-none"
      style={{ top: 72, left: 16, zIndex: 300, maxWidth: 248 }}
    >
      <AnimatePresence mode="popLayout">
        {notifications.slice(0, 4).map((n) => (
          <div key={n.id} className="pointer-events-auto">
            <NotifCard notif={n} />
          </div>
        ))}
      </AnimatePresence>
    </div>
  );
}
