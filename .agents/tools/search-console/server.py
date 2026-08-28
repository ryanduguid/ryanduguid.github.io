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
    "Search Console can return top rows rather than exhaustive query data."
)
READ_ONLY = ToolAnnotations(readOnlyHint=True, idempotentHint=True)


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


def build_server() -> MCPServer:
    """Build the server without reading credentials or contacting Google."""

    server = MCPServer(
        name="duguid-search-console",
        description="Bounded, read-only evidence from one Search Console property.",
        version="1.0.0",
        log_level="ERROR",
    )

    @server.tool(annotations=READ_ONLY)
    def compare_search_performance(
        end_date: str,
        days: int = 28,
        dimensions: tuple[str, ...] = ("page", "query"),
        row_limit: int = 1_000,
    ) -> dict[str, object]:
        """Compare adjacent finalised periods and rank click/impression changes."""

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
        session = _session()
        current_payload = _response_json(
            session.post(endpoint, json=current_request, timeout=30)
        )
        previous_payload = _response_json(
            session.post(endpoint, json=previous_request, timeout=30)
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

    @server.tool(annotations=READ_ONLY)
    def inspect_url(url: str) -> dict[str, object]:
        """Read Google's index status for one exact same-site HTTPS URL."""

        inspection_url = core.validate_site_url(url)
        payload = _response_json(
            _session().post(
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

    @server.tool(annotations=READ_ONLY)
    def list_sitemaps() -> dict[str, object]:
        """List the sitemaps currently reported for the fixed property."""

        payload = _response_json(
            _session().get(
                f"{SEARCH_API}/sites/{_property_path()}/sitemaps", timeout=30
            )
        )
        sitemaps = payload.get("sitemap", [])
        if not isinstance(sitemaps, list):
            raise RuntimeError("Search Console returned malformed sitemap data")
        return {"property": PROPERTY, "sitemaps": sitemaps}

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
        description="Run the MCP or explicitly manage its read-only OAuth credential."
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
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
