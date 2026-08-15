/**
 * Constraint Solver — packing en étagères (shelf packing) + dégradation par
 * priorité. Entrée = espace RÉELLEMENT disponible (px), jamais un budget de
 * colonnes/lignes arbitraire : « manque d'espace » se décide en comparant la
 * hauteur réellement occupée à `availableHeight` mesuré, pas à une constante
 * du type `maxRows`.
 *
 * Algorithme volontairement simple (pas un solveur flex/LP générique) : tous
 * les scénarios requis se ramènent à « poser tout à sa taille idéale par
 * ordre de priorité ; si ça ne tient pas, dégrader le nœud de plus basse
 * priorité d'un palier et réessayer ». O(n log n) + un nombre borné de passes
 * de dégradation — trivial pour ≤ 12 nœuds.
 *
 * Zéro import React/DOM/CSS — `solve()` est une fonction pure testable seule.
 */

import type { LayoutNode } from './node';
import { DEGRADE_LADDER, nextLadderStep, type DegradeTier } from './priority';
import { emptySnapshot, type LayoutSnapshot } from './snapshot';
import { LAYOUT_SPACING } from './tokens';

export interface AvailableSpace {
  availableWidth: number;
  availableHeight: number;
  gap?: number;
}

/** Hauteur de la bande header-only quand un nœud est forcé `collapsed`. */
const COLLAPSED_BAND_HEIGHT = 44;
/** Un seul palier de réduction déterministe entre `preferred` et `compact`. */
const COMPACT_RATIO = 0.6;

interface Working {
  node: LayoutNode;
  tier: DegradeTier;
  width: number;
  height: number;
}

function sizeAtTier(
  node: LayoutNode,
  tier: DegradeTier,
  availableWidth: number,
  widthBeforeDemotion: number,
): { width: number; height: number } {
  const c = node.constraint;

  if (tier === 'collapsed') {
    // Largeur inchangée par rapport au dernier palier — seule la hauteur se
    // réduit à une bande. `aspectRatio` est délibérément ignoré ici : un
    // bandeau header-only de 44px n'a pas d'aspect à préserver.
    return { width: widthBeforeDemotion, height: COLLAPSED_BAND_HEIGHT };
  }
  if (tier === 'hidden') {
    return { width: 0, height: 0 };
  }

  const rawWidth =
    tier === 'preferred'
      ? Math.min(Math.max(c.preferredWidth, c.minWidth), availableWidth)
      : Math.min(Math.max(c.minWidth, Math.round(c.preferredWidth * COMPACT_RATIO)), availableWidth);

  if (c.aspectRatio) {
    // Couple largeur/hauteur au lieu de les dériver indépendamment — sinon un
    // clamp de hauteur (maxHeight) étirerait silencieusement le rectangle hors
    // de son ratio. On re-dérive la largeur depuis la hauteur retenue.
    const rawHeight = rawWidth / c.aspectRatio;
    const height = Math.min(Math.max(rawHeight, c.minHeight), c.maxHeight ?? Infinity);
    const width = Math.min(Math.round(height * c.aspectRatio), availableWidth);
    return { width, height: Math.round(height) };
  }

  const height =
    tier === 'preferred' ? c.preferredHeight : Math.max(c.minHeight, Math.round(c.preferredHeight * COMPACT_RATIO));
  return { width: rawWidth, height };
}

/** Pose en étagères une liste déjà triée par priorité (ordre de pose = ordre de la liste). */
function shelfPack(
  items: readonly Working[],
  availableWidth: number,
  gap: number,
  yOffset: number,
): { placements: Map<string, { x: number; y: number; width: number; height: number }>; totalHeight: number } {
  const placements = new Map<string, { x: number; y: number; width: number; height: number }>();
  let x = 0;
  let shelfY = yOffset;
  let shelfHeight = 0;
  let placedAny = false;

  for (const item of items) {
    if (item.tier === 'hidden') continue;
    const w = Math.min(item.width, availableWidth);
    if (x > 0 && x + w > availableWidth) {
      shelfY += shelfHeight + gap;
      shelfHeight = 0;
      x = 0;
    }
    placements.set(item.node.id, { x, y: shelfY, width: w, height: item.height });
    x += w + gap;
    shelfHeight = Math.max(shelfHeight, item.height);
    placedAny = true;
  }

  const totalHeight = placedAny ? shelfY + shelfHeight : yOffset;
  return { placements, totalHeight };
}

