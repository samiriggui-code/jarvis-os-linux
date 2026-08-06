#!/usr/bin/env bash
# Vérifie que les fichiers embarqués dans bootstrap-nuc-tree.sh sont bien
# identiques à leurs originaux versionnés.
#
# Pourquoi ce script existe : `bootstrap-nuc-tree.sh` se lance aussi par
# `ssh root@IP 'bash -s' < deploy/scripts/bootstrap-nuc-tree.sh`, sans dépôt
# sur la machine cible. Il ne peut donc PAS copier depuis deploy/ — il doit
# embarquer le contenu. La duplication est structurelle, pas de la paresse.
#
# Ce dépôt s'est déjà fait avoir deux fois :
#   · jarvis.target embarqué omettait voicebox → un NUC bootstrappé par le
#     script ne démarrait jamais la synthèse vocale, et personne ne le voyait
#     puisque le Core se rabat silencieusement sur le cache ;
#   · le wrapper jarvis-hermes embarqué avait perdu la garde `[[ -d ]]` avant
#     son `cd` → sous `set -euo pipefail`, répertoire absent = service mort.
#
# Aucune de ces deux dérives n'était visible à la lecture. Celle-ci l'est.
#
#   bash deploy/scripts/check-embedded-copies.sh
#
# Sortie 0 = tout concorde. Sortie 1 = au moins une dérive (diff affiché).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
BOOTSTRAP="$ROOT/deploy/scripts/bootstrap-nuc-tree.sh"

if [[ ! -f "$BOOTSTRAP" ]]; then
  echo "introuvable : $BOOTSTRAP" >&2
  exit 2
fi

# Extrait le corps du heredoc d'un bloc « BEGIN EMBED <chemin> … END EMBED ».
# On saute la ligne BEGIN et la ligne `cat > … <<'EOF'`, et on s'arrête au
# EOF fermant.
extract() {
  awk -v want="$1" '
    $0 == "# --- BEGIN EMBED " want " ---" { inblock = 1; skip = 1; next }
    inblock && skip                        { skip = 0; next }
    inblock && $0 == "EOF"                 { inblock = 0; next }
    inblock                                { print }
  ' "$BOOTSTRAP"
}

status=0
found=0

while read -r rel; do
  [[ -n "$rel" ]] || continue
  found=$((found + 1))
  original="$ROOT/$rel"

  if [[ ! -f "$original" ]]; then
    echo "✗ $rel — embarqué dans le bootstrap, mais le fichier versionné n'existe pas"
    status=1
    continue
  fi

  # CR retirés des deux côtés : le dépôt est édité sous Windows (autocrlf) et
  # déployé sous Linux. Une différence de fin de ligne n'est pas une dérive,
  # git normalise au commit — comparer le contenu, pas l'encodage.
  if diff -u <(tr -d '\r' < "$original") <(extract "$rel" | tr -d '\r') \
       > /tmp/jarvis-embed-diff.$$ 2>&1; then
    echo "✓ $rel"
  else
    echo "✗ $rel — DÉRIVE (versionné à gauche, embarqué à droite) :"
    sed 's/^/    /' /tmp/jarvis-embed-diff.$$
    status=1
  fi
  rm -f /tmp/jarvis-embed-diff.$$
  # `grep -P` refuse de tourner hors locale unibyte/UTF-8 (Git Bash sous
  # Windows) — sed est portable partout où ce script peut atterrir.
done < <(sed -n 's/^# --- BEGIN EMBED \(.*\) ---$/\1/p' "$BOOTSTRAP")

if [[ $found -eq 0 ]]; then
  echo "aucun bloc « BEGIN EMBED » trouvé — marqueurs supprimés ?" >&2
  exit 2
fi

if [[ $status -eq 0 ]]; then
  echo "OK — $found copie(s) embarquée(s) conforme(s)."
else
  echo ""
  echo "Corriger le fichier versionné ET le bloc embarqué, puis relancer." >&2
fi
exit $status
