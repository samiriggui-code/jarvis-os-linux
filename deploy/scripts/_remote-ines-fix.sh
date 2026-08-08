#!/usr/bin/env bash
set -euo pipefail
sudo install -m 644 /tmp/face_engine.py /opt/jarvis/core/jarvis_core/holomat/face_engine.py
sudo install -m 644 /tmp/__init__.py /opt/jarvis/core/jarvis_core/__init__.py
sudo cp /tmp/index.html /opt/jarvis/hud/dist/index.html
sudo mkdir -p /opt/jarvis/hud/dist/assets
sudo cp /tmp/index-CHdKnJDa.js /opt/jarvis/hud/dist/assets/
sudo cp /tmp/index-XN4XAV3U.css /opt/jarvis/hud/dist/assets/
if [[ -x /opt/jarvis/bin/prune-nuc-hud ]]; then
  sudo /opt/jarvis/bin/prune-nuc-hud || true
fi
perl -pi -e 's/\r//g' /tmp/start-enroll-ines.py
sudo systemctl restart jarvis-core
sleep 2
sudo systemctl restart jarvis-hud
sleep 3
sudo chvt 7 || true
systemctl is-active jarvis-core jarvis-hud
grep -E 'MIN_FACE_SCORE|PRESENCE_FRAC|PRESENCE_HITS' /opt/jarvis/core/jarvis_core/holomat/face_engine.py
python3 /tmp/start-enroll-ines.py 'Inès'
echo DONE
