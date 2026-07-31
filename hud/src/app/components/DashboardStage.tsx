import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Boxes, Bot, LayoutGrid, ServerCog, BrainCircuit,
  Laptop, Tablet, Tv, Server, Terminal, Music, Video, Code2, Container, Globe,
} from 'lucide-react';
import { useApp } from '../context/AppContext';

const mono = { fontFamily: 'Share Tech Mono, monospace' };
const raj = { fontFamily: 'Rajdhani, sans-serif' };

type Tab = 'entites' | 'agents' | 'apps' | 'systeme' | 'ia';

const TABS: { id: Tab; label: string; icon: React.ElementType; color: string }[] = [
  { id: 'entites', label: 'ENTITÉS', icon: Boxes, color: '#00f5ff' },
  { id: 'agents', label: 'AGENTS', icon: Bot, color: '#a855f7' },
  { id: 'apps', label: 'APPLICATIONS', icon: LayoutGrid, color: '#f59e0b' },
  { id: 'systeme', label: 'SYSTÈME', icon: ServerCog, color: '#22c55e' },
  { id: 'ia', label: 'IA', icon: BrainCircuit, color: '#0ea5e9' },
];

/* §13.2 — système d'entités */
const ENTITIES = [
  { name: 'PC Bureau', type: 'computer · Windows', icon: Laptop, color: '#00f5ff', status: 'en ligne', caps: 6 },
  { name: 'Tablette enfant', type: 'tablet · Android', icon: Tablet, color: '#a855f7', status: 'en ligne', caps: 5 },
  { name: 'Apple TV', type: 'media_device', icon: Tv, color: '#f59e0b', status: 'en ligne', caps: 3 },
  { name: 'Serveur JARVIS', type: 'server · Linux', icon: Server, color: '#22c55e', status: 'en ligne', caps: 4 },
];

/* §13.3 — agents par plateforme */
const AGENTS = [
  { name: 'Windows Agent', version: 'v1.2.0', caps: 'applications, écran, caméra, micro', color: '#00f5ff', status: 'à jour' },
  { name: 'Linux Agent', version: 'v1.1.4', caps: 'terminal, systemd, docker', color: '#22c55e', status: 'à jour' },
  { name: 'Android Agent', version: 'v0.9.7', caps: 'HUD, voix, caméra', color: '#a855f7', status: 'mise à jour dispo' },
  { name: 'Mac Agent', version: '—', caps: 'applications macOS, caméra, audio', color: '#64748b', status: 'non installé' },
];

/* §13.7 — catalogue d'applications */
const APPS_CATALOG = [
  { id: 'terminal', name: 'Terminal', icon: Terminal, color: '#00f5ff' },
  { id: 'music', name: 'Spotify', icon: Music, color: '#22c55e' },
  { id: 'video', name: 'HoloVid', icon: Video, color: '#f59e0b' },
  { id: 'code', name: 'Code AI', icon: Code2, color: '#10b981' },
  { id: 'docker', name: 'Docker', icon: Container, color: '#0ea5e9' },
  { id: 'browser', name: 'Holoweb', icon: Globe, color: '#a855f7' },
];

/* §6.14 — un service systemd par fonction */
const SERVICES = [
  { name: 'jarvis-core', active: true },
  { name: 'jarvis-hud', active: true },
  { name: 'jarvis-voice', active: true },
  { name: 'jarvis-vision', active: false },
  { name: 'jarvis-home', active: true },
  { name: 'jarvis-memory', active: true },
  { name: 'jarvis-security', active: true },
];

/* §11 — AI Provider Manager */
const PROVIDERS = [
  { name: 'Ollama local', active: true, note: 'Qwen2.5 — hors ligne OK' },
  { name: 'ProLiant', active: false, note: 'serveur perso — en réserve' },
  { name: 'VPS', active: false, note: 'en réserve' },
  { name: 'OpenAI', active: false, note: 'API cloud — en réserve' },
  { name: 'Claude', active: false, note: 'API cloud — en réserve' },
  { name: 'Gemini', active: false, note: 'API cloud — en réserve' },
];

function Card({ children, color }: { children: React.ReactNode; color: string }) {
  return (
    <div
      className="rounded-xl p-3"
      style={{ background: 'rgba(0,8,20,0.5)', border: `1px solid ${color}25` }}
    >
      {children}
    </div>
  );
}

function EntitesTab() {
  return (
    <div className="grid grid-cols-2 gap-3">
      {ENTITIES.map(e => (
        <Card key={e.name} color={e.color}>
          <div className="flex items-center gap-2.5 mb-1.5">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: `${e.color}15`, border: `1px solid ${e.color}35` }}>
              <e.icon className="w-4 h-4" style={{ color: e.color }} />
            </div>
            <div>
              <p style={{ ...raj, color: 'rgba(255,255,255,0.85)', fontSize: 13 }}>{e.name}</p>
              <p style={{ ...mono, color: 'rgba(255,255,255,0.35)', fontSize: 9 }}>{e.type}</p>
            </div>
            <div className="ml-auto w-2 h-2 rounded-full" style={{ background: '#22c55e', boxShadow: '0 0 6px #22c55e' }} />
          </div>
          <p style={{ ...mono, color: 'rgba(255,255,255,0.4)', fontSize: 9 }}>{e.caps} capacités déclarées</p>
        </Card>
      ))}
    </div>
  );
}

