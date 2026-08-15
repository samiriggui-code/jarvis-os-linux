/**
 * Enveloppe un composant existant de `agentic/library/*` (déjà écrit pour la
 * forme `AgenticProps` du registre Core) pour un usage à props simples dans
 * la nouvelle bibliothèque de composants. Importe UNIQUEMENT depuis
 * `agentic/library/*` — jamais `agentic/registry/` (`getRenderer`/
 * `validateProps`/`gravityOf` restent réservés au pipeline Core, non
 * concerné par cette bibliothèque de démonstration).
 *
 * C'est le mécanisme REUSE : un composant listé « EXISTS EXACTLY » dans le
 * plan passe par ici plutôt que d'être réécrit.
 */
import type { ComponentType, ReactNode } from 'react';

export interface LibraryAgenticProps {
  id: string;
  props: Record<string, unknown>;
  state: string;
  emit: (action: string, payload?: Record<string, unknown>) => void;
  children: ReactNode;
}

export interface AdaptedComponentProps {
  props?: Record<string, unknown>;
  state?: string;
  onIntent?: (action: string, payload?: Record<string, unknown>) => void;
}

/** `adaptLibraryComponent(StatusBadge, 'unknown')` → composant à props simples. */
export function adaptLibraryComponent(
  Component: ComponentType<LibraryAgenticProps>,
  defaultState: string,
) {
  return function Adapted({ props = {}, state, onIntent }: AdaptedComponentProps) {
    return (
      <Component
        id="adapted"
        props={props}
        state={state ?? defaultState}
        emit={(action, payload) => onIntent?.(action, payload)}
        children={null}
      />
    );
  };
}
