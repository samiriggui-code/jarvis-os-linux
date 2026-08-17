#!/usr/bin/env python3
import json, os, urllib.request
from pathlib import Path
for p in [Path('/etc/jarvis/core.env')]:
    if p.is_file():
        for line in p.read_text().splitlines():
            if '=' in line and not line.strip().startswith('#'):
                k,_,v=line.partition('='); os.environ.setdefault(k.strip(), v.strip())
key=os.environ['JARVIS_HERMES_KEY']
req=urllib.request.Request('http://127.0.0.1:8642/v1/toolsets', headers={'Authorization': f'Bearer {key}'})
data=json.loads(urllib.request.urlopen(req,timeout=10).read())
rows=data.get('data') or data.get('toolsets') or []
for r in sorted(rows, key=lambda x: x.get('name','')):
    print(r.get('name'), 'enabled='+str(r.get('enabled')), 'configured='+str(r.get('configured')))
