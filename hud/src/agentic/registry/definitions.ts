/**
 * Registre agentique — DÉFINITIONS.
 *
 * Source de vérité de ce qu'un agent a le droit de demander
 * (`docs/architecture/JARVIS-Agentic-UI.md` §5).
 *
 * ⚠ **Aucun import React ici.** C'est la contrainte qui permet deux choses :
 *   1. générer `ui_catalog.json` pour le Core et Hermes sans embarquer le DOM ;
 *   2. déplacer un jour ce fichier vers `packages/` par un simple `git mv`.
 * Le jour où un `import { ... } from 'react'` apparaît, les deux sont perdues.
 *
 * Un composant écrit mais non inscrit ici reste injoignable par l'agent —
 * c'est le bon défaut : on ouvre l'accès délibérément, jamais par oubli.
 */

import { z } from 'zod';

import type { Gravity, Region, Size } from '../protocol/surface';

/** Familles, pour que l'agent s'oriente dans un catalogue qui grandira. */
export type Category = 'system' | 'media' | 'layout' | 'data' | 'control' | 'feedback' | 'identity';

export interface ComponentDefinition {
  name: string;
  /** Une phrase, écrite POUR l'agent. C'est sur elle qu'il choisit. */
  description: string;
  category: Category;
  /** Contrat des props. Les défauts rendent tout composant rendable avec `{}`. */
  props: z.ZodObject<z.ZodRawShape>;
  /** États admis ; le premier est l'état par défaut. */
  states: readonly string[];
  /**
   * Permissions requises pour l'AFFICHER — pas seulement pour agir.
   * Permet au Policy Engine de refuser AVANT rendu (§7.1).
   */
  permissions: readonly string[];
  /** Contexte matériel/logiciel nécessaire (`camera`, `shell`…). */
  requiredContext: readonly string[];
  /** Actions émissibles, avec leur gravité. Le Core tranche, pas le composant. */
  supportedActions: Readonly<Record<string, Gravity>>;
  /** Intentions de placement — le HUD reste juge du pixel. */
  preferredRegion: Region;
  preferredSize: Size;
  /** Poids de composition, quand plusieurs composants se disputent une région. */
  priority: number;
  tags: readonly string[];
}

/**
 * Le catalogue.
 *
 * `SystemMonitor` fut le premier cas, et il reste le modèle : il **existe déjà**
 * en produit, il est **déjà branché** sur sa passerelle `systemMetrics`, et il
 * n'expose aucune donnée sensible. Rien à écrire côté visuel — ce qu'on teste
 * est la chaîne, pas un composant neuf.
 *
 * Il ne prend aucune prop : il lit sa passerelle. C'est le cas nominal et non
 * une exception — l'agent compose le PLACEMENT, pas les internes.
 *
 * ## Ce qui entre ici, et ce qui n'y entre pas
 *
 * Le catalogue est resté à cinq entrées longtemps après la fin de P0, et une
 * composition ne vaut que ce que son catalogue contient : avec cinq briques,
 * l'agent n'a rien à composer, quelle que soit la qualité du Planner. C'est ça
 * qui donnait des surfaces vides, pas le moteur.
 *
 * La ligne retenue :
 *
 *   * **entre** un panneau qui montre l'état d'un sous-système — caméra, gestes,
 *     voix, système, réglages. L'agent peut légitimement décider de le montrer
 *     pour répondre à une question ;
 *   * **n'entre pas** le châssis du HUD : `TopBar`, `AppDock`, `Background`,
 *     `NotificationSystem`, `AppGrid`, `MiniOrb`, `AICore`. Ce ne sont pas des
 *     réponses à une question, ce sont les murs de la pièce. Les faire composer
 *     revient à laisser l'agent redessiner le HUD lui-même.
 *
 * L'orbe est le cas limite, et il est tranché par l'histoire : le 2026-08-03,
 * une bibliothèque parallèle a réimplémenté l'orbe au lieu d'importer
 * `JarvisOrb`, et il s'est retrouvé en trois exemplaires. L'orbe reste donc
 * hors registre — un seul endroit le dessine.
 *
 * ⚠ Les permissions nouvelles (`camera.read`, `voice.read`, `settings.read`)
 * ne figurent pas encore dans `ROLE_PERMISSIONS` de `core/jarvis_core/surface.py`.
 * Conséquence **voulue et fail-closed** : seul `admin` les obtient (il reçoit
 * `catalog.all_permissions`), les autres rôles ne voient pas ces panneaux tant
 * qu'on ne le décide pas explicitement. Une caméra n'est pas un droit qu'on
 * accorde par effet de bord.
 */
