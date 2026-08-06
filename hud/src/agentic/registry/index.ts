/**
 * Registre agentique — assemblage.
 *
 * Réunit définitions (contrat) et renderers (pixels), et expose les deux
 * seules questions que le reste du code a le droit de poser :
 *   « ce nom est-il enregistré ? »  et  « avec quoi le rendre ? »
 *
 * La correspondance définitions ↔ renderers est vérifiée par TypeScript
 * (`Record<RegisteredName, …>` dans `renderers.tsx`), donc un oubli casse la
 * compilation au lieu de produire un trou à l'écran.
 */

import { definitions, type ComponentDefinition } from './definitions';
import { renderers, type AgenticProps } from './renderers';

export type { ComponentDefinition, AgenticProps };
export { definitions, renderers };

/** Le nom est-il au catalogue ? Première question du renderer, et du Core. */
export const isRegistered = (name: string): boolean =>
  Object.prototype.hasOwnProperty.call(definitions, name);

export const getDefinition = (name: string): ComponentDefinition | undefined =>
  definitions[name];

export const getRenderer = (name: string): React.FC<AgenticProps> | undefined =>
  (renderers as Record<string, React.FC<AgenticProps>>)[name];

/**
 * Valide et complète des props.
 *
 * En cas d'échec on ne supprime pas le composant : on rend avec ce que le
 * schéma sait produire seul, et on remonte l'anomalie. Un panneau au titre
 * manquant vaut mieux qu'un trou dans le HUD — mais l'écart doit se voir,
 * jamais se taire.
 *
 * ⚠ Ceci est la SECONDE validation. La première a lieu dans le Core. La
 * redondance est voulue : si le Core est contourné, le HUD refuse quand même
 * ce qui n'est pas au catalogue (§3, défense en profondeur).
 */
export const validateProps = (
  name: string,
  props: Record<string, unknown>,
): { props: Record<string, unknown>; error?: string } => {
  const def = definitions[name];
  if (!def) return { props, error: `composant inconnu : ${name}` };

  const parsed = def.props.safeParse(props);
  if (parsed.success) return { props: parsed.data as Record<string, unknown> };

  const fallback = def.props.safeParse({});
  return {
    props: fallback.success ? (fallback.data as Record<string, unknown>) : {},
    error: parsed.error.issues
      .map((i) => `${i.path.join('.') || '(racine)'}: ${i.message}`)
      .join(' · '),
  };
};

/**
 * Gravité d'une action, lue au CATALOGUE.
 *
 * ⚠ Jamais fournie par le composant ni par la proposition de l'agent : sinon
 * il suffirait de déclarer `gravity: "info"` sur un redémarrage de service pour
 * contourner la Policy. Ici la gravité est une propriété du composant, fixée
 * à l'enregistrement.
 *
 * `*` sert de gravité par défaut pour toutes les actions d'un composant.
 * Défaut absolu : `admin` — l'inconnu est traité comme le plus sensible, pas
 * comme le plus anodin.
 */
export const gravityOf = (name: string, action: string): string => {
  const def = definitions[name];
  if (!def) return 'admin';
  return def.supportedActions[action] ?? def.supportedActions['*'] ?? 'admin';
};

/** Ramène un état inconnu vers l'état par défaut du composant. */
export const normalizeState = (name: string, state: string): string => {
  const def = definitions[name];
  if (!def) return state;
  return def.states.includes(state) ? state : def.states[0];
};
