# AI Coding Agent Instructions

Concise, project-specific guidance so an AI assistant can contribute productively within minutes.

## Purpose
Dual-screen HRI experiment runner: Flask backend + two polling frontends (controller and participant display) synchronized via `/api/state`. Media playlist drives flow; WebSocket-connected robot for gesture control.

## Runtime Architecture
- `app.py` single Flask app; no blueprints, global mutable `STATE` dict holds current section index, paused flag, optional audio selection, and robot status.
- Frontend synchronization: both `controller.js` and `display.js` poll `/api/state` every ~1s (pull-based).
- Robot integration: separate persistent WebSocket connection via `RobotWebSocketClient` in `robot_client.py` (runs in background thread).
- Controller mutates state via POST `/api/state` (index changes, commands, selection). Display is read-only except initial auto-pause.
- Auto-advance occurs ONLY on the display side after media ends (video/audio/image+audio or selected response audio) by POSTing `{command:"next"}`.

## Key Files
- `playlist.json`: Source of truth for ordered `sections`. Backend re-reads on every playlist/API call (no caching).
- `app.py`: Defines routes `/`, `/display`, `/api/playlist`, `/api/state`, static media passthrough.
- `robot_client.py`: Async WebSocket client (threaded); sends gesture commands and manages connection state.
- `gesture_mapping.py`: Maps section `gesture` field (or type-based default) to robot gesture names.
- `static/js/controller.js`: Controller UI; scrolls active section into view; toggles pause/play; builds selection buttons.
- `static/js/display.js`: Participant view; renders media fullscreen; manages auto-advance and user interaction overlay.

## Playlist & Media Conventions
- Media paths in `playlist.json` are relative to `static/` root WITHOUT leading `static/` (e.g. `"media/audio/intro.m4a"`). Frontends prepend `/static/`.
- Section object minimal fields: `id`, `type`, optional `gesture` (string).
- Optional `gesture` field maps to robot gesture name; extracted by `GestureMapper.get_gesture()`.
- Keep filenames free of problematic spaces for reliability; current code tolerates spaces but URLs may need encoding.

## Supported Section Types
1. `video`: `<video>` autoplay; advance on end.
2. `audio`: `<audio>` autoplay; advance on end.
3. `image`: Static `<img>`; NO auto-advance.
4. `image+audio`: Image + hidden audio; advance when audio ends.
5. `audio-select`: Controller presents buttons; selection posted to state. Display waits for `state.selection`, plays chosen audio then auto-advances when it ends. Optional `backgroundSrc` image; optional `gesture` in each option.

## Robot Integration
- **WebSocket-based**: Flask client (`robot_client.py`) maintains persistent WebSocket connection to robot server (env: `ROBOT_WS_URL`, defaults `ws://127.0.0.1:8765`).
- Robot server API: JSON messages with structure `{ "action": "gesture|stop|status|list", "gesture": "gesture_name", "params": {...} }`.
- **Stop-before-start pattern**: Always send `stop` command before starting a new gesture (section change, play button, selection).
- Gesture execution: `_apply_robot_gesture()` sends stop first, then extracts gesture from `gesture` field (or type default via `GestureMapper`), and calls `robot_client.send_gesture()`.
- Play/pause button: Pause sends `stop`; play sends `stop` then restarts current section's gesture from beginning.
- Gesture selection: When user selects an option in `audio-select` section, sends `stop` then the option's `gesture` field with metadata.
- Status tracked in `STATE['robot_status']` and `STATE['robot_message']`; available via `/api/state` response.

## State Mutation Rules
- Changing `index` resets `selection`.
- `selection` only meaningful during `audio-select` sections; structure `{src, label}`.
- Pause/play: display JS enforces media element state; `paused` flag drives UI and prevents autoplay attempts.
- Robot status updates via callback; independent of API state mutations.

## Adding a New Section Type (Pattern)
1. Extend frontends: implement render logic in `controller.js` (if interactive) and `display.js` (render + auto-advance criteria).
2. If auto-advance needed, attach `ended` listener and POST `{command:"next"}` from display.
3. Add `gesture` field to section JSON; `GestureMapper` will extract it automatically.
4. No schema enforcement server-side—validate defensively client-side.

## Common Pitfalls
- Forgetting user interaction click: browsers block autoplay until display overlay removed (`display.js` handles this).
- Spaces in media filenames may require URL encoding; current simple concatenation works but avoid renaming mid-study.
- Modifying global `STATE` outside `/api/state` handler—keep mutations centralized.
- Large media delays poll-based sync (1s polling); design UI tolerant to up to 1s latency.
- Robot WebSocket connection may take time; `robot_status` starts "disconnected" until connection established.

## Developer Workflow
- Install: `pip install -r requirements3.11.6.txt` (Flask + requests + websockets + python-dotenv).
- Run Flask: `python app.py` (PORT env optional).
- Run robot server separately: `python robot_server.py` (from robot codebase; configure SERVER_PORT, SERVER_HOST via env or args).
- Debug WebSocket: set `ROBOT_WS_DEBUG=true` env var for detailed logging.
- Add media under `static/media/{audio,video,image}`; reference via `playlist.json`.

## Extensibility Notes
- Consider database persistence for session progress if needed (currently ephemeral `STATE`).
- If latency becomes an issue, migrate from polling to full WebSocket push (frontend + Flask gateway).
- Gesture metadata (`section_id`, `section_type`, `section_title`, `reaction_label`) sent to robot; extend for custom logging or analysis.

---
Provide feedback on unclear areas or missing context for refinement.
