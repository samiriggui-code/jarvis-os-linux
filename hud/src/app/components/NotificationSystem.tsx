import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Info, CheckCircle, AlertTriangle, XCircle } from 'lucide-react';
import { useApp, Notification } from '../context/AppContext';

const mono = { fontFamily: 'Share Tech Mono, monospace' };
const raj = { fontFamily: 'Rajdhani, sans-serif' };

const typeConfig = {
  info: { icon: Info, color: '#00f5ff', bg: 'rgba(0,245,255,0.06)', border: 'rgba(0,245,255,0.25)' },
  success: { icon: CheckCircle, color: '#22c55e', bg: 'rgba(34,197,94,0.06)', border: 'rgba(34,197,94,0.25)' },
  warning: { icon: AlertTriangle, color: '#f59e0b', bg: 'rgba(245,158,11,0.06)', border: 'rgba(245,158,11,0.25)' },
  error: { icon: XCircle, color: '#ef4444', bg: 'rgba(239,68,68,0.06)', border: 'rgba(239,68,68,0.25)' },
};

function NotifCard({ notif }: { notif: Notification }) {
  const { removeNotification } = useApp();
  const cfg = typeConfig[notif.type];
  const Icon = cfg.icon;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: 60, scale: 0.95 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={{ opacity: 0, x: 60, scale: 0.9 }}
      transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
      className="rounded-xl overflow-hidden"
      style={{
        background: cfg.bg,
        backdropFilter: 'blur(20px)',
        border: `1px solid ${cfg.border}`,
        boxShadow: `0 0 20px ${cfg.color}10`,
        width: 300,
      }}
    >
      {/* Accent line */}
      <div className="h-0.5" style={{ background: `linear-gradient(90deg, ${cfg.color}, transparent)` }} />

      <div className="p-3 flex items-start gap-3">
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
          style={{ background: `${cfg.color}12`, border: `1px solid ${cfg.color}20` }}
        >
          <Icon className="w-4 h-4" style={{ color: cfg.color }} />
        </div>

        <div className="flex-1 min-w-0">
          <p style={{ ...mono, color: cfg.color, fontSize: '10px', letterSpacing: '0.05em' }}>{notif.title}</p>
          <p style={{ ...raj, color: 'rgba(255,255,255,0.65)', fontSize: '12px', marginTop: 2, lineHeight: 1.4 }}>
            {notif.message}
          </p>
        </div>

        <motion.button
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.9 }}
          onClick={() => removeNotification(notif.id)}
          className="w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0 cursor-pointer"
          style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}
        >
          <X className="w-3 h-3" style={{ color: 'rgba(255,255,255,0.35)' }} />
        </motion.button>
      </div>

      {/* Auto-dismiss progress */}
      <motion.div
        initial={{ width: '100%' }}
        animate={{ width: '0%' }}
        transition={{ duration: 6, ease: 'linear' }}
        className="h-0.5"
        style={{ background: `${cfg.color}40` }}
      />
    </motion.div>
  );
}

export function NotificationSystem() {
  const { notifications } = useApp();

  return (
    <div
      className="fixed flex flex-col gap-2 pointer-events-none"
      style={{ top: 72, right: 20, zIndex: 300 }}
    >
      <AnimatePresence mode="popLayout">
        {notifications.map(n => (
          <div key={n.id} className="pointer-events-auto">
            <NotifCard notif={n} />
          </div>
        ))}
      </AnimatePresence>
    </div>
  );
}
