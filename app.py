import os
import json
from typing import List, Dict, Any, Optional
from flask import Flask, render_template, send_from_directory, jsonify, request
import requests

APP_TITLE = "Mirrly HRI Study"
MEDIA_ROOT = os.path.join(os.path.dirname(__file__), "static", "media")
PLAYLIST_PATH = os.path.join(os.path.dirname(__file__), "playlist.json")

app = Flask(__name__, static_folder="static", template_folder="templates")

# Shared runtime state for display page
STATE: Dict[str, Any] = {
    "index": 0,
    "paused": False,
    "selection": None  # for audio-select chosen option {src,label}
}


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


def _apply_robot_start(new_index: int, playlist: Dict[str, Any]):
    try:
        section = playlist["sections"][new_index]
        if section.get("robot", {}).get("onStart"):
            robot_request(section["robot"]["onStart"], {"id": section.get("id"), "type": section.get("type")})
    except Exception:
        pass


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
                _apply_robot_start(idx, playlist)
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
                _apply_robot_start(new_i, playlist)
        elif cmd == 'prev':
            new_i = max(0, STATE['index'] - 1)
            if new_i != STATE['index']:
                STATE['index'] = new_i
                STATE['selection'] = None
                _apply_robot_start(new_i, playlist)

        # Selection for audio-select
        if 'selection' in data:
            sel = data['selection']
            if isinstance(sel, dict) and 'src' in sel:
                STATE['selection'] = {'src': sel['src'], 'label': sel.get('label')}
    return jsonify({
        'index': STATE['index'],
        'paused': STATE['paused'],
        'selection': STATE['selection'],
        'total': len(playlist['sections'])
    })


if __name__ == "__main__":
    port = int(os.environ.get("PORT", "5000"))
    app.run(host="0.0.0.0", port=port, debug=True)