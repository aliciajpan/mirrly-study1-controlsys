# app.py
from flask import Flask, render_template, request, jsonify
from pathlib import Path
from datetime import datetime
import threading, time, json
from typing import List, Dict, Any
import yaml
import json



SCENARIO = {"status": "idle", "step_index": -1, "error": None, "started_at": None}
_SCEN_THREAD = None
_SCEN_STOP = threading.Event()
_SCEN_PAUSE = threading.Event()

def _post_control(payload: dict):
    # Reuse the same handler as /api/control without a client round-trip
    with app.test_request_context(json=payload):
        resp = control_api()                  # Flask Response
    # we don't need the body; swallow errors quietly
    try:
        return resp.get_json()
    except Exception:
        return None


def _wait_seconds(sec: float):
    t0 = time.time()
    while time.time() - t0 < sec:
      if _SCEN_STOP.is_set(): return False
      while _SCEN_PAUSE.is_set():
        if _SCEN_STOP.is_set(): return False
        time.sleep(0.05)
      time.sleep(0.02)
    return True

def _wait_until(event: str) -> bool:
    # We rely on /api/event from screen.js setting _LAST_EVENT
    # Poll it lightly.
    while True:
        if _SCEN_STOP.is_set(): return False
        while _SCEN_PAUSE.is_set():
            if _SCEN_STOP.is_set(): return False
            time.sleep(0.05)
        last = app.config.get("_LAST_EVENT")
        if event == "media_end" and last and last.get("event") == "ended" and last.get("track") == "primary":
            return True
        if event == "overlay_end" and last and last.get("event") == "ended" and last.get("track") == "overlay":
            return True
        time.sleep(0.05)


def _run_scenario(steps: List[Dict[str, Any]]):
    SCENARIO.update({"status":"running","step_index":0,"error":None,"started_at": time.time()})
    _SCEN_STOP.clear(); _SCEN_PAUSE.clear()
    try:
        for idx, st in enumerate(steps):
            # handle stop early
            if _SCEN_STOP.is_set():
                SCENARIO["status"] = "stopped"
                SCENARIO["current"] = None
                return

            SCENARIO["step_index"] = idx
            act = st.get("action")
            args = {k: v for k, v in st.items() if k != "action"}

            SCENARIO["current"] = {"index": idx, "action": act, "args": args}
            SCENARIO["step_started_at"] = time.time()
            
            if act in {"load","play","pause","seek","volume",
                       "overlay_audio_load","overlay_audio_play","overlay_audio_pause",
                       "overlay_audio_seek","overlay_audio_volume","overlay_audio_clear"}:
                _post_control({ "action": act, **{k:v for k,v in st.items() if k != "action"} })

            elif act == "show_image":
                _post_control({ "action": "load", "type": "image", "url": st["url"] })

            elif act == "play_video":
                _post_control({ "action": "load", "type": "video", "url": st["url"] })
                _post_control({ "action": "seek", "position": float(st.get("position",0.0)) })
                _post_control({ "action": "play" })

            elif act == "play_audio_over_image":
                # assumes an image is already loaded
                _post_control({ "action": "overlay_audio_load", "url": st["url"] })
                _post_control({ "action": "overlay_audio_seek", "position": float(st.get("position",0.0)) })
                _post_control({ "action": "overlay_audio_play" })

            elif act == "wait":
                if "seconds" in st:
                    if not _wait_seconds(float(st["seconds"])): break
                elif "until" in st:
                    if not _wait_until(st["until"]): break

            else:
                raise ValueError(f"Unknown scenario action: {act}")

            # cooperative stop/pause checks between steps
            if _SCEN_STOP.is_set(): break
            while _SCEN_PAUSE.is_set():
                if _SCEN_STOP.is_set(): break
                time.sleep(0.05)

        SCENARIO["status"] = "completed"
        SCENARIO["current"] = None
        SCENARIO["step_started_at"] = None
    except Exception as e:
        SCENARIO.update({"status":"error","error":str(e)})
    finally:
        pass
    