export const definitions: Record<string, ComponentDefinition> = {
  SystemMonitor: {
    name: 'SystemMonitor',
    description:
      'Moniteur système temps réel : processeur, mémoire, disque et réseau avec leurs courbes. À utiliser pour toute question sur la charge, les performances ou la santé de la machine.',
    category: 'system',
    props: z.object({}),
    states: ['idle'],
    permissions: ['system.read'],
    requiredContext: [],
    supportedActions: {},
    preferredRegion: 'left',
    preferredSize: 'normal',
    priority: 50,
    tags: ['cpu', 'mémoire', 'disque', 'réseau', 'performance', 'charge'],
  },

  MemoryPanel: {
    name: 'MemoryPanel',
    description:
      "Mémoire de JARVIS : ce qu'il a retenu du foyer, consultable et effaçable. À utiliser quand la question porte sur ce que JARVIS sait ou a mémorisé.",
    category: 'data',
    props: z.object({}),
    states: ['idle'],
    permissions: ['memory.read'],
    requiredContext: [],
    supportedActions: {},
    preferredRegion: 'left',
    preferredSize: 'normal',
    priority: 40,
    tags: ['mémoire', 'souvenir', 'historique', 'appris'],
  },

  CommandConsole: {
    name: 'CommandConsole',
    description:
      "Console de commandes — la conversation texte avec l'orchestrateur, et le flux des actions en cours. À utiliser pour montrer ce que le système est en train de faire.",
    category: 'system',
    props: z.object({}),
    states: ['idle'],
    permissions: ['console.read'],
    requiredContext: [],
    supportedActions: {},
    preferredRegion: 'right',
    preferredSize: 'normal',
    priority: 45,
    tags: ['console', 'commande', 'journal', 'conversation'],
  },

  CameraPreview: {
    name: 'CameraPreview',
    description:
      "Aperçu vidéo de la caméra, en direct. À utiliser quand la question porte sur ce que JARVIS voit, sur le cadrage, ou pour diagnostiquer la reconnaissance du visage et des gestes.",
    category: 'media',
    // Toutes optionnelles à défaut : le composant se rend avec `{}`, comme
    // l'exige le contrat des définitions.
    props: z.object({
      mirrored: z.boolean().default(true).describe('Image en miroir, comme un rétroviseur'),
      opacity: z.number().min(0).max(1).default(1),
    }),
    states: ['idle'],
    permissions: ['camera.read'],
    requiredContext: ['camera'],
    supportedActions: {},
    preferredRegion: 'right',
    preferredSize: 'normal',
    priority: 55,
    tags: ['caméra', 'vidéo', 'image', 'visage', 'voir', 'cadrage'],
  },

  GesturePanel: {
    name: 'GesturePanel',
    description:
      "État de la reconnaissance des gestes : main détectée, geste courant, confiance. À utiliser pour toute question sur les gestes qui ne passent pas ou qui se déclenchent tout seuls.",
    category: 'system',
    props: z.object({}),
    states: ['idle'],
    // La caméra, parce que les gestes en viennent : montrer leur état revient à
    // dire ce que la caméra observe.
    permissions: ['camera.read'],
    requiredContext: ['camera'],
    supportedActions: {},
    preferredRegion: 'right',
    preferredSize: 'normal',
    priority: 50,
    tags: ['geste', 'gestes', 'main', 'détection', 'reconnaissance'],
  },

  VoiceBar: {
    name: 'VoiceBar',
    description:
      "Barre vocale : mot de réveil, écoute en cours, transcription. À utiliser quand la question porte sur ce que JARVIS a entendu ou sur le micro.",
    category: 'system',
    props: z.object({}),
    states: ['idle'],
    permissions: ['voice.read'],
    requiredContext: ['microphone'],
    supportedActions: {},
    preferredRegion: 'bottom',
    preferredSize: 'wide',
    priority: 60,
    tags: ['voix', 'micro', 'écoute', 'transcription', 'mot de réveil', 'entendu'],
  },

  ScanningPanel: {
    name: 'ScanningPanel',
    description:
      "Panneau d'analyse en cours — ce que le système est en train d'examiner, avec sa progression. À utiliser pour montrer un travail long plutôt que de laisser l'écran muet.",
    category: 'system',
    props: z.object({}),
    states: ['idle'],
    permissions: ['system.read'],
    requiredContext: [],
    supportedActions: {},
    preferredRegion: 'center',
    preferredSize: 'normal',
    priority: 35,
    tags: ['analyse', 'scan', 'progression', 'en cours', 'balayage'],
  },

  SettingsPanel: {
    name: 'SettingsPanel',
    description:
      "Réglages du système : voix, mot de réveil, préférences. À utiliser quand la demande porte sur une configuration à consulter ou à changer.",
    category: 'control',
    props: z.object({}),
    states: ['idle'],
    // `settings.read` et non `system.read` : ce panneau ne montre pas un état,
    // il ouvre des interrupteurs. Le droit de LIRE la charge machine n'emporte
    // pas celui d'atteindre la configuration.
    permissions: ['settings.read'],
    requiredContext: [],
    supportedActions: {},
    preferredRegion: 'center',
    preferredSize: 'wide',
    priority: 30,
    tags: ['réglages', 'paramètres', 'configuration', 'préférences'],
  },

  /**
   * Le seul composant qui ÉMET. Sa gravité est déclarée ici, au catalogue —
   * pas dans le composant, pas dans la proposition de l'agent. Un agent ne
   * peut donc pas s'auto-attribuer une gravité faible pour une action lourde.
   */
  ActionRequest: {
    name: 'ActionRequest',
    description:
      "Propose une action à l'utilisateur, sous forme de bouton. N'exécute rien : émet une intention que la Policy arbitre. À utiliser pour toute action que l'agent suggère plutôt qu'il n'effectue.",
    category: 'control',
    props: z.object({
      label: z.string().describe("Ce que l'action fait, en une phrase"),
      action: z.string().describe("Nom de l'action émise, ex. « service.restart »"),
      detail: z.string().optional().describe('Précision facultative'),
    }),
    states: ['idle', 'pending', 'done', 'refused'],
    permissions: [],
    requiredContext: [],
    // Gravité par défaut des actions émises par ce composant. Le Core la
    // relève selon le préfixe de l'action (cf. surface.py).
    supportedActions: { '*': 'admin' },
    preferredRegion: 'center',
    preferredSize: 'wide',
    priority: 70,
    tags: ['action', 'bouton', 'proposition', 'exécuter'],
  },

  /**
   * Affiche un blocage décidé ailleurs. Le Core reste seul juge : cette carte
   * ne fait que rendre la décision visible et recueillir la réponse.
   */
  ApprovalCard: {
    name: 'ApprovalCard',
    description:
      "Demande d'autorisation en attente. Affichée automatiquement par le Core quand la Policy exige une confirmation — un agent n'a pas à la composer lui-même.",
    category: 'control',
    props: z.object({
      approvalId: z.string(),
      action: z.string(),
      gravity: z.string(),
      reason: z.string().optional(),
    }),
    states: ['pending', 'granted', 'denied'],
    permissions: [],
    requiredContext: [],
    supportedActions: { 'approval.grant': 'info', 'approval.deny': 'info' },
    preferredRegion: 'top',
    preferredSize: 'wide',
    priority: 100,
    tags: ['autorisation', 'approbation', 'policy', 'confirmation'],
  },

  ResultPanel: {
    name: 'ResultPanel',
    description:
      "Panneau de résultat textuel : titre, corps, liste optionnelle. À utiliser pour afficher une recherche web, un résumé d'actualité, la liste des outils disponibles, ou toute réponse structurée que l'utilisateur doit LIRE — pas seulement entendre.",
    category: 'data',
    props: z.object({
      title: z.string().default('Résultat').describe('Titre du panneau'),
      body: z.string().default('').describe('Texte principal (résumé, réponse)'),
      source: z.string().default('').describe('Source courte, ex. web.search'),
      items: z.array(z.string()).default([]).describe('Puces optionnelles'),
    }),
    states: ['idle'],
    permissions: [],
    requiredContext: [],
    supportedActions: {},
    preferredRegion: 'center',
    preferredSize: 'wide',
    priority: 70,
    tags: [
      'résultat', 'recherche', 'web', 'actualité', 'nouvelles', 'outils',
      'capacités', 'résumé', 'texte', 'internet',
    ],
  },

  // —— Vague catalogue riche (stats / table / chart / hub / dialog) ————
  SectionHeader: {
    name: 'SectionHeader',
    description: 'Titre de section + sous-titre. Structure une surface sans carte lourde.',
    category: 'layout',
    props: z.object({
      title: z.string().default('SECTION'),
      subtitle: z.string().default(''),
    }),
    states: ['idle'],
    permissions: [],
    requiredContext: [],
    supportedActions: {},
    preferredRegion: 'top',
    preferredSize: 'wide',
    priority: 90,
    tags: ['section', 'titre', 'layout', 'hub'],
  },
  StatCard: {
    name: 'StatCard',
    description: 'Indicateur chiffré (CPU, tokens, uptime). Une valeur, une unité, un ton.',
    category: 'data',
    props: z.object({
      label: z.string().default('STAT'),
      value: z.union([z.string(), z.number()]).default('—'),
      unit: z.string().default(''),
      tone: z.string().default('cyan'),
      hint: z.string().default(''),
    }),
    states: ['idle'],
    permissions: ['system.read'],
    requiredContext: [],
    supportedActions: {},
    preferredRegion: 'left',
    preferredSize: 'compact',
    priority: 60,
    tags: ['stat', 'métrique', 'kpi', 'nombre', 'card'],
  },
  InfoCard: {
    name: 'InfoCard',
    description: 'Carte texte courte (titre + corps). Pour expliquer un état sans monologue TTS.',
    category: 'layout',
    props: z.object({
      title: z.string().default('Info'),
      body: z.string().default(''),
    }),
    states: ['idle'],
    permissions: [],
    requiredContext: [],
    supportedActions: {},
    preferredRegion: 'center',
    preferredSize: 'normal',
    priority: 55,
    tags: ['card', 'info', 'explication'],
  },
  StatusBadge: {
    name: 'StatusBadge',
    description: 'Pastille d’état (ok / warn / down). À coller près d’un service ou d’un hôte.',
    category: 'feedback',
    props: z.object({
      label: z.string().default(''),
      status: z.string().default('unknown'),
    }),
    states: ['idle'],
    permissions: [],
    requiredContext: [],
    supportedActions: {},
    preferredRegion: 'top',
    preferredSize: 'compact',
    priority: 80,
    tags: ['badge', 'status', 'état', 'pill'],
  },
  AvatarChip: {
    name: 'AvatarChip',
    description: 'Avatar initiales + nom + rôle (foyer, agent, hôte).',
    category: 'identity',
    props: z.object({
      name: z.string().default('?'),
      initials: z.string().default(''),
      role: z.string().default(''),
      tone: z.string().default('cyan'),
    }),
    states: ['idle'],
    permissions: [],
    requiredContext: [],
    supportedActions: {},
    preferredRegion: 'left',
    preferredSize: 'compact',
    priority: 50,
    tags: ['avatar', 'identité', 'user', 'profil'],
  },
  LinkList: {
    name: 'LinkList',
    description: 'Liste de liens cliquables (Google, docs, dashboards).',
    category: 'data',
    props: z.object({
      title: z.string().default('Liens'),
      items: z.array(z.string()).default([]),
    }),
    states: ['idle'],
    permissions: ['web.read'],
    requiredContext: [],
    supportedActions: { 'link.open': 'info' },
    preferredRegion: 'center',
    preferredSize: 'normal',
    priority: 65,
    tags: ['liens', 'url', 'liste', 'web'],
  },
  KeyValueList: {
    name: 'KeyValueList',
    description: 'Paires clé/valeur (config, diagnostic).',
    category: 'data',
    props: z.object({
      title: z.string().default('Détails'),
      rows: z.array(z.record(z.string(), z.string())).default([]),
    }),
    states: ['idle'],
    permissions: [],
    requiredContext: [],
    supportedActions: {},
    preferredRegion: 'right',
    preferredSize: 'normal',
    priority: 55,
    tags: ['keyvalue', 'détails', 'config', 'tableau'],
  },
  DataTable: {
    name: 'DataTable',
    description: 'Tableau colonnes × lignes (services, projets, inventaire). Pas un data-grid Excel.',
    category: 'data',
    props: z.object({
      title: z.string().default('Table'),
      columns: z.array(z.string()).default([]),
      rows: z.array(z.union([z.array(z.string()), z.record(z.string(), z.string())])).default([]),
    }),
    states: ['idle'],
    permissions: [],
    requiredContext: [],
    supportedActions: {},
    preferredRegion: 'center',
    preferredSize: 'wide',
    priority: 70,
    tags: ['table', 'datatable', 'grille', 'liste'],
  },
  MetricChart: {
    name: 'MetricChart',
    description: 'Mini courbe (série numérique). Charge CPU, tokens, latence.',
    category: 'data',
    props: z.object({
      label: z.string().default('MÉTRIQUE'),
      series: z.array(z.number()).default([]),
      tone: z.string().default('cyan'),
    }),
    states: ['idle'],
    permissions: ['system.read'],
    requiredContext: [],
    supportedActions: {},
    preferredRegion: 'right',
    preferredSize: 'normal',
    priority: 60,
    tags: ['chart', 'graphique', 'courbe', 'sparkline'],
  },
  DialogCard: {
    name: 'DialogCard',
    description: 'Dialogue confirm/cancel (hors Policy admin stricte — sinon ApprovalCard).',
    category: 'control',
    props: z.object({
      dialogId: z.string().default(''),
      title: z.string().default('Confirmer'),
      body: z.string().default(''),
      confirmLabel: z.string().default('Confirmer'),
      cancelLabel: z.string().default('Annuler'),
    }),
    states: ['idle', 'resolved'],
    permissions: [],
    requiredContext: [],
    supportedActions: { 'dialog.confirm': 'info', 'dialog.cancel': 'info' },
    preferredRegion: 'overlay',
    preferredSize: 'normal',
    priority: 95,
    tags: ['dialog', 'modal', 'confirm', 'annuler'],
  },
  ToastStack: {
    name: 'ToastStack',
    description: 'Pile de toasts / sonner-like (messages courts empilés).',
    category: 'feedback',
    props: z.object({
      items: z
        .array(z.union([z.string(), z.object({ text: z.string(), tone: z.string().optional() })]))
        .default([]),
    }),
    states: ['idle'],
    permissions: [],
    requiredContext: [],
    supportedActions: {},
    preferredRegion: 'overlay',
    preferredSize: 'compact',
    priority: 85,
    tags: ['toast', 'sonner', 'notification', 'feedback'],
  },
  ServiceHub: {
    name: 'ServiceHub',
    description:
      'HUB domaine : liste de services/hôtes avec statut (Core, Hermes, voicebox, Ollama…). Une brique = un tableau de bord local, pas 20 cartes.',
    category: 'system',
    props: z.object({
      title: z.string().default('HUB SERVICES'),
      subtitle: z.string().default(''),
      services: z
        .array(
          z.object({
            id: z.string().optional(),
            name: z.string().optional(),
            status: z.string().optional(),
            host: z.string().optional(),
          }),
        )
        .default([]),
    }),
    states: ['idle'],
    permissions: ['system.read'],
    requiredContext: [],
    supportedActions: {},
    preferredRegion: 'center',
    preferredSize: 'wide',
    priority: 75,
    tags: ['hub', 'services', 'statut', 'nuc', 'vps', 'superviseur'],
  },
};

/** Noms enregistrés — utilisé par le contrôle de correspondance à la compilation. */
export type RegisteredName = keyof typeof definitions;

/**
 * Catalogue destiné à l'agent et au Core.
 *
 * Les schémas Zod deviennent du JSON Schema (Zod 4 le fait nativement, aucune
 * dépendance supplémentaire). C'est cet objet qui est sérialisé vers
 * `ui_catalog.json`.
 */
export const buildCatalog = () => ({
  version: 1,
  generated_from: 'hud/src/agentic/registry/definitions.ts',
  components: Object.values(definitions).map((d) => ({
    name: d.name,
    description: d.description,
    category: d.category,
    states: d.states,
    permissions: d.permissions,
    requiredContext: d.requiredContext,
    supportedActions: d.supportedActions,
    preferredRegion: d.preferredRegion,
    preferredSize: d.preferredSize,
    priority: d.priority,
    tags: d.tags,
    props: z.toJSONSchema(d.props),
  })),
});
