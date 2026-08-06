/**
 * Curseur gestuel — HAND_POINT → un point à l'écran, pincement → un vrai clic.
 *
 * Volontairement hors React : le curseur bouge ~24 fois par seconde, et
 * repasser par un `useState` re-rendrait l'arbre à chaque frame pour déplacer
 * un rond de 18 px. On écrit donc directement dans un `transform`.
 *
 * Le clic est **synthétisé sur l'élément réellement sous le curseur**
 * (`elementFromPoint`) plutôt que câblé composant par composant. C'est ce qui
 * fait que « remplacer la souris » ne demande aucune modification des boutons
 * existants : ce qui répond à la souris répond à la main.
 */

const CURSOR_ID = 'jarvis-gesture-cursor';

let cursor: HTMLDivElement | null = null;
let lastX = -1;
let lastY = -1;
let hideTimer: number | null = null;

function ensureCursor(): HTMLDivElement {
  const existing = document.getElementById(CURSOR_ID) as HTMLDivElement | null;
  if (existing) return existing;

  const el = document.createElement('div');
  el.id = CURSOR_ID;
  el.setAttribute('aria-hidden', 'true');
  el.style.cssText = [
    'position:fixed',
    'left:0',
    'top:0',
    'width:18px',
    'height:18px',
    'margin:-9px 0 0 -9px',
    'border-radius:50%',
    'border:2px solid rgba(125,211,252,0.9)',
    'background:rgba(125,211,252,0.15)',
    'box-shadow:0 0 12px rgba(125,211,252,0.55)',
    // Sans ça, `elementFromPoint` renverrait le curseur lui-même et aucun
    // clic ne toucherait jamais l'interface.
    'pointer-events:none',
    'z-index:2147483000',
    'opacity:0',
    'transition:opacity 160ms linear,transform 40ms linear,width 90ms,height 90ms',
    'will-change:transform',
  ].join(';');
  document.body.appendChild(el);
  cursor = el;
  return el;
}

/** Coordonnées normalisées [0,1] → pixels viewport. */
export function moveCursor(x: number, y: number): void {
  const el = ensureCursor();
  lastX = Math.round(x * window.innerWidth);
  lastY = Math.round(y * window.innerHeight);
  el.style.transform = `translate(${lastX}px, ${lastY}px)`;
  el.style.opacity = '1';

  // La main sort du champ : MediaPipe cesse d'émettre, personne ne nous
  // prévient. Sans cette extinction, un curseur fantôme reste au dernier
  // point vu, et l'utilisateur croit le HUD figé.
  if (hideTimer !== null) window.clearTimeout(hideTimer);
  hideTimer = window.setTimeout(hideCursor, 900);
}

export function hideCursor(): void {
  if (hideTimer !== null) {
    window.clearTimeout(hideTimer);
    hideTimer = null;
  }
  if (cursor) cursor.style.opacity = '0';
}

/** Retour visuel du clic — le geste n'a aucun ressenti tactile. */
function flash(): void {
  const el = cursor;
  if (!el) return;
  el.style.width = '30px';
  el.style.height = '30px';
  el.style.margin = '-15px 0 0 -15px';
  window.setTimeout(() => {
    el.style.width = '18px';
    el.style.height = '18px';
    el.style.margin = '-9px 0 0 -9px';
  }, 130);
}

/**
 * Clic complet sous le curseur. Renvoie `false` si le curseur n'est nulle part.
 *
 * On émet la séquence pointer + souris entière, pas seulement `click` : Radix
 * (dialogues, menus, onglets — l'essentiel du HUD) réagit à `pointerdown`, et
 * un `click` seul laisserait ces composants inertes.
 */
export function clickAtCursor(): boolean {
  if (lastX < 0 || lastY < 0) return false;

  const target = document.elementFromPoint(lastX, lastY) as HTMLElement | null;
  if (!target) return false;

  const base = {
    bubbles: true,
    cancelable: true,
    composed: true,
    clientX: lastX,
    clientY: lastY,
    view: window,
  };
  const pointer = { ...base, pointerId: 1, pointerType: 'touch', isPrimary: true };

  try {
    target.dispatchEvent(new PointerEvent('pointerdown', pointer));
    target.dispatchEvent(new MouseEvent('mousedown', base));
    target.dispatchEvent(new PointerEvent('pointerup', pointer));
    target.dispatchEvent(new MouseEvent('mouseup', base));
    target.dispatchEvent(new MouseEvent('click', base));
  } catch (e) {
    console.debug('[gesture] clic non délivré', e);
    return false;
  }

  flash();
  return true;
}

export function disposeCursor(): void {
  hideCursor();
  cursor?.remove();
  cursor = null;
  lastX = -1;
  lastY = -1;
}
