/**
 * AgentSurface — contenu composé d’une surface agentique.
 *
 * Deux conteneurs réels (ne pas confondre) :
 *   1. Fenêtre `AppWindow` / `AppStage` — surface dans une app ouverte ;
 *   2. Plein écran via `App.tsx` (`hudMode === 'surface'`) — `MockAppContent`
 *      monte `AgentSurface` sur tout l’écran (orbe réduite en MiniOrb).
 *
 * Dans les deux cas : le composant remplit son conteneur et ne décide ni de
 * sa position, ni de sa taille, ni de son cadre. Il n’écrit pas sur les volets
 * Moniteur/Console du mode veille.
 *
 * Périmètre P1 :
 *   - `SURFACE_SNAPSHOT` — état complet ;
 *   - `SURFACE_DELTA` — patch JSON, sans remonter les composants intacts ;
 *   - **garde de séquence** : un trou dans `seq` jette l'état local et réclame
 *     un snapshot ;
 *   - placement par région et par taille, délégué au composeur.
 *
 * Reste pour P2 : gravité des intentions, ApprovalCard, liaisons de données.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

import { getCoreClient } from '../app/bridge/coreClient';
import { useVerification } from '../app/bridge/verificationStore';
import { GlassButton } from '../components/glass/GlassButton';
import { tokens } from '../ui/tokens';
import { place, surfaceCanvasStyle } from './composer';
import { VerificationCard } from './library/VerificationCard';
import { applyPatch } from './protocol/jsonPatch';
import {
  emptyDocument,
  hasGap,
  type PatchOp,
  type SurfaceComponent,
  type SurfaceDocument,
} from './protocol/surface';
import { getRenderer, gravityOf, isRegistered, normalizeState, validateProps } from './registry';

const DEFAULT_SURFACE_ID = 'agent-main';

export interface AgentSurfaceProps {
  /** Surface à rendre dans cette fenêtre. */
  surfaceId?: string;
  /**
   * Contenu affiché tant qu'aucune composition n'existe pour cette fenêtre.
   * C'est ce qui rend le branchement non destructif : une app sans surface
   * composée garde exactement le contenu qu'elle avait avant.
   */
  fallback?: React.ReactNode;
  /**
   * Question à composer, si cette fenêtre peut l'être. Absente : aucune
   * composition n'est proposée et la fenêtre garde son contenu produit.
   *
   * ⚠ La composition n'est PAS déclenchée à l'ouverture. Un appel de modèle par
   * clic sur une tuile serait coûteux et surprenant, et le point 3 de
   * `docs/AGENTIC_UI_ARCHITECTURE.md` — « recalculée à chaque ouverture ou mise
   * en cache ? » — n'est pas tranché. Tant qu'il ne l'est pas, c'est un geste
   * explicite : le défaut ne doit pas préempter la décision.
   */
  composeQuestion?: string;
}

const VerificationOverlay = ({
  verification,
}: {
  verification: ReturnType<typeof useVerification>;
}) => {
  if (!verification) return null;
  const hasSteps = Boolean(
    verification.proposition
    || verification.action_requested
    || verification.action_executed
    || verification.result_observed
    || verification.result_validated,
  );
  if (!hasSteps && verification.outcome === 'pending') return null;
  return (
    <div
      data-verification-overlay=""
      style={{
        position: 'absolute',
        left: 12,
        bottom: 12,
        width: 'min(420px, calc(100% - 24px))',
        maxHeight: '46%',
        zIndex: 3,
        overflow: 'auto',
      }}
    >
      <VerificationCard
        id="live-verification"
        props={{
          proposition: verification.proposition,
          action_requested: verification.action_requested,
          action_executed: verification.action_executed,
          result_observed: verification.result_observed,
          result_validated: verification.result_validated,
          outcome: verification.outcome,
        }}
        state={verification.outcome || 'pending'}
        emit={() => undefined}
      >
        {null}
      </VerificationCard>
    </div>
  );
};

/**
 * L'offre de composer, posée sur le contenu produit.
 *
 * Discrète par construction : elle ne masque pas la page qu'elle accompagne, et
 * un refus s'affiche À CÔTÉ du bouton plutôt que dans la console. Une
 * composition refusée qui n'apparaît nulle part est exactement le défaut que P3
 * s'interdit.
 */
