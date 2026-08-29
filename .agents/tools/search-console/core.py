"""Pure validation and comparison logic for the Search Console reader."""

from __future__ import annotations

from datetime import date, timedelta
from urllib.parse import urlsplit

ALLOWED_DIMENSIONS = frozenset({"date", "page", "query", "device", "country"})
ALLOWED_HOSTS = frozenset({"duguid.com.au", "www.duguid.com.au"})
MAX_DAYS = 90
MAX_ROWS = 1_000


def _require_date(value: date, label: str) -> date:
    if type(value) is not date:
        raise TypeError(f"{label} must be a datetime.date")
    return value


def _validate_dimensions(dimensions: list[str] | tuple[str, ...]) -> list[str]:
    selected = list(dimensions)
    if not selected:
        raise ValueError("at least one Search Console dimension is required")
    unknown = [item for item in selected if item not in ALLOWED_DIMENSIONS]
    if unknown:
        raise ValueError(f"unknown Search Console dimension: {unknown[0]}")
    if len(selected) != len(set(selected)):
        raise ValueError("Search Console dimensions must be unique")
    return selected


def comparison_windows(end_date: date, days: int = 28) -> dict[str, dict[str, str]]:
    """Return adjacent inclusive current and previous reporting windows."""

    final_day = _require_date(end_date, "end_date")
    if isinstance(days, bool) or not isinstance(days, int) or not 1 <= days <= MAX_DAYS:
        raise ValueError("days must be an integer from 1 to 90")

    current_start = final_day - timedelta(days=days - 1)
    previous_end = current_start - timedelta(days=1)
    previous_start = previous_end - timedelta(days=days - 1)
    return {
        "current": {
            "start_date": current_start.isoformat(),
            "end_date": final_day.isoformat(),
        },
        "previous": {
            "start_date": previous_start.isoformat(),
            "end_date": previous_end.isoformat(),
        },
    }


def build_search_request(
    start_date: date,
    end_date: date,
    dimensions: list[str] | tuple[str, ...],
    row_limit: int = MAX_ROWS,
) -> dict[str, object]:
    """Validate and build a bounded Search Analytics request body."""

    first_day = _require_date(start_date, "start_date")
    final_day = _require_date(end_date, "end_date")
    inclusive_days = (final_day - first_day).days + 1
    if inclusive_days < 1:
        raise ValueError("end_date must not be before start_date")
    if inclusive_days > MAX_DAYS:
        raise ValueError("Search Console requests cannot exceed 90 days")
    if (
        isinstance(row_limit, bool)
        or not isinstance(row_limit, int)
        or not 1 <= row_limit <= MAX_ROWS
    ):
        raise ValueError("row_limit must be an integer from 1 to 1,000")

    return {
        "startDate": first_day.isoformat(),
        "endDate": final_day.isoformat(),
        "dimensions": _validate_dimensions(dimensions),
        "rowLimit": row_limit,
    }


def validate_site_url(url: str) -> str:
    """Reject inspection targets outside the site's exact HTTPS hosts."""

    if not isinstance(url, str):
        raise ValueError("inspection target must be an HTTPS URL on duguid.com.au")
    try:
        parsed = urlsplit(url)
        port = parsed.port
    except ValueError as error:
        raise ValueError(
            "inspection target must be an HTTPS URL on duguid.com.au"
        ) from error

    valid = (
        parsed.scheme == "https"
        and parsed.hostname in ALLOWED_HOSTS
        and parsed.username is None
        and parsed.password is None
        and port in (None, 443)
        and not parsed.fragment
    )
    if not valid:
        raise ValueError("inspection target must be an HTTPS URL on duguid.com.au")
    return url


def _metric(row: dict[str, object], name: str) -> int | float:
    value = row.get(name, 0)
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise ValueError(f"Search Console row {name} must be numeric")
    return value


def _index_rows(
    rows: list[dict[str, object]], dimensions: list[str]
) -> tuple[dict[tuple[str, ...], dict[str, object]], list[tuple[str, ...]]]:
    indexed: dict[tuple[str, ...], dict[str, object]] = {}
    order: list[tuple[str, ...]] = []
    for row in rows:
        keys = row.get("keys")
        if not isinstance(keys, list) or len(keys) != len(dimensions):
            raise ValueError("Search Console row keys must match the dimensions")
        if not all(isinstance(key, str) for key in keys):
            raise ValueError("Search Console dimension keys must be strings")
        key = tuple(keys)
        if key in indexed:
            raise ValueError("Search Console rows must have unique dimension keys")
        indexed[key] = row
        order.append(key)
    return indexed, order


def compare_search_rows(
    current: list[dict[str, object]],
    previous: list[dict[str, object]],
    dimensions: list[str] | tuple[str, ...],
) -> list[dict[str, object]]:
    """Join two complete API row sets and rank absolute impression changes."""

    selected = _validate_dimensions(dimensions)
    current_rows, current_order = _index_rows(current, selected)
    previous_rows, previous_order = _index_rows(previous, selected)
    keys = current_order + [key for key in previous_order if key not in current_rows]
    compared: list[dict[str, object]] = []

    for key in keys:
        current_row = current_rows.get(key, {})
        previous_row = previous_rows.get(key, {})
        current_metrics = {
            "clicks": _metric(current_row, "clicks"),
            "impressions": _metric(current_row, "impressions"),
        }
        previous_metrics = {
            "clicks": _metric(previous_row, "clicks"),
            "impressions": _metric(previous_row, "impressions"),
        }
        compared.append(
            {
                **dict(zip(selected, key, strict=True)),
                "current": current_metrics,
                "previous": previous_metrics,
                "delta": {
                    "clicks": current_metrics["clicks"]
                    - previous_metrics["clicks"],
                    "impressions": current_metrics["impressions"]
                    - previous_metrics["impressions"],
                },
            }
        )

    return sorted(
        compared,
        key=lambda row: abs(row["delta"]["impressions"]),  # type: ignore[index]
        reverse=True,
    )
