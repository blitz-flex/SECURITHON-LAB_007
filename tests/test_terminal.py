import pytest
import json
from unittest.mock import MagicMock, patch
from fastapi import status

def _create_ws_ticket(client, headers, session_id=""):
    response = client.post(
        "/api/v1/terminal/ws-ticket",
        params={"session_id": session_id},
        headers=headers,
    )
    assert response.status_code == status.HTTP_200_OK
    return response.json()["ticket"]


def test_websocket_unauthorized_ticket_fails(client):
    # Invalid ticket
    with client.websocket_connect(
        "/api/v1/terminal/ws",
        subprotocols=["terminal-ticket.invalid_ticket"],
    ) as websocket:
        msg = websocket.receive()
        assert "text" in msg
        assert "unauthorized" in msg["text"].lower()
        
        close_msg = websocket.receive()
        assert close_msg.get("type") in ("websocket.close", "websocket.disconnect")

    # Missing ticket
    with client.websocket_connect("/api/v1/terminal/ws") as websocket:
        msg = websocket.receive()
        assert "text" in msg
        assert "unauthorized" in msg["text"].lower()
        
        close_msg = websocket.receive()
        assert close_msg.get("type") in ("websocket.close", "websocket.disconnect")

@patch("app.api.v1.endpoints.terminal.HostTerminalManager")
@patch("app.core.sandbox.sandbox_manager.is_available", return_value=False)
def test_websocket_authorized_successful_connection(mock_is_avail, mock_host_mgr_class, client, admin_user):
    mock_instance = MagicMock()
    mock_host_mgr_class.return_value = mock_instance
    
    from app.core.config import settings
    original_dev_mode = settings.DEV_MODE
    settings.DEV_MODE = True
    
    try:
        ticket = _create_ws_ticket(client, admin_user["headers"])
        import app.api.v1.endpoints.terminal as terminal_mod
        print(f"DEBUG TEST: mock_is_avail={mock_is_avail}")
        print(f"DEBUG TEST: mock_host_mgr_class={mock_host_mgr_class}")
        print(f"DEBUG TEST: HostTerminalManager ID in test: {id(terminal_mod.HostTerminalManager)}")
        with client.websocket_connect(
            "/api/v1/terminal/ws",
            subprotocols=[f"terminal-ticket.{ticket}"],
        ) as websocket:
            # Poll for mock call to resolve async race condition with ASGI thread
            import time
            start_t = time.time()
            while mock_host_mgr_class.call_count == 0 and time.time() - start_t < 2.0:
                time.sleep(0.05)
                
            mock_host_mgr_class.assert_called_once()
            mock_instance.spawn_terminal.assert_called_once()
            
            # Send input
            payload = json.dumps({"type": "input", "data": "whoami\n"})
            websocket.send_text(payload)
            
            # Poll for the mock call to resolve async race condition with ASGI thread processing the message
            start_t = time.time()
            while mock_instance.write_to_pty.call_count == 0 and time.time() - start_t < 2.0:
                time.sleep(0.05)
                
            # Verify input was written to the pty
            mock_instance.write_to_pty.assert_called_with(b"whoami\n")
    finally:
        settings.DEV_MODE = original_dev_mode

@patch("app.core.sandbox.sandbox_manager.is_available", return_value=False)
def test_host_shell_block_for_regular_user(mock_is_avail, client, normal_user):
    from app.core.config import settings
    original_dev_mode = settings.DEV_MODE
    settings.DEV_MODE = True
    
    try:
        ticket = _create_ws_ticket(client, normal_user["headers"])
        with client.websocket_connect(
            "/api/v1/terminal/ws",
            subprotocols=[f"terminal-ticket.{ticket}"],
        ) as websocket:
            msg = websocket.receive()
            assert "text" in msg
            assert "Host shell fallback disabled" in msg["text"]
            
            close_msg = websocket.receive()
            assert close_msg.get("type") in ("websocket.close", "websocket.disconnect")
    finally:
        settings.DEV_MODE = original_dev_mode
