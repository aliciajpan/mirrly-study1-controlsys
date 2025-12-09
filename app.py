import os
import json
import logging
from typing import List, Dict, Any, Optional
from flask import Flask, render_template, send_from_directory, jsonify, request
import requests
from dotenv import load_dotenv

from robot_client import RobotWebSocketClient
from gesture_mapping import GestureMapper

# Load environment variables from .env file
load_dotenv()

APP_TITLE = "Mirrly HRI Study"
MEDIA_ROOT = os.path.join(os.path.dirname(__file__), "static", "media")
PLAYLIST_PATH = os.path.join(os.path.dirname(__file__), "playlist.json")

logger = logging.getLogger(__name__)

app = Flask(__name__, static_folder="static", template_folder="templates")

# Shared runtime state for display page
STATE: Dict[str, Any] = {
    "index": 0,
    "paused": False,
    "selection": None,  # for audio-select chosen option {src,label}
    "robot_status": "disconnected",
    "robot_message": None,
}

# Initialize robot WebSocket client
ROBOT_WS_URL = os.environ.get("ROBOT_WS_URL", "ws://127.0.0.1:8000")
ROBOT_WS_ENABLED = os.environ.get("ROBOT_WS_ENABLED", "true").lower() == "true"
ROBOT_WS_DEBUG = os.environ.get("ROBOT_WS_DEBUG", "false").lower() == "true"

robot_client: Optional[RobotWebSocketClient] = None

def init_robot_client():
    """Initialize and start the robot WebSocket client."""
    global robot_client
    if ROBOT_WS_ENABLED and not robot_client:
        robot_client = RobotWebSocketClient(ROBOT_WS_URL, debug=ROBOT_WS_DEBUG)
        robot_client.set_status_callback(on_robot_status)
        robot_client.start()

def on_robot_status(status: str, data: Dict[str, Any]):
    """Callback for robot status updates."""
    # Map internal status to UI-friendly status
    if status == "connected":
        STATE["robot_status"] = "connected"
        STATE["robot_message"] = None
    elif status == "disconnected":
        STATE["robot_status"] = "disconnected"
        STATE["robot_message"] = data
    elif status == "message":
        # Check if it's an error message from robot
        if data.get("status") == "error":
            STATE["robot_message"] = data
        else:
            STATE["robot_message"] = None
    logger.debug(f"Robot status: {status} - {data}")


def load_playlist() -> Dict[str, Any]:
    if not os.path.exists(PLAYLIST_PATH):
        # Default minimal playlist if none exists
        return {
            "title": APP_TITLE,
            "sections": [
                {
                    "id": "intro_video",
                    "type": "video",
                    "title": "Presentation: Amblyopia",
                    "src": "media/video/intro.mp4",
                    "robot": {"onStart": "present_start", "onEnd": "present_end"}
                }
            ]
        }
    with open(PLAYLIST_PATH, "r", encoding="utf-8") as f:
        return json.load(f)


def robot_request(action: str, payload: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    """
    Placeholder for robot webserver request.
    Configure host/port via env: ROBOT_HOST, ROBOT_PORT.
    """
    host = os.environ.get("ROBOT_HOST", "127.0.0.1")
    port = int(os.environ.get("ROBOT_PORT", "8080"))
    url = f"http://{host}:{port}/action/{action}"
    try:
        resp = requests.post(url, json=payload or {}, timeout=2.0)
        return {"ok": resp.ok, "status": resp.status_code}
    except Exception as e:
        return {"ok": False, "error": str(e)}


@app.route("/")
def controller():
    # Control interface
    return render_template("index.html", app_title=APP_TITLE)

@app.route("/display")
def display():
    # Fullscreen participant display
    return render_template("display.html")


@app.route("/api/playlist")
def api_playlist():
    return jsonify(load_playlist())


@app.route("/api/robot", methods=["POST"]) 
def api_robot():
    data = request.get_json(force=True) if request.data else {}
    action = data.get("action", "noop")
    payload = data.get("payload")
    result = robot_request(action, payload)
    return jsonify(result)


# Static media passthrough (optional, Flask can serve static automatically)
@app.route('/media/<path:filename>')
def media(filename):
    return send_from_directory(MEDIA_ROOT, filename)


def _apply_robot_gesture(new_index: int, playlist: Dict[str, Any]):
    """Trigger robot gesture for the new section."""
    try:
        section = playlist["sections"][new_index]
        gesture = GestureMapper.get_gesture(section)
        if gesture and robot_client:
            metadata = GestureMapper.get_metadata(section)
            robot_client.send_gesture(gesture, metadata)
            logger.info(f"Gesture triggered: {gesture} for section {section.get('id')}")
    except Exception as e:
        logger.error(f"Error triggering robot gesture: {e}")


@app.route('/api/state', methods=['GET', 'POST'])
def api_state():
    playlist = load_playlist()
    if request.method == 'POST':
        data = request.get_json(force=True) if request.data else {}
        # Update index
        if 'index' in data:
            idx = int(data['index'])
            idx = max(0, min(idx, len(playlist['sections']) - 1))
            if idx != STATE['index']:
                STATE['index'] = idx
                STATE['selection'] = None  # reset selection when changing section
                _apply_robot_gesture(idx, playlist)
        # Commands
        cmd = data.get('command')
        if cmd == 'pause':
            STATE['paused'] = True
        elif cmd == 'play':
            STATE['paused'] = False
        elif cmd == 'next':
            new_i = min(len(playlist['sections']) - 1, STATE['index'] + 1)
            if new_i != STATE['index']:
                STATE['index'] = new_i
                STATE['selection'] = None
                _apply_robot_gesture(new_i, playlist)
        elif cmd == 'prev':
            new_i = max(0, STATE['index'] - 1)
            if new_i != STATE['index']:
                STATE['index'] = new_i
                STATE['selection'] = None
                _apply_robot_gesture(new_i, playlist)

        # Selection for audio-select
        if 'selection' in data:
            sel = data['selection']
            if isinstance(sel, dict) and 'src' in sel:
                STATE['selection'] = {'src': sel['src'], 'label': sel.get('label')}
                # Trigger gesture if specified in the selected option
                gesture = sel.get('gesture')
                if gesture and robot_client:
                    metadata = {
                        'section_id': playlist['sections'][STATE['index']].get('id'),
                        'reaction_label': sel.get('label'),
                        'type': 'reaction'
                    }
                    robot_client.send_gesture(gesture, metadata)
                    logger.info(f"Reaction gesture triggered: {gesture} for option {sel.get('label')}")
    return jsonify({
        'index': STATE['index'],
        'paused': STATE['paused'],
        'selection': STATE['selection'],
        'total': len(playlist['sections']),
        'robot_status': STATE['robot_status'],
        'robot_message': STATE['robot_message'],
    })


if __name__ == "__main__":
    init_robot_client()
    port = int(os.environ.get("PORT", "5000"))
    app.run(host="0.0.0.0", port=port, debug=True)