#!/usr/bin/env bash
set -euo pipefail

sed -i 's/\r$//' /tmp/jarvis-auth-fix/wipe-auth-users.sh
bash /tmp/jarvis-auth-fix/wipe-auth-users.sh

install -m 644 /tmp/jarvis-auth-fix/__init__.py /opt/jarvis/core/jarvis_core/__init__.py

rsync -a --delete /tmp/jarvis-hud-dist/ /opt/jarvis/hud/dist/

python3 <<'PY'
from pathlib import Path
import re
root = Path("/opt/jarvis/hud/dist")
html = (root / "index.html").read_text(encoding="utf-8")
keep = set(re.findall(r"/assets/([^\"']+)", html))
assets = root / "assets"
removed = []
for p in assets.glob("index-*"):
    if p.name not in keep:
        p.unlink()
        removed.append(p.name)
print("kept", sorted(keep))
print("removed", removed)
print("index_js", sorted(x.name for x in assets.glob("index-*.js")))
PY

/opt/jarvis/core/.venv/bin/python - <<'PY'
import ast
ast.parse(open("/opt/jarvis/core/jarvis_core/__init__.py", encoding="utf-8").read())
print("core OK")
PY

systemctl restart jarvis-core
sleep 3
systemctl is-active jarvis-core

cd /opt/jarvis/core
.venv/bin/python - <<'PY'
from jarvis_core.auth.user_manager import UserManager
u = UserManager()
print("user_count", u.count_users())
print("first_run", u.is_first_run())
for row in u.list_users():
    print("USER_LEFT", row.username, row.role.value if hasattr(row.role, "value") else row.role)
PY
