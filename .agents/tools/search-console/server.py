# /// script
# requires-python = ">=3.12"
# dependencies = [
#   "mcp==2.1.1",
#   "google-auth==2.57.0",
#   "google-auth-oauthlib==1.4.1",
#   "keyring==25.7.0",
# ]
# ///
"""Read-only Search Console MCP and explicit credential-management CLI."""

from __future__ import annotations

import argparse
import asyncio
import json
import sys
from collections.abc import Callable
from datetime import date
from pathlib import Path
from urllib.parse import quote

import keyring
from google.auth.transport.requests import AuthorizedSession
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from mcp.server.mcpserver import MCPServer
from mcp.types import ToolAnnotations

import core

PROPERTY = "sc-domain:duguid.com.au"
SCOPE = "https://www.googleapis.com/auth/webmasters.readonly"
SCOPES = [SCOPE]
KEYRING_SERVICE = "duguid-search-console"
KEYRING_ACCOUNT = PROPERTY
SEARCH_API = "https://www.googleapis.com/webmasters/v3"
INSPECTION_API = "https://searchconsole.googleapis.com/v1"
TOP_ROWS_NOTICE = (
    "Each period can return only top rows. A row absent from one returned set "
    "is normalised to zero, so deltas are indicative rather than exhaustive."
)
READ_ONLY = ToolAnnotations(readOnlyHint=True, idempotentHint=True)
SessionFactory = Callable[[], object]


def _property_path() -> str:
    return quote(PROPERTY, safe="")


def _parse_date(value: str, label: str) -> date:
    try:
        parsed = date.fromisoformat(value)
    except (TypeError, ValueError) as error:
        raise ValueError(f"{label} must be an ISO date in YYYY-MM-DD format") from error
    return parsed


def _credentials() -> Credentials:
    serialised = keyring.get_password(KEYRING_SERVICE, KEYRING_ACCOUNT)
    if serialised is None:
        raise RuntimeError(
            "Search Console is not authenticated. Run this script's auth command "
            "with a Google Desktop OAuth client file."
        )
    try:
        details = json.loads(serialised)
        credentials = Credentials.from_authorized_user_info(details, SCOPES)
    except (TypeError, ValueError, json.JSONDecodeError) as error:
        raise RuntimeError(
            "The stored Search Console credential is invalid. Run logout, then auth."
        ) from error
    if set(credentials.scopes or ()) != {SCOPE}:
        raise RuntimeError(
            "The stored Search Console credential does not have the exact read-only "
            "scope. Run logout, then auth."
        )
    return credentials


def _session() -> AuthorizedSession:
    return AuthorizedSession(_credentials())


def _response_json(response: object) -> dict[str, object]:
    response.raise_for_status()  # type: ignore[attr-defined]
    payload = response.json()  # type: ignore[attr-defined]
    if not isinstance(payload, dict):
        raise RuntimeError("Search Console returned an unexpected response shape")
    return payload


def _rows(payload: dict[str, object]) -> list[dict[str, object]]:
    rows = payload.get("rows", [])
    if not isinstance(rows, list) or not all(isinstance(row, dict) for row in rows):
        raise RuntimeError("Search Console returned malformed analytics rows")
    return rows


