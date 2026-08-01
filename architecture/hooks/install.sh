#!/usr/bin/env bash
# Installe le garde-fou d'architecture dans .git/hooks/.
#
#   bash architecture/hooks/install.sh
#
# Le hook est VERSIONNÉ ici et COPIÉ là-bas : `.git/hooks/` n'est pas suivi
# par git, donc un hook qui n'existerait qu'à cet endroit ne serait ni relu
# en revue, ni partagé, ni sauvegardé. La source de vérité est ce dossier.
set -euo pipefail

RACINE="$(cd "$(dirname "$0")/../.." && pwd)"
SOURCE="$RACINE/architecture/hooks/pre-commit"
CIBLE="$RACINE/.git/hooks/pre-commit"

[[ -f "$SOURCE" ]] || { echo "introuvable : $SOURCE" >&2; exit 2; }
[[ -d "$RACINE/.git" ]] || { echo "pas un dépôt git : $RACINE" >&2; exit 2; }

if [[ -f "$CIBLE" ]] && ! cmp -s "$SOURCE" "$CIBLE"; then
  cp "$CIBLE" "$CIBLE.sauvegarde"
  echo "hook existant sauvegardé : .git/hooks/pre-commit.sauvegarde"
fi

cp "$SOURCE" "$CIBLE"
chmod +x "$CIBLE"

echo "installé : .git/hooks/pre-commit"
echo "test    : bash .git/hooks/pre-commit"
echo "bypass  : git commit --no-verify"
