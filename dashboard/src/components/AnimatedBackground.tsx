/**
 * Fond sombre glassmorphism — noir neutre + grille de lignes discrètes.
 * Pas de blobs colorés : le verre floute cette matière.
 */
export default function AnimatedBackground() {
  return (
    <div
      className="vision-bg"
      style={{ position: 'fixed', inset: 0, zIndex: 0, pointerEvents: 'none' }}
      aria-hidden
    />
  )
}