def _transport_fixture_test() -> None:
    """Exercise the shared CLI/MCP handlers without credentials or network."""

    class FixtureResponse:
        def __init__(self, payload: dict[str, object]) -> None:
            self.payload = payload

        def raise_for_status(self) -> None:
            return None

        def json(self) -> dict[str, object]:
            return self.payload

    class FixtureSession:
        def __init__(
            self,
            *,
            post_payloads: tuple[dict[str, object], ...] = (),
            get_payloads: tuple[dict[str, object], ...] = (),
        ) -> None:
            self.post_payloads = list(post_payloads)
            self.get_payloads = list(get_payloads)
            self.calls: list[tuple[str, str, object, int]] = []

        def post(self, url: str, *, json: object, timeout: int) -> FixtureResponse:
            self.calls.append(("POST", url, json, timeout))
            return FixtureResponse(self.post_payloads.pop(0))

        def get(self, url: str, *, timeout: int) -> FixtureResponse:
            self.calls.append(("GET", url, None, timeout))
            return FixtureResponse(self.get_payloads.pop(0))

    comparison_session = FixtureSession(
        post_payloads=(
            {"rows": [{"keys": ["https://duguid.com.au/a/", "levy"], "clicks": 4, "impressions": 100}]},
            {"rows": [{"keys": ["https://duguid.com.au/a/", "levy"], "clicks": 2, "impressions": 40}]},
        )
    )
    comparison = _compare_search_performance(
        "2026-08-28",
        dimensions=("page", "query"),
        session_factory=lambda: comparison_session,
    )
    assert comparison["rows"][0]["delta"] == {"clicks": 2, "impressions": 60}
    assert [call[0] for call in comparison_session.calls] == ["POST", "POST"]
    assert all(call[3] == 30 for call in comparison_session.calls)

    inspection_session = FixtureSession(
        post_payloads=({"inspectionResult": {"indexStatusResult": {"verdict": "PASS"}}},)
    )
    inspection = _inspect_url(
        "https://duguid.com.au/tools/coal-lsl-levy/",
        session_factory=lambda: inspection_session,
    )
    assert inspection["inspection_result"] == {
        "indexStatusResult": {"verdict": "PASS"}
    }
    assert inspection_session.calls[0][0] == "POST"

    sitemap_session = FixtureSession(
        get_payloads=({"sitemap": [{"path": "https://duguid.com.au/sitemap.xml"}]},)
    )
    sitemaps = _list_sitemaps(session_factory=lambda: sitemap_session)
    assert sitemaps["sitemaps"] == [{"path": "https://duguid.com.au/sitemap.xml"}]
    assert sitemap_session.calls[0][0] == "GET"

    session_calls = 0

    def forbidden_session() -> object:
        nonlocal session_calls
        session_calls += 1
        raise AssertionError("invalid input reached the HTTP boundary")

    for invalid_call in (
        lambda: _compare_search_performance(
            "2026-08-28",
            dimensions=("searchAppearance",),
            session_factory=forbidden_session,
        ),
        lambda: _inspect_url(
            "http://duguid.com.au/", session_factory=forbidden_session
        ),
    ):
        try:
            invalid_call()
        except ValueError:
            pass
        else:
            raise AssertionError("invalid transport input was accepted")
    assert session_calls == 0

    parser = _parser()
    assert parser.parse_args(
        ["compare_search_performance", "--end-date", "2026-08-28"]
    ).command == "compare_search_performance"
    assert parser.parse_args(
        ["inspect_url", "https://duguid.com.au/"]
    ).command == "inspect_url"
    assert parser.parse_args(["list_sitemaps"]).command == "list_sitemaps"


def _compare_search_performance(
    end_date: str,
    days: int = 28,
    dimensions: tuple[str, ...] | list[str] = ("page", "query"),
    row_limit: int = 1_000,
    *,
    session_factory: SessionFactory,
) -> dict[str, object]:
    windows = core.comparison_windows(_parse_date(end_date, "end_date"), days)
    current_window = windows["current"]
    previous_window = windows["previous"]
    current_request = core.build_search_request(
        _parse_date(current_window["start_date"], "current start date"),
        _parse_date(current_window["end_date"], "current end date"),
        dimensions,
        row_limit,
    )
    previous_request = core.build_search_request(
        _parse_date(previous_window["start_date"], "previous start date"),
        _parse_date(previous_window["end_date"], "previous end date"),
        dimensions,
        row_limit,
    )

    endpoint = f"{SEARCH_API}/sites/{_property_path()}/searchAnalytics/query"
    session = session_factory()
    current_payload = _response_json(
        session.post(endpoint, json=current_request, timeout=30)  # type: ignore[attr-defined]
    )
    previous_payload = _response_json(
        session.post(endpoint, json=previous_request, timeout=30)  # type: ignore[attr-defined]
    )
    return {
        "property": PROPERTY,
        "windows": windows,
        "dimensions": list(dimensions),
        "row_limit": row_limit,
        "rows": core.compare_search_rows(
            _rows(current_payload), _rows(previous_payload), dimensions
        ),
        "notice": TOP_ROWS_NOTICE,
    }


def compare_search_performance(
    end_date: str,
    days: int = 28,
    dimensions: tuple[str, ...] = ("page", "query"),
    row_limit: int = 1_000,
) -> dict[str, object]:
    """Compare adjacent finalised periods and rank click/impression changes."""

    return _compare_search_performance(
        end_date,
        days,
        dimensions,
        row_limit,
        session_factory=_session,
    )


def _inspect_url(url: str, *, session_factory: SessionFactory) -> dict[str, object]:
    inspection_url = core.validate_site_url(url)
    payload = _response_json(
        session_factory().post(  # type: ignore[attr-defined]
            f"{INSPECTION_API}/urlInspection/index:inspect",
            json={
                "inspectionUrl": inspection_url,
                "siteUrl": PROPERTY,
                "languageCode": "en-AU",
            },
            timeout=30,
        )
    )
    return {
        "property": PROPERTY,
        "inspection_url": inspection_url,
        "inspection_result": payload.get("inspectionResult", {}),
    }


