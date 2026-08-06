/**
 * Metriques systeme reelles, poussees par le Core (`SYSTEM_METRICS`).
 *
 * Remplace la marche aleatoire de `SystemMonitor.generate()`. La regle tenue
 * ici : **tant que le Core n'a rien envoye, on n'affiche pas de chiffre**.
 * Pas de 0 %, pas de valeur de depart plausible — `ready` reste faux et l'UI
 * montre des tirets. Un cadran qui ment au demarrage decredibilise tous les
 * autres, y compris ceux qui disent vrai.
 *
 * L'historique vit ici et non dans un `useState` : le Core publie toutes les
 * 2 s, plusieurs panneaux peuvent lire la meme serie, et un panneau qui se
 * remonte doit retrouver la courbe deja constituee.
 */
import { useEffect, useState } from 'react';
import { getCoreClient } from './coreClient';

export type SystemMetrics = {
  /** Qui parle. Le HUD tourne sur le NUC et agrege tout l'ecosysteme. */
  host: string;
  /** `core` (NUC), `vps`, `pi`, `proliant`, `agent`… cf. skill ecosystem-hosts. */
  role: string;
  cpu: number;
  ram: number;
  ram_used_gb: number;
  ram_total_gb: number;
  disk: number;
  disk_used_gb: number;
  disk_total_gb: number;
  uptime_s: number;
  degraded: number;
  threat: number;
  threat_level: 'nominal' | 'elevated' | 'high' | 'critical';
  processes: { name: string; mem_mb: number }[];
};

export type MetricPoint = { t: number; cpu: number; ram: number; disk: number };

/** ~2 min de recul a 2 s par point : assez pour lire une rafale, pas plus. */
const HISTORY = 60;

/**
 * Un etat PAR HOTE, pas un etat global.
 *
 * Le HUD est destine au NUC et doit remonter le NUC, le VPS, le Pi, le
 * ProLiant et le portable. Aujourd'hui un seul emetteur parle (le Core, qui
 * mesure sa propre machine) — mais stocker une valeur unique maintenant
 * obligerait a tout reecrire au deuxieme hote.
 */
const fleet = new Map<string, { last: SystemMetrics; history: MetricPoint[] }>();

/** L'hote qui fait tourner le Core : le NUC en production. */
let coreHost: string | null = null;
let wired = false;

const listeners = new Set<() => void>();

function notify() {
  listeners.forEach(fn => {
    try {
      fn();
    } catch {
      /* un abonne casse ne coupe pas le flux */
    }
  });
}

function isMetrics(d: Record<string, unknown>): boolean {
  return d.type === 'SYSTEM_METRICS' && typeof d.cpu === 'number';
}

function wire() {
  if (wired) return;
  wired = true;
  getCoreClient().subscribe(d => {
    if (!isMetrics(d)) return;
    const m = d as unknown as SystemMetrics;
    const host = m.host || 'inconnu';

    // Le premier hote vu par `role: core` est celui qui heberge le Core.
    // C'est lui que les panneaux « machine locale » affichent par defaut.
    if (coreHost === null && m.role === 'core') coreHost = host;

    const prev = fleet.get(host);
    const point = { t: Date.now(), cpu: m.cpu, ram: m.ram, disk: m.disk };
    fleet.set(host, {
      last: m,
      history: [...(prev?.history ?? []), point].slice(-HISTORY),
    });
    notify();
  });
}

/** Sans argument : l'hote du Core (le NUC en prod). */
export function getSystemMetrics(host?: string): SystemMetrics | null {
  const key = host ?? coreHost;
  return key ? fleet.get(key)?.last ?? null : null;
}

export function getMetricsHistory(host?: string): MetricPoint[] {
  const key = host ?? coreHost;
  return key ? fleet.get(key)?.history ?? [] : [];
}

/** Tous les hotes vus depuis le chargement — pour un futur panneau flotte. */
export function getFleet(): SystemMetrics[] {
  return [...fleet.values()].map(e => e.last);
}

/**
 * `ready` distingue « pas encore de donnee » de « donnee a zero ».
 * Sans lui, un Core hors ligne afficherait un CPU a 0 % parfaitement calme,
 * ce qui est le mensonge le plus trompeur possible sur un tableau de bord.
 */
export function useSystemMetrics(host?: string): {
  metrics: SystemMetrics | null;
  history: MetricPoint[];
  fleet: SystemMetrics[];
  ready: boolean;
} {
  const [, force] = useState(0);

  useEffect(() => {
    wire();
    const fn = () => force(n => n + 1);
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  }, []);

  const metrics = getSystemMetrics(host);
  return {
    metrics,
    history: getMetricsHistory(host),
    fleet: getFleet(),
    ready: metrics !== null,
  };
}

export function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}j ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

export const THREAT_COLORS: Record<SystemMetrics['threat_level'], string> = {
  nominal: '#22c55e',
  elevated: '#eab308',
  high: '#f59e0b',
  critical: '#ef4444',
};

export const THREAT_LABELS: Record<SystemMetrics['threat_level'], string> = {
  nominal: 'NOMINAL',
  elevated: 'ÉLEVÉ',
  high: 'HAUT',
  critical: 'CRITIQUE',
};
