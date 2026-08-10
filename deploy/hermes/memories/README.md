# Mémoires Hermes (wiki)

Fichier principal : [`MEMORY.md`](./MEMORY.md).

## Convention (idée memU — sans runtime memU)

| Règle | Détail |
|-------|--------|
| Format | Markdown sections claires, faits durables seulement |
| Qui écrit | Humain (seed) ou Hermes outil `memory` → résumé ici si durable |
| Qui lit | Hermes en **progressive retrieve** avant tâches non triviales |
| Store | Pas d’embeddings obligatoires ici ; lisible par un humain |
| Verify | Après seed NUC : `test -f $HERMES_HOME/memories/MEMORY.md` + health `:8642` |

## Trois magasins (figé)

1. `core/jarvis_core/memory.py` — foyer / Core  
2. Outil Hermes `memory` — runtime agent  
3. Ce dossier — wiki conscience  

**Pas** de 4ᵉ magasin (memU SQLite/cloud, FAISS DeerFlow, etc.) sans arbitrage Samir.

## Futur (doc only)

Mémoire mission unifiée éventuelle = adapter « TranscriptSource + HostSpec » **maison**,
branché Core Mission → Evidence — pas `memu-hermes` amont.
