# app.py
from flask import Flask, render_template, request, jsonify
from pathlib import Path
from datetime import datetime

app = Flask(__name__, static_url_path="/static", static_folder="static", template_folder="templates")


# --- Simple in-memory media state ---
MEDIA_STATE = {
    "url": "",          # e.g., /static/media/demo.mp4 or http(s) URL
    "type": "",         # "video" | "audio" | "image"
    "isPlaying": False,
    "position": 0.0,    # seconds (screen will seek to this)
    "position_nonce": 0,   # <— NEW: increments when server wants screen to seek
    "lastChange": None, # iso timestamp for debugging
    "duration": 0.0,      # <— NEW: reported by /screen
    "currentTime": 0.0,   # <— NEW: reported by /screen
    "volume": 1.0
}

def _touch():
    MEDIA_STATE["lastChange"] = datetime.utcnow().isoformat()

# ---- OPTIONAL: robot hooks (stub) ----
def robot_pause():
    # TODO: call your robot endpoint or queue a pause command, e.g.:
    # requests.post("http://<robot host>:<port>/api/pause")
    pass

def robot_play():
    # TODO: call your robot endpoint or queue a resume command
    pass

def robot_seek(position_s: float):
    # TODO: if you synchronize robot timeline to media, handle here
    pass

# ----------------- Pages -----------------
@app.route("/")
def index():
    return render_template("index.html")  # optional landing page if you want

@app.route("/screen")
def screen():
    return render_template("screen.html")

@app.route("/control")
def control():
    return render_template("control.html")

# --------------- API (HTTP) ---------------
@app.route("/api/state", methods=["GET"])
def get_state():
    return jsonify(MEDIA_STATE)

@app.route("/api/progress", methods=["POST"])
def progress_api():
    """
    Body: { "currentTime": <float>, "duration": <float> }
    Screen calls this periodically so control UI can show live seek.
    """
    data = request.get_json(force=True) or {}
    try:
        MEDIA_STATE["currentTime"] = max(0.0, float(data.get("currentTime", 0.0)))
    except Exception:
        MEDIA_STATE["currentTime"] = 0.0
    try:
        d = float(data.get("duration", 0.0))
        MEDIA_STATE["duration"] = d if d == d and d != float("inf") else 0.0  # sanity
    except Exception:
        MEDIA_STATE["duration"] = 0.0
    return jsonify(ok=True)

@app.route("/api/control", methods=["POST"])
def control_api():
    """
    Accepts JSON like:
    {
      "action": "load" | "play" | "pause" | "seek" | "volume",
      "url": "/static/media/foo.mp4",   # for load
      "type": "video",                  # for load
      "position": 12.34,                # for seek (sec)
      "volume": 0.0..1.0                # for volume
    }
    """
    data = request.get_json(force=True) or {}
    action = data.get("action")

    if action == "load":
        MEDIA_STATE["url"] = data.get("url", "")
        MEDIA_STATE["type"] = data.get("type", "")
        MEDIA_STATE["position"] = 0.0
        MEDIA_STATE["isPlaying"] = False
        MEDIA_STATE["position_nonce"] += 1     # <— ask screen to seek to 0 once
        _touch()
        return jsonify(ok=True, state=MEDIA_STATE)

    if action == "play":
        MEDIA_STATE["isPlaying"] = True
        _touch()
        robot_play()
        return jsonify(ok=True, state=MEDIA_STATE)

    if action == "pause":
        MEDIA_STATE["isPlaying"] = False
        _touch()
        robot_pause()
        return jsonify(ok=True, state=MEDIA_STATE)

    if action == "seek":
        try:
            pos = float(data.get("position", 0.0))
        except Exception:
            pos = 0.0
        MEDIA_STATE["position"] = max(0.0, pos)
        MEDIA_STATE["position_nonce"] += 1     # <— NEW
        _touch()
        robot_seek(MEDIA_STATE["position"])
        return jsonify(ok=True, state=MEDIA_STATE)

    if action == "volume":
        try:
            vol = float(data.get("volume", 1.0))
        except Exception:
            vol = 1.0
        MEDIA_STATE["volume"] = max(0.0, min(1.0, vol))
        _touch()
        return jsonify(ok=True, state=MEDIA_STATE)

    return jsonify(ok=False, error="unknown action"), 400



if __name__ == "__main__":
    # For local testing
    app.run(host="0.0.0.0", port=5000, debug=True)
