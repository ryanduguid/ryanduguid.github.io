"""Discover pages, run SEO checks and report their results."""

from __future__ import annotations

import sys

import seo_core as core
import site_contracts as contracts


def main() -> int:
    paths = core.html_files()
    warnings: list[str] = []
    failures: list[str] = []

    for path in paths:
        failures.extend(
            core.check_file_metadata(
                path,
                site=contracts.SITE,
                not_indexed=contracts.NOT_INDEXED,
                title_exceptions=contracts.TITLE_EXCEPTIONS,
                warnings=warnings,
            )
        )
        failures.extend(contracts.check_file_contracts(path))
        print(f"checked {path.relative_to(core.ROOT).as_posix()}")

    sitemap_failures, listed_count = core.check_sitemap(
        paths,
        site=contracts.SITE,
        not_indexed=contracts.NOT_INDEXED,
    )
    failures.extend(sitemap_failures)
    failures.extend(contracts.check_site_contracts(paths))
    print(
        f"checked sitemap.xml ({listed_count} URLs), llms.txt, robots.txt"
    )

    for warning in warnings:
        print(f"  WARN {warning}")
    if failures:
        print(f"\n{len(failures)} failure(s):")
        for failure in failures:
            print(f"  FAIL {failure}")
        return 1
    print("\nall clear")
    return 0


if __name__ == "__main__":
    sys.exit(main())
