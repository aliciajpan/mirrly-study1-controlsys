import os
import json
import logging
import random
from typing import List, Dict, Any, Optional
from flask import Flask, render_template, send_from_directory, jsonify, request
from dotenv import load_dotenv

import config

import csv
import datetime
import time

from robot_client import RobotWebSocketClient
from gesture_mapping import GestureMapper

# Load environment variables from .env file
load_dotenv()

APP_TITLE = "Mirrly HRI Study"
MEDIA_ROOT = os.path.join(os.path.dirname(__file__), "static", "media")
PLAYLIST_PATH = os.path.join(os.path.dirname(__file__), "playlist.json")
GAMECONFIG_PATH = os.path.join(os.path.dirname(__file__), "game_config.json")

SESSIONLOG_DIR = os.path.join(os.path.dirname(__file__), "logs")
os.makedirs(SESSIONLOG_DIR, exist_ok=True)

logger = logging.getLogger(__name__)

app = Flask(__name__, static_folder="static", template_folder="templates")

# Shared runtime state for display page
STATE: Dict[str, Any] = {
    "index": 0,
    "paused": False,
    "selection": None,  # for audio-select chosen option {src,label}
    "robot_status": "disconnected",
    "robot_message": None,
    "game_history": [],
    "PID": "P_DEFAULT", # for session logs
    "curr_round": 1,
    "curr_attempts": 0,
    "max_attempts": 3,
    "round_start_time": 0.0
}

# Initialize robot WebSocket client
# ROBOT_WS_URL = os.environ.get("ROBOT_WS_URL", "ws://127.0.0.1:8000")
# ROBOT_WS_ENABLED = os.environ.get("ROBOT_WS_ENABLED", "true").lower() == "true"
# ROBOT_WS_DEBUG = os.environ.get("ROBOT_WS_DEBUG", "false").lower() == "true"

# pull from config.py instead...
ROBOT_WS_URL = config.ROBOT_WS_URL
ROBOT_WS_ENABLED = config.ROBOT_WS_ENABLED
ROBOT_WS_DEBUG = config.ROBOT_WS_DEBUG

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
                    "src": "media/video/amblyopia.mp4",
                    "robot": {"onStart": "present_start", "onEnd": "present_end"}
                }
            ]
        }
    with open(PLAYLIST_PATH, "r", encoding="utf-8") as f:
        return json.load(f)
    
def load_gameconfig() -> Dict[str, Any]:
    if not os.path.exists(GAMECONFIG_PATH):
        return { # just return answer key if file not found
            "answer_key": {
                "round1": "LS",
                "round2": "RS",
                "round3": "LS",
                "round4": "LS",
                "round5": "RS"
            }
        }
    with open(GAMECONFIG_PATH, "r", encoding="utf-8") as f:
        return json.load(f)

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

# Static media passthrough (optional, Flask can serve static automatically)
@app.route('/media/<path:filename>')
def media(filename):
    return send_from_directory(MEDIA_ROOT, filename)

def _apply_robot_gesture(new_index: int, playlist: Dict[str, Any]):
    """Trigger robot gesture for the new section."""
    try:
        # First stop any currently running gesture
        if robot_client:
            robot_client.send_command('stop')
            logger.info("Sent stop command before starting new gesture")
        
        # Then start the new gesture
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

        gesture_just_triggered = False

        # Update index
        if 'index' in data:
            idx = int(data['index'])
            idx = max(0, min(idx, len(playlist['sections']) - 1))
            if idx != STATE['index']:
                STATE['index'] = idx
                STATE['selection'] = None  # reset selection when changing section
                _apply_robot_gesture(idx, playlist)
                gesture_just_triggered = True

        # Commands
        cmd = data.get('command')
        if cmd == 'pause':
            STATE['paused'] = True
            # Send stop command to halt current gesture
            if robot_client:
                robot_client.send_command('stop')
                logger.info("Sent stop command on pause")

        elif cmd == 'play':
            STATE['paused'] = False

            if not gesture_just_triggered:
                # Restart current section's gesture from beginning
                current_section = playlist['sections'][STATE['index']]
                gesture = GestureMapper.get_gesture(current_section)
                if gesture and robot_client:
                    robot_client.send_command('stop')  # Stop first
                    metadata = GestureMapper.get_metadata(current_section)
                    robot_client.send_gesture(gesture, metadata)  # Then restart
                    logger.info(f"Restarted gesture: {gesture} for section {current_section.get('id')}")

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
                    # Stop current gesture before starting reaction gesture
                    robot_client.send_command('stop')
                    metadata = {
                        'section_id': playlist['sections'][STATE['index']].get('id'),
                        'reaction_label': sel.get('label'),
                        'type': 'reaction'
                    }
                    robot_client.send_gesture(gesture, metadata) # Uncomment to enable reaction gestures
                    logger.info(f"Reaction gesture triggered: {gesture} for option {sel.get('label')}")
    return jsonify({
        'index': STATE['index'],
        'paused': STATE['paused'],
        'selection': STATE['selection'],
        'total': len(playlist['sections']),
        'robot_status': STATE['robot_status'],
        'robot_message': STATE['robot_message'],
    })

