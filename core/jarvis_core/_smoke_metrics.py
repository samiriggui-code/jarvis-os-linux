"""Smoke test métriques — l'indice de menace, et le refus d'inventer.

Ce qui est verifie ici, c'est surtout ce que le module NE fait PAS : pas de
chiffre quand psutil manque, pas de chiffre quand le disque est illisible,
pas d'alerte rouge parce qu'Ollama a fait chauffer le CPU trois secondes.

    python -m jarvis_core._smoke_metrics
"""
from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from jarvis_core.metrics import (  # noqa: E402
    AVAILABLE,
    CRITICAL,
    ELEVATED,
    HIGH,
    NOMINAL,
    MetricsSampler,
    sample,
    threat_score,
)


def main() -> None:
    # 1. Machine au repos = rien a signaler.
    score, level = threat_score(cpu=8, ram=30, disk=40)
    assert level == NOMINAL, f"repos -> {level} ({score})"

    # 2. Un pic CPU seul ne doit PAS passer en critique : c'est Ollama qui
    #    repond, et une alerte qui crie a chaque reponse ne veut plus rien dire.
    score, level = threat_score(cpu=100, ram=35, disk=40)
    assert level in (NOMINAL, ELEVATED, HIGH), f"pic CPU seul -> {level} ({score})"
    assert level != CRITICAL, "un CPU a 100% ne doit pas etre critique a lui seul"

    # 3. Disque plein = critique. RECOVERY.md : « cause n^1 des pannes
    #    mysterieuses ». Il doit crier plus fort que tout le reste.
    score_disk, level_disk = threat_score(cpu=5, ram=20, disk=97)
    assert level_disk == CRITICAL, f"disque 97% -> {level_disk} ({score_disk})"

    # 4. A valeur egale, le disque pese plus que le CPU.
    s_cpu, _ = threat_score(cpu=90, ram=20, disk=20)
    s_dsk, _ = threat_score(cpu=20, ram=20, disk=90)
    assert s_dsk > s_cpu, f"disque {s_dsk} <= cpu {s_cpu} : ponderation inversee"

    # 5. RAM en pression = grave (swap -> machine figee -> watchdog tue le Core).
    _, level_ram = threat_score(cpu=10, ram=96, disk=30)
    assert level_ram == CRITICAL, f"RAM 96% -> {level_ram}"

    # 6. Des briques mortes pesent, meme machine froide.
    s0, _ = threat_score(cpu=5, ram=20, disk=20, degraded=0)
    s3, l3 = threat_score(cpu=5, ram=20, disk=20, degraded=3)
    assert s3 > s0 and l3 in (HIGH, CRITICAL), f"3 briques mortes -> {l3} ({s3})"

    # 7. Borne : jamais au-dessus de 100 ni sous 0.
    smax, _ = threat_score(cpu=100, ram=100, disk=100, degraded=99)
    smin, _ = threat_score(cpu=0, ram=0, disk=0, degraded=0)
    assert 0 <= smin <= smax <= 100, f"hors bornes : {smin}..{smax}"

    # 8. Monotone : ca ne doit jamais baisser quand la pression monte.
    last = -1
    for d in (10, 30, 50, 70, 85, 92, 99):
        s, _ = threat_score(cpu=5, ram=20, disk=d)
        assert s >= last, f"disque {d}% fait BAISSER l'indice ({s} < {last})"
        last = s

    # 9. Un chemin disque absent ne fabrique pas de chiffre.
    if AVAILABLE:
        data = sample(path="/chemin/qui/nexiste/pas/du/tout")
        assert data is not None
        assert data["disk"] == 0.0, f"disque invente : {data['disk']}"
        assert data["cpu"] >= 0.0 and data["ram"] > 0.0, data

        # 10. Un vrai releve est plausible, pas une marche aleatoire.
        real = sample()
        assert real is not None
        for key in ("cpu", "ram", "disk", "threat"):
            assert 0 <= real[key] <= 100, f"{key} hors bornes : {real[key]}"
        assert real["ram_total_gb"] > 0, "RAM totale nulle"
        assert real["uptime_s"] > 0, "uptime nul"
        print(f"  releve reel : cpu={real['cpu']}% ram={real['ram']}% "
              f"disk={real['disk']}% menace={real['threat']} ({real['threat_level']})")

    # 11. Sans psutil, le sampler se tait au lieu de publier du faux.
    published: list = []
    sampler = MetricsSampler(lambda k, p: published.append((k, p)))
    st = sampler.status()
    assert st["available"] is AVAILABLE
    assert st["samples"] == 0 and st["last"] is None

    # 12. Identite d'hote : « cpu 47% » sans savoir de QUI ne vaut rien.
    if AVAILABLE:
        data = sample()
        assert data and data.get("host"), "releve sans hote"
        assert data.get("role") == "core", data.get("role")

    # 13. LE cas de la flotte : le HUD tourne sur le NUC et agrege VPS, Pi,
    #     ProLiant, portable. En COALESCE sans cle, le dernier hote a parler
    #     ecraserait tous les autres — le NUC disparaitrait de son propre HUD.
    from jarvis_core.bus import Bus, Mode

    bus = Bus()
    assert bus.policies["SYSTEM_METRICS"].mode is Mode.COALESCE
    assert bus.policies["SYSTEM_METRICS"].key_field == "host", \
        "SYSTEM_METRICS sans key_field : les hotes s'ecrasent entre eux"

    sub = bus.subscribe(["SYSTEM_METRICS"], name="hud")
    for host, cpu in (("nuc", 12), ("vps", 80), ("pi", 5), ("nuc", 14)):
        bus.publish("SYSTEM_METRICS", {"host": host, "cpu": cpu})

    pending = []
    while True:
        ev = sub.get_nowait()
        if ev is None:
            break
        pending.append(ev.payload)

    hosts = {p["host"]: p["cpu"] for p in pending}
    assert set(hosts) == {"nuc", "vps", "pi"}, f"hotes vus : {set(hosts)}"
    assert hosts["nuc"] == 14, f"le 2e releve NUC n'a pas remplace le 1er : {hosts['nuc']}"
    assert hosts["vps"] == 80, "le VPS a ete ecrase par un autre hote"
    assert len(pending) == 3, f"{len(pending)} evenements pour 3 hotes"

    print("OK - metrics smoke passed")
    print("  pic CPU seul -> jamais critique | disque plein -> critique")
    print("  disque > CPU a valeur egale | briques mortes comptent | monotone")
    print("  chemin absent -> 0.0, pas un chiffre invente")
    print("  flotte : 3 hotes -> 3 etats, aucun ecrase")


if __name__ == "__main__":
    main()
