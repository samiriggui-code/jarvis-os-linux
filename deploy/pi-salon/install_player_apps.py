#!/usr/bin/env python3
"""Télécharge / installe les apps affichage Freebox (via adb)."""
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
    print(f"GET {url} → {dest}", flush=True)
    req = urllib.request.Request(url, headers={"User-Agent": "jarvis-os/1.0"})
    with urllib.request.urlopen(req, timeout=180) as resp, dest.open("wb") as out:
        while True:
            chunk = resp.read(1024 * 256)
            if not chunk:
                break
            out.write(chunk)
    print(f"  {dest.stat().st_size} octets", flush=True)


def adb_install(apk: Path) -> bool:
    run(["adb", "connect", SERIAL])
    r = run([*ADB, "install", "-r", str(apk)])
    print(r.stdout)
    print(r.stderr, file=sys.stderr)
    return r.returncode == 0 and "Success" in (r.stdout + r.stderr)


def main() -> int:
    # 1) TV Bro — navigateur TV (télécommande)
    tvbro = DIR / "tvbro.apk"
    if not tvbro.exists() or tvbro.stat().st_size < 1_000_000:
        download(
            "https://github.com/truefedex/tv-bro/releases/download/v2.1.6/"
            "tvbro-2.1.6-generic-geckoExcluded.apk",
            tvbro,
        )
    ok_tv = adb_install(tvbro)

    # 2) Firefox (F-Droid) — repli navigateur
    api = json.load(
        urllib.request.urlopen("https://f-droid.org/api/v1/packages/org.mozilla.firefox", timeout=60)
    )
    ver = api["packages"][0]["versionCode"]
    firefox = DIR / "firefox.apk"
    download(f"https://f-droid.org/repo/org.mozilla.firefox_{ver}.apk", firefox)
    ok_ff = adb_install(firefox)

    # 3) Chrome — tentative via Play Store (pas d'APK Google public fiable)
    # Ouvre la fiche ; si déjà installable en silent, on tente aussi.
    run(
        [
            *ADB,
            "shell",
            "am",
            "start",
            "-a",
            "android.intent.action.VIEW",
            "-d",
            "market://details?id=com.android.chrome",
        ]
    )
    # Spotify TV
    run(
        [
            *ADB,
            "shell",
            "am",
            "start",
            "-a",
            "android.intent.action.VIEW",
            "-d",
            "market://details?id=com.spotify.tv.android",
        ]
    )

    pkgs = run([*ADB, "shell", "pm", "list", "packages"])
    interesting = [
        line
        for line in (pkgs.stdout or "").splitlines()
        if any(
            k in line.lower()
            for k in (
                "chrome",
                "tvwebbrowser",
                "tvbro",
                "firefox",
                "vlc",
                "spotify",
                "youtube",
                "netflix",
                "plex",
                "disney",
            )
        )
    ]
    print("PACKAGES:")
    for line in interesting:
        print(" ", line)

    print(
        json.dumps(
            {
                "tvbro_install": ok_tv,
                "firefox_install": ok_ff,
                "note": "Chrome/Spotify: fiche Play ouverte sur la Freebox — valider Installer à la télécommande",
            }
        )
    )
    return 0 if ok_tv else 1


if __name__ == "__main__":
    raise SystemExit(main())