@app.route('/api/submit_answer', methods=['POST'])
def submit_answer():
    global STATE
    data = request.get_json(force=True) if request.data else {} # force ignores mimetype
    answer_side = data.get('side') # "LS" or "RS"
    is_timeout = (answer_side == "TIMEOUT")

    now = time.time()
    time_elapsed = round(now - STATE.get("round_start_timestamp", now), 2)
    
    # find where currently in playlist
    playlist = load_playlist()
    current_section = playlist["sections"][STATE["index"]]
    section_id = current_section.get("id", "")
    # ^ would look smth like s9_round2_countdown
    
    # get game round num from ID string
    game_round = None
    for i in range (1,6):
        if (f"round{i}" in section_id.replace("_", "") or f"round_{i}" in section_id):
            game_round = str(i)
            break

    if not game_round:
        return jsonify({"error": "Didn't identify a numbered game round"}), 400
    
    ##### try:
    config_data = load_gameconfig()
    round_key = f"round{game_round}"
    correct_answer = config_data.get("answer_key", {}).get(round_key)

    is_correct = (answer_side == correct_answer)
    STATE["curr_attempts"] += 1
    attempts = STATE["curr_attempts"]

    # checking if should end round
    round_ended = is_correct or (attempts >= STATE["max_attempts"])

    log_round_event({
        "timestamp": datetime.datetime.now().isoformat(),
        "PID": STATE["participant_id"],
        "round": game_round,
        "attempt_num": attempts,
        "user_answer": answer_side,
        "is_correct": is_correct,
        "is_timeout": is_timeout,
        "reaction_time_s": time_elapsed,
        "final_result": "PASS" if is_correct else ("FAIL" if round_ended else "RETRY")
    })

    if not round_ended:
        # TODO: TTS MEDIA
        # retry_tts = "media/audio/response/_timeout_retry.mp3" if is_timeout else "media/audio/response/_wrong_try_again.mp3"
        
        STATE["selection"] = {"src": retry_tts, "label": "retry"}
        return jsonify({
            "action": "retry",
            "attempts": attempts,
            "index": STATE["index"],
            "selection": STATE["selection"]
        })

    STATE["curr_attempts"] = 0
    STATE["game_history"].append(1 if is_correct else 0)

    ########## from here, reconciliate OLD VERSION #############
    ## NEW PROPOSAL ##
    # # Reset attempts for next round
    # STATE["current_attempts"] = 0
    # STATE["game_history"].append(1 if is_correct else 0)

    # # Pick dynamic reaction audio
    # buckets = config_data.get("response_buckets", {})
    # if is_correct:
    #     chosen_audio = random.choice(buckets.get("correct", [{"src": "media/audio/response/_expert.mov"}]))
    # else:
    #     chosen_audio = random.choice(buckets.get("wrong", [{"src": "media/audio/response/_confused.mp3"}]))

    # dynamic_gesture = "show_LS" if correct_answer == "LS" else "show_RS"
    # STATE["selection"] = {
    #     "src": chosen_audio.get("src", ""),
    #     "label": 1 if is_correct else 0,
    #     "gesture": dynamic_gesture
    # }

    # # Advance to reaction / answer
    # new_i = min(len(playlist['sections']) - 1, STATE['index'] + 1)
    # STATE['index'] = new_i

    # return jsonify({
    #     "action": "advance",
    #     "index": STATE["index"],
    #     "selection": STATE["selection"],
    #     "robot_status": STATE["robot_status"]
    # })

   # except Exception:
        # fallback dictionary matching load_gameconfig logic
        #config_data = {
           #"answer_key": {"round1": "LS", "round2": "RS", "round3": "LS", "round4": "LS", "round5": "RS"},
            #"response_buckets": {"correct": [], "correct_again": [], "correct_after_wrong": [], "wrong": [], "wrong_again": []}
        #}

    # check correctness
    round_key = f"round{game_round}"
    correct_answer = config_data.get("answer_key", {}).get(round_key)
    is_correct = (answer_side == correct_answer)
    result_tag = 1 if is_correct else 0 # 1 means correct

    history = STATE.get("game_history", [])
    buckets = config_data.get("response_buckets", {})
    chosen_audio = {"src": ""} # fallback audio structure

    if is_correct:
        if len(history) > 0 and history[-1] == 1 and buckets.get("correct_again"):
            chosen_audio = random.choice(buckets["correct_again"])
        elif len(history) > 0 and history[-1] == 0 and buckets.get("correct_after_wrong"):
            chosen_audio = random.choice(buckets["correct_after_wrong"])
        elif buckets.get("correct"):
            chosen_audio = random.choice(buckets["correct"])
    else:
        if len(history) > 0 and history[-1] == 0 and buckets.get("wrong_again"):
            chosen_audio = random.choice(buckets["wrong_again"])
        elif buckets.get("wrong"):
            chosen_audio = random.choice(buckets["wrong"])
    # note possible case where history[idx] returns "" or None, so explicit check 1 or 0

    if correct_answer == "LS":
        dynamic_gesture = "show_LS"
    elif correct_answer == "RS":
        dynamic_gesture = "show_RS"
    else:
        dynamic_gesture = None  # fallback

    STATE["game_history"].append(result_tag)
    STATE["selection"] = {
        "src": chosen_audio.get("src", ""),
        "label": result_tag,
        "gesture": dynamic_gesture  # sends 'show_LS' or 'show_RS' to robot repo
    }

    if robot_client and dynamic_gesture: # if websocket live/connected
        robot_client.send_command('stop')
        metadata = {'section_id': section_id, 'round': game_round, 'type': 'automated_touch'}
        robot_client.send_gesture(dynamic_gesture, metadata)

    # go to next section (without overshooting)
    new_i = min(len(playlist['sections']) - 1, STATE['index'] + 1)
    STATE['index'] = new_i

    return jsonify({
        'index': STATE['index'],
        'paused': STATE['paused'],
        'selection': STATE['selection'],
        'total': len(playlist['sections']),
        'robot_status': STATE['robot_status'],
        'robot_message': STATE['robot_message'],
    })

def log_round_event(event_data: dict):
    pid = STATE.get("PID", "anonymous")
    filepath = os.path.join(SESSIONLOG_DIR, f"{pid}_session_log.csv")
    file_exists = os.path.exists(filepath)

    # open file in "a"ppend mode, no blank row
    with open(filepath, "a", newline="", encoding="utf-8") as file:
        writer = csv.DictWriter(file, fieldnames=[
            "Timestamp", "PID", "Round", "Attempt #", 
            "User Ans", "Correct?", "Timed Out?", "Rxn Time (s)", "Final Result"
        ])
        if not file_exists:
            writer.writeheader()
        writer.writerow(event_data)

@app.route('/api/session', methods=['POST'])
def set_session():
    data = request.get_json(force=True) if request.data else {}
    pid = data.get("PID", "").strip()
    if pid:
        STATE["PID"] = pid
        STATE["game_history"] = [] # resetting for new session
        STATE["curr_attempts"] = 0
    return jsonify({"PID": STATE["PID"]})

if __name__ == "__main__":
    init_robot_client()
    port = int(os.environ.get("PORT", "5001"))
    app.run(host="0.0.0.0", port=port, debug=True)