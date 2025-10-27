import os
import time
from flask import Flask, render_template, request, jsonify
from flask_socketio import SocketIO, emit
from media_controller import SystemVLCController, BrowserBroadcaster, DualController

USE_VLC = os.environ.get("USE_VLC", "0") == "1"

app = Flask(__name__)
app.config["SECRET_KEY"] = os.environ.get("SECRET_KEY", "dev-secret")

# Socket.IO with eventlet
socketio = SocketIO(app, async_mode="eventlet", cors_allowed_origins="*")

# Controllers
browser = BrowserBroadcaster(socketio)
vlc_controller = SystemVLCController() if USE_VLC else None
ctrl = DualController(browser, vlc_controller)

# --------- Web UI ----------
@app.route("/")
def index():
    # /?media=<url>&type=video|audio to pre-load
    media_url = request.args.get("media", "")
    media_type = request.args.get("type", "video")
    return render_template("index.html", media_url=media_url, media_type=media_type)

# --------- Simple REST endpoints (optional) ----------
@app.post("/api/load")
def api_load():
    data = request.get_json(force=True)
    url = data["url"]
    media_type = data.get("type", "video")
    autoplay = bool(data.get("autoplay", True))
    ctrl.load(url, media_type, autoplay)
    return jsonify({"ok": True})

@app.post("/api/play")
def api_play():
    ctrl.play()
    return jsonify({"ok": True})

@app.post("/api/pause")
def api_pause():
    ctrl.pause()
    return jsonify({"ok": True})

@app.post("/api/seek")
def api_seek():
    data = request.get_json(force=True)
    t = float(data["time"])
    ctrl.seek(t)
    return jsonify({"ok": True})

@app.get("/api/status")
def api_status():
    return jsonify(ctrl.status())

# --------- WebSocket namespace for real-time control ----------
@socketio.on("connect", namespace="/ws")
def on_connect():
    emit("server:hello", {"msg": "connected", "ts": time.time()})

@socketio.on("media:load", namespace="/ws")
def ws_load(data):
    # Any client (robot controller or browser) can ask to load media
    url = data["url"]
    media_type = data.get("mediaType", "video")
    autoplay = bool(data.get("autoplay", True))
    print(url)
    ctrl.load(url, media_type, autoplay)

@socketio.on("media:play", namespace="/ws")
def ws_play(_):
    ctrl.play()

@socketio.on("media:pause", namespace="/ws")
def ws_pause(_):
    ctrl.pause()

@socketio.on("media:seek", namespace="/ws")
def ws_seek(data):
    t = float(data["time"])
    ctrl.seek(t)

@socketio.on("sync:beacon", namespace="/ws")
def ws_beacon(data):
    # A controller can push a sync tick; server rebroadcasts (and could timestamp)
    data = dict(data or {})
    data["server_ts"] = time.time()
    socketio.emit("sync:beacon", data, namespace="/ws", broadcast=True)

if __name__ == "__main__":
    # Run: USE_VLC=1 python app.py   # to enable system VLC mirroring
    # Then open http://localhost:5000/
    socketio.run(app, host="0.0.0.0", port=int(os.environ.get("PORT", 5000)))