/**
 * Un composant affichant un statut « clé configurée » ne reçoit jamais la
 * valeur brute — seul l'appelant (jamais un composant Agentic) connaît le
 * secret, et il doit appeler ceci avant de le passer en prop. Aucun
 * composant de ce dossier ne doit recevoir un secret non masqué.
 */
export function maskSecret(value: string, opts?: { visibleTail?: number }): string {
  const visibleTail = opts?.visibleTail ?? 4;
  const dashIdx = value.indexOf('-');
  const prefix = dashIdx >= 0 ? value.slice(0, dashIdx + 1) : '';
  const rest = dashIdx >= 0 ? value.slice(dashIdx + 1) : value;
  const tail = rest.slice(-visibleTail);
  return `${prefix}${'•'.repeat(12)}${tail}`;
}