def _pause_all_tracks_and_mark():
    if MEDIA_STATE.get("isPlaying"):          _post_control({"action":"pause"}); SCENARIO["media_autoresume"]=True
    else:                                     SCENARIO["media_autoresume"]=False
    if MEDIA_STATE.get("overlayAudioPlaying"): _post_control({"action":"overlay_audio_pause"}); SCENARIO["overlay_autoresume"]=True
    else:                                     SCENARIO["overlay_autoresume"]=False



def _resume_marked_tracks():
    if SCENARIO.get("media_autoresume"):       _post_control({"action":"play"}); SCENARIO["media_autoresume"]=False
    if SCENARIO.get("overlay_autoresume"):     _post_control({"action":"overlay_audio_play"}); SCENARIO["overlay_autoresume"]=False



app = Flask(__name__, static_url_path="/static", static_folder="static", template_folder="templates")


# --- Simple in-memory media state ---
MEDIA_STATE = {
    "url": "",
    "type": "",               # "video" | "audio" | "image"
    "isPlaying": False,
    "position": 0.0,
    "position_nonce": 0,

    # Screen progress (reported by /api/progress)
    "duration": 0.0,
    "currentTime": 0.0,

    # Master volume for primary media (video/audio)
    "volume": 1.0,

    # --- NEW: overlay audio when showing an image ---
    "overlayAudioUrl": "",
    "overlayAudioPlaying": False,
    "overlayAudioPosition": 0.0,
    "overlayAudioNonce": 0,
    "overlayAudioVolume": 1.0,

    "current": None,          # {"index": int, "action": str, "args": {...}}
    "step_started_at": None,  # epoch seconds when the current step began
    
    "media_autoresume": False,
    "overlay_autoresume": False,
    
    "lastChange": None,
    
    # NEW: remember last steps so reset can restart the same scenario
    "last_steps": None,
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

@app.route("/api/event", methods=["POST"])
def event_api():
    # Example body: {"event":"ended", "track":"primary|overlay", "at": 12.34}
    data = request.get_json(force=True) or {}
    # You can log or store last event if you want the runner to read it
    app.config["_LAST_EVENT"] = data
    return jsonify(ok=True)

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

    if action == "overlay_audio_load":
        MEDIA_STATE["overlayAudioUrl"] = data.get("url", "")
        MEDIA_STATE["overlayAudioPosition"] = 0.0
        MEDIA_STATE["overlayAudioPlaying"] = False
        MEDIA_STATE["overlayAudioNonce"] += 1
        _touch()
        return jsonify(ok=True, state=MEDIA_STATE)

    if action == "overlay_audio_play":
        MEDIA_STATE["overlayAudioPlaying"] = True
        _touch()
        return jsonify(ok=True, state=MEDIA_STATE)

    if action == "overlay_audio_pause":
        MEDIA_STATE["overlayAudioPlaying"] = False
        _touch()
        return jsonify(ok=True, state=MEDIA_STATE)

    if action == "overlay_audio_seek":
        MEDIA_STATE["overlayAudioPosition"] = max(0.0, float(data.get("position", 0.0)))
        MEDIA_STATE["overlayAudioNonce"] += 1
        _touch()
        return jsonify(ok=True, state=MEDIA_STATE)

    if action == "overlay_audio_volume":
        v = float(data.get("volume", 1.0))
        MEDIA_STATE["overlayAudioVolume"] = max(0.0, min(1.0, v))
        _touch()
        return jsonify(ok=True, state=MEDIA_STATE)

    if action == "overlay_audio_clear":
        MEDIA_STATE["overlayAudioUrl"] = ""
        MEDIA_STATE["overlayAudioPlaying"] = False
        MEDIA_STATE["overlayAudioPosition"] = 0.0
        MEDIA_STATE["overlayAudioNonce"] += 1
        _touch()
        return jsonify(ok=True, state=MEDIA_STATE)


    return jsonify(ok=False, error="unknown action"), 400


@app.route("/api/scenario/run", methods=["POST"])
def scenario_run():
    global _SCEN_THREAD
    data = request.get_json(force=True) or {}
    steps = data.get("steps") or []
    if not isinstance(steps, list) or not steps:
        return jsonify(ok=False, error="No steps"), 400
    if _SCEN_THREAD and _SCEN_THREAD.is_alive():
        return jsonify(ok=False, error="Scenario already running"), 409

    # save for reset
    SCENARIO["last_steps"] = steps

    # clean state
    SCENARIO["status"] = "running"
    SCENARIO["error"] = None
    SCENARIO["step_index"] = -1
    SCENARIO["current"] = None
    SCENARIO["step_started_at"] = None
    SCENARIO["media_autoresume"] = False
    SCENARIO["overlay_autoresume"] = False

    _SCEN_STOP.clear()
    _SCEN_PAUSE.clear()
    _SCEN_THREAD = threading.Thread(target=_run_scenario, args=(steps,), daemon=True)
    _SCEN_THREAD.start()
    return jsonify(ok=True, status="started")


@app.route("/api/scenario/runfile", methods=["POST"])
def scenario_runfile():
    # Body: {"path": "scenarios/lesson1.yaml"}
    path = Path((request.get_json() or {}).get("path",""))
    if not path.exists():
        return jsonify(ok=False, error="file not found"), 404
    if path.suffix.lower() in {".yaml",".yml"}:
        steps = yaml.safe_load(path.read_text()).get("steps",[])
    else:
        steps = json.loads(path.read_text()).get("steps",[])
    with app.test_request_context(json={"steps": steps}):
        return scenario_run()
    
@app.route("/api/scenario/runtext", methods=["POST"])
def scenario_runtext():
    """
    Body: {"format":"yaml"|"json", "text":"<raw text>"}
    Parses into {"steps":[...]} and dispatches to /api/scenario/run.
    """
    data = request.get_json(force=True) or {}
    fmt  = (data.get("format") or "json").lower()
    text = data.get("text") or ""
    try:
        if fmt == "yaml":
            if yaml is None:
                return jsonify(ok=False, error="PyYAML not installed"), 400
            obj = yaml.safe_load(text) or {}
        else:
            obj = json.loads(text) if text.strip() else {}
    except Exception as e:
        return jsonify(ok=False, error=f"parse error: {e}"), 400

    steps = obj.get("steps")
    if not isinstance(steps, list) or not steps:
        return jsonify(ok=False, error="No 'steps' found in scenario"), 400

    # Reuse the existing scenario_run path
    with app.test_request_context(json={"steps": steps}):
        return scenario_run()

@app.route("/api/scenario/status", methods=["GET"])
def scenario_status():
    return jsonify(dict(SCENARIO))

@app.route("/api/scenario/pause", methods=["POST"])
def scenario_pause():
    _SCEN_PAUSE.set()
    SCENARIO["status"] = "paused"
    _pause_all_tracks_and_mark()
    return jsonify(ok=True, status="paused")

@app.route("/api/scenario/resume", methods=["POST"])
def scenario_resume():
    _SCEN_PAUSE.clear()
    SCENARIO["status"] = "running"
    _resume_marked_tracks()
    return jsonify(ok=True, status="running")


@app.route("/api/scenario/stop", methods=["POST"])
def scenario_stop():
    _SCEN_STOP.set()
    _pause_all_tracks_and_mark()
    # no autoresume after a stop
    SCENARIO["media_autoresume"] = False
    SCENARIO["overlay_autoresume"] = False
    SCENARIO["status"] = "stopped"
    return jsonify(ok=True, status="stopped")

@app.route("/api/scenario/reset", methods=["POST"])
def scenario_reset():
    steps = SCENARIO.get("last_steps")
    if not steps:
        return jsonify(ok=False, error="No previous scenario to reset"), 400
    # hard stop current
    _SCEN_STOP.set()
    _pause_all_tracks_and_mark()
    SCENARIO["media_autoresume"] = False
    SCENARIO["overlay_autoresume"] = False
    # immediately restart
    _SCEN_STOP.clear()
    _SCEN_PAUSE.clear()
    SCENARIO["status"] = "running"
    SCENARIO["error"] = None
    SCENARIO["step_index"] = -1
    SCENARIO["current"] = None
    SCENARIO["step_started_at"] = None
    threading.Thread(target=_run_scenario, args=(steps,), daemon=True).start()
    return jsonify(ok=True, status="restarted")


if __name__ == "__main__":
    # For local testing
    app.run(host="0.0.0.0", port=5000, debug=True)