def inspect_url(url: str) -> dict[str, object]:
    """Read Google's index status for one exact same-site HTTPS URL."""

    return _inspect_url(url, session_factory=_session)


def _list_sitemaps(*, session_factory: SessionFactory) -> dict[str, object]:
    payload = _response_json(
        session_factory().get(  # type: ignore[attr-defined]
            f"{SEARCH_API}/sites/{_property_path()}/sitemaps", timeout=30
        )
    )
    sitemaps = payload.get("sitemap", [])
    if not isinstance(sitemaps, list):
        raise RuntimeError("Search Console returned malformed sitemap data")
    return {"property": PROPERTY, "sitemaps": sitemaps}


def list_sitemaps() -> dict[str, object]:
    """List the sitemaps currently reported for the fixed property."""

    return _list_sitemaps(session_factory=_session)


def build_server() -> MCPServer:
    """Build the server without reading credentials or contacting Google."""

    server = MCPServer(
        name="duguid-search-console",
        description="Bounded, read-only evidence from one Search Console property.",
        version="1.0.0",
        log_level="ERROR",
    )

    server.tool(annotations=READ_ONLY)(compare_search_performance)
    server.tool(annotations=READ_ONLY)(inspect_url)
    server.tool(annotations=READ_ONLY)(list_sitemaps)

    return server


async def _self_test() -> None:
    tools = await build_server().list_tools()
    expected = {
        "compare_search_performance",
        "inspect_url",
        "list_sitemaps",
    }
    assert {tool.name for tool in tools} == expected
    for tool in tools:
        assert tool.annotations is not None
        assert tool.annotations.read_only_hint is True
        assert tool.annotations.idempotent_hint is True
    _transport_fixture_test()
    print("search console transport self-test passed")


def _authenticate(client_secrets: Path) -> None:
    if not client_secrets.is_file():
        raise ValueError("the Desktop OAuth client file does not exist")
    flow = InstalledAppFlow.from_client_secrets_file(str(client_secrets), SCOPES)
    credentials = flow.run_local_server(host="localhost", port=0, open_browser=True)
    if set(credentials.scopes or ()) != {SCOPE}:
        raise RuntimeError("Google did not grant the exact requested read-only scope")
    keyring.set_password(KEYRING_SERVICE, KEYRING_ACCOUNT, credentials.to_json())
    print("Search Console read-only credential stored in Windows Credential Manager.")


def _logout() -> None:
    if keyring.get_password(KEYRING_SERVICE, KEYRING_ACCOUNT) is None:
        print("No Search Console credential is stored.")
        return
    keyring.delete_password(KEYRING_SERVICE, KEYRING_ACCOUNT)
    print("Search Console credential removed from Windows Credential Manager.")


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Run the MCP, its read-only CLI, or explicit OAuth management."
    )
    commands = parser.add_subparsers(dest="command", required=True)
    auth = commands.add_parser("auth", help="complete explicit installed-app OAuth")
    auth.add_argument(
        "--client-secrets",
        required=True,
        type=Path,
        help="path to a Google Desktop OAuth client JSON file",
    )
    commands.add_parser("logout", help="remove the credential from keyring")
    commands.add_parser("self-test", help="test the transport without credentials")

    comparison = commands.add_parser(
        "compare_search_performance",
        help="compare adjacent finalised Search Console periods",
    )
    comparison.add_argument("--end-date", required=True, help="finalised YYYY-MM-DD")
    comparison.add_argument("--days", type=int, default=28)
    comparison.add_argument(
        "--dimensions", nargs="+", default=["page", "query"]
    )
    comparison.add_argument("--row-limit", type=int, default=1_000)

    inspection = commands.add_parser(
        "inspect_url", help="inspect one same-site HTTPS URL"
    )
    inspection.add_argument("url")
    commands.add_parser("list_sitemaps", help="list reported sitemaps")
    return parser


def main() -> int:
    if len(sys.argv) == 1:
        build_server().run(transport="stdio")
        return 0

    arguments = _parser().parse_args()
    if arguments.command == "self-test":
        asyncio.run(_self_test())
    elif arguments.command == "auth":
        _authenticate(arguments.client_secrets)
    elif arguments.command == "logout":
        _logout()
    elif arguments.command == "compare_search_performance":
        print(
            json.dumps(
                compare_search_performance(
                    arguments.end_date,
                    arguments.days,
                    arguments.dimensions,
                    arguments.row_limit,
                ),
                indent=2,
                sort_keys=True,
            )
        )
    elif arguments.command == "inspect_url":
        print(json.dumps(inspect_url(arguments.url), indent=2, sort_keys=True))
    elif arguments.command == "list_sitemaps":
        print(json.dumps(list_sitemaps(), indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
