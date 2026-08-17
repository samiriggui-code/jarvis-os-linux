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

  ImageViewer: {
    name: 'ImageViewer',
    description:
      "Affiche une image ou un flux MJPEG depuis une URL fournie par le Core (snapshot caméra, flux salon). Contrairement à CameraPreview, la source vient explicitement du Core — ce composant n'ouvre jamais getUserMedia lui-même.",
    category: 'media',
    props: z.object({
      src: z.string().default('').describe('URL image ou flux MJPEG'),
      alt: z.string().default('').describe('Texte alternatif'),
      caption: z.string().default('').describe('Légende sous l\'image'),
    }),
    states: ['idle'],
    // Flux maison (Pi salon) : admin uniquement, pas le grand public du foyer
    // — distinct de `camera.read` (webcam locale HUD, gestes/face, accordée
    // au rôle `user`). Décision Samir 2026-08-17.
    permissions: ['camera.read.satellite'],
    requiredContext: [],
    supportedActions: {},
    preferredRegion: 'center',
    preferredSize: 'wide',
    priority: 70,
    tags: ['image', 'caméra', 'salon', 'snapshot', 'flux', 'surveillance'],
  },

  LiveStream: {
    name: 'LiveStream',
    description:
      "Lecteur vidéo+audio en direct depuis une URL fournie par le Core (caméra salon Pi). Contrairement à CameraPreview, n'ouvre jamais getUserMedia — le flux vient du satellite.",
    category: 'media',
    props: z.object({
      src: z.string().default('').describe('URL du flux A/V (fMP4 /live.mp4)'),
      caption: z.string().default('').describe('Légende sous le lecteur'),
      titlebar: z.string().default('').describe('Barre de titre — nom de la source, fourni par le Core (une brique catalogue ne connaît pas la pièce)'),
      muted: z.boolean().default(false).describe('Démarre muet (politique autoplay navigateur)'),
    }),
    states: ['idle'],
    // Idem ImageViewer : flux maison admin-only, pas `camera.read` générique.
    permissions: ['camera.read.satellite'],
    requiredContext: [],
    supportedActions: {},
    preferredRegion: 'center',
    preferredSize: 'wide',
    priority: 72,
    tags: ['caméra', 'salon', 'live', 'vidéo', 'audio', 'surveillance'],
  },

  // —— Vague catalogue riche (stats / table / chart / hub / dialog) ————
  SectionHeader: {
    name: 'SectionHeader',
    description: 'Titre + sous-titre en typo seule (pas de carte glass). Largeur au contenu.',
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
    preferredSize: 'compact',
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
  ToolCall: {
    name: 'ToolCall',
    description:
      'Appel d’outil unique : nom/intent, propriétaire, statut started|completed|failed, durée optionnelle, résumé. À utiliser pour moniteur d’exécution d’outils, jamais pour inventer un résultat.',
    category: 'feedback',
    props: z.object({
      intent: z.string().default(''),
      owner: z.string().default(''),
      status: z.string().default('started'),
      duration_ms: z.number().optional(),
      summary: z.string().optional(),
    }),
    states: ['started', 'completed', 'failed'],
    permissions: ['system.read'],
    requiredContext: [],
    supportedActions: {},
    preferredRegion: 'left',
    preferredSize: 'normal',
    priority: 70,
    tags: ['outil', 'tool', 'exécution', 'trace'],
  },
  VerificationCard: {
    name: 'VerificationCard',
    description:
      'Pipeline de vérification §7 : proposition → action demandée → exécutée → résultat observé → validé. Branche surface_result.verification.',
    category: 'feedback',
    props: z.object({
      proposition: z.string().optional(),
      action_requested: z.string().optional(),
      action_executed: z.string().optional(),
      result_observed: z.string().optional(),
      result_validated: z.string().optional(),
      outcome: z.string().optional(),
    }),
    states: ['pending', 'verified', 'disputed'],
    permissions: ['system.read'],
    requiredContext: [],
    supportedActions: {},
    preferredRegion: 'center',
    preferredSize: 'wide',
    priority: 80,
    tags: ['vérification', 'preuve', 'pipeline', 'disputed'],
  },

  // —— Catalogue Agentic UI production (agentic/components/*) ——————————
  //
  // Adapté depuis Metronic Developer, converti en produit JARVIS. C'est LE
  // catalogue Agentic UI — pas une collection à choisir plus tard. Chaque
  // entrée ci-dessous a un renderer réel dans `agentic/components/*`, pas de
  // réimplémentation ici.
  //
  // Volontairement absents (déjà couverts par `library/*`/adaptateurs
  // existants au-dessus, cf. règle P3 : ne pas dupliquer) :
  //   agent/ActionRequest, agent/ApprovalCard, agent/ToolCall,
  //   agent/VerificationCard, agent/ConfirmationCard (= DialogCard),
  //   agent/ErrorCard|WarningCard|SuccessCard (= StatusCard, prop `tone`),
  //   agent/DiagnosticCard|DiagnosticResult (= StatusCard/ToolResult, presets),
  //   charts/LineChart|AreaChart|BarChart|DonutChart (= ChartCard, prop `type`),
  //   charts/GaugeChart (= metrics/Gauge, alias), charts/Sparkline (= MetricChart),
  //   data/DataTable, data/KeyValueList, metrics/KPI (= MetricCard, alias),
  //   metrics/StatusIndicator (= StatusBadge), navigation/SectionHeader,
  //   navigation/SegmentedControl (= TabBar, prop `variant`),
  //   system/SystemMonitor (= app/components/SystemMonitor, réexport direct),
  //   system/ServiceList (= ServiceHub), system/CPUCard|MemoryCard|DiskCard|
  //   NetworkCard (= MetricCard, presets), system/MicrophoneStatus|CameraStatus|
  //   AudioStatus|GPUStatus|StorageStatus (= DeviceCard, presets),
  //   system/ServerStatus|ServiceStatus|RuntimeHealth|SystemHealth|UptimeCard
  //   (= presets ServiceList/StatusIndicator/StatusCard/MetricCard),
  //   text/SummaryCard (= ResultPanel), media/ImageViewer (déjà au catalogue).
  //
  // Structurellement hors registre pour l'instant (props = ReactNode enfants,
  // incompatible avec un document Core JSON à plat — le protocole de surface
  // n'a pas de résolution d'enfants par référence) : `containers/*`
  // (Workspace/Dashboard/Flex/Panel/Section/SplitView — scaffolding du
  // Layout Engine V1, utilisées uniquement par `sim/AgenticDemoStage`),
  // `media/MediaFrame` (base interne), `media/MediaGallery` (items en
  // ReactNode), `agent/RecoveryCard`+`RecoveryActions` (`actions` en
  // ReactNode). Étendre le protocole (enfants par référence) serait une vraie
  // décision d'architecture, pas une connexion — non fait ici.
  //
  // Volontairement non catalogués : `media/CameraPreview` et
  // `media/VideoPreview` sont des presets DÉCORATIFS de `MediaFrame` (aucun
  // flux réel — la vraie caméra est déjà au catalogue via `CameraPreview`
  // racine, et la vidéo réelle est `media.video`/Plex côté Core). Les
  // enregistrer sous ces noms tromperait l'agent sur ce qu'ils font.
  // `media/ObjectDetectionOverlay` reste un import direct de
  // `VisionLiveSurface` (overlay sur un flux vivant, pas composable seul).

  Gauge: {
    name: 'Gauge',
    description: 'Jauge circulaire (0-100%) pour une seule valeur — charge, progression, score.',
    category: 'data',
    props: z.object({
      label: z.string().optional(),
      value: z.number().min(0).max(100).default(0),
      tone: z.enum(['cyan', 'violet', 'amber', 'green', 'danger']).default('cyan'),
    }),
    states: ['idle'],
    permissions: [],
    requiredContext: [],
    supportedActions: {},
    preferredRegion: 'right',
    preferredSize: 'compact',
    priority: 55,
    tags: ['jauge', 'gauge', 'pourcentage', 'progression'],
  },

  MetricCard: {
    name: 'MetricCard',
    description: 'Carte métrique riche : valeur, unité, icône, tendance, champs secondaires optionnels. Pour un indicateur unique mis en avant.',
    category: 'data',
    props: z.object({
      label: z.string(),
      value: z.string(),
      unit: z.string().optional(),
      hint: z.string().optional(),
      icon: z.string().optional(),
      tone: z.enum(['cyan', 'violet', 'amber', 'green']).default('cyan'),
      trend: z.object({ direction: z.enum(['up', 'down', 'flat']), label: z.string() }).optional(),
      fields: z.array(z.object({ label: z.string(), value: z.string() })).default([]),
    }),
    states: ['idle'],
    permissions: ['system.read'],
    requiredContext: [],
    supportedActions: {},
    preferredRegion: 'left',
    preferredSize: 'compact',
    priority: 60,
    tags: ['métrique', 'kpi', 'valeur', 'carte', 'tendance'],
  },

  MetricGrid: {
    name: 'MetricGrid',
    description: 'Grille de plusieurs MetricCard côte à côte — CPU/RAM/réseau en un seul panneau.',
    category: 'data',
    props: z.object({
      items: z.array(z.object({
        label: z.string(),
        value: z.string(),
        unit: z.string().optional(),
        icon: z.string().optional(),
        tone: z.enum(['cyan', 'violet', 'amber', 'green']).default('cyan'),
      })).default([]),
      columns: z.number().int().min(1).max(6).default(3),
    }),
    states: ['idle'],
    permissions: ['system.read'],
    requiredContext: [],
    supportedActions: {},
    preferredRegion: 'center',
    preferredSize: 'wide',
    priority: 60,
    tags: ['métriques', 'grille', 'kpi', 'tableau de bord'],
  },

  Progress: {
    name: 'Progress',
    description: 'Barre de progression linéaire avec pourcentage — tâche longue, téléchargement, avancement.',
    category: 'data',
    props: z.object({
      label: z.string().optional(),
      value: z.number().min(0).max(100).default(0),
      tone: z.enum(['cyan', 'violet', 'amber', 'green', 'danger']).default('cyan'),
    }),
    states: ['idle'],
    permissions: [],
    requiredContext: [],
    supportedActions: {},
    preferredRegion: 'bottom',
    preferredSize: 'normal',
    priority: 45,
    tags: ['progression', 'barre', 'avancement', 'chargement'],
  },

  StatList: {
    name: 'StatList',
    description: 'Liste compacte label + statut (pastille) — vue synthétique de plusieurs sous-systèmes.',
    category: 'data',
    props: z.object({
      title: z.string().optional(),
      items: z.array(z.object({ label: z.string(), status: z.string() })).default([]),
    }),
    states: ['idle'],
    permissions: ['system.read'],
    requiredContext: [],
    supportedActions: {},
    preferredRegion: 'left',
    preferredSize: 'normal',
    priority: 55,
    tags: ['liste', 'statuts', 'synthèse', 'état'],
  },

  ChartCard: {
    name: 'ChartCard',
    description: "Graphique d'une série numérique — ligne, aire, barres ou donut selon `type`. Un seul renderer pour les quatre formes.",
    category: 'data',
    props: z.object({
      type: z.enum(['line', 'area', 'bar', 'donut']).default('line'),
      label: z.string().optional(),
      data: z.array(z.object({ x: z.union([z.string(), z.number()]), y: z.number() })).default([]),
      tone: z.enum(['cyan', 'violet', 'amber', 'green']).default('cyan'),
      aspectRatio: z.number().optional(),
    }),
    states: ['idle'],
    permissions: ['system.read'],
    requiredContext: [],
    supportedActions: {},
    preferredRegion: 'center',
    preferredSize: 'wide',
    priority: 65,
    tags: ['graphique', 'courbe', 'chart', 'ligne', 'aire', 'barres', 'donut', 'série'],
  },

  TimelineChart: {
    name: 'TimelineChart',
    description: "Frise chronologique d'événements horizontale — succession d'incidents, de jalons.",
    category: 'data',
    props: z.object({
      label: z.string().optional(),
      items: z.array(z.object({
        id: z.string(),
        label: z.string(),
        timestamp: z.string(),
        tone: z.enum(['accent', 'success', 'warning', 'danger', 'neutral']).default('neutral'),
        detail: z.string().optional(),
      })).default([]),
    }),
    states: ['idle'],
    permissions: [],
    requiredContext: [],
    supportedActions: {},
    preferredRegion: 'center',
    preferredSize: 'wide',
    priority: 55,
    tags: ['frise', 'chronologie', 'timeline', 'événements'],
  },

  DataList: {
    name: 'DataList',
    description: 'Liste icône + label + valeur + statut optionnel — inventaire simple, options, capacités.',
    category: 'data',
    props: z.object({
      title: z.string().optional(),
      items: z.array(z.object({
        icon: z.string().optional(),
        label: z.string(),
        value: z.string().optional(),
        status: z.string().optional(),
      })).default([]),
    }),
    states: ['idle'],
    permissions: [],
    requiredContext: [],
    supportedActions: {},
    preferredRegion: 'left',
    preferredSize: 'normal',
    priority: 50,
    tags: ['liste', 'données', 'inventaire'],
  },

  EventList: {
    name: 'EventList',
    description: "Liste chronologique verticale d'événements horodatés — journal d'activité récente.",
    category: 'data',
    props: z.object({
      title: z.string().optional(),
      items: z.array(z.object({
        id: z.string(),
        label: z.string(),
        timestamp: z.string(),
        tone: z.enum(['accent', 'success', 'warning', 'danger', 'neutral']).default('neutral'),
        detail: z.string().optional(),
      })).default([]),
    }),
    states: ['idle'],
    permissions: [],
    requiredContext: [],
    supportedActions: {},
    preferredRegion: 'right',
    preferredSize: 'normal',
    priority: 55,
    tags: ['événements', 'journal', 'activité', 'historique'],
  },

  LogViewer: {
    name: 'LogViewer',
    description: 'Journal de lignes horodatées avec niveau (info/warn/error/debug) — sortie de log, pas un shell.',
    category: 'data',
    props: z.object({
      title: z.string().optional(),
      lines: z.array(z.object({
        level: z.enum(['info', 'warn', 'error', 'debug']).default('info'),
        text: z.string(),
      })).default([]),
    }),
    states: ['idle'],
    permissions: ['system.read'],
    requiredContext: [],
    supportedActions: {},
    preferredRegion: 'center',
    preferredSize: 'wide',
    priority: 55,
    tags: ['logs', 'journal', 'debug', 'trace'],
  },

  TreeView: {
    name: 'TreeView',
    description: 'Arborescence pliable/dépliable — fichiers, structure, hiérarchie.',
    category: 'data',
    props: z.object({
      title: z.string().optional(),
      nodes: z.array(z.lazy(() => TreeNodeSchema)).default([]),
    }),
    states: ['idle'],
    permissions: [],
    requiredContext: [],
    supportedActions: {},
    preferredRegion: 'left',
    preferredSize: 'normal',
    priority: 45,
    tags: ['arbre', 'arborescence', 'hiérarchie', 'fichiers'],
  },

  DeviceCard: {
    name: 'DeviceCard',
    description: "Carte d'un appareil unique : icône, nom, statut, détail. Pour un appareil du foyer ou du réseau JARVIS.",
    category: 'system',
    props: z.object({
      icon: z.string().optional(),
      name: z.string(),
      status: z.string(),
      detail: z.string().optional(),
    }),
    states: ['idle'],
    permissions: ['system.read'],
    requiredContext: [],
    supportedActions: {},
    preferredRegion: 'left',
    preferredSize: 'compact',
    priority: 55,
    tags: ['appareil', 'device', 'statut', 'matériel'],
  },

  DeviceGrid: {
    name: 'DeviceGrid',
    description: 'Grille de plusieurs DeviceCard — vue flotte des appareils JARVIS (NUC, Pi, postes).',
    category: 'system',
    props: z.object({
      items: z.array(z.object({
        icon: z.string().optional(),
        name: z.string(),
        status: z.string(),
        detail: z.string().optional(),
      })).default([]),
      columns: z.number().int().min(1).max(4).default(2),
    }),
    states: ['idle'],
    permissions: ['system.read'],
    requiredContext: [],
    supportedActions: {},
    preferredRegion: 'center',
    preferredSize: 'wide',
    priority: 55,
    tags: ['appareils', 'flotte', 'grille', 'inventaire'],
  },

  ProcessList: {
    name: 'ProcessList',
    description: 'Table de processus : nom, CPU, mémoire. Pour diagnostiquer une charge machine en détail.',
    category: 'system',
    props: z.object({
      title: z.string().optional(),
      rows: z.array(z.object({ name: z.string(), cpu: z.string(), memory: z.string() })).default([]),
    }),
    states: ['idle'],
    permissions: ['system.read'],
    requiredContext: [],
    supportedActions: {},
    preferredRegion: 'center',
    preferredSize: 'normal',
    priority: 50,
    tags: ['processus', 'process', 'cpu', 'mémoire', 'diagnostic'],
  },

  Terminal: {
    name: 'Terminal',
    description: "Pane de sortie texte façon terminal — affichage seul, aucune exécution ni saisie. Ne pas confondre avec l'app Terminal SSH réelle.",
    category: 'system',
    props: z.object({
      title: z.string().optional(),
      lines: z.array(z.string()).default([]),
      cursor: z.boolean().default(true),
    }),
    states: ['idle'],
    permissions: ['system.read'],
    requiredContext: [],
    supportedActions: {},
    preferredRegion: 'center',
    preferredSize: 'wide',
    priority: 50,
    tags: ['terminal', 'sortie', 'log', 'console'],
  },

  HealthOverview: {
    name: 'HealthOverview',
    description: "Vue de santé composite : trio uptime/CPU/mémoire en tuiles compactes + liste de services. Pour un état système en un coup d'œil.",
    category: 'system',
    props: z.object({
      services: z.array(z.object({ label: z.string(), status: z.string() })).default([]),
      uptime: z.string().optional(),
      cpu: z.number().optional(),
      memory: z.number().optional(),
    }),
    states: ['idle'],
    permissions: ['system.read'],
    requiredContext: [],
    supportedActions: {},
    preferredRegion: 'center',
    preferredSize: 'wide',
    priority: 60,
    tags: ['santé', 'health', 'uptime', 'services', 'synthèse'],
  },

  Breadcrumb: {
    name: 'Breadcrumb',
    description: "Fil d'ariane texte — chemin de navigation ou de contexte.",
    category: 'layout',
    props: z.object({ items: z.array(z.string()).default([]) }),
    states: ['idle'],
    permissions: [],
    requiredContext: [],
    supportedActions: {},
    preferredRegion: 'top',
    preferredSize: 'compact',
    priority: 40,
    tags: ['fil d’ariane', 'navigation', 'chemin'],
  },

  CommandBar: {
    name: 'CommandBar',
    description: 'Barre de raccourcis affichés (icône + label + indice clavier). Décorative — ne déclenche aucune commande.',
    category: 'layout',
    props: z.object({
      items: z.array(z.object({ icon: z.string().optional(), label: z.string(), hint: z.string().optional() })).default([]),
    }),
    states: ['idle'],
    permissions: [],
    requiredContext: [],
    supportedActions: {},
    preferredRegion: 'top',
    preferredSize: 'wide',
    priority: 35,
    tags: ['commandes', 'raccourcis', 'barre'],
  },

  FilterBar: {
    name: 'FilterBar',
    description: 'Chips de filtres activables. Émet une intention par bascule — le Core décide ce que ça filtre.',
    category: 'layout',
    props: z.object({
      chips: z.array(z.object({ id: z.string(), label: z.string() })).default([]),
      activeIds: z.array(z.string()).default([]),
    }),
    states: ['idle'],
    permissions: [],
    requiredContext: [],
    supportedActions: { 'filter.toggle': 'info' },
    preferredRegion: 'top',
    preferredSize: 'wide',
    priority: 40,
    tags: ['filtre', 'chips', 'filtrage'],
  },

  SearchBar: {
    name: 'SearchBar',
    description: "Champ de recherche visuel. Émet l'intention `search.change` à chaque frappe — n'exécute aucune recherche tant que le Core n'y répond pas.",
    category: 'layout',
    props: z.object({
      placeholder: z.string().default('Rechercher…'),
      value: z.string().default(''),
    }),
    states: ['idle'],
    permissions: [],
    requiredContext: [],
    supportedActions: { 'search.change': 'info' },
    preferredRegion: 'top',
    preferredSize: 'normal',
    priority: 35,
    tags: ['recherche', 'search', 'filtre'],
  },

  TabBar: {
    name: 'TabBar',
    description: "Sélecteur d'onglets — variante `underline` (onglets classiques) ou `segmented` (pilule). Émet `tab.select`.",
    category: 'layout',
    props: z.object({
      tabs: z.array(z.object({ id: z.string(), label: z.string() })).default([]),
      activeId: z.string().default(''),
      variant: z.enum(['underline', 'segmented']).default('underline'),
    }),
    states: ['idle'],
    permissions: [],
    requiredContext: [],
    supportedActions: { 'tab.select': 'info' },
    preferredRegion: 'top',
    preferredSize: 'normal',
    priority: 40,
    tags: ['onglets', 'tabs', 'navigation', 'segmenté'],
  },

  CodeBlock: {
    name: 'CodeBlock',
    description: 'Bloc de code monospace avec langage optionnel affiché.',
    category: 'data',
    props: z.object({ code: z.string(), language: z.string().optional() }),
    states: ['idle'],
    permissions: [],
    requiredContext: [],
    supportedActions: {},
    preferredRegion: 'center',
    preferredSize: 'wide',
    priority: 55,
    tags: ['code', 'source', 'monospace'],
  },

  MarkdownBlock: {
    name: 'MarkdownBlock',
    description: 'Texte Markdown (titres, gras/italique, code, listes, liens) — sous-ensemble volontairement minimal, pas CommonMark complet.',
    category: 'data',
    props: z.object({ source: z.string().default('') }),
    states: ['idle'],
    permissions: [],
    requiredContext: [],
    supportedActions: {},
    preferredRegion: 'center',
    preferredSize: 'wide',
    priority: 60,
    tags: ['markdown', 'texte', 'formaté'],
  },

  MessageCard: {
    name: 'MessageCard',
    description: 'Bulle de message avec auteur et horodatage — pour afficher UN message isolé (pas la conversation, qui reste CommandConsole).',
    category: 'identity',
    props: z.object({
      author: z.string(),
      identity: z.string().optional(),
      text: z.string(),
      timestamp: z.string().optional(),
    }),
    states: ['idle'],
    permissions: [],
    requiredContext: [],
    supportedActions: {},
    preferredRegion: 'center',
    preferredSize: 'normal',
    priority: 45,
    tags: ['message', 'bulle', 'auteur'],
  },

  QuoteBlock: {
    name: 'QuoteBlock',
    description: 'Citation mise en exergue avec source optionnelle.',
    category: 'data',
    props: z.object({ text: z.string(), cite: z.string().optional() }),
    states: ['idle'],
    permissions: [],
    requiredContext: [],
    supportedActions: {},
    preferredRegion: 'center',
    preferredSize: 'normal',
    priority: 40,
    tags: ['citation', 'quote'],
  },

  TextBlock: {
    name: 'TextBlock',
    description: 'Paragraphe de texte simple avec titre optionnel — la brique texte générique.',
    category: 'data',
    props: z.object({ title: z.string().optional(), text: z.string() }),
    states: ['idle'],
    permissions: [],
    requiredContext: [],
    supportedActions: {},
    preferredRegion: 'center',
    preferredSize: 'normal',
    priority: 40,
    tags: ['texte', 'paragraphe'],
  },

  Screenshot: {
    name: 'Screenshot',
    description: "Image affichée dans un cadre façon fenêtre (barre de titre) — capture d'écran, aperçu d'application. Distinct d'ImageViewer par le cadre, pas par la source.",
    category: 'media',
    props: z.object({
      src: z.string().default(''),
      alt: z.string().default(''),
      caption: z.string().default(''),
      windowTitle: z.string().default('Capture'),
    }),
    states: ['idle'],
    permissions: [],
    requiredContext: [],
    supportedActions: {},
    preferredRegion: 'center',
    preferredSize: 'wide',
    priority: 55,
    tags: ['capture', 'screenshot', 'image', 'fenêtre'],
  },

  DevIssueBoard: {
    name: 'DevIssueBoard',
    description: 'Kanban Mission DEV — colonnes backlog→done, inbox bloqué/review. Affichage seul ; actions via voix Core.',
    category: 'data',
    props: z.object({
      title: z.string().default('Mission DEV · Board'),
      columns: z.array(z.string()).default([]),
      issues: z.array(z.object({
        id: z.string(),
        title: z.string(),
        column: z.string().optional(),
        status: z.string().optional(),
        assignee_agent: z.string().nullable().optional(),
        blocked_reason: z.string().nullable().optional(),
        run_id: z.string().nullable().optional(),
      })).default([]),
      inbox_count: z.number().default(0),
      inbox_blocked: z.array(z.object({
        id: z.string(),
        title: z.string(),
        status: z.string().optional(),
        blocked_reason: z.string().nullable().optional(),
      })).default([]),
      inbox_review: z.array(z.object({
        id: z.string(),
        title: z.string(),
        status: z.string().optional(),
      })).default([]),
      voice_hint: z.string().default(''),
    }),
    states: ['idle'],
    permissions: ['system.read'],
    requiredContext: [],
    supportedActions: {},
    preferredRegion: 'center',
    preferredSize: 'fill',
    priority: 88,
    tags: ['kanban', 'mission', 'dev', 'board', 'tickets'],
  },

  ExecutionStatus: {
    name: 'ExecutionStatus',
    description: "Pastille compacte d'état d'exécution (pending/running/done/failed) avec icône animée. Pour un statut en ligne, pas une carte pleine.",
    category: 'feedback',
    props: z.object({
      label: z.string(),
      stage: z.enum(['pending', 'running', 'done', 'failed']).default('pending'),
    }),
    states: ['pending', 'running', 'done', 'failed'],
    permissions: ['system.read'],
    requiredContext: [],
    supportedActions: {},
    preferredRegion: 'top',
    preferredSize: 'compact',
    priority: 65,
    tags: ['exécution', 'statut', 'progression', 'outil'],
  },

  StatusCard: {
    name: 'StatusCard',
    description: 'Carte de statut avec ton sémantique (succès/avertissement/danger/info/neutre) — remplace ErrorCard/WarningCard/SuccessCard via `tone`.',
    category: 'feedback',
    props: z.object({
      title: z.string(),
      body: z.string().optional(),
      tone: z.enum(['success', 'warning', 'danger', 'info', 'neutral']).default('neutral'),
      icon: z.string().optional(),
    }),
    states: ['idle'],
    permissions: [],
    requiredContext: [],
    supportedActions: {},
    preferredRegion: 'center',
    preferredSize: 'normal',
    priority: 60,
    tags: ['statut', 'alerte', 'succès', 'erreur', 'avertissement'],
  },

  ToolResult: {
    name: 'ToolResult',
    description: "Résultat brut d'UN appel d'outil : nom, statut, sortie. Distinct de ResultPanel (réponse composée) et de ToolCall (en cours).",
    category: 'feedback',
    props: z.object({
      tool: z.string(),
      status: z.string(),
      output: z.string().optional(),
    }),
    states: ['idle'],
    permissions: ['system.read'],
    requiredContext: [],
    supportedActions: {},
    preferredRegion: 'left',
    preferredSize: 'normal',
    priority: 60,
    tags: ['outil', 'résultat', 'sortie', 'exécution'],
  },

  Graph3D: {
    name: 'Graph3D',
    description:
      'Graphe spatial 3D générique : volume, nœuds sémantiques, arêtes, focus. Pas l’orbe identité du HUD. Un adapter (architecture, repo, HA, agents) fournit le Graph3DModel.',
    category: 'data',
    props: z.object({
      layout: z.enum(['orb', 'cube', 'layered', 'network']).default('orb'),
      level: z.enum(['global', 'cluster', 'component', 'detail']).default('global'),
      focus: z.string().nullable().optional(),
      particleCount: z.number().int().min(0).max(20000).optional(),
      showEdges: z.boolean().default(true),
      showDecorativeLinks: z.boolean().default(true),
      showLabels: z.boolean().default(true),
      projectionBase: z.boolean().default(true),
      model: z
        .object({
          id: z.string().optional(),
          title: z.string().optional(),
          nodes: z
            .array(
              z.object({
                id: z.string(),
                label: z.string(),
                type: z.string(),
                group: z.string().optional(),
                cluster: z.string().optional(),
                status: z.string().optional(),
                importance: z.number().optional(),
                caption: z.string().optional(),
                summary: z.string().optional(),
                facts: z.array(z.object({ key: z.string(), value: z.string() })).optional(),
              }),
            )
            .default([]),
          edges: z
            .array(
              z.object({
                id: z.string().optional(),
                source: z.string(),
                target: z.string(),
                type: z.string().optional(),
                strength: z.number().optional(),
                active: z.boolean().optional(),
              }),
            )
            .default([]),
          clusters: z
            .array(
              z.object({
                id: z.string(),
                label: z.string(),
                nodeIds: z.array(z.string()),
              }),
            )
            .optional(),
        })
        .optional(),
    }),
    states: ['idle'],
    permissions: [],
    requiredContext: [],
    supportedActions: { focus: 'info' },
    preferredRegion: 'center',
    preferredSize: 'wide',
    priority: 90,
    tags: ['graphe', '3d', 'orbe', 'nœuds', 'architecture', 'réseau'],
  },
};

/** Récursif — `TreeView.nodes`. Séparé du bloc `z.object` pour que `z.lazy` puisse s'y référer. */
const TreeNodeSchema: z.ZodType<{ id: string; label: string; children?: unknown[] }> = z.object({
  id: z.string(),
  label: z.string(),
  children: z.array(z.lazy(() => TreeNodeSchema)).optional(),
});

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
