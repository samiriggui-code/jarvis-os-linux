# Mémoires Hermes (wiki)

Fichier principal : [`MEMORY.md`](./MEMORY.md).

## Convention (idée memU — sans runtime memU)

| Règle | Détail |
|-------|--------|
| Format | Markdown sections claires, faits durables seulement |
| Qui écrit | Humain (seed wiki). Faits foyer → Core `POST /v1/memory/store_note` |
| Qui lit | Hermes en **progressive retrieve** avant tâches non triviales |
| Store | Pas d’embeddings obligatoires ici ; lisible par un humain |
| Verify | Après seed NUC : `test -f $HERMES_HOME/memories/MEMORY.md` + health `:8642` |

## Magasins (M4)

1. **Core MemoryAPI** — foyer / autorité (`PgAdapter` prod, JSON fallback)  
2. Ce dossier — wiki conscience (seed humain)  
3. Outil Hermes `memory` — **transitoire**, plus pour les faits foyer  

**Pas** de 4ᵉ magasin (memU, MemPalace direct, CBM).

## Futur (doc only)

Mémoire mission unifiée éventuelle = adapter « TranscriptSource + HostSpec » **maison**,
branché Core Mission → Evidence — pas `memu-hermes` amont.
