"""Run repository-only onboarding acceptance on disposable snapshots.

Build TransferKit first. This script runs only the TransferKit CLI; it never runs
the evaluated repositories' install, start, migration, seed, or test scripts.
"""

import argparse
import hashlib
import json
import os
import re
import resource
import shutil
import subprocess
import sys
import time
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
CLI = ROOT / "packages/cli/dist/index.js"
SOURCES = [
    ("plain-node", ROOT / "fixtures/onboarding-plain-node", None),
    ("neutral-nest", ROOT / "fixtures/onboarding-phase4", None),
    ("neutral-branches", ROOT / "fixtures/onboarding-deep-guide", None),
    ("event-count-cli", ROOT / "fixtures/onboarding-human-cli", None),
    ("sparse-python", ROOT / "fixtures/onboarding-human-sparse", None),
]
REVISIONS = [
    ("debtbox", "e0267736a40a3181aae1c463782fe0f0436975c7"),
    ("madar", "79cc98e534a95a2a316c3464281619fb86a12d99"),
]


def snapshot_archive(repository: Path, revision: str, destination: Path) -> None:
    archive = destination.parent / f"{destination.name}.tar"
    subprocess.run(
        ["git", "-C", str(repository), "archive", f"--output={archive}", revision],
        check=True,
    )
    destination.mkdir()
    try:
        subprocess.run(["tar", "-xf", str(archive), "-C", str(destination)], check=True)
    finally:
        archive.unlink(missing_ok=True)


def guide_run(directory: Path) -> tuple[float, float, str]:
    log = directory / "guide-run.log"
    started = time.perf_counter()
    with log.open("w") as output:
        process = subprocess.Popen(
            ["node", str(CLI), "onboard", "guide"],
            cwd=directory,
            stdout=output,
            stderr=subprocess.STDOUT,
        )
        _, status, usage = os.wait4(process.pid, 0)
    if os.waitstatus_to_exitcode(status) != 0:
        raise RuntimeError(f"guide failed in {directory}: {log.read_text()}")
    peak_mib = usage.ru_maxrss / (1024 * 1024 if sys.platform == "darwin" else 1024)
    return round(time.perf_counter() - started, 3), round(peak_mib, 1), log.read_text().strip()


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out", required=True, type=Path, help="New output directory")
    parser.add_argument("--debtbox", type=Path, help="Debtbox Git checkout")
    parser.add_argument("--madar", type=Path, help="Madar B2C Git checkout")
    args = parser.parse_args()
    if not CLI.is_file():
        parser.error("Build TransferKit first with npm run build")
    args.out.mkdir(parents=True, exist_ok=False)
    cases = list(SOURCES)
    for name, revision in REVISIONS:
        repository = getattr(args, name)
        if repository:
            cases.append((name, repository, revision))
    results = []
    for name, source, revision in cases:
        target = args.out / name
        if revision:
            snapshot_archive(source, revision, target)
        else:
            shutil.copytree(source, target)
        seconds, peak_mib, message = guide_run(target)
        workspace = subprocess.run(
            ["node", str(CLI), "onboard", "workspace"],
            cwd=target,
            text=True,
            capture_output=True,
            check=True,
        )
        guide = (target / "ONBOARDING.md").read_text()
        opening = guide.split("## Start here", 1)[-1].split(
            "<!-- tk:onboard:section system-overview end -->", 1
        )[0]
        opening = re.sub(r"<!--.*?-->|<[^>]+>|\]\([^)]*\)", " ", opening, flags=re.S)
        references = re.findall(r"\[([^\]]+):(\d+)\]\(([^)#]+)#L(\d+)\)", guide)
        broken_references = []
        for ref_name, line, path, anchor in references:
            source = target / path
            if (
                ref_name != path
                or line != anchor
                or not source.is_file()
                or int(line) > len(source.read_text(errors="replace").splitlines())
            ):
                broken_references.append(f"{ref_name}:{line}")
        results.append(
            {
                "case": name,
                "revision": revision,
                "guide_seconds": seconds,
                "guide_peak_mib": peak_mib,
                "guide_bytes": len(guide.encode()),
                "guide_sha256": hashlib.sha256(guide.encode()).hexdigest(),
                "opening_words": len(re.findall(r"\b[\w-]+\b", opening)),
                "source_references": len(references),
                "broken_source_references": broken_references,
                "journeys": re.findall(r"^### Source journey: (.+)$", guide, re.M),
                "snapshot_js_ts_files": sum(
                    path.suffix in {".ts", ".tsx", ".js", ".jsx"}
                    for path in target.rglob("*")
                    if path.is_file() and "node_modules" not in path.parts
                ),
                "guide_message": message,
                "workspace_message": workspace.stdout.strip(),
            }
        )
    (args.out / "results.json").write_text(json.dumps(results, indent=2) + "\n")
    print(args.out / "results.json")


if __name__ == "__main__":
    main()
