"""Exercise bounded Streamable HTTP sessions without models or network access."""

import httpx
import pytest

from mcp_server import create_mcp_server


@pytest.mark.asyncio
async def test_streamable_http_refuses_excess_sessions_and_reclaims_deleted_one():
    server = create_mcp_server()
    # A personal/local server should not retain thousands of abandoned clients.
    assert server.settings.max_sessions == 64
    assert server.settings.session_idle_timeout == 300
    server.settings.max_sessions = 2
    app = server.streamable_http_app()
    request = {
        "jsonrpc": "2.0", "id": 1, "method": "initialize",
        "params": {
            "protocolVersion": "2025-03-26", "capabilities": {},
            "clientInfo": {"name": "security-regression", "version": "1"},
        },
    }
    headers = {"Accept": "application/json, text/event-stream"}
    async with server.session_manager.run():
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app), base_url="http://localhost:8765",
            headers=headers,
        ) as client:
            first = await client.post("/", json=request)
            second = await client.post("/", json=request)
            assert first.status_code == second.status_code == 200
            assert first.headers["mcp-session-id"] != second.headers["mcp-session-id"]
            blocked = await client.post("/", json=request)
            assert blocked.status_code == 503
            deleted = await client.delete(
                "/", headers={"mcp-session-id": first.headers["mcp-session-id"]},
            )
            assert deleted.status_code == 200
            assert (await client.post("/", json=request)).status_code == 200
