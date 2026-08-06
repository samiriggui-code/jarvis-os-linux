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

const orb = { fontFamily: 'Orbitron, sans-serif' };
const mono = { fontFamily: 'Share Tech Mono, monospace' };
const raj = { fontFamily: 'Rajdhani, sans-serif' };

const glassPanel = {
  background: 'rgba(0, 12, 30, 0.6)',
  backdropFilter: 'blur(16px)',
  border: '1px solid rgba(0, 245, 255, 0.15)',
  borderRadius: '12px',
};

/**
 * Plus aucun chiffre fabrique ici.
 *
 * Ce panneau tournait sur `generate(base, variance)` — une marche aleatoire
 * autour d'une valeur choisie a la main. Les cartes RESEAU et GPU ont ete
 * retirees plutot que rebranchees : le Core ne mesure ni l'un ni l'autre, et
 * une jauge inventee coute la credibilite de celles qui disent vrai. Reste ce
 * que `jarvis_core/metrics.py` sait reellement : CPU, memoire, disque.
 */

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
    <div
      className="rounded-xl p-3 flex flex-col gap-2"
      style={{
        background: 'rgba(0, 8, 20, 0.5)',
        border: `1px solid ${color}25`,
      }}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div style={{ color }}>{icon}</div>
          <span style={{ ...mono, color: 'rgba(255,255,255,0.5)', fontSize: '10px' }}>{label}</span>
        </div>
        <span style={{ ...orb, color, fontSize: '14px', textShadow: `0 0 8px ${color}` }}>
          {Math.round(value)}
          <span style={{ fontSize: '9px', opacity: 0.7 }}>{unit}</span>
        </span>
      </div>

      {/* Progress bar */}
      <div className="h-1 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
        <motion.div
          className="h-full rounded-full"
          animate={{ width: `${value}%` }}
          transition={{ duration: 1, ease: 'easeOut' }}
          style={{ background: `linear-gradient(90deg, ${color}80, ${color})`, boxShadow: `0 0 6px ${color}` }}
        />
      </div>

      {/* Mini chart */}
      <div style={{ height: 36 }}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 2, right: 0, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id={`grad-${label}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={color} stopOpacity={0.25} />
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
    </div>
  );
}

export function SystemMonitor() {
  const { metrics: sys, history, ready } = useSystemMetrics();

  const series = (key: 'cpu' | 'ram' | 'disk') =>
    history.map((p, i) => ({ t: i, v: p[key] }));

  const metrics = [
    { label: 'CPU', value: sys?.cpu ?? 0, unit: '%', color: '#00f5ff',
      icon: <Cpu className="w-3 h-3" />, data: series('cpu') },
    { label: 'MÉMOIRE', value: sys?.ram ?? 0, unit: '%', color: '#a855f7',
      icon: <Database className="w-3 h-3" />, data: series('ram') },
    { label: 'DISQUE', value: sys?.disk ?? 0, unit: '%', color: '#0ea5e9',
      icon: <HardDrive className="w-3 h-3" />, data: series('disk') },
  ];

  // Sante = l'indice de menace calcule par le Core (disque > RAM > CPU,
  // + briques degradees). Pas une moyenne des jauges : une moyenne noie
  // justement le disque plein sous trois valeurs calmes.
  const level = sys?.threat_level ?? 'nominal';
  const overallHealth = sys?.threat ?? 0;
  const healthColor = ready ? THREAT_COLORS[level] : 'rgba(255,255,255,0.25)';
  const getHealthColor = () => healthColor;

  return (
    <div className="flex flex-col h-full gap-3 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-2">
          <Activity className="w-4 h-4" style={{ color: '#00f5ff' }} />
          <span style={{ ...orb, color: '#00f5ff', fontSize: '11px', letterSpacing: '0.15em' }}>MONITEUR SYSTÈME</span>
        </div>
        <div className="flex items-center gap-1.5">
          <motion.div
            animate={{ opacity: [1, 0.3, 1] }}
            transition={{ duration: 1.5, repeat: Infinity }}
            className="w-1.5 h-1.5 rounded-full"
            style={{ background: '#22c55e' }}
          />
          <span style={{ ...mono, color: '#22c55e', fontSize: '9px' }}>EN DIRECT</span>
        </div>
      </div>

      {/* Health overview */}
      <div
        className="rounded-xl p-3 flex items-center gap-4 flex-shrink-0"
        style={{
          background: 'rgba(0,8,20,0.5)',
          border: `1px solid ${getHealthColor()}25`,
        }}
      >
        <div className="relative w-12 h-12 flex-shrink-0">
          <svg viewBox="0 0 48 48" className="w-full h-full -rotate-90">
            <circle cx="24" cy="24" r="20" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="4" />
            <motion.circle
              cx="24" cy="24" r="20"
              fill="none"
              stroke={getHealthColor()}
              strokeWidth="4"
              strokeLinecap="round"
              strokeDasharray={`${2 * Math.PI * 20}`}
              animate={{ strokeDashoffset: 2 * Math.PI * 20 * (1 - overallHealth / 100) }}
              transition={{ duration: 1, ease: 'easeOut' }}
              style={{ filter: `drop-shadow(0 0 4px ${getHealthColor()})` }}
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <span style={{ ...orb, color: getHealthColor(), fontSize: '10px' }}>
              {ready ? Math.round(overallHealth) : '--'}
            </span>
          </div>
        </div>
        <div className="flex flex-col gap-0.5">
          <span style={{ ...raj, color: 'rgba(255,255,255,0.7)', fontSize: '13px' }}>Menace système</span>
          <span style={{ ...mono, color: 'rgba(255,255,255,0.35)', fontSize: '10px' }}>
            ACTIF : {ready && sys ? formatUptime(sys.uptime_s) : '--'}
          </span>
          {/* Pas de temperature : psutil ne l'expose pas sous Windows, et le
              NUC ne la remonte pas partout. Un capteur absent ne s'invente pas. */}
          {ready && sys && sys.degraded > 0 && (
            <span style={{ ...mono, color: '#f59e0b', fontSize: '10px' }}>
              {sys.degraded} brique{sys.degraded > 1 ? 's' : ''} dégradée{sys.degraded > 1 ? 's' : ''}
            </span>
          )}
        </div>
        <div className="ml-auto">
          <span style={{ ...raj, color: getHealthColor(), fontSize: '12px' }}>
            {ready ? THREAT_LABELS[level] : 'EN ATTENTE'}
          </span>
        </div>
      </div>

      {/* Metric cards */}
      <div className="grid grid-cols-2 gap-2 flex-1 overflow-y-auto">
        {metrics.map(m => (
          <MetricCard key={m.label} {...m} />
        ))}
      </div>

      {/* Process list */}
      <div
        className="rounded-xl p-3 flex-shrink-0"
        style={{ background: 'rgba(0,8,20,0.5)', border: '1px solid rgba(0,245,255,0.08)' }}
      >
        <div className="flex items-center justify-between mb-2">
          <span style={{ ...mono, color: 'rgba(0,245,255,0.6)', fontSize: '10px' }}>PROCESSUS PRINCIPAUX</span>
          <span style={{ ...mono, color: 'rgba(255,255,255,0.25)', fontSize: '9px' }}>MÉMOIRE</span>
        </div>
        {/* Vrais processus, classes par memoire (cf. metrics.top_processes).
            La liste precedente etait inventee — « neural-net.dll a 8,1 % » —
            et c'est ce genre de detail qui trahit une maquette. */}
        {(sys?.processes ?? []).map(p => (
          <div key={p.name} className="flex items-center justify-between py-1" style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
            <span style={{ ...mono, color: 'rgba(255,255,255,0.5)', fontSize: '9px' }}>{p.name}</span>
            <span style={{ ...mono, color: '#a855f7', fontSize: '9px' }}>{p.mem_mb} Mo</span>
          </div>
        ))}
        {!ready && (
          <span style={{ ...mono, color: 'rgba(255,255,255,0.25)', fontSize: '9px' }}>
            en attente du Core…
          </span>
        )}
      </div>
    </div>
  );
}