export function solve(nodes: readonly LayoutNode[], space: AvailableSpace): LayoutSnapshot {
  const gap = space.gap ?? LAYOUT_SPACING.md;
  const availableWidth = Math.max(0, space.availableWidth);
  const availableHeight = Math.max(0, space.availableHeight);

  const expanded = nodes.filter((n) => n.chromeState === 'expanded');
  const rest = nodes
    .map((node, index) => ({ node, index }))
    .filter(({ node }) => node.chromeState !== 'expanded')
    .sort((a, b) => b.node.priority - a.node.priority || a.index - b.index)
    .map(({ node }) => node);

  const snapshot: LayoutSnapshot = emptySnapshot();

  // 1. Nœuds "expanded" — exemptés de dégradation, posés d'abord (un
  //    agrandissement explicite est une intention, pas un indice de taille à
  //    réviser). `expandBehavior` décide la géométrie ; `'fill'` (défaut) est
  //    inchangé par rapport au V1 historique.
  let yCursor = 0;
  for (const node of expanded) {
    const behavior = node.expandBehavior ?? 'fill';
    let x = 0;
    let width: number;
    let height: number;

    if (behavior === 'preserveAspect' && node.constraint.aspectRatio) {
      // "contain" dans l'espace restant, centré horizontalement — évite qu'un
      // composant à ratio fixe (caméra 16:9, chart) s'étire plein-bleed.
      const maxW = availableWidth;
      const maxH = Math.max(0, availableHeight - yCursor);
      width = maxW;
      height = width / node.constraint.aspectRatio;
      if (height > maxH) {
        height = maxH;
        width = height * node.constraint.aspectRatio;
      }
      width = Math.round(width);
      height = Math.round(height);
      x = Math.max(0, Math.round((availableWidth - width) / 2));
    } else {
      if (behavior !== 'fill') {
        // Pas de garde `import.meta.env.DEV` ici : ce fichier doit rester
        // testable hors Vite (voir le docblock d'en-tête) ; un avertissement
        // sur un comportement non implémenté est peu coûteux à laisser toujours actif.
        console.warn(
          `[solver] expandBehavior "${behavior}" non implémenté en V1, repli sur 'fill' — nœud ${node.id}`,
        );
      }
      width = availableWidth;
      height = Math.min(node.constraint.preferredHeight, availableHeight);
    }

    snapshot.set(node.id, {
      id: node.id,
      x,
      y: yCursor,
      width,
      height,
      visible: true,
      state: node.chromeState,
      tier: 'preferred',
    });
    yCursor += height + gap;
  }

  // 2. Le reste — dégradation itérative jusqu'à tenir dans availableHeight.
  const working: Working[] = rest.map((node) => {
    const size = sizeAtTier(node, 'preferred', availableWidth, 0);
    return { node, tier: 'preferred', width: size.width, height: size.height };
  });

  const maxIterations = working.length * DEGRADE_LADDER.length + 1;
  let iterations = 0;
  let packed = shelfPack(working, availableWidth, gap, yCursor);

  while (packed.totalHeight > availableHeight && iterations < maxIterations) {
    const demotable = working
      .filter((w) => w.tier !== 'hidden')
      .sort((a, b) => a.node.priority - b.node.priority);
    if (demotable.length === 0) break;

    const target = demotable[0];
    const next = nextLadderStep(target.tier);
    if (!next) break;

    const size = sizeAtTier(target.node, next, availableWidth, target.width);
    target.tier = next;
    target.width = size.width;
    target.height = size.height;

    packed = shelfPack(working, availableWidth, gap, yCursor);
    iterations += 1;
  }

  for (const w of working) {
    if (w.tier === 'hidden') {
      snapshot.set(w.node.id, {
        id: w.node.id,
        x: 0,
        y: 0,
        width: 0,
        height: 0,
        visible: false,
        state: w.node.chromeState,
        tier: 'hidden',
      });
      continue;
    }
    const place = packed.placements.get(w.node.id);
    if (!place) continue;
    snapshot.set(w.node.id, {
      id: w.node.id,
      x: place.x,
      y: place.y,
      width: place.width,
      height: place.height,
      visible: true,
      state: w.tier === 'collapsed' ? 'collapsed' : w.node.chromeState,
      tier: w.tier,
    });
  }

  return snapshot;
}