function AgentsTab() {
  return (
    <div className="flex flex-col gap-2">
      {AGENTS.map(a => (
        <Card key={a.name} color={a.color}>
          <div className="flex items-center justify-between mb-1">
            <span style={{ ...raj, color: 'rgba(255,255,255,0.85)', fontSize: 13 }}>{a.name}</span>
            <span style={{ ...mono, color: a.color, fontSize: 9 }}>{a.version}</span>
          </div>
          <p style={{ ...mono, color: 'rgba(255,255,255,0.35)', fontSize: 9, marginBottom: 6 }}>{a.caps}</p>
          <span
            className="px-2 py-0.5 rounded"
            style={{ ...mono, fontSize: 8, color: a.color, background: `${a.color}12`, border: `1px solid ${a.color}30` }}
          >
            {a.status.toUpperCase()}
          </span>
        </Card>
      ))}
    </div>
  );
}

function AppsTab() {
  const { launchApp, addNotification } = useApp();
  return (
    <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(96px, 1fr))' }}>
      {APPS_CATALOG.map(app => (
        <motion.button
          key={app.id}
          whileHover={{ scale: 1.06, y: -2 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => {
            launchApp(app);
            addNotification({ type: 'info', title: `${app.name} lancé`, message: 'Habillage HUD prêt — en attente du flux agent.' });
          }}
          className="flex flex-col items-center gap-2 p-3 rounded-xl cursor-pointer"
          style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}
        >
          <div
            className="w-11 h-11 rounded-xl flex items-center justify-center"
            style={{ background: `radial-gradient(circle, ${app.color}20 0%, rgba(0,0,0,0.5) 100%)`, border: `1px solid ${app.color}30` }}
          >
            <app.icon className="w-5 h-5" style={{ color: app.color }} />
          </div>
          <span style={{ ...raj, color: 'rgba(255,255,255,0.65)', fontSize: 11 }}>{app.name}</span>
        </motion.button>
      ))}
    </div>
  );
}

function SystemeTab() {
  return (
    <div className="flex flex-col gap-1.5">
      {SERVICES.map(s => (
        <div key={s.name} className="flex items-center justify-between py-1.5 px-3 rounded-lg" style={{ background: 'rgba(0,8,20,0.4)' }}>
          <div className="flex items-center gap-2">
            <div
              className="w-1.5 h-1.5 rounded-full"
              style={{ background: s.active ? '#22c55e' : '#64748b', boxShadow: s.active ? '0 0 6px #22c55e' : 'none' }}
            />
            <span style={{ ...mono, color: 'rgba(255,255,255,0.65)', fontSize: 11 }}>{s.name}.service</span>
          </div>
          <span style={{ ...mono, color: s.active ? '#22c55e' : 'rgba(255,255,255,0.3)', fontSize: 9 }}>
            {s.active ? 'ACTIF' : 'ARRÊTÉ'}
          </span>
        </div>
      ))}
    </div>
  );
}

function IaTab() {
  return (
    <div className="flex flex-col gap-2">
      <p style={{ ...mono, color: 'rgba(255,255,255,0.35)', fontSize: 9, marginBottom: 4 }}>
        BASCULE : LOCAL → PROLIANT → VPS → API CLOUD → MODE DÉGRADÉ
      </p>
      {PROVIDERS.map(p => (
        <div
          key={p.name}
          className="flex items-center justify-between py-2 px-3 rounded-lg"
          style={{
            background: p.active ? 'rgba(0,245,255,0.06)' : 'rgba(255,255,255,0.02)',
            border: `1px solid ${p.active ? 'rgba(0,245,255,0.3)' : 'rgba(255,255,255,0.06)'}`,
          }}
        >
          <span style={{ ...raj, color: p.active ? '#00f5ff' : 'rgba(255,255,255,0.5)', fontSize: 12 }}>{p.name}</span>
          <span style={{ ...mono, color: p.active ? '#00f5ff' : 'rgba(255,255,255,0.3)', fontSize: 9 }}>
            {p.active ? '● ACTIF' : p.note.toUpperCase()}
          </span>
        </div>
      ))}
    </div>
  );
}

/**
 * Dashboard Core (§13.7) — cockpit d'administration, thémé HUD.
 * Contenu pur : s'affiche à l'intérieur d'une fenêtre habillée standard
 * (AppWindow, voir AppStage) exactement comme Terminal ou Spotify — c'est
 * une app du lanceur parmi d'autres, pas un mode HUD séparé.
 */
export function DashboardStage() {
  const [tab, setTab] = useState<Tab>('entites');

  return (
    <div className="flex h-full min-h-0">
      {/* Sidebar */}
      <div className="w-40 flex-shrink-0 flex flex-col gap-1 p-2.5" style={{ borderRight: '1px solid rgba(0,245,255,0.08)' }}>
        {TABS.map(t => (
          <motion.button
            key={t.id}
            whileHover={{ x: 2 }}
            onClick={() => setTab(t.id)}
            className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl cursor-pointer text-left"
            style={{
              background: tab === t.id ? `${t.color}12` : 'transparent',
              border: `1px solid ${tab === t.id ? `${t.color}30` : 'transparent'}`,
            }}
          >
            <t.icon className="w-3.5 h-3.5" style={{ color: tab === t.id ? t.color : 'rgba(255,255,255,0.3)' }} />
            <span style={{ ...mono, color: tab === t.id ? t.color : 'rgba(255,255,255,0.4)', fontSize: 10 }}>{t.label}</span>
          </motion.button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 min-h-0 overflow-y-auto p-4">
        <AnimatePresence mode="wait">
          <motion.div
            key={tab}
            initial={{ opacity: 0, x: 8 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -8 }}
            transition={{ duration: 0.2 }}
          >
            {tab === 'entites' && <EntitesTab />}
            {tab === 'agents' && <AgentsTab />}
            {tab === 'apps' && <AppsTab />}
            {tab === 'systeme' && <SystemeTab />}
            {tab === 'ia' && <IaTab />}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