const ComposeAffordance = ({
  composing,
  refusal,
  onCompose,
}: {
  composing: boolean;
  refusal: string | null;
  onCompose: () => void;
}) => (
  <div
    style={{
      position: 'absolute',
      right: 12,
      bottom: 12,
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      maxWidth: '80%',
      zIndex: 2,
    }}
  >
    {refusal && (
      <span
        title={refusal}
        style={{
          fontFamily: tokens.font.body,
          fontSize: 12,
          lineHeight: 1.35,
          letterSpacing: '-0.01em',
          color: tokens.color.danger,
          background: tokens.color.surfaceRaised,
          border: `1px solid ${tokens.color.border}`,
          borderRadius: tokens.radius.md,
          padding: '6px 10px',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          maxWidth: 320,
          backdropFilter: tokens.glass,
        }}
      >
        {refusal}
      </span>
    )}
    <GlassButton tone="accent" disabled={composing} onClick={onCompose} style={{ fontSize: 12 }}>
      {composing ? 'Composition…' : 'Composer avec Jarvis'}
    </GlassButton>
  </div>
);

/** Un composant du document, rendu après revalidation. */
const Node = ({
  id,
  node,
  surfaceId,
}: {
  id: string;
  node: SurfaceComponent;
  surfaceId: string;
}) => {
  // ⚠ SECONDE validation. La première a lieu dans le Core. La redondance est
  // voulue : si le Core est contourné, le HUD refuse quand même ce qui n'est
  // pas au catalogue (défense en profondeur, §3).
  if (!isRegistered(node.name)) {
    console.warn(`[AgentSurface] composant hors catalogue, ignoré : ${node.name}`);
    return null;
  }

  const Renderer = getRenderer(node.name);
  if (!Renderer) return null;

  const { props, error } = validateProps(node.name, node.props ?? {});
  if (error) {
    console.warn(`[AgentSurface] ${node.name} — props invalides : ${error}`);
  }

  return (
    <Renderer
      id={id}
      props={props}
      state={normalizeState(node.name, node.state)}
      emit={(action, payload) => {
        // Réponse à une demande d'autorisation : canal dédié, jamais soumis à
        // la Policy — sinon autoriser exigerait une autorisation.
        if (action === 'approval.grant' || action === 'approval.deny') {
          getCoreClient().send({
            type: 'surface',
            action: 'approval',
            approval_id: (payload as { approvalId?: string } | undefined)?.approvalId,
            granted: action === 'approval.grant',
          });
          return;
        }

        // Intention ordinaire. La gravité vient du CATALOGUE, pas du composant :
        // un composant modifié ne peut pas s'auto-déclarer inoffensif.
        getCoreClient().send({
          type: 'surface',
          action: 'intent',
          surface_id: surfaceId,
          component_id: id,
          intent: action,
          gravity: gravityOf(node.name, action),
          payload: payload ?? {},
        });
      }}
    >
      {null}
    </Renderer>
  );
};

