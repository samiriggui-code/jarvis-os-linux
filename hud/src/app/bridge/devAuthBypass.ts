/**
 * Contournements d'auth réservés au développement — un seul endroit qui décide.
 *
 * Ces raccourcis existent parce que dérouler la séquence complète (Core, caméra,
 * visage, PIN) à chaque rechargement de Vite est insupportable. Ils sont
 * légitimes en dev. En production ils ouvrent le HUD sans que le Core ait
 * reconnu qui que ce soit.
 *
 * Ils étaient éparpillés sur cinq points d'entrée — `AuthScene`, `AppContext`
 * (deux fois), le bouton « MODE DÉMO » et le lien de `HudAuthGate` — et un
 * seul des cinq était gardé. Le voisin immédiat de la ligne fautive, `faceFail`
 * dans `AuthScene`, l'était : la garde a été écrite, puis pas recopiée. C'est
 * exactement ce qu'une constante partagée empêche.
 *
 * Règle : aucun code de ce dépôt ne relit `skipAuth` ni ne déverrouille en
 * `dev_skip` sans passer par ici.
 */

/**
 * Vrai uniquement dans un bundle de développement.
 *
 * Vite substitue `import.meta.env.DEV` littéralement à la compilation : dans un
 * `vite build`, les blocs gardés par cette constante disparaissent du bundle.
 * Ce n'est pas un test à l'exécution qu'on pourrait retourner depuis la console.
 */
export const DEV_BUILD: boolean =
  typeof import.meta !== 'undefined' && import.meta.env?.DEV === true;

/**
 * `?skipAuth=1` — ouvre la session HUD sans passer par le Core.
 *
 * Contrairement au simulateur de visage, qui finit malgré tout par demander un
 * `login` au Core (refusé sans attestation, cf. `auth/service.py`), celui-ci ne
 * parle à personne : il bascule l'état React directement. Rien côté Core ne
 * peut le rattraper. D'où la garde ici, et pas plus loin.
 */
export function isAuthBypassEnabled(): boolean {
  if (!DEV_BUILD) return false;
  if (typeof window === 'undefined') return false;
  return new URLSearchParams(window.location.search).get('skipAuth') === '1';
}
