import React from 'react';
import { motion } from 'motion/react';
import { AreaChart, Area, ResponsiveContainer } from 'recharts';
import { Activity, Cpu, Database, HardDrive } from 'lucide-react';
import {
  useSystemMetrics,
  formatUptime,
  THREAT_COLORS,
  THREAT_LABELS,
} from '../bridge/systemMetrics';
import { GlassPanel } from '../../components/glass/GlassPanel';
import { tokens } from '../../ui/tokens';
import { VisionChrome, visionBody, visionCaption, visionMono, visionTitle } from './visionChrome';

interface MetricCardProps {
  label: string;
  value: number;
  unit: string;
  color: string;
  icon: React.ReactNode;
  data: { t: number; v: number }[];
}

function MetricCard({ label, value, unit, color, icon, data }: MetricCardProps) {
  return (
    <GlassPanel level="subtle" radius="md" padding="sm">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span style={{ color: tokens.color.textMuted }}>{icon}</span>
          <span style={visionCaption}>{label}</span>
        </div>
        <span style={{ ...visionTitle, fontSize: 16, color: tokens.color.text }}>
          {Math.round(value)}
          <span style={{ fontSize: 11, opacity: 0.55, marginLeft: 2 }}>{unit}</span>
        </span>
      </div>
      <div className="h-1 rounded-full overflow-hidden mb-2" style={{ background: 'rgba(255,255,255,0.08)' }}>
        <motion.div
          className="h-full rounded-full"
          animate={{ width: `${value}%` }}
          transition={{ duration: 1, ease: 'easeOut' }}
          style={{ background: color }}
        />
      </div>
      <div style={{ height: 36 }}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 2, right: 0, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id={`grad-${label}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={color} stopOpacity={0.28} />
                <stop offset="95%" stopColor={color} stopOpacity={0} />
              </linearGradient>
            </defs>
            <Area
              type="monotone"
              dataKey="v"
              stroke={color}
              strokeWidth={1.5}
              fill={`url(#grad-${label})`}
              dot={false}
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </GlassPanel>
  );
}

export function SystemMonitor() {
  const { metrics: sys, history, ready } = useSystemMetrics();

  const series = (key: 'cpu' | 'ram' | 'disk') =>
    history.map((p, i) => ({ t: i, v: p[key] }));

  const accent = tokens.color.accent;
  const metrics = [
    { label: 'CPU', value: sys?.cpu ?? 0, unit: '%', color: accent, icon: <Cpu className="w-3.5 h-3.5" />, data: series('cpu') },
    { label: 'Mémoire', value: sys?.ram ?? 0, unit: '%', color: accent, icon: <Database className="w-3.5 h-3.5" />, data: series('ram') },
    { label: 'Disque', value: sys?.disk ?? 0, unit: '%', color: accent, icon: <HardDrive className="w-3.5 h-3.5" />, data: series('disk') },
  ];

  const level = sys?.threat_level ?? 'nominal';
  const overallHealth = sys?.threat ?? 0;
  const healthColor = ready ? THREAT_COLORS[level] : tokens.color.textMuted;

  return (
    <VisionChrome
      fill
      eyebrow="Système"
      title="Moniteur"
      trailing={
        <div className="flex items-center gap-1.5">
          <span
            className="w-1.5 h-1.5 rounded-full"
            style={{ background: ready ? tokens.color.success : tokens.color.textMuted }}
          />
          <span style={{ ...visionCaption, textTransform: 'none', letterSpacing: 0 }}>
            {ready ? 'En direct' : 'Hors ligne'}
          </span>
        </div>
      }
    >
      <div className="flex flex-col h-full gap-3 overflow-hidden min-h-0">
        <GlassPanel level="subtle" radius="md" padding="sm">
          <div className="flex items-center gap-4">
            <div className="relative w-12 h-12 flex-shrink-0">
              <svg viewBox="0 0 48 48" className="w-full h-full -rotate-90">
                <circle cx="24" cy="24" r="20" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="4" />
                <motion.circle
                  cx="24"
                  cy="24"
                  r="20"
                  fill="none"
                  stroke={healthColor}
                  strokeWidth="4"
                  strokeLinecap="round"
                  strokeDasharray={`${2 * Math.PI * 20}`}
                  animate={{ strokeDashoffset: 2 * Math.PI * 20 * (1 - overallHealth / 100) }}
                  transition={{ duration: 1, ease: 'easeOut' }}
                />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                <span style={{ ...visionMono, fontSize: 11, color: healthColor }}>
                  {ready ? Math.round(overallHealth) : '—'}
                </span>
              </div>
            </div>
            <div className="flex flex-col gap-0.5 min-w-0">
              <span style={{ ...visionTitle, fontSize: 14 }}>Menace système</span>
              <span style={visionBody}>
                Actif : {ready && sys ? formatUptime(sys.uptime_s) : '—'}
              </span>
              {ready && sys && sys.degraded > 0 && (
                <span style={{ ...visionBody, color: tokens.color.warning }}>
                  {sys.degraded} brique{sys.degraded > 1 ? 's' : ''} dégradée{sys.degraded > 1 ? 's' : ''}
                </span>
              )}
            </div>
            <div className="ml-auto flex items-center gap-1.5">
              <Activity className="w-3.5 h-3.5" style={{ color: healthColor }} />
              <span style={{ ...visionCaption, color: healthColor, textTransform: 'none' }}>
                {ready ? THREAT_LABELS[level] : 'En attente'}
              </span>
            </div>
          </div>
        </GlassPanel>

        <div className="grid grid-cols-2 gap-2 flex-1 overflow-y-auto min-h-0">
          {metrics.map((m) => (
            <MetricCard key={m.label} {...m} />
          ))}
        </div>

        <GlassPanel level="subtle" radius="md" padding="sm">
          <div className="flex items-center justify-between mb-2">
            <span style={visionCaption}>Processus</span>
            <span style={visionCaption}>Mémoire</span>
          </div>
          {(sys?.processes ?? []).map((p) => (
            <div
              key={p.name}
              className="flex items-center justify-between py-1.5"
              style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}
            >
              <span style={{ ...visionBody, color: tokens.color.text }}>{p.name}</span>
              <span style={visionMono}>{p.mem_mb} Mo</span>
            </div>
          ))}
          {!ready && <span style={visionBody}>En attente du Core…</span>}
        </GlassPanel>
      </div>
    </VisionChrome>
  );
}
