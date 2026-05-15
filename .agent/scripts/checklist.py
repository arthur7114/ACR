#!/usr/bin/env python3
"""Validation checklist — run after every implementation cycle."""

import subprocess
import sys


def run(cmd: str, label: str) -> bool:
    print(f"\n[{label}]")
    result = subprocess.run(cmd, shell=True, capture_output=True, text=True)
    if result.stdout:
        print(result.stdout)
    if result.stderr:
        print(result.stderr)
    ok = result.returncode == 0
    print("PASS" if ok else "FAIL")
    return ok


def main() -> None:
    checks = [
        ("pnpm lint", "Lint"),
        ("pnpm build", "Build / Type check"),
    ]

    results = [run(cmd, label) for cmd, label in checks]

    print("\n--- Summary ---")
    for (_, label), ok in zip(checks, results):
        print(f"{'OK' if ok else 'FAIL':<6} {label}")

    if not all(results):
        sys.exit(1)


if __name__ == "__main__":
    main()
