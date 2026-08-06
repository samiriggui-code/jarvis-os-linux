/**
 * Protocole JARVIS UI — types du document de surface.
 *
 * Transcription du contrat arrêté dans `docs/architecture/JARVIS-Agentic-UI.md`
 * (§4). Toute divergence entre ce fichier et le document est un défaut de ce
 * fichier.
 *
 * Le choix structurant : **la surface EST l'état**. Créer, modifier et
 * supprimer un composant sont la même opération — un patch sur ce document.
 * C'est ce qui rend la compatibilité AG-UI gratuite : `SURFACE_SNAPSHOT` et
 * `SURFACE_DELTA` sont ses `STATE_SNAPSHOT` / `STATE_DELTA`.
 *
 * Structure PLATE, indexée par identifiant. Les relations parent/enfant
 * passent par des identifiants, jamais par imbrication : les JSON Pointer
 * restent courts et stables (`/surfaces/s/components/c1/props/value`), et un
 * delta ne réécrit jamais un sous-arbre entier.
 */

/** Intentions de placement. Le HUD reste seul juge du pixel (§P3). */
export type Region =
  | 'top'
  | 'left'
  | 'center'
  | 'right'
  | 'bottom'
  | 'overlay'
  | 'backdrop';

export type Size = 'compact' | 'normal' | 'wide' | 'fill';

/**
 * Gravité d'une action — `info < media < home < admin`.
 *
 * Aucun protocole tiers ne porte cette notion ; c'est elle qui distingue
 * JARVIS d'un agent conversationnel à widgets. Elle voyage avec l'intention
 * remontante et c'est le Core, jamais le HUD, qui en décide (§7.1).
 */
export type Gravity = 'info' | 'media' | 'home' | 'admin';

/** Un composant posé sur une surface. */
export interface SurfaceComponent {
  /** Doit exister dans `ui_catalog.json`. Sinon : rejet, jamais de dégradé. */
  name: string;
  /** Validées contre le schéma du catalogue. */
  props: Record<string, unknown>;
  /** Doit appartenir aux états déclarés par le composant. */
  state: string;
  region: Region;
  size: Size;
  /** Identifiants d'enfants — jamais des objets imbriqués. */
  children: string[];
}

export interface Surface {
  /** Identifiants racine, dans l'ordre d'affichage. */
  root: string[];
  components: Record<string, SurfaceComponent>;
}

/**
 * Document complet.
 *
 * `data` n'est pas rempli par l'agent : il demande une liaison, le Core décide
 * s'il la sert (§6.3). Sans cette règle une composition deviendrait un canal
 * d'exfiltration — il suffirait de glisser une donnée protégée dans un titre.
 */
export interface SurfaceDocument {
  surfaces: Record<string, Surface>;
  data: Record<string, unknown>;
  pending: {
    approvals: Record<string, unknown>;
  };
}

/* ── Enveloppe ─────────────────────────────────────────────────────────── */

export const PROTOCOL_VERSION = 1;

/**
 * Types Core → HUD.
 *
 * Les noms alignés sur AG-UI portent le type AG-UI ; ce qui est propre à
 * JARVIS passe par `CUSTOM` préfixé `jarvis.` (§4.6). Un client AG-UI
 * standard ignore alors ce qu'il ne connaît pas et rend quand même la
 * surface : il perd le HITL, pas l'interface.
 */
export type ServerEventType =
  | 'SURFACE_SNAPSHOT'
  | 'SURFACE_DELTA'
  | 'RUN_STARTED'
  | 'RUN_FINISHED'
  | 'ACTION_RESULT'
  | 'RUN_ERROR'
  | 'jarvis.approval.request'
  | 'jarvis.notify';

/** Types HUD → Core. */
export type ClientEventType = 'USER_INTENT' | 'APPROVAL_RESPONSE' | 'SURFACE_RESYNC';

export interface Envelope<T extends string = string> {
  v: number;
  type: T;
  id: string;
  ts: number;
  run_id: string;
  /** Monotone PAR RUN. Un trou impose un resync complet — voir `hasGap`. */
  seq: number;
}

export interface SnapshotEvent extends Envelope<'SURFACE_SNAPSHOT'> {
  payload: { document: SurfaceDocument };
}

/** Opérations JSON Patch (RFC 6902) restreintes à ce dont la surface a besoin. */
export interface PatchOp {
  op: 'add' | 'replace' | 'remove';
  path: string;
  value?: unknown;
}

export interface DeltaEvent extends Envelope<'SURFACE_DELTA'> {
  payload: { ops: PatchOp[] };
}

/* ── Sûreté de séquence ────────────────────────────────────────────────── */

/**
 * Y a-t-il un trou entre deux événements d'un même run ?
 *
 * ⚠ C'est la garde la plus importante du protocole. Un delta perdu ne se voit
 * pas : l'interface reste affichée, simplement fausse, et rien ne le signale.
 * On préfère jeter l'état local et redemander un snapshot — coûteux mais
 * honnête.
 *
 * Un changement de `run_id` n'est pas un trou : c'est une nouvelle
 * composition, qui remplace la précédente (décision §10.2-4).
 */
export const hasGap = (
  prev: { run_id: string; seq: number } | null,
  next: { run_id: string; seq: number },
): boolean => {
  if (!prev) return false;
  if (prev.run_id !== next.run_id) return false;
  return next.seq !== prev.seq + 1;
};

/** Document vide — état de repos, aucune composition affichée. */
export const emptyDocument = (): SurfaceDocument => ({
  surfaces: {},
  data: {},
  pending: { approvals: {} },
});
