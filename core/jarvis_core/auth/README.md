# Auth / User Manager (§10.1)

Module : `jarvis_core/auth/`

## Rôle

- **User Manager** : profils, rôles (ADMIN/USER/CHILD/GUEST), permissions
- **DB** : **SQLAlchemy 2 + Alembic** — `JARVIS_DATABASE_URL` (PostgreSQL prod) ou SQLite `core/data/jarvis.db`
- **Profils fichiers** : `core/data/users/<id>/…`
- **AuthService** : enroll / login / elevate / logout

```bash
cd core && alembic upgrade head
```

## Smoke test

```bash
cd core
.venv\Scripts\activate
pip install -r requirements.txt
python -m jarvis_core.auth._smoke
```

## Reset DB

- SQLite : supprimer `core/data/jarvis.db` (+ `core/data/users/`)
- Postgres : drop/recreate schema puis `alembic upgrade head`
