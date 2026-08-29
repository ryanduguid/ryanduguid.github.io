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
        rel = path.relative_to(core.ROOT).as_posix()
        social_image, social_alt = contracts.social_metadata_for_page(rel)
        failures.extend(
            core.check_file_metadata(
                path,
                site=contracts.SITE,
                not_indexed=contracts.NOT_INDEXED,
                title_exceptions=contracts.TITLE_EXCEPTIONS,
                warnings=warnings,
                expected_social_image=social_image,
                expected_social_alt=social_alt,
                description_limits=(
                    contracts.TIGHT_META_DESCRIPTION_LIMITS
                    if rel in contracts.TIGHT_META_DESCRIPTION_PAGES
                    else None
                ),
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
