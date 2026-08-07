/**
 * Trois modes produit du HUD — source de vérité UX, pas « ma maison ».
 *
 * INSTALL    → 0 utilisateur  → bienvenue + assistant premier profil
 * IDENTIFY   → ≥1 utilisateur → face / lock / choix profil
 * JARVIS     → session OK     → interface complète (HudAuthGate = null)
 *
 * Ajout d’un membre foyer ≠ INSTALL : c’est une action depuis JARVIS (admin).
 */
export type ProductMode = 'install' | 'identify' | 'jarvis';

export type InstallRoute = 'welcome' | 'wizard';
export type IdentifyRoute = 'auth' | 'lock' | 'enroll_member';

export function resolveProductMode(opts: {
  sessionUnlocked: boolean;
  firstRun: boolean | null;
  userCount: number;
}): ProductMode {
  if (opts.sessionUnlocked) return 'jarvis';
  // Source de vérité = Core `first_run`. Ne PAS utiliser `userCount === 0`
  // seul : avant auth_status / session persistée partielle, ça ouvrait
  // INSTALL à tort et plantait tablette / laptop sur l'assistant.
  if (opts.firstRun === true) return 'install';
  if (opts.firstRun === false) return 'identify';
  // firstRun encore null — le gate reste en waiting
  return 'identify';
}
