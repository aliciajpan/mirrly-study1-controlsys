"""
Robot WebSocket Client
Handles communication with the Mirrly robot via WebSocket
"""
import asyncio
import json
import logging
import threading
from typing import Dict, Optional, Callable

try:
    import websockets
except ImportError:
    websockets = None

logger = logging.getLogger(__name__)


class RobotWebSocketClient:
    """
    Async WebSocket client for robot gesture control.
    Runs in a background thread to avoid blocking Flask.
    """

    def __init__(self, ws_url: str, debug: bool = False):
        self.ws_url = ws_url
        self.debug = debug
        self.connected = False
        self.websocket = None
        self.loop = None
        self.thread = None
        self.status_callback: Optional[Callable] = None
        self._lock = threading.Lock()

        if self.debug:
            logging.basicConfig(level=logging.DEBUG)

    def start(self):
        """Start the WebSocket connection in a background thread."""
        if self.thread and self.thread.is_alive():
            logger.warning("Robot client already running")
            return

        self.thread = threading.Thread(target=self._run_async_loop, daemon=True)
        self.thread.start()
        logger.info(f"Robot WebSocket client started (target: {self.ws_url})")

    def _run_async_loop(self):
        """Run the asyncio event loop in a background thread."""
        self.loop = asyncio.new_event_loop()
        asyncio.set_event_loop(self.loop)
        self.loop.run_until_complete(self._connect_and_listen())

    async def _connect_and_listen(self):
        """Connect to robot WebSocket and listen for messages."""
        while True:
            try:
                async with websockets.connect(self.ws_url) as websocket:
                    self.websocket = websocket
                    self.connected = True
                    self._notify_status("connected", {"message": "Robot connected"})
                    logger.info("Robot WebSocket connected")

                    # Listen for messages from robot
                    try:
                        async for message in websocket:
                            self._handle_robot_message(message)
                    except websockets.exceptions.ConnectionClosed:
                        pass

            except Exception as e:
                self.connected = False
                self._notify_status(
                    "disconnected", {"message": f"Connection failed: {str(e)}"}
                )
                logger.error(f"Robot WebSocket error: {e}")
                # Reconnect after delay
                await asyncio.sleep(5)

    def send_gesture(self, gesture_name: str, metadata: Optional[Dict] = None) -> bool:
        """
        Send a gesture command to the robot.
        
        Args:
            gesture_name: Name of the gesture to execute
            metadata: Optional metadata about the gesture
            
        Returns:
            True if sent successfully, False otherwise
        """
        if not self.connected or not self.loop:
            logger.warning(
                f"Robot not connected, cannot send gesture: {gesture_name}"
            )
            return False

        # Send as JSON with "action" and "gesture" fields (matching robot server API)
        payload = {
            "action": "gesture",
            "gesture": gesture_name
        }
        if metadata:
            payload["metadata"] = metadata
        message = json.dumps(payload)

        # Schedule the send in the event loop
        future = asyncio.run_coroutine_threadsafe(
            self._send_message(message), self.loop
        )

        try:
            future.result(timeout=2)
            logger.debug(f"Gesture sent: {gesture_name}")
            return True
        except Exception as e:
            logger.error(f"Failed to send gesture: {e}")
            return False

    def send_command(self, action: str, metadata: Optional[Dict] = None) -> bool:
        """
        Send a control command to the robot (pause, resume, restart, stop, status).
        
        Args:
            action: Command action (pause|resume|restart|stop|status)
            metadata: Optional metadata
            
        Returns:
            True if sent successfully, False otherwise
        """
        if not self.connected or not self.loop:
            logger.warning(f"Robot not connected, cannot send command: {action}")
            return False

        payload = {"action": action}
        if metadata:
            payload["metadata"] = metadata
        message = json.dumps(payload)

        # Schedule the send in the event loop
        future = asyncio.run_coroutine_threadsafe(
            self._send_message(message), self.loop
        )

        try:
            future.result(timeout=2)
            logger.debug(f"Command sent: {action}")
            return True
        except Exception as e:
            logger.error(f"Failed to send command: {e}")
            return False

    async def _send_message(self, message: str):
        """Send a message via WebSocket."""
        if self.websocket and self.connected:
            try:
                await self.websocket.send(message)
            except Exception as e:
                logger.error(f"Failed to send WebSocket message: {e}")
                self.connected = False

    def _handle_robot_message(self, message: str):
        """Handle incoming messages from the robot."""
        try:
            data = json.loads(message)
            logger.debug(f"Robot message: {data}")
            self._notify_status("message", data)
        except json.JSONDecodeError as e:
            logger.error(f"Invalid JSON from robot: {e}")

    def _notify_status(self, status: str, data: Dict):
        """Notify via callback if registered."""
        if self.status_callback:
            try:
                self.status_callback(status, data)
            except Exception as e:
                logger.error(f"Error in status callback: {e}")

    def set_status_callback(self, callback: Callable):
        """Register a callback for status updates."""
        self.status_callback = callback

    def stop(self):
        """Stop the WebSocket connection."""
        if self.loop:
            asyncio.run_coroutine_threadsafe(self._close(), self.loop)
        if self.thread:
            self.thread.join(timeout=2)
        logger.info("Robot WebSocket client stopped")

    async def _close(self):
        """Close the WebSocket connection."""
        if self.websocket:
            await self.websocket.close()
        self.connected = False
