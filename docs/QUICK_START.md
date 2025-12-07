# Quick Start Guide - Robot Integration

## 1. Setup (First Time Only)

### Copy environment template
```powershell
Copy-Item .env.example .env
```

### Edit `.env` with your robot server details
```
ROBOT_WS_URL=ws://YOUR_ROBOT_IP:8000
ROBOT_WS_ENABLED=true
ROBOT_WS_DEBUG=false
```

### Install Python dependencies
```powershell
pip install websockets python-dotenv
```

## 2. Start the Study Runner

```powershell
python app.py
```

You should see output like:
```
* Running on http://0.0.0.0:5000
* Robot WebSocket enabled: Connecting to ws://YOUR_ROBOT_IP:8000
```

## 3. Open in Browser

- **Controller:** http://localhost:5000
  - Left side: List of experiment sections
  - Middle: Current section info and pause/play controls
  - Right: Robot status indicator
  
- **Display:** Click "🖥 Open Display" button
  - Full screen for participant
  - Click "Click to Start" to enable playback

## 4. Monitor Robot Status

In the controller interface, you'll see:

```
🤖 Connected     (green - robot ready)
🤖 Connecting... (yellow - attempting connection)
🤖 Disconnected  (red - no connection)
```

Error messages appear below the status if there are issues.

## 5. Run Experiment

1. **Click Play** on controller to start
2. **Sections auto-advance** as media ends (or click Next/Prev)
3. **Robot gestures trigger automatically** when sections change
4. For **audio-select sections**, click the response audio button
5. **Study continues** even if robot disconnects (graceful skip)

## Common Issues & Fixes

### "🤖 Disconnected" stays red
- **Cause:** Robot server not running or wrong IP
- **Fix:** 
  1. Verify robot WebSocket server is running
  2. Check `ROBOT_WS_URL` in `.env` is correct
  3. Test: `ping YOUR_ROBOT_IP`
  4. Check firewall isn't blocking WebSocket port

### Gestures aren't triggering
- **Cause:** Gesture names don't match robot API
- **Fix:**
  1. Enable `ROBOT_WS_DEBUG=true` in `.env`
  2. Check Flask server logs for gesture name
  3. Verify gesture names are in available list
  4. Restart Flask server after changes

### Media won't play
- **Cause:** "Click to Start" not clicked on display page
- **Fix:**
  1. Open display page
  2. Click the "Click to Start" overlay
  3. Try playing section again

### Audio/video files missing
- **Cause:** Files not in correct media folder
- **Fix:**
  1. Check files exist in `static/media/` folder
  2. Verify file paths in `playlist.json` are correct
  3. Use forward slashes in paths: `media/audio/file.mp3`

## Available Robot Gestures

These are the gestures you can use in `playlist.json`:

```
celebrate_arms_up     - Arms up celebration
talking_left_arm      - Talk gesture with left arm
talking_right_arm     - Talk gesture with right arm
eyes_left             - Look left
eyes_right            - Look right
sad_look_down         - Sad/disappointed expression
look_point_left       - Point to left
look_point_right      - Point to right
center_all            - Return to neutral/centered
```

## Configuration Examples

### Override default gesture for a section
In `playlist.json`:
```json
{
  "id": "custom_gesture_test",
  "type": "audio",
  "title": "Custom Gesture Test",
  "gesture": "talking_left_arm",
  "src": "media/audio/test.mp3"
}
```

### Disable robot for testing
In `.env`:
```
ROBOT_WS_ENABLED=false
```

### Enable debug logging
In `.env`:
```
ROBOT_WS_DEBUG=true
```

Then check Flask console for detailed logs.

## What Happens When...

| Event | Behavior |
|-------|----------|
| Section starts | Gesture triggers automatically |
| Media ends | Next section loads (if auto-advance on) |
| Robot disconnects | Study continues, status turns red |
| Robot error | Logged, gesture skipped gracefully |
| Pause clicked | Media pauses, robot status shown |
| Play clicked | Media resumes from pause |
| Browser refreshed | Controller reconnects to server |

## Keyboard Shortcuts (Developer Console)

Open browser developer console (F12):

```javascript
// Manually advance to next section
await fetch('/api/state', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({command:'next'})})

// Manually go to previous section
await fetch('/api/state', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({command:'prev'})})

// Check current state
const state = await fetch('/api/state').then(r => r.json()); console.log(state);
```

## Performance Tips

1. **Use local WebSocket server** if possible
   - Remote connections may have latency
   - Restart robot server before large studies

2. **Pre-test media files**
   - Click through sections before participant arrives
   - Verify all gestures work

3. **Enable debug mode for first study**
   - `ROBOT_WS_DEBUG=true` in `.env`
   - Helps identify any issues
   - Turn off for participant testing

4. **Monitor browser console**
   - F12 → Console tab
   - Shows any JavaScript or connection errors

## Troubleshooting Flowchart

```
Robot Status Red?
├─ YES → Check robot server is running
│       └─ Check ROBOT_WS_URL in .env is correct
└─ NO  → Continue to next check

Gestures not triggering?
├─ YES → Enable ROBOT_WS_DEBUG=true
│       └─ Check gesture names in playlist.json
└─ NO  → Continue to next check

Media won't play?
├─ YES → Click "Click to Start" on display page
│       └─ Check media files exist
└─ NO  → All working!
```

## Support Resources

- **Full Documentation:** See `README.md`
- **Technical Details:** See `ROBOT_INTEGRATION.md`
- **Setup Checklist:** See `SETUP_CHECKLIST.md`
- **Configuration:** Edit `.env` (copy from `.env.example`)

---

**Ready to go!** Follow these steps and your Mirrly HRI Study with robot integration will be running.

Questions? Check the documentation files or enable debug mode.
