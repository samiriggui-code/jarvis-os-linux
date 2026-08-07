#!/usr/bin/env python3
"""Complète l'install Freebox : Fennec + ouverture Play Store Chrome/Spotify."""
from __future__ import annotations

import json
import subprocess
import sys
import urllib.request
from pathlib import Path

DIR = Path.home() / "jarvis-apks"
DIR.mkdir(parents=True, exist_ok=True)
SERIAL = "192.168.1.49:5555"
ADB = ["adb", "-s", SERIAL]


def run(cmd: list[str]) -> subprocess.CompletedProcess[str]:
    print("+", " ".join(cmd), flush=True)
    return subprocess.run(cmd, capture_output=True, text=True, check=False)


def download(url: str, dest: Path) -> None:
    print(f"GET {url}", flush=True)
    req = urllib.request.Request(url, headers={"User-Agent": "jarvis-os/1.0"})
    with urllib.request.urlopen(req, timeout=300) as resp, dest.open("wb") as out:
        while True:
            chunk = resp.read(1024 * 256)
            if not chunk:
                break
            out.write(chunk)
    print(f"  {dest.stat().st_size} o", flush=True)


def adb_install(apk: Path) -> bool:
    run(["adb", "connect", SERIAL])
    r = run([*ADB, "install", "-r", str(apk)])
    print(r.stdout)
    print(r.stderr, file=sys.stderr)
    return "Success" in ((r.stdout or "") + (r.stderr or ""))


def main() -> int:
    # Fennec (Firefox F-Droid) — package stable
    api = json.load(
        urllib.request.urlopen(
            "https://f-droid.org/api/v1/packages/org.mozilla.fennec_fdroid", timeout=60
        )
    )
    ver = api["packages"][0]["versionCode"]
    apk = DIR / "fennec.apk"
    download(f"https://f-droid.org/repo/org.mozilla.fennec_fdroid_{ver}.apk", apk)
    ok = adb_install(apk)

    for market_id in ("com.android.chrome", "com.spotify.tv.android"):
        run(
            [
                *ADB,
                "shell",
                "am",
                "start",
                "-a",
                "android.intent.action.VIEW",
                "-d",
                f"market://details?id={market_id}",
            ]
        )

    # Preférence : ouvrir google via TV Bro pour vérifier
    run(
        [
            *ADB,
            "shell",
            "am",
            "start",
            "-a",
            "android.intent.action.VIEW",
            "-d",
            "https://www.google.com/search?q=jarvis",
            "-p",
            "com.phlox.tvwebbrowser",
        ]
    )

    pkgs = run([*ADB, "shell", "pm", "list", "packages"])
    keep = []
    for line in (pkgs.stdout or "").splitlines():
        low = line.lower()
        if any(
            k in low
            for k in (
                "chrome",
                "phlox",
                "tvweb",
                "fennec",
                "firefox",
                "mozilla",
                "vlc",
                "spotify",
                "youtube",
                "netflix",
                "plex",
                "disney",
            )
        ):
            keep.append(line)
    print("PACKAGES:")
    for line in keep:
        print(" ", line)
    print(json.dumps({"fennec": ok}))
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
