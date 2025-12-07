# Robot Integration Setup Checklist

## Pre-Flight Checklist

Before running the experiment with robot integration, complete these steps:

### 1. Environment Configuration
- [ ] Copy `.env.example` to `.env`
  ```powershell
  Copy-Item .env.example .env
  ```
- [ ] Update `ROBOT_WS_URL` with actual robot server IP:port
- [ ] Set `ROBOT_WS_ENABLED=true`
- [ ] Verify `ROBOT_WS_DEBUG=false` (or `true` for troubleshooting)

### 2. Python Dependencies
- [ ] Install websockets library
  ```powershell
  pip install websockets
  ```
- [ ] Install python-dotenv (if not already installed)
  ```powershell
  pip install python-dotenv
  ```
- [ ] Verify all dependencies: `pip install -r requirements3.11.6.txt`

### 3. Robot Server Verification
- [ ] Robot WebSocket server is running on configured IP:port
- [ ] Network connectivity verified between study machine and robot
- [ ] Test connection: `python -c "import websockets; print('websockets installed')"`

### 4. Playlist Configuration
- [ ] Review `playlist.json` for gesture fields
- [ ] Verify gesture names match available robot gestures
- [ ] Check that response audio sections have `gesture: "celebrate_arms_up"` (or desired)

### 5. Start the Study Runner
- [ ] Start Flask server: `python app.py`
- [ ] Open controller: `http://localhost:5000`
- [ ] Verify robot status displays in controller UI
- [ ] Check status shows "🤖 Connected" (green) or "🤖 Connecting..." (yellow)

### 6. Pre-Experiment Test
- [ ] Open display window via "🖥 Open Display" button
- [ ] Click "Click to Start" on display to enable playback
- [ ] Play first few sections on controller
- [ ] Verify robot gestures trigger correctly
- [ ] Monitor browser console for errors (F12)
- [ ] Check Flask server logs for gesture debug info

### 7. Troubleshooting
- [ ] If status shows "🤖 Disconnected" (red):
  - Verify `ROBOT_WS_URL` is correct
  - Verify robot server is actually running
  - Enable `ROBOT_WS_DEBUG=true` in `.env` and check server logs
  - Check network firewall isn't blocking WebSocket port
  
- [ ] If gestures aren't triggering:
  - Verify gesture names in `playlist.json` are valid
  - Check `ENABLE_ROBOT_GESTURES=true` in `.env`
  - Look for error messages in robot status area
  - Enable debug logging to see WebSocket messages
  
- [ ] If media won't play:
  - Click "Click to Start" on display page (enables playback)
  - Check browser console for JavaScript errors
  - Verify media files exist in correct paths

### 8. Run Experiment
- [ ] All checks passed ✓
- [ ] Ready to run experiment
- [ ] Data collection begins

## Emergency Recovery

### If Robot Disconnects During Experiment
- Study continues automatically (graceful skip enabled by default)
- Media playback unaffected
- Controller UI shows "🤖 Disconnected" status
- Robot will attempt auto-reconnect
- To manually verify connection, refresh controller page

### If You Need to Disable Robot Mid-Experiment
1. Set `ROBOT_WS_ENABLED=false` in `.env`
2. Restart Flask server
3. Study continues with no robot interaction

### If Audio/Video Doesn't Play
1. Confirm "Click to Start" was clicked on display page
2. Check browser developer console (F12 → Console tab)
3. Verify media files exist at specified paths
4. Try a simpler section first (e.g., just audio)

## Post-Experiment

- [ ] Review study logs for any errors
- [ ] Check robot gesture success rate in debug logs
- [ ] Archive session data and video recordings
- [ ] Verify participant data was captured

## Configuration Reference

| Setting | Default | Purpose |
|---------|---------|---------|
| `ROBOT_WS_URL` | ws://127.0.0.1:8000 | Robot WebSocket server address |
| `ROBOT_WS_ENABLED` | true | Enable robot gesture sending |
| `ROBOT_WS_DEBUG` | false | Enable detailed logging |
| `ROBOT_GRACEFUL_SKIP` | true | Continue if gesture fails |
| `ENABLE_AUTO_ADVANCE` | true | Auto-advance after media ends |
| `ENABLE_ROBOT_GESTURES` | true | Enable gesture mapping |

## Support Resources

- **Robot Gestures:** See ROBOT_INTEGRATION.md for full gesture list
- **Gesture Mapping:** Edit `gesture_mapping.py` to change defaults
- **Logging:** Check Flask server console and browser dev tools
- **Documentation:** See README.md for full feature documentation

---

**Last Updated:** 2024
**For questions:** Contact HRI Study Team
