import {
  BrainCircuit, BrainCog, Coins, Target, Sparkles, Link2, Network,
  Radar, Timer, Cpu, Wrench, type LucideIcon,
} from 'lucide-react';

export type NodeId =
  | 'hermes' | 'cerveau' | 'tokens' | 'objectifs' | 'skills' | 'connexions'
  | 'reseau' | 'security-center' | 'crons' | 'ia' | 'outils';

export interface HermesNode {
  id: NodeId;
  name: string;
  icon: LucideIcon;
  color: string;
  /** Courte description du rôle du nœud dans l'architecture Hermes (§13). */
  role: string;
  /** Renvoi vers la section du cahier des charges qui détaille ce composant. */
  ref: string;
  status: 'actif' | 'veille' | 'attention';
  /** Charge / consommation (tokens, CPU, quota...) en %. */
  consumption: number;
  /** Avancement des tâches en cours en %, quand applicable. */
  progression: number;
  metric: string;
  connections: NodeId[];
}

export const HERMES_NODES: Record<NodeId, HermesNode> = {
  hermes: {
    id: 'hermes', name: 'Hermes Core', icon: BrainCircuit, color: '#00f5ff',
    role: 'Orchestrateur central — sait ce qui existe, où, comment communiquer, quelles permissions sont nécessaires.',
    ref: '§2 / §13.1', status: 'actif', consumption: 0, progression: 0, metric: '11 nœuds connectés',
    connections: ['cerveau', 'tokens', 'objectifs', 'skills', 'connexions', 'reseau', 'security-center', 'crons', 'ia', 'outils'],
  },
  cerveau: {
    id: 'cerveau', name: 'Cerveau', icon: BrainCog, color: '#a855f7',
    role: 'Routage LLM, moteur d\'intention, contexte de conversation.',
    ref: '§13.1 brain/', status: 'actif', consumption: 42, progression: 0, metric: 'llm_router actif',
    connections: ['tokens', 'ia', 'objectifs'],
  },
  tokens: {
    id: 'tokens', name: 'Tokens', icon: Coins, color: '#f59e0b',
    role: 'Consommation IA en cours — quotas locaux et API cloud.',
    ref: '§11 AI Provider Manager', status: 'actif', consumption: 68, progression: 0, metric: '128K contexte',
    connections: ['cerveau', 'ia'],
  },
  // « Missions » nu : ni le cockpit DEV, ni le cockpit HOME — les objectifs
  // confiés à Hermes. Le mot seul étant proscrit, le nœud porte désormais ce
  // qu'il désigne. `hermesTool: node_missions` reste inchangé : c'est un nom
  // d'outil côté Hermes, il ne se renomme pas depuis ce dépôt.
  objectifs: {
    id: 'objectifs', name: 'Objectifs', icon: Target, color: '#22c55e',
    role: 'Objectifs en cours confiés à JARVIS et leur état d\'avancement.',
    ref: '§13.11 pré-commandes', status: 'actif', consumption: 0, progression: 60, metric: '3/5 en cours',
    connections: ['skills', 'crons', 'cerveau'],
  },
  skills: {
    id: 'skills', name: 'Skills', icon: Sparkles, color: '#ec4899',
    role: 'Compétences et outils déclarés, appris ou installés dynamiquement.',
    ref: '§13.11 / §13.12', status: 'actif', consumption: 0, progression: 0, metric: '24 compétences',
    connections: ['objectifs', 'outils', 'connexions'],
  },
  connexions: {
    id: 'connexions', name: 'Connexions', icon: Link2, color: '#0ea5e9',
    role: 'Entités et agents jumelés — appareils, capacités déclarées.',
    ref: '§13.2 / §13.4', status: 'actif', consumption: 0, progression: 0, metric: '4 entités jumelées',
    connections: ['skills', 'reseau'],
  },
  reseau: {
    id: 'reseau', name: 'Réseau Neuronal', icon: Network, color: '#14b8a6',
    role: 'Santé de la topologie de communication entre agents et Hermes.',
    ref: '§13.9 Communication', status: 'actif', consumption: 0, progression: 98, metric: '98% intégrité',
    connections: ['connexions', 'security-center'],
  },
  // Ce nœud s'appelait « Mission Control » alors qu'il décrit le Security
  // Center (§7.10) : supervision, alertes, interventions. C'est le domaine de
  // Mission Control HOME, pas celui du cockpit de développement — et c'est ce
  // faux homonyme qui faisait pointer le déclencheur vocal « alertes » du
  // catalogue sur la scène Cursor. Renommé d'après ce qu'il fait réellement.
  'security-center': {
    id: 'security-center', name: 'Security Center', icon: Radar, color: '#ef4444',
    role: 'Supervision temps réel, alertes, priorisation des interventions.',
    ref: '§7.10 Security Center', status: 'attention', consumption: 0, progression: 0, metric: '2 alertes actives',
    connections: ['reseau', 'crons', 'objectifs'],
  },
  crons: {
    id: 'crons', name: 'Crons', icon: Timer, color: '#64748b',
    role: 'Tâches planifiées et récurrentes — sauvegardes, scans, mises à jour.',
    ref: '§6.12 / §12', status: 'actif', consumption: 0, progression: 0, metric: '6 tâches planifiées',
    connections: ['objectifs', 'security-center'],
  },
  ia: {
    id: 'ia', name: 'Fournisseurs IA', icon: Cpu, color: '#06b6d4',
    role: 'Bascule entre Ollama local, ProLiant, VPS et API cloud.',
    ref: '§11 AI Provider Manager', status: 'actif', consumption: 0, progression: 0, metric: 'Ollama local actif',
    connections: ['cerveau', 'tokens'],
  },
  outils: {
    id: 'outils', name: 'Agents & Outils', icon: Wrench, color: '#f97316',
    role: 'Agents spécialisés (voix, vision, maison, sécurité...) pilotés par Hermes.',
    ref: '§6.4 délégation', status: 'actif', consumption: 0, progression: 0, metric: '6 agents actifs',
    connections: ['skills', 'ia'],
  },
};

export const HERMES_NODE_LIST = Object.values(HERMES_NODES);
