"""
Configuration for Mirrly HRI Study runner.
Controls behavior for robot integration, error handling, and debug settings.
"""

import os
from dotenv import load_dotenv

load_dotenv()

# Robot WebSocket Configuration
ROBOT_WS_URL = os.environ.get("ROBOT_WS_URL", "ws://127.0.0.1:8000")
ROBOT_WS_ENABLED = os.environ.get("ROBOT_WS_ENABLED", "true").lower() == "true"
ROBOT_WS_DEBUG = os.environ.get("ROBOT_WS_DEBUG", "false").lower() == "true"

# Error Handling Configuration
# If True, errors in gesture triggering will be logged but won't block media playback
# If False, sections with gesture errors will be skipped
ROBOT_GRACEFUL_SKIP = os.environ.get("ROBOT_GRACEFUL_SKIP", "true").lower() == "true"

# Retry Configuration
ROBOT_MAX_RETRIES = int(os.environ.get("ROBOT_MAX_RETRIES", "3"))
ROBOT_RECONNECT_TIMEOUT = int(os.environ.get("ROBOT_RECONNECT_TIMEOUT", "5"))  # seconds

# Flask Server Configuration
PORT = int(os.environ.get("PORT", "5000"))
DEBUG = os.environ.get("DEBUG", "false").lower() == "true"

# Feature Flags
ENABLE_AUTO_ADVANCE = os.environ.get("ENABLE_AUTO_ADVANCE", "true").lower() == "true"
ENABLE_ROBOT_GESTURES = os.environ.get("ENABLE_ROBOT_GESTURES", "true").lower() == "true"

# Logging Configuration
LOG_LEVEL = os.environ.get("LOG_LEVEL", "INFO")
