"""Validate COSMOS on the five official challenge test targets.

    pipeline/.venv/Scripts/python pipeline/validate_targets.py [--targets barnard,wise0855,...] [--stage scan|all]

Stages (each cached under data/raw/validation/<target>/, so re-runs are cheap):
  catalog  catalogue astrometry (Gaia DR3; SIMBAD where Gaia has none)
  scan     SIA2 inventory + wavelength at the target for every frame (header-only range reads)
  all      + matched-set selection, cutout download, native-grid measurement, JSON + summary
  report   re-derive verdicts/JSON from cached measurements (data/raw/validation/<target>/results_raw.json)
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from validation.common import TARGETS, load_catalog  # noqa: E402
from validation.scan import scan_target  # noqa: E402


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--targets", default=",".join(TARGETS))
    ap.add_argument("--stage", default="all", choices=["catalog", "scan", "all", "report"])
    ap.add_argument("--refresh", action="store_true")
    a = ap.parse_args()
    for tid in a.targets.split(","):
        cat = load_catalog(tid, refresh=a.refresh)
        print(f"[{tid}] astrometry: {cat['astrometry']['source']}")
        if a.stage == "catalog":
            continue
        if a.stage == "report":  # re-derive verdicts/JSON from cached measurements (no downloads, no re-measuring)
            import json

            from validation.common import RAW
            from validation.report import finalize
            from validation.run import write_json
            R = json.loads((RAW / tid / "results_raw.json").read_text())
            result, limitations, extra = finalize(tid, cat, R)
            write_json(tid, cat, R, result, limitations, extra)
            print(f"[{tid}] VERDICT: {result['verdict']} -- {result['summary']}")
            continue
        frames = scan_target(tid, cat, refresh=a.refresh)
        ok = [f for f in frames if f.get("inside")]
        print(f"[{tid}] frames: {len(frames)}  target on detector: {len(ok)}  errors: {sum('error' in f for f in frames)}")
        if a.stage == "scan":
            continue
        from validation.report import finalize, print_diag, save_raw
        from validation.run import run_target, write_json
        R = run_target(tid, cat, frames)
        save_raw(tid, R)
        print_diag(tid, R)
        result, limitations, extra = finalize(tid, cat, R)
        write_json(tid, cat, R, result, limitations, extra)
        print(f"[{tid}] VERDICT: {result['verdict']} -- {result['summary']}")


if __name__ == "__main__":
    main()
