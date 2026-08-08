"""Eval matrix — catalogue litmus → markdown (pattern agent-swarm eval harness)."""

from __future__ import annotations

from pathlib import Path

from .litmus import catalog


def _repo_root() -> Path:
    return Path(__file__).resolve().parents[2]


def render_markdown() -> str:
    lines = [
        "# Eval matrix — auto from litmus",
        "",
        "> Généré par `python -m jarvis_core.eval_matrix` — ne pas éditer à la main.",
        "",
        "| capability_id | tier | proof | label |",
        "|---|---|---|---|",
    ]
    for entry in catalog(include_e2e=True):
        if entry.smoke_module:
            proof = entry.smoke_module
        elif entry.check is not None:
            proof = "static check"
        else:
            proof = "—"
        lines.append(
            f"| `{entry.capability_id}` | {entry.tier.value} | `{proof}` | {entry.label} |"
        )
    lines.append("")
    return "\n".join(lines)


def write_matrix(path: Path | None = None) -> Path:
    dest = path or (_repo_root() / "docs" / "audit" / "EVAL_MATRIX.md")
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_text(render_markdown(), encoding="utf-8")
    return dest


def main() -> int:
    dest = write_matrix()
    print(f"EVAL_MATRIX -> {dest}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