export const AgentSurface = ({
  surfaceId = DEFAULT_SURFACE_ID,
  fallback = null,
  composeQuestion,
}: AgentSurfaceProps) => {
  const [doc, setDoc] = useState<SurfaceDocument>(emptyDocument);
  /** Dernier événement reçu — sert uniquement à détecter un trou de séquence. */
  const lastSeq = useRef<{ run_id: string; seq: number } | null>(null);
  /**
   * `null` au repos, la raison du dernier refus sinon. Un refus de composition
   * DOIT se voir — c'est le critère de sortie P3 (« rejetée et visible »), et
   * jusqu'ici il n'existait que dans la console.
   */
  const [composing, setComposing] = useState(false);
  const [refusal, setRefusal] = useState<string | null>(null);
  const verification = useVerification();

  const compose = useCallback(() => {
    if (!composeQuestion) return;
    setRefusal(null);
    setComposing(true);
    getCoreClient().send({
      type: 'surface',
      action: 'compose',
      // La fenêtre visée. Le Core l'exige et réécrit la clé de la proposition :
      // le modèle ne choisit pas où sa surface atterrit.
      surface_id: surfaceId,
      question: composeQuestion,
    });
  }, [composeQuestion, surfaceId]);

  /**
   * Réclame un état complet.
   *
   * Appelé quand un delta arrive sur un état dont on n'est plus sûr. Coûteux,
   * mais honnête : mieux vaut un aller-retour qu'une interface fausse que rien
   * ne signale.
   */
  const resync = useCallback((reason: string) => {
    console.warn(`[AgentSurface] resynchronisation demandée — ${reason}`);
    lastSeq.current = null;
    getCoreClient().send({ type: 'surface', action: 'resync' });
  }, []);

  /* En développement, `?surface=<nom>` charge un document écrit à la main.
     Sert à travailler le rendu sans Core ni agent. */
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const wanted = new URLSearchParams(window.location.search).get('surface');
    if (!wanted) return;
    import(`./surfaces/${wanted}.json`)
      .then((m) => setDoc(m.default as SurfaceDocument))
      .catch((e) => console.error(`[AgentSurface] surface « ${wanted} » introuvable`, e));
  }, []);

  /* Au montage : réclamer l'état courant — le snapshot a souvent été émis
     avant l'ouverture de la fenêtre (open_space). Sans ça : fallback vide. */
  useEffect(() => {
    getCoreClient().send({ type: 'surface', action: 'resync' });
  }, [surfaceId]);

  /* Écoute du Core. `subscribe` est multi-abonnés et se désabonne au
     démontage — indispensable pour une zone qui va et vient. */
  useEffect(() => {
    return getCoreClient().subscribe((data) => {
      const kind = data.type;

      /* Retour d'une intention (P2). Le Core distingue trois issues, et elles
         doivent être discernables — sinon on remplace un échec silencieux par
         un autre, à un étage au-dessus :

           ok:true,  executed:true   l'action a eu lieu
           ok:false, executed:false  autorisée, mais AUCUN exécutant inscrit
           ok:false, executed:true   un exécutant a essayé et a échoué

         Le deuxième cas est le piège : à l'écran, une approbation accordée sans
         exécutant est indistinguable d'une action réussie. */
      if (kind === 'surface_result' || kind === 'surface_error') {
        const { ok, executed, intent, reason, known_actions, composed } = data as {
          ok?: boolean;
          executed?: boolean;
          intent?: string;
          reason?: string;
          known_actions?: string[];
          composed?: boolean;
        };

        // Issue d'une composition demandée depuis cette fenêtre. Le succès se
        // voit tout seul — la surface arrive par SURFACE_SNAPSHOT. C'est le
        // refus qu'il faut rendre visible.
        if (composed || (kind === 'surface_error' && !intent)) {
          setComposing(false);
          if (ok === false) setRefusal(reason || 'composition refusée, sans motif');
          return;
        }

        if (ok === false && executed === false && intent) {
          console.error(
            `[AgentSurface] « ${intent} » AUTORISÉE mais non exécutée — ${reason ?? 'aucun exécutant'}. ` +
              `Actions exécutables : ${known_actions?.join(', ') || '(aucune)'}`,
          );
        } else if (ok === false && reason) {
          console.warn(`[AgentSurface] ${intent ? `« ${intent} » : ` : ''}${reason}`);
        }
        return;
      }

      if (kind !== 'SURFACE_SNAPSHOT' && kind !== 'SURFACE_DELTA') return;

      const stamp = { run_id: String(data.run_id ?? ''), seq: Number(data.seq ?? 0) };

      if (kind === 'SURFACE_SNAPSHOT') {
        const payload = data.payload as { document?: SurfaceDocument } | undefined;
        if (!payload?.document) return;
        // Un snapshot fait autorité : il remet la séquence d'aplomb, quel que
        // soit ce qu'on croyait savoir.
        lastSeq.current = stamp;
        setDoc(payload.document);
        return;
      }

      // ── SURFACE_DELTA ────────────────────────────────────────────────
      if (hasGap(lastSeq.current, stamp)) {
        resync(`trou de séquence (attendu ${(lastSeq.current?.seq ?? 0) + 1}, reçu ${stamp.seq})`);
        return;
      }

      const ops = (data.payload as { ops?: PatchOp[] } | undefined)?.ops;
      if (!Array.isArray(ops) || ops.length === 0) return;

      setDoc((current) => {
        try {
          return applyPatch(current, ops);
        } catch (exc) {
          // Tout ou rien : le document reste intact et on redemande la vérité.
          resync(`patch refusé : ${(exc as Error).message}`);
          return current;
        }
      });
      lastSeq.current = stamp;
    });
  }, [resync]);

  const surface = doc.surfaces[surfaceId];

  /* Aucune composition pour cette fenêtre : le contenu produit reste, et on
     n'offre de composer que si l'appelant a fourni une question. Le repli n'est
     jamais remplacé par un bouton — il est complété. */
  if (!surface || surface.root.length === 0) {
    return (
      <div style={{ position: 'relative', height: '100%' }}>
        {fallback}
        <VerificationOverlay verification={verification} />
        {composeQuestion && (
          <ComposeAffordance
            composing={composing}
            refusal={refusal}
            onCompose={compose}
          />
        )}
      </div>
    );
  }

  const placed = place(surface.root, surface.components);

  /* Remplit la fenêtre qui l'accueille. Aucune position absolue, aucun cadre :
     `AppWindow` en est propriétaire. `relative` sert uniquement d'ancrage aux
     régions `overlay` et `backdrop`. */
  return (
    <div
      data-agent-surface={surfaceId}
      style={{
        position: 'relative',
        height: '100%',
        minHeight: 0,
        overflow: 'hidden',
        ...surfaceCanvasStyle(),
      }}
    >
      {placed.map(({ id, node, style }) => (
        <div key={id} style={style}>
          <Node id={id} node={node} surfaceId={surfaceId} />
        </div>
      ))}
      <VerificationOverlay verification={verification} />
    </div>
  );
};
