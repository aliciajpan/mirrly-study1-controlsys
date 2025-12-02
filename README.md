# Mirrly HRI Study Runner

A Flask-based experiment runner for HRI studies. Supports audio, video, images, image+audio combos, and real-time response audio selection. Controller and display pages sync in real-time for dual-screen setups.

## Quick Start

1. **Install dependencies:**
  ```powershell
  pip install flask requests
  ```

2. **Run the server:**
  ```powershell
  python app.py
  ```

3. **Open two browser windows:**
  - **Controller:** `http://localhost:5000` (experimenter control panel)
  - **Display:** `http://localhost:5000/display` (participant fullscreen view)

4. **Start the experiment:**
  - On the display page, click "Click to Start" to enable audio/video playback
  - On the controller, press **Play** to begin
  - Use **Next/Prev** to navigate, select response audio when prompted

## How It Works

```
┌─────────────────────────────────────────────────────────────┐
│                     Experimenter View                       │
│                     (Controller Page)                       │
│                                                             │
│  ┌─────────────┐  ┌──────────────────────────────────────┐  │
│  │  Sections   │  │  Status & Response Audio Selection   │  │
│  │             │  │                                      │  │
│  │  1. Intro   │  │  Current: Round 1 Prompt             │  │
│  │  2. Video   │  │  Paused: No                          │  │
│  │→ 3. Round 1 │  │                                      │  │
│  │  4. Round 2 │  │  Response Audio:                     │  │
│  │  ...        │  │  [Expert] [Confused] [Right Again]   │  │
│  └─────────────┘  └──────────────────────────────────────┘  │
│                                                             │
│               [◀ Prev]  [⏸ Pause]  [Next ▶]               |
└─────────────────────────────────────────────────────────────┘
                    │
                    │ Real-time state sync
                    ▼
┌─────────────────────────────────────────────────────────────┐
│                    Participant View                         │
│                    (Display Page)                           │
│                                                             │
│              ┌───────────────────────────┐                  │
│              │                           │                  │
│              │    Fullscreen Media       │                  │
│              │   (Video/Audio/Image)     │                  │
│              │                           │                  │
│              └───────────────────────────┘                  │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

## Playlist Configuration

Edit `playlist.json` to define your experiment flow. Supported section types:

- **`audio`** – Play audio file
- **`video`** – Play video file
- **`image`** – Show static image (no auto-advance)
- **`image+audio`** – Show image with synchronized audio
- **`audio-select`** – Display background image and let experimenter select response audio

### Example Section
```json
{
  "id": "round1_prompt",
  "type": "image+audio",
  "title": "Round 1 Prompt",
  "src": "media/image/Round1GameImage.jpg",
  "audio": "media/audio/round 1 prompt.mov"
}
```

### Audio-Select Section
```json
{
  "id": "round1_reaction",
  "type": "audio-select",
  "title": "Round 1 Reaction",
  "backgroundSrc": "media/image/Round1GameImage.jpg",
  "options": [
    { "label": "Expert", "src": "media/audio/response/_wow youre an expert.mov" },
    { "label": "Confused", "src": "media/audio/response/_oh no i think we're still confused.mov" }
  ]
}
```

## Media Files

Place all media assets under `static/media/`:

```json
static/
  media/
    audio/
      intro.m4a
      round 1 prompt.mov
      response/
        _wow youre an expert.mov
        _confused.mov
    video/
      amblyopia.mp4
    image/
      Round1GameImage.jpg
```

## Robot integration

*(Optional)* Configure robot webserver:
```powershell
$env:ROBOT_HOST = "127.0.0.1"
$env:ROBOT_PORT = "8080"
```

Add robot hooks in `playlist.json`:
```json
"robot": { "onStart": "present_start", "onEnd": "present_end" }
```

The server posts to `http://<ROBOT_HOST>:<ROBOT_PORT>/action/<action>` when sections start/end.

## Features

- **Dual-screen mode:** Controller and display stay in sync
- **Auto-advance:** Audio/video sections advance automatically when media ends
- **Pause/Resume:** Pause at any time, resume from same point
- **Response audio selection:** Choose and play robot reaction audio on-the-fly
- **Auto-scroll sidebar:** Active section always visible in controller
- **Dark purple theme:** Custom color scheme for better visibility

## Controls (Controller Page)

| Button | Action |
|--------|--------|
| **◀ Prev** | Go to previous section |
| **⏸ Pause / ▶ Play** | Toggle pause/play (button text changes based on state) |
| **Next ▶** | Go to next section |
| **🖥 Open Display** | Open participant display in new window |
| **Sections list** | Click any section to jump to it |
| **Response audio buttons** | (audio-select only) Click to select and play response |

---

**Version 1.0** • Built with Flask + Vanilla JS
