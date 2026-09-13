#!/bin/sh
# vendor/metronic est gitignoré — stubs minimaux pour vite build démo VPS.
set -e
ROOT="${1:-vendor/metronic}"
PNG_B64='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
SVG='<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" fill="#333"/></svg>'

mkdir -p "$ROOT/avatars/gray" "$ROOT/backgrounds" "$ROOT/illustrations" "$ROOT/file-types"

for i in 1 2 3 4 5; do
  echo "$PNG_B64" | base64 -d > "$ROOT/avatars/gray/$i.png"
done
echo "$PNG_B64" | base64 -d > "$ROOT/backgrounds/bg-1.png"
echo "$PNG_B64" | base64 -d > "$ROOT/backgrounds/bg-1-dark.png"

for name in 1 1-dark 10 10-dark; do
  printf '%s' "$SVG" > "$ROOT/illustrations/$name.svg"
done

for name in ai apk css disc doc excel figma font image iso javascript js mail mail-1 mp3 music pdf php powerpoint ppt psd record sql svg text ttf txt vector video video-1 word xls zip; do
  printf '%s' "$SVG" > "$ROOT/file-types/$name.svg"
done

echo "stub-metronic: ok → $ROOT"
